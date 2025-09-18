@echo off
echo Cleaning up existing certificates...
echo.

REM Remove existing certificate files
if exist "certs\mytutor.crt" del "certs\mytutor.crt"
if exist "certs\mytutor.key" del "certs\mytutor.key"
if exist "frontend\cert.crt" del "frontend\cert.crt"
if exist "frontend\cert.key" del "frontend\cert.key"
if exist "backend\tutor-connect\src\main\resources\cert.crt" del "backend\tutor-connect\src\main\resources\cert.crt"
if exist "backend\tutor-connect\src\main\resources\cert.key" del "backend\tutor-connect\src\main\resources\cert.key"

echo Certificate files cleaned up.
echo.
pause
