import { 
    IWebRTCProvider, 
    ISignalingService, 
    WebRTCConfig, 
    WebRTCEvent, 
    MediaState, 
    ConnectionState 
} from './IWebRTCProvider';

// Add NodeJS types for Timeout
type Timeout = ReturnType<typeof setTimeout>;

export class WebRTCProvider implements IWebRTCProvider {
    private peerConnections: Map<string, RTCPeerConnection>;
    private dataChannels: Map<string, RTCDataChannel>;
    private pendingCandidates: Map<string, RTCIceCandidateInit[]>;
    private connectionStates: Map<string, ConnectionState>;
    private handshakeTimeouts: Map<string, Timeout>;
    private eventListeners: Map<WebRTCEvent['type'], Set<(event: WebRTCEvent) => void>>;
    
    private signalingService: ISignalingService | null;
    private localStream: MediaStream | null;
    private remoteStreams: Map<string, MediaStream>;
    
    private config: WebRTCConfig;
    private rtcConfiguration: RTCConfiguration;

    constructor(config: WebRTCConfig) {
        this.config = {
            reconnectDelay: 2000,
            maxReconnectAttempts: 5,
            iceCandidatePoolSize: 10,
            ...config
        };

        this.rtcConfiguration = {
            iceServers: config.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            iceCandidatePoolSize: this.config.iceCandidatePoolSize
        };

        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.pendingCandidates = new Map();
        this.connectionStates = new Map();
        this.handshakeTimeouts = new Map();
        this.eventListeners = new Map();
        this.remoteStreams = new Map();
        
        this.signalingService = null;
        this.localStream = null;
    }

    // Event System
    private emit(event: WebRTCEvent): void {
        const listeners = this.eventListeners.get(event.type);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    console.error(`[WebRTC] Error in ${event.type} event listener:`, error);
                }
            });
        }
    }

    addEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void {
        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, new Set());
        }
        this.eventListeners.get(type)!.add(handler);
    }

    removeEventListener(type: WebRTCEvent['type'], handler: (event: WebRTCEvent) => void): void {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            listeners.delete(handler);
        }
    }

    // Configuration
    setSignalingService(service: ISignalingService): void {
        this.signalingService = service;
        service.addMessageHandler(this.handleSignalingMessage.bind(this));
    }

    updateConfiguration(config: Partial<WebRTCConfig>): void {
        this.config = { ...this.config, ...config };
        if (config.iceServers) {
            this.rtcConfiguration.iceServers = config.iceServers;
        }
        if (config.iceCandidatePoolSize !== undefined) {
            this.rtcConfiguration.iceCandidatePoolSize = config.iceCandidatePoolSize;
        }
    }

    // Connection Management
    async connect(peerId: string): Promise<void> {
        if (!this.signalingService) {
            throw new Error('SignalingService not initialized');
        }

        try {
            this.setConnectionState(peerId, 'connecting');

            // Close existing connection if any
            if (this.peerConnections.has(peerId)) {
                await this.disconnect(peerId);
            }

            const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
            this.peerConnections.set(peerId, peerConnection);

            this.setupPeerConnectionHandlers(peerConnection, peerId);
            await this.addLocalTracksToConnection(peerConnection);

            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.setLocalDescription(offer);

            this.signalingService.send({
                type: 'offer',
                from: this.config.userId,
                to: peerId,
                data: offer
            });

        } catch (error) {
            this.cleanup(peerId);
            this.emit({
                type: 'error',
                peerId,
                data: { message: 'Connection failed', error }
            });
            throw error;
        }
    }

    async disconnect(peerId: string): Promise<void> {
        this.cleanup(peerId);
        
        if (this.signalingService) {
            this.signalingService.send({
                type: 'disconnect',
                from: this.config.userId,
                to: peerId
            });
        }
    }

    closeAllConnections(): void {
        for (const peerId of this.peerConnections.keys()) {
            this.disconnect(peerId);
        }
    }

    // Media Control
    async addMediaStream(stream: MediaStream): Promise<void> {
        this.localStream = stream;

        // Update all existing connections
        for (const [peerId, peerConnection] of this.peerConnections.entries()) {
            if (peerConnection.connectionState === 'connected') {
                await this.addLocalTracksToConnection(peerConnection);
                await this.renegotiate(peerId);
            }
        }

        this.emit({
            type: 'stream',
            peerId: this.config.userId,
            data: this.getMediaState()
        });
    }

    async toggleMedia(options: { audio?: boolean; video?: boolean }): Promise<void> {
        if (!this.localStream) return;

        if (options.audio !== undefined) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = options.audio!;
            });
        }

        if (options.video !== undefined) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = options.video!;
            });
        }

        this.emit({
            type: 'stream',
            peerId: this.config.userId,
            data: this.getMediaState()
        });

        // Notify peers about media state change
        for (const peerId of this.getConnectedPeers()) {
            this.signalingService?.send({
                type: 'stream-status',
                from: this.config.userId,
                to: peerId,
                data: this.getMediaState()
            });
        }
    }

    // State Management
    getPeerConnectionState(peerId: string): ConnectionState {
        return this.connectionStates.get(peerId) || 'disconnected';
    }

    getConnectedPeers(): string[] {
        return Array.from(this.peerConnections.keys()).filter(peerId => 
            this.getPeerConnectionState(peerId) === 'connected'
        );
    }

    getMediaState(): MediaState {
        return {
            hasAudio: this.localStream?.getAudioTracks().some(track => track.enabled) || false,
            hasVideo: this.localStream?.getVideoTracks().some(track => track.enabled) || false,
            stream: this.localStream
        };
    }

    // Messaging
    async sendMessage(peerId: string, message: any): Promise<void> {
        const dataChannel = this.dataChannels.get(peerId);
        if (!dataChannel || dataChannel.readyState !== 'open') {
            throw new Error('Data channel not ready');
        }

        try {
            dataChannel.send(JSON.stringify(message));
        } catch (error) {
            this.emit({
                type: 'error',
                peerId,
                data: { message: 'Failed to send message', error }
            });
            throw error;
        }
    }

    // Private Helper Methods
    private cleanup(peerId: string): void {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(peerId);
        }

        this.dataChannels.delete(peerId);
        this.pendingCandidates.delete(peerId);
        this.remoteStreams.delete(peerId);
        
        if (this.handshakeTimeouts.has(peerId)) {
            clearTimeout(this.handshakeTimeouts.get(peerId)!);
            this.handshakeTimeouts.delete(peerId);
        }

        this.setConnectionState(peerId, 'disconnected');
    }

    private setConnectionState(peerId: string, state: ConnectionState): void {
        this.connectionStates.set(peerId, state);
        
        if (state === 'connecting') {
            const timeout = setTimeout(() => {
                if (this.getPeerConnectionState(peerId) === 'connecting') {
                    this.cleanup(peerId);
                }
            }, 30000); // 30 second timeout
            this.handshakeTimeouts.set(peerId, timeout);
        }

        this.emit({
            type: 'connection',
            peerId,
            data: { state }
        });
    }

    private async addLocalTracksToConnection(peerConnection: RTCPeerConnection): Promise<void> {
        if (!this.localStream) return;

        const senders = peerConnection.getSenders();
        for (const track of this.localStream.getTracks()) {
            const sender = senders.find(s => s.track?.kind === track.kind);
            if (sender) {
                await sender.replaceTrack(track);
            } else {
                peerConnection.addTrack(track, this.localStream);
            }
        }
    }

    private async renegotiate(peerId: string): Promise<void> {
        const peerConnection = this.peerConnections.get(peerId);
        if (!peerConnection || peerConnection.connectionState !== 'connected') return;

        try {
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.setLocalDescription(offer);

            this.signalingService?.send({
                type: 'offer',
                from: this.config.userId,
                to: peerId,
                data: offer
            });
        } catch (error) {
            console.error('[WebRTC] Renegotiation failed:', error);
            this.emit({
                type: 'error',
                peerId,
                data: { message: 'Renegotiation failed', error }
            });
        }
    }

    private setupPeerConnectionHandlers(peerConnection: RTCPeerConnection, peerId: string): void {
        peerConnection.ontrack = (event) => {
            if (!event.streams?.length) return;

            const stream = event.streams[0];
            this.remoteStreams.set(peerId, stream);

            this.emit({
                type: 'track',
                peerId,
                data: {
                    stream,
                    hasAudio: stream.getAudioTracks().length > 0,
                    hasVideo: stream.getVideoTracks().length > 0
                }
            });
        };

        peerConnection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, peerId);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalingService?.send({
                    type: 'ice-candidate',
                    from: this.config.userId,
                    to: peerId,
                    data: event.candidate
                });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState as ConnectionState;
            this.setConnectionState(peerId, state);

            if (state === 'connected') {
                const dataChannel = peerConnection.createDataChannel('messageChannel');
                this.setupDataChannel(dataChannel, peerId);
            }
            else if ((state === 'failed' || state === 'closed') && !this.isInHandshake(peerId)) {
                this.cleanup(peerId);
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'failed' && !this.isInHandshake(peerId)) {
                this.cleanup(peerId);
            }
        };
    }

    private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
        dataChannel.onopen = () => {
            this.dataChannels.set(peerId, dataChannel);
        };

        dataChannel.onclose = () => {
            this.dataChannels.delete(peerId);
        };

        dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.emit({
                    type: 'message',
                    peerId,
                    data: message
                });
            } catch (error) {
                console.error('[WebRTC] Error processing message:', error);
            }
        };
    }

    private isInHandshake(peerId: string): boolean {
        const state = this.connectionStates.get(peerId);
        return state === 'connecting' || !state;
    }

    private async handleSignalingMessage(message: any): Promise<void> {
        const { type, from, data } = message;

        try {
            switch (type) {
                case 'offer':
                    await this.handleOffer(from, data);
                    break;
                case 'answer':
                    await this.handleAnswer(from, data);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(from, data);
                    break;
                case 'disconnect':
                    await this.disconnect(from);
                    break;
                case 'stream-status':
                    this.handleStreamStatus(from, data);
                    break;
            }
        } catch (error) {
            console.error(`[WebRTC] Error handling ${type}:`, error);
            if (!this.isInHandshake(from)) {
                this.cleanup(from);
            }
        }
    }

    private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
        this.peerConnections.set(peerId, peerConnection);

        this.setupPeerConnectionHandlers(peerConnection, peerId);
        await this.addLocalTracksToConnection(peerConnection);

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.signalingService?.send({
            type: 'answer',
            from: this.config.userId,
            to: peerId,
            data: answer
        });

        await this.processPendingCandidates(peerId);
    }

    private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const peerConnection = this.peerConnections.get(peerId);
        if (!peerConnection) {
            throw new Error(`No connection found for peer: ${peerId}`);
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        await this.processPendingCandidates(peerId);
    }

    private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peerConnection = this.peerConnections.get(peerId);
        
        if (!peerConnection || !peerConnection.remoteDescription) {
            if (!this.pendingCandidates.has(peerId)) {
                this.pendingCandidates.set(peerId, []);
            }
            this.pendingCandidates.get(peerId)!.push(candidate);
            return;
        }

        await peerConnection.addIceCandidate(candidate);
    }

    private async processPendingCandidates(peerId: string): Promise<void> {
        const candidates = this.pendingCandidates.get(peerId);
        if (!candidates) return;

        const peerConnection = this.peerConnections.get(peerId);
        if (!peerConnection) return;

        for (const candidate of candidates) {
            await peerConnection.addIceCandidate(candidate);
        }

        this.pendingCandidates.delete(peerId);
    }

    private handleStreamStatus(peerId: string, status: MediaState): void {
        this.emit({
            type: 'stream',
            peerId,
            data: status
        });
    }
} 