export type WebRTCEventType = 'connection' | 'track' | 'media' | 'stream' | 'error' | 'message' | 'stateChange';

export type ConnectionPhase = 'idle' | 'initiating' | 'responding' | 'offering' | 'answering' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export type ConnectionStateString = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface ConnectionState {
    state: ConnectionPhase;
    connected: boolean;
}

export interface ConnectionStateData extends ConnectionState {}

export interface MediaStateData {
    audio: boolean;
    video: boolean;
    stream: MediaStream | null;
}

export interface StreamEventData {
    stream: MediaStream;
    type: 'local' | 'remote';
}

export interface ErrorEventData {
    error: Error;
    context?: string;
    message?: string;
    details?: any;
}

export interface MessageEventData {
    data: any;
}

export interface MediaEventData extends MediaStateData {
    type: 'local' | 'remote';
}

export interface TrackEventData {
    type: 'local' | 'remote';
    kind: 'audio' | 'video';
    enabled: boolean;
}

export interface WebRTCConfig {
    userId: string;
    iceServers: RTCIceServer[];
}

export interface StateChangeData {
    localAudio: boolean;
    localVideo: boolean;
    remoteAudio: boolean;
    remoteVideo: boolean;
}

export type WebRTCEventData = 
    | { type: 'connection'; data: ConnectionStateData }
    | { type: 'track'; data: TrackEventData }
    | { type: 'media'; data: MediaEventData }
    | { type: 'stream'; data: StreamEventData }
    | { type: 'error'; data: ErrorEventData }
    | { type: 'message'; data: MessageEventData }
    | { type: 'stateChange'; data: StateChangeData };

export interface WebRTCEvent {
    type: WebRTCEventType;
    peerId: string;
    data: WebRTCEventData['data'];
}

export type WebRTCEventHandler = (event: WebRTCEvent) => void;

export interface IWebRTCProvider {
    connect(peerId: string): Promise<void>;
    disconnect(peerId: string): Promise<void>;
    getPeerConnectionState(peerId: string): ConnectionState;
    getConnectedPeers(): string[];
    toggleMedia(peerId: string, options: { audio?: boolean; video?: boolean }): Promise<void>;
    sendMessage(peerId: string, message: any): Promise<void>;
    addEventListener(type: WebRTCEventType, handler: WebRTCEventHandler): void;
    removeEventListener(type: WebRTCEventType, handler: WebRTCEventHandler): void;
    setSignalingService(service: SignalingService): void;
    addMediaStream(stream: MediaStream): Promise<void>;
    getMediaState(): MediaStateData;
    closeAllConnections(): void;
}

export interface MediaStreamWithTracks extends MediaStream {
    audio?: boolean;
    video?: boolean;
}

export interface PeerState {
    connection: RTCPeerConnection;
    phase: ConnectionPhase;
    dataChannel: RTCDataChannel | null;
    remoteStream: MediaStream | null;
    pendingCandidates: RTCIceCandidate[];
    mediaState: MediaStateData;
    iceCandidates: RTCIceCandidate[];
}

export type SignalingMessageType = 'initiate' | 'initiate-ack' | 'offer' | 'offer-ack' | 'answer' | 'answer-ack' | 'ice-candidate' | 'ice-complete' | 'ice-complete-ack' | 'disconnect' | 'media-state';

export interface SignalingMessage {
    type: SignalingMessageType;
    from: string;
    to: string;
    data?: RTCSessionDescriptionInit | RTCIceCandidate | any;
    candidate?: RTCIceCandidate;
}

export interface SignalingService {
    send(message: SignalingMessage): void;
    addMessageHandler(handler: (message: SignalingMessage) => void): number;
    removeMessageHandler(handlerId: number): void;
}

export interface SignalingMessageHandler {
    (message: SignalingMessage): void;
}

export interface WebRTCMediaState {
    audio: boolean;
    video: boolean;
    stream: MediaStream | null;
}

export interface WebRTCMediaTrackState {
    audio: boolean;
    video: boolean;
}

export interface WebRTCStreamState {
    stream: MediaStream;
    tracks: WebRTCMediaTrackState;
}

export interface WebRTCMediaStreamWithTracks extends MediaStream {
    audio: boolean;
    video: boolean;
    tracks: WebRTCMediaTrackState;
}

export interface WebRTCStreamWithTracks {
    stream: WebRTCMediaStreamWithTracks;
    type: 'local' | 'remote';
} 