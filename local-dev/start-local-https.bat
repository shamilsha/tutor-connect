@echo off
echo Starting Frontend with HTTPS...
set HTTPS=true
set SSL_CRT_FILE=cert.crt
set SSL_KEY_FILE=cert.key
set HOST=192.168.18.15
npm start
