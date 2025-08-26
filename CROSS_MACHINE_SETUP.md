# Cross-Machine Connection Setup

## Overview
This document explains how to set up the tutoring application for cross-machine connections where multiple machines can connect to the same server.

## Current Configuration

### Server Configuration
- **Backend API**: Runs on port 8080 (HTTPS)
- **Signaling Server**: Runs on port 8081 (WSS)
- **Frontend**: Runs on port 3000 (HTTPS)

### Network Configuration
The application is configured to work with the following setup:
- Server machine IP: `192.168.18.15`
- Client machines can connect from any IP in the same network

## Configuration Files

### Frontend Configuration (`frontend/src/services/config.js`)
The frontend uses a centralized configuration that automatically detects the server hostname:

```javascript
// For localhost connections, uses server IP
// For direct IP connections, uses the same IP
const serverHostname = window.location.hostname === 'localhost' ? '192.168.18.15' : window.location.hostname;
```

### Environment Variables
You can override the server hostname using environment variables:
```bash
REACT_APP_SERVER_HOSTNAME=192.168.18.15
```

## Connection Flow

1. **Login**: Frontend connects to backend API (`owhttps://192.168.18.15:8080`)
2. **WebSocket**: After successful login, connects to signaling server (`wss://192.168.18.15:8081`)
3. **Peer Connection**: Uses WebRTC for direct peer-to-peer communication

## Troubleshooting

### Common Issues

1. **SSL Certificate Issues (`ERR_CERT_AUTHORITY_INVALID`)**
   - **Quick Fix**: Open `https://192.168.18.15:8080` in browser and accept the certificate
   - **Quick Fix**: Open `https://192.168.18.15:8081` in browser and accept the certificate
   - **Alternative**: Use HTTP instead of HTTPS for development (see Development Setup below)

2. **WebSocket Connection Fails**
   - Check if signaling server is running on port 8081
   - Verify SSL certificates are accessible
   - Check firewall settings

3. **Backend API Connection Fails**
   - Check if backend server is running on port 8080
   - Verify CORS configuration includes client IP
   - Check SSL certificate configuration

4. **Cross-Machine Connection Issues**
   - Ensure both machines are on the same network
   - Verify server IP is accessible from client machines
   - Check if any firewall is blocking connections

### Development Setup (HTTP instead of HTTPS)

For development, you can disable SSL to avoid certificate issues:

1. **Backend**: Set `server.ssl.enabled=false` in `application.properties`
2. **Signaling Server**: Use `ws://` instead of `wss://` in `server.js`
3. **Frontend**: Update config to use `http://` and `ws://` protocols

### Debug Information
The application logs detailed connection information:
- Server hostname being used
- Backend and signaling URLs
- WebSocket connection status
- Error details with connection parameters

## Testing Cross-Machine Connections

1. Start the server on the host machine
2. Access the application from a different machine using `https://192.168.18.15:3000`
3. Login should work from both machines
4. WebSocket connections should establish successfully
5. Peer-to-peer connections should work between machines

## Security Considerations

- SSL certificates are required for HTTPS/WSS connections
- CORS is configured to allow specific origins
- WebRTC connections are peer-to-peer and encrypted
- No sensitive data is stored on the signaling server

## Permanent HTTPS Setup

### Step 1: Generate Proper SSL Certificate
```bash
# Run this on the server machine:
create-proper-cert.bat
```

### Step 2: Install Certificate on All Machines
```bash
# Run this on EACH machine in your network:
install-certificate.bat
```

### Step 3: Start Services in Production Mode
```bash
# Run this on the server machine:
start-production.bat
```

### Benefits of This Setup:
- ✅ All connections use HTTPS/WSS (secure)
- ✅ Works from any machine in your network
- ✅ No browser warnings or certificate errors
- ✅ Professional-grade security
- ✅ Certificate valid for 1 year

### Certificate Management:
- **Location**: `certs/mytutor.crt` and `certs/mytutor.key`
- **Validity**: 1 year
- **Renewal**: Run `create-proper-cert.bat` again before expiration
- **Installation**: Run `install-certificate.bat` on new machines
