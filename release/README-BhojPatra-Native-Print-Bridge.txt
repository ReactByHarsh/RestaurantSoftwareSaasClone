BhojPatra Native Print Bridge
=============================

What this is
------------
This is the newer Windows-native print bridge. It does not use Node.js or PowerShell
for printing. It exposes the same local bridge URL used by the website:

  http://127.0.0.1:8181

Use this bridge for Windows-installed USB printers, Bluetooth printers, and LAN
ESC/POS printers.

Install
-------
1. Close the old BhojPatra bridge if it is running.
2. Double-click:
   Install-BhojPatra-Native-Print-Bridge.bat
3. Open:
   http://127.0.0.1:8181/health
4. Confirm the version says:
   2.0.0-native

Website setup
-------------
1. Open BhojPatra Cloud.
2. Go to Settings > Printing & Receipt.
3. Choose USB / LAN / Bluetooth.
4. Keep Bridge URL:
   http://127.0.0.1:8181
5. Click Detect Printers.
6. Select the Windows queue, for example:
   POS80 Printer
7. Click Test Print.
8. Save Printer Settings.

LAN printer setup
-----------------
For Ethernet/Wi-Fi thermal printers, use a static printer IP and enter:

  tcp://192.168.1.50:9100

Diagnostics
-----------
Open this on the client PC:

  http://127.0.0.1:8181/diagnostics

It shows bridge version, Windows info, spooler status, printer list, last error,
and the local log file path.

Important
---------
Do not use Chrome Direct USB for Windows-installed POS80 printers. Chrome often
cannot claim a printer that Windows already owns. Use this Native Print Bridge
with the Windows printer queue instead.
