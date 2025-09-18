#!/bin/bash
echo "Creating proper SSL certificate for home network..."
echo

# Create directory for certificates
mkdir -p certs
cd certs

# Generate private key
echo "Generating private key..."
openssl genrsa -out mytutor.key 2048

# Generate self-signed certificate (fixed subject format)
echo "Generating self-signed certificate..."
openssl req -new -x509 -key mytutor.key -out mytutor.crt -days 365 -subj "//C=US\ST=State\L=City\O=MyTutor\OU=IT\CN=192.168.18.15"

# Check if certificate was created successfully
if [ ! -f "mytutor.crt" ]; then
    echo "ERROR: Certificate creation failed!"
    exit 1
fi

echo "Certificate created successfully!"

# Copy certificates to frontend directory
echo "Copying certificates to frontend..."
cp mytutor.crt ../frontend/cert.crt
cp mytutor.key ../frontend/cert.key

# Copy certificates to backend
echo "Copying certificates to backend..."
cp mytutor.crt ../backend/tutor-connect/src/main/resources/cert.crt
cp mytutor.key ../backend/tutor-connect/src/main/resources/cert.key

echo
echo "Certificate created and copied successfully!"
echo
echo "Files created:"
echo "- certs/mytutor.crt"
echo "- certs/mytutor.key"
echo "- frontend/cert.crt"
echo "- frontend/cert.key"
echo "- backend/tutor-connect/src/main/resources/cert.crt"
echo "- backend/tutor-connect/src/main/resources/cert.key"
echo
echo "Next steps:"
echo "1. Install the certificate on all machines (run install-certificate.bat)"
echo "2. Restart your servers"
echo
read -p "Press Enter to continue..."
