@echo off
echo Installing MyTutor SSL certificate on this machine...
echo.

REM Check if certificate exists
if not exist "certs\mytutor.crt" (
    echo Error: Certificate not found!
    echo Please run create-proper-cert.bat first.
    pause
    exit /b 1
)

REM Install certificate to Trusted Root Certification Authorities
echo Installing certificate to Trusted Root Certification Authorities...
certutil -addstore -f "ROOT" certs\mytutor.crt

REM Install certificate to Personal store (for current user)
echo Installing certificate to Personal store...
certutil -addstore -f "MY" certs\mytutor.crt

echo.
echo Certificate installed successfully!
echo.
echo You can now access:
echo - Frontend: https://192.168.18.15:3000
echo - Backend: https://192.168.18.15:8080
echo - Signaling: wss://192.168.18.15:8081
echo.
echo Note: You may need to restart your browser for changes to take effect.
pause

