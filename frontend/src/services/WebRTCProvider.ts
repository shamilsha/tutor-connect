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
    connectionTimeout: NodeJS.Timeout | null;
    mediaState: {
        audio: boolean;
        video: boolean;
    };
    // Track which tracks we've added as senders to avoid counting them as remote
    localSenderTrackIds: Set<string>;
    // State synchronization tracking
    waitingForAck: boolean;
    pendingAction: string | null;
}

export class WebRTCProvider implements IWebRTCProvider {
    // Static instance management to prevent multiple instances
    private static activeInstance: WebRTCProvider | null = null;
    private static instanceId = 0;

    // Instance properties
    private readonly instanceId: number;
    private isDestroyed = false;

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
    private messageTimestamps: Map<string, number> = new Map(); // Track message timestamps for better deduplication
    private lastResetTime: number = 0; // Track when the last reset occurred
    // State tracking variables
    private hasLocalAudio: boolean = false;
    private hasLocalVideo: boolean = false;
    private hasRemoteAudio: boolean = false;
    private hasRemoteVideo: boolean = false;
    
    // Screen sharing state
    private screenShareStream: MediaStream | null = null;
    private isScreenSharing: boolean = false;
    
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
        // Ensure only one active instance
        if (WebRTCProvider.activeInstance && !WebRTCProvider.activeInstance.isDestroyed) {
            console.log(`[WebRTC] ⚠️ Destroying existing instance ${WebRTCProvider.activeInstance.instanceId} before creating new one`);
            WebRTCProvider.activeInstance.destroy();
        }

        // Set this as the active instance
        WebRTCProvider.activeInstance = this;
        this.instanceId = WebRTCProvider.instanceId++;

        this.config = config;
        this.userId = config.userId;
        this.rtcConfiguration = {
            iceServers: config.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            // Optimize for faster connection establishment
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            // Reduce ICE gathering time for faster connection
            iceCandidatePoolSize: Math.min(config.iceCandidatePoolSize || 10, 5)
        };

        // Initialize event listeners
        for (const type of ['connection', 'track', 'media', 'stream', 'error', 'message'] as WebRTCEventType[]) {
            this.eventListeners.set(type, new Set());
        }
        
        console.log(`[WebRTC] WebRTCProvider instance ${this.instanceId} created for user ${this.userId}`);
        
        // DIAGNOSTIC CODE COMMENTED OUT - Only for debugging when needed
        // this.runConnectivityTest();
        // this.runNetworkDiagnostics();
    }
    
    // DIAGNOSTIC CODE COMMENTED OUT - Only for debugging when needed
    /*
    // Network connectivity test
    private async runConnectivityTest(): Promise<void> {
        try {
            console.log(`[WebRTC] 🔍 Running network connectivity test...`);
            
            // Test basic connectivity
            const testConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            // Create a dummy data channel to trigger ICE gathering
            const testChannel = testConnection.createDataChannel('test');
            
            // Monitor ICE candidates
            let candidateCount = 0;
            let hostCandidates = 0;
            let srflxCandidates = 0;
            
            testConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    candidateCount++;
                    const candidateString = event.candidate.candidate;
                    if (candidateString.includes('typ host')) {
                        hostCandidates++;
                    } else if (candidateString.includes('typ srflx')) {
                        srflxCandidates++;
                    }
                    
                    console.log(`[WebRTC] 🔍 Test candidate ${candidateCount}: ${event.candidate.type} - ${event.candidate.address}:${event.candidate.port}`);
                } else {
                    console.log(`[WebRTC] 🔍 Connectivity test completed:`, {
                        totalCandidates: candidateCount,
                        hostCandidates,
                        srflxCandidates,
                        hasHostCandidates: hostCandidates > 0,
                        hasSrflxCandidates: srflxCandidates > 0,
                        canConnectDirectly: hostCandidates > 0,
                        canConnectViaStun: srflxCandidates > 0
                    });
                    
                    // Clean up test connection
                    testConnection.close();
                }
            };
            
            // Create a dummy offer to trigger ICE gathering
            const offer = await testConnection.createOffer();
            await testConnection.setLocalDescription(offer);
            
        } catch (error) {
            console.error(`[WebRTC] ❌ Connectivity test failed:`, error);
        }
    }
    */
    
    // DIAGNOSTIC CODE COMMENTED OUT - Only for debugging when needed
    /*
    // Enhanced network diagnostics
    private async runNetworkDiagnostics(): Promise<void> {
        try {
            console.log(`[WebRTC] 🔍 Running enhanced network diagnostics...`);
            
            // Test basic network connectivity
            const networkInfo = {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                onLine: navigator.onLine,
                connection: (navigator as any).connection?.effectiveType || 'unknown',
                timestamp: new Date().toISOString()
            };
            
            console.log(`[WebRTC] 🔍 Network Info:`, networkInfo);
            
            // Test if we can reach the signaling server
            try {
                const response = await fetch('http://192.168.18.15:8081', { 
                    method: 'GET',
                    mode: 'no-cors' // Just test connectivity
                });
                console.log(`[WebRTC] ✅ Signaling server reachable`);
            } catch (error) {
                console.error(`[WebRTC] ❌ Signaling server not reachable:`, error);
            }
            
            // Test if we can reach the backend
            try {
                const response = await fetch('http://192.168.18.15:8080/api/users/login', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'test', password: 'test' })
                });
                console.log(`[WebRTC] ✅ Backend server reachable (status: ${response.status})`);
            } catch (error) {
                console.error(`[WebRTC] ❌ Backend server not reachable:`, error);
            }

            // Test direct connectivity between machines
            console.log(`[WebRTC] 🔍 Testing direct machine connectivity...`);
            
            // Test if we can reach the other machine's IP
              const testIPs = ['192.168.18.15', '192.168.18.56']; // Add both machine IPs
            for (const ip of testIPs) {
                try {
                    // Test HTTP connectivity
                    const response = await fetch(`http://${ip}:3000`, { 
                        method: 'GET',
                        mode: 'no-cors'
                    });
                    console.log(`[WebRTC] ✅ Can reach ${ip}:3000 (frontend)`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.log(`[WebRTC] ❌ Cannot reach ${ip}:3000 (frontend):`, errorMessage);
                }
            }

            // Test UDP connectivity (simulate with WebRTC test)
            console.log(`[WebRTC] 🔍 Testing UDP connectivity with WebRTC...`);
            try {
                const testConnection = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                
                let candidateCount = 0;
                let hasPublicIP = false;
                
                testConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        candidateCount++;
                        const candidateString = event.candidate.candidate;
                        if (candidateString.includes('typ srflx')) {
                            hasPublicIP = true;
                            console.log(`[WebRTC] ✅ Public IP obtained via STUN: ${event.candidate.address}`);
                        }
                        console.log(`[WebRTC] 🔍 Test candidate ${candidateCount}: ${event.candidate.type} - ${event.candidate.address}:${event.candidate.port}`);
                    } else {
                        console.log(`[WebRTC] 🔍 UDP connectivity test completed:`, {
                            totalCandidates: candidateCount,
                            hasPublicIP,
                            canConnectDirectly: hasPublicIP
                        });
                        testConnection.close();
                    }
                };
                
                const offer = await testConnection.createOffer();
                await testConnection.setLocalDescription(offer);
                
            } catch (error) {
                console.error(`[WebRTC] ❌ UDP connectivity test failed:`, error);
            }
            
        } catch (error) {
            console.error(`[WebRTC] ❌ Network diagnostics failed:`, error);
        }
    }
    */

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
            
            // Whoever clicks the Connect button first becomes the initiator for this connection
            console.log(`[WebRTC] ${this.userId} is the initiator for this connection to peer ${peerId}`);
            
            // Send initiation intent
            this.signalingService.send({
                type: 'initiate',
                from: this.userId,
                to: peerId,
                data: { timestamp: Date.now() }
            });

            // Create peer state
            const peerState = this.createPeerState(peerId);
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

    public async disconnectAll(): Promise<void> {
        console.log(`[WebRTC] Disconnecting from all peers and resetting state`);
        
        try {
            // Use the comprehensive reset method
            await this.reset();
            
            console.log(`[WebRTC] Disconnect all completed successfully`);
        } catch (error) {
            console.error(`[WebRTC] Error during disconnect all:`, error);
            throw error;
        }
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

        // Track if we need to renegotiate for any peer
        const peersNeedingRenegotiation: string[] = [];
        let localStreamChanged = false;

        // Store track references before removing them
        const audioTrackToRemove = options.audio === false ? this.localStream.getAudioTracks()[0] : null;
        const videoTrackToRemove = options.video === false ? this.localStream.getVideoTracks()[0] : null;
        
        // Store track IDs for sender removal
        const audioTrackIdToRemove = audioTrackToRemove?.id;
        const videoTrackIdToRemove = videoTrackToRemove?.id;

        // Handle audio track changes
        if (options.audio !== undefined) {
            const currentAudioTrack = this.localStream.getAudioTracks()[0];
            
            if (options.audio) {
                // Turning audio ON - create new track if none exists
                if (!currentAudioTrack) {
                    console.log('[WebRTC] 🔄 Creating new audio track');
                    try {
                        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        const newAudioTrack = audioStream.getAudioTracks()[0];
                        if (newAudioTrack) {
                            // Check if we already have an audio track to avoid duplicates
                            const existingAudioTracks = this.localStream.getAudioTracks();
                            if (existingAudioTracks.length === 0) {
                                this.localStream.addTrack(newAudioTrack);
                                localStreamChanged = true;
                                console.log('[WebRTC] ✅ New audio track added to local stream');
                            } else {
                                console.log('[WebRTC] ⚠️ Audio track already exists, stopping new track');
                                newAudioTrack.stop();
                            }
                        }
                    } catch (error) {
                        console.error('[WebRTC] ❌ Failed to create new audio track:', error);
                        return;
                    }
                } else {
                    // Audio track exists but might be stopped - try to enable it
                    if (!currentAudioTrack.enabled) {
                        console.log('[WebRTC] 🔄 Enabling existing audio track');
                        currentAudioTrack.enabled = true;
                    }
                }
            } else {
                // Turning audio OFF - stop and remove the track
                if (currentAudioTrack) {
                    console.log('[WebRTC] 🔄 Stopping and removing audio track');
                    if (currentAudioTrack.readyState !== 'ended') {
                        currentAudioTrack.stop();
                    }
                    this.localStream.removeTrack(currentAudioTrack);
                    localStreamChanged = true;
                    console.log('[WebRTC] ✅ Audio track stopped and removed from local stream');
                }
            }
            
            this.updateLocalAudioState(options.audio);
        }

        // Handle video track changes
        if (options.video !== undefined && this.localStream) {
            const currentVideoTrack = this.localStream.getVideoTracks()[0];
            
            if (options.video) {
                // Turning video ON - create new track if none exists
                if (!currentVideoTrack) {
                    console.log('[WebRTC] 🔄 Creating new video track');
                    try {
                        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
                        const newVideoTrack = videoStream.getVideoTracks()[0];
                        if (newVideoTrack) {
                            // Check if we already have a video track to avoid duplicates
                            const existingVideoTracks = this.localStream.getVideoTracks();
                            if (existingVideoTracks.length === 0) {
                                this.localStream.addTrack(newVideoTrack);
                                localStreamChanged = true;
                                console.log('[WebRTC] ✅ New video track added to local stream');
                            } else {
                                console.log('[WebRTC] ⚠️ Video track already exists, stopping new track');
                                newVideoTrack.stop();
                            }
                        }
                    } catch (error) {
                        console.error('[WebRTC] ❌ Failed to create new video track:', error);
                        return;
                    }
                } else {
                    // Video track exists but might be stopped - try to enable it
                    if (!currentVideoTrack.enabled) {
                        console.log('[WebRTC] 🔄 Enabling existing video track');
                        currentVideoTrack.enabled = true;
                    }
                }
            } else {
                // Turning video OFF - stop and remove the track
                if (currentVideoTrack) {
                    console.log('[WebRTC] 🔄 Stopping and removing video track');
                    if (currentVideoTrack.readyState !== 'ended') {
                        currentVideoTrack.stop();
                    }
                    this.localStream.removeTrack(currentVideoTrack);
                    localStreamChanged = true;
                    console.log('[WebRTC] ✅ Video track stopped and removed from local stream');
                }
            }
            
            this.updateLocalVideoState(options.video);
        }

        console.log(`[WebRTC] 🔄 Processing ${this.connections.size} connected peers`);

        // Whoever clicks Audio/Video button first becomes the initiator for this action
        console.log(`[WebRTC] ${this.userId} is the initiator for this Audio/Video action`);

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
                    if (options.audio && this.localStream) {
                        const audioTrack = this.localStream.getAudioTracks()[0];
                        if (audioTrack && !existingTrackIds.has(audioTrack.id)) {
                            // Adding audio track
                            console.log(`[WebRTC] 🔄 Adding audio track ${audioTrack.id} to peer ${connectedPeerId}`);
                            const sender = peerState.connection.addTrack(audioTrack, this.localStream!);
                            if (sender.track) {
                                peerState.localSenderTrackIds.add(sender.track.id);
                            }
                            trackAdded = true;
                        }
                    } else if (!options.audio && audioTrackIdToRemove) {
                        // Removing audio track - use stored track ID
                        console.log(`[WebRTC] 🔄 Removing audio track ${audioTrackIdToRemove} from peer ${connectedPeerId}`);
                        const sender = senders.find(s => s.track?.id === audioTrackIdToRemove);
                        if (sender) {
                            peerState.connection.removeTrack(sender);
                            peerState.localSenderTrackIds.delete(audioTrackIdToRemove);
                            trackRemoved = true;
                            console.log(`[WebRTC] ✅ Audio sender removed from peer ${connectedPeerId}`);
                        } else {
                            console.warn(`[WebRTC] ⚠️ Audio sender not found for track ID ${audioTrackIdToRemove} in peer ${connectedPeerId}`);
                        }
                    }
                }
                
                // Handle video track changes
                if (options.video !== undefined) {
                    if (options.video && this.localStream) {
                        const videoTrack = this.localStream.getVideoTracks()[0];
                        if (videoTrack && !existingTrackIds.has(videoTrack.id)) {
                            // Adding video track
                            console.log(`[WebRTC] 🔄 Adding video track ${videoTrack.id} to peer ${connectedPeerId}`);
                            const sender = peerState.connection.addTrack(videoTrack, this.localStream!);
                            if (sender.track) {
                                peerState.localSenderTrackIds.add(sender.track.id);
                            }
                            trackAdded = true;
                        }
                    } else if (!options.video && videoTrackIdToRemove) {
                        // Removing video track - use stored track ID
                        console.log(`[WebRTC] 🔄 Removing video track ${videoTrackIdToRemove} from peer ${connectedPeerId}`);
                        const sender = senders.find(s => s.track?.id === videoTrackIdToRemove);
                        if (sender) {
                            peerState.connection.removeTrack(sender);
                            peerState.localSenderTrackIds.delete(videoTrackIdToRemove);
                            trackRemoved = true;
                            console.log(`[WebRTC] ✅ Video sender removed from peer ${connectedPeerId}`);
                        } else {
                            console.warn(`[WebRTC] ⚠️ Video sender not found for track ID ${videoTrackIdToRemove} in peer ${connectedPeerId}`);
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

                // Send media state to peer using current state variables
                console.log(`[WebRTC] 📤 PRE-SEND MEDIA STATE CHECK for peer ${connectedPeerId}:`, {
                    hasLocalAudio_prop: this.hasLocalAudio,
                    hasLocalVideo_prop: this.hasLocalVideo,
                    localStreamExists: !!this.localStream,
                    localStreamId: this.localStream?.id,
                    localStreamVideoTracks: this.localStream?.getVideoTracks().length,
                    localStreamAudioTracks: this.localStream?.getAudioTracks().length,
                    localStreamVideoTrackEnabled: this.localStream?.getVideoTracks()[0]?.enabled,
                    localStreamAudioTrackEnabled: this.localStream?.getAudioTracks()[0]?.enabled,
                });
                
                // Use actual track enabled state to ensure accuracy
                const actualAudioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
                const actualVideoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
                
                console.log(`[WebRTC] 📤 Sending media state to peer ${connectedPeerId}:`, {
                    audio: actualAudioEnabled,
                    video: actualVideoEnabled,
                    hasLocalAudio_prop: this.hasLocalAudio,
                    hasLocalVideo_prop: this.hasLocalVideo,
                    peerStateAudio: peerState.mediaState.audio,
                    peerStateVideo: peerState.mediaState.video
                });
                await this.sendMediaState(connectedPeerId, {
                    audio: actualAudioEnabled,
                    video: actualVideoEnabled,
                    stream: this.localStream
                });
            } else {
                console.log(`[WebRTC] 🔄 Skipping peer ${connectedPeerId} - not connected (state: ${peerState.connection?.connectionState})`);
            }
        }

        // CRITICAL FIX: Check if both audio and video are now disabled
        const currentAudioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
        const currentVideoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
        
        console.log(`[WebRTC] 🔍 FINAL MEDIA STATE CHECK:`, {
            currentAudioEnabled,
            currentVideoEnabled,
            localStreamExists: !!this.localStream,
            localStreamTracks: this.localStream?.getTracks().length || 0,
            hasLocalAudio: this.hasLocalAudio,
            hasLocalVideo: this.hasLocalVideo
        });

        // If both audio and video are disabled, ensure complete cleanup
        if (!currentAudioEnabled && !currentVideoEnabled && this.localStream) {
            console.log('[WebRTC] 🚨 BOTH AUDIO AND VIDEO DISABLED - PERFORMING COMPLETE CLEANUP');
            
            // Remove any remaining senders from all peer connections
            for (const [peerId, peerState] of this.connections.entries()) {
                if (peerState.connection && peerState.connection.connectionState === 'connected') {
                    const senders = peerState.connection.getSenders();
                    const localSenders = senders.filter(s => s.track && peerState.localSenderTrackIds.has(s.track.id));
                    
                    if (localSenders.length > 0) {
                        console.log(`[WebRTC] 🧹 Final cleanup: removing ${localSenders.length} remaining senders from peer ${peerId}`);
                        for (const sender of localSenders) {
                            if (sender.track) {
                                // Store track ID before removing the track (as sender.track becomes null after removeTrack)
                                const trackId = sender.track.id;
                                peerState.connection.removeTrack(sender);
                                peerState.localSenderTrackIds.delete(trackId);
                                console.log(`[WebRTC] ✅ Final cleanup: removed sender for track ${trackId} from peer ${peerId}`);
                            }
                        }
                        peersNeedingRenegotiation.push(peerId);
                    }
                }
            }
            
            // Ensure all tracks in the stream are properly stopped before nullifying
            const remainingTracks = this.localStream.getTracks();
            if (remainingTracks.length > 0) {
                console.log(`[WebRTC] 🛑 Stopping ${remainingTracks.length} remaining tracks before nullifying stream`);
                remainingTracks.forEach(track => {
                    if (track.readyState !== 'ended') {
                        console.log(`[WebRTC] 🛑 Stopping track:`, { kind: track.kind, id: track.id, readyState: track.readyState });
                        track.stop();
                    }
                });
            }
            
            // Additional safety: explicitly stop all tracks and clear the stream
            console.log('[WebRTC] 🧹 Additional safety cleanup - stopping all tracks explicitly');
            this.localStream.getTracks().forEach(track => {
                if (track.readyState !== 'ended') {
                    console.log(`[WebRTC] 🛑 Explicitly stopping track:`, { kind: track.kind, id: track.id, readyState: track.readyState });
                    track.stop();
                }
            });
            
            console.log('[WebRTC] 🗑️ Local stream is empty, nullifying to release browser media indicator');
            this.localStream = null;
            
            // Force update state variables to ensure consistency
            this.updateLocalAudioState(false);
            this.updateLocalVideoState(false);
            
            // Notify UI of state change to ensure red circle disappears
            this.notifyStateChange();
            
            // Add a small delay to ensure browser processes the cleanup
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Additional safety: force another state notification after delay
            console.log('[WebRTC] 🔄 Forcing additional state notification after cleanup delay');
            this.notifyStateChange();
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
        
        // Add tracks to existing peer connections
        console.log(`[WebRTC] 🔄 Adding local stream tracks to ${this.connections.size} existing peer connections`);
        for (const [peerId, peerState] of this.connections) {
            if (peerState.connection && peerState.connection.connectionState === 'connected') {
                console.log(`[WebRTC] 🔄 Adding tracks to peer ${peerId}`);
                
                // Add audio tracks
                for (const audioTrack of stream.getAudioTracks()) {
                    if (audioTrack.enabled) {
                        console.log(`[WebRTC] 🔊 Adding audio track to peer ${peerId}:`, audioTrack.id);
                        const sender = peerState.connection.addTrack(audioTrack, stream);
                        console.log(`[WebRTC] ✅ Audio track added to peer ${peerId}`);
                    }
                }
                
                // Add video tracks
                for (const videoTrack of stream.getVideoTracks()) {
                    if (videoTrack.enabled) {
                        console.log(`[WebRTC] 🎥 Adding video track to peer ${peerId}:`, videoTrack.id);
                        const sender = peerState.connection.addTrack(videoTrack, stream);
                        console.log(`[WebRTC] ✅ Video track added to peer ${peerId}`);
                    }
                }
                
                // Trigger renegotiation to send the new tracks
                console.log(`[WebRTC] 🔄 Triggering renegotiation for peer ${peerId} to send new tracks`);
                await this.forceRenegotiation(peerId);
            }
        }
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
            // Enhanced error classification
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            
            // Classify different types of errors
            if (errorName === 'NotAllowedError') {
                console.error('[WebRTC] 🔒 PERMISSION DENIED: User denied camera/microphone access');
                console.error('[WebRTC] 🔒 This is expected behavior - user must grant permissions manually');
            } else if (errorName === 'NotReadableError') {
                console.error('[WebRTC] 🔒 DEVICE BUSY: Camera/microphone is already in use by another application');
                console.error('[WebRTC] 🔒 Close other apps using camera/microphone and try again');
            } else if (errorName === 'NotFoundError') {
                console.error('[WebRTC] 🔒 DEVICE NOT FOUND: No camera/microphone detected on this device');
                console.error('[WebRTC] 🔒 Check if camera/microphone is properly connected');
            } else if (errorName === 'NotSupportedError') {
                console.error('[WebRTC] 🔒 NOT SUPPORTED: Camera/microphone not supported in this browser');
                console.error('[WebRTC] 🔒 Try using a different browser or device');
            } else if (errorMessage.includes('MediaDevices API not available')) {
                console.error('[WebRTC] 🔒 API NOT AVAILABLE: MediaDevices API not supported in this browser');
                console.error('[WebRTC] 🔒 This browser does not support camera/microphone access');
            } else {
                console.error('[WebRTC] ❌ UNKNOWN ERROR: Failed to initialize local media stream:', error);
                console.error('[WebRTC] ❌ This appears to be an unexpected technical issue');
            }
            
            throw error;
        }
    }

    public getMediaState(): MediaState {
        // Use actual track enabled state to ensure accuracy
        const actualAudioEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
        const actualVideoEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? false;
        
        return {
            stream: this.localStream,
            audio: actualAudioEnabled,
            video: actualVideoEnabled
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
        const currentStreamsState = JSON.stringify({
            remoteStreamsSize: this.remoteStreams.size,
            remoteStreamKeys: Array.from(this.remoteStreams.keys()),
            remoteStreamIds: Array.from(this.remoteStreams.values()).map(s => s.id),
            localStreamId: this.localStream?.id
        });
        
        // Only log if state has changed to avoid spam
        if (currentStreamsState !== this._lastLoggedRemoteStreamState) {
            console.log('[WebRTC] 🔍 getRemoteStream called:', {
                peerId,
                remoteStreamsSize: this.remoteStreams.size,
                remoteStreamKeys: Array.from(this.remoteStreams.keys()),
                remoteStreamIds: Array.from(this.remoteStreams.values()).map(s => s.id),
                localStreamId: this.localStream?.id,
                hasRemoteVideo: this.hasRemoteVideo,
                hasRemoteAudio: this.hasRemoteAudio
            });
            this._lastLoggedRemoteStreamState = currentStreamsState;
        }
        
        if (peerId) {
            const stream = this.remoteStreams.get(peerId) || null;
            
            // CRITICAL: Check if we're returning the local stream
            if (stream && this.localStream && stream.id === this.localStream.id) {
                console.error(`[WebRTC] 🚨 CRITICAL ERROR: getRemoteStream returning local stream for peer ${peerId}!`);
                console.error(`[WebRTC] 🚨 Local stream ID: ${this.localStream.id}, Returned stream ID: ${stream.id}`);
                console.error(`[WebRTC] 🚨 This should never happen!`);
            }
            
            return stream;
        }
        // Return the first available remote stream (for backward compatibility)
        for (const [currentPeerId, remoteStream] of this.remoteStreams.entries()) {
            if (remoteStream) {
                console.log(`[WebRTC] 🔍 Returning first available remote stream:`, {
                    peerId: currentPeerId,
                    streamId: remoteStream.id,
                    localStreamId: this.localStream?.id,
                    isLocalStream: this.localStream && remoteStream.id === this.localStream.id
                });
                
                // CRITICAL: Check if we're returning the local stream
                if (this.localStream && remoteStream.id === this.localStream.id) {
                    console.error(`[WebRTC] 🚨 CRITICAL ERROR: getRemoteStream returning local stream as first available remote stream!`);
                    console.error(`[WebRTC] 🚨 Peer ID: ${currentPeerId}, Local stream ID: ${this.localStream.id}, Returned stream ID: ${remoteStream.id}`);
                    console.error(`[WebRTC] 🚨 This indicates the local stream was incorrectly stored in remoteStreams map!`);
                }
                
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
        this.disconnectAll();
    }

    // Private Helper Methods
    /**
     * Creates a new peer state for a connection
     * @param peerId - The ID of the peer to connect to
     */
    private createPeerState(peerId: string): RTCPeerState {
        const connection = new RTCPeerConnection(this.rtcConfiguration);
        
        const peerState: RTCPeerState = {
            connection,
            dataChannel: null,
            phase: 'idle',
            connectionTimeout: null,
            mediaState: {
                audio: false,
                video: false
            },
            localSenderTrackIds: new Set<string>(),
            waitingForAck: false,
            pendingAction: null
        };

        this.setupPeerConnectionHandlers(connection, peerId);
        return peerState;
    }

    private setupPeerConnectionHandlers(connection: RTCPeerConnection, peerId: string): void {
        /**
         * 🎯 CONNECTION STATE CHANGE EVENT
         * 
         * WHEN CALLED:
         * - Called whenever the overall connection state changes between peers
         * - Fires after ICE connection is established and data/media channels are ready
         * 
         * POSSIBLE STATES:
         * - 'new': Initial state when RTCPeerConnection is created
         * - 'connecting': ICE connection is being established
         * - 'connected': Full connection established (data + media channels ready)
         * - 'disconnected': Connection lost temporarily (may reconnect)
         * - 'failed': Connection failed permanently
         * - 'closed': Connection was closed intentionally
         * 
         * TRIGGERS:
         * - After successful ICE candidate exchange and connectivity checks
         * - When network conditions change (WiFi to mobile, etc.)
         * - When connection is manually closed
         * - When connection times out or fails
         */
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
                        
                        // Request updated peer list when a peer disconnects unexpectedly
                        this.requestUpdatedPeerList();
                    }
                    break;
                case 'disconnected':
                    if (peerState.phase !== 'disconnected') {
                        console.log(`[WebRTC] Peer ${peerId} connection disconnected, cleaning up`);
                        peerState.phase = 'disconnected';
                        this.clearConnectionTimeout(peerId);
                        this.dispatchConnectionEvent(peerId, 'disconnected');
                        this.cleanup(peerId);
                        
                        // Request updated peer list when a peer disconnects unexpectedly
                        this.requestUpdatedPeerList();
                    }
                    break;
            }
        };

        /**
         * 🧊 ICE CONNECTION STATE CHANGE EVENT
         * 
         * WHEN CALLED:
         * - Called whenever the ICE (Interactive Connectivity Establishment) connection state changes
         * - Fires during the process of finding the best network path between peers
         * 
         * POSSIBLE STATES:
         * - 'new': ICE gathering has not started yet
         * - 'checking': ICE connectivity checks are in progress (testing candidate pairs)
         * - 'connected': ICE connection established successfully
         * - 'completed': ICE connection completed (all checks done, optimal path found)
         * - 'failed': ICE connection failed (no valid path found between peers)
         * - 'disconnected': ICE connection lost temporarily
         * - 'closed': ICE connection was closed
         * 
         * TRIGGERS:
         * - When ICE candidate gathering starts/stops
         * - During connectivity checks between different network candidates
         * - When STUN/TURN servers respond with public IP addresses
         * - When network conditions change
         * - When connection fails due to NAT/firewall issues
         */
        connection.oniceconnectionstatechange = () => {
            const state = connection.iceConnectionState;
            const gatheringState = connection.iceGatheringState;
            console.log(`[WebRTC] 🧊 ICE connection state for peer ${peerId}: ${state} (gathering: ${gatheringState})`);
            
            // Enhanced ICE state debugging
            switch (state) {
                case 'new':
                    console.log(`[WebRTC] 🧊 ICE gathering started for peer ${peerId}`);
                    break;
                case 'checking':
                    console.log(`[WebRTC] 🧊 ICE connectivity checks in progress for peer ${peerId}`);
                    // Log available candidates for debugging
                    console.log(`[WebRTC] 🧊 Connection stats for peer ${peerId}:`, {
                        localDescription: !!connection.localDescription,
                        remoteDescription: !!connection.remoteDescription,
                        signalingState: connection.signalingState,
                        connectionState: connection.connectionState
                    });
                    break;
                case 'connected':
                    console.log(`[WebRTC] ✅ ICE connection established for peer ${peerId}`);
                    break;
                case 'completed':
                    console.log(`[WebRTC] ✅ ICE connection completed for peer ${peerId}`);
                    break;
                case 'failed':
                    console.error(`[WebRTC] ❌ ICE connection failed for peer ${peerId}`);
                    console.error(`[WebRTC] ❌ Debugging info:`, {
                        signalingState: connection.signalingState,
                        connectionState: connection.connectionState,
                        iceGatheringState: connection.iceGatheringState,
                        localDescription: !!connection.localDescription,
                        remoteDescription: !!connection.remoteDescription,
                        rtcConfiguration: this.rtcConfiguration
                    });
                    
                    // Enhanced ICE failure analysis
                    console.error(`[WebRTC] 🔍 ICE FAILURE ANALYSIS:`);
                    console.error(`[WebRTC] 🔍 This typically means:`);
                    console.error(`[WebRTC] 🔍 1. Both peers are behind NAT/firewalls that block direct connections`);
                    console.error(`[WebRTC] 🔍 2. Network policies prevent UDP/TCP connectivity between the machines`);
                    console.error(`[WebRTC] 🔍 3. STUN servers cannot establish a direct path between the peers`);
                    console.error(`[WebRTC] 🔍 4. Need TURN servers for relay functionality`);
                    
                    // Log network information for debugging
                    console.error(`[WebRTC] 🔍 Network Info:`, {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        connection: (navigator as any).connection?.effectiveType || 'unknown',
                        onLine: navigator.onLine
                    });
                    
                    // Enhanced network topology analysis
                    console.error(`[WebRTC] 🔍 NETWORK TOPOLOGY ANALYSIS:`);
                    console.error(`[WebRTC] 🔍 Current location: ${window.location.hostname}:${window.location.port}`);
                    console.error(`[WebRTC] 🔍 Protocol: ${window.location.protocol}`);
                    console.error(`[WebRTC] 🔍 This suggests:`, {
                        isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
                        isIPAddress: /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname),
                        isCrossMachine: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
                    });
                    
                    // Check if we have any candidates at all
                    connection.getStats().then(stats => {
                        const candidates: Array<{
                            type: string;
                            candidateType?: string;
                            protocol?: string;
                            address?: string;
                            port?: number;
                        }> = [];
                        stats.forEach(report => {
                            if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
                                candidates.push({
                                    type: report.type,
                                    candidateType: report.candidateType,
                                    protocol: report.protocol,
                                    address: report.address,
                                    port: report.port
                                });
                            }
                        });
                        console.error(`[WebRTC] ❌ ICE candidates for failed connection:`, candidates);
                        
                        // Analyze candidate types
                        const localCandidates = candidates.filter(c => c.type === 'local-candidate');
                        const remoteCandidates = candidates.filter(c => c.type === 'remote-candidate');
                        const hostCandidates = candidates.filter(c => c.candidateType === 'host');
                        const srflxCandidates = candidates.filter(c => c.candidateType === 'srflx');
                        
                        console.error(`[WebRTC] 🔍 CANDIDATE ANALYSIS:`, {
                            totalCandidates: candidates.length,
                            localCandidates: localCandidates.length,
                            remoteCandidates: remoteCandidates.length,
                            hostCandidates: hostCandidates.length,
                            srflxCandidates: srflxCandidates.length,
                            hasLocalCandidates: localCandidates.length > 0,
                            hasRemoteCandidates: remoteCandidates.length > 0,
                            hasHostCandidates: hostCandidates.length > 0,
                            hasSrflxCandidates: srflxCandidates.length > 0
                        });
                        
                        if (localCandidates.length === 0) {
                            console.error(`[WebRTC] ❌ NO LOCAL CANDIDATES - This is a critical issue!`);
                        }
                        if (remoteCandidates.length === 0) {
                            console.error(`[WebRTC] ❌ NO REMOTE CANDIDATES - ICE candidate exchange failed!`);
                        }
                        if (srflxCandidates.length === 0) {
                            console.error(`[WebRTC] ❌ NO SERVER REFLEXIVE CANDIDATES - STUN server not working!`);
                        }
                    }).catch(err => {
                        console.error(`[WebRTC] ❌ Failed to get stats:`, err);
                    });
                    
                    this.handleError(peerId, new Error('ICE connection failed'));
                    break;
                case 'disconnected':
                    console.warn(`[WebRTC] ⚠️ ICE connection disconnected for peer ${peerId}`);
                    break;
                case 'closed':
                    console.log(`[WebRTC] 🚪 ICE connection closed for peer ${peerId}`);
                    break;
            }
        };

        /**
         * 🧊 ICE CANDIDATE EVENT
         * 
         * WHEN CALLED:
         * - Called whenever a new ICE candidate is discovered by the local peer
         * - Fires multiple times during the ICE gathering process
         * - Called with null candidate when ICE gathering is complete
         * 
         * CANDIDATE TYPES:
         * - 'host': Local network interface (192.168.x.x, 10.x.x.x, etc.)
         * - 'srflx': Server reflexive (public IP from STUN server)
         * - 'relay': Relay (TURN server relay address)
         * - 'prflx': Peer reflexive (discovered during connectivity checks)
         * 
         * TRIGGERS:
         * - When local network interfaces are discovered
         * - When STUN servers respond with public IP addresses
         * - When TURN servers provide relay addresses
         * - When ICE gathering completes (null candidate)
         * 
         * IMPORTANT:
         * - Each candidate must be sent to the remote peer via signaling
         * - Remote peer will add these candidates to their RTCPeerConnection
         * - ICE connectivity checks will test all candidate pairs
         * 
         * STRICT SEQUENTIAL PROCESSING:
         * - Queue candidates until SDP negotiation is complete
         * - Only send candidates after both peers have remote descriptions
         * - Process all queued candidates before starting ICE connection testing
         */
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] 🧊 ICE candidate found for peer ${peerId}:`, {
                    candidate: event.candidate.candidate,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    sdpMid: event.candidate.sdpMid,
                    protocol: event.candidate.protocol,
                    type: event.candidate.type,
                    address: event.candidate.address,
                    port: event.candidate.port,
                    priority: event.candidate.priority,
                    foundation: event.candidate.foundation
                });
                
                // Filter out unwanted network interfaces
                if (event.candidate.address && event.candidate.address.startsWith('192.168.56.')) {
                    console.log(`[WebRTC] 🚫 Filtering out ICE candidate from unwanted network: ${event.candidate.address}:${event.candidate.port}`);
                    return; // Skip this candidate
                }
                
                // Filter out private (host) candidates - only allow public (srflx) candidates
                const candidateString = event.candidate.candidate;
                if (candidateString.includes('typ host')) {
                    console.log(`[WebRTC] 🚫 Filtering out private host candidate: ${event.candidate.address}:${event.candidate.port}`);
                    return; // Skip private candidates
                }
                
                // Analyze candidate type for better debugging
                if (candidateString.includes('typ srflx')) {
                    console.log(`[WebRTC] 🌐 Server reflexive candidate (via STUN): ${event.candidate.address}:${event.candidate.port}`);
                } else if (candidateString.includes('typ relay')) {
                    console.log(`[WebRTC] 🔄 Relay candidate (via TURN): ${event.candidate.address}:${event.candidate.port}`);
                } else if (candidateString.includes('typ prflx')) {
                    console.log(`[WebRTC] 🔍 Peer reflexive candidate: ${event.candidate.address}:${event.candidate.port}`);
                }
                
                if (this.signalingService) {
                    this.signalingService.send({
                        type: 'ice-candidate',
                        from: this.userId,
                        to: peerId,
                        candidate: event.candidate
                    });
                } else {
                    console.error(`[WebRTC] ❌ Cannot send ICE candidate - no signaling service`);
                }
            } else {
                console.log(`[WebRTC] 🧊 ICE candidate gathering completed for peer ${peerId}`);
                console.log(`[WebRTC] 🧊 ICE gathering state: ${connection.iceGatheringState}`);
                
                // Send ICE complete notification to peer
                if (this.signalingService) {
                    this.signalingService.send({
                        type: 'ice-complete',
                        from: this.userId,
                        to: peerId,
                        data: { timestamp: Date.now() }
                    });
                }
            }
        };

        /**
         * 📡 DATA CHANNEL EVENT
         * 
         * WHEN CALLED:
         * - Called when the remote peer creates a data channel that this peer receives
         * - Only the responder (non-initiator) will receive this event
         * - The initiator creates the data channel, responder receives it
         * 
         * TRIGGERS:
         * - When remote peer calls createDataChannel() and sends offer
         * - When this peer receives an offer containing a data channel
         * - After setRemoteDescription() is called with an offer containing data channel
         * 
         * IMPORTANT:
         * - This event provides the RTCDataChannel object from the remote peer
         * - Must set up event handlers (onopen, onclose, onmessage) for the received channel
         * - Data channels are bidirectional once established
         * - Used for sending text messages, file transfers, etc.
         */
        connection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, peerId);
        };

        /**
         * 🎥 TRACK EVENT
         * 
         * WHEN CALLED:
         * - Called when the remote peer adds a media track to the connection
         * - Fires for each audio/video track that the remote peer shares
         * - Can fire multiple times if remote peer adds/removes tracks
         * 
         * TRACK TYPES:
         * - 'audio': Microphone audio from remote peer
         * - 'video': Camera video from remote peer
         * 
         * TRIGGERS:
         * - When remote peer calls addTrack() and sends offer/answer
         * - When this peer receives an offer/answer containing media tracks
         * - After setRemoteDescription() is called with SDP containing media
         * - During renegotiation when remote peer enables/disables media
         * 
         * IMPORTANT:
         * - This event provides the MediaStreamTrack object from the remote peer
         * - Must add the track to a MediaStream for display/playback
         * - Track can be enabled/disabled by remote peer
         * - Track can end when remote peer stops sharing media
         * - Used for video chat, screen sharing, etc.
         */
        connection.ontrack = (event) => {
            console.log(`[WebRTC] 🎥 PEER ${this.userId} RECEIVED ${event.track.kind} TRACK FROM PEER ${peerId}`);
            
            // Enhanced logging with contentHint and trackSettings
            console.log(`[WebRTC] 📥 RECEIVING TRACK DETAILS:`, {
                trackId: event.track.id,
                trackKind: event.track.kind,
                trackLabel: event.track.label,
                trackEnabled: event.track.enabled,
                trackReadyState: event.track.readyState,
                trackMuted: event.track.muted,
                contentHint: event.track.contentHint,
                trackSettings: event.track.getSettings(),
                streamId: event.streams?.[0]?.id,
                streamTracks: event.streams?.[0]?.getTracks().map(t => ({ id: t.id, kind: t.kind, label: t.label })),
                hasRemoteVideo: this.hasRemoteVideo,
                remoteStreamsSize: this.remoteStreams.size,
                existingRemoteStreamId: this.remoteStreams.get(peerId)?.id
            });
            
            // Check if this is a screen share track
            // Screen share tracks can be identified by:
            // 1. Track label containing screen/display/window keywords
            // 2. Coming from a different stream than the main video stream
            // 3. Track settings (contentHint, aspectRatio, frameRate, etc.)
            const trackLabel = event.track.label.toLowerCase();
            const streamId = event.streams?.[0]?.id;
            const existingRemoteStream = this.remoteStreams.get(peerId);
            const trackSettings = event.track.getSettings();
            const contentHint = event.track.contentHint;
            
            // Enhanced screen share detection based on Gemini's suggestions
            const labelBasedDetection = trackLabel.includes('screen') || 
                                      trackLabel.includes('display') || 
                                      trackLabel.includes('window') ||
                                      trackLabel.includes('monitor') ||
                                      trackLabel.includes('desktop');
            
            const streamBasedDetection = streamId && existingRemoteStream && streamId !== existingRemoteStream.id;
            
            const settingsBasedDetection = event.track.kind === 'video' && (
                contentHint === 'detail' || // Screen share often has 'detail' content hint
                (trackSettings.aspectRatio && trackSettings.aspectRatio > 1.5) || // Screen share often has wide aspect ratio
                (trackSettings.frameRate && trackSettings.frameRate > 24) // Screen share often has higher frame rate
            );
            
            const isScreenShareTrack = event.track.kind === 'video' && 
                (labelBasedDetection || streamBasedDetection || settingsBasedDetection);
            
            // 🔍 COMPREHENSIVE TRACK CLASSIFICATION ANALYSIS
            console.log(`[WebRTC] 🔍 TRACK CLASSIFICATION ANALYSIS for track ${event.track.id}:`, {
                // Basic track info
                trackId: event.track.id,
                trackKind: event.track.kind,
                trackLabel: event.track.label,
                trackLabelLower: event.track.label.toLowerCase(),
                
                // Gemini-suggested properties for classification
                contentHint: event.track.contentHint,
                trackSettings: event.track.getSettings(),
                
                // Enhanced detection methods
                labelBasedDetection,
                streamBasedDetection,
                settingsBasedDetection,
                
                // Classification clues
                labelContainsScreen: event.track.label.toLowerCase().includes('screen'),
                labelContainsDisplay: event.track.label.toLowerCase().includes('display'),
                labelContainsWindow: event.track.label.toLowerCase().includes('window'),
                labelContainsMonitor: event.track.label.toLowerCase().includes('monitor'),
                labelContainsDesktop: event.track.label.toLowerCase().includes('desktop'),
                
                // Stream context
                streamId: event.streams?.[0]?.id,
                existingRemoteStreamId: this.remoteStreams.get(peerId)?.id,
                streamIdDifferent: streamId && existingRemoteStream ? streamId !== existingRemoteStream.id : false,
                
                // Current state
                hasRemoteVideo: this.hasRemoteVideo,
                remoteStreamsSize: this.remoteStreams.size,
                
                // Classification result
                isScreenShareTrack,
                finalClassification: isScreenShareTrack ? 'SCREEN_SHARE' : 'CAMERA_VIDEO/AUDIO'
            });
            
            if (isScreenShareTrack) {
                console.log(`[WebRTC] 🖥️ Detected screen share track from peer ${peerId}`);
                this.handleScreenShareTrack(event, peerId);
                return;
            }
            
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
                
                // CRITICAL DEBUG: Log what we're storing
                console.log(`[WebRTC] 🔍 STORING NEW REMOTE STREAM FOR PEER ${peerId}:`, {
                    newRemoteStreamId: remoteStream.id,
                    localStreamId: this.localStream?.id,
                    isLocalStreamSameAsRemote: remoteStream.id === this.localStream?.id,
                    peerId,
                    eventStreamIds: event.streams?.map(s => s.id) || [],
                    trackId: event.track.id,
                    trackKind: event.track.kind
                });
                
                // CRITICAL: Verify we're not storing the local stream
                if (this.localStream && remoteStream.id === this.localStream.id) {
                    console.error(`[WebRTC] 🚨 CRITICAL ERROR: Attempting to store local stream as remote stream for peer ${peerId}!`);
                    console.error(`[WebRTC] 🚨 Local stream ID: ${this.localStream.id}, Remote stream ID: ${remoteStream.id}`);
                    throw new Error(`Critical error: local stream being stored as remote stream`);
                }
                
                this.remoteStreams.set(peerId, remoteStream);
                console.log(`[WebRTC] ✅ Created and stored new remote stream for peer ${peerId}:`, {
                    streamId: remoteStream.id,
                    remoteStreamsSize: this.remoteStreams.size,
                    allRemoteStreamIds: Array.from(this.remoteStreams.values()).map(s => s.id)
                });
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
    private async handleSignalingMessage(message: any): Promise<void> {
        // Skip if this instance is not the active one
        if (!this.isActive()) {
            console.log(`[WebRTC] 🚫 Ignoring message - instance ${this.instanceId} is not active`);
            return;
        }

        const { from: peerId, type, data } = message;
        
        console.log(`[WebRTC] Processing signaling message:`, { 
            type, 
            from: peerId, 
            to: message.to, 
            self: this.userId,
            isFromSelf: peerId === this.userId,
            isToSelf: message.to === this.userId,
            timestamp: data?.timestamp || 'none',
            resetTime: this.lastResetTime
        });
        
        // Ignore messages from self
        if (peerId === this.userId) {
            console.log(`[WebRTC] Ignoring message from self (${peerId})`);
            return;
        }

        // Basic message deduplication
        if (type !== 'media-state') {
            const messageId = `${type}-${peerId}-${JSON.stringify(message.data || {})}`;
            if (this.processedMessages.has(messageId)) {
                console.log(`[WebRTC] Ignoring duplicate message: ${messageId}`);
                return;
            }
            this.processedMessages.add(messageId);
        }

        // Clean up old messages (keep only last 50 messages)
        if (this.processedMessages.size > 50) {
            const oldestMessages = Array.from(this.processedMessages).slice(0, 10);
            oldestMessages.forEach(msg => {
                this.processedMessages.delete(msg);
                this.messageTimestamps.delete(msg);
            });
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
            case 'offer-ack':
                this.handleOfferAck(peerId, message.data);
                break;
            case 'answer':
                this.handleAnswer(peerId, message.data);
                break;
            case 'answer-ack':
                this.handleAnswerAck(peerId, message.data);
                break;
            case 'ice-candidate':
                if (message.candidate) {
                    this.handleIceCandidate(peerId, message.candidate);
                }
                break;
            case 'ice-complete':
                this.handleIceComplete(peerId, message.data);
                break;
            case 'ice-complete-ack':
                this.handleIceCompleteAck(peerId, message.data);
                break;
            case 'disconnect':
                await this.handleDisconnect(peerId);
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
        const peerState = this.createPeerState(peerId);
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
        // Only the peer who initiated the connection should handle initiate-ack
        if (!peerState || peerState.phase !== 'idle') {
            console.log(`[WebRTC] Ignoring initiate-ack from ${peerId} - invalid state`);
            return;
        }

        // Clear initiation timeout
        this.clearConnectionTimeout(peerId);

        // Start connection process
        peerState.phase = 'connecting';
        await this.createOffer(peerId);
    }

    private async handleOfferAck(peerId: string, data: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        // Only the peer who sent the offer should handle offer-ack
        if (!peerState || peerState.phase !== 'connecting') {
            console.log(`[WebRTC] Ignoring offer-ack from ${peerId} - invalid state`);
            return;
        }

        console.log(`[WebRTC] ✅ Offer acknowledged by peer ${peerId}`);
        peerState.waitingForAck = false;
        peerState.pendingAction = null;
    }

    private async handleAnswerAck(peerId: string, data: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || peerState.phase !== 'connecting') {
            console.log(`[WebRTC] Ignoring answer-ack from ${peerId} - invalid state`);
            return;
        }

        console.log(`[WebRTC] ✅ Answer acknowledged by peer ${peerId}`);
        peerState.waitingForAck = false;
        peerState.pendingAction = null;
    }

    private async handleIceComplete(peerId: string, data: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring ice-complete from ${peerId} - no peer state`);
            return;
        }

        console.log(`[WebRTC] 🧊 ICE gathering completed by peer ${peerId}`);
        
        // Acknowledge ICE completion
        if (this.signalingService) {
            this.signalingService.send({
                type: 'ice-complete-ack',
                from: this.userId,
                to: peerId,
                data: { timestamp: Date.now() }
            });
        }
    }

    private async handleIceCompleteAck(peerId: string, data: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring ice-complete-ack from ${peerId} - no peer state`);
            return;
        }

        console.log(`[WebRTC] ✅ ICE completion acknowledged by peer ${peerId}`);
        peerState.waitingForAck = false;
        peerState.pendingAction = null;
    }

    private async createOffer(peerId: string, isRenegotiation: boolean = false): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) return;

        try {
            const connection = peerState.connection;
            
            // Add local tracks only for renegotiation (when user enables media)
            if (isRenegotiation && (this.localStream || this.screenShareStream)) {
                // Collect all enabled tracks from both local stream and screen share stream
                const localTracks = this.localStream ? this.localStream.getTracks().filter(track => track.enabled) : [];
                const screenShareTracks = this.screenShareStream ? this.screenShareStream.getTracks().filter(track => track.enabled) : [];
                const allEnabledTracks = [...localTracks, ...screenShareTracks];
                
                console.log(`[WebRTC] Adding ${allEnabledTracks.length} enabled tracks to offer for peer ${peerId} (renegotiation: ${isRenegotiation})`);
                console.log(`[WebRTC] 🔍 Track filtering details:`, {
                    localTracks: localTracks.length,
                    screenShareTracks: screenShareTracks.length,
                    totalTracks: allEnabledTracks.length,
                    allTracks: allEnabledTracks.map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled, source: this.localStream?.getTracks().includes(t) ? 'local' : 'screenShare' })),
                    enabledTrackDetails: allEnabledTracks.map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled, source: this.localStream?.getTracks().includes(t) ? 'local' : 'screenShare' }))
                });
                
                // Double-check that our state variables match the track states
                const videoTracks = this.localStream?.getVideoTracks() || [];
                const audioTracks = this.localStream?.getAudioTracks() || [];
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
                
                allEnabledTracks.forEach(track => {
                    console.log(`[WebRTC] Processing enabled track:`, { kind: track.kind, enabled: track.enabled, id: track.id });
                    
                    // Check if this track is already added
                    if (existingTrackIds.has(track.id)) {
                        console.log(`[WebRTC] Track ${track.id} already exists in connection, skipping`);
                        return;
                    }
                    
                    try {
                        // Determine which stream this track belongs to
                        const sourceStream = this.localStream?.getTracks().includes(track) ? this.localStream : this.screenShareStream;
                        const sender = connection.addTrack(track, sourceStream!);
                        console.log(`[WebRTC] Track sender created:`, { 
                            trackId: sender.track?.id, 
                            kind: sender.track?.kind,
                            enabled: sender.track?.enabled,
                            source: this.localStream?.getTracks().includes(track) ? 'local' : 'screenShare'
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
            } else if (isRenegotiation && !this.localStream) {
                console.log(`[WebRTC] Renegotiation requested but no local stream available for peer ${peerId}`);
            } else {
                console.log(`[WebRTC] Initial connection - creating data-channel-only offer for peer ${peerId} (no media tracks)`);
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
            console.log(`[WebRTC] 📋 Created offer for peer ${peerId} (renegotiation: ${isRenegotiation})`);
            
            // Set the offer as local description
            await connection.setLocalDescription(offer);

            // Quick SDP analysis for renegotiation (reduced logging for speed)
            if (isRenegotiation) {
                const sdp = offer.sdp || '';
                console.log(`[WebRTC] 🔍 Quick SDP analysis for peer ${peerId}:`, {
                    sdpLength: sdp.length,
                    hasVideo: sdp.includes('m=video'),
                    hasAudio: sdp.includes('m=audio'),
                    videoSections: (sdp.match(/m=video/g) || []).length,
                    audioSections: (sdp.match(/m=audio/g) || []).length
                });
            }

            // Send offer and wait for acknowledgment
            if (this.signalingService) {
                console.log(`[WebRTC] 📤 Sending offer to peer ${peerId} and waiting for acknowledgment`);
                peerState.waitingForAck = true;
                peerState.pendingAction = 'offer';
                
                this.signalingService.send({
                    type: 'offer',
                    from: this.userId,
                    to: peerId,
                    data: offer
                });
            }

            console.log(`[WebRTC] Offer sent to peer ${peerId} (renegotiation: ${isRenegotiation})`);
            
            // Quick final verification for renegotiation
            if (isRenegotiation && this.localStream) {
                const finalVideoTracks = this.localStream.getVideoTracks();
                const finalAudioTracks = this.localStream.getAudioTracks();
                console.log(`[WebRTC] 🔍 Quick final verification for peer ${peerId}:`, {
                    hasLocalVideo: this.hasLocalVideo,
                    hasLocalAudio: this.hasLocalAudio,
                    videoTracks: finalVideoTracks.length,
                    audioTracks: finalAudioTracks.length,
                    enabledVideo: finalVideoTracks.filter(t => t.enabled).length,
                    enabledAudio: finalAudioTracks.filter(t => t.enabled).length
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

        // For renegotiation (connected state), both peers can receive offers
        // For initial connection (responding state), only responder should receive offers
        // The responder is the one who received the initiate message (phase = 'responding')
        if (peerState.phase === 'responding') {
            // This is correct - we are the responder and should receive offers
            console.log(`[WebRTC] Processing initial offer as responder from peer ${peerId}`);
        }

        console.log(`[WebRTC] Processing offer from peer ${peerId} (renegotiation: ${peerState.phase === 'connected'})`);
        console.log(`[WebRTC] 📋 Incoming offer SDP preview:`, offer.sdp?.substring(0, 500) + '...');
        
        // 🔍 DETAILED INCOMING SDP ANALYSIS
        if (offer.sdp) {
            const sdpLines = offer.sdp.split('\n');
            const mediaSections: Array<{ media: string; tracks: string[] }> = [];
            let currentMediaSection: string | null = null;
            
            sdpLines.forEach(line => {
                if (line.startsWith('m=')) {
                    currentMediaSection = line;
                    mediaSections.push({ media: line, tracks: [] });
                } else if (line.startsWith('a=msid:') && currentMediaSection) {
                    const lastSection = mediaSections[mediaSections.length - 1];
                    if (lastSection) {
                        lastSection.tracks.push(line);
                    }
                }
            });
            
            console.log(`[WebRTC] 📋 INCOMING SDP MEDIA SECTIONS from peer ${peerId}:`, {
                totalMediaSections: mediaSections.length,
                mediaSections: mediaSections.map(section => ({
                    media: section.media,
                    trackCount: section.tracks.length,
                    tracks: section.tracks
                })),
                hasVideo: offer.sdp.includes('m=video'),
                hasAudio: offer.sdp.includes('m=audio'),
                videoLines: sdpLines.filter(line => line.startsWith('m=video')).length,
                audioLines: sdpLines.filter(line => line.startsWith('m=audio')).length
            });
        }

        // Send offer acknowledgment immediately for faster response
        if (this.signalingService) {
            console.log(`[WebRTC] ✅ Acknowledging offer from peer ${peerId}`);
            this.signalingService.send({
                type: 'offer-ack',
                from: this.userId,
                to: peerId,
                data: { timestamp: Date.now() }
            });
        }

        try {
            const connection = peerState.connection;

            // Add local tracks only for renegotiation (when user enables media)
            if (peerState.phase === 'connected' && this.localStream) {
                const enabledTracks = this.localStream.getTracks().filter(track => track.enabled);
                console.log(`[WebRTC] Adding ${enabledTracks.length} enabled local tracks to answer for peer ${peerId} (renegotiation)`);
                
                // Get existing senders to avoid duplicates
                const existingSenders = connection.getSenders();
                const existingTrackIds = new Set(existingSenders.map(s => s.track?.id).filter(id => id));
                
                enabledTracks.forEach(track => {
                    // Check if this track is already added
                    if (existingTrackIds.has(track.id)) {
                        console.log(`[WebRTC] Track ${track.id} already exists in connection, skipping`);
                        return;
                    }

                    try {
                        const sender = connection.addTrack(track, this.localStream!);
                        // Track this as a local sender track
                        if (sender.track) {
                            peerState.localSenderTrackIds.add(sender.track.id);
                            console.log(`[WebRTC] Added track ${sender.track.id} to local sender track IDs for peer ${peerId}`);
                        }
                    } catch (error) {
                        console.error(`[WebRTC] Failed to add track ${track.id} to connection:`, error);
                    }
                });
            } else if (peerState.phase === 'connected' && !this.localStream) {
                console.log(`[WebRTC] Renegotiation requested but no local stream available for peer ${peerId}`);
            } else {
                console.log(`[WebRTC] Initial connection - creating data-channel-only answer for peer ${peerId} (no media tracks)`);
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
                console.log(`[WebRTC] 📋 Created answer for peer ${peerId}`);
                
                await connection.setLocalDescription(answer);
                console.log(`[WebRTC] Answer created and local description set for peer ${peerId}`);
            } catch (error) {
                console.error(`[WebRTC] Failed to create answer for peer ${peerId}:`, error);
                throw error;
            }

            // Send answer and wait for acknowledgment
            if (this.signalingService) {
                console.log(`[WebRTC] 📤 Sending answer to peer ${peerId} and waiting for acknowledgment`);
                peerState.waitingForAck = true;
                peerState.pendingAction = 'answer';
                
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
        
        console.log(`[WebRTC] handleAnswer: peerId=${peerId}, phase=${peerState.phase}`);
        
        // Allow answers in both 'connecting' (initial connection) and 'connected' (renegotiation) states
        if (peerState.phase !== 'connecting' && peerState.phase !== 'connected') {
            console.log(`[WebRTC] Ignoring answer from ${peerId} - invalid state (phase: ${peerState.phase})`);
              return;
        }

        // For initial connection: only the peer who sent the offer should handle answers
        // For renegotiation: the peer who sent the offer should receive the answer
        // We determine this by checking if we're in the right phase and if we sent an offer
        if (peerState.phase === 'connecting') {
            // For initial connection, only the initiator (who sent the offer) should receive answers
            console.log(`[WebRTC] Processing initial answer as initiator from peer ${peerId}`);
        } else if (peerState.phase === 'connected') {
            // For renegotiation, the peer who sent the offer should receive the answer
            // We can determine this by checking if we're currently sending an offer
            console.log(`[WebRTC] Processing renegotiation answer from peer ${peerId}`);
        }

        try {
            const connection = peerState.connection;
            console.log(`[WebRTC] Processing answer from peer ${peerId} (phase: ${peerState.phase})`);
            
            // Check connection state before setting remote description
            const signalingState = connection.signalingState;
            console.log(`[WebRTC] Connection signaling state before setting remote description: ${signalingState}`);
            
            // If connection is already stable, this might be a duplicate answer
            if (signalingState === 'stable') {
                console.log(`[WebRTC] Connection already stable - this might be a duplicate answer from peer ${peerId}`);
                // Still send acknowledgment to prevent the other peer from retrying
                if (this.signalingService) {
                    console.log(`[WebRTC] ✅ Acknowledging duplicate answer from peer ${peerId}`);
                    this.signalingService.send({
                        type: 'answer-ack',
                        from: this.userId,
                        to: peerId,
                        data: { timestamp: Date.now() }
                    });
                }
                return;
            }
            
            await connection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`[WebRTC] Remote description set for peer ${peerId}`);
            console.log(`[WebRTC] Answer processing completed successfully for peer ${peerId}`);

            // Send answer acknowledgment
            if (this.signalingService) {
                console.log(`[WebRTC] ✅ Acknowledging answer from peer ${peerId}`);
                this.signalingService.send({
                    type: 'answer-ack',
                    from: this.userId,
                    to: peerId,
                    data: { timestamp: Date.now() }
                });
            }

        } catch (error) {
            console.error(`[WebRTC] Failed to set remote description for peer ${peerId}:`, error);
            
            // If it's a state error, log it but don't treat it as a fatal error
            if (error instanceof Error && error.name === 'InvalidStateError') {
                console.log(`[WebRTC] State error for peer ${peerId} - connection may already be established`);
                // Still send acknowledgment to prevent the other peer from retrying
                if (this.signalingService) {
                    console.log(`[WebRTC] ✅ Acknowledging answer despite state error for peer ${peerId}`);
                    this.signalingService.send({
                        type: 'answer-ack',
                        from: this.userId,
                        to: peerId,
                        data: { timestamp: Date.now() }
                    });
                }
                return;
            }
            
            this.handleError(peerId, error);
        }
    }

    private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] ❌ No peer state found for ICE candidate from ${peerId}`);
            return;
        }

        try {
            console.log(`[WebRTC] 🧊 Adding ICE candidate from peer ${peerId}:`, {
                candidate: candidate.candidate,
                sdpMLineIndex: candidate.sdpMLineIndex,
                sdpMid: candidate.sdpMid,
                protocol: candidate.protocol,
                type: candidate.type,
                address: candidate.address,
                port: candidate.port
            });
            
            await peerState.connection.addIceCandidate(candidate);
            console.log(`[WebRTC] ✅ Successfully added ICE candidate from peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to add ICE candidate for peer ${peerId}:`, error);
            console.error(`[WebRTC] ❌ Candidate details:`, {
                candidate: candidate.candidate,
                sdpMLineIndex: candidate.sdpMLineIndex,
                sdpMid: candidate.sdpMid
            });
        }
    }

    private async handleDisconnect(peerId: string): Promise<void> {
        console.log(`[WebRTC] 📥 Received disconnect message from peer ${peerId} - performing silent reset`);
        
        // Dispatch disconnect event
        this.dispatchConnectionEvent(peerId, 'disconnected');
        
        // Clean up the specific peer connection
        this.cleanup(peerId);
        
        // If this was the last peer, do a complete silent reset to be ready for fresh connections
        // Note: We don't send disconnect messages when resetting as a response to receiving a disconnect
        if (this.connections.size === 0) {
            console.log(`[WebRTC] 🔄 Last peer disconnected, performing complete silent reset for fresh connections`);
            await this.resetSilently();
        }
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
                            // Check if we're in the middle of renegotiation - if so, be more conservative
        // We can detect renegotiation by checking if there's an ongoing renegotiation
        const isRenegotiating = this.ongoingRenegotiations.has(peerId);
                    
                                         if (isRenegotiating) {
                         console.log(`[WebRTC] ⚠️ Video disabled during renegotiation for peer ${peerId} - being conservative, not deleting stream`);
                         // During renegotiation, just update the state but don't delete the stream
                         this.updateRemoteVideoState(false, false);
                } else {
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
                    }
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
                
                 // Clean up screen share stream for this peer (if it exists)
                 const screenShareKey = `${peerId}-screen-share`;
                 if (this.remoteStreams.has(screenShareKey)) {
                     console.log(`[WebRTC] 🖥️ Cleaning up screen share stream for peer ${peerId}`);
                     const screenShareStream = this.remoteStreams.get(screenShareKey);
                     if (screenShareStream) {
                         screenShareStream.getTracks().forEach(track => {
                             track.stop();
                             console.log(`[WebRTC] 🖥️ Stopped remote screen share track: ${track.id}`);
                         });
                     }
                     this.remoteStreams.delete(screenShareKey);
                 }
                
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
            
            // Clean up screen share streams and state
            if (this.screenShareStream) {
                console.log(`[WebRTC] 🖥️ Cleaning up screen share stream during disconnect`);
                this.screenShareStream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[WebRTC] 🖥️ Stopped screen share track: ${track.id}`);
                });
                this.screenShareStream = null;
                this.isScreenSharing = false;
            }
             
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
            // Whoever clicks button first becomes the initiator for this renegotiation
            console.log(`[WebRTC] Renegotiation: ${this.userId} sending offer to peer ${peerId} (initiator for this action)`);
            

            
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







    // Sequence tracking for debugging
    private logSequence(peerId: string, step: string, action: string, details?: any): void {
        const timestamp = new Date().toISOString();
        const peerState = this.connections.get(peerId);
        const phase = peerState?.phase || 'unknown';
        
        console.log(`[SEQUENCE] ${timestamp} | Peer ${peerId} | Step: ${step} | Action: ${action} | Phase: ${phase}`, details || '');
    }

    // Reset Methods
    private async resetMedia(): Promise<void> {
        console.log(`[WebRTC] 🔄 RESET: Starting media reset`);
        
        // Stop all local media tracks gracefully
        if (this.localStream) {
            const tracks = this.localStream.getTracks();
            console.log(`[WebRTC] 🔄 RESET: Stopping ${tracks.length} local tracks`);
            
            tracks.forEach(track => {
                console.log(`[WebRTC] 🔄 RESET: Stopping track:`, {
                    kind: track.kind,
                    id: track.id,
                    enabled: track.enabled,
                    readyState: track.readyState
                });
                track.stop();
            });
            
            this.localStream = null;
        }
        
        // Stop screen share stream if active
        if (this.screenShareStream) {
            console.log(`[WebRTC] 🔄 RESET: Stopping screen share stream`);
            this.screenShareStream.getTracks().forEach(track => {
                console.log(`[WebRTC] 🔄 RESET: Stopping screen share track:`, {
                    kind: track.kind,
                    id: track.id,
                    enabled: track.enabled,
                    readyState: track.readyState
                });
                track.stop();
            });
            this.screenShareStream = null;
            this.isScreenSharing = false;
        }
        
        // Reset media state flags
        this.hasLocalAudio = false;
        this.hasLocalVideo = false;
        
        // Notify all connected peers about media state change
        const connectedPeers = this.getConnectedPeers();
        if (connectedPeers.length > 0) {
            console.log(`[WebRTC] 🔄 RESET: Notifying ${connectedPeers.length} peers about media reset`);
            
            const mediaState: MediaState = {
                audio: false,
                video: false,
                stream: null
            };
            
            for (const peerId of connectedPeers) {
                try {
                    await this.sendMediaState(peerId, mediaState);
                    console.log(`[WebRTC] 🔄 RESET: Sent media reset notification to peer ${peerId}`);
                } catch (error) {
                    console.warn(`[WebRTC] ⚠️ Failed to send media reset to peer ${peerId}:`, error);
                }
            }
        }
        
        // Emit local media state change event
        this.notifyStateChange();
        
        console.log(`[WebRTC] 🔄 RESET: Media reset completed`);
    }

    private async resetRemoteStreams(): Promise<void> {
        console.log(`[WebRTC] 🔄 RESET: Starting remote streams reset`);
        
        const peerIds = Array.from(this.remoteStreams.keys());
        console.log(`[WebRTC] 🔄 RESET: Clearing ${peerIds.length} remote streams`);
        
        for (const peerId of peerIds) {
            const stream = this.remoteStreams.get(peerId);
            if (stream) {
                // Stop all tracks in the remote stream
                const tracks = stream.getTracks();
                tracks.forEach(track => {
                    console.log(`[WebRTC] 🔄 RESET: Stopping remote track:`, {
                        peerId,
                        kind: track.kind,
                        id: track.id,
                        readyState: track.readyState
                    });
                    track.stop();
                });
            }
        }
        
        // Clear remote streams map
        this.remoteStreams.clear();
        
        // Reset remote state flags
        this.hasRemoteAudio = false;
        this.hasRemoteVideo = false;
        
        // Emit state change event to notify UI
        this.notifyStateChange();
        
        console.log(`[WebRTC] 🔄 RESET: Remote streams reset completed`);
    }

    private async resetConnections(): Promise<void> {
        console.log(`[WebRTC] 🔄 RESET: Starting connections reset`);
        
        const peerIds = Array.from(this.connections.keys());
        console.log(`[WebRTC] 🔄 RESET: Closing ${peerIds.length} peer connections`);
        
        for (const peerId of peerIds) {
            const peerState = this.connections.get(peerId);
            if (peerState) {
                // Send disconnect notification to peer
                if (this.signalingService) {
                    try {
                        console.log(`[WebRTC] 🔄 RESET: Sending disconnect notification to peer ${peerId}`);
                        this.signalingService.send({
                            type: 'disconnect',
                            from: this.userId,
                            to: peerId,
                            data: { reason: 'reset', timestamp: Date.now() }
                        });
                    } catch (error) {
                        console.warn(`[WebRTC] ⚠️ Failed to send disconnect to peer ${peerId}:`, error);
                    }
                }
                
                // Close RTCPeerConnection
                if (peerState.connection) {
                    console.log(`[WebRTC] 🔄 RESET: Closing RTCPeerConnection for peer ${peerId}`);
                    peerState.connection.close();
                }
                
                // Close data channel
                if (peerState.dataChannel) {
                    console.log(`[WebRTC] 🔄 RESET: Closing data channel for peer ${peerId}`);
                    peerState.dataChannel.close();
                }
                
                // Clear timeout
                if (peerState.connectionTimeout) {
                    clearTimeout(peerState.connectionTimeout);
                }
            }
        }
        
        // Clear all connection maps
        this.connections.clear();
        
        console.log(`[WebRTC] 🔄 RESET: Connections reset completed`);
    }

    private async resetConnectionsSilently(): Promise<void> {
        console.log(`[WebRTC] 🔄 SILENT RESET: Starting silent connections reset`);
        
        const peerIds = Array.from(this.connections.keys());
        console.log(`[WebRTC] 🔄 SILENT RESET: Closing ${peerIds.length} peer connections silently`);
        
        for (const peerId of peerIds) {
            const peerState = this.connections.get(peerId);
            if (peerState) {
                // Close RTCPeerConnection without sending disconnect message
                if (peerState.connection) {
                    console.log(`[WebRTC] 🔄 SILENT RESET: Closing RTCPeerConnection for peer ${peerId}`);
                    peerState.connection.close();
                }
                
                // Close data channel
                if (peerState.dataChannel) {
                    console.log(`[WebRTC] 🔄 SILENT RESET: Closing data channel for peer ${peerId}`);
                    peerState.dataChannel.close();
                }
                
                // Clear timeout
                if (peerState.connectionTimeout) {
                    clearTimeout(peerState.connectionTimeout);
                }
            }
        }
        
        // Clear all connection maps
        this.connections.clear();
        
        console.log(`[WebRTC] 🔄 SILENT RESET: Silent connections reset completed`);
    }

    private resetEventSystem(): void {
        console.log(`[WebRTC] 🔄 RESET: Starting event system reset`);
        
        // Clear event listeners
        this.eventListeners.clear();
        
        // Clear processed messages and timestamps
        this.processedMessages.clear();
        this.messageTimestamps.clear();
        
        // Clear ongoing renegotiations
        this.ongoingRenegotiations.clear();
        
        // Reset message handler ID
        this.messageHandlerId = null;
        
        // Reset debug state variables
        this._lastLoggedRemoteVideoState = undefined;
        this._lastLoggedRemoteStreamState = undefined;
        this._lastLoggedLocalStreamState = undefined;
        
        console.log(`[WebRTC] 🔄 RESET: Event system reset completed`);
    }

    public async reset(): Promise<void> {
        console.log(`[WebRTC] 🔄 RESET: Starting complete WebRTC reset`);
        
        // Set reset timestamp for message deduplication
        this.lastResetTime = Date.now();
        console.log(`[WebRTC] 🔄 RESET: Set reset timestamp to ${this.lastResetTime}`);
        
        try {
            // Reset in order: media → remote streams → connections → event system
            await this.resetMedia();
            await this.resetRemoteStreams();
            await this.resetConnections();
            this.resetEventSystem();
            
            console.log(`[WebRTC] 🔄 RESET: Complete WebRTC reset successful`);
        } catch (error) {
            console.error(`[WebRTC] ❌ RESET: Error during reset:`, error);
            throw error;
        }
    }

    public async resetSilently(): Promise<void> {
        console.log(`[WebRTC] 🔄 SILENT RESET: Starting complete silent WebRTC reset`);
        
        // Set reset timestamp for message deduplication
        this.lastResetTime = Date.now();
        console.log(`[WebRTC] 🔄 SILENT RESET: Set reset timestamp to ${this.lastResetTime}`);
        
        try {
            // Reset in order: media → remote streams → connections → event system
            await this.resetMedia();
            await this.resetRemoteStreams();
            await this.resetConnectionsSilently(); // Use silent version that doesn't send disconnect messages
            this.resetEventSystem();
            
            console.log(`[WebRTC] 🔄 SILENT RESET: Complete silent WebRTC reset successful`);
        } catch (error) {
            console.error(`[WebRTC] ❌ SILENT RESET: Error during silent reset:`, error);
            throw error;
        }
    }

    /**
     * Request an updated peer list from the signaling server
     * This is called when connections fail or are lost unexpectedly
     */
    private requestUpdatedPeerList(): void {
        if (this.signalingService?.isConnected) {
            console.log(`[WebRTC] 🔄 Requesting updated peer list after unexpected disconnection`);
            // Send a request for updated peer list through the signaling service
            this.signalingService.send({
                type: 'get_peers',
                userId: this.userId
            });
        }
    }

    /**
     * Start screen sharing
     */
    public async startScreenShare(): Promise<void> {
        console.log('[WebRTC] 🖥️ Starting screen share...');
        
        try {
            // Get screen share stream
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false // Screen share audio can be added later if needed
            });
            
            console.log('[WebRTC] 🖥️ Screen share stream obtained:', {
                streamId: screenStream.id,
                videoTracks: screenStream.getVideoTracks().length,
                audioTracks: screenStream.getAudioTracks().length
            });
            
            // Store the screen share stream and update state immediately
            this.screenShareStream = screenStream;
            this.isScreenSharing = true;
            
            // Notify UI immediately for faster response
            this.notifyStateChange();
            
            // Handle screen share stream ending (user stops sharing)
            screenStream.getVideoTracks()[0].onended = () => {
                console.log('[WebRTC] 🖥️ Screen share stream ended by user');
                this.stopScreenShare();
            };
            
            // Add screen share tracks to all peer connections in parallel for faster processing
            const renegotiationPromises: Promise<void>[] = [];
            
            for (const [peerId, peerState] of this.connections.entries()) {
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] 🖥️ Adding screen share tracks to peer ${peerId}`);
                    
                    // Add video track from screen share
                    const videoTrack = screenStream.getVideoTracks()[0];
                    if (videoTrack) {
                        const sender = peerState.connection.addTrack(videoTrack, screenStream);
                        console.log(`[WebRTC] 🖥️ Added screen share video track to peer ${peerId}:`, {
                            trackId: videoTrack.id
                        });
                    }
                    
                    // Trigger renegotiation to send the new screen share track to remote peer
                    console.log(`[WebRTC] 🖥️ Triggering renegotiation for screen share to peer ${peerId}`);
                    renegotiationPromises.push(this.forceRenegotiation(peerId));
                }
            }
            
            // Wait for all renegotiations to complete in parallel
            if (renegotiationPromises.length > 0) {
                await Promise.all(renegotiationPromises);
            }
            
            console.log('[WebRTC] ✅ Screen share started successfully');
            
        } catch (error) {
            console.error('[WebRTC] ❌ Failed to start screen share:', error);
            throw error;
        }
    }

    /**
     * Stop screen sharing
     */
    public async stopScreenShare(): Promise<void> {
        console.log('[WebRTC] 🖥️ Stopping screen share...');
        
        try {
            // Stop all tracks in the screen share stream
            if (this.screenShareStream) {
                this.screenShareStream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[WebRTC] 🖥️ Stopped screen share track: ${track.id}`);
                });
            }
            
            // Remove screen share tracks from all peer connections
            for (const [peerId, peerState] of this.connections.entries()) {
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] 🖥️ Removing screen share tracks from peer ${peerId}`);
                    
                    // Remove all senders that have screen share tracks
                    const senders = peerState.connection.getSenders();
                    let removedAnyTrack = false;
                    senders.forEach(sender => {
                        if (sender.track && sender.track.kind === 'video' && 
                            this.screenShareStream && this.screenShareStream.getTracks().includes(sender.track)) {
                            // Store track ID before removing the track (as sender.track becomes null after removeTrack)
                            const trackId = sender.track.id;
                            peerState.connection.removeTrack(sender);
                            console.log(`[WebRTC] 🖥️ Removed screen share track from peer ${peerId}: ${trackId}`);
                            removedAnyTrack = true;
                        }
                    });
                    
                    // Trigger renegotiation if we removed any tracks
                    if (removedAnyTrack) {
                        console.log(`[WebRTC] 🖥️ Triggering renegotiation after removing screen share from peer ${peerId}`);
                        await this.forceRenegotiation(peerId);
                    }
                }
            }
            
            // Clear screen share state
            this.screenShareStream = null;
            this.isScreenSharing = false;
            
            // Notify UI of state change
            this.notifyStateChange();
            
            console.log('[WebRTC] ✅ Screen share stopped successfully');
            
        } catch (error) {
            console.error('[WebRTC] ❌ Failed to stop screen share:', error);
            throw error;
        }
    }

    /**
     * Get screen share stream
     */
    public getScreenShareStream(): MediaStream | null {
        return this.screenShareStream;
    }

    /**
     * Get remote screen share stream from a specific peer
     */
    public getRemoteScreenShareStream(peerId: string): MediaStream | null {
        const screenShareKey = `${peerId}-screen-share`;
        return this.remoteStreams.get(screenShareKey) || null;
    }

    /**
     * Check if screen sharing is active
     */
    public isScreenSharingActive(): boolean {
        return this.isScreenSharing;
    }

    /**
     * Handle incoming screen share tracks from remote peers
     */
    private handleScreenShareTrack(event: RTCTrackEvent, peerId: string): void {
        console.log(`[WebRTC] 🖥️ Handling screen share track from peer ${peerId}`);
        
        // Create a separate stream for screen share if it doesn't exist
        let screenShareStream = new MediaStream();
        screenShareStream.addTrack(event.track);
        
        // Store the screen share stream separately from regular remote streams
        // We'll need to modify the VideoChat component to handle this
        console.log(`[WebRTC] 🖥️ Created screen share stream for peer ${peerId}:`, {
            streamId: screenShareStream.id,
            trackId: event.track.id,
            trackLabel: event.track.label
        });
        
        // For now, we'll store it in the remoteStreams map with a special key
        const screenShareKey = `${peerId}-screen-share`;
        this.remoteStreams.set(screenShareKey, screenShareStream);
        
        // Handle track ended events
        event.track.onended = () => {
            console.log(`[WebRTC] 🖥️ Screen share track ended from peer ${peerId}`);
            this.remoteStreams.delete(screenShareKey);
            this.notifyStateChange();
        };
        
        // Notify UI of state change
        this.notifyStateChange();
    }

    public destroy(): void {
        console.log(`[WebRTC] 🗑️ DESTROY: Starting WebRTCProvider destruction for instance ${this.instanceId}`);
        
        try {
            // Unregister message handler from signaling service
            if (this.messageHandlerId !== null && this.signalingService) {
                console.log(`[WebRTC] 🗑️ DESTROY: Unregistering message handler ID ${this.messageHandlerId}`);
                this.signalingService.removeMessageHandler(this.messageHandlerId);
                this.messageHandlerId = null;
            }
            
            // Clean up all connections
            this.cleanup();
            
            // Clear all state
            this.connections.clear();
            this.remoteStreams.clear();
            this.eventListeners.clear();
            this.processedMessages.clear();
            this.messageTimestamps.clear();
            this.ongoingRenegotiations.clear();
            
            // Clear media streams
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            // Clear screen share stream
            if (this.screenShareStream) {
                console.log(`[WebRTC] 🗑️ DESTROY: Cleaning up screen share stream`);
                this.screenShareStream.getTracks().forEach(track => track.stop());
                this.screenShareStream = null;
                this.isScreenSharing = false;
            }
            
            // Reset all state variables
            this.hasLocalVideo = false;
            this.hasLocalAudio = false;
            this.hasRemoteVideo = false;
            this.hasRemoteAudio = false;
            
            // Clear signaling service reference
            this.signalingService = null;
            
            // Mark as destroyed and clear static reference
            this.isDestroyed = true;
            if (WebRTCProvider.activeInstance === this) {
                WebRTCProvider.activeInstance = null;
            }
            
            console.log(`[WebRTC] 🗑️ DESTROY: WebRTCProvider destruction completed for instance ${this.instanceId}`);
        } catch (error) {
            console.error(`[WebRTC] ❌ DESTROY: Error during destruction:`, error);
        }
    }

    // Static methods for instance management
    public static getActiveInstance(): WebRTCProvider | null {
        return WebRTCProvider.activeInstance;
    }

    public static clearActiveInstance(): void {
        if (WebRTCProvider.activeInstance) {
            console.log(`[WebRTC] 🧹 Clearing active instance ${WebRTCProvider.activeInstance.instanceId}`);
            WebRTCProvider.activeInstance.destroy();
        }
    }

    public static clearAllInstances(): void {
        console.log(`[WebRTC] 🧹 Clearing all WebRTC instances`);
        WebRTCProvider.clearActiveInstance();
        WebRTCProvider.instanceId = 0;
    }

    public isActive(): boolean {
        return !this.isDestroyed && WebRTCProvider.activeInstance === this;
    }
}