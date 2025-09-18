@echo off
echo Copying certificates to target folder and rebuilding backend...
echo.

REM Copy certificates to target folder
echo Copying certificates to target/classes...
copy "backend\tutor-connect\src\main\resources\cert.crt" "backend\tutor-connect\target\classes\cert.crt"
copy "backend\tutor-connect\src\main\resources\cert.key" "backend\tutor-connect\target\classes\cert.key"

REM Rebuild the backend
echo Rebuilding backend...
cd backend\tutor-connect
mvn clean compile
cd ..\..

echo.
echo Certificates copied and backend rebuilt!
echo.
pause
