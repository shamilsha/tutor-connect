export class ICommunicationProvider {
    constructor() {
        if (this.constructor === ICommunicationProvider) {
            throw new Error("Abstract class cannot be instantiated");
        }
    }

    // Connection management
    connect(peerId) { throw new Error("Method 'connect' must be implemented"); }
    disconnect(peerId) { throw new Error("Method 'disconnect' must be implemented"); }
    
    // Message handling
    sendMessage(peerId, message) { throw new Error("Method 'sendMessage' must be implemented"); }
    
    // Event handlers that should be set by the consumer
    onMessageReceived = null;
    onConnectionStateChange = null;
    onError = null;
} 