@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。请先安装 Node.js 20 或更高版本。
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)

start "" "http://localhost:5173"
echo 林叔的GPT绘图平台正在启动...
echo 如果浏览器打开太快，请等 2 秒后刷新页面。
echo 服务地址：http://localhost:5173
echo.
node server.mjs

echo.
echo 服务已停止。如果上面有报错，请把报错内容发给我。
pause
