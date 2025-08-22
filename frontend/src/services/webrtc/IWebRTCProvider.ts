// Types for WebRTC events
export type MediaState = {
    hasAudio: boolean;
    hasVideo: boolean;
    stream: MediaStream | null;
};

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export type WebRTCEvent = {
    type: 'track' | 'connection' | 'message' | 'error' | 'stream';
    peerId: string;
    data: any;
};

export type WebRTCConfig = {
    userId: string;
    iceServers?: RTCIceServer[];
    iceCandidatePoolSize?: number;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
};

export interface ISignalingService {
    send(message: any): void;
    addMessageHandler(handler: (message: any) => void): void;
    removeMessageHandler(handler: (message: any) => void): void;
}

export interface IWebRTCProvider {
    // Connection Management
    connect(peerId: string): Promise<void>;
    disconnect(peerId: string): Promise<void>;
    closeAllConnections(): void;
    
    // Media Control
    addMediaStream(stream: MediaStream): Promise<void>;
    toggleMedia(options: { audio?: boolean; video?: boolean }): Promise<void>;
    
    // State Management
    getPeerConnectionState(peerId: string): ConnectionState;
    getConnectedPeers(): string[];
    getMediaState(): MediaState;
    
    // Messaging
    sendMessage(peerId: string, message: any): Promise<void>;
    
    // Event Handling
    addEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void;
    removeEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void;
    
    // Configuration
    setSignalingService(service: ISignalingService): void;
    updateConfiguration(config: Partial<WebRTCConfig>): void;
} 