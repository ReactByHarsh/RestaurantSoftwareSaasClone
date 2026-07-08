BhojPatra for Windows
=====================

What this is
------------
This local helper app lets the BhojPatra Cloud website print directly to Windows, USB,
Bluetooth, and LAN/Ethernet ESC/POS thermal printers.

Install
-------
1. Extract this folder.
2. Double-click Install-BhojPatra-Print-Bridge.bat.
3. Allow Windows if it asks for permission.
4. Keep the website setting Bridge URL as:
   http://127.0.0.1:8181

Website setup
-------------
1. Open BhojPatra Cloud.
2. Go to Settings > Printing & Receipt.
3. Select USB / LAN / Bluetooth.
4. Bridge URL: http://127.0.0.1:8181
5. Click Detect Printers.
6. Select POS80 Printer / foodkart / EPSON queue, or enter LAN target:
   tcp://192.168.1.170:9100
7. Click Test Print.
8. Save Printer Settings.

Printer types
-------------
USB printer: install it in Windows first, then select its queue name.
Bluetooth printer: pair/install it in Windows first, then select its queue name.
LAN printer: use the Windows queue if installed, or use tcp://PRINTER-IP:9100.

Troubleshooting
---------------
Health check:
http://127.0.0.1:8181/health

Printer list:
http://127.0.0.1:8181/printers

If LAN printing fails, check printer IP, same Wi-Fi/LAN, and raw port 9100.
