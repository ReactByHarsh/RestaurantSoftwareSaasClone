using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace BhojPatra.NativePrintBridgeSetup
{
    internal static class Program
    {
        private const string AppName = "BhojPatra All-in-One Bridge";
        private const string BridgeResourceName = "BhojPatra.NativePrintBridge.exe";
        private const string BridgeExeName = "bhojpatra-native-bridge.exe";
        private const string TaskName = "BhojPatra Native Print Bridge";
        private const string RunValueName = "BhojPatra Printer Bridge";
        private const string BridgeUrl = "http://127.0.0.1:8181";

        [STAThread]
        private static int Main(string[] args)
        {
            var quiet = HasArg(args, "/quiet") || HasArg(args, "/q") || HasArg(args, "/silent");
            try
            {
                var installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BhojPatra");
                Directory.CreateDirectory(installDir);

                StopOldBridgeProcesses();
                DeleteScheduledTask("BhojPatra");
                DeleteScheduledTask("BhojPatra Print Bridge");
                DeleteScheduledTask(TaskName);
                DeleteOldStartupFiles();

                var bridgePath = Path.Combine(installDir, BridgeExeName);
                WriteEmbeddedBridge(bridgePath);
                CopyRepairSetup(installDir);
                WriteReadme(installDir);
                WriteUninstaller(installDir);
                var scheduledTaskInstalled = false;
                try
                {
                    CreateResilientScheduledTask(bridgePath);
                    scheduledTaskInstalled = true;
                    DeleteRunFallback();
                }
                catch (Exception taskError)
                {
                    File.AppendAllText(
                        Path.Combine(installDir, "native-print-bridge-setup.log"),
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " Scheduled task fallback: " + taskError.Message + Environment.NewLine,
                        Encoding.UTF8);
                    // Use one fallback only. Starting from Task Scheduler, Registry Run and the
                    // Startup folder at the same time caused duplicate processes and restart loops.
                    RegisterRunFallback(bridgePath);
                }
                CreateStartMenuShortcuts(installDir, bridgePath);
                EnsureLanFirewallRules();

                StartBridge(bridgePath, scheduledTaskInstalled);
                var health = WaitForHealth();

                if (!quiet)
                {
                    Process.Start(BridgeUrl + "/diagnostics");
                    MessageBox.Show(
                        AppName + " installed successfully.\r\n\r\n" +
                        "Bridge URL: " + BridgeUrl + "\r\n" +
                        "Health: " + health + "\r\n\r\n" +
                        "Offline LAN server: port 3000 (discovery 3001)\r\n\r\n" +
                        "Printing and captain/kitchen Wi-Fi connectivity will now start automatically with Windows.",
                        AppName,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }

                return 0;
            }
            catch (Exception ex)
            {
                try
                {
                    File.AppendAllText(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BhojPatra", "native-print-bridge-setup.log"),
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + ex + Environment.NewLine,
                        Encoding.UTF8);
                }
                catch
                {
                }

                if (!quiet)
                {
                    MessageBox.Show(ex.Message, AppName + " Setup Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                return 1;
            }
        }

        private static bool HasArg(string[] args, string value)
        {
            foreach (var arg in args ?? new string[0])
            {
                if (String.Equals(arg, value, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private static void WriteEmbeddedBridge(string bridgePath)
        {
            using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream(BridgeResourceName))
            {
                if (input == null) throw new InvalidOperationException("The embedded print bridge was not found inside the setup EXE.");
                using (var output = File.Create(bridgePath))
                {
                    input.CopyTo(output);
                }
            }
        }

        private static void CopyRepairSetup(string installDir)
        {
            var currentSetup = Assembly.GetExecutingAssembly().Location;
            var repairSetup = Path.Combine(installDir, "BhojPatra-Printer-Bridge-Setup.exe");
            if (!String.Equals(currentSetup, repairSetup, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(currentSetup, repairSetup, true);
            }
        }

        private static void StopOldBridgeProcesses()
        {
            var currentId = Process.GetCurrentProcess().Id;
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    if (process.Id == currentId) continue;
                    var name = process.ProcessName;
                    if (
                        String.Equals(name, "bhojpatra", StringComparison.OrdinalIgnoreCase) ||
                        String.Equals(name, "bhojpatra-native-bridge", StringComparison.OrdinalIgnoreCase) ||
                        String.Equals(name, "BhojPatra-Print-Bridge", StringComparison.OrdinalIgnoreCase))
                    {
                        process.Kill();
                        process.WaitForExit(5000);
                    }
                }
                catch
                {
                }
            }
        }

        private static void DeleteScheduledTask(string taskName)
        {
            RunHidden("schtasks.exe", "/Delete /TN \"" + taskName + "\" /F", true);
        }

        private static void CreateResilientScheduledTask(string bridgePath)
        {
            var sid = WindowsIdentity.GetCurrent().User.Value;
            var taskXmlPath = Path.Combine(Path.GetTempPath(), "bhojpatra-print-bridge-task-" + Guid.NewGuid().ToString("N") + ".xml");
            var command = SecurityElement.Escape(bridgePath);
            var workingDirectory = SecurityElement.Escape(Path.GetDirectoryName(bridgePath));
            var userId = SecurityElement.Escape(sid);
            var xml =
                "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n" +
                "<Task version=\"1.4\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n" +
                "  <RegistrationInfo><Description>Keeps the BhojPatra local printer bridge available after every Windows sign-in.</Description></RegistrationInfo>\r\n" +
                "  <Triggers><LogonTrigger><Enabled>true</Enabled><Delay>PT10S</Delay><UserId>" + userId + "</UserId></LogonTrigger></Triggers>\r\n" +
                "  <Principals><Principal id=\"Author\"><UserId>" + userId + "</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\r\n" +
                "  <Settings>\r\n" +
                "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n" +
                "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable>\r\n" +
                "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled>\r\n" +
                "    <Hidden>false</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\r\n" +
                "    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure><Priority>7</Priority>\r\n" +
                "  </Settings>\r\n" +
                "  <Actions Context=\"Author\"><Exec><Command>" + command + "</Command><WorkingDirectory>" + workingDirectory + "</WorkingDirectory></Exec></Actions>\r\n" +
                "</Task>\r\n";

            try
            {
                File.WriteAllText(taskXmlPath, xml, Encoding.Unicode);
                var exitCode = RunHidden("schtasks.exe", "/Create /TN \"" + TaskName + "\" /XML \"" + taskXmlPath + "\" /F", false);
                if (exitCode != 0) throw new InvalidOperationException("Windows Task Scheduler returned exit code " + exitCode + ".");
                exitCode = RunHidden("schtasks.exe", "/Query /TN \"" + TaskName + "\"", false);
                if (exitCode != 0) throw new InvalidOperationException("The printer bridge startup task could not be verified.");
            }
            finally
            {
                DeleteFile(taskXmlPath);
            }
        }

        private static void RegisterRunFallback(string bridgePath)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (key == null) throw new InvalidOperationException("Could not register the printer bridge for Windows sign-in.");
                key.DeleteValue("BhojPatra", false);
                key.DeleteValue("BhojPatra Print Bridge", false);
                key.DeleteValue("BhojPatra Native Print Bridge", false);
                key.SetValue(RunValueName, "\"" + bridgePath + "\"", RegistryValueKind.String);
            }
        }

        private static void DeleteRunFallback()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key != null)
                {
                    key.DeleteValue("BhojPatra", false);
                    key.DeleteValue("BhojPatra Print Bridge", false);
                    key.DeleteValue("BhojPatra Native Print Bridge", false);
                    key.DeleteValue(RunValueName, false);
                }
            }
        }

        private static void DeleteOldStartupFiles()
        {
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            DeleteFile(Path.Combine(startup, "BhojPatra.lnk"));
            DeleteFile(Path.Combine(startup, "BhojPatra Print Bridge.lnk"));
            DeleteFile(Path.Combine(startup, "BhojPatra Native Print Bridge.lnk"));
            DeleteFile(Path.Combine(startup, "BhojPatra Native Print Bridge.vbs"));
        }

        private static void CreateStartupFallback(string bridgePath)
        {
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            Directory.CreateDirectory(startup);
            File.WriteAllText(
                Path.Combine(startup, "BhojPatra Native Print Bridge.vbs"),
                "Set WshShell = CreateObject(\"WScript.Shell\")\r\n" +
                "WshShell.Run \"\"\"" + bridgePath.Replace("\"", "\"\"") + "\"\"\", 0, False\r\n",
                Encoding.ASCII);
        }

        private static void CreateStartMenuShortcuts(string installDir, string bridgePath)
        {
            var programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            var menuDir = Path.Combine(programs, "BhojPatra");
            Directory.CreateDirectory(menuDir);

            File.WriteAllText(Path.Combine(menuDir, "Bridge Health Check.url"), "[InternetShortcut]\r\nURL=" + BridgeUrl + "/health\r\n", Encoding.ASCII);
            File.WriteAllText(Path.Combine(menuDir, "Bridge Diagnostics.url"), "[InternetShortcut]\r\nURL=" + BridgeUrl + "/diagnostics\r\n", Encoding.ASCII);
            File.WriteAllText(
                Path.Combine(menuDir, "Start Native Print Bridge.cmd"),
                "@echo off\r\nstart \"\" \"" + bridgePath + "\"\r\n",
                Encoding.ASCII);
            File.WriteAllText(
                Path.Combine(menuDir, "Repair Printer Bridge.cmd"),
                "@echo off\r\nstart \"\" \"" + Path.Combine(installDir, "BhojPatra-Printer-Bridge-Setup.exe") + "\"\r\n",
                Encoding.ASCII);
            File.WriteAllText(
                Path.Combine(menuDir, "Uninstall Native Print Bridge.cmd"),
                "@echo off\r\ncall \"" + Path.Combine(installDir, "Uninstall-BhojPatra-Native-Print-Bridge.cmd") + "\"\r\n",
                Encoding.ASCII);
        }

        private static void EnsureLanFirewallRules()
        {
            RunHidden("netsh.exe", "advfirewall firewall delete rule name=\"BhojPatra Offline LAN TCP\"", true);
            RunHidden("netsh.exe", "advfirewall firewall delete rule name=\"BhojPatra Offline Discovery UDP\"", true);
            var tcp = RunHidden("netsh.exe", "advfirewall firewall add rule name=\"BhojPatra Offline LAN TCP\" dir=in action=allow protocol=TCP localport=3000 profile=any", false);
            var udp = RunHidden("netsh.exe", "advfirewall firewall add rule name=\"BhojPatra Offline Discovery UDP\" dir=in action=allow protocol=UDP localport=3001 profile=any", false);
            if (tcp != 0 || udp != 0) throw new InvalidOperationException("Windows Firewall rules for phone connectivity could not be installed.");
        }

        private static void WriteReadme(string installDir)
        {
            File.WriteAllText(
                Path.Combine(installDir, "README-BhojPatra-Native-Print-Bridge.txt"),
                "BhojPatra All-in-One Bridge\r\n" +
                "============================\r\n\r\n" +
                "Bridge URL: " + BridgeUrl + "\r\n" +
                "Health: " + BridgeUrl + "/health\r\n" +
                "Diagnostics: " + BridgeUrl + "/diagnostics\r\n\r\n" +
                "Phone LAN API: port 3000\r\nDiscovery: UDP port 3001\r\n\r\n" +
                "In BhojPatra Cloud, choose Settings > Printing & Receipt > USB / LAN / Bluetooth.\r\n" +
                "Do not use Chrome USB for Windows-installed POS80 printers.\r\n",
                Encoding.UTF8);
        }

        private static void WriteUninstaller(string installDir)
        {
            var uninstallPath = Path.Combine(installDir, "Uninstall-BhojPatra-Native-Print-Bridge.cmd");
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            var menuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "BhojPatra");

            File.WriteAllText(
                uninstallPath,
                "@echo off\r\n" +
                "schtasks /Delete /TN \"BhojPatra Native Print Bridge\" /F >nul 2>nul\r\n" +
                "reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\" /v \"BhojPatra Printer Bridge\" /f >nul 2>nul\r\n" +
                "taskkill /IM bhojpatra-native-bridge.exe /F >nul 2>nul\r\n" +
                "del \"" + Path.Combine(startup, "BhojPatra Native Print Bridge.vbs") + "\" /f /q >nul 2>nul\r\n" +
                "rmdir \"" + menuDir + "\" /s /q >nul 2>nul\r\n" +
                "del \"" + Path.Combine(installDir, BridgeExeName) + "\" /f /q >nul 2>nul\r\n" +
                "del \"" + Path.Combine(installDir, "README-BhojPatra-Native-Print-Bridge.txt") + "\" /f /q >nul 2>nul\r\n" +
                "del \"" + Path.Combine(installDir, "BhojPatra-Printer-Bridge-Setup.exe") + "\" /f /q >nul 2>nul\r\n" +
                "echo BhojPatra Native Print Bridge removed.\r\n" +
                "pause\r\n",
                Encoding.ASCII);
        }

        private static void StartBridge(string bridgePath, bool scheduledTaskInstalled)
        {
            if (scheduledTaskInstalled)
            {
                var taskStart = RunHidden("schtasks.exe", "/Run /TN \"" + TaskName + "\"", true);
                if (taskStart == 0) return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = bridgePath,
                WorkingDirectory = Path.GetDirectoryName(bridgePath),
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
        }

        private static string WaitForHealth()
        {
            Exception last = null;
            for (var i = 0; i < 20; i++)
            {
                try
                {
                    using (var client = new WebClient())
                    {
                        return client.DownloadString(BridgeUrl + "/health");
                    }
                }
                catch (Exception ex)
                {
                    last = ex;
                    Thread.Sleep(500);
                }
            }
            throw new InvalidOperationException("The bridge was installed but did not respond at " + BridgeUrl + "/health.", last);
        }

        private static int RunHidden(string fileName, string arguments, bool ignoreErrors)
        {
            try
            {
                var process = Process.Start(new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
                if (process == null) return -1;
                process.WaitForExit(15000);
                return process.HasExited ? process.ExitCode : -1;
            }
            catch
            {
                if (!ignoreErrors) throw;
                return -1;
            }
        }

        private static void DeleteFile(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
            }
        }
    }
}
