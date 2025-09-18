@echo off
echo Building and serving Frontend with HTTPS...
npm run build
npx serve -s build -l 3000 --ssl-cert cert.crt --ssl-key cert.key
