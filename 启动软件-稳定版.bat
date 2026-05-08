@echo off
cd /d "%~dp0"
title Linshu GPT Image Studio Stable Launcher

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

echo Starting local server...
netstat -ano | findstr ":5173" >nul
if errorlevel 1 (
  start "Linshu GPT Image Server" /D "%~dp0" /min cmd.exe /c "node.exe server.mjs >> server.log 2>&1"
) else (
  echo Local server is already running.
)

echo Waiting for server at %APP_URL% ...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo.
echo Failed to start server.
echo Please send Codex this log:
echo %cd%\server.log
echo.
if exist server.log type server.log
pause
exit /b 1

:ready
echo Server is ready.
echo Opening default browser...
start "" "%APP_URL%"
echo.
echo If the browser does not open, manually visit:
echo %APP_URL%
echo.
echo Keep using the website in the browser. You can close this window.
echo To stop the server later, double-click stop-web.cmd.
pause
