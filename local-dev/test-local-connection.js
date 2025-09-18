// Simple test script to verify server connectivity
const https = require('https');
const WebSocket = require('ws');

const SERVER_HOSTNAME = '192.168.18.15';
const BACKEND_PORT = 8080;
const SIGNALING_PORT = 8081;

// Test backend API connection
function testBackendConnection() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SERVER_HOSTNAME,
            port: BACKEND_PORT,
            path: '/api/users/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            rejectUnauthorized: false // For self-signed certificates
        };

        const req = https.request(options, (res) => {
            console.log(`✅ Backend API connection successful: ${res.statusCode}`);
            resolve();
        });

        req.on('error', (error) => {
            console.error(`❌ Backend API connection failed:`, error.message);
            reject(error);
        });

        req.write(JSON.stringify({ email: 'test@test.com', password: 'test' }));
        req.end();
    });
}

// Test WebSocket connection
function testWebSocketConnection() {
    return new Promise((resolve, reject) => {
        const wsUrl = `wss://${SERVER_HOSTNAME}:${SIGNALING_PORT}`;
        console.log(`Testing WebSocket connection to: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl, {
            rejectUnauthorized: false // For self-signed certificates
        });

        ws.on('open', () => {
            console.log('✅ WebSocket connection successful');
            ws.close();
            resolve();
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket connection failed:', error.message);
            reject(error);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.terminate();
                reject(new Error('WebSocket connection timeout'));
            }
        }, 5000);
    });
}

// Run tests
async function runTests() {
    console.log('🔍 Testing server connectivity...\n');
    
    try {
        await testBackendConnection();
        await testWebSocketConnection();
        console.log('\n✅ All connection tests passed!');
    } catch (error) {
        console.error('\n❌ Connection test failed:', error.message);
        process.exit(1);
    }
}

runTests();
