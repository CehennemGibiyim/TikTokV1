@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>&1 || (echo Node.js 20 veya uzeri gerekli: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (call npm install --omit=dev || (pause & exit /b 1))
start "" http://127.0.0.1:8800
node src\server.js
pause
