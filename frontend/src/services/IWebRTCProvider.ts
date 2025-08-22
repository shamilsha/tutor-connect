import { ConnectionState } from './webrtc/types';

export type { ConnectionState };

// Types for WebRTC events
export interface ISignalingService {
    connect(): Promise<void>;
    disconnect(): void;
    send(message: any): void;
    addMessageHandler(handler: (message: any) => void): number;
    removeMessageHandler(handlerId: number): void;
    isConnected(): boolean;
}

export interface WebRTCConfig {
    userId: string;
    signalingService: ISignalingService;
    iceServers?: RTCIceServer[];
    iceCandidatePoolSize?: number;
}

export type MediaState = {
    stream: MediaStream | null;
    audio: boolean;
    video: boolean;
};

export type WebRTCEvent = {
    type: 'track' | 'connection' | 'message' | 'error' | 'stream' | 'media' | 'stateChange';
    peerId: string;
    data: any;
};

export interface IWebRTCProvider {
    // Connection Management
    connect(peerId: string): Promise<void>;
    disconnect(peerId: string): Promise<void>;
    closeAllConnections(): void;
    
    // Media Control
    addMediaStream(stream: MediaStream): Promise<void>;
    initializeLocalMedia(options?: { audio?: boolean; video?: boolean }): Promise<void>;
    toggleMedia(options: { audio?: boolean; video?: boolean }): Promise<void>;
    
    // State Management
    getPeerConnectionState(peerId: string): ConnectionState;
    getConnectedPeers(): string[];
    getMediaState(): MediaState;
    
    // State Getters
    getLocalVideoState(): boolean;
    getLocalAudioState(): boolean;
    getRemoteVideoState(): boolean;
    getRemoteAudioState(): boolean;
    getLocalStream(): MediaStream | null;
    getRemoteStream(peerId?: string): MediaStream | null;
    
    // Messaging
    sendMessage(peerId: string, message: any): Promise<void>;
    
    // Event Handling
    addEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void;
    removeEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void;
    
    // Configuration
    setSignalingService(service: ISignalingService): void;
    updateConfiguration(config: Partial<WebRTCConfig>): void;
} 