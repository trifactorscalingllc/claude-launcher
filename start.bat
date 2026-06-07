@echo off
rem Launch Claude Launcher. NODE_OPTIONS is cleared because Electron
rem rejects flags like --use-system-ca that may be inherited.
set "NODE_OPTIONS="
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
