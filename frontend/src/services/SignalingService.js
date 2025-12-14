export class SignalingService {
    constructor() {
        this.userId = null;
        this.userEmail = null;
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
            console.log(`%c[SignalingService] 📨 FORWARDING MESSAGE:`, 'font-weight: bold; color: blue;', {
                type: message.type,
                from: message.from,
                to: message.to,
                handlerCount: handlerCount,
                timestamp: new Date().toISOString()
            });
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
    async handleSocketMessage(message, timeoutRef = null, resolve = null, reject = null) {
        try {
            switch (message.type) {
                case 'registered':
                    console.log('[SignalingService] ✅ Registration confirmed for:', message.userId);
                    this.registeredPeers.add(message.userId);
                    this.isConnected = true;
                    if (this.onConnectionStatusChange) {
                        this.onConnectionStatusChange(true);
                    }
                    // Clear timeout on successful registration
                    if (timeoutRef) {
                        clearTimeout(timeoutRef);
                    }
                    if (resolve) resolve(true);
                    break;
                    
                case 'peer_list':
                    // Handle both old format (array of IDs) and new format (array of objects with id and email)
                    const rawPeers = message.peers || [];
                    const peers = rawPeers
                        .filter(peer => {
                            // Support both old format (string IDs) and new format (objects with id)
                            const peerId = typeof peer === 'string' ? peer : peer.id;
                            return peerId !== this.userId;
                        })
                        .map(peer => {
                            // Convert old format to new format for backward compatibility
                            if (typeof peer === 'string') {
                                return { id: peer, email: `Peer ${peer}` };
                            }
                            return peer; // Already in new format with id and email
                        });
                    console.log(`%c[SignalingService] 👥 PEER LIST RECEIVED:`, 'font-weight: bold; color: blue; font-size: 14px;', {
                        rawPeers: message.peers,
                        filteredPeers: peers,
                        currentUserId: this.userId,
                        timestamp: new Date().toISOString(),
                        handlerExists: !!this.onPeerListUpdate
                    });
                    if (this.onPeerListUpdate) {
                        console.log('%c[SignalingService] 👥 CALLING onPeerListUpdate handler:', 'font-weight: bold; color: green;');
                        this.onPeerListUpdate(peers);
                    } else {
                        console.log('%c[SignalingService] ⚠️ NO onPeerListUpdate handler registered:', 'font-weight: bold; color: yellow;');
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
                    
                case 'error':
                    console.log('[SignalingService] ❌ ERROR: Received error from signaling server:', message);
                    // Clear timeout on error
                    if (timeoutRef) {
                        clearTimeout(timeoutRef);
                    }
                    // Reject the promise with the error message
                    if (reject) {
                        reject(new Error(message.message || 'Signaling server error'));
                    }
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
                // Get the specific error message from the backend
                let errorMessage = 'Login failed';
                try {
                    const errorData = await response.text();
                    errorMessage = errorData || `Login failed (${response.status})`;
                } catch (e) {
                    // If we can't parse the error response, use status text
                    errorMessage = `Login failed: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            this.userId = data.id.toString();
            this.userEmail = data.email;
            
            console.log('[SignalingService] ✅ LOGIN SUCCESS: Login successful, userId:', this.userId, 'email:', this.userEmail);
            localStorage.setItem('user', JSON.stringify({
                id: data.id,
                email: data.email
            }));

            // After successful login, establish WebSocket connection
            console.log('[SignalingService] 🔌 LOGIN FLOW: Starting WebSocket establishment after successful login');
            await this.establishWebSocket();
            console.log('[SignalingService] ✅ LOGIN FLOW: WebSocket establishment completed successfully');
            return true;
        } catch (error) {
            console.error('[SignalingService] ❌ LOGIN ERROR:', error);
            console.error('[SignalingService] ❌ LOGIN ERROR: Source - SignalingService.login() method');
            this.cleanup();
            throw error; // Re-throw to let UI handle the error
        }
    }

    async connectWithUserId(userId) {
        console.log('[SignalingService] Connecting with existing userId:', userId);
        try {
            this.userId = userId;
            // Get email from localStorage if available
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            this.userEmail = user.email || null;
            
            // Establish WebSocket connection with existing user ID
            console.log('[SignalingService] 🔌 CONNECT: Starting WebSocket establishment with userId:', this.userId, 'email:', this.userEmail);
            await this.establishWebSocket();
            console.log('[SignalingService] ✅ CONNECT: WebSocket establishment completed successfully');
            
        } catch (error) {
            this.cleanup();
            throw error; // Re-throw to let UI handle the error
        }
    }

    async establishWebSocket() {
        // If already connected and registered, just return
        if (this.wsProvider?.isConnected && this.isConnected) {
            console.log('[SignalingService] ⚠️ ALREADY CONNECTED: WebSocket connection already established');
            console.log('[SignalingService] ⚠️ ALREADY CONNECTED: State check:', {
                wsProviderExists: !!this.wsProvider,
                wsProviderConnected: this.wsProvider?.isConnected,
                isConnected: this.isConnected,
                userId: this.userId
            });
            return Promise.resolve(true);
        }

        console.log('[SignalingService] 🔌 WEBSOCKET: Establishing WebSocket connection for userId:', this.userId);
        
        // Get or create WebSocketProvider instance
        const { WebSocketProvider } = await import('./WebSocketProvider');
        this.wsProvider = WebSocketProvider.getInstance(this.userId);
        console.log('[SignalingService] 🔌 WEBSOCKET: WebSocketProvider instance created/retrieved');

        return new Promise((resolve, reject) => {
            const registrationTimeout = setTimeout(() => {
                console.error('[SignalingService] ⏰ LOGIN TIMEOUT: WebSocket registration failed after 10 seconds');
                console.error('[SignalingService] ⏰ LOGIN TIMEOUT: Source - SignalingService.establishWebSocket() timeout');
                this.cleanup();
                reject(new Error('Login timeout'));
            }, 10000);

            // Set up message handling for all message types
            this.wsProvider.subscribe('*', (message) => {
                this.handleSocketMessage(message, registrationTimeout, resolve, reject);
            });
            console.log('[SignalingService] 🔌 WEBSOCKET: Message handlers subscribed');

            // Set up specific handler for login
            this.wsProvider.subscribe('logged_in', (message) => {
                console.log('[SignalingService] ✅ LOGIN: Login confirmed:', message);
                clearTimeout(registrationTimeout);
                this.isConnected = true;
                console.log('[SignalingService] ✅ LOGIN: Connection status set to true');
                if (this.onConnectionStatusChange) {
                    console.log('[SignalingService] ✅ LOGIN: Calling onConnectionStatusChange(true)');
                    this.onConnectionStatusChange(true);
                }
                
                // Start connection monitoring to detect disconnections and reconnections
                this.startConnectionMonitoring();
                
                
                resolve(true);
            });

            // Connect and register
            console.log('[SignalingService] 🔌 WEBSOCKET: Attempting to connect to WebSocket server...');
            this.wsProvider.connect()
                .then(async () => {
                    console.log('[SignalingService] ✅ WEBSOCKET: Connected to WebSocket server successfully');
                    console.log('[SignalingService] 📤 LOGIN: Sending login message for userId:', this.userId, 'email:', this.userEmail);
                    this.wsProvider.publish('login', {
                        type: 'login',
                        userId: this.userId,
                        email: this.userEmail || null
                    });
                })
                .catch(error => {
                    console.error('[SignalingService] ❌ WEBSOCKET ERROR: Connection failed:', error);
                    console.error('[SignalingService] ❌ WEBSOCKET ERROR: Source - WebSocket connection attempt');
                    clearTimeout(registrationTimeout);
                    this.cleanup();
                    reject(error);
                });
        });
    }

    cleanup() {
        console.log('[SignalingService] 🧹 CLEANUP: Starting signaling service cleanup');
        console.log('[SignalingService] 🧹 CLEANUP: Current state before cleanup:', {
            userId: this.userId,
            isConnected: this.isConnected,
            wsProviderExists: !!this.wsProvider,
            wsProviderConnected: this.wsProvider?.isConnected,
            registeredPeersCount: this.registeredPeers.size,
            messageHandlersCount: this.messageHandlers.size
        });
        
        // Stop connection monitoring
        this.stopConnectionMonitoring();
        
        if (this.wsProvider) {
            console.log('[SignalingService] 🧹 CLEANUP: Disconnecting WebSocket provider');
            this.wsProvider.disconnect();
        }
        this.userId = null;
        this.isConnected = false;
        localStorage.removeItem('user');
        this.registeredPeers.clear();
        this.messageHandlers.clear();
        
        console.log('[SignalingService] 🧹 CLEANUP: Signaling service cleanup completed');
        console.log('[SignalingService] 🧹 CLEANUP: State after cleanup:', {
            userId: this.userId,
            isConnected: this.isConnected,
            wsProviderExists: !!this.wsProvider,
            registeredPeersCount: this.registeredPeers.size,
            messageHandlersCount: this.messageHandlers.size
        });
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
        console.log('%c[SignalingService] 👋 SEND LOGOUT INITIATED:', 'font-weight: bold; color: red; font-size: 14px;', {
            userId: this.userId,
            wsProviderExists: !!this.wsProvider,
            isConnected: this.wsProvider?.isConnected,
            timestamp: new Date().toISOString()
        });
        
        if (this.userId && this.wsProvider?.isConnected) {
            const logoutMessage = {
                type: 'logout',
                userId: this.userId
            };
            
            console.log('%c[SignalingService] 👋 SENDING LOGOUT MESSAGE:', 'font-weight: bold; color: orange;', logoutMessage);
            this.wsProvider.publish('signaling', logoutMessage);
            console.log('%c[SignalingService] 👋 ✅ LOGOUT MESSAGE SENT TO SERVER', 'font-weight: bold; color: green;');
        } else {
            console.log('%c[SignalingService] ⚠️ CANNOT SEND LOGOUT - Missing requirements:', 'font-weight: bold; color: yellow;', {
                hasUserId: !!this.userId,
                hasWsProvider: !!this.wsProvider,
                isConnected: this.wsProvider?.isConnected
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