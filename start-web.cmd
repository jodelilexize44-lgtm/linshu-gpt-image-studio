@echo off
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js 20 or newer, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo Starting Linshu GPT Image Studio...
echo.
echo Website address: http://127.0.0.1:5173
echo Log file: server.log
echo.

netstat -ano | findstr ":5173" >nul
if errorlevel 1 (
  start "Linshu GPT Image Server" /D "%~dp0" /min cmd.exe /c "node.exe server.mjs >> server.log 2>&1"
) else (
  echo Port 5173 is already in use. Trying to open the website directly.
)

echo Waiting for the local server...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo.
echo Server did not start within 30 seconds.
echo Please send Codex the content of this file:
echo %cd%\server.log
echo.
type server.log
pause
exit /b 1

:ready
echo Server is ready. Opening browser...
start "" "http://127.0.0.1:5173"
echo.
echo You can close this window. To stop the server later, double-click stop-web.cmd.
pause
