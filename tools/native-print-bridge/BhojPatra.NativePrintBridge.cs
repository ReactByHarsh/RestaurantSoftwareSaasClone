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
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace BhojPatra.NativePrintBridge
{
    internal static class Program
    {
        private const string Version = "2.1.0-native";
        private static readonly string[] SupportedFeatures = new[] { "qr", "cashdrawer", "logo", "network-print", "printer-status", "log-rotation", "graceful-shutdown" };
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
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
                _server = new BridgeServer(port, HandleRequest, _shutdownEvent);
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
                { "spoolerStatus", PrinterService.GetSpoolerStatus() },
                { "printerCount", PrinterService.ListPrinters().Count },
                { "uptime", (DateTime.UtcNow - _startedAt).ToString(@"d\.hh\:mm\:ss") },
                { "lastPrintAt", lastPrintAt },
                { "totalPrints", totalPrints }
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
            headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, X-Requested-With";
            headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
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
        private readonly int _port;
        private readonly Func<BridgeRequest, BridgeResponse> _handler;
        private readonly ManualResetEvent _shutdownEvent;
        private TcpListener _listener;

        public BridgeServer(int port, Func<BridgeRequest, BridgeResponse> handler, ManualResetEvent shutdownEvent)
        {
            _port = port;
            _handler = handler;
            _shutdownEvent = shutdownEvent;
        }

        public void Start()
        {
            _listener = new TcpListener(IPAddress.Loopback, _port);
            _listener.Start();
            Console.WriteLine("BhojPatra Native Print Bridge listening on http://127.0.0.1:" + _port);

            while (!_shutdownEvent.WaitOne(0))
            {
                try
                {
                    var asyncResult = _listener.BeginAcceptTcpClient(null, null);
                    // Wait for either a new connection or shutdown signal
                    var waitHandles = new WaitHandle[] { asyncResult.AsyncWaitHandle, _shutdownEvent };
                    var index = WaitHandle.WaitAny(waitHandles);
                    if (index == 1) // shutdown
                    {
                        _listener.Stop();
                        Program.Log("Server stopped gracefully.");
                        break;
                    }
                    var client = _listener.EndAcceptTcpClient(asyncResult);
                    ThreadPool.QueueUserWorkItem(_ => HandleClient(client));
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
                    var response = _handler(request);
                    response.Write(client.GetStream());
                }
                catch (Exception ex)
                {
                    var body = "{\"error\":\"" + JsonEscape(ex.Message) + "\"}";
                    var response = new BridgeResponse(500, body, new Dictionary<string, string>(), "application/json; charset=utf-8");
                    response.Write(client.GetStream());
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
        public Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public string Header(string name)
        {
            string value;
            return Headers.TryGetValue(name, out value) ? value : "";
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
                if (data.Count > 1024 * 1024) throw new InvalidOperationException("Request is too large.");
            }

            var headerText = Encoding.ASCII.GetString(data.Take(headerEnd).ToArray());
            var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
            if (lines.Length == 0) throw new InvalidOperationException("Invalid HTTP request.");

            var requestLine = lines[0].Split(' ');
            if (requestLine.Length < 2) throw new InvalidOperationException("Invalid HTTP request line.");

            var request = new BridgeRequest
            {
                Method = requestLine[0].ToUpperInvariant(),
                Path = requestLine[1].Split('?')[0],
                LocalPort = localPort
            };

            for (var i = 1; i < lines.Length; i++)
            {
                var colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                request.Headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
            }

            int contentLength;
            int.TryParse(request.Header("Content-Length"), out contentLength);
            if (contentLength > 1024 * 1024) throw new InvalidOperationException("Print job is too large.");

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
            if (status == 404) return "Not Found";
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
            if (rows.Count == 0) rows = ListPrintersFromDotNet();
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
                PrintRawTcp(target, content, options);
                return;
            }

            var installed = ListPrinters();
            if (!installed.Any(row => String.Equals(Convert.ToString(row["name"]), printer, StringComparison.OrdinalIgnoreCase)))
            {
                throw new InvalidOperationException("Printer queue was not found in Windows: " + printer);
            }

            RawPrinter.Send(printer, EscPosBytes(content, options), jobName);
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
                var result = client.BeginConnect(target.Host, target.Port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(TimeSpan.FromSeconds(10)))
                {
                    throw new System.TimeoutException("LAN printer timed out at " + target.Host + ":" + target.Port);
                }
                client.EndConnect(result);
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
}
