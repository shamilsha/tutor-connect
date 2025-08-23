@echo off
echo Starting MyTutor in HTTP mode for cross-machine access...
echo.

echo 1. Starting Backend (HTTP mode)...
cd backend\tutor-connect
start "Backend Server" cmd /k "mvn spring-boot:run -Dspring-boot.run.profiles=dev"
cd ..\..

echo 2. Starting Signaling Server (HTTP mode)...
cd signaling-server
start "Signaling Server" cmd /k "set NODE_ENV=development && node server.js"
cd ..

echo 3. Starting Frontend (HTTP mode - accessible from network)...
cd frontend
start "Frontend" cmd /k "set HOST=0.0.0.0&& npm start"
cd ..

echo.
echo All services started in HTTP mode for cross-machine access!
echo.
echo Frontend: http://192.168.18.15:3000
echo Backend: http://192.168.18.15:8080
echo Signaling: ws://192.168.18.15:8081
echo.
echo Access from second machine: http://192.168.18.15:3000
pause
