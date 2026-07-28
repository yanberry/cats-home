@echo off
title Safe House Server

echo.
echo Starting Safe House server...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)

REM Switch to script directory so data.json path is correct
cd /d "%~dp0"

REM Start server in background, redirect output to log file
start /b node server.js > server.log 2>&1

REM Wait a few seconds for the server to start
ping 127.0.0.1 -n 3 >nul

REM Open browser
echo Opening http://localhost:3000 ...
start http://localhost:3000

echo.
echo Server is running in the background.
echo Minimize this window. Closing it will stop the server.
echo.
echo To auto-start on Windows login, create a shortcut of this file in:
echo %%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Startup
pause
