@echo off
cd /d "%~dp0"

title Linshu GPT Image Studio

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js 20 or newer:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

set "APP_URL=http://127.0.0.1:5173"
set "EDGE_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"

echo Starting Linshu GPT Image Studio...
echo.

netstat -ano | findstr ":5173" >nul
if errorlevel 1 (
  echo Starting local server...
  start "Linshu GPT Image Server" /D "%~dp0" /min cmd.exe /c "node.exe server.mjs >> server.log 2>&1"
) else (
  echo Local server is already running.
)

echo Waiting for server...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto open_app
  timeout /t 1 /nobreak >nul
)

echo.
echo Failed: local server was not ready within 30 seconds.
echo Please send Codex this log file:
echo %cd%\server.log
echo.
if exist server.log type server.log
pause
exit /b 1

:open_app
echo Server is ready. Opening app window...
echo URL: %APP_URL%
echo.

if exist "%EDGE_EXE%" (
  start "" "%EDGE_EXE%" --new-window --app="%APP_URL%"
  goto done
)

if exist "%CHROME_EXE%" (
  start "" "%CHROME_EXE%" --new-window --app="%APP_URL%"
  goto done
)

start "" "%APP_URL%"

:done
echo If no window appears, open this URL manually:
echo %APP_URL%
echo.
echo You can close this window. The local server keeps running in the background.
echo To stop it later, double-click stop-web.cmd.
pause
