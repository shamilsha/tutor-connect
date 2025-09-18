@echo off
echo Creating proper SSL certificate for home network...
echo.

REM Create directory for certificates
if not exist "certs" mkdir certs
cd certs

REM Generate private key
echo Generating private key...
openssl genrsa -out mytutor.key 2048

REM Generate certificate signing request
echo Generating certificate signing request...
openssl req -new -key mytutor.key -out mytutor.csr -subj "/C=US/ST=State/L=City/O=MyTutor/OU=IT/CN=192.168.18.15"

REM Generate self-signed certificate (valid for 1 year)
echo Generating self-signed certificate...
openssl x509 -req -days 365 -in mytutor.csr -signkey mytutor.key -out mytutor.crt

REM Copy certificates to frontend directory
echo Copying certificates to frontend...
copy mytutor.crt ..\frontend\cert.crt
copy mytutor.key ..\frontend\cert.key

REM Copy certificates to backend
echo Copying certificates to backend...
copy mytutor.crt ..\backend\tutor-connect\src\main\resources\cert.crt
copy mytutor.key ..\backend\tutor-connect\src\main\resources\cert.key

echo.
echo Certificate created successfully!
echo.
echo Next steps:
echo 1. Install the certificate on all machines (see instructions below)
echo 2. Restart your servers
echo.
pause
