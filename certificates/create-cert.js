const crypto = require('crypto');
const fs = require('fs');

// Generate private key
const privateKey = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});

// Create certificate
const cert = crypto.createCertificate();
cert.setPublicKey(privateKey.publicKey);
cert.sign(privateKey.privateKey, 'sha256');

// Write files
fs.writeFileSync('cert.key', privateKey.privateKey);
fs.writeFileSync('cert.crt', cert.export({ type: 'spki', format: 'pem' }));

console.log('Certificates created successfully!');
console.log('cert.key - Private key');
console.log('cert.crt - Certificate');
