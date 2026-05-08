@echo off
cd /d "%~dp0"
node.exe server.mjs >> server.log 2>&1
