@echo off
echo ================================================
echo   LinkLoop Lite - Starting App
echo ================================================
echo.
cd /d "%~dp0"
echo Installing dependencies...
call npx expo install
echo.
echo Starting Expo...
call npx expo start
pause
