export class SignalingService {
    constructor(userId) {
        this.userId = userId.toString();
        this.socket = null;
        this.onPeerListUpdate = null;
        this.onMessage = null;
        
        // Add beforeunload handler
        window.addEventListener('beforeunload', () => {
            this.sendLogout();
        });
        
        this.connect();
    }

    sendLogout() {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'logout',
                userId: this.userId
            }));
        }
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:8080');

        this.socket.onopen = () => {
            console.log('[Signaling] Connected to server');
            this.socket.send(JSON.stringify({
                type: 'register',
                userId: this.userId
            }));
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('[Signaling] Received message:', message.type);
                
                if (message.type === 'peer_list' && this.onPeerListUpdate) {
                    const peers = message.peers.filter(peerId => peerId !== this.userId);
                    console.log('[Signaling] Filtered peers:', peers);
                    this.onPeerListUpdate(peers);
                }

                if (this.onMessage) {
                    this.onMessage(message);
                }
            } catch (error) {
                console.error('[Signaling] Error processing message:', error);
            }
        };

        this.socket.onerror = (error) => {
            console.error('[Signaling] WebSocket error:', error);
        };
    }

    send(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.error('[Signaling] Cannot send message, socket not ready');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

export default SignalingService; 