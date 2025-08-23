@echo off
echo Stopping all MyTutor services...
echo.

echo Stopping Java processes (Backend)...
taskkill /f /im java.exe 2>nul
if errorlevel 1 (
    echo No Java processes found.
) else (
    echo Java processes stopped.
)

echo Stopping Node.js processes (Signaling Server, Frontend)...
taskkill /f /im node.exe 2>nul
if errorlevel 1 (
    echo No Node.js processes found.
) else (
    echo Node.js processes stopped.
)

echo Stopping npm processes (Frontend)...
taskkill /f /im npm.cmd 2>nul
if errorlevel 1 (
    echo No npm processes found.
) else (
    echo npm processes stopped.
)

echo.
echo All services stopped!
echo.
pause
