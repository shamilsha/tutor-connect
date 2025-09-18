@echo off
echo Starting MyTutor in PRODUCTION mode (HTTPS)...
echo.

echo 1. Starting Backend (HTTPS mode)...
cd backend\tutor-connect
start "Backend Server" cmd /k "mvn spring-boot:run"
cd ..\..

echo 2. Starting Signaling Server (HTTPS mode)...
cd signaling-server
start "Signaling Server" cmd /k "set NODE_ENV=production && node server.js"
cd ..

echo 3. Starting Frontend (HTTPS mode)...
cd frontend
start "Frontend" cmd /k "start-https.bat"
cd ..

echo.
echo All services started in PRODUCTION mode!
echo.
echo Frontend: https://192.168.18.15:3000
echo Backend: https://192.168.18.15:8080
echo Signaling: wss://192.168.18.15:8081
echo.
echo For cross-machine access, use: https://192.168.18.15:3000
echo.
echo Make sure to install the SSL certificate on all machines first!
pause
