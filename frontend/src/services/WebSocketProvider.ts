import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { ICommunicationProvider } from './ICommunicationProvider';

export class WebSocketProvider implements ICommunicationProvider {
    private stompClient: Client | null = null;
    private updateCallback: ((update: any) => void) | null = null;

    constructor(private userId: string) {
        this.stompClient = new Client({
            webSocketFactory: () => new SockJS('http://localhost:8081/ws'),
            debug: (str) => {
                if (!str.includes('/topic/cursors')) {
                    console.log('WebSocket Debug:', str);
                }
            },
            reconnectDelay: 5000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000
        });
    }

    connect(): void {
        if (!this.stompClient) return;

        this.stompClient.onConnect = () => {
            console.log('WebSocket connected successfully');
            
            this.stompClient?.subscribe('/topic/whiteboard', message => {
                try {
                    const update = JSON.parse(message.body);
                    if (update.userId !== this.userId) {
                        this.updateCallback?.(update);
                    }
                } catch (error) {
                    console.error('Message processing error:', error);
                }
            });
        };

        this.stompClient.activate();
    }

    disconnect(): void {
        if (this.stompClient?.connected) {
            this.stompClient.deactivate();
        }
    }

    sendUpdate(message: any): void {
        if (!this.stompClient?.connected) {
            console.error('Cannot send update: WebSocket not connected');
            return;
        }

        try {
            this.stompClient.publish({
                destination: '/topic/whiteboard',
                body: JSON.stringify(message)
            });
        } catch (error) {
            console.error('Error sending update:', error);
        }
    }

    onUpdate(callback: (update: any) => void): void {
        this.updateCallback = callback;
    }
} 