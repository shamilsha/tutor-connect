@echo off
echo Starting MyTutor in DEVELOPMENT mode...
echo.

echo 1. Starting Backend (HTTP mode)...
cd backend\tutor-connect
start "Backend Server" cmd /k "mvn spring-boot:run -Dspring-boot.run.profiles=dev"
cd ..\..

echo 2. Starting Signaling Server (HTTP mode)...
cd signaling-server
start "Signaling Server" cmd /k "set NODE_ENV=development && node server.js"
cd ..

echo 3. Starting Frontend...
cd frontend
start "Frontend" cmd /k "npm start"
cd ..

echo.
echo All services started in development mode!
echo.
echo Frontend: http://localhost:3000
echo Backend: http://192.168.18.15:8080
echo Signaling: ws://192.168.18.15:8081
echo.
echo For cross-machine access, use: http://192.168.18.15:3000
pause
