@echo off
echo ================================================
echo   LinkLoop Lite Server - Starting
echo ================================================
echo.
cd /d "%~dp0"
echo Installing dependencies...
call npm install
echo.
echo Starting server...
call npm run dev
pause
