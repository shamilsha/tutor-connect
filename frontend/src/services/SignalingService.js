export class SignalingService {
    constructor() {
        this.userId = null;
        this.wsProvider = null;
        this.onPeerListUpdate = null;
        this.messageHandlers = new Map();
        this.isConnected = false;
        this.registeredPeers = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.onConnectionStatusChange = null;
        this.connectionMonitorInterval = null;
        this.nextHandlerId = 1;
        this.processedMessages = new Map();
        this.handlerId = 0;
        
        // Add beforeunload handler
        window.addEventListener('beforeunload', () => {
            this.sendLogout();
        });
    }

    // Add a message handler and return its ID
    addMessageHandler(handler) {
        const handlerId = ++this.handlerId;
        console.log(`[SignalingService] Adding message handler (ID: ${handlerId})`);
        
        this.messageHandlers.set(handlerId, handler);
        
        console.log(`[SignalingService] Signaling service registered with handler ID: ${handlerId}`);
        return handlerId;
    }

    // Remove a message handler by ID
    removeMessageHandler(id) {
        console.log(`[SignalingService] Removing message handler (ID: ${id})`);
        return this.messageHandlers.delete(id);
    }

    // Forward message to all handlers
    forwardMessage(message) {
        // Create a new array from the Map values to avoid modification during iteration
        const handlers = Array.from(this.messageHandlers.entries());
        const handlerCount = handlers.length;
        
        // Don't log for heartbeat messages
        if (message.type !== 'heartbeat') {
            console.log(`[SignalingService] 📨 Forwarding ${message.type} message to ${handlerCount} handler${handlerCount !== 1 ? 's' : ''}`);
        }

        // Create a unique message ID
        const messageId = `${message.type}-${message.from}-${message.to}-${Date.now()}`;
        let processedHandlers = this.processedMessages.get(messageId);
        
        if (!processedHandlers) {
            processedHandlers = new Set();
            this.processedMessages.set(messageId, processedHandlers);
        }

        for (const [handlerId, handler] of handlers) {
            try {
                // Check if this handler has already processed this message
                if (!processedHandlers.has(handlerId)) {
                    handler(message);
                    processedHandlers.add(handlerId);
                } else {
                    console.log(`[SignalingService] Handler ${handlerId} already processed message ${messageId}`);
                }
            } catch (error) {
                console.error('[SignalingService] ❌ Error in message handler:', error);
            }
        }

        // Cleanup old processed messages (older than 5 seconds)
        const now = Date.now();
        for (const [msgId] of this.processedMessages) {
            const msgTime = parseInt(msgId.split('-')[3]); // timestamp is the last part
            if (now - msgTime > 5000) {
                this.processedMessages.delete(msgId);
            }
        }
    }

    // Socket message handler
    handleSocketMessage(message) {
        try {
            switch (message.type) {
                case 'registered':
                    console.log('[SignalingService] ✅ Registration confirmed for:', message.userId);
                    this.registeredPeers.add(message.userId);
                    this.isConnected = true;
                    if (this.onConnectionStatusChange) {
                        this.onConnectionStatusChange(true);
                    }
                    break;
                    
                case 'peer_list':
                    const peers = message.peers.filter(peerId => peerId !== this.userId);
                    console.log('[SignalingService] 👥 Received peer list:', peers);
                    if (this.onPeerListUpdate) {
                        this.onPeerListUpdate(peers);
                    }
                    break;
                    
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    console.log(`[SignalingService] 📨 Received ${message.type} from peer ${message.from}`);
                    this.forwardMessage(message);
                    break;
                    
                default:
                    console.log('[SignalingService] 📨 Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[SignalingService] ❌ Error processing message:', error);
        }
    }

    async connect(credentials) {
        console.log('[SignalingService] Attempting to login');
        try {
            // First authenticate with the backend
            const response = await fetch('http://localhost:8080/api/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials)
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            this.userId = data.id.toString();
            
            console.log('[SignalingService] Login successful, userId:', this.userId);
            localStorage.setItem('user', JSON.stringify({
                id: data.id,
                email: data.email
            }));

            // After successful login, establish WebSocket connection
            await this.establishWebSocket();
            return true;
        } catch (error) {
            console.error('[SignalingService] Login error:', error);
            this.cleanup();
            throw error; // Re-throw to let UI handle the error
        }
    }

    async establishWebSocket() {
        // If already connected and registered, just return
        if (this.wsProvider?.isConnected && this.isConnected) {
            console.log('[SignalingService] Already connected and registered');
            return Promise.resolve(true);
        }

        console.log('[SignalingService] Establishing WebSocket connection');
        
        // Get or create WebSocketProvider instance
        const { WebSocketProvider } = await import('./WebSocketProvider');
        this.wsProvider = WebSocketProvider.getInstance(this.userId);

        return new Promise((resolve, reject) => {
            const registrationTimeout = setTimeout(() => {
                console.error('[SignalingService] Registration timeout');
                this.cleanup();
                reject(new Error('Registration timeout'));
            }, 5000);

            // Set up message handling for all message types
            this.wsProvider.subscribe('*', (message) => {
                this.handleSocketMessage(message);
            });

            // Set up specific handler for registration
            this.wsProvider.subscribe('registered', (message) => {
                console.log('[SignalingService] Registration confirmed:', message);
                clearTimeout(registrationTimeout);
                this.isConnected = true;
                if (this.onConnectionStatusChange) {
                    this.onConnectionStatusChange(true);
                }
                resolve(true);
            });

            // Connect and register
            this.wsProvider.connect()
                .then(() => {
                    console.log('[SignalingService] Connected to WebSocket server');
                    this.wsProvider.publish('register', {
                        type: 'register',
                        userId: this.userId
                    });
                })
                .catch(error => {
                    console.error('[SignalingService] Connection error:', error);
                    clearTimeout(registrationTimeout);
                    this.cleanup();
                    reject(error);
                });
        });
    }

    cleanup() {
        if (this.wsProvider) {
            this.wsProvider.disconnect();
        }
        this.userId = null;
        this.isConnected = false;
        localStorage.removeItem('user');
        this.registeredPeers.clear();
        this.messageHandlers.clear();
    }

    handleConnectionLoss() {
        this.isConnected = false;
        this.registeredPeers.clear();
        this.stopConnectionMonitoring();
        
        if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange(false);
        }
    }

    startConnectionMonitoring() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
        }

        this.connectionMonitorInterval = setInterval(() => {
            if (!this.wsProvider || !this.wsProvider.isConnected) {
                console.log('[SignalingService] 🔍 Connection monitor detected socket not ready');
                this.handleConnectionLoss();
            }
        }, 1000);
    }

    stopConnectionMonitoring() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
    }

    send(message) {
        if (!this.wsProvider || !this.wsProvider.isConnected) {
            console.error('[SignalingService] Cannot send message - not connected');
            return;
        }
        
        try {
            this.wsProvider.publish('signaling', message);
            console.log(`[SignalingService] Sending ${message.type} to peer ${message.to}`);
        } catch (error) {
            console.error('[SignalingService] Failed to send message:', error);
        }
    }

    sendLogout() {
        if (this.userId && this.wsProvider?.isConnected) {
            this.wsProvider.publish('signaling', {
                type: 'logout',
                userId: this.userId
            });
        }
    }

    getPrimaryHandler(messageType) {
        // Get all handlers for this message type
        const handlers = Array.from(this.messageHandlers.values())
            .filter(h => h.types.includes(messageType));
        
        // Return the most recently registered handler
        return handlers.length > 0 ? handlers[handlers.length - 1].callback : null;
    }

    disconnect() {
        console.log('[SignalingService] 🔌 Disconnecting');
        this.sendLogout();
        this.cleanup();
    }

    isSocketConnected() {
        return this.wsProvider?.isConnected;
    }

    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log(`[SignalingService] Received ${message.type} from peer ${message.from}`);
            
            // Forward to all handlers
            for (const handler of this.messageHandlers.values()) {
                handler(message);
            }
        } catch (error) {
            console.error('[SignalingService] Failed to handle message:', error);
        }
    }
}

export default SignalingService; 