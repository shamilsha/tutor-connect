import { 
    IWebRTCProvider, 
    ISignalingService, 
    WebRTCConfig, 
    MediaState, 
    ConnectionState 
} from './IWebRTCProvider';

import {
    WebRTCEventType,
    WebRTCEvent,
    WebRTCEventHandler,
    ConnectionPhase,
    SignalingMessage,
    SignalingMessageHandler
} from './webrtc/types';

interface RTCPeerState {
    connection: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    phase: 'idle' | 'initiating' | 'responding' | 'connecting' | 'connected' | 'disconnected' | 'failed';
    isInitiator: boolean;
    connectionTimeout: NodeJS.Timeout | null;
    mediaState: {
        audio: boolean;
        video: boolean;
    };
    // Track which tracks we've added as senders to avoid counting them as remote
    localSenderTrackIds: Set<string>;
}

export class WebRTCProvider implements IWebRTCProvider {
    // signaling service used to send and receive messages between peers before establishing a direct connection
    private signalingService: ISignalingService | null = null;
    // map of peer connections
    private connections: Map<string, RTCPeerState> = new Map();
    // local media stream
    private localStream: MediaStream | null = null;
    // event listeners for different WebRTC events
    private eventListeners: Map<WebRTCEventType, Set<WebRTCEventHandler>> = new Map();
    private userId: string;
    private config: WebRTCConfig;
    private rtcConfiguration: RTCConfiguration;
    private messageHandlerId: number | null = null;
    private processedMessages: Set<string> = new Set();
    // State tracking variables
    private hasLocalAudio: boolean = false;
    private hasLocalVideo: boolean = false;
    private hasRemoteAudio: boolean = false;
    private hasRemoteVideo: boolean = false;
    
    // Debug logging state tracking
    private _lastLoggedRemoteVideoState: boolean | undefined;
    private _lastLoggedRemoteStreamState: string | undefined;
    private _lastLoggedLocalStreamState: string | undefined;

    // State change notification system
    private notifyStateChange() {
        const state = {
            localAudio: this.hasLocalAudio,
            localVideo: this.hasLocalVideo,
            remoteAudio: this.hasRemoteAudio,
            remoteVideo: this.hasRemoteVideo
        };
        
        console.log('[WebRTC] 🔄 STATE CHANGED - Notifying UI:', state);
        console.log('[WebRTC] 🔄 STATE CHANGE DEBUG - Current streams:', {
            remoteStreamsSize: this.remoteStreams.size,
            remoteStreamKeys: Array.from(this.remoteStreams.keys()),
            localStreamExists: !!this.localStream,
            localStreamId: this.localStream?.id
        });
        
        // Dispatch state change event locally (for UI components like VideoChat)
        this.dispatchEvent({
            type: 'stateChange',
            peerId: this.userId, // Use self as peerId for local events
            data: state
        });
        
        // Dispatch state change event to all connected peers
        for (const [peerId, peerState] of this.connections.entries()) {
        this.dispatchEvent({
                type: 'stateChange',
            peerId,
                data: state
            });
        }
    }

    private updateLocalAudioState(enabled: boolean) {
        if (this.hasLocalAudio !== enabled) {
            this.hasLocalAudio = enabled;
            console.log(`[WebRTC] 🔄 Updated hasLocalAudio to: ${enabled}`);
            this.notifyStateChange();
        }
    }

    private updateLocalVideoState(enabled: boolean) {
        if (this.hasLocalVideo !== enabled) {
            this.hasLocalVideo = enabled;
            console.log(`[WebRTC] 🔄 Updated hasLocalVideo to: ${enabled}`);
            this.notifyStateChange();
        }
    }

    private updateRemoteAudioState(enabled: boolean) {
        if (this.hasRemoteAudio !== enabled) {
            this.hasRemoteAudio = enabled;
            console.log(`[WebRTC] 🔄 Updated hasRemoteAudio to: ${enabled}`);
            this.notifyStateChange();
        }
    }

    private updateRemoteVideoState(enabled: boolean, notifyUI: boolean = true) {
        console.log(`[WebRTC] 🔄 updateRemoteVideoState called with enabled: ${enabled}, current hasRemoteVideo: ${this.hasRemoteVideo}, notifyUI: ${notifyUI}`);
        console.log(`[WebRTC] 🔄 Call stack:`, new Error().stack?.split('\n').slice(1, 4).join('\n'));

        if (this.hasRemoteVideo !== enabled) {
            const oldValue = this.hasRemoteVideo;
            this.hasRemoteVideo = enabled;
            console.log(`[WebRTC] 🔄 CHANGED hasRemoteVideo: ${oldValue} -> ${enabled}`);
            if (notifyUI) {
                this.notifyStateChange();
            }
        } else {
            console.log(`[WebRTC] 🔄 No change needed - hasRemoteVideo already ${enabled}`);
        }
        
        // Additional debug after state change
        console.log(`[WebRTC] 🔄 updateRemoteVideoState completed - Final state:`, {
            hasRemoteVideo: this.hasRemoteVideo,
            remoteStreamsSize: this.remoteStreams.size,
            remoteStreamKeys: Array.from(this.remoteStreams.keys())
        });
    }

    // Connection timeout settings
    private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
    private readonly INITIATION_TIMEOUT = 10000; // 10 seconds

    constructor(config: WebRTCConfig) {
        this.config = config;
        this.userId = config.userId;
        this.rtcConfiguration = {
            iceServers: config.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            iceCandidatePoolSize: config.iceCandidatePoolSize || 10
        };

        // Initialize event listeners
        for (const type of ['connection', 'track', 'media', 'stream', 'error', 'message'] as WebRTCEventType[]) {
            this.eventListeners.set(type, new Set());
        }
        
        console.log(`[WebRTC] WebRTCProvider instance created for user ${this.userId}`);
    }

    // Event System
    private dispatchEvent(event: WebRTCEvent): void {
        const handlers = this.eventListeners.get(event.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event);
                } catch (error) {
                    console.error(`[WebRTC] Error in ${event.type} event listener:`, error);
                }
            });
        }
    }

    public addEventListener(type: WebRTCEventType, handler: WebRTCEventHandler): void {
        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, new Set());
        }
        this.eventListeners.get(type)!.add(handler);
    }

    public removeEventListener(type: WebRTCEventType, handler: WebRTCEventHandler): void {
        this.eventListeners.get(type)?.delete(handler);
    }

    // Configuration
    public setSignalingService(service: ISignalingService): void {
        // Only clean up if we're changing signaling services
        if (this.signalingService !== service) {
            console.log(`[WebRTC] Changing signaling service, cleaning up old connections`);
        this.cleanup();
        
        if (this.messageHandlerId !== null && this.signalingService) {
            this.signalingService.removeMessageHandler(this.messageHandlerId);
            }
        }

        this.signalingService = service;
        this.messageHandlerId = service.addMessageHandler(this.handleSignalingMessage.bind(this));
        console.log(`[WebRTC] Signaling service configured with handler ID: ${this.messageHandlerId}`);
    }

    // Core Connection Management
    public async connect(peerId: string): Promise<void> {
        if (!this.signalingService) {
            throw new Error('SignalingService not set');
        }

        // Check if already connected or connecting
        const existingState = this.connections.get(peerId);
        if (existingState && ['connecting', 'connected'].includes(existingState.phase)) {
            console.log(`[WebRTC] Already connected or connecting to peer ${peerId}`);
            return;
        }

        // Clean up any existing failed connection
        if (existingState) {
            this.cleanup(peerId);
        }

        try {
            console.log(`[WebRTC] Initiating connection to peer ${peerId}`);
            
            // Send initiation intent
            this.signalingService.send({
                type: 'initiate',
                from: this.userId,
                to: peerId,
                data: { timestamp: Date.now() }
            });

            // Create peer state as initiator
            const peerState = this.createPeerState(peerId, true);
            this.connections.set(peerId, peerState);

            // Set connection timeout
            peerState.connectionTimeout = setTimeout(() => {
                this.handleConnectionTimeout(peerId);
            }, this.INITIATION_TIMEOUT);

            console.log(`[WebRTC] Initiation sent to peer ${peerId}`);

        } catch (error) {
            console.error(`[WebRTC] Failed to initiate connection to peer ${peerId}:`, error);
            this.handleError(peerId, error);
            throw error;
        }
    }

    public async disconnect(peerId: string): Promise<void> {
        console.log(`[WebRTC] Disconnecting from peer ${peerId}`);

            const peerState = this.connections.get(peerId);
            if (!peerState) return;

        // Send disconnect notification
        if (this.signalingService) {
            try {
                this.signalingService.send({
                    type: 'disconnect',
                    from: this.userId,
                    to: peerId,
                    data: { timestamp: Date.now() }
                });
            } catch (error) {
                console.warn('[WebRTC] Failed to send disconnect message:', error);
            }
        }

        this.cleanup(peerId);
    }

    // Media Management
    public async toggleMedia(options: { audio?: boolean; video?: boolean }): Promise<void> {
        console.log('[WebRTC] 🔄 toggleMedia called:', { options });
        
        if (!this.localStream) {
            console.warn('[WebRTC] No local stream available for media toggle');
            return;
        }

        console.log('[WebRTC] 🔄 Local stream details:', {
            audioTracks: this.localStream.getAudioTracks().length,
            videoTracks: this.localStream.getVideoTracks().length,
            audioEnabled: this.localStream.getAudioTracks().map(t => t.enabled),
            videoEnabled: this.localStream.getVideoTracks().map(t => t.enabled)
        });

        // Update local stream tracks first
        if (options.audio !== undefined) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                console.log(`[WebRTC] 🔄 BEFORE enabling audio track ${audioTrack.id}: enabled = ${audioTrack.enabled}`);
                audioTrack.enabled = options.audio;
                this.updateLocalAudioState(options.audio);
                console.log(`[WebRTC] 🔄 AFTER enabling audio track ${audioTrack.id}: enabled = ${audioTrack.enabled}, requested = ${options.audio}`);
            }
        }
        if (options.video !== undefined) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                console.log(`[WebRTC] 🔄 BEFORE enabling video track ${videoTrack.id}: enabled = ${videoTrack.enabled}`);
                videoTrack.enabled = options.video;
                this.updateLocalVideoState(options.video);
                console.log(`[WebRTC] 🔄 AFTER enabling video track ${videoTrack.id}: enabled = ${videoTrack.enabled}, requested = ${options.video}`);
                
                // Add a check to ensure the track state is properly set
                setTimeout(() => {
                    console.log(`[WebRTC] 🔄 TRACK STATE VERIFICATION for ${videoTrack.id}: enabled = ${videoTrack.enabled}, hasLocalVideo = ${this.hasLocalVideo}`);
                }, 50);
            }
        }

        // Track if we need to renegotiate for any peer
        const peersNeedingRenegotiation: string[] = [];

        console.log(`[WebRTC] 🔄 Processing ${this.connections.size} connected peers`);

        // Update senders for all connected peers
        for (const [connectedPeerId, peerState] of this.connections.entries()) {
            if (peerState.connection && peerState.connection.connectionState === 'connected') {
                console.log(`[WebRTC] 🔄 Updating senders for peer ${connectedPeerId}`);
                
                // Update peer state
                if (options.audio !== undefined) {
                    peerState.mediaState.audio = options.audio;
                }
                if (options.video !== undefined) {
                    peerState.mediaState.video = options.video;
                }

                // Get existing senders and their track IDs
                const senders = peerState.connection.getSenders();
                const existingTrackIds = new Set(senders.map(s => s.track?.id).filter(id => id));
                
                console.log(`[WebRTC] 🔄 Existing senders for peer ${connectedPeerId}:`, {
                    senderCount: senders.length,
                    existingTrackIds: Array.from(existingTrackIds),
                    senderTracks: senders.map(s => ({ kind: s.track?.kind, id: s.track?.id, enabled: s.track?.enabled }))
                });

                let trackAdded = false;
                let trackRemoved = false;

                // Handle audio track changes
                if (options.audio !== undefined) {
                    const audioTrack = this.localStream.getAudioTracks()[0];
                    if (audioTrack) {
                        if (options.audio && !existingTrackIds.has(audioTrack.id)) {
                            // Adding audio track
                            console.log(`[WebRTC] 🔄 Adding audio track ${audioTrack.id} to peer ${connectedPeerId}`);
                            const sender = peerState.connection.addTrack(audioTrack, this.localStream!);
                            if (sender.track) {
                                peerState.localSenderTrackIds.add(sender.track.id);
                            }
                            trackAdded = true;
                        } else if (!options.audio && existingTrackIds.has(audioTrack.id)) {
                            // Removing audio track
                            console.log(`[WebRTC] 🔄 Removing audio track ${audioTrack.id} from peer ${connectedPeerId}`);
                            const sender = senders.find(s => s.track?.id === audioTrack.id);
                            if (sender) {
                                peerState.connection.removeTrack(sender);
                                peerState.localSenderTrackIds.delete(audioTrack.id);
                                trackRemoved = true;
                            }
                        }
                    }
                }
                
                // Handle video track changes
                if (options.video !== undefined) {
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    if (videoTrack) {
                        if (options.video && !existingTrackIds.has(videoTrack.id)) {
                            // Adding video track
                            console.log(`[WebRTC] 🔄 Adding video track ${videoTrack.id} to peer ${connectedPeerId}`);
                            const sender = peerState.connection.addTrack(videoTrack, this.localStream!);
                            if (sender.track) {
                                peerState.localSenderTrackIds.add(sender.track.id);
                            }
                            trackAdded = true;
                        } else if (!options.video && existingTrackIds.has(videoTrack.id)) {
                            // Removing video track
                            console.log(`[WebRTC] 🔄 Removing video track ${videoTrack.id} from peer ${connectedPeerId}`);
                            const sender = senders.find(s => s.track?.id === videoTrack.id);
                    if (sender) {
                                peerState.connection.removeTrack(sender);
                                peerState.localSenderTrackIds.delete(videoTrack.id);
                                trackRemoved = true;
                            }
                        }
                    }
                }

                // Update existing senders (for enabled/disabled state)
                for (const sender of senders) {
                    if (sender.track) {
                        if (options.audio !== undefined && sender.track.kind === 'audio') {
                            console.log(`[WebRTC] 🔄 BEFORE updating audio sender track ${sender.track.id}: enabled = ${sender.track.enabled}`);
                            sender.track.enabled = options.audio;
                            console.log(`[WebRTC] 🔄 AFTER updating audio sender track ${sender.track.id}: enabled = ${sender.track.enabled}, requested = ${options.audio}`);
                        }
                        if (options.video !== undefined && sender.track.kind === 'video') {
                            console.log(`[WebRTC] 🔄 BEFORE updating video sender track ${sender.track.id}: enabled = ${sender.track.enabled}`);
                            sender.track.enabled = options.video;
                            console.log(`[WebRTC] 🔄 AFTER updating video sender track ${sender.track.id}: enabled = ${sender.track.enabled}, requested = ${options.video}`);
                        }
                    }
                }



                // If we added or removed a track, we need to renegotiate
                if (trackAdded || trackRemoved) {
                    console.log(`[WebRTC] 🔄 Track ${trackAdded ? 'added' : 'removed'} to peer ${connectedPeerId}, will trigger renegotiation`);
                    peersNeedingRenegotiation.push(connectedPeerId);
                    } else {
                    console.log(`[WebRTC] 🔄 No track changes for peer ${connectedPeerId}, no renegotiation needed`);
                }

                // Send media state to peer
                await this.sendMediaState(connectedPeerId, {
                    audio: peerState.mediaState.audio,
                    video: peerState.mediaState.video,
                    stream: this.localStream
                });
            } else {
                console.log(`[WebRTC] 🔄 Skipping peer ${connectedPeerId} - not connected (state: ${peerState.connection?.connectionState})`);
            }
        }

        // Trigger renegotiation for peers that need it
        for (const peerId of peersNeedingRenegotiation) {
            console.log(`[WebRTC] 🔄 Triggering renegotiation for peer ${peerId} due to track change`);
            console.log(`[WebRTC] 🔄 Pre-renegotiation state for peer ${peerId}:`, {
                hasLocalVideo: this.hasLocalVideo,
                hasLocalAudio: this.hasLocalAudio,
                localStreamTracks: this.localStream?.getTracks().map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled })) || []
            });
            
            // Small delay to ensure track state changes are properly propagated
            await new Promise(resolve => setTimeout(resolve, 10));
            
            await this.forceRenegotiation(peerId);
        }
    }

    // Stream Management
    public async addMediaStream(stream: MediaStream): Promise<void> {
        this.localStream = stream;
        console.log(`[WebRTC] Local stream added with ${stream.getTracks().length} tracks`);
        
        // Update state tracking based on the actual enabled state of tracks
        const hasAudio = stream.getAudioTracks().some(track => track.enabled);
        const hasVideo = stream.getVideoTracks().some(track => track.enabled);
        
        console.log(`[WebRTC] Stream track states:`, {
            audioTracks: stream.getAudioTracks().map(t => ({ enabled: t.enabled, id: t.id })),
            videoTracks: stream.getVideoTracks().map(t => ({ enabled: t.enabled, id: t.id })),
            hasAudio,
            hasVideo
        });
        
        this.updateLocalAudioState(hasAudio);
        this.updateLocalVideoState(hasVideo);
    }

    // Initialize local media stream
    public async initializeLocalMedia(options: { audio?: boolean; video?: boolean } = { audio: true, video: true }): Promise<void> {
        try {
            console.log('[WebRTC] 🔄 Initializing local media stream with options:', options);
            
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not available');
            }
            
            // Request user media
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: options.audio,
                video: options.video
            });
            
            console.log('[WebRTC] ✅ Local media stream obtained:', {
                audioTracks: stream.getAudioTracks().length,
                videoTracks: stream.getVideoTracks().length,
                streamId: stream.id
            });
            
            // Add the stream to the provider
            await this.addMediaStream(stream);
            
            console.log('[WebRTC] ✅ Local media stream initialized successfully');
        } catch (error) {
            console.error('[WebRTC] ❌ Failed to initialize local media stream:', error);
            throw error;
        }
    }

    public getMediaState(): MediaState {
        return {
            stream: this.localStream,
            audio: this.localStream?.getAudioTracks().some(track => track.enabled) || false,
            video: this.localStream?.getVideoTracks().some(track => track.enabled) || false
        };
    }

    // Getter methods for state tracking
    public getLocalVideoState(): boolean {
        return this.hasLocalVideo;
    }

    public getLocalAudioState(): boolean {
        return this.hasLocalAudio;
    }

    public getRemoteVideoState(): boolean {
        // Only log on first call or when debugging is needed
        if (!this._lastLoggedRemoteVideoState || this._lastLoggedRemoteVideoState !== this.hasRemoteVideo) {
            console.log(`[WebRTC] 🔍 getRemoteVideoState called, returning: ${this.hasRemoteVideo}`);
            console.log(`[WebRTC] 🔍 getRemoteVideoState DEBUG:`, {
                hasRemoteVideo: this.hasRemoteVideo,
                remoteStreamsSize: this.remoteStreams.size,
                remoteStreamKeys: Array.from(this.remoteStreams.keys())
            });
            this._lastLoggedRemoteVideoState = this.hasRemoteVideo;
        }
        return this.hasRemoteVideo;
    }

    public getRemoteAudioState(): boolean {
        return this.hasRemoteAudio;
    }

    // Getter methods for streams
    public getLocalStream(): MediaStream | null {
        const currentStreamId = this.localStream?.id;
        // Only log when stream changes
        if (this._lastLoggedLocalStreamState !== currentStreamId) {
            console.log('[WebRTC] 🔍 getLocalStream called:', {
                hasLocalStream: !!this.localStream,
                localStreamId: currentStreamId,
                localStreamTracks: this.localStream?.getTracks().length || 0,
                hasLocalVideo: this.hasLocalVideo,
                hasLocalAudio: this.hasLocalAudio
            });
            this._lastLoggedLocalStreamState = currentStreamId;
        }
        return this.localStream;
    }

    public getRemoteStream(peerId?: string): MediaStream | null {
        const currentStreamsState = `${this.remoteStreams.size}-${Array.from(this.remoteStreams.keys()).join(',')}`;
        // Only log when streams state changes
        if (this._lastLoggedRemoteStreamState !== currentStreamsState) {
            console.log('[WebRTC] 🔍 getRemoteStream called:', {
                peerId,
                remoteStreamsSize: this.remoteStreams.size,
                remoteStreamKeys: Array.from(this.remoteStreams.keys()),
                hasRemoteVideo: this.hasRemoteVideo,
                hasRemoteAudio: this.hasRemoteAudio
            });
            this._lastLoggedRemoteStreamState = currentStreamsState;
        }
        
        if (peerId) {
            const stream = this.remoteStreams.get(peerId) || null;
            return stream;
        }
        // Return the first available remote stream (for backward compatibility)
        for (const [peerId, remoteStream] of this.remoteStreams.entries()) {
            if (remoteStream) {
                return remoteStream;
            }
        }
        return null;
    }

    public getPeerConnectionState(peerId: string): ConnectionState {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            return { state: 'disconnected', connected: false };
        }

        return {
            state: peerState.phase,
            connected: peerState.phase === 'connected'
        };
    }

    public getConnectedPeers(): string[] {
        return Array.from(this.connections.entries())
            .filter(([_, state]) => state.phase === 'connected')
            .map(([peerId]) => peerId);
    }

    // Store remote streams for each peer
    private remoteStreams: Map<string, MediaStream> = new Map();

    // Messaging
    public async sendMessage(peerId: string, message: any): Promise<void> {
        console.log(`[WebRTC] Attempting to send message to peer ${peerId}`);
        console.log(`[WebRTC] Current connections:`, Array.from(this.connections.keys()));
        
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] No connection state found for peer ${peerId}`);
            console.error(`[WebRTC] Available peer IDs:`, Array.from(this.connections.keys()));
            throw new Error(`No connection state found for peer ${peerId}`);
        }
        
        console.log(`[WebRTC] Found peer state for ${peerId}, phase: ${peerState.phase}, dataChannel: ${!!peerState.dataChannel}`);
        
        if (!peerState.dataChannel) {
            throw new Error(`No data channel found for peer ${peerId}`);
        }
        
        if (peerState.dataChannel.readyState !== 'open') {
            throw new Error(`Data channel not ready for peer ${peerId}, state: ${peerState.dataChannel.readyState}`);
        }

        try {
            console.log(`[WebRTC] Sending message to peer ${peerId}:`, message);
            peerState.dataChannel.send(JSON.stringify(message));
            console.log(`[WebRTC] Message sent successfully to peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] Failed to send message to peer ${peerId}:`, error);
            throw error;
        }
    }

    // Cleanup
    public closeAllConnections(): void {
        for (const peerId of this.connections.keys()) {
            this.disconnect(peerId);
        }
    }

    // Private Helper Methods
    private createPeerState(peerId: string, isInitiator: boolean): RTCPeerState {
        const connection = new RTCPeerConnection(this.rtcConfiguration);
        
        const peerState: RTCPeerState = {
            connection,
            dataChannel: null,
            phase: 'idle',
            isInitiator,
            connectionTimeout: null,
            mediaState: {
                audio: false,
                video: false
            },
            localSenderTrackIds: new Set<string>()
        };

        this.setupPeerConnectionHandlers(connection, peerId);
        return peerState;
    }

    private setupPeerConnectionHandlers(connection: RTCPeerConnection, peerId: string): void {
        // Connection state changes
        connection.onconnectionstatechange = () => {
            const state = connection.connectionState;
            console.log(`[WebRTC] Connection state for peer ${peerId}: ${state}`);
            
            const peerState = this.connections.get(peerId);
            if (!peerState) {
                console.log(`[WebRTC] No peer state found for ${peerId} during connection state change`);
                return;
            }

            console.log(`[WebRTC] Peer ${peerId} state change: ${peerState.phase} -> ${state}`);

            switch (state) {
                case 'connected':
                    if (peerState.phase !== 'connected') {
                        peerState.phase = 'connected';
                        this.clearConnectionTimeout(peerId);
                        this.dispatchConnectionEvent(peerId, 'connected');
                        console.log(`[WebRTC] Peer ${peerId} marked as connected`);
                        console.log(`[WebRTC] Current connections after marking connected:`, Array.from(this.connections.keys()));
                    }
                    break;
                case 'failed':
                case 'closed':
                    if (peerState.phase !== 'disconnected') {
                        console.log(`[WebRTC] Peer ${peerId} connection failed/closed, cleaning up`);
                        peerState.phase = 'disconnected';
                        this.clearConnectionTimeout(peerId);
                        this.dispatchConnectionEvent(peerId, 'disconnected');
                        this.cleanup(peerId);
                    }
                    break;
            }
        };

        // ICE connection state changes
        connection.oniceconnectionstatechange = () => {
            const state = connection.iceConnectionState;
            console.log(`[WebRTC] ICE connection state for peer ${peerId}: ${state}`);
            
            if (state === 'failed') {
                this.handleError(peerId, new Error('ICE connection failed'));
            }
        };

        // ICE candidates
        connection.onicecandidate = (event) => {
            if (event.candidate && this.signalingService) {
                this.signalingService.send({
                    type: 'ice-candidate',
                    from: this.userId,
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Data channel (always create for initiator)
        connection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, peerId);
        };

        // Tracks
        connection.ontrack = (event) => {
            console.log(`[WebRTC] 🎥 PEER ${this.userId} RECEIVED ${event.track.kind} TRACK FROM PEER ${peerId}`);
            console.log(`[WebRTC] Track details:`, {
                kind: event.track.kind,
                enabled: event.track.enabled,
                id: event.track.id,
                streamId: event.streams?.[0]?.id
            });
            
            // Check if we should ignore this track based on current media state
            // Only ignore video tracks if we have explicitly received a media state message saying video is off
            // This allows us to accept video tracks when a peer turns on video
            if (event.track.kind === 'video' && !this.hasRemoteVideo) {
                console.log(`[WebRTC] 🎥 Accepting video track from peer ${peerId} despite hasRemoteVideo=false - updating state`);
                // Update the remote video state to true since we're receiving a video track
                this.updateRemoteVideoState(true, false); // Don't notify UI yet
            }
            
            // Store or update the remote stream for this peer
            let remoteStream = this.remoteStreams.get(peerId);
            let streamCreated = false;
            if (!remoteStream) {
                remoteStream = new MediaStream();
                this.remoteStreams.set(peerId, remoteStream);
                console.log(`[WebRTC] Created new remote stream for peer ${peerId}`);
                streamCreated = true;
            }
            
            // Add the track to the remote stream
            remoteStream.addTrack(event.track);
            console.log(`[WebRTC] Added ${event.track.kind} track to remote stream for peer ${peerId}`);
            
            // Update remote state variables based on track kind
            if (event.track.kind === 'video') {
                this.updateRemoteVideoState(true, false); // Don't notify UI yet
                console.log(`[WebRTC] ✅ Updated hasRemoteVideo to true`);
                
                // Always notify UI when we receive a video track
                console.log(`[WebRTC] 🔄 Video track received, notifying UI of stream availability`);
                this.notifyStateChange();
            } else if (event.track.kind === 'audio') {
                this.updateRemoteAudioState(true);
                console.log(`[WebRTC] ✅ Updated hasRemoteAudio to true`);
                
                // If this is a new stream or the first audio track, notify UI even if state didn't change
                if (streamCreated || remoteStream.getAudioTracks().length === 1) {
                    console.log(`[WebRTC] 🔄 Audio stream created/updated, notifying UI of stream availability`);
                    this.notifyStateChange();
                }
            }
            
            // Handle track ended events
            event.track.onended = () => {
                console.log(`[WebRTC] 🚫 TRACK ENDED: ${event.track.kind} track from peer ${peerId}`);
                if (event.track.kind === 'video') {
                    this.updateRemoteVideoState(false, false); // Don't notify UI yet
                    console.log(`[WebRTC] ✅ Updated hasRemoteVideo to false`);
                    
                    // Clean up remote stream if no more video tracks
                    const remoteStream = this.remoteStreams.get(peerId);
                    if (remoteStream) {
                        const remainingVideoTracks = remoteStream.getVideoTracks().filter(track => track.readyState !== 'ended');
                        console.log(`[WebRTC] 🔍 Remaining video tracks for peer ${peerId}: ${remainingVideoTracks.length}`);
                        
                        if (remainingVideoTracks.length === 0) {
                            console.log(`[WebRTC] 🧹 Cleaning up remote stream for peer ${peerId} (no more video tracks)`);
                            
                            // End all remaining tracks in the stream
                            const allTracks = remoteStream.getTracks();
                            allTracks.forEach(track => {
                                console.log(`[WebRTC] 🛑 Ending remaining track:`, {
                                    kind: track.kind,
                                    id: track.id,
                                    enabled: track.enabled,
                                    readyState: track.readyState
                                });
                                track.stop();
                            });
                            
                            this.remoteStreams.delete(peerId);
                            // Dispatch state change to notify UI that remote stream is gone
                            this.notifyStateChange();
                        } else {
                            // Still have video tracks, but notify UI that stream state changed
                            console.log(`[WebRTC] 🔄 Video track removed but stream still has ${remainingVideoTracks.length} video tracks, notifying UI`);
                            this.notifyStateChange();
                        }
                    } else {
                        // No remote stream, but still notify UI of state change
                        this.notifyStateChange();
                    }
                } else if (event.track.kind === 'audio') {
                    this.updateRemoteAudioState(false);
                    console.log(`[WebRTC] ✅ Updated hasRemoteAudio to false`);
                    
                    // Clean up remote stream if no more audio tracks and no video tracks
                    const remoteStream = this.remoteStreams.get(peerId);
                    if (remoteStream) {
                        const remainingAudioTracks = remoteStream.getAudioTracks().filter(track => track.readyState !== 'ended');
                        const remainingVideoTracks = remoteStream.getVideoTracks().filter(track => track.readyState !== 'ended');
                        console.log(`[WebRTC] 🔍 Remaining tracks for peer ${peerId}: audio=${remainingAudioTracks.length}, video=${remainingVideoTracks.length}`);
                        
                        if (remainingAudioTracks.length === 0 && remainingVideoTracks.length === 0) {
                            console.log(`[WebRTC] 🧹 Cleaning up remote stream for peer ${peerId} (no more tracks)`);
                            this.remoteStreams.delete(peerId);
                            // Dispatch state change to notify UI that remote stream is gone
                            this.notifyStateChange();
                        } else {
                            // Still have tracks, but notify UI that stream state changed
                            console.log(`[WebRTC] 🔄 Audio track removed but stream still has tracks, notifying UI`);
                            this.notifyStateChange();
                        }
                    }
                }
            };
            
            this.dispatchEvent({
                type: 'track',
                peerId,
                data: {
                    type: 'remote',
                    kind: event.track.kind as 'audio' | 'video',
                    enabled: event.track.enabled
                }
            });
        };
    }

    private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] No peer state found when setting up data channel for peer ${peerId}`);
            return;
        }

        console.log(`[WebRTC] Setting up data channel for peer ${peerId}, current phase: ${peerState.phase}`);
        peerState.dataChannel = channel;

        channel.onopen = () => {
            console.log(`[WebRTC] Data channel opened for peer ${peerId}`);
            console.log(`[WebRTC] Current connections after data channel open:`, Array.from(this.connections.keys()));
        };

        channel.onclose = () => {
            console.log(`[WebRTC] Data channel closed for peer ${peerId}`);
        };

        channel.onmessage = (event) => {
            console.log(`[WebRTC] Received message on data channel from peer ${peerId}`);
            try {
                const message = JSON.parse(event.data);
                this.dispatchEvent({
                    type: 'message',
                    peerId,
                    data: message
                    });
                } catch (error) {
                console.error(`[WebRTC] Error parsing message from peer ${peerId}:`, error);
            }
        };
    }

    // Signaling Message Handling
    private handleSignalingMessage = (message: SignalingMessage): void => {
        const { type, from: peerId, to: targetId } = message;
        
        console.log(`[WebRTC] Processing signaling message:`, { 
            type, 
            from: peerId, 
            to: targetId, 
            self: this.userId,
            isFromSelf: peerId === this.userId,
            isToSelf: targetId === this.userId
        });
        
        // Ignore messages from self
        if (peerId === this.userId) {
            console.log(`[WebRTC] Ignoring message from self (${peerId})`);
            return;
        }

        // Deduplicate messages (but never ignore media-state messages as they contain critical state updates)
        if (type !== 'media-state') {
            const messageId = `${type}-${peerId}-${JSON.stringify(message.data)}`;
            if (this.processedMessages.has(messageId)) {
                console.log(`[WebRTC] Ignoring duplicate message: ${messageId}`);
                return;
            }
            this.processedMessages.add(messageId);
        }

        // Clean up old messages
        if (this.processedMessages.size > 100) {
            const oldestMessage = Array.from(this.processedMessages)[0];
            this.processedMessages.delete(oldestMessage);
        }

        console.log(`[WebRTC] Received ${type} from peer ${peerId}`);

        switch (type) {
            case 'initiate':
                this.handleInitiate(peerId, message.data);
                break;
            case 'initiate-ack':
                this.handleInitiateAck(peerId, message.data);
                break;
            case 'offer':
                this.handleOffer(peerId, message.data);
                break;
            case 'answer':
                this.handleAnswer(peerId, message.data);
                break;
            case 'ice-candidate':
                if (message.candidate) {
                    this.handleIceCandidate(peerId, message.candidate);
                }
                break;
            case 'disconnect':
                this.handleDisconnect(peerId);
                break;
            case 'media-state':
                this.handleMediaState(peerId, message.data);
                break;
        }
    };

    private async handleInitiate(peerId: string, data: any): Promise<void> {
        const existingState = this.connections.get(peerId);
        if (existingState && ['connecting', 'connected'].includes(existingState.phase)) {
            console.log(`[WebRTC] Ignoring initiate from ${peerId} - already connected`);
            return;
        }

        // Clean up any existing state
        if (existingState) {
            this.cleanup(peerId);
        }

        // Create peer state as responder
        const peerState = this.createPeerState(peerId, false);
        peerState.phase = 'responding';
        this.connections.set(peerId, peerState);
        
        console.log(`[WebRTC] Created peer state for ${peerId} as responder, current connections:`, Array.from(this.connections.keys()));

        // Acknowledge initiation
        if (this.signalingService) {
            this.signalingService.send({
                type: 'initiate-ack',
                from: this.userId,
                to: peerId,
                data: { timestamp: Date.now() }
            });
        }

        console.log(`[WebRTC] Acknowledged initiation from peer ${peerId}`);
    }

    private async handleInitiateAck(peerId: string, data: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || !peerState.isInitiator || peerState.phase !== 'idle') {
            console.log(`[WebRTC] Ignoring initiate-ack from ${peerId} - invalid state`);
            return;
        }

        // Clear initiation timeout
        this.clearConnectionTimeout(peerId);

        // Start connection process
        peerState.phase = 'connecting';
        await this.createOffer(peerId);
    }

    private async createOffer(peerId: string, isRenegotiation: boolean = false): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) return;

        try {
            const connection = peerState.connection;
            
            // Add local tracks if available
            if (this.localStream) {
                const enabledTracks = this.localStream.getTracks().filter(track => track.enabled);
                console.log(`[WebRTC] Adding ${enabledTracks.length} enabled local tracks to offer for peer ${peerId} (renegotiation: ${isRenegotiation})`);
                console.log(`[WebRTC] 🔍 Track filtering details:`, {
                    totalTracks: this.localStream.getTracks().length,
                    enabledTracks: enabledTracks.length,
                    allTracks: this.localStream.getTracks().map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled })),
                    enabledTrackDetails: enabledTracks.map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled }))
                });
                
                // Double-check that our state variables match the track states
                const videoTracks = this.localStream.getVideoTracks();
                const audioTracks = this.localStream.getAudioTracks();
                const enabledVideoTracks = videoTracks.filter(t => t.enabled);
                const enabledAudioTracks = audioTracks.filter(t => t.enabled);
                
                console.log(`[WebRTC] 🔍 State consistency check:`, {
                    hasLocalVideo: this.hasLocalVideo,
                    hasLocalAudio: this.hasLocalAudio,
                    videoTracksCount: videoTracks.length,
                    audioTracksCount: audioTracks.length,
                    enabledVideoTracksCount: enabledVideoTracks.length,
                    enabledAudioTracksCount: enabledAudioTracks.length,
                    stateMatchesVideo: this.hasLocalVideo === (enabledVideoTracks.length > 0),
                    stateMatchesAudio: this.hasLocalAudio === (enabledAudioTracks.length > 0)
                });
                
                // Get existing senders to avoid duplicates
                const existingSenders = connection.getSenders();
                const existingTrackIds = new Set(existingSenders.map(s => s.track?.id).filter(id => id));
                
                enabledTracks.forEach(track => {
                    console.log(`[WebRTC] Processing enabled track:`, { kind: track.kind, enabled: track.enabled, id: track.id });
                    
                    // Check if this track is already added
                    if (existingTrackIds.has(track.id)) {
                        console.log(`[WebRTC] Track ${track.id} already exists in connection, skipping`);
                return;
            }
            
                    try {
                        const sender = connection.addTrack(track, this.localStream!);
                        console.log(`[WebRTC] Track sender created:`, { 
                            trackId: sender.track?.id, 
                            kind: sender.track?.kind,
                            enabled: sender.track?.enabled 
                        });
                        // Track this as a local sender track
                        if (sender.track) {
                            peerState.localSenderTrackIds.add(sender.track.id);
                            console.log(`[WebRTC] Added track ${sender.track.id} to local sender track IDs for peer ${peerId}`);
                        }
                    } catch (error) {
                        console.error(`[WebRTC] Failed to add track ${track.id} to connection:`, error);
                    }
                });
            } else {
                console.log(`[WebRTC] No local stream available for offer to peer ${peerId}`);
            }

            // Only create data channel for initial connection, not renegotiation
            if (!isRenegotiation) {
                // Create data channel (initiator always creates)
                const dataChannel = connection.createDataChannel('messageChannel');
                this.setupDataChannel(dataChannel, peerId);
            } else {
                console.log(`[WebRTC] Skipping data channel creation for renegotiation`);
            }

            // Create offer
            const offer = await connection.createOffer();
            
            // CRITICAL FIX: Modify SDP to remove disabled media lines
            if (isRenegotiation && offer.sdp) {
                // Check if we have any enabled tracks at all
                const enabledVideoTracks = this.localStream ? this.localStream.getVideoTracks().filter(t => t.enabled) : [];
                const enabledAudioTracks = this.localStream ? this.localStream.getAudioTracks().filter(t => t.enabled) : [];
                const hasAnyEnabledTracks = enabledVideoTracks.length > 0 || enabledAudioTracks.length > 0;
                
                // Only modify SDP if we have no enabled tracks at all AND we're turning off media
                if (!hasAnyEnabledTracks) {
                    console.log(`[WebRTC] 🔧 No enabled tracks found, attempting to remove all media lines from SDP for peer ${peerId}`);
                    
                    let modifiedSdp = offer.sdp;
                    let sdpModified = false;
                    
                    // Remove video media lines
                    const originalSdp = modifiedSdp;
                    modifiedSdp = this.removeVideoMediaLines(modifiedSdp);
                    if (modifiedSdp !== originalSdp) {
                        sdpModified = true;
                    }
                    
                    // Remove audio media lines
                    const audioOriginalSdp = modifiedSdp;
                    modifiedSdp = this.removeAudioMediaLines(modifiedSdp);
                    if (modifiedSdp !== audioOriginalSdp) {
                        sdpModified = true;
                    }
                    
                    // Only use modified SDP if it was actually changed and is valid
                    if (sdpModified && this.isValidSDP(modifiedSdp)) {
                        console.log(`[WebRTC] 🔧 Using modified SDP for peer ${peerId}`);
                        offer.sdp = modifiedSdp;
                    } else {
                        console.log(`[WebRTC] 🔧 Using original SDP for peer ${peerId} (no modifications or invalid result)`);
                    }
                } else {
                    console.log(`[WebRTC] 🔧 Has enabled tracks, using original SDP for peer ${peerId}`);
                }
            }
            
            await connection.setLocalDescription(offer);

            // Log the offer details to verify track inclusion
            if (isRenegotiation) {
                console.log(`[WebRTC] 🔍 Offer SDP analysis for peer ${peerId}:`, {
                    sdpLength: offer.sdp?.length || 0,
                    hasVideo: offer.sdp?.includes('m=video') || false,
                    hasAudio: offer.sdp?.includes('m=audio') || false,
                    videoLines: offer.sdp?.split('\n').filter(line => line.startsWith('m=video')).length || 0,
                    audioLines: offer.sdp?.split('\n').filter(line => line.startsWith('m=audio')).length || 0
                });
            }

            // Send offer
            if (this.signalingService) {
                this.signalingService.send({
                    type: 'offer',
                    from: this.userId,
                    to: peerId,
                    data: offer
                });
            }

            console.log(`[WebRTC] Offer sent to peer ${peerId} (renegotiation: ${isRenegotiation})`);
            
            // Final verification of track state after offer creation
            if (isRenegotiation && this.localStream) {
                const finalVideoTracks = this.localStream.getVideoTracks();
                const finalAudioTracks = this.localStream.getAudioTracks();
                const finalEnabledVideoTracks = finalVideoTracks.filter(t => t.enabled);
                const finalEnabledAudioTracks = finalAudioTracks.filter(t => t.enabled);
                
                console.log(`[WebRTC] 🔍 Final track state verification for peer ${peerId}:`, {
                    hasLocalVideo: this.hasLocalVideo,
                    hasLocalAudio: this.hasLocalAudio,
                    videoTracksCount: finalVideoTracks.length,
                    audioTracksCount: finalAudioTracks.length,
                    enabledVideoTracksCount: finalEnabledVideoTracks.length,
                    enabledAudioTracksCount: finalEnabledAudioTracks.length,
                    videoTrackIds: finalVideoTracks.map(t => ({ id: t.id, enabled: t.enabled })),
                    audioTrackIds: finalAudioTracks.map(t => ({ id: t.id, enabled: t.enabled }))
                });
            }

        } catch (error) {
            console.error(`[WebRTC] Failed to create offer for peer ${peerId}:`, error);
            this.handleError(peerId, error);
        }
    }

    private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring offer from ${peerId} - no peer state found`);
            return;
        }
        
        // Allow offers in both 'responding' (initial connection) and 'connected' (renegotiation) states
        if (peerState.phase !== 'responding' && peerState.phase !== 'connected') {
            console.log(`[WebRTC] Ignoring offer from ${peerId} - invalid state (phase: ${peerState.phase})`);
            return;
        }

        // For renegotiation (connected state), both initiator and responder can receive offers
        // For initial connection (responding state), only responder should receive offers
        if (peerState.phase === 'responding' && peerState.isInitiator) {
            console.log(`[WebRTC] Ignoring initial offer from ${peerId} - we are the initiator, should not receive initial offers`);
            return;
        }

        console.log(`[WebRTC] Processing offer from peer ${peerId} (renegotiation: ${peerState.phase === 'connected'})`);

        try {
            const connection = peerState.connection;

            // Add local tracks if available
            if (this.localStream) {
                const enabledTracks = this.localStream.getTracks().filter(track => track.enabled);
                console.log(`[WebRTC] Adding ${enabledTracks.length} enabled local tracks to answer for peer ${peerId}`);
                
                // Get existing senders to avoid duplicates
                const existingSenders = connection.getSenders();
                const existingTrackIds = new Set(existingSenders.map(s => s.track?.id).filter(id => id));
                
                enabledTracks.forEach(track => {
                    console.log(`[WebRTC] Processing enabled track:`, { kind: track.kind, enabled: track.enabled, id: track.id });
                    
                    // Check if this track is already added
                    if (existingTrackIds.has(track.id)) {
                        console.log(`[WebRTC] Track ${track.id} already exists in connection, skipping`);
                return;
            }

                    try {
                        const sender = connection.addTrack(track, this.localStream!);
                        console.log(`[WebRTC] Track sender created:`, { 
                            trackId: sender.track?.id, 
                            kind: sender.track?.kind,
                            enabled: sender.track?.enabled 
                        });
                        // Track this as a local sender track
                        if (sender.track) {
                            peerState.localSenderTrackIds.add(sender.track.id);
                            console.log(`[WebRTC] Added track ${sender.track.id} to local sender track IDs for peer ${peerId}`);
                        }
        } catch (error) {
                        console.error(`[WebRTC] Failed to add track ${track.id} to connection:`, error);
                    }
                });
            } else {
                console.log(`[WebRTC] No local stream available for answer to peer ${peerId}`);
                console.log(`[WebRTC] This means the responder peer doesn't have audio/video enabled yet`);
            }

            // Note: Responder should NOT create data channel - it will receive it via ondatachannel
            // The initiator creates the data channel, responder receives it
            console.log(`[WebRTC] Responder: Waiting for data channel from initiator`);

            // Set remote description
            try {
                await connection.setRemoteDescription(new RTCSessionDescription(offer));
                console.log(`[WebRTC] Remote description set successfully for peer ${peerId}`);
            } catch (error) {
                console.error(`[WebRTC] Failed to set remote description for peer ${peerId}:`, error);
                throw error;
            }

            // Create answer
            let answer: RTCSessionDescriptionInit;
            try {
                answer = await connection.createAnswer();
                
                // CRITICAL FIX: Modify SDP to remove disabled media lines (same logic as offer)
                if (peerState.phase === 'connected' && answer.sdp) { // Only for renegotiation
                    // Check if we have any enabled tracks at all
                    const enabledVideoTracks = this.localStream ? this.localStream.getVideoTracks().filter(t => t.enabled) : [];
                    const enabledAudioTracks = this.localStream ? this.localStream.getAudioTracks().filter(t => t.enabled) : [];
                    const hasAnyEnabledTracks = enabledVideoTracks.length > 0 || enabledAudioTracks.length > 0;
                    
                    // Only modify SDP if we have no enabled tracks at all AND we're turning off media
                    if (!hasAnyEnabledTracks) {
                        console.log(`[WebRTC] 🔧 No enabled tracks found, attempting to remove all media lines from answer SDP for peer ${peerId}`);
                        
                        let modifiedSdp = answer.sdp;
                        let sdpModified = false;
                        
                        // Remove video media lines
                        const originalSdp = modifiedSdp;
                        modifiedSdp = this.removeVideoMediaLines(modifiedSdp);
                        if (modifiedSdp !== originalSdp) {
                            sdpModified = true;
                        }
                        
                        // Remove audio media lines
                        const audioOriginalSdp = modifiedSdp;
                        modifiedSdp = this.removeAudioMediaLines(modifiedSdp);
                        if (modifiedSdp !== audioOriginalSdp) {
                            sdpModified = true;
                        }
                        
                        // Only use modified SDP if it was actually changed and is valid
                        if (sdpModified && this.isValidSDP(modifiedSdp)) {
                            console.log(`[WebRTC] 🔧 Using modified answer SDP for peer ${peerId}`);
                            answer.sdp = modifiedSdp;
                        } else {
                            console.log(`[WebRTC] 🔧 Using original answer SDP for peer ${peerId} (no modifications or invalid result)`);
                        }
                    } else {
                        console.log(`[WebRTC] 🔧 Has enabled tracks, using original answer SDP for peer ${peerId}`);
                    }
                }
                
                await connection.setLocalDescription(answer);
                console.log(`[WebRTC] Answer created and local description set for peer ${peerId}`);
            } catch (error) {
                console.error(`[WebRTC] Failed to create answer for peer ${peerId}:`, error);
                throw error;
            }

            // Send answer
            if (this.signalingService) {
                const answerMessage = {
                    type: 'answer',
                    from: this.userId,
                    to: peerId,
                    data: answer
                };
                console.log(`[WebRTC] Sending answer message:`, answerMessage);
                this.signalingService.send(answerMessage);
            }

            // Only change phase if this is the initial connection
            if (peerState.phase === 'responding') {
                peerState.phase = 'connecting';
            }
            console.log(`[WebRTC] Answer sent to peer ${peerId} (renegotiation: ${peerState.phase === 'connected'})`);

        } catch (error) {
            console.error(`[WebRTC] Failed to handle offer from peer ${peerId}:`, error);
            this.handleError(peerId, error);
        }
    }

    private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring answer from ${peerId} - no peer state found`);
            return;
        }
        
        console.log(`[WebRTC] handleAnswer: peerId=${peerId}, phase=${peerState.phase}, isInitiator=${peerState.isInitiator}`);
        
        // Allow answers in both 'connecting' (initial connection) and 'connected' (renegotiation) states
        if (peerState.phase !== 'connecting' && peerState.phase !== 'connected') {
            console.log(`[WebRTC] Ignoring answer from ${peerId} - invalid state (phase: ${peerState.phase})`);
            return;
        }

        // For initial connection: only initiators should handle answers
        // For renegotiation: both peers can handle answers (whoever sent the offer should receive the answer)
        if (peerState.phase === 'connecting' && !peerState.isInitiator) {
            console.log(`[WebRTC] Ignoring initial answer from ${peerId} - we are the responder, should not receive initial answers`);
            return;
        }
        
        // For renegotiation: the peer that sent the offer (isInitiator=true) should receive the answer
        if (peerState.phase === 'connected' && !peerState.isInitiator) {
            console.log(`[WebRTC] Ignoring renegotiation answer from ${peerId} - we are not the initiator of this renegotiation`);
            return;
        }

        try {
            const connection = peerState.connection;
            console.log(`[WebRTC] Processing answer from peer ${peerId} (phase: ${peerState.phase}, isInitiator: ${peerState.isInitiator})`);
            await connection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`[WebRTC] Remote description set for peer ${peerId}`);
            console.log(`[WebRTC] Answer processing completed successfully for peer ${peerId}`);

        } catch (error) {
            console.error(`[WebRTC] Failed to set remote description for peer ${peerId}:`, error);
            this.handleError(peerId, error);
        }
    }

    private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) return;

        try {
            await peerState.connection.addIceCandidate(candidate);
        } catch (error) {
            console.error(`[WebRTC] Failed to add ICE candidate for peer ${peerId}:`, error);
        }
    }

    private handleDisconnect(peerId: string): void {
        console.log(`[WebRTC] Received disconnect from peer ${peerId}`);
        this.dispatchConnectionEvent(peerId, 'disconnected');
        this.cleanup(peerId);
    }

    private handleMediaState(peerId: string, mediaState: any): void {
        console.log(`[WebRTC] 📥 RECEIVED MEDIA STATE FROM PEER ${peerId}:`, mediaState);
        console.log(`[WebRTC] 📥 MEDIA STATE DEBUG - Current state before update:`, {
            hasRemoteVideo: this.hasRemoteVideo,
            hasRemoteAudio: this.hasRemoteAudio,
            remoteStreamsSize: this.remoteStreams.size,
            remoteStreamKeys: Array.from(this.remoteStreams.keys()),
            peerId
        });
        
        let stateChanged = false;
        
        // Update remote state based on received media state
        if (mediaState.video !== undefined) {
            console.log(`[WebRTC] 📥 Processing video state change: ${this.hasRemoteVideo} -> ${mediaState.video}`);
            
            // CRITICAL: Update the state BEFORE cleaning up streams
            const oldVideoState = this.hasRemoteVideo;
            this.updateRemoteVideoState(mediaState.video, false); // Don't notify UI yet
            stateChanged = stateChanged || (oldVideoState !== this.hasRemoteVideo);
            console.log(`[WebRTC] ✅ Updated remote video state to: ${mediaState.video}`);
            
            // If video is disabled, clean up the remote stream for this peer
            if (!mediaState.video) {
                const remoteStream = this.remoteStreams.get(peerId);
                if (remoteStream) {
                    console.log(`[WebRTC] 🧹 Cleaning up remote stream for peer ${peerId} (video disabled)`, {
                        streamId: remoteStream.id,
                        videoTracks: remoteStream.getVideoTracks().length,
                        audioTracks: remoteStream.getAudioTracks().length
                    });
                    
                    // End all tracks in the remote stream to ensure they're properly stopped
                    const allTracks = remoteStream.getTracks();
                    allTracks.forEach(track => {
                        console.log(`[WebRTC] 🛑 Ending remote track:`, {
                            kind: track.kind,
                            id: track.id,
                            enabled: track.enabled,
                            readyState: track.readyState
                        });
                        track.stop();
                    });
                    
                    this.remoteStreams.delete(peerId);
                    console.log(`[WebRTC] 🧹 Remote stream deleted from map for peer ${peerId}`);
                    stateChanged = true;
                } else {
                    console.log(`[WebRTC] 🔄 Video disabled for peer ${peerId} but no remote stream to clean up`);
                }
            } else {
                console.log(`[WebRTC] 📥 Video enabled for peer ${peerId}, no stream cleanup needed`);
            }
            
            // VERIFICATION: Log the final state after all updates
            console.log(`[WebRTC] 📥 MEDIA STATE VERIFICATION - Final state after video update:`, {
                hasRemoteVideo: this.hasRemoteVideo,
                hasRemoteAudio: this.hasRemoteAudio,
                remoteStreamsSize: this.remoteStreams.size,
                remoteStreamKeys: Array.from(this.remoteStreams.keys()),
            peerId,
                mediaStateVideo: mediaState.video
            });
        }
        
        if (mediaState.audio !== undefined) {
            this.updateRemoteAudioState(mediaState.audio);
            console.log(`[WebRTC] Updated remote audio state to: ${mediaState.audio}`);
            
            // If audio is disabled and no video, clean up the remote stream
            if (!mediaState.audio) {
                const remoteStream = this.remoteStreams.get(peerId);
                if (remoteStream) {
                    const remainingVideoTracks = remoteStream.getVideoTracks().filter(track => track.readyState !== 'ended');
                    if (remainingVideoTracks.length === 0) {
                        console.log(`[WebRTC] 🧹 Cleaning up remote stream for peer ${peerId} (audio disabled, no video)`);
                        this.remoteStreams.delete(peerId);
                        // Dispatch state change to notify UI that remote stream is gone
                        this.notifyStateChange();
                } else {
                        console.log(`[WebRTC] 🔄 Audio disabled for peer ${peerId} but video still available, notifying UI`);
                        // Still notify UI even if stream has video
                        this.notifyStateChange();
                    }
                } else {
                    console.log(`[WebRTC] 🔄 Audio disabled for peer ${peerId} but no remote stream to clean up`);
                    // Still notify UI even if no stream to clean up
                    this.notifyStateChange();
                }
            }
        }
        
        // Single notification at the end to avoid race conditions
        if (stateChanged) {
            console.log(`[WebRTC] 📥 MEDIA STATE: State changed, notifying UI`);
            this.notifyStateChange();
        }
        
        this.dispatchEvent({
            type: 'media',
            peerId,
            data: mediaState
        });
    }

    private handleConnectionTimeout(peerId: string): void {
        console.log(`[WebRTC] Connection timeout for peer ${peerId}`);
        this.handleError(peerId, new Error('Connection timeout'));
        this.cleanup(peerId);
    }

    private clearConnectionTimeout(peerId: string): void {
        const peerState = this.connections.get(peerId);
        if (peerState?.connectionTimeout) {
            clearTimeout(peerState.connectionTimeout);
            peerState.connectionTimeout = null;
        }
    }

    private handleError(peerId: string, error: unknown): void {
        console.error(`[WebRTC] Error for peer ${peerId}:`, error);
        
        this.dispatchEvent({
            type: 'error',
            peerId,
            data: {
                error: error instanceof Error ? error : new Error(String(error)),
                message: error instanceof Error ? error.message : String(error)
            }
        });

        this.dispatchConnectionEvent(peerId, 'failed');
    }

    private dispatchConnectionEvent(peerId: string, state: ConnectionPhase): void {
        this.dispatchEvent({
            type: 'connection',
            peerId,
            data: {
                state,
                connected: state === 'connected'
            }
        });
    }

    private cleanup(peerId?: string): void {
        if (peerId) {
            const peerState = this.connections.get(peerId);
            if (peerState) {
                console.log(`[WebRTC] Cleaning up connection for peer ${peerId}, phase: ${peerState.phase}`);
                this.clearConnectionTimeout(peerId);
                
                if (peerState.dataChannel) {
                    peerState.dataChannel.close();
                }
                
                if (peerState.connection) {
                    peerState.connection.close();
                }
                
                this.connections.delete(peerId);
                
                // Clean up remote stream for this peer
                this.remoteStreams.delete(peerId);
                console.log(`[WebRTC] Cleaned up connection and remote stream for peer ${peerId}`);
                
                // Reset remote state variables if no more remote streams
                if (this.remoteStreams.size === 0) {
                    console.log(`[WebRTC] 🔄 No more remote streams, resetting remote state variables`);
                    this.updateRemoteVideoState(false);
                    this.updateRemoteAudioState(false);
                }
            }
        } else {
            // Clean up all connections
            console.log(`[WebRTC] Cleaning up all connections:`, Array.from(this.connections.keys()));
            for (const [id, state] of this.connections.entries()) {
                this.clearConnectionTimeout(id);
                if (state.dataChannel) state.dataChannel.close();
                if (state.connection) state.connection.close();
            }
            this.connections.clear();
            
            // Clean up all remote streams
            this.remoteStreams.clear();
            
            // Reset remote state variables
            console.log(`[WebRTC] 🔄 All connections cleaned up, resetting remote state variables`);
            this.updateRemoteVideoState(false);
            this.updateRemoteAudioState(false);
            
            if (this.messageHandlerId !== null && this.signalingService) {
                this.signalingService.removeMessageHandler(this.messageHandlerId);
                this.messageHandlerId = null;
            }
            
            this.processedMessages.clear();
            console.log(`[WebRTC] Cleaned up all connections and remote streams`);
        }
    }

    // Track ongoing renegotiations to prevent duplicates
    private ongoingRenegotiations = new Set<string>();

    // Force renegotiation to include new tracks
    private async forceRenegotiation(peerId: string): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || peerState.phase !== 'connected') {
            console.log(`[WebRTC] Cannot renegotiate - peer ${peerId} not connected`);
            return;
        }

        // Prevent multiple simultaneous renegotiations for the same peer
        if (this.ongoingRenegotiations.has(peerId)) {
            console.log(`[WebRTC] ⚠️ Renegotiation already in progress for peer ${peerId}, skipping`);
            return;
        }

        this.ongoingRenegotiations.add(peerId);
        console.log(`[WebRTC] 🔒 Starting renegotiation for peer ${peerId}`);

        try {
            // For renegotiation, the peer sending the offer becomes the initiator
            console.log(`[WebRTC] Renegotiation: Setting ${this.userId} as initiator for peer ${peerId} (was: ${peerState.isInitiator})`);
            peerState.isInitiator = true;
            
            // Ensure tracks are properly synchronized before creating offer
            if (this.localStream) {
                const enabledTracks = this.localStream.getTracks().filter(track => track.enabled);
                console.log(`[WebRTC] 🔄 Pre-negotiation track sync for peer ${peerId}:`, {
                    totalTracks: this.localStream.getTracks().length,
                    enabledTracks: enabledTracks.length,
                    enabledTrackIds: enabledTracks.map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled }))
                });
            }
            
            // Use the existing createOffer method which properly adds tracks to the connection
            console.log(`[WebRTC] 📤 PEER ${this.userId} SENDING RENEGOTIATION OFFER WITH ENABLED TRACKS TO PEER ${peerId}`);
            await this.createOffer(peerId, true); // true = isRenegotiation
            
            console.log(`[WebRTC] Renegotiation offer sent to peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] Failed to force renegotiation for peer ${peerId}:`, error);
        } finally {
            this.ongoingRenegotiations.delete(peerId);
            console.log(`[WebRTC] 🔓 Completed renegotiation for peer ${peerId}`);
        }
    }

    // Configuration update
    public updateConfiguration(config: Partial<WebRTCConfig>): void {
        this.config = { ...this.config, ...config };
        if (config.iceServers) {
            this.rtcConfiguration.iceServers = config.iceServers;
        }
        if (config.iceCandidatePoolSize !== undefined) {
            this.rtcConfiguration.iceCandidatePoolSize = config.iceCandidatePoolSize;
        }
    }

    // Send media state to peer
    private async sendMediaState(peerId: string, mediaState: MediaState): Promise<void> {
        if (this.signalingService) {
            console.log(`[WebRTC] 📤 SENDING MEDIA STATE TO PEER ${peerId}:`, mediaState);
            console.log(`[WebRTC] 📤 MEDIA STATE SEND DEBUG:`, {
                from: this.userId,
                to: peerId,
                video: mediaState.video,
                audio: mediaState.audio,
                hasLocalVideo: this.hasLocalVideo,
                hasLocalAudio: this.hasLocalAudio
            });
            this.signalingService.send({
                type: 'media-state',
                from: this.userId,
                to: peerId,
                data: mediaState
            });
        }
    }

    // Helper methods to modify SDP
    private removeVideoMediaLines(sdp: string): string {
        const lines = sdp.split('\n');
        const result: string[] = [];
        let skipSection = false;
        let mediaIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this is a video media line
            if (line.startsWith('m=video')) {
                skipSection = true;
                console.log(`[WebRTC] 🔧 Skipping video media section at line ${i}: ${line}`);
                continue;
            }
            
            // If we're skipping a section, continue until we hit the next media line
            if (skipSection) {
                if (line.startsWith('m=')) {
                    // Found next media section, stop skipping
                    skipSection = false;
                    result.push(line);
                } else {
                    // Still in video section, skip this line
                    // Only log occasionally to avoid spam
                    if (Math.random() < 0.1) {
                        console.log(`[WebRTC] 🔧 Skipping video section line: ${line}`);
                    }
                    continue;
                }
            } else {
                result.push(line);
            }
        }
        
        const modifiedSdp = result.join('\n');
        console.log(`[WebRTC] 🔧 SDP modified: removed video media lines, length: ${sdp.length} -> ${modifiedSdp.length}`);
        
        // Validate the modified SDP has proper structure
        if (!this.isValidSDP(modifiedSdp)) {
            console.error(`[WebRTC] ❌ Modified SDP is invalid, reverting to original`);
            return sdp;
        }
        
        return modifiedSdp;
    }

    private removeAudioMediaLines(sdp: string): string {
        const lines = sdp.split('\n');
        const result: string[] = [];
        let skipSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this is an audio media line
            if (line.startsWith('m=audio')) {
                skipSection = true;
                console.log(`[WebRTC] 🔧 Skipping audio media section at line ${i}: ${line}`);
                continue;
            }
            
            // If we're skipping a section, continue until we hit the next media line
            if (skipSection) {
                if (line.startsWith('m=')) {
                    // Found next media section, stop skipping
                    skipSection = false;
                    result.push(line);
                } else {
                    // Still in audio section, skip this line
                    // Only log occasionally to avoid spam
                    if (Math.random() < 0.1) {
                        console.log(`[WebRTC] 🔧 Skipping audio section line: ${line}`);
                    }
                    continue;
                }
            } else {
                result.push(line);
            }
        }
        
        const modifiedSdp = result.join('\n');
        console.log(`[WebRTC] 🔧 SDP modified: removed audio media lines, length: ${sdp.length} -> ${modifiedSdp.length}`);
        
        // Validate the modified SDP has proper structure
        if (!this.isValidSDP(modifiedSdp)) {
            console.error(`[WebRTC] ❌ Modified SDP is invalid, reverting to original`);
            return sdp;
        }
        
        return modifiedSdp;
    }

    // Validate SDP structure
    private isValidSDP(sdp: string): boolean {
        const lines = sdp.split('\n');
        
        // Check for required SDP sections
        const hasSession = lines.some(line => line.startsWith('v='));
        const hasConnection = lines.some(line => line.startsWith('c='));
        const hasTiming = lines.some(line => line.startsWith('t='));
        
        // Check for at least one media section (data channel counts as media)
        const mediaLines = lines.filter(line => line.startsWith('m='));
        const hasMedia = mediaLines.length > 0;
        
        // Basic validation - must have session info and at least one media section
        let isValid = hasSession && hasConnection && hasTiming && hasMedia;
        
        if (isValid) {
            // Additional validation: check that each media line has proper structure
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('m=')) {
                    // A media line should be followed by at least a connection line or attribute
                    let hasMediaContent = false;
                    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                        if (lines[j].startsWith('c=') || lines[j].startsWith('a=') || lines[j].startsWith('m=')) {
                            hasMediaContent = true;
                    break;
                    }
                    }
                    if (!hasMediaContent) {
                        console.warn(`[WebRTC] ⚠️ Media line at index ${i} appears to have no content: ${lines[i]}`);
                        isValid = false;
                    break;
            }
                }
            }
        }
        
        // Additional validation: check for specific SDP format issues
        if (isValid) {
            // Check for malformed attribute lines
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('a=') && line.includes('max-message-size')) {
                    // Check if the max-message-size line is properly formatted
                    if (!line.match(/^a=max-message-size:\d+$/)) {
                        console.warn(`[WebRTC] ⚠️ Malformed max-message-size line: ${line}`);
                        isValid = false;
                        break;
                    }
                }
            }
        }
        
        return isValid;
    }
} 