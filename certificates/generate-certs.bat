@echo off
echo Generating SSL certificates...
npx mkcert create-ca
npx mkcert create-cert
echo Certificates generated successfully!
pause
