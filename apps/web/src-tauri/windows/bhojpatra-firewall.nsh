!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BhojPatra Desk LAN TCP 3000"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="BhojPatra Desk LAN TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=private,domain description="BhojPatra Desk LAN realtime API"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BhojPatra Desk LAN Discovery UDP 3001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="BhojPatra Desk LAN Discovery UDP 3001" dir=in action=allow protocol=UDP localport=3001 profile=private,domain description="BhojPatra Desk mobile discovery"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BhojPatra Desk LAN TCP 3000"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="BhojPatra Desk LAN Discovery UDP 3001"'
!macroend
