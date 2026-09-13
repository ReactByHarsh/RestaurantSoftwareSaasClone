import http from 'node:http'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const bridgeVersion = '1.0.4'
const host = '127.0.0.1'
const port = Number(process.env.BHOJPATRA_PRINT_BRIDGE_PORT || 8181)
const allowedOrigins = new Set([
  'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

function corsHeaders(request) {
  const origin = request.headers.origin || ''
  const allowedOrigin = allowedOrigins.has(origin) ||
    /^https:\/\/bhojpatra-cloud\.yash-v-shinde\.workers\.dev$/.test(origin) ||
    /^https?:\/\/[^/\s]+$/i.test(origin) ||
    origin === 'null'
    ? origin
    : ''
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

async function windowsPrinters() {
  const script = `
    $printers = @()
    try {
      if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
        $printers = @(Get-CimInstance Win32_Printer -ErrorAction Stop)
      }
    } catch {
      $printers = @()
    }
    if ($printers.Count -eq 0) {
      try {
        $printers = @(Get-WmiObject Win32_Printer -ErrorAction Stop)
      } catch {
        $printers = @()
      }
    }
    $printers |
      Where-Object { $_.Name } |
      Select-Object Name, PrinterStatus, DriverName, PortName, WorkOffline, Default |
      Sort-Object @{ Expression = {
        if ($_.Name -match 'POS|80|Thermal|Receipt|RONGTA|KPC|EPSON|foodkart') { 0 } else { 1 }
      }}, @{ Expression = {
        if ($_.WorkOffline -eq $false) { 0 } else { 1 }
      }}, Name |
      ConvertTo-Json -Compress -Depth 3
  `
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8_000 })
  const value = stdout.trim()
  if (!value) return []
  const parsed = JSON.parse(value)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .map(row => ({
      name: String(row.Name || ''),
      portName: String(row.PortName || ''),
      driverName: String(row.DriverName || ''),
      status: row.WorkOffline ? 'offline' : 'online',
      isDefault: Boolean(row.Default),
    }))
    .filter(row => row.name)
    .map(row => ({
      ...row,
      label: [row.name, row.portName, row.driverName].filter(Boolean).join(' - '),
    }))
}

async function listPrinters() {
  if (process.platform === 'win32') return windowsPrinters()
  const { stdout } = await execFileAsync('lpstat', ['-p'], { timeout: 15_000 })
  return stdout
    .split(/\r?\n/)
    .map(line => line.match(/^printer\s+(.+?)\s+is\s/)?.[1])
    .filter(Boolean)
    .map(name => ({ name, label: name, portName: '', driverName: '', status: 'online', isDefault: false }))
}

function escPosQrBuffer(data, label = '') {
  const value = String(data || '').trim()
  if (!value) return Buffer.alloc(0)
  const qrData = Buffer.from(value, 'ascii')
  const storeLength = qrData.length + 3
  const pL = storeLength % 256
  const pH = Math.floor(storeLength / 256)
  const labelBuffer = String(label || '').trim() ? Buffer.from(`${String(label).trim()}\n`, 'ascii') : Buffer.alloc(0)
  return Buffer.concat([
    Buffer.from([0x0a, 0x1b, 0x61, 0x01]),
    labelBuffer,
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
    qrData,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, 0x0a, 0x1b, 0x61, 0x00]),
  ])
}

function escPosBuffer(content, options = {}) {
  const safeText = String(content)
    .replace(/₹/g, 'Rs.')
    .replace(/â‚¹/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .replace(/[â€“â€”]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
  const body = Buffer.from(safeText.endsWith('\n') ? safeText : `${safeText}\n`, 'ascii')
  const init = Buffer.from([0x1b, 0x40])
  const drawer = options.openCashDrawer ? Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]) : Buffer.alloc(0)
  const qrCodes = Array.isArray(options.qrCodes)
    ? options.qrCodes.map(qr => escPosQrBuffer(qr?.data, qr?.label))
    : []
  const cut = options.autoCut === false ? Buffer.from([0x0a, 0x0a, 0x0a]) : Buffer.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00])
  return Buffer.concat([init, drawer, body, ...qrCodes, cut])
}

async function printRawOnWindows(printer, content, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'bhojpatra-print-'))
  const file = join(directory, 'job.bin')
  try {
    await writeFile(file, escPosBuffer(content, options))
    const script = `
      Add-Type -TypeDefinition @"
      using System;
      using System.ComponentModel;
      using System.Runtime.InteropServices;
      public static class RawPrinterHelper {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public class DOCINFO {
          [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
          [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
          [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }
        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool OpenPrinter(string printerName, out IntPtr hPrinter, IntPtr defaults);
        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool ClosePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO docInfo);
        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);
        public static void Send(string printerName, byte[] bytes, string jobName) {
          IntPtr hPrinter;
          if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
          try {
            DOCINFO docInfo = new DOCINFO();
            docInfo.pDocName = jobName;
            docInfo.pDataType = "RAW";
            if (StartDocPrinter(hPrinter, 1, docInfo) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            try {
              if (!StartPagePrinter(hPrinter)) throw new Win32Exception(Marshal.GetLastWin32Error());
              try {
                int written;
                if (!WritePrinter(hPrinter, bytes, bytes.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
                if (written != bytes.Length) throw new Exception("Only " + written + " of " + bytes.Length + " bytes were written.");
              } finally {
                EndPagePrinter(hPrinter);
              }
            } finally {
              EndDocPrinter(hPrinter);
            }
          } finally {
            ClosePrinter(hPrinter);
          }
        }
      }
"@
      $bytes = [System.IO.File]::ReadAllBytes($env:BP_PRINT_FILE)
      [RawPrinterHelper]::Send($env:BP_PRINTER_NAME, $bytes, $env:BP_JOB_NAME)
    `
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 30_000,
      env: { ...process.env, BP_PRINT_FILE: file, BP_PRINTER_NAME: printer, BP_JOB_NAME: options.jobName || 'BhojPatra print job' },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function parseNetworkPrinterTarget(printer) {
  const raw = String(printer || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (['tcp:', 'socket:', 'raw:', 'http:', 'https:'].includes(url.protocol)) {
      return { host: url.hostname, port: Number(url.port || 9100) }
    }
  } catch {
    // Fall through to host[:port] parsing.
  }
  const match = raw.match(/^([a-z0-9.-]+|\[[a-f0-9:]+\])(?::(\d{2,5}))?$/i)
  if (!match) return null
  return { host: match[1].replace(/^\[|\]$/g, ''), port: Number(match[2] || 9100) }
}

async function printRawTcp(printer, content, options = {}) {
  const target = parseNetworkPrinterTarget(printer)
  if (!target) throw new Error('Invalid LAN printer address. Use tcp://192.168.1.50:9100 or 192.168.1.50:9100.')
  const bytes = escPosBuffer(content, options)
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: target.host, port: target.port, timeout: 10_000 })
    socket.once('connect', () => socket.end(bytes))
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error(`LAN printer timed out at ${target.host}:${target.port}`))
    })
    socket.once('close', hadError => {
      if (!hadError) resolve()
    })
  })
}

async function printDocument(printer, content, options = {}) {
  if (parseNetworkPrinterTarget(printer)) return printRawTcp(printer, content, options)
  const printers = await listPrinters()
  if (!printers.some(candidate => candidate.name === printer)) throw new Error('The selected printer queue is not installed or available.')
  if (process.platform === 'win32') return printRawOnWindows(printer, content, options)
  const directory = await mkdtemp(join(tmpdir(), 'bhojpatra-print-'))
  const file = join(directory, 'job.txt')
  try {
    await writeFile(file, content, 'utf8')
    await execFileAsync('lp', ['-d', printer, file], { timeout: 30_000 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1_000_000) throw new Error('Print job is too large.')
  }
  return JSON.parse(body || '{}')
}

const server = http.createServer(async (request, response) => {
  const headers = corsHeaders(request)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers)
    response.end()
    return
  }
  if (request.headers.origin && !headers['Access-Control-Allow-Origin']) {
    sendJson(response, 403, { error: 'Origin not allowed' }, headers)
    return
  }
  try {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true, service: 'BhojPatra Print Bridge', version: bridgeVersion }, headers)
      return
    }
    if (request.method === 'GET' && request.url === '/printers') {
      sendJson(response, 200, { printers: await listPrinters() }, headers)
      return
    }
    if (request.method === 'POST' && request.url === '/print') {
      const payload = await readJson(request)
      if (typeof payload.printer !== 'string' || typeof payload.content !== 'string') {
        sendJson(response, 400, { error: 'printer and content are required' }, headers)
        return
      }
      await printDocument(payload.printer, payload.content, { ...payload.options, jobName: payload.jobName })
      sendJson(response, 200, { ok: true, jobName: payload.jobName || 'BhojPatra print job' }, headers)
      return
    }
    sendJson(response, 404, { error: 'Not found' }, headers)
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Print bridge error' }, headers)
  }
})

server.on('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`BhojPatra Print Bridge is already running on http://${host}:${port}`)
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', `http://${host}:${port}/health`], { windowsHide: true }, () => undefined)
    }
    setTimeout(() => process.exit(0), 5000)
    return
  }
  console.error(error)
  setTimeout(() => process.exit(1), 5000)
})

server.listen(port, host, () => {
  console.log(`BhojPatra Print Bridge listening on http://${host}:${port}`)
})
