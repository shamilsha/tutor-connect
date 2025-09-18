const fs = require('fs');
const path = require('path');

// Read the existing certificates
const certPath = path.join(__dirname, 'cert.crt');
const keyPath = path.join(__dirname, 'cert.key');

// Create a simple keystore file for Java
// This is a basic PKCS12 keystore structure
const keystoreData = {
    cert: fs.readFileSync(certPath, 'utf8'),
    key: fs.readFileSync(keyPath, 'utf8')
};

// For now, let's copy the certificates to the backend resources directory
const backendResourcesDir = path.join(__dirname, '../backend/tutor-connect/src/main/resources');

// Copy certificate files
fs.copyFileSync(certPath, path.join(backendResourcesDir, 'cert.crt'));
fs.copyFileSync(keyPath, path.join(backendResourcesDir, 'cert.key'));

console.log('Certificates copied to backend resources directory');
console.log('Note: You may need to manually create keystore.p12 using a Java tool');
