export class SignalingService {
    constructor() {
        this.userId = null;
        this.wsProvider = null;
        this.onPeerListUpdate = null;
        this.onIncomingConnection = null; // Callback for incoming connection attempts
        this.onDisconnectMessage = null; // Callback for disconnect messages
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
        this.lastMessageTime = Date.now();
        
        // Add beforeunload handler
        window.addEventListener('beforeunload', () => {
            this.sendLogout();
        });
    }

    // Add a message handler and return its ID
    addMessageHandler(handler) {
        const handlerId = ++this.handlerId;
        console.log(`[SignalingService] Adding message handler (ID: ${handlerId}) - Total handlers: ${this.messageHandlers.size + 1}`);
        
        this.messageHandlers.set(handlerId, handler);
        
        console.log(`[SignalingService] Signaling service registered with handler ID: ${handlerId} - Total handlers: ${this.messageHandlers.size}`);
        return handlerId;
    }

    // Remove a message handler by ID
    removeMessageHandler(id) {
        console.log(`[SignalingService] Removing message handler (ID: ${id}) - Total handlers before removal: ${this.messageHandlers.size}`);
        const removed = this.messageHandlers.delete(id);
        console.log(`[SignalingService] Message handler removal result: ${removed} - Total handlers after removal: ${this.messageHandlers.size}`);
        return removed;
    }

    // Forward message to all handlers
    async forwardMessage(message) {
        // Update last message time for cleanup tracking
        this.lastMessageTime = Date.now();
        
        // Create a new array from the Map values to avoid modification during iteration
        const handlers = Array.from(this.messageHandlers.entries());
        const handlerCount = handlers.length;
        
        // Don't log for heartbeat messages
        if (message.type !== 'heartbeat') {
            console.log(`[SignalingService] 📨 Forwarding ${message.type} message to ${handlerCount} handler${handlerCount !== 1 ? 's' : ''}`);
        }
        
        // If no handlers, don't process the message
        if (handlerCount === 0) {
            console.log(`[SignalingService] ⚠️ No message handlers registered for ${message.type} message`);
            return;
        }

        // For signaling messages, we want to ensure all handlers receive them
        const isSignalingMessage = ['offer', 'answer', 'ice-candidate', 'initiate', 'initiate-ack', 'disconnect', 'media-state'].includes(message.type);
        
        // Create a unique message ID
        // For offers and answers, include SDP hash to allow renegotiation
        // For other signaling messages, use basic format
        let messageId;
        if (message.type === 'offer' || message.type === 'answer') {
            // For renegotiation offers/answers, include timestamp to ensure uniqueness
            // This prevents legitimate renegotiation offers from being treated as duplicates
            const sdpHash = message.sdp ? btoa(message.sdp).substring(0, 8) : Date.now();
            const timestamp = Date.now();
            messageId = `${message.type}-${message.from}-${message.to}-${sdpHash}-${timestamp}`;
            console.log(`[SignalingService] 🔍 Generated message ID for ${message.type}: ${messageId} (SDP hash: ${sdpHash}, timestamp: ${timestamp})`);
        } else if (message.type === 'media-state') {
            // For media-state messages, include the state content to allow different states
            console.log(`[SignalingService] 🔍 RAW media-state message:`, message);
            console.log(`[SignalingService] 🔍 message.mediaState:`, message.mediaState);
            console.log(`[SignalingService] 🔍 message.audio:`, message.audio);
            console.log(`[SignalingService] 🔍 message.video:`, message.video);
            console.log(`[SignalingService] 🔍 message.data:`, message.data);
            
            // Check for both mediaState and the direct properties
            const stateData = message.mediaState || { 
                audio: message.audio !== undefined ? message.audio : message.data?.audio,
                video: message.video !== undefined ? message.video : message.data?.video
            };
            console.log(`[SignalingService] 🔍 stateData:`, stateData);
            // Use the actual audio and video values as the hash - much simpler and guaranteed unique
            const hashPart = `${stateData.audio}${stateData.video}`;
            messageId = `${message.type}-${message.from}-${message.to}-${hashPart}`;
            console.log(`[SignalingService] 🔍 Generated message ID for media-state: ${messageId} (audio: ${stateData.audio}, video: ${stateData.video}, hash: ${hashPart})`);
        } else if (isSignalingMessage) {
            messageId = `${message.type}-${message.from}-${message.to}`;
        } else {
            messageId = `${message.type}-${message.from}-${message.to}-${Date.now()}`;
        }
            
        let processedHandlers = this.processedMessages.get(messageId);
        
        if (!processedHandlers) {
            processedHandlers = new Set();
            this.processedMessages.set(messageId, processedHandlers);
            console.log(`[SignalingService] 📝 Created new processed handlers set for message ${messageId}`);
        } else {
            console.log(`[SignalingService] 📝 Found existing processed handlers for message ${messageId}:`, Array.from(processedHandlers));
        }
        
        console.log(`[SignalingService] 📊 Current processed messages cache size: ${this.processedMessages.size}`);

        let forwardedCount = 0;
        for (const [handlerId, handler] of handlers) {
            try {
                        // Check if this handler has already processed this message
        if (!processedHandlers.has(handlerId)) {
            // Handle both sync and async handlers
            console.log(`[SignalingService] 🔄 Processing message ${messageId} with handler ${handlerId}`);
            const result = handler(message);
            if (result && typeof result.then === 'function') {
                // Async handler - wait for it to complete
                await result;
            }
            processedHandlers.add(handlerId);
            forwardedCount++;
            console.log(`[SignalingService] ✅ Message ${messageId} processed by handler ${handlerId}`);
        } else {
            console.log(`[SignalingService] ⚠️ Handler ${handlerId} already processed message ${messageId} - skipping`);
        }
            } catch (error) {
                console.error('[SignalingService] ❌ Error in message handler:', error);
            }
        }

        if (message.type !== 'heartbeat') {
            console.log(`[SignalingService] ✅ Forwarded ${message.type} message to ${forwardedCount} handler(s)`);
        }

        // Cleanup old processed messages periodically
        // Clear all processed messages every 10 seconds to prevent memory buildup
        const now = Date.now();
        if (now - this.lastMessageTime > 10000) {
            const cacheSize = this.processedMessages.size;
            this.processedMessages.clear();
            console.log(`[SignalingService] 🧹 Cleaned up processed messages cache (cleared ${cacheSize} entries)`);
        }
        
        // Update last message time
        this.lastMessageTime = now;
    }

    // Socket message handler
    async handleSocketMessage(message) {
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
                case 'initiate':
                case 'initiate-ack':
                    console.log(`[SignalingService] 📨 Received ${message.type} from peer ${message.from} to ${message.to} (self: ${this.userId})`);
                    
                    // Notify about incoming connection attempts
                    // Only trigger for 'initiate' messages, not 'offer' messages
                    // 'offer' messages should be handled by existing providers for renegotiation
                    if (message.type === 'initiate' && this.onIncomingConnection) {
                        this.onIncomingConnection(message);
                    }
                    
                    await this.forwardMessage(message);
                    break;
                    
                case 'disconnect':
                    console.log(`[SignalingService] 📨 Received ${message.type} from peer ${message.from} to ${message.to} (self: ${this.userId})`);
                    
                    // Notify DashboardPage about disconnect message
                    if (this.onDisconnectMessage) {
                        console.log(`[SignalingService] 📨 Calling onDisconnectMessage handler (DashboardPage will handle disconnect)`);
                        this.onDisconnectMessage(message);
                        // Don't forward to WebRTC provider - DashboardPage will handle the disconnect process
                    } else {
                        console.log(`[SignalingService] 📨 No onDisconnectMessage handler, forwarding to WebRTC provider`);
                        await this.forwardMessage(message);
                    }
                    break;
                    
                case 'media-state':
                    console.log(`[SignalingService] 📨 Received ${message.type} from peer ${message.from} to ${message.to} (self: ${this.userId})`);
                    
                    await this.forwardMessage(message);
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
            const { SERVER_CONFIG } = await import('./config');
            const response = await fetch(`${SERVER_CONFIG.backend.getUrl()}/api/users/login`, {
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
                
                // Start connection monitoring to detect disconnections and reconnections
                this.startConnectionMonitoring();
                
                // Request updated peer list after successful registration
                // This helps detect peers that may have logged out while we were disconnected
                setTimeout(() => {
                    console.log('[SignalingService] 🔄 Requesting updated peer list after registration');
                    this.wsProvider.publish('get_peers', {
                        type: 'get_peers',
                        userId: this.userId
                    });
                }, 1000); // Small delay to ensure registration is fully processed
                
                resolve(true);
            });

            // Connect and register
            this.wsProvider.connect()
                .then(async () => {
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
        // Stop connection monitoring
        this.stopConnectionMonitoring();
        
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

        let wasConnected = this.wsProvider?.isConnected || false;

        this.connectionMonitorInterval = setInterval(() => {
            const isCurrentlyConnected = this.wsProvider?.isConnected || false;
            
            if (!isCurrentlyConnected && wasConnected) {
                console.log('[SignalingService] 🔍 Connection monitor detected connection loss');
                this.handleConnectionLoss();
            } else if (isCurrentlyConnected && !wasConnected) {
                console.log('[SignalingService] 🔄 Connection monitor detected reconnection');
                // Request updated peer list after reconnection to detect any peers that logged out
                setTimeout(() => {
                    console.log('[SignalingService] 🔄 Requesting updated peer list after reconnection');
                    this.wsProvider.publish('get_peers', {
                        type: 'get_peers',
                        userId: this.userId
                    });
                }, 1000); // Small delay to ensure connection is stable
            }
            
            wasConnected = isCurrentlyConnected;
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
            if (message.type === 'disconnect') {
                console.log(`[SignalingService] 🔴 SENDING DISCONNECT from ${message.from} to ${message.to} (initiator side)`);
            } else {
                console.log(`[SignalingService] 📤 Sending ${message.type} from ${message.from} to ${message.to}`);
            }
            this.wsProvider.publish('signaling', message);
            if (message.type === 'disconnect') {
                console.log(`[SignalingService] ✅ DISCONNECT SENT to peer ${message.to}`);
            } else {
                console.log(`[SignalingService] ✅ Sent ${message.type} to peer ${message.to}`);
            }
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

    // Reset Methods
    resetMessageHandlers() {
        console.log(`[SignalingService] 🔄 RESET: Starting message handlers reset - Current handlers: ${this.messageHandlers.size}, handlerId: ${this.handlerId}`);
        
        // Clear all message handlers
        this.messageHandlers.clear();
        
        // Clear processed messages
        this.processedMessages.clear();
        
        // Reset handler counters
        this.handlerId = 0;
        this.nextHandlerId = 1;
        
        console.log(`[SignalingService] 🔄 RESET: Message handlers reset completed - Handlers: ${this.messageHandlers.size}, handlerId: ${this.handlerId}`);
    }

    resetPeerTracking() {
        console.log(`[SignalingService] 🔄 RESET: Starting peer tracking reset`);
        
        // Clear registered peers
        this.registeredPeers.clear();
        
        // Reset reconnection attempts
        this.reconnectAttempts = 0;
        
        console.log(`[SignalingService] 🔄 RESET: Peer tracking reset completed`);
    }

    resetEventHandlers() {
        console.log(`[SignalingService] 🔄 RESET: Starting event handlers reset`);
        
        // Clear event handler callbacks
        this.onPeerListUpdate = null;
        this.onIncomingConnection = null;
        this.onDisconnectMessage = null;
        this.onConnectionStatusChange = null;
        
        console.log(`[SignalingService] 🔄 RESET: Event handlers reset completed`);
    }

    reset() {
        console.log(`[SignalingService] 🔄 RESET: Starting complete signaling service reset`);
        
        try {
            // Reset in order: message handlers → peer tracking → event handlers
            this.resetMessageHandlers();
            this.resetPeerTracking();
            this.resetEventHandlers();
            
            // Reset connection state
            this.isConnected = false;
            
            // Clear connection monitor
            if (this.connectionMonitorInterval) {
                clearInterval(this.connectionMonitorInterval);
                this.connectionMonitorInterval = null;
            }
            
            console.log(`[SignalingService] 🔄 RESET: Complete signaling service reset successful`);
        } catch (error) {
            console.error(`[SignalingService] ❌ RESET: Error during reset:`, error);
            throw error;
        }
    }
}

export default SignalingService;