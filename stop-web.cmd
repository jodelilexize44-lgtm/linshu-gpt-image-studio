@echo off
echo Stopping Linshu GPT Image Studio on port 5173...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173"') do (
  taskkill /pid %%p /f >nul 2>nul
)

echo Done.
pause
