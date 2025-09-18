@echo off
echo Starting MyTutor in HTTP mode (working state)...
echo.

echo 1. Starting Backend (HTTP mode)...
cd backend\tutor-connect
start "Backend Server" cmd /k "mvn spring-boot:run -Dspring-boot.run.profiles=dev"
cd ..\..

echo 2. Starting Signaling Server (HTTP mode)...
cd signaling-server
start "Signaling Server" cmd /k "set NODE_ENV=development && node server.js"
cd ..

echo 3. Starting Frontend (HTTP mode)...
cd frontend
start "Frontend" cmd /k "npm start"
cd ..

echo.
echo All services started in HTTP mode!
echo.
echo Frontend: http://localhost:3000
echo Backend: http://localhost:8080
echo Signaling: ws://localhost:8081
echo.
echo Test local connections first.
pause

