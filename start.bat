@echo off
title TimeFlow Launcher
echo.
echo  =================================================
echo            TimeFlow App Launcher
echo  =================================================
echo.

echo [1/3] Clearing old processes...
powershell -Command "Get-NetTCPConnection -LocalPort 3456,4567 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host 'Done'"
timeout /t 1 /nobreak >nul

echo.
echo [2/3] Starting Backend (port 3456)...
start "TimeFlow Backend" /min cmd /c "cd /d %~dp0backend && npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend (port 4567)...
start "TimeFlow Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"

echo.
echo  -------------------------------------------------
echo   TimeFlow is starting!
echo   
echo   Frontend: http://localhost:4567
echo   Backend:  http://localhost:3456
echo  -------------------------------------------------
echo.
echo  Press any key to close this launcher
echo  (servers will keep running in background)
pause >nul