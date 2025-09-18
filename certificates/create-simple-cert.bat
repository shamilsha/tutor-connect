@echo off
echo Creating SSL certificates for MyTutor...
echo.

REM Create directories
if not exist "certs" mkdir certs
if not exist "frontend" mkdir frontend
if not exist "backend\tutor-connect\src\main\resources" mkdir "backend\tutor-connect\src\main\resources"

REM Try to find OpenSSL
set OPENSSL_CMD=
if exist "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" (
    set OPENSSL_CMD="C:\Program Files\OpenSSL-Win64\bin\openssl.exe"
    echo Found OpenSSL at: C:\Program Files\OpenSSL-Win64\bin\openssl.exe
) else if exist "C:\OpenSSL-Win64\bin\openssl.exe" (
    set OPENSSL_CMD="C:\OpenSSL-Win64\bin\openssl.exe"
    echo Found OpenSSL at: C:\OpenSSL-Win64\bin\openssl.exe
) else if exist "C:\Program Files (x86)\OpenSSL-Win64\bin\openssl.exe" (
    set OPENSSL_CMD="C:\Program Files (x86)\OpenSSL-Win64\bin\openssl.exe"
    echo Found OpenSSL at: C:\Program Files (x86)\OpenSSL-Win64\bin\openssl.exe
) else (
    echo ERROR: OpenSSL not found!
    echo Please install OpenSSL or add it to your PATH
    echo Download from: https://slproweb.com/products/Win32OpenSSL.html
    pause
    exit /b 1
)

REM Generate certificates using OpenSSL
echo Generating certificates...
%OPENSSL_CMD% req -new -x509 -newkey rsa:2048 -keyout certs\mytutor.key -out certs\mytutor.crt -days 365 -subj "/C=US/ST=State/L=City/O=MyTutor/OU=IT/CN=192.168.18.15" -nodes

if errorlevel 1 (
    echo ERROR: Failed to generate certificates!
    pause
    exit /b 1
)

REM Copy certificates to all locations
echo Copying certificates...
copy certs\mytutor.crt frontend\cert.crt
copy certs\mytutor.key frontend\cert.key
copy certs\mytutor.crt backend\tutor-connect\src\main\resources\cert.crt
copy certs\mytutor.key backend\tutor-connect\src\main\resources\cert.key

echo.
echo Certificates created and copied successfully!
echo.
pause
