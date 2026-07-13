using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace BhojPatra.NativePrintBridge
{
    internal static class Program
    {
        internal const string Version = "3.1.0-all-in-one-resilient";
        private static readonly string[] SupportedFeatures = new[] { "qr", "cashdrawer", "logo", "network-print", "printer-status", "lan-host", "lan-discovery", "lan-realtime", "offline-state", "log-rotation", "graceful-shutdown" };
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 20 * 1024 * 1024 };
        private static readonly object LastErrorLock = new object();
        private static string _lastError = "";
        private static string _lastErrorAt = "";
        private static string _logPath = "";
        private static DateTime _startedAt = DateTime.UtcNow;
        private static string _lastPrintAt = "";
        private static int _totalPrints;
        private static BridgeServer _server;
        private static readonly ManualResetEvent _shutdownEvent = new ManualResetEvent(false);

        private static int Main(string[] args)
        {
            var port = ReadPort(args);
            _logPath = PrepareLogPath();
            RotateLogIfNeeded();

            Console.CancelKeyPress += (sender, e) => {
                e.Cancel = true;
                Log("Shutdown signal received. Draining in-flight requests...");
                _shutdownEvent.Set();
            };

            try
            {
                LanStore.Initialize();
                StartLanServices();
                _server = new BridgeServer(IPAddress.Loopback, port, HandleRequest, _shutdownEvent);
                Log("BhojPatra Native Print Bridge " + Version + " starting on http://127.0.0.1:" + port);
                Log("Supported features: " + string.Join(", ", SupportedFeatures));
                _server.Start();
                return 0;
            }
            catch (Exception ex)
            {
                RememberError(ex);
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        private static void StartLanServices()
        {
            var serverThread = new Thread(() =>
            {
                try
                {
                    var lanServer = new BridgeServer(IPAddress.Any, 3000, HandleRequest, _shutdownEvent);
                    lanServer.Start();
                }
                catch (Exception ex)
                {
                    LanStore.SetLanError(ex.Message);
                    Log("LAN server could not start: " + ex.Message);
                }
            });
            serverThread.IsBackground = true;
            serverThread.Name = "BhojPatra LAN HTTP";
            serverThread.Start();

            var discoveryThread = new Thread(() => LanStore.RunDiscovery(_shutdownEvent));
            discoveryThread.IsBackground = true;
            discoveryThread.Name = "BhojPatra LAN Discovery";
            discoveryThread.Start();
        }

        private static int ReadPort(string[] args)
        {
            var value = Environment.GetEnvironmentVariable("BHOJPATRA_PRINT_BRIDGE_PORT");
            if (args != null)
            {
                for (var i = 0; i < args.Length - 1; i++)
                {
                    if (args[i] == "--port") value = args[i + 1];
                }
            }

            int port;
            return int.TryParse(value, out port) && port > 0 && port < 65536 ? port : 8181;
        }

        private static string PrepareLogPath()
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BhojPatra");
            Directory.CreateDirectory(directory);
            return Path.Combine(directory, "native-print-bridge.log");
        }

        private static void RotateLogIfNeeded()
        {
            try
            {
                if (!File.Exists(_logPath)) return;
                var info = new FileInfo(_logPath);
                const long maxSize = 5 * 1024 * 1024; // 5 MB
                if (info.Length < maxSize) return;

                var directory = Path.GetDirectoryName(_logPath);
                var baseName = Path.GetFileNameWithoutExtension(_logPath);
                // Keep 3 rotated logs, delete oldest first
                for (var i = 3; i >= 1; i--)
                {
                    var oldFile = Path.Combine(directory, baseName + "." + i + ".log");
                    var olderFile = Path.Combine(directory, baseName + "." + (i + 1) + ".log");
                    if (File.Exists(olderFile)) File.Delete(olderFile);
                    if (File.Exists(oldFile)) File.Move(oldFile, olderFile);
                }
                File.Move(_logPath, Path.Combine(directory, baseName + ".1.log"));
            }
            catch
            {
                // Rotation must never break startup.
            }
        }

        private static BridgeResponse HandleRequest(BridgeRequest request)
        {
            var headers = CorsHeaders(request);

            if (request.Method == "OPTIONS")
            {
                return new BridgeResponse(204, "", headers, "text/plain; charset=utf-8");
            }

            try
            {
                var path = request.Path;
                if (request.LocalPort == 3000)
                {
                    return LanStore.HandleLanHttp(request, headers);
                }

                if (request.Method == "GET" && path == "/health")
                {
                    return JsonResponse(200, BuildHealth(), headers);
                }

                if (request.Method == "GET" && path == "/version")
                {
                    return JsonResponse(200, new Dictionary<string, object>
                    {
                        { "version", Version },
                        { "features", SupportedFeatures }
                    }, headers);
                }

                if (request.Method == "GET" && path == "/printers")
                {
                    return JsonResponse(200, new Dictionary<string, object>
                    {
                        { "printers", PrinterService.ListPrinters() }
                    }, headers);
                }

                if (request.Method == "GET" && path.StartsWith("/printers/") && path.EndsWith("/status"))
                {
                    var printerName = path.Substring("/printers/".Length, path.Length - "/printers/".Length - "/status".Length);
                    printerName = Uri.UnescapeDataString(printerName);
                    return JsonResponse(200, PrinterService.GetPrinterStatus(printerName), headers);
                }

                if (request.Method == "GET" && path == "/diagnostics")
                {
                    return JsonResponse(200, Diagnostics(request.LocalPort), headers);
                }

                if (request.Method == "GET" && path == "/lan/status")
                {
                    return JsonResponse(200, LanStore.StatusPayload(), headers);
                }

                if (request.Method == "GET" && path == "/lan/state")
                {
                    return JsonResponse(200, LanStore.LocalStatePayload(), headers);
                }

                if (request.Method == "POST" && path == "/lan/sync")
                {
                    var syncPayload = Json.DeserializeObject(CleanJsonBody(request.Body)) as Dictionary<string, object>;
                    if (syncPayload == null) return JsonResponse(400, ErrorPayload("Invalid LAN sync body."), headers);
                    return JsonResponse(200, LanStore.SyncFromWeb(syncPayload), headers);
                }

                if (request.Method == "POST" && path == "/print")
                {
                    var payload = Json.DeserializeObject(CleanJsonBody(request.Body)) as Dictionary<string, object>;
                    if (payload == null) return JsonResponse(400, ErrorPayload("Invalid JSON body."), headers);

                    var printer = GetString(payload, "printer");
                    var content = GetString(payload, "content");
                    var jobName = GetString(payload, "jobName");
                    if (String.IsNullOrWhiteSpace(jobName)) jobName = "BhojPatra print job";
                    if (String.IsNullOrWhiteSpace(printer) || content == null)
                    {
                        return JsonResponse(400, ErrorPayload("printer and content are required."), headers);
                    }

                    var options = payload.ContainsKey("options") ? payload["options"] as Dictionary<string, object> : null;
                    var logoDataUrl = GetString(payload, "logoDataUrl");

                    // Check printer status before sending
                    var statusCheck = PrinterService.GetPrinterStatus(printer);
                    if (statusCheck.ContainsKey("info") && Convert.ToString(statusCheck["info"]) != null)
                    {
                        var info = Convert.ToString(statusCheck["info"]);
                        // Allow printing even with warnings, only block on critical errors
                        if (info.Contains("offline") || info.Contains("error") && !info.Contains("toner"))
                        {
                            return JsonResponse(503, new Dictionary<string, object>
                            {
                                { "error", "Printer is not available" },
                                { "printerStatus", statusCheck }
                            }, headers);
                        }
                    }

                    PrinterService.Print(printer, content, jobName, new PrintOptions
                    {
                        AutoCut = GetBool(options, "autoCut", true),
                        OpenCashDrawer = GetBool(options, "openCashDrawer", false),
                        QrCodes = GetQrCodes(options),
                        LogoDataUrl = logoDataUrl
                    });

                    lock (LastErrorLock)
                    {
                        _lastPrintAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                        _totalPrints++;
                    }

                    return JsonResponse(200, new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "jobName", jobName },
                        { "printer", printer }
                    }, headers);
                }

                return JsonResponse(404, ErrorPayload("Not found."), headers);
            }
            catch (Exception ex)
            {
                RememberError(ex);
                return JsonResponse(500, ErrorPayload(FriendlyError(ex)), headers);
            }
        }

        private static Dictionary<string, object> BuildHealth()
        {
            string lastPrintAt;
            int totalPrints;
            lock (LastErrorLock)
            {
                lastPrintAt = _lastPrintAt;
                totalPrints = _totalPrints;
            }
            return new Dictionary<string, object>
            {
                { "ok", true },
                { "service", "BhojPatra Native Print Bridge" },
                { "version", Version },
                { "features", SupportedFeatures },
                { "port", _server != null ? ReadPort(new string[0]) : 8181 },
                // Health must remain a lightweight liveness probe. Printer/WMI discovery can
                // occasionally take several seconds while Windows refreshes USB queues. Doing
                // that work here caused the browser probe to time out and falsely report offline.
                { "spoolerStatus", "probe-on-demand" },
                { "printerCount", -1 },
                { "uptime", (DateTime.UtcNow - _startedAt).ToString(@"d\.hh\:mm\:ss") },
                { "lastPrintAt", lastPrintAt },
                { "totalPrints", totalPrints },
                { "lan", LanStore.StatusPayload() }
            };
        }

        private static Dictionary<string, object> Diagnostics(int port)
        {
            string lastError;
            string lastErrorAt;
            lock (LastErrorLock)
            {
                lastError = _lastError;
                lastErrorAt = _lastErrorAt;
            }

            return new Dictionary<string, object>
            {
                { "ok", true },
                { "service", "BhojPatra Native Print Bridge" },
                { "version", Version },
                { "port", port },
                { "osVersion", Environment.OSVersion.VersionString },
                { "is64BitProcess", Environment.Is64BitProcess },
                { "is64BitOperatingSystem", Environment.Is64BitOperatingSystem },
                { "machineName", Environment.MachineName },
                { "userName", Environment.UserName },
                { "spoolerStatus", PrinterService.GetSpoolerStatus() },
                { "printerCount", PrinterService.ListPrinters().Count },
                { "printers", PrinterService.ListPrinters() },
                { "lastError", lastError },
                { "lastErrorAt", lastErrorAt },
                { "logPath", _logPath }
            };
        }

        private static Dictionary<string, string> CorsHeaders(BridgeRequest request)
        {
            var headers = new Dictionary<string, string>();
            var origin = request.Header("Origin");
            if (!String.IsNullOrWhiteSpace(origin))
            {
                headers["Access-Control-Allow-Origin"] = origin;
            }
            headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, Authorization, X-Requested-With";
            headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS";
            headers["Access-Control-Allow-Private-Network"] = "true";
            headers["Vary"] = "Origin";
            headers["Cache-Control"] = "no-store";
            return headers;
        }

        private static BridgeResponse JsonResponse(int status, object payload, Dictionary<string, string> headers)
        {
            return new BridgeResponse(status, Json.Serialize(payload), headers, "application/json; charset=utf-8");
        }

        private static Dictionary<string, object> ErrorPayload(string message)
        {
            return new Dictionary<string, object> { { "error", message } };
        }

        private static string GetString(Dictionary<string, object> payload, string key)
        {
            object value;
            return payload.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : null;
        }

        private static string CleanJsonBody(string body)
        {
            return (body ?? "{}").TrimStart('\uFEFF', ' ', '\r', '\n', '\t');
        }

        private static bool GetBool(Dictionary<string, object> payload, string key, bool fallback)
        {
            if (payload == null) return fallback;
            object value;
            if (!payload.TryGetValue(key, out value) || value == null) return fallback;
            if (value is bool) return (bool)value;
            bool parsed;
            return bool.TryParse(Convert.ToString(value), out parsed) ? parsed : fallback;
        }

        private static List<PrintQrCode> GetQrCodes(Dictionary<string, object> payload)
        {
            var result = new List<PrintQrCode>();
            if (payload == null) return result;

            object value;
            if (!payload.TryGetValue("qrCodes", out value) || value == null) return result;
            var items = value as IEnumerable;
            if (items == null || value is string) return result;

            foreach (var item in items)
            {
                var row = item as Dictionary<string, object>;
                if (row == null) continue;
                var data = GetString(row, "data");
                if (String.IsNullOrWhiteSpace(data)) continue;
                result.Add(new PrintQrCode
                {
                    Data = data,
                    Label = GetString(row, "label") ?? ""
                });
            }

            return result;
        }

        private static string FriendlyError(Exception ex)
        {
            var win32 = ex as Win32Exception;
            if (win32 != null) return win32.Message;

            if (ex.InnerException != null && !String.IsNullOrWhiteSpace(ex.InnerException.Message))
            {
                return ex.Message + " " + ex.InnerException.Message;
            }
            return ex.Message;
        }

        private static void RememberError(Exception ex)
        {
            var message = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + ex;
            lock (LastErrorLock)
            {
                _lastError = FriendlyError(ex);
                _lastErrorAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            }
            Log(message);
        }

        public static void Log(string message)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(_logPath)) return;
                File.AppendAllText(_logPath, message + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                // Logging must never break printing.
            }
        }
    }

    internal sealed class BridgeServer
    {
        private readonly IPAddress _bindAddress;
        private readonly int _port;
        private readonly Func<BridgeRequest, BridgeResponse> _handler;
        private readonly ManualResetEvent _shutdownEvent;
        private TcpListener _listener;

        public BridgeServer(IPAddress bindAddress, int port, Func<BridgeRequest, BridgeResponse> handler, ManualResetEvent shutdownEvent)
        {
            _bindAddress = bindAddress;
            _port = port;
            _handler = handler;
            _shutdownEvent = shutdownEvent;
        }

        public void Start()
        {
            _listener = new TcpListener(_bindAddress, _port);
            _listener.Start();
            if (_port == 3000) LanStore.SetLanRunning(true);
            Console.WriteLine("BhojPatra bridge listening on " + _bindAddress + ":" + _port);

            while (!_shutdownEvent.WaitOne(0))
            {
                try
                {
                    // Polling avoids leaking one AsyncWaitHandle for every browser heartbeat.
                    if (!_listener.Pending())
                    {
                        _shutdownEvent.WaitOne(100);
                        continue;
                    }
                    var client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(_ =>
                    {
                        try { HandleClient(client); }
                        catch (Exception ex) { Program.Log("Unhandled client error contained: " + ex.Message); }
                    });
                }
                catch (ObjectDisposedException)
                {
                    break; // listener was closed during shutdown
                }
                catch (Exception ex)
                {
                    if (!_shutdownEvent.WaitOne(0))
                    {
                        Program.Log("Accept error: " + ex.Message);
                    }
                }
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 15000;
                    client.SendTimeout = 15000;
                    var request = BridgeRequest.Read(client, _port);
                    if (request.LocalPort == 3000 && request.IsWebSocket && request.Path.EndsWith("/realtime"))
                    {
                        client.ReceiveTimeout = 0;
                        client.SendTimeout = 0;
                        LanRealtimeHub.Handle(client, request);
                        return;
                    }
                    var response = _handler(request);
                    response.Write(client.GetStream());
                }
                catch (Exception ex)
                {
                    Program.Log("Client request failed: " + ex.Message);
                    // The original failure is often a browser timeout/client disconnect. Never
                    // let a second write to that closed socket escape a ThreadPool callback: on
                    // .NET Framework an unhandled callback exception terminates the whole bridge.
                    try
                    {
                        if (client.Connected)
                        {
                            var body = "{\"error\":\"" + JsonEscape(ex.Message) + "\"}";
                            var response = new BridgeResponse(500, body, new Dictionary<string, string>(), "application/json; charset=utf-8");
                            response.Write(client.GetStream());
                        }
                    }
                    catch (Exception writeError)
                    {
                        Program.Log("Client disconnected before error response: " + writeError.Message);
                    }
                }
            }
        }

        private static string JsonEscape(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }

    internal sealed class BridgeRequest
    {
        public string Method;
        public string Path;
        public string Body;
        public int LocalPort;
        public string RawTarget;
        public Dictionary<string, string> Query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public string Header(string name)
        {
            string value;
            return Headers.TryGetValue(name, out value) ? value : "";
        }

        public bool IsWebSocket
        {
            get { return Header("Upgrade").Equals("websocket", StringComparison.OrdinalIgnoreCase); }
        }

        public static BridgeRequest Read(TcpClient client, int localPort)
        {
            var stream = client.GetStream();
            var buffer = new byte[8192];
            var data = new List<byte>();
            var headerEnd = -1;

            while (headerEnd < 0)
            {
                var read = stream.Read(buffer, 0, buffer.Length);
                if (read <= 0) throw new IOException("Client closed the connection.");
                data.AddRange(buffer.Take(read));
                headerEnd = IndexOfHeaderEnd(data);
                if (data.Count > 20 * 1024 * 1024) throw new InvalidOperationException("Request is too large.");
            }

            var headerText = Encoding.ASCII.GetString(data.Take(headerEnd).ToArray());
            var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
            if (lines.Length == 0) throw new InvalidOperationException("Invalid HTTP request.");

            var requestLine = lines[0].Split(' ');
            if (requestLine.Length < 2) throw new InvalidOperationException("Invalid HTTP request line.");

            var rawTarget = requestLine[1];
            var queryAt = rawTarget.IndexOf('?');
            var request = new BridgeRequest
            {
                Method = requestLine[0].ToUpperInvariant(),
                RawTarget = rawTarget,
                Path = queryAt >= 0 ? rawTarget.Substring(0, queryAt) : rawTarget,
                LocalPort = localPort
            };

            if (queryAt >= 0 && queryAt + 1 < rawTarget.Length)
            {
                foreach (var pair in rawTarget.Substring(queryAt + 1).Split('&'))
                {
                    var equals = pair.IndexOf('=');
                    var key = Uri.UnescapeDataString(equals >= 0 ? pair.Substring(0, equals) : pair);
                    var value = Uri.UnescapeDataString(equals >= 0 ? pair.Substring(equals + 1) : "");
                    request.Query[key] = value;
                }
            }

            for (var i = 1; i < lines.Length; i++)
            {
                var colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                request.Headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
            }

            int contentLength;
            int.TryParse(request.Header("Content-Length"), out contentLength);
            if (contentLength > 20 * 1024 * 1024) throw new InvalidOperationException("Request body is too large.");

            var bodyStart = headerEnd + 4;
            while (data.Count - bodyStart < contentLength)
            {
                var read = stream.Read(buffer, 0, buffer.Length);
                if (read <= 0) break;
                data.AddRange(buffer.Take(read));
            }

            request.Body = contentLength > 0
                ? Encoding.UTF8.GetString(data.Skip(bodyStart).Take(contentLength).ToArray())
                : "{}";

            return request;
        }

        private static int IndexOfHeaderEnd(List<byte> data)
        {
            for (var i = 0; i <= data.Count - 4; i++)
            {
                if (data[i] == 13 && data[i + 1] == 10 && data[i + 2] == 13 && data[i + 3] == 10) return i;
            }
            return -1;
        }
    }

    internal sealed class BridgeResponse
    {
        private readonly int _status;
        private readonly string _body;
        private readonly Dictionary<string, string> _headers;
        private readonly string _contentType;

        public BridgeResponse(int status, string body, Dictionary<string, string> headers, string contentType)
        {
            _status = status;
            _body = body ?? "";
            _headers = headers ?? new Dictionary<string, string>();
            _contentType = contentType;
        }

        public void Write(NetworkStream stream)
        {
            var bodyBytes = Encoding.UTF8.GetBytes(_body);
            var builder = new StringBuilder();
            builder.Append("HTTP/1.1 ").Append(_status).Append(' ').Append(Reason(_status)).Append("\r\n");
            builder.Append("Content-Type: ").Append(_contentType).Append("\r\n");
            builder.Append("Content-Length: ").Append(bodyBytes.Length).Append("\r\n");
            builder.Append("Connection: close\r\n");
            foreach (var header in _headers)
            {
                builder.Append(header.Key).Append(": ").Append(header.Value).Append("\r\n");
            }
            builder.Append("\r\n");

            var headerBytes = Encoding.ASCII.GetBytes(builder.ToString());
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0) stream.Write(bodyBytes, 0, bodyBytes.Length);
        }

        private static string Reason(int status)
        {
            if (status == 200) return "OK";
            if (status == 204) return "No Content";
            if (status == 400) return "Bad Request";
            if (status == 401) return "Unauthorized";
            if (status == 403) return "Forbidden";
            if (status == 404) return "Not Found";
            if (status == 409) return "Conflict";
            if (status == 503) return "Service Unavailable";
            if (status == 500) return "Internal Server Error";
            return "OK";
        }
    }

    internal sealed class PrintOptions
    {
        public bool AutoCut = true;
        public bool OpenCashDrawer;
        public List<PrintQrCode> QrCodes = new List<PrintQrCode>();
        public string LogoDataUrl;
    }

    internal sealed class PrintQrCode
    {
        public string Data = "";
        public string Label = "";
    }

    internal static class PrinterService
    {
        public static List<Dictionary<string, object>> ListPrinters()
        {
            var rows = ListPrintersFromWmi();
            foreach (var dotNetRow in ListPrintersFromDotNet())
            {
                var dotNetName = Convert.ToString(dotNetRow["name"]);
                if (!rows.Any(row => String.Equals(Convert.ToString(row["name"]), dotNetName, StringComparison.OrdinalIgnoreCase)))
                    rows.Add(dotNetRow);
            }
            return rows
                .OrderBy(row => PrinterScore(Convert.ToString(row["name"]) + " " + Convert.ToString(row["portName"]) + " " + Convert.ToString(row["driverName"])))
                .ThenBy(row => Convert.ToString(row["name"]))
                .ToList();
        }

        public static void Print(string printer, string content, string jobName, PrintOptions options)
        {
            NetworkTarget target;
            if (TryParseNetworkTarget(printer, out target))
            {
                // Prefer an installed Windows queue when its port points at the same
                // target. This keeps working even when a customer saved a hostname
                // that Windows can no longer resolve, while preserving raw TCP for
                // printers that are not installed in the spooler.
                var installedQueue = ResolveNetworkQueue(target, ListPrinters());
                if (!String.IsNullOrWhiteSpace(installedQueue))
                {
                    RawPrinter.Send(installedQueue, EscPosBytes(content, options), jobName);
                    return;
                }
                PrintRawTcp(target, content, options);
                return;
            }

            var installed = ListPrinters();
            var resolvedPrinter = ResolveInstalledPrinter(printer, installed, null);
            if (String.IsNullOrWhiteSpace(resolvedPrinter))
            {
                throw new InvalidOperationException("Printer queue was not found in Windows: " + printer);
            }

            var bytes = EscPosBytes(content, options);
            try
            {
                RawPrinter.Send(resolvedPrinter, bytes, jobName);
            }
            catch (Win32Exception ex)
            {
                if (!IsPrinterDeleted(ex)) throw;
                // USB/Bluetooth queues can be recreated by the Windows spooler under
                // the same or a slightly changed name while the bridge is running.
                Thread.Sleep(500);
                var refreshed = ListPrinters();
                var retryPrinter = ResolveInstalledPrinter(printer, refreshed, resolvedPrinter);
                if (String.IsNullOrWhiteSpace(retryPrinter))
                {
                    throw new InvalidOperationException("Windows no longer exposes the saved printer queue. Open Printer Settings, click Detect Printers, select the current queue, and save it again.", ex);
                }
                RawPrinter.Send(retryPrinter, bytes, jobName);
            }
        }

        private static bool IsPrinterDeleted(Win32Exception error)
        {
            return error != null && (error.NativeErrorCode == 1905 || error.NativeErrorCode == 1801 || error.NativeErrorCode == 3003);
        }

        private static string ResolveInstalledPrinter(string requested, List<Dictionary<string, object>> rows, string excluded)
        {
            var raw = (requested ?? "").Trim();
            if (String.IsNullOrWhiteSpace(raw)) return null;
            var normalized = NormalizePrinterName(raw);
            var candidates = rows
                .Where(row => !String.Equals(Convert.ToString(row["name"]), excluded, StringComparison.OrdinalIgnoreCase))
                .Select(row => new
                {
                    Name = Convert.ToString(row["name"]),
                    Score = PrinterNameScore(normalized, row),
                })
                .Where(candidate => candidate.Score < Int32.MaxValue)
                .OrderBy(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return candidates.Count == 0 ? null : candidates[0].Name;
        }

        private static int PrinterNameScore(string requested, Dictionary<string, object> row)
        {
            var name = Convert.ToString(row["name"]) ?? "";
            var normalizedName = NormalizePrinterName(name);
            if (normalizedName == requested) return 0;
            if (normalizedName.StartsWith(requested, StringComparison.OrdinalIgnoreCase) || requested.StartsWith(normalizedName, StringComparison.OrdinalIgnoreCase)) return 10;
            if (normalizedName.IndexOf(requested, StringComparison.OrdinalIgnoreCase) >= 0 || requested.IndexOf(normalizedName, StringComparison.OrdinalIgnoreCase) >= 0) return 20;
            var requestedTokens = requested.Split(new[] { ' ', '-', '_', '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);
            var overlap = requestedTokens.Count(token => token.Length > 2 && normalizedName.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0);
            return overlap >= Math.Max(1, requestedTokens.Length / 2) ? 30 - overlap : Int32.MaxValue;
        }

        private static string NormalizePrinterName(string value)
        {
            return Regex.Replace((value ?? "").Trim(), "\\s+", " ").Trim().ToLowerInvariant();
        }

        private static string ResolveNetworkQueue(NetworkTarget target, List<Dictionary<string, object>> rows)
        {
            if (target == null || rows == null) return null;
            var host = (target.Host ?? "").Trim().ToLowerInvariant();
            if (String.IsNullOrWhiteSpace(host)) return null;
            var hostWithUnderscores = host.Replace('.', '_');
            foreach (var row in rows)
            {
                var port = Convert.ToString(row["portName"]) ?? "";
                var normalizedPort = port.Trim().ToLowerInvariant();
                if (normalizedPort.Contains(host) || normalizedPort.Contains(hostWithUnderscores) ||
                    normalizedPort.Contains("ip_" + hostWithUnderscores))
                {
                    return Convert.ToString(row["name"]);
                }
            }
            return null;
        }

        public static string GetSpoolerStatus()
        {
            try
            {
                using (var controller = new ServiceController("Spooler"))
                {
                    return controller.Status.ToString();
                }
            }
            catch (Exception ex)
            {
                return "Unknown: " + ex.Message;
            }
        }

        public static Dictionary<string, object> GetPrinterStatus(string printerName)
        {
            var result = new Dictionary<string, object>
            {
                { "name", printerName },
                { "exists", false },
                { "status", "unknown" },
                { "info", null as string }
            };

            if (String.IsNullOrWhiteSpace(printerName)) return result;

            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT Name, PrinterState, PrinterStatus, DetectedErrorState, WorkOffline, ExtendedPrinterStatus FROM Win32_Printer WHERE Name = @name"))
                {
                    searcher.Query = new ObjectQuery(
                        "SELECT Name, PrinterState, PrinterStatus, DetectedErrorState, WorkOffline, ExtendedPrinterStatus FROM Win32_Printer WHERE Name = '" +
                        printerName.Replace("\\", "\\\\").Replace("'", "''") + "'");
                    using (var results = searcher.Get())
                    {
                        foreach (ManagementObject item in results)
                        {
                            result["exists"] = true;
                            var offline = item["WorkOffline"] is bool && (bool)item["WorkOffline"];
                            var detectedError = item["DetectedErrorState"] is UInt16 ? (UInt16)item["DetectedErrorState"] : (UInt16)0;
                            var printerState = item["PrinterState"] is UInt32 ? (UInt32)item["PrinterState"] : (UInt32)0;

                            var info = new List<string>();
                            if (offline) info.Add("offline");

                            // DetectedErrorState bit flags
                            if ((detectedError & 0x0001) != 0) info.Add("paper-out");
                            if ((detectedError & 0x0002) != 0) info.Add("paper-jam");
                            if ((detectedError & 0x0004) != 0) info.Add("door-open");
                            if ((detectedError & 0x0008) != 0) info.Add("toner-low");
                            if ((detectedError & 0x0010) != 0) info.Add("no-toner");
                            if ((detectedError & 0x0020) != 0) info.Add("drum-error");
                            if ((detectedError & 0x0040) != 0) info.Add("cartridge-error");
                            if ((detectedError & 0x0080) != 0) info.Add("general-error");

                            result["status"] = info.Count == 0 ? "ready" : "warning";
                            result["info"] = info.Count > 0 ? string.Join(", ", info) : null;
                            result["isDefault"] = item["Default"] is bool && (bool)item["Default"];
                            result["offline"] = offline;
                            result["detectedErrorState"] = detectedError;
                            result["printerState"] = printerState;

                            if (!offline && info.Count > 0)
                            {
                                result["status"] = info.Any(s => s.Contains("error")) ? "error" : "warning";
                            }
                            else if (offline)
                            {
                                result["status"] = "offline";
                            }

                            return result;
                        }
                    }
                }
            }
            catch
            {
                // Fallback: check via .NET
                foreach (string name in PrinterSettings.InstalledPrinters)
                {
                    if (String.Equals(name, printerName, StringComparison.OrdinalIgnoreCase))
                    {
                        result["exists"] = true;
                        result["status"] = "ready";
                        return result;
                    }
                }
            }

            return result;
        }

        private static List<Dictionary<string, object>> ListPrintersFromWmi()
        {
            var rows = new List<Dictionary<string, object>>();
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Name, DriverName, PortName, WorkOffline, Default FROM Win32_Printer"))
                using (var results = searcher.Get())
                {
                    foreach (ManagementObject item in results)
                    {
                        var name = Convert.ToString(item["Name"]);
                        if (String.IsNullOrWhiteSpace(name)) continue;
                        var portName = Convert.ToString(item["PortName"]) ?? "";
                        var driverName = Convert.ToString(item["DriverName"]) ?? "";
                        var offline = item["WorkOffline"] is bool && (bool)item["WorkOffline"];
                        var row = new Dictionary<string, object>
                        {
                            { "name", name },
                            { "portName", portName },
                            { "driverName", driverName },
                            { "status", offline ? "offline" : "online" },
                            { "isDefault", item["Default"] is bool && (bool)item["Default"] },
                            { "label", String.Join(" - ", new[] { name, portName, driverName }.Where(value => !String.IsNullOrWhiteSpace(value)).ToArray()) }
                        };
                        rows.Add(row);
                    }
                }
            }
            catch
            {
                return new List<Dictionary<string, object>>();
            }
            return rows;
        }

        private static List<Dictionary<string, object>> ListPrintersFromDotNet()
        {
            var rows = new List<Dictionary<string, object>>();
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                rows.Add(new Dictionary<string, object>
                {
                    { "name", name },
                    { "portName", "" },
                    { "driverName", "" },
                    { "status", "online" },
                    { "isDefault", false },
                    { "label", name }
                });
            }
            return rows;
        }

        private static int PrinterScore(string value)
        {
            return Regex.IsMatch(value ?? "", "POS|80|Thermal|Receipt|RONGTA|KPC|EPSON|foodkart|CP001", RegexOptions.IgnoreCase) ? 0 : 1;
        }

        private static byte[] EscPosBytes(string content, PrintOptions options)
        {
            var text = (content ?? "")
                .Replace("₹", "Rs.")
                .Replace("â‚¹", "Rs.")
                .Replace("–", "-")
                .Replace("—", "-");

            var ascii = new StringBuilder();
            foreach (var ch in text)
            {
                ascii.Append(ch <= 127 ? ch : ' ');
            }
            if (!ascii.ToString().EndsWith("\n")) ascii.Append("\n");

            using (var memory = new MemoryStream())
            {
                memory.Write(new byte[] { 0x1b, 0x40 }, 0, 2); // ESC @ init
                if (options.OpenCashDrawer) memory.Write(new byte[] { 0x1b, 0x70, 0x00, 0x19, 0xfa }, 0, 5); // cash drawer

                // Logo rasterization from base64 data URL
                if (!String.IsNullOrWhiteSpace(options.LogoDataUrl))
                {
                    try
                    {
                        var logoBytes = LogoToEscPosRaster(options.LogoDataUrl);
                        if (logoBytes != null && logoBytes.Length > 0)
                        {
                            memory.Write(logoBytes, 0, logoBytes.Length);
                        }
                    }
                    catch (Exception ex)
                    {
                        Program.Log("Logo rasterization failed: " + ex.Message);
                    }
                }

                var body = Encoding.ASCII.GetBytes(ascii.ToString());
                memory.Write(body, 0, body.Length);
                foreach (var qrCode in options.QrCodes ?? new List<PrintQrCode>())
                {
                    WriteQrCode(memory, qrCode);
                }
                var suffix = options.AutoCut
                    ? new byte[] { 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00 }
                    : new byte[] { 0x0a, 0x0a, 0x0a };
                memory.Write(suffix, 0, suffix.Length);
                return memory.ToArray();
            }
        }

        private static byte[] LogoToEscPosRaster(string dataUrl)
        {
            if (String.IsNullOrWhiteSpace(dataUrl)) return null;

            // Strip data URL prefix (e.g., "data:image/png;base64,")
            var base64 = dataUrl;
            var commaIndex = dataUrl.IndexOf(',');
            if (commaIndex >= 0) base64 = dataUrl.Substring(commaIndex + 1);

            byte[] imageBytes;
            try { imageBytes = Convert.FromBase64String(base64); } catch { return null; }
            if (imageBytes == null || imageBytes.Length == 0) return null;

            using (var sourceStream = new MemoryStream(imageBytes))
            using (var sourceImage = Image.FromStream(sourceStream))
            {
                // Keep logos readable without turning them into a full-width banner.
                var maxWidth = 120;
                var maxHeight = 80;
                var ratio = Math.Min(1.0, Math.Min((double)maxWidth / sourceImage.Width, (double)maxHeight / sourceImage.Height));
                var newWidth = Math.Max(1, (int)(sourceImage.Width * ratio));
                var newHeight = Math.Max(1, (int)(sourceImage.Height * ratio));

                using (var resized = new Bitmap(newWidth, newHeight))
                {
                    using (var g = Graphics.FromImage(resized))
                    {
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
                        g.DrawImage(sourceImage, 0, 0, newWidth, newHeight);
                    }

                    // Convert to 1-bit monochrome (threshold at 128)
                    var widthBytes = (newWidth + 7) / 8;
                    var rasterData = new byte[widthBytes * newHeight];

                    for (var y = 0; y < newHeight; y++)
                    {
                        for (var x = 0; x < newWidth; x++)
                        {
                            var pixel = resized.GetPixel(x, y);
                            var gray = (int)(pixel.R * 0.299 + pixel.G * 0.587 + pixel.B * 0.114);
                            if (gray < 128)
                            {
                                var byteIndex = y * widthBytes + (x / 8);
                                var bitIndex = 7 - (x % 8);
                                rasterData[byteIndex] |= (byte)(1 << bitIndex);
                            }
                        }
                    }

                    // ESC/POS GS v 0 — raster bit image
                    using (var output = new MemoryStream())
                    {
                        output.Write(new byte[] { 0x1b, 0x61, 0x01 }, 0, 3); // center logo
                        // GS v 0 m xL xH yL yH d1...dk
                        output.WriteByte(0x1d); // GS
                        output.WriteByte(0x76); // v
                        output.WriteByte(0x00); // m = 0 (normal)
                        output.WriteByte((byte)(widthBytes % 256)); // xL
                        output.WriteByte((byte)(widthBytes / 256)); // xH
                        output.WriteByte((byte)(newHeight % 256)); // yL
                        output.WriteByte((byte)(newHeight / 256)); // yH
                        output.Write(rasterData, 0, rasterData.Length);
                        // Add line feed after logo and restore left alignment for text.
                        output.Write(new byte[] { 0x0a, 0x1b, 0x61, 0x00 }, 0, 4);

                        return output.ToArray();
                    }
                }
            }
        }

        private static void WriteQrCode(MemoryStream memory, PrintQrCode qrCode)
        {
            if (qrCode == null || String.IsNullOrWhiteSpace(qrCode.Data)) return;

            var label = ToAscii(qrCode.Label ?? "").Trim();
            var data = Encoding.ASCII.GetBytes(ToAscii(qrCode.Data).Trim());
            if (data.Length == 0) return;

            if (label.Length > 0)
            {
                var labelBytes = Encoding.ASCII.GetBytes("\n" + label + "\n");
                memory.Write(new byte[] { 0x1b, 0x61, 0x01 }, 0, 3);
                memory.Write(labelBytes, 0, labelBytes.Length);
            }
            else
            {
                memory.Write(new byte[] { 0x0a, 0x1b, 0x61, 0x01 }, 0, 4);
            }

            var storeLength = data.Length + 3;
            var pL = (byte)(storeLength % 256);
            var pH = (byte)(storeLength / 256);
            memory.Write(new byte[] { 0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00 }, 0, 9);
            memory.Write(new byte[] { 0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06 }, 0, 8);
            memory.Write(new byte[] { 0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31 }, 0, 8);
            memory.Write(new byte[] { 0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30 }, 0, 8);
            memory.Write(data, 0, data.Length);
            memory.Write(new byte[] { 0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, 0x0a, 0x1b, 0x61, 0x00 }, 0, 12);
        }

        private static string ToAscii(string value)
        {
            var builder = new StringBuilder();
            foreach (var ch in value ?? "")
            {
                builder.Append(ch <= 127 ? ch : ' ');
            }
            return builder.ToString();
        }

        private static bool TryParseNetworkTarget(string raw, out NetworkTarget target)
        {
            target = null;
            raw = (raw ?? "").Trim();
            if (raw.Length == 0) return false;

            Uri uri;
            if (Uri.TryCreate(raw, UriKind.Absolute, out uri))
            {
                var scheme = uri.Scheme.ToLowerInvariant();
                if (scheme == "tcp" || scheme == "socket" || scheme == "raw" || scheme == "http" || scheme == "https")
                {
                    target = new NetworkTarget(uri.Host, uri.Port > 0 ? uri.Port : 9100);
                    return true;
                }
            }

            var match = Regex.Match(raw, @"^([a-z0-9.-]+|\[[a-f0-9:]+\])(?::(\d{2,5}))?$", RegexOptions.IgnoreCase);
            if (!match.Success) return false;
            var port = 9100;
            if (match.Groups[2].Success) Int32.TryParse(match.Groups[2].Value, out port);
            target = new NetworkTarget(match.Groups[1].Value.Trim('[', ']'), port);
            return true;
        }

        private static void PrintRawTcp(NetworkTarget target, string content, PrintOptions options)
        {
            var bytes = EscPosBytes(content, options);
            using (var client = new TcpClient())
            {
                IAsyncResult result;
                try
                {
                    result = client.BeginConnect(target.Host, target.Port, null, null);
                    if (!result.AsyncWaitHandle.WaitOne(TimeSpan.FromSeconds(10)))
                    {
                        throw new System.TimeoutException("LAN printer timed out at " + target.Host + ":" + target.Port);
                    }
                    client.EndConnect(result);
                }
                catch (SocketException ex)
                {
                    throw new InvalidOperationException("Could not resolve LAN printer host '" + target.Host + "'. Enter the printer IP address or select its installed Windows queue.", ex);
                }
                using (var stream = client.GetStream())
                {
                    stream.Write(bytes, 0, bytes.Length);
                }
            }
        }
    }

    internal sealed class NetworkTarget
    {
        public readonly string Host;
        public readonly int Port;

        public NetworkTarget(string host, int port)
        {
            Host = host;
            Port = port;
        }
    }

    internal static class RawPrinter
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private sealed class DocInfo
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr printer);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int StartDocPrinter(IntPtr printer, int level, [In] DocInfo docInfo);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndDocPrinter(IntPtr printer);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool StartPagePrinter(IntPtr printer);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndPagePrinter(IntPtr printer);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);

        public static void Send(string printerName, byte[] bytes, string jobName)
        {
            IntPtr printer;
            if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) ThrowLastWin32Error("Could not open printer queue: " + printerName);

            try
            {
                var docInfo = new DocInfo { pDocName = jobName, pDataType = "RAW" };
                if (StartDocPrinter(printer, 1, docInfo) == 0) ThrowLastWin32Error("Could not start print job.");
                try
                {
                    if (!StartPagePrinter(printer)) ThrowLastWin32Error("Could not start printer page.");
                    try
                    {
                        int written;
                        if (!WritePrinter(printer, bytes, bytes.Length, out written)) ThrowLastWin32Error("Could not write to printer.");
                        if (written != bytes.Length) throw new IOException("Only " + written + " of " + bytes.Length + " bytes were written to the printer.");
                    }
                    finally
                    {
                        EndPagePrinter(printer);
                    }
                }
                finally
                {
                    EndDocPrinter(printer);
                }
            }
            finally
            {
                ClosePrinter(printer);
            }
        }

        private static void ThrowLastWin32Error(string prefix)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), prefix + " " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
        }
    }

    internal static class LanStore
    {
        private static readonly object Sync = new object();
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 20 * 1024 * 1024 };
        private static Dictionary<string, object> _snapshot;
        private static IList _staff = new ArrayList();
        private static string _updatedAt = "";
        private static bool _lanRunning;
        private static string _lanError = "";
        private static string _statePath;

        public static void Initialize()
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BhojPatra");
            Directory.CreateDirectory(directory);
            _statePath = Path.Combine(directory, "lan-host-state.json");
            try
            {
                if (!File.Exists(_statePath)) return;
                var root = Json.DeserializeObject(File.ReadAllText(_statePath, Encoding.UTF8)) as Dictionary<string, object>;
                if (root == null) return;
                _snapshot = root.ContainsKey("snapshot") ? root["snapshot"] as Dictionary<string, object> : null;
                _staff = root.ContainsKey("staff") ? root["staff"] as IList ?? new ArrayList() : new ArrayList();
                _updatedAt = Text(root, "updatedAt");
            }
            catch (Exception ex)
            {
                _lanError = "Stored LAN data could not be loaded: " + ex.Message;
            }
        }

        public static void SetLanRunning(bool running)
        {
            lock (Sync)
            {
                _lanRunning = running;
                if (running) _lanError = "";
            }
        }

        public static void SetLanError(string error)
        {
            lock (Sync)
            {
                _lanRunning = false;
                _lanError = error ?? "";
            }
        }

        public static void SetDiscoveryError(string error)
        {
            lock (Sync) _lanError = error ?? "";
        }

        public static Dictionary<string, object> StatusPayload()
        {
            lock (Sync)
            {
                var urls = LanUrls();
                return new Dictionary<string, object>
                {
                    { "running", _lanRunning },
                    { "bindHost", "0.0.0.0" },
                    { "port", 3000 },
                    { "discoveryPort", 3001 },
                    { "ipAddress", urls.Count > 0 ? new Uri(urls[0]).Host : null },
                    { "primaryUrl", urls.Count > 0 ? urls[0] : null },
                    { "urls", urls },
                    { "lastError", String.IsNullOrWhiteSpace(_lanError) ? null : _lanError },
                    { "updatedAt", _updatedAt },
                    { "hasState", _snapshot != null },
                    { "staffCount", _staff.Count }
                };
            }
        }

        public static Dictionary<string, object> LocalStatePayload()
        {
            lock (Sync)
            {
                return new Dictionary<string, object>
                {
                    { "exists", _snapshot != null },
                    { "updatedAt", _updatedAt },
                    { "payload", _snapshot == null ? null : Sanitize(_snapshot) },
                    { "outletId", OutletValue("id", "out_local") },
                    { "tenantId", OutletValue("tenantId", "local_restaurant") }
                };
            }
        }

        public static Dictionary<string, object> SyncFromWeb(Dictionary<string, object> body)
        {
            var snapshot = body.ContainsKey("snapshot") ? body["snapshot"] as Dictionary<string, object> : null;
            var staff = body.ContainsKey("staff") ? body["staff"] as IList : null;
            if (snapshot == null) throw new InvalidOperationException("Restaurant snapshot is required for LAN sync.");
            lock (Sync)
            {
                var sameRestaurant = SameRestaurant(_snapshot, snapshot);
                if (sameRestaurant && _snapshot != null && SnapshotScore(snapshot) == 0 && SnapshotScore(_snapshot) > 0)
                {
                    throw new InvalidOperationException("Refused to replace offline LAN data with an empty snapshot.");
                }
                if (sameRestaurant && _snapshot != null && WouldEraseCore(_snapshot, snapshot))
                {
                    throw new InvalidOperationException("Refused to erase restaurant setup from the offline LAN host.");
                }
                _snapshot = CloneDictionary(snapshot);
                if (staff != null) _staff = CloneList(staff);
                _updatedAt = DateTime.UtcNow.ToString("o");
                Persist();
                BroadcastState("web-saas");
                return new Dictionary<string, object>
                {
                    { "ok", true },
                    { "updatedAt", _updatedAt },
                    { "primaryUrl", PrimaryUrl() },
                    { "staffCount", _staff.Count }
                };
            }
        }

        public static BridgeResponse HandleLanHttp(BridgeRequest request, Dictionary<string, string> headers)
        {
            var path = request.Path;
            if (request.Method == "GET" && path == "/health")
            {
                return Response(200, new Dictionary<string, object> { { "status", "ok" }, { "version", Program.Version } }, headers);
            }
            if (request.Method == "GET" && path == "/api/v1/lan/hello")
            {
                return Response(200, HelloPayload(), headers);
            }
            if (request.Method == "POST" && path == "/api/v1/auth/login")
            {
                var body = Json.DeserializeObject(request.Body) as Dictionary<string, object>;
                Dictionary<string, object> account;
                string error = "Invalid request";
                if (body == null || !TryAuthenticate(Text(body, "emailOrPhone"), Text(body, "password"), out account, out error))
                {
                    return Response(error == "Invalid credentials" ? 401 : 403, Error(error), headers);
                }
                return Response(200, new Dictionary<string, object>
                {
                    { "user", PublicAccount(account) },
                    { "outlets", new object[] { OutletPayload() } }
                }, headers);
            }

            var match = Regex.Match(path, "^/api/v1/outlets/([^/]+)/state$");
            if (match.Success)
            {
                var outletId = Uri.UnescapeDataString(match.Groups[1].Value);
                Dictionary<string, object> account;
                string authError;
                if (!TryBasic(request.Header("Authorization"), out account, out authError))
                {
                    return Response(authError == "Invalid credentials" ? 401 : 403, Error(authError), headers);
                }
                if (!CanAccessOutlet(account, outletId)) return Response(403, Error("Forbidden"), headers);
                if (request.Method == "GET") return Response(200, LocalStatePayload(), headers);
                if (request.Method == "PUT") return SaveFromMobile(request, account, outletId, headers);
            }
            return Response(404, Error("Not found."), headers);
        }

        private static BridgeResponse SaveFromMobile(BridgeRequest request, Dictionary<string, object> account, string outletId, Dictionary<string, string> headers)
        {
            var body = Json.DeserializeObject(request.Body) as Dictionary<string, object>;
            var incoming = body != null && body.ContainsKey("payload") ? body["payload"] as Dictionary<string, object> : null;
            if (body == null || incoming == null) return Response(400, Error("Invalid restaurant state."), headers);
            var role = Text(account, "role").ToLowerInvariant();
            if (!(role == "owner" || role == "admin" || role == "manager" || role == "captain" || role == "kitchen"))
                return Response(403, Error("This role cannot update restaurant state"), headers);

            lock (Sync)
            {
                if ((role == "captain" || role == "kitchen") && !PreservesRestrictedCollections(_snapshot, incoming))
                    return Response(403, Error("This role can only update tables, orders, and kitchen workflow"), headers);
                var expected = Text(body, "expectedUpdatedAt");
                if (!String.IsNullOrWhiteSpace(expected) && !String.IsNullOrWhiteSpace(_updatedAt) && expected != _updatedAt)
                {
                    return Response(409, new Dictionary<string, object>
                    {
                        { "error", "Restaurant data changed on another device. Refresh and retry." },
                        { "updatedAt", _updatedAt },
                        { "payload", _snapshot == null ? null : Sanitize(_snapshot) }
                    }, headers);
                }
                if (_snapshot != null && ((SnapshotScore(incoming) == 0 && SnapshotScore(_snapshot) > 0) || WouldEraseCore(_snapshot, incoming)))
                {
                    return Response(200, new Dictionary<string, object>
                    {
                        { "ok", true }, { "skipped", true }, { "updatedAt", _updatedAt },
                        { "payload", Sanitize(_snapshot) }, { "outletId", outletId }
                    }, headers);
                }
                PreserveCloudSecret(_snapshot, incoming);
                if (role == "captain" || role == "kitchen") PreserveCloudSettings(_snapshot, incoming);
                _snapshot = CloneDictionary(incoming);
                _updatedAt = DateTime.UtcNow.ToString("o");
                Persist();
                BroadcastState(Text(body, "clientId"));
                return Response(200, new Dictionary<string, object>
                {
                    { "ok", true }, { "outletId", outletId }, { "updatedAt", _updatedAt },
                    { "payload", Sanitize(_snapshot) }
                }, headers);
            }
        }

        public static bool TryWebSocketAuth(BridgeRequest request, out Dictionary<string, object> account, out string error)
        {
            string login;
            string secret;
            request.Query.TryGetValue("login", out login);
            request.Query.TryGetValue("secret", out secret);
            return TryAuthenticate(login, secret, out account, out error);
        }

        public static bool CanWebSocketAccess(Dictionary<string, object> account, string path)
        {
            var match = Regex.Match(path ?? "", "^/api/v1/outlets/([^/]+)/realtime$");
            return match.Success && CanAccessOutlet(account, Uri.UnescapeDataString(match.Groups[1].Value));
        }

        public static Dictionary<string, object> ConnectedEvent(BridgeRequest request)
        {
            string clientId;
            request.Query.TryGetValue("clientId", out clientId);
            return new Dictionary<string, object>
            {
                { "type", "CONNECTED" }, { "outletId", OutletValue("id", "out_local") },
                { "payload", new Dictionary<string, object> { { "clientId", clientId } } },
                { "timestamp", DateTime.UtcNow.ToString("o") }
            };
        }

        public static void RunDiscovery(ManualResetEvent shutdown)
        {
            UdpClient udp = null;
            try
            {
                udp = new UdpClient(new IPEndPoint(IPAddress.Any, 3001));
                udp.Client.ReceiveTimeout = 1000;
                while (!shutdown.WaitOne(0))
                {
                    try
                    {
                        var remote = new IPEndPoint(IPAddress.Any, 0);
                        var bytes = udp.Receive(ref remote);
                        var probe = Encoding.UTF8.GetString(bytes);
                        if (probe.IndexOf("BHOJPATRA_DISCOVER", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        var response = Encoding.UTF8.GetBytes(Json.Serialize(HelloPayload()));
                        udp.Send(response, response.Length, remote);
                    }
                    catch (SocketException ex)
                    {
                        if (ex.SocketErrorCode != SocketError.TimedOut) SetDiscoveryError("UDP discovery: " + ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                SetDiscoveryError("UDP discovery could not start: " + ex.Message);
            }
            finally
            {
                if (udp != null) udp.Close();
            }
        }

        private static Dictionary<string, object> HelloPayload()
        {
            return new Dictionary<string, object>
            {
                { "app", "bhojpatra-desk" }, { "name", "BhojPatra All-in-One Bridge" },
                { "version", Program.Version }, { "status", "ok" }, { "httpPort", 3000 },
                { "discoveryPort", 3001 }, { "primaryUrl", PrimaryUrl() },
                { "ipAddress", PrimaryIp() }, { "licensed", true },
                { "outlet", _snapshot == null ? null : OutletPayload() }
            };
        }

        private static Dictionary<string, object> OutletPayload()
        {
            var outlet = _snapshot != null && _snapshot.ContainsKey("outlet") ? _snapshot["outlet"] as Dictionary<string, object> : null;
            return new Dictionary<string, object>
            {
                { "id", Value(outlet, "id", "out_local") }, { "tenantId", Value(outlet, "tenantId", "local_restaurant") },
                { "name", Value(outlet, "name", "BhojPatra Bistro") }, { "code", Value(outlet, "code", "BHOJ") },
                { "timezone", Value(outlet, "timezone", "Asia/Kolkata") }, { "currency", Value(outlet, "currency", "INR") },
                { "status", Value(outlet, "status", "active") }
            };
        }

        private static string OutletValue(string key, string fallback)
        {
            var outlet = _snapshot != null && _snapshot.ContainsKey("outlet") ? _snapshot["outlet"] as Dictionary<string, object> : null;
            return Value(outlet, key, fallback);
        }

        private static bool TryBasic(string header, out Dictionary<string, object> account, out string error)
        {
            account = null;
            error = "Invalid credentials";
            try
            {
                if (String.IsNullOrWhiteSpace(header) || !header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase)) return false;
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header.Substring(6).Trim()));
                var colon = decoded.IndexOf(':');
                if (colon < 0) return false;
                return TryAuthenticate(decoded.Substring(0, colon), decoded.Substring(colon + 1), out account, out error);
            }
            catch { return false; }
        }

        private static bool TryAuthenticate(string login, string secret, out Dictionary<string, object> account, out string error)
        {
            account = null;
            error = "Invalid credentials";
            var normalized = (login ?? "").Trim().ToLowerInvariant();
            lock (Sync)
            {
                foreach (var item in _staff)
                {
                    var candidate = item as Dictionary<string, object>;
                    if (candidate == null) continue;
                    var email = Text(candidate, "email").Trim().ToLowerInvariant();
                    var phone = Text(candidate, "phone").Trim().ToLowerInvariant();
                    if (email != normalized && phone != normalized) continue;
                    if (!Text(candidate, "status").Equals("active", StringComparison.OrdinalIgnoreCase)) { error = "This login is not active"; return false; }
                    DateTime boundary;
                    var starts = Text(candidate, "accessStartsAt");
                    var ends = Text(candidate, "accessEndsAt");
                    if (!String.IsNullOrWhiteSpace(starts) && DateTime.TryParse(starts, out boundary) && boundary.ToUniversalTime() > DateTime.UtcNow) { error = "This login is not active yet"; return false; }
                    if (!String.IsNullOrWhiteSpace(ends) && DateTime.TryParse(ends, out boundary) && boundary.ToUniversalTime() < DateTime.UtcNow) { error = "This login has expired"; return false; }
                    var valid = SecretMatches(Text(candidate, "password"), secret) || SecretMatches(Text(candidate, "pin"), secret);
                    if (!valid) return false;
                    account = candidate;
                    return true;
                }
            }
            return false;
        }

        private static bool SecretMatches(string stored, string supplied)
        {
            if (String.IsNullOrEmpty(stored)) return false;
            if (!stored.StartsWith("sha256$", StringComparison.OrdinalIgnoreCase)) return stored == (supplied ?? "");
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(supplied ?? ""));
                var hex = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
                return stored.Substring(7).Equals(hex, StringComparison.OrdinalIgnoreCase);
            }
        }

        private static bool CanAccessOutlet(Dictionary<string, object> account, string outletId)
        {
            var tenant = Text(account, "tenantId");
            return outletId == "out_local" || outletId == tenant || outletId == "out_" + tenant ||
                outletId == OutletValue("id", "out_local") || outletId == OutletValue("tenantId", "local_restaurant");
        }

        private static Dictionary<string, object> PublicAccount(Dictionary<string, object> account)
        {
            var result = CloneDictionary(account);
            result.Remove("password");
            result.Remove("paymentNote");
            return result;
        }

        private static bool PreservesRestrictedCollections(Dictionary<string, object> existing, Dictionary<string, object> incoming)
        {
            if (existing == null) return true;
            var keys = new[] { "outlet", "printSettings", "appUpdate", "menuCategories", "menuItems", "floors", "stations", "inventoryItems", "purchaseEntries", "payments" };
            foreach (var key in keys)
            {
                object left;
                object right;
                existing.TryGetValue(key, out left);
                incoming.TryGetValue(key, out right);
                if (Json.Serialize(left) != Json.Serialize(right)) return false;
            }
            return true;
        }

        private static int SnapshotScore(Dictionary<string, object> snapshot)
        {
            if (snapshot == null) return 0;
            var score = 0;
            score += Count(snapshot, "menuItems") * 10;
            score += Count(snapshot, "orders") * 8;
            score += Count(snapshot, "orderItems") * 6;
            score += Count(snapshot, "payments") * 6;
            score += Count(snapshot, "kots") * 5;
            score += Count(snapshot, "tables") * 3;
            score += Count(snapshot, "floors") * 2;
            score += Count(snapshot, "menuCategories") * 2;
            score += Count(snapshot, "inventoryItems") * 2;
            return score;
        }

        private static int Count(Dictionary<string, object> source, string key)
        {
            object value;
            var list = source.TryGetValue(key, out value) ? value as IList : null;
            return list == null ? 0 : list.Count;
        }

        private static bool WouldEraseCore(Dictionary<string, object> existing, Dictionary<string, object> incoming)
        {
            foreach (var key in new[] { "tables", "floors", "menuItems", "menuCategories" })
                if (Count(existing, key) > 0 && Count(incoming, key) == 0) return true;
            return false;
        }

        private static bool SameRestaurant(Dictionary<string, object> existing, Dictionary<string, object> incoming)
        {
            if (existing == null || incoming == null) return false;
            var existingOutlet = existing.ContainsKey("outlet") ? existing["outlet"] as Dictionary<string, object> : null;
            var incomingOutlet = incoming.ContainsKey("outlet") ? incoming["outlet"] as Dictionary<string, object> : null;
            var existingId = Value(existingOutlet, "id", "");
            var incomingId = Value(incomingOutlet, "id", "");
            var existingTenant = Value(existingOutlet, "tenantId", "");
            var incomingTenant = Value(incomingOutlet, "tenantId", "");
            return (!String.IsNullOrWhiteSpace(existingId) && existingId == incomingId)
                || (!String.IsNullOrWhiteSpace(existingTenant) && existingTenant == incomingTenant);
        }

        private static void PreserveCloudSecret(Dictionary<string, object> existing, Dictionary<string, object> incoming)
        {
            if (existing == null) return;
            var oldCloud = existing.ContainsKey("cloudSync") ? existing["cloudSync"] as Dictionary<string, object> : null;
            var newCloud = incoming.ContainsKey("cloudSync") ? incoming["cloudSync"] as Dictionary<string, object> : null;
            var secret = Text(oldCloud, "accountSecret");
            if (newCloud != null && !String.IsNullOrWhiteSpace(secret)) newCloud["accountSecret"] = secret;
        }

        private static void PreserveCloudSettings(Dictionary<string, object> existing, Dictionary<string, object> incoming)
        {
            if (existing == null || incoming == null || !existing.ContainsKey("cloudSync")) return;
            incoming["cloudSync"] = Json.DeserializeObject(Json.Serialize(existing["cloudSync"]));
        }

        private static Dictionary<string, object> Sanitize(Dictionary<string, object> source)
        {
            var copy = CloneDictionary(source);
            var cloud = copy.ContainsKey("cloudSync") ? copy["cloudSync"] as Dictionary<string, object> : null;
            if (cloud != null) cloud["accountSecret"] = "";
            return copy;
        }

        private static void BroadcastState(string clientId)
        {
            if (_snapshot == null) return;
            LanRealtimeHub.Broadcast(Json.Serialize(new Dictionary<string, object>
            {
                { "type", "STATE_UPDATED" }, { "outletId", OutletValue("id", "out_local") },
                { "payload", Sanitize(_snapshot) }, { "timestamp", _updatedAt }, { "clientId", clientId }
            }));
        }

        private static void Persist()
        {
            var root = new Dictionary<string, object> { { "snapshot", _snapshot }, { "staff", _staff }, { "updatedAt", _updatedAt } };
            var temp = _statePath + ".tmp";
            File.WriteAllText(temp, Json.Serialize(root), Encoding.UTF8);
            if (File.Exists(_statePath)) File.Delete(_statePath);
            File.Move(temp, _statePath);
        }

        private static List<string> LanUrls()
        {
            var rows = new List<Tuple<int, string>>();
            foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (adapter.OperationalStatus != OperationalStatus.Up) continue;
                var lower = adapter.Name.ToLowerInvariant();
                if (lower.Contains("virtual") || lower.Contains("vpn") || lower.Contains("wsl") || lower.Contains("docker") || lower.Contains("vmware") || lower.Contains("bluetooth")) continue;
                foreach (var address in adapter.GetIPProperties().UnicastAddresses)
                {
                    if (address.Address.AddressFamily != AddressFamily.InterNetwork || !IsPrivate(address.Address)) continue;
                    var score = adapter.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? 0 : adapter.NetworkInterfaceType == NetworkInterfaceType.Ethernet ? 10 : 30;
                    rows.Add(Tuple.Create(score, "http://" + address.Address + ":3000"));
                }
            }
            return rows.OrderBy(row => row.Item1).ThenBy(row => row.Item2).Select(row => row.Item2).Distinct().ToList();
        }

        private static bool IsPrivate(IPAddress address)
        {
            var bytes = address.GetAddressBytes();
            return bytes.Length == 4 && (bytes[0] == 10 || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] == 192 && bytes[1] == 168));
        }

        private static string PrimaryUrl() { var urls = LanUrls(); return urls.Count > 0 ? urls[0] : "http://127.0.0.1:3000"; }
        private static string PrimaryIp() { try { return new Uri(PrimaryUrl()).Host; } catch { return null; } }
        private static Dictionary<string, object> CloneDictionary(Dictionary<string, object> value) { return Json.DeserializeObject(Json.Serialize(value)) as Dictionary<string, object>; }
        private static IList CloneList(IList value) { return Json.DeserializeObject(Json.Serialize(value)) as IList ?? new ArrayList(); }
        private static string Text(Dictionary<string, object> source, string key) { return Value(source, key, ""); }
        private static string Value(Dictionary<string, object> source, string key, string fallback) { object value; return source != null && source.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : fallback; }
        private static Dictionary<string, object> Error(string message) { return new Dictionary<string, object> { { "error", String.IsNullOrWhiteSpace(message) ? "Request failed" : message } }; }
        private static BridgeResponse Response(int status, object payload, Dictionary<string, string> headers) { return new BridgeResponse(status, Json.Serialize(payload), headers, "application/json; charset=utf-8"); }
    }

    internal static class LanRealtimeHub
    {
        private sealed class Client
        {
            public NetworkStream Stream;
            public readonly object WriteLock = new object();
        }

        private static readonly object Sync = new object();
        private static readonly List<Client> Clients = new List<Client>();
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 20 * 1024 * 1024 };
        private const string WebSocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

        public static void Handle(TcpClient tcp, BridgeRequest request)
        {
            Dictionary<string, object> account;
            string error;
            if (!LanStore.TryWebSocketAuth(request, out account, out error))
            {
                var body = Encoding.UTF8.GetBytes("{\"error\":\"" + Escape(error) + "\"}");
                var header = Encoding.ASCII.GetBytes("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
                tcp.GetStream().Write(header, 0, header.Length);
                tcp.GetStream().Write(body, 0, body.Length);
                return;
            }
            if (!LanStore.CanWebSocketAccess(account, request.Path))
            {
                var body = Encoding.UTF8.GetBytes("{\"error\":\"Forbidden\"}");
                var header = Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
                tcp.GetStream().Write(header, 0, header.Length);
                tcp.GetStream().Write(body, 0, body.Length);
                return;
            }
            var key = request.Header("Sec-WebSocket-Key");
            if (String.IsNullOrWhiteSpace(key)) return;
            string accept;
            using (var sha = SHA1.Create()) accept = Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key.Trim() + WebSocketGuid)));
            var handshake = Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
            var stream = tcp.GetStream();
            stream.Write(handshake, 0, handshake.Length);
            var client = new Client { Stream = stream };
            lock (Sync) Clients.Add(client);
            SendText(client, Json.Serialize(LanStore.ConnectedEvent(request)));
            try
            {
                while (tcp.Connected)
                {
                    byte opcode;
                    byte[] payload;
                    if (!ReadFrame(stream, out opcode, out payload)) break;
                    if (opcode == 8) break;
                    if (opcode == 9) { SendFrame(client, 10, payload); continue; }
                    if (opcode != 1) continue;
                    var text = Encoding.UTF8.GetString(payload);
                    if (text == "ping") SendText(client, "pong");
                }
            }
            catch { }
            finally { lock (Sync) Clients.Remove(client); }
        }

        public static void Broadcast(string message)
        {
            List<Client> copy;
            lock (Sync) copy = Clients.ToList();
            foreach (var client in copy)
            {
                try { SendText(client, message); }
                catch { lock (Sync) Clients.Remove(client); }
            }
        }

        private static void SendText(Client client, string text) { SendFrame(client, 1, Encoding.UTF8.GetBytes(text ?? "")); }

        private static void SendFrame(Client client, byte opcode, byte[] payload)
        {
            using (var buffer = new MemoryStream())
            {
                buffer.WriteByte((byte)(0x80 | opcode));
                if (payload.Length < 126) buffer.WriteByte((byte)payload.Length);
                else if (payload.Length <= UInt16.MaxValue)
                {
                    buffer.WriteByte(126); buffer.WriteByte((byte)(payload.Length >> 8)); buffer.WriteByte((byte)payload.Length);
                }
                else
                {
                    buffer.WriteByte(127);
                    var length = (ulong)payload.Length;
                    for (var i = 7; i >= 0; i--) buffer.WriteByte((byte)(length >> (8 * i)));
                }
                buffer.Write(payload, 0, payload.Length);
                var frame = buffer.ToArray();
                lock (client.WriteLock) { client.Stream.Write(frame, 0, frame.Length); client.Stream.Flush(); }
            }
        }

        private static bool ReadFrame(NetworkStream stream, out byte opcode, out byte[] payload)
        {
            opcode = 0; payload = null;
            var first = stream.ReadByte(); var second = stream.ReadByte();
            if (first < 0 || second < 0) return false;
            opcode = (byte)(first & 0x0F);
            var masked = (second & 0x80) != 0;
            ulong length = (uint)(second & 0x7F);
            if (length == 126) { var bytes = ReadExact(stream, 2); length = (uint)((bytes[0] << 8) | bytes[1]); }
            else if (length == 127) { var bytes = ReadExact(stream, 8); length = 0; for (var i = 0; i < 8; i++) length = (length << 8) | bytes[i]; }
            if (length > 20 * 1024 * 1024) throw new InvalidOperationException("WebSocket message is too large.");
            var mask = masked ? ReadExact(stream, 4) : null;
            payload = ReadExact(stream, (int)length);
            if (masked) for (var i = 0; i < payload.Length; i++) payload[i] = (byte)(payload[i] ^ mask[i % 4]);
            return true;
        }

        private static byte[] ReadExact(Stream stream, int length)
        {
            var bytes = new byte[length]; var offset = 0;
            while (offset < length) { var read = stream.Read(bytes, offset, length - offset); if (read <= 0) throw new EndOfStreamException(); offset += read; }
            return bytes;
        }

        private static string Escape(string value) { return (value ?? "Request failed").Replace("\\", "\\\\").Replace("\"", "\\\""); }
    }
}
