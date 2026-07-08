!define APP_NAME "BhojPatra"
!define APP_VERSION "1.0.2"
!define COMPANY_NAME "BhojPatra"
!define INSTALL_DIR "$LOCALAPPDATA\BhojPatra"

Unicode True
Name "${APP_NAME}"
OutFile "..\release\bhojpatra-setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel user
Icon "..\release\assets\bhojpatra.ico"
UninstallIcon "..\release\assets\bhojpatra.ico"

VIProductVersion "1.0.2.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${COMPANY_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  InitPluginsDir
  File /oname=$PLUGINSDIR\Stop-BhojPatra.ps1 "..\release\Stop-BhojPatra.ps1"
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\Stop-BhojPatra.ps1"'
  SetOutPath "$INSTDIR"
  Delete "$INSTDIR\bhojpatra.exe"
  File "..\release\bhojpatra.exe"
  File "..\release\Register-BhojPatra.ps1"
  File "..\release\Unregister-BhojPatra.ps1"
  File "..\release\Stop-BhojPatra.ps1"
  File "..\release\README-BhojPatra-Print-Bridge.txt"

  WriteUninstaller "$INSTDIR\Uninstall BhojPatra.exe"
  CreateDirectory "$SMPROGRAMS\BhojPatra"
  CreateShortcut "$SMPROGRAMS\BhojPatra\BhojPatra.lnk" "$INSTDIR\bhojpatra.exe" "" "$INSTDIR\bhojpatra.exe" 0
  CreateShortcut "$SMPROGRAMS\BhojPatra\Uninstall BhojPatra.lnk" "$INSTDIR\Uninstall BhojPatra.exe"
  CreateShortcut "$SMPROGRAMS\BhojPatra\Bridge Health Check.lnk" "http://127.0.0.1:8181/health"

  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Register-BhojPatra.ps1"'
SectionEnd

Section "Uninstall"
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Unregister-BhojPatra.ps1"'
  Delete "$SMPROGRAMS\BhojPatra\BhojPatra.lnk"
  Delete "$SMPROGRAMS\BhojPatra\Uninstall BhojPatra.lnk"
  Delete "$SMPROGRAMS\BhojPatra\Bridge Health Check.lnk"
  RMDir "$SMPROGRAMS\BhojPatra"
  Delete "$INSTDIR\bhojpatra.exe"
  Delete "$INSTDIR\Register-BhojPatra.ps1"
  Delete "$INSTDIR\Unregister-BhojPatra.ps1"
  Delete "$INSTDIR\Stop-BhojPatra.ps1"
  Delete "$INSTDIR\README-BhojPatra-Print-Bridge.txt"
  Delete "$INSTDIR\Uninstall BhojPatra.exe"
  RMDir "$INSTDIR"
SectionEnd
