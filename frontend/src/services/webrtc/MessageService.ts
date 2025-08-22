import { WebRTCProvider } from './WebRTCProvider';

export type MessageHandler = (message: any, peerId: string) => void;

export interface MessageSubscription {
    unsubscribe(): void;
}

export class MessageService {
    private static instance: MessageService;
    private webrtcProvider: WebRTCProvider;
    private messageHandlers: Map<string, Set<MessageHandler>>;

    private constructor(webrtcProvider: WebRTCProvider) {
        this.webrtcProvider = webrtcProvider;
        this.messageHandlers = new Map();

        // Listen for messages from WebRTC
        this.webrtcProvider.addEventListener('message', (event) => {
            const { peerId, data } = event;
            if (data && data.type) {
                this.notifyHandlers(data.type, data, peerId);
            }
        });
    }

    static initialize(webrtcProvider: WebRTCProvider): void {
        if (!MessageService.instance) {
            MessageService.instance = new MessageService(webrtcProvider);
        }
    }

    static getInstance(): MessageService {
        if (!MessageService.instance) {
            throw new Error('MessageService not initialized');
        }
        return MessageService.instance;
    }

    /**
     * Subscribe to messages of a specific type
     * @param messageType The type of message to subscribe to
     * @param handler The handler function to call when a message is received
     * @returns A subscription object that can be used to unsubscribe
     */
    subscribe(messageType: string, handler: MessageHandler): MessageSubscription {
        if (!this.messageHandlers.has(messageType)) {
            this.messageHandlers.set(messageType, new Set());
        }

        const handlers = this.messageHandlers.get(messageType)!;
        handlers.add(handler);

        return {
            unsubscribe: () => {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.messageHandlers.delete(messageType);
                }
            }
        };
    }

    /**
     * Send a message to a specific peer
     * @param peerId The ID of the peer to send the message to
     * @param messageType The type of message being sent
     * @param payload The message payload
     */
    async sendMessage(peerId: string, messageType: string, payload: any = {}): Promise<void> {
        try {
            await this.webrtcProvider.sendMessage(peerId, {
                type: messageType,
                ...payload,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error(`[MessageService] Failed to send ${messageType} message:`, error);
            throw error;
        }
    }

    /**
     * Broadcast a message to all connected peers
     * @param messageType The type of message being sent
     * @param payload The message payload
     */
    async broadcast(messageType: string, payload: any = {}): Promise<void> {
        const connectedPeers = this.webrtcProvider.getConnectedPeers();
        await Promise.all(
            connectedPeers.map(peerId => 
                this.sendMessage(peerId, messageType, payload)
                    .catch(error => console.error(`[MessageService] Broadcast failed for peer ${peerId}:`, error))
            )
        );
    }

    private notifyHandlers(messageType: string, message: any, peerId: string): void {
        const handlers = this.messageHandlers.get(messageType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message, peerId);
                } catch (error) {
                    console.error(`[MessageService] Error in message handler for ${messageType}:`, error);
                }
            });
        }
    }
} 