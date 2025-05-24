const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

const clients = new Map();

function broadcastPeerList() {
    console.log('\n[Broadcast] Sending peer list to all clients');
    const peerList = Array.from(clients.keys());
    console.log('[Broadcast] Current peers:', peerList);
    
    let activeClients = 0;
    clients.forEach((ws, clientId) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                const message = JSON.stringify({
                    type: 'peer_list',
                    peers: peerList
                });
                ws.send(message);
                activeClients++;
                console.log(`[Broadcast] Sent peer list to client ${clientId}`);
            } catch (error) {
                console.error(`[Broadcast] Failed to send to client ${clientId}:`, error);
            }
        } else {
            console.log(`[Broadcast] Client ${clientId} WebSocket not open, state:`, ws.readyState);
        }
    });
    console.log(`[Broadcast] Successfully sent to ${activeClients} clients`);
}

wss.on('connection', (ws) => {
    let clientId = null;
    ws.isAlive = true;

    console.log('\n[New Connection] Client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.userId) data.userId = data.userId.toString();
            if (data.from) data.from = data.from.toString();
            if (data.target) data.target = data.target.toString();

            // Don't log ICE candidates to reduce noise
            if (data.type !== 'ice-candidate') {
                console.log('\n[Message Received]', {
                    type: data.type,
                    from: data.from,
                    to: data.target,
                    timestamp: new Date().toISOString()
                });
            }
            
            switch(data.type) {
                case 'register':
                    clientId = data.userId.toString();
                    // Check if client already exists and is active
                    const existingClient = clients.get(clientId);
                    if (existingClient && existingClient.readyState === WebSocket.OPEN) {
                        console.log(`[Warning] Client ${clientId} already registered and active`);
                        ws.close();
                        return;
                    }
                    
                    clients.set(clientId, ws);
                    console.log(`\n[Register] Client ${clientId} registered`);
                    console.log('[Active Clients]:', Array.from(clients.keys()));
                    
                    // Send registration confirmation
                    ws.send(JSON.stringify({
                        type: 'registered',
                        userId: clientId
                    }));
                    console.log(`[Register] Sent registration confirmation to client ${clientId}`);

                    // Broadcast updated peer list to all clients
                    console.log('[Register] Broadcasting updated peer list...');
                    setTimeout(() => {
                        console.log('[Register] Executing delayed broadcast...');
                        broadcastPeerList();
                    }, 100);
                    break;

                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    const targetClient = clients.get(data.target);
                    if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                        // Only log non-ICE messages to reduce noise
                        if (data.type !== 'ice-candidate') {
                            console.log(`[Forwarding] ${data.type} from ${data.from} to ${data.target}`);
                        }
                        targetClient.send(JSON.stringify({
                            type: data.type,
                            from: data.from,
                            data: data.data
                        }));
                    } else {
                        console.log(`[Error] Target client ${data.target} not found or not connected`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `Peer ${data.target} is not online`
                        }));
                    }
                    break;

                case 'logout':
                    if (clients.has(data.userId)) {
                        clients.delete(data.userId);
                        console.log(`\n[Logout] Client ${data.userId} logged out`);
                        console.log('[Remaining Clients]:', Array.from(clients.keys()));
                        setTimeout(() => broadcastPeerList(), 100);
                    }
                    break;
            }
        } catch (error) {
            console.error('[Error] Processing message:', error);
        }
    });

    ws.on('close', () => {
        // Only handle disconnection if this is the current active connection for the client
        if (clientId && clients.get(clientId) === ws) {
            const wsState = ws.readyState;
            // Only log and remove if it's a real disconnection
            if (wsState === WebSocket.CLOSED || wsState === WebSocket.CLOSING) {
                clients.delete(clientId);
                console.log(`\n[Disconnected] Client ${clientId} disconnected (state: ${wsState})`);
                console.log('[Remaining Clients]:', Array.from(clients.keys()));
                setTimeout(() => broadcastPeerList(), 100);
            }
        }
    });

    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// Add heartbeat to keep connections alive
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('[Heartbeat] Terminating inactive connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

console.log('Signaling server running on port 8081'); 