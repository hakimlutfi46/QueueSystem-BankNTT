; NSIS hooks for the "Ticket + Server" installer (scripts/build-and-copy.mjs --with-server).
; The queue server ships in $INSTDIR\resources\server and runs as Windows services
; (BankNTT-PostgreSQL, BankNTT-Server). Data lives in C:\ProgramData\BankNTT and is never removed here.
; The scripts relaunch themselves in 64-bit PowerShell when started from this 32-bit stub.

!define BANKNTT_PS '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File'

!macro customInit
  ; Services from an earlier install keep files in resources\server locked; stop them before
  ; anything is replaced. Fails harmlessly when they do not exist.
  nsExec::Exec 'net stop BankNTT-Server'
  Pop $0
  nsExec::Exec 'net stop BankNTT-PostgreSQL'
  Pop $0
!macroend

!macro customInstall
  DetailPrint "Memasang server antrian (PostgreSQL dan layanan Windows)..."
  nsExec::ExecToLog '${BANKNTT_PS} "$INSTDIR\resources\server\install-server.ps1"'
  Pop $0
  ${if} $0 != 0
    DetailPrint "Server antrian gagal dipasang (kode $0)."
    ${ifNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Server antrian gagal dipasang (kode $0).$\r$\n$\r$\nRincian: C:\ProgramData\BankNTT\logs\install.log$\r$\n$\r$\nAplikasi kiosk tetap terpasang. Jalankan installer ini lagi setelah masalahnya diperbaiki."
    ${endIf}
  ${endIf}
!macroend

!macro customUnInstall
  ${if} ${isUpdated}
    ; An update only replaces program files: stop the services, keep their registration and data.
    nsExec::ExecToLog '${BANKNTT_PS} "$INSTDIR\resources\server\stop-server.ps1"'
    Pop $0
  ${else}
    ; Removes services, firewall rules and the backup task. Data in C:\ProgramData\BankNTT stays.
    nsExec::ExecToLog '${BANKNTT_PS} "$INSTDIR\resources\server\uninstall-server.ps1"'
    Pop $0
  ${endIf}
!macroend
