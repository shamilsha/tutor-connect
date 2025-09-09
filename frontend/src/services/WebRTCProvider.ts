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

import { SignalingService } from './SignalingService';

// Utility function to properly log objects with fallbacks
const safeLog = (label: string, obj: any, fallback: string = 'No data') => {
    try {
        if (obj === null) {
            console.log(label, 'null');
        } else if (obj === undefined) {
            console.log(label, 'undefined');
        } else if (typeof obj === 'object') {
            // Try to stringify the object to see its contents
            const stringified = JSON.stringify(obj, null, 2);
            console.log(label, {
                type: typeof obj,
                constructor: obj.constructor?.name || 'Unknown',
                keys: Object.keys(obj),
                stringified: stringified,
                raw: obj
            });
        } else {
            console.log(label, obj);
        }
    } catch (error: any) {
        console.log(label, `[Error logging object: ${error.message}]`, obj);
    }
};

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

    remoteScreenShareId: string | null;
    // ICE candidate queue for candidates received before remote description is set
    iceCandidateQueue: RTCIceCandidate[];

}



export class WebRTCProvider implements IWebRTCProvider {

    // Static instance management to prevent multiple instances

    private static activeInstance: WebRTCProvider | null = null;

    private static instanceId = 0;

    // Public static method to clear all instances (used by DashboardPage)
    public static clearAllInstances(): void {
        console.log(`%c[WebRTC] 🧹 CLEARING ALL WEBRTC INSTANCES`, 'font-weight: bold; color: orange; font-size: 14px;');
        if (WebRTCProvider.activeInstance) {
            WebRTCProvider.activeInstance.destroy();
            // DashboardPage will set activeInstance to null, not here
        }
        WebRTCProvider.instanceId = 0;
        console.log('[WebRTC] All instances cleared');
    }

     // Method for DashboardPage to clear the active instance reference
    public static clearActiveInstance(): void {
        console.log(`%c[WebRTC] 🧹 CLEARING ACTIVE INSTANCE REFERENCE`, 'font-weight: bold; color: orange; font-size: 14px;');
        WebRTCProvider.activeInstance = null;
        console.log('[WebRTC] Active instance reference cleared');
    }

    // Instance properties

    private readonly instanceId: number;

    private isDestroyed = false;
    private isGracefulDisconnect = false;
    private isDestroying = false;



    // signaling service used to send and receive messages between peers before establishing a direct connection

    private signalingService: ISignalingService | null = null;

    // map of peer connections

    private connections: Map<string, RTCPeerState> = new Map();



    // event listeners for different WebRTC events

    private eventListeners: Map<WebRTCEventType, Set<WebRTCEventHandler>> = new Map();

    private userId: string;

    private config: WebRTCConfig;

    private rtcConfiguration: RTCConfiguration;

    private messageHandlerId: number | null = null;

    private processedMessages: Set<string> = new Set();

    private messageTimestamps: Map<string, number> = new Map(); // Track message timestamps for better deduplication

    private lastResetTime: number = 0; // Track when the last reset occurred



    

    // Debug logging state tracking

    private _lastLoggedRemoteVideoState: boolean | undefined;

    private _lastLoggedRemoteStreamState: string | undefined;

    private _lastLoggedLocalStreamState: string | undefined;



    // Screen share track ID mapping for explicit identification
    private screenShareTrackIds: WeakMap<MediaStreamTrack, string> | null = null;
    
    // Custom screen share streams with modified track properties
    private customScreenShareStreams: WeakMap<MediaStreamTrack, MediaStream> | null = null;

    /**
     * Check if a track is explicitly marked as screen share using custom ID or label
     */
    private isExplicitScreenShareTrack(track: MediaStreamTrack): boolean {
        const idCheck = track.id.startsWith('screen-share-');
        const labelCheck = track.label.startsWith('screen-share-');
        
        console.log('[WebRTC] 🔍 Explicit screen share check for track:', {
            trackId: track.id,
            trackLabel: track.label,
            idStartsWithScreenShare: idCheck,
            labelStartsWithScreenShare: labelCheck,
            isExplicitScreenShare: idCheck || labelCheck
        });
        
        return idCheck || labelCheck;
    }

    // State change notification system

    private notifyStateChange() {
        // Derive state from streamManager instead of using private variables
        const state = {
            localAudio: this.streamManager.hasLocalAudio(),
            localVideo: this.streamManager.hasLocalVideo(),
            remoteAudio: this.streamManager.hasRemoteAudio(this.getConnectedPeers()[0] || ''),
            remoteVideo: this.streamManager.hasRemoteVideo(this.getConnectedPeers()[0] || '')
        };
        
        console.log('[WebRTC] 🔄 STATE CHANGED - Notifying UI:', state);
        console.log('[WebRTC] 🔄 STATE CHANGE DEBUG - Current streams:', {
            localAudio: this.streamManager.hasLocalAudio(),
            localVideo: this.streamManager.hasLocalVideo(),
            localScreen: this.streamManager.hasLocalScreen()
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

        const currentState = this.streamManager.hasLocalAudio();
        if (currentState !== enabled) {

            console.log(`[WebRTC] 🔄 Updated hasLocalAudio to: ${enabled}`);

            this.notifyStateChange();

        }

    }



    private updateLocalVideoState(enabled: boolean) {

        const currentState = this.streamManager.hasLocalVideo();
        if (currentState !== enabled) {

            console.log(`[WebRTC] 🔄 Updated hasLocalVideo to: ${enabled}`);

            this.notifyStateChange();

        }

    }



    private updateRemoteAudioState(enabled: boolean, peerId?: string) {

        const targetPeerId = peerId || this.getConnectedPeers()[0] || '';
        const currentState = this.streamManager.hasRemoteAudio(targetPeerId);
        if (currentState !== enabled) {

            console.log(`[WebRTC] 🔄 Updated hasRemoteAudio to: ${enabled} for peer ${targetPeerId}`);

            this.notifyStateChange();

        }

    }



    private updateRemoteVideoState(enabled: boolean, notifyUI: boolean = true, peerId?: string) {

        const targetPeerId = peerId || this.getConnectedPeers()[0] || '';
        const currentState = this.streamManager.hasRemoteVideo(targetPeerId);
        console.log(`[WebRTC] 🔄 updateRemoteVideoState called with enabled: ${enabled}, current hasRemoteVideo: ${currentState}, notifyUI: ${notifyUI}, peerId: ${targetPeerId}`);

        console.log(`[WebRTC] 🔄 Call stack:`, new Error().stack?.split('\n').slice(1, 4).join('\n'));



        if (currentState !== enabled) {

            const oldValue = currentState;

            console.log(`[WebRTC] 🔄 CHANGED hasRemoteVideo: ${oldValue} -> ${enabled}`);

            if (notifyUI) {

                this.notifyStateChange();

            }

        } else {

            console.log(`[WebRTC] 🔄 No change needed - hasRemoteVideo already ${enabled}`);

        }

        

        // Additional debug after state change

        console.log(`[WebRTC] 🔄 updateRemoteVideoState completed - Final state:`, {

            hasRemoteVideo: currentState,

            selectedPeer: targetPeerId

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

        

        console.log(`%c[WebRTC] 🚀 WEBRTC PROVIDER CREATED - Instance ${this.instanceId} for user ${this.userId}`, 'font-weight: bold; color: green; font-size: 14px;');
        console.log(`[WebRTC] WebRTCProvider instance ${this.instanceId} created for user ${this.userId}`);

        
        // Initialize stream manager
        this.streamManager.initialize();
        

        // DIAGNOSTIC CODE COMMENTED OUT - Only for debugging when needed

        // this.runConnectivityTest();

        // this.runNetworkDiagnostics();

    }

    
    // Note: Old track management methods removed - now using streamManager
    

    

    

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

        console.log(`[WebRTC] 🔄 dispatchEvent(${event.type}):`, handlers ? `${handlers.size} handlers` : 'No handlers');
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

        console.log(`[WebRTC] 🔄 addEventListener(${type}):`, this.eventListeners.get(type)!.size, 'total handlers');
    }



    public removeEventListener(type: WebRTCEventType, handler: WebRTCEventHandler): void {

        this.eventListeners.get(type)?.delete(handler);

    }



    // Configuration

    public setSignalingService(service: ISignalingService): void {
        // Only clean up connections if we're changing signaling services
        if (this.signalingService !== service) {
            console.log(`[WebRTC] Changing signaling service, cleaning up old connections`);
            this.cleanup();
        }

        this.signalingService = service;
        this.messageHandlerId = service.addMessageHandler(this.handleSignalingMessage.bind(this));
        console.log(`%c[WebRTC] 🚀 NEW HANDLER CREATED with ID: ${this.messageHandlerId}`, 'font-weight: bold; color: green; font-size: 14px;');
    }

    // Method for DashboardPage to get the handler ID for cleanup
    public getMessageHandlerId(): number | null {
        return this.messageHandlerId;
    }

    public setGracefulDisconnect(isGraceful: boolean): void {
        this.isGracefulDisconnect = isGraceful;
        console.log(`%c[WebRTC] 🏷️ GRACEFUL DISCONNECT FLAG SET TO: ${isGraceful}`, 'font-weight: bold; color: purple;');
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

            // Check if we're already responding to an initiation from this peer
            // If so, don't become an initiator - wait for their offer
            const isAlreadyResponding = this.connections.has(peerId) && 
                                      this.connections.get(peerId)?.phase === 'responding';
            
            if (isAlreadyResponding) {
                console.log(`[WebRTC] Already responding to peer ${peerId}, not becoming initiator`);
                return;
            }
            
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
            peerState.phase = 'initiating'; // Mark as initiating

            this.connections.set(peerId, peerState);

            // Create data channel for this peer (initiator creates data channel)
            const dataChannel = peerState.connection.createDataChannel('main', {
                ordered: true
            });
            peerState.dataChannel = dataChannel;
            this.setupDataChannel(dataChannel, peerId);

            // Set connection timeout
            console.log(`[WebRTC] ⏰ Setting connection timeout for peer ${peerId} (${this.INITIATION_TIMEOUT}ms)`);
            peerState.connectionTimeout = setTimeout(() => {
                console.log(`[WebRTC] ⏰ Connection timeout fired for peer ${peerId}`);
                this.handleConnectionTimeout(peerId);
            }, this.INITIATION_TIMEOUT);

            // Wait for initiate-ack response before creating and sending offer
            console.log(`[WebRTC] ⏳ Initiation sent to peer ${peerId} - waiting for initiate-ack response`);
            console.log(`[WebRTC] 📋 Will create and send offer after receiving initiate-ack from peer ${peerId}`);

            console.log(`[WebRTC] Initiation sent to peer ${peerId}`);



        } catch (error) {

            console.error(`[WebRTC] Failed to initiate connection to peer ${peerId}:`, error);

            this.handleError(peerId, error);

            throw error;

        }

    }



    public async disconnect(peerId: string, isInitiator: boolean = true): Promise<void> {

        const disconnectType = isInitiator ? 'initiator' : 'responder';
        console.log(`[WebRTC] 🔴 DISCONNECT CLEANUP for peer ${peerId} (${disconnectType} side)`);



        const peerState = this.connections.get(peerId);

        if (!peerState) return;



        if (isInitiator) {
            // Initiator side: Close the connection and clean up resources
            this.cleanup(peerId);
        } else {
            // Responder side: Only clean up local resources, don't close connection
            // (Connection will be closed by initiator automatically)
            this.cleanupLocalResources(peerId);
        }

    }



    public async disconnectAll(): Promise<void> {

        console.log(`[WebRTC] Disconnecting from all peers and resetting state`);

        

        try {

            // Use the comprehensive reset method

            await this.reset();

            

            console.log(`[WebRTC] Disconnect all completed successfully`);

        } catch (error) {
            // Provide user-friendly error message instead of technical error
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            
            if (errorName === 'AbortError' || errorMessage?.includes('interrupted by a new load request')) {
                console.log(`%c[WebRTC] ✅ Disconnect completed - video cleanup interrupted (this is normal during logout)`, 'font-weight: bold; color: blue;');
            } else {
                console.log(`%c[WebRTC] ⚠️ Disconnect completed with minor cleanup issues (this is normal during logout)`, 'font-weight: bold; color: blue;');
            }
            
            // Don't throw error during logout - it's expected
            console.log(`%c[WebRTC] ✅ Disconnect process completed successfully`, 'font-weight: bold; color: green;');
        }

    }



    // Media Management

    public async toggleMedia(options: { audio?: boolean; video?: boolean }): Promise<void> {
        console.log('[WebRTC] 🔄 toggleMedia called:', { options });

        // Keep two simple state variables
        const audioState = this.streamManager.hasLocalAudio();
        const videoState = this.streamManager.hasLocalVideo();

        console.log('[WebRTC] 🔄 Current state:', { audioState, videoState });

        // Track if we need to renegotiate for any peer
        const peersNeedingRenegotiation: string[] = [];

        // Handle audio changes
        if (options.audio !== undefined) {
            if (options.audio && !audioState) {
                // Audio is ON and prev state was OFF
                console.log('[WebRTC] 🔊 Audio ON - adding audio track');
                
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,        // ✅ Cancel echo
                            noiseSuppression: true,        // ✅ Reduce noise
                            autoGainControl: true,         // ✅ Auto volume control
                            sampleRate: 44100,             // ✅ High quality
                            channelCount: 1                // ✅ Mono audio
                        }, 
                        video: false 
                    });
                    const newAudioTrack = audioStream.getAudioTracks()[0];
                    
                    if (newAudioTrack) {
                        const newAudioStream = new MediaStream([newAudioTrack]);
                        this.streamManager.setLocalAudio(newAudioStream);
                        this.updateLocalAudioState(true);
                        
                        // Add track to all connected or connecting peers
                        for (const [peerId, peerState] of this.connections.entries()) {
                            if (peerState.connection && (peerState.connection.connectionState === 'connected' || peerState.connection.connectionState === 'connecting')) {
                                console.log(`[WebRTC] 🔊 Adding audio track to peer ${peerId} (state: ${peerState.connection.connectionState})`);
                                peerState.connection.addTrack(newAudioTrack, newAudioStream);
                                peersNeedingRenegotiation.push(peerId);
                            } else {
                                console.log(`[WebRTC] ⚠️ Cannot add audio track to peer ${peerId} - connection state: ${peerState.connection?.connectionState || 'no connection'}`);
                            }
                        }
                        
                        console.log('[WebRTC] ✅ Audio track added and sent to peers');
                    }
                } catch (error) {
                    console.error('[WebRTC] ❌ Failed to create audio track:', error);
                    return;
                }
                
            } else if (!options.audio && audioState) {
                // Audio is OFF and prev state was ON
                console.log('[WebRTC] 🔇 Audio OFF - removing audio track');
                
                const localAudio = this.streamManager.getLocalAudio();
                if (localAudio) {
                    const audioTrack = localAudio.getAudioTracks()[0];
                    if (audioTrack) {
                        // Remove track from all connected or connecting peers
                        for (const [peerId, peerState] of this.connections.entries()) {
                            if (peerState.connection && (peerState.connection.connectionState === 'connected' || peerState.connection.connectionState === 'connecting')) {
                                const senders = peerState.connection.getSenders();
                                const audioSender = senders.find(s => s.track?.id === audioTrack.id);
                                if (audioSender) {
                                    console.log(`[WebRTC] 🔇 Removing audio track from peer ${peerId} (state: ${peerState.connection.connectionState})`);
                                    peerState.connection.removeTrack(audioSender);
                                    peersNeedingRenegotiation.push(peerId);
                                }
                            }
                        }
                        
                        // Remove track (StreamManager will stop it)
                        this.streamManager.setLocalAudio(null);
                        this.updateLocalAudioState(false);
                        
                        console.log('[WebRTC] ✅ Audio track removed and stopped');
                    }
                } else {
                    console.warn('[WebRTC] ⚠️ No local audio stream found to remove');
                }
            } else {
                // Audio state not changed
                console.log('[WebRTC] 🔊 Audio state not changed:', { 
                    requested: options.audio, 
                    current: audioState 
                });
            }
        }

        // Handle video changes
        if (options.video !== undefined) {
            if (options.video && !videoState) {
                // Video is ON and prev state was OFF
                console.log('[WebRTC] 📹 Video ON - adding video track');
                
                try {
                    const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
                    const newVideoTrack = videoStream.getVideoTracks()[0];
                    
                    if (newVideoTrack) {
                        const newVideoStream = new MediaStream([newVideoTrack]);
                        this.streamManager.setLocalVideo(newVideoStream);
                        this.updateLocalVideoState(true);
                        
                        // Add track to all connected or connecting peers
                        for (const [peerId, peerState] of this.connections.entries()) {
                            if (peerState.connection && (peerState.connection.connectionState === 'connected' || peerState.connection.connectionState === 'connecting')) {
                                console.log(`[WebRTC] 📹 Adding video track to peer ${peerId} (state: ${peerState.connection.connectionState})`);
                                peerState.connection.addTrack(newVideoTrack, newVideoStream);
                                peersNeedingRenegotiation.push(peerId);
                            } else {
                                console.log(`[WebRTC] ⚠️ Cannot add video track to peer ${peerId} - connection state: ${peerState.connection?.connectionState || 'no connection'}`);
                            }
                        }
                        
                        console.log('[WebRTC] ✅ Video track added and sent to peers');
                    }
                } catch (error) {
                    console.error('[WebRTC] ❌ Failed to create video track:', error);
                    return;
                }
                
            } else if (!options.video && videoState) {
                // Video is OFF and prev state was ON
                console.log('[WebRTC] 📹 Video OFF - removing video track');
                
                const localVideo = this.streamManager.getLocalVideo();
                if (localVideo) {
                    const videoTrack = localVideo.getVideoTracks()[0];
                    if (videoTrack) {
                        // Remove track from all connected or connecting peers
                        for (const [peerId, peerState] of this.connections.entries()) {
                            if (peerState.connection && (peerState.connection.connectionState === 'connected' || peerState.connection.connectionState === 'connecting')) {
                                const senders = peerState.connection.getSenders();
                                const videoSender = senders.find(s => s.track?.id === videoTrack.id);
                                if (videoSender) {
                                    console.log(`[WebRTC] 📹 Removing video track from peer ${peerId} (state: ${peerState.connection.connectionState})`);
                                    peerState.connection.removeTrack(videoSender);
                                    peersNeedingRenegotiation.push(peerId);
                                }
                            }
                        }
                        
                        // Remove track (StreamManager will stop it)
                        this.streamManager.setLocalVideo(null);
                        this.updateLocalVideoState(false);
                        
                        console.log('[WebRTC] ✅ Video track removed and stopped');
                    }
                } else {
                    console.warn('[WebRTC] ⚠️ No local video stream found to remove');
                }
            } else {
                // Video state not changed
                console.log('[WebRTC] 📹 Video state not changed:', { 
                    requested: options.video, 
                    current: videoState 
                });
            }
        }

        // Update peer state and send media state messages
        for (const [peerId, peerState] of this.connections.entries()) {
            if (peerState.connection?.connectionState === 'connected') {
                // Update peer state
                if (options.audio !== undefined) {
                    peerState.mediaState.audio = options.audio;
                }
                if (options.video !== undefined) {
                    peerState.mediaState.video = options.video;
                }
                
                // Send media state message with current actual state
                const currentAudioState = this.streamManager.hasLocalAudio();
                const currentVideoState = this.streamManager.hasLocalVideo();
                
                console.log('[WebRTC] 📤 Sending media state to peer:', {
                    peerId,
                    audio: currentAudioState,
                    video: currentVideoState
                });
                
                await this.sendMediaState(peerId, {
                    audio: currentAudioState,
                    video: currentVideoState
                });
            }
        }

        // Trigger renegotiation for peers that need it
        for (const peerId of peersNeedingRenegotiation) {
            console.log(`[WebRTC] 🔄 Triggering renegotiation for peer ${peerId}`);
            await this.forceRenegotiation(peerId);
        }
    }

    // Stream Management

    public async addMediaStream(stream: MediaStream): Promise<void> {

        console.log(`[WebRTC] 🗂️ Processing new media stream:`, {
            streamId: stream.id,
            audioTracks: stream.getAudioTracks().length,
            videoTracks: stream.getVideoTracks().length
        });
        
        // Extract tracks and store in streamManager
        const audioTrack = stream.getAudioTracks()[0] || null;
        const videoTrack = stream.getVideoTracks()[0] || null;
        
        // Store audio and video streams separately in streamManager
        if (audioTrack) {
            this.streamManager.setLocalAudio(new MediaStream([audioTrack]));
        }
        if (videoTrack) {
            this.streamManager.setLocalVideo(new MediaStream([videoTrack]));
        }
        
        console.log(`[WebRTC] 🗂️ Streams stored in streamManager:`, {
            audio: audioTrack?.id || 'null',
            video: videoTrack?.id || 'null'
        });
        

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

        

        // Add tracks to existing peer connections and trigger renegotiation
        console.log(`[WebRTC] 🔄 Adding tracks to ${this.connections.size} existing peer connections`);
        for (const [peerId, peerState] of this.connections) {

            if (peerState.connection && peerState.connection.connectionState === 'connected') {

                console.log(`[WebRTC] 🔄 Adding tracks to peer ${peerId} connection`);
                
                // Add audio track if available
                if (audioTrack) {
                    try {
                        peerState.connection.addTrack(audioTrack, stream);
                        console.log(`[WebRTC] ✅ Added audio track to peer ${peerId} connection`);
                    } catch (error) {
                        console.warn(`[WebRTC] ⚠️ Failed to add audio track to peer ${peerId}:`, error);
                    }
                }
                
                // Add video track if available
                if (videoTrack) {
                    try {
                        peerState.connection.addTrack(videoTrack, stream);
                        console.log(`[WebRTC] ✅ Added video track to peer ${peerId} connection`);
                    } catch (error) {
                        console.warn(`[WebRTC] ⚠️ Failed to add video track to peer ${peerId}:`, error);
                    }
                }
                
                // Trigger renegotiation to include new tracks
                console.log(`[WebRTC] 🔄 Triggering renegotiation for peer ${peerId} to include new tracks`);
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
                audio: options.audio ? {
                    echoCancellation: true,        // ✅ Cancel echo
                    noiseSuppression: true,        // ✅ Reduce noise
                    autoGainControl: true,         // ✅ Auto volume control
                    sampleRate: 44100,             // ✅ High quality
                    channelCount: 1                // ✅ Mono audio
                } : false,
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
        const localStream = this.streamManager.getLocalAudio() || this.streamManager.getLocalVideo();
        const actualAudioEnabled = localStream?.getAudioTracks()[0]?.enabled ?? false;

        const actualVideoEnabled = localStream?.getVideoTracks()[0]?.enabled ?? false;

        

        return {

            stream: localStream,

            audio: actualAudioEnabled,

            video: actualVideoEnabled

        };

    }



    // Stream manager access methods - UI components can access streams directly
    public getStreamManager() {
        return this.streamManager;
    }

    // Interface compliance methods - simple getters for backward compatibility
    public getLocalVideoState(): boolean {

        return this.streamManager.hasLocalVideo();

    }



    public getLocalAudioState(): boolean {

        return this.streamManager.hasLocalAudio();

    }

    // Public methods for UI components to access streams
    public getRemoteScreen(peerId: string): MediaStream | null {
        return this.streamManager.getRemoteScreen(peerId);
    }

    public getRemoteVideo(peerId: string): MediaStream | null {
        return this.streamManager.getRemoteVideo(peerId);
    }

    public getRemoteAudio(peerId: string): MediaStream | null {
        return this.streamManager.getRemoteAudio(peerId);
    }





    public getRemoteVideoState(): boolean {

        // Get the first connected peer for backward compatibility
        const connectedPeers = this.getConnectedPeers();
        const firstPeer = connectedPeers[0];
        if (firstPeer) {
            return this.streamManager.hasRemoteVideo(firstPeer);
        }
        return false;
    }



    public getRemoteAudioState(): boolean {

        // Get the first connected peer for backward compatibility
        const connectedPeers = this.getConnectedPeers();
        const firstPeer = connectedPeers[0];
        if (firstPeer) {
            return this.streamManager.hasRemoteAudio(firstPeer);
        }
        return false;
    }



    // Getter methods for streams

    public getLocalStream(): MediaStream | null {

        // Return combined local audio and video stream
        const localAudio = this.streamManager.getLocalAudio();
        const localVideo = this.streamManager.getLocalVideo();
        
        if (localAudio && localVideo) {
            // Combine audio and video streams
            const combinedStream = new MediaStream();
            localAudio.getTracks().forEach(track => combinedStream.addTrack(track));
            localVideo.getTracks().forEach(track => combinedStream.addTrack(track));
            return combinedStream;
        }
        
        return localVideo || localAudio || null;
    }



    public getRemoteStream(peerId?: string): MediaStream | null {

        if (peerId) {

            // Return combined remote audio and video stream for the peer
            const remoteAudio = this.streamManager.getRemoteAudio(peerId);
            const remoteVideo = this.streamManager.getRemoteVideo(peerId);
            
            if (remoteAudio && remoteVideo) {
                // Combine audio and video streams
                const combinedStream = new MediaStream();
                remoteAudio.getTracks().forEach(track => combinedStream.addTrack(track));
                remoteVideo.getTracks().forEach(track => combinedStream.addTrack(track));
                return combinedStream;
            }
            
            return remoteVideo || remoteAudio || null;
        }
        
        // Return the first available remote stream (for backward compatibility)
        const connectedPeers = this.getConnectedPeers();
        const firstPeer = connectedPeers[0];
        if (firstPeer) {
            return this.getRemoteStream(firstPeer);
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

    // Note: Old track management maps removed - now using streamManager
    
    // Centralized stream management structure
    private streamManager = {
        // Track when streams actually change
        lastChangeTimestamp: 0,
        
        // Method to notify of stream changes
        notifyStreamChange: (type: 'local' | 'remote', kind: 'audio' | 'video' | 'screen', peerId?: string) => {
            this.streamManager.lastChangeTimestamp = Date.now();
            console.log(`[StreamManager] 🔄 Stream change detected: ${type} ${kind}${peerId ? ` for peer ${peerId}` : ''}`);
        },
        // Stream storage: Map<local|remote, Map<streamType, Map<peerId, stream>>>
        streams: new Map<'local' | 'remote', Map<'audio' | 'video' | 'screen', Map<string, MediaStream | null>>>(),
        
        // Initialize stream structure
        initialize: () => {
            // Initialize local streams (peerId = 'local')
            const localStreams = new Map<'audio' | 'video' | 'screen', Map<string, MediaStream | null>>();
            localStreams.set('audio', new Map([['local', null]]));
            localStreams.set('video', new Map([['local', null]]));
            localStreams.set('screen', new Map([['local', null]]));
            this.streamManager.streams.set('local', localStreams);
            
            // Initialize remote streams (peerId = actual peer IDs)
            const remoteStreams = new Map<'audio' | 'video' | 'screen', Map<string, MediaStream | null>>();
            remoteStreams.set('audio', new Map());
            remoteStreams.set('video', new Map());
            remoteStreams.set('screen', new Map());
            this.streamManager.streams.set('remote', remoteStreams);
            
            console.log('[StreamManager] 🗂️ Stream manager initialized');
        },
        
        // Local stream methods
        setLocalAudio: (stream: MediaStream | null) => {
            const localAudioMap = this.streamManager.streams.get('local')?.get('audio');
            if (localAudioMap) {
                // If setting to null, stop all tracks in the current stream first
                if (!stream) {
                    const currentStream = localAudioMap.get('local');
                    if (currentStream) {
                        console.log('[StreamManager] 🛑 Stopping all audio tracks before clearing stream');
                        currentStream.getAudioTracks().forEach(track => {
                            console.log(`[StreamManager] 🛑 Stopping audio track: ${track.id}`);
                            track.stop();
                        });
                    }
                }
                
                localAudioMap.set('local', stream);
                console.log('[StreamManager] 🗂️ Local audio stream updated:', stream?.id || 'null');
                
                // Notify of stream change and dispatch event for UI updates
                this.streamManager.notifyStreamChange('local', 'audio');
                this.dispatchEvent({
                    type: 'stream',
                    peerId: this.userId,
                    data: {
                        stream: stream,
                        type: 'local',
                        streamType: 'audio'
                    }
                });
            }
        },
        
        getLocalAudio: (): MediaStream | null => {
            return this.streamManager.streams.get('local')?.get('audio')?.get('local') || null;
        },
        
        setLocalVideo: (stream: MediaStream | null) => {
            const localVideoMap = this.streamManager.streams.get('local')?.get('video');
            if (localVideoMap) {
                // If setting to null, stop all tracks in the current stream first
                if (!stream) {
                    const currentStream = localVideoMap.get('local');
                    if (currentStream) {
                        console.log('[StreamManager] 🛑 Stopping all video tracks before clearing stream');
                        currentStream.getVideoTracks().forEach(track => {
                            console.log(`[StreamManager] 🛑 Stopping video track: ${track.id}`);
                            track.stop();
                        });
                    }
                }
                
                localVideoMap.set('local', stream);
                console.log('[StreamManager] 🗂️ Local video stream updated:', stream?.id || 'null');
                
                // Notify of stream change and dispatch event for UI updates
                this.streamManager.notifyStreamChange('local', 'video');
                this.dispatchEvent({
                    type: 'stream',
                    peerId: this.userId,
                    data: {
                        stream: stream,
                        type: 'local',
                        streamType: 'video'
                    }
                });
            }
        },
        
        getLocalVideo: (): MediaStream | null => {
            const stream = this.streamManager.streams.get('local')?.get('video')?.get('local') || null;
            console.log(`[StreamManager] 🔍 getLocalVideo():`, stream ? `Has stream (${stream.id})` : 'No stream');
            return stream;
        },
        
        setLocalScreen: (stream: MediaStream | null) => {
            const localScreenMap = this.streamManager.streams.get('local')?.get('screen');
            if (localScreenMap) {
                // If setting to null, stop all tracks in the current stream first
                if (!stream) {
                    const currentStream = localScreenMap.get('local');
                    if (currentStream) {
                        console.log('[StreamManager] 🛑 Stopping all screen share tracks before clearing stream');
                        currentStream.getVideoTracks().forEach(track => {
                            console.log(`[StreamManager] 🛑 Stopping screen share track: ${track.id}`);
                            track.stop();
                        });
                    }
                }
                
                localScreenMap.set('local', stream);
                console.log('[StreamManager] 🗂️ Local screen share stream updated:', stream?.id || 'null');
                
                // Notify of stream change and dispatch event for UI updates
                this.streamManager.notifyStreamChange('local', 'screen');
                this.dispatchEvent({
                    type: 'stream',
                    peerId: this.userId,
                    data: {
                        stream: stream,
                        type: 'local',
                        streamType: 'screen'
                    }
                });
            }
        },
        
        getLocalScreen: (): MediaStream | null => {
            const stream = this.streamManager.streams.get('local')?.get('screen')?.get('local') || null;
            console.log(`[StreamManager] 🔍 getLocalScreen():`, stream ? `Has stream (${stream.id})` : 'No stream');
            return stream;
        },
        
        // Remote stream methods
        setRemoteAudio: (peerId: string, stream: MediaStream | null) => {
            const remoteAudioMap = this.streamManager.streams.get('remote')?.get('audio');
            if (remoteAudioMap) {
                if (stream) {
                    remoteAudioMap.set(peerId, stream);
                    console.log(`[StreamManager] 🗂️ Remote audio stream set for peer ${peerId}:`, stream.id);
                    
                    // Notify of stream change and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'audio', peerId);
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: stream,
                            type: 'remote',
                            streamType: 'audio'
                        }
                    });
                } else {
                    remoteAudioMap.delete(peerId);
                    console.log(`[StreamManager] 🗂️ Remote audio stream removed for peer ${peerId}`);
                    
                    // Notify of stream removal and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'audio', peerId);
                    // Dispatch event for stream removal to notify UI
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: null,
                            type: 'remote',
                            streamType: 'audio'
                        }
                    });
                }
            }
        },
        
        getRemoteAudio: (peerId: string): MediaStream | null => {
            return this.streamManager.streams.get('remote')?.get('audio')?.get(peerId) || null;
        },
        
        setRemoteVideo: (peerId: string, stream: MediaStream | null) => {
            const remoteVideoMap = this.streamManager.streams.get('remote')?.get('video');
            if (remoteVideoMap) {
                if (stream) {
                    remoteVideoMap.set(peerId, stream);
                    console.log(`[StreamManager] 🗂️ Remote video stream set for peer ${peerId}:`, stream.id);
                    
                    // Notify of stream change and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'video', peerId);
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: stream,
                            type: 'remote',
                            streamType: 'video'
                        }
                    });
                } else {
                    remoteVideoMap.delete(peerId);
                    console.log(`[StreamManager] 🗂️ Remote video stream removed for peer ${peerId}`);
                    
                    // Notify of stream removal and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'video', peerId);
                    // Dispatch event for stream removal to notify UI
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: null,
                            type: 'remote',
                            streamType: 'video'
                        }
                    });
                }
            }
        },
        
        getRemoteVideo: (peerId: string): MediaStream | null => {
            const stream = this.streamManager.streams.get('remote')?.get('video')?.get(peerId) || null;
            console.log(`[StreamManager] 🔍 getRemoteVideo(${peerId}):`, stream ? `Has stream (${stream.id})` : 'No stream');
            return stream;
        },
        
        setRemoteScreen: (peerId: string, stream: MediaStream | null) => {
            const remoteScreenMap = this.streamManager.streams.get('remote')?.get('screen');
            if (remoteScreenMap) {
                if (stream) {
                    remoteScreenMap.set(peerId, stream);
                    console.log(`[StreamManager] 🗂️ Remote screen share stream set for peer ${peerId}:`, stream.id);
                    
                    // Notify of stream change and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'screen', peerId);
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: stream,
                            type: 'remote',
                            streamType: 'screen'
                        }
                    });
                } else {
                    remoteScreenMap.delete(peerId);
                    console.log(`[StreamManager] 🗂️ Remote screen share stream removed for peer ${peerId}`);
                    
                    // Notify of stream removal and dispatch event for UI updates
                    this.streamManager.notifyStreamChange('remote', 'screen', peerId);
                    // Dispatch event for stream removal to notify UI
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: null,
                            type: 'remote',
                            streamType: 'screen'
                        }
                    });
                }
            }
        },
        
        getRemoteScreen: (peerId: string): MediaStream | null => {
            const stream = this.streamManager.streams.get('remote')?.get('screen')?.get(peerId) || null;
            console.log(`[StreamManager] 🔍 getRemoteScreen(${peerId}):`, stream ? `Has stream (${stream.id})` : 'No stream');
            return stream;
        },
        
        // Check if there are any remote streams for any peer
        hasAnyRemoteStreams: (): boolean => {
            const remoteStreams = this.streamManager.streams.get('remote');
            if (!remoteStreams) return false;
            
            for (const [kind, peerMap] of remoteStreams.entries()) {
                if (peerMap.size > 0) {
                    return true;
                }
            }
            return false;
        },
        
        // State getters
        hasLocalAudio: (): boolean => {
            const localAudio = this.streamManager.getLocalAudio();
            return localAudio?.getAudioTracks().some(t => t.enabled) || false;
        },
        
        hasLocalVideo: (): boolean => {
            const localVideo = this.streamManager.getLocalVideo();
            return localVideo?.getVideoTracks().some(t => t.enabled) || false;
        },
        
        hasLocalScreen: (): boolean => {
            return this.streamManager.getLocalScreen() !== null;
        },
        
        hasRemoteAudio: (peerId: string): boolean => {
            const remoteAudio = this.streamManager.getRemoteAudio(peerId);
            return remoteAudio?.getAudioTracks().some(t => t.enabled) || false;
        },
        
        hasRemoteVideo: (peerId: string): boolean => {
            const remoteVideo = this.streamManager.getRemoteVideo(peerId);
            return remoteVideo?.getVideoTracks().some(t => t.enabled) || false;
        },
        
        hasRemoteScreen: (peerId: string): boolean => {
            return this.streamManager.getRemoteScreen(peerId) !== null;
        },
        
        // Cleanup methods
        clearPeerStreams: (peerId: string) => {
            this.streamManager.setRemoteAudio(peerId, null);
            this.streamManager.setRemoteVideo(peerId, null);
            this.streamManager.setRemoteScreen(peerId, null);
            console.log(`%c[StreamManager] ✅ Cleared all streams for peer ${peerId} (normal during cleanup)`, 'font-weight: bold; color: blue;');
        },
        
        clearAllStreams: () => {
            // Stop all local tracks before clearing
            console.log('[StreamManager] 🛑 Stopping all local tracks before clearing all streams');
            
            // Stop local audio tracks
            const localAudio = this.streamManager.getLocalAudio();
            if (localAudio) {
                localAudio.getAudioTracks().forEach(track => {
                    console.log(`[StreamManager] 🛑 Stopping local audio track: ${track.id}`);
                    track.stop();
                });
            }
            
            // Stop local video tracks
            const localVideo = this.streamManager.getLocalVideo();
            if (localVideo) {
                localVideo.getVideoTracks().forEach(track => {
                    console.log(`[StreamManager] 🛑 Stopping local video track: ${track.id}`);
                    track.stop();
                });
            }
            
            // Stop local screen share tracks
            const localScreen = this.streamManager.getLocalScreen();
            if (localScreen) {
                localScreen.getVideoTracks().forEach(track => {
                    console.log(`[StreamManager] 🛑 Stopping local screen share track: ${track.id}`);
                    track.stop();
                });
            }
            
            this.streamManager.setLocalAudio(null);
            this.streamManager.setLocalVideo(null);
            this.streamManager.setLocalScreen(null);
            
            // Clear all remote streams
            const remoteStreams = this.streamManager.streams.get('remote');
            if (remoteStreams) {
                remoteStreams.get('audio')?.clear();
                remoteStreams.get('video')?.clear();
                remoteStreams.get('screen')?.clear();
            }
            
            console.log(`%c[StreamManager] ✅ Cleared all streams (normal during cleanup)`, 'font-weight: bold; color: blue;');
        }
    };


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

            // Enhanced message logging
            console.group(`[WebRTC] 📤 Message Send Debug for peer ${peerId}`);
            safeLog('Message object:', message);
            safeLog('Message type:', typeof message);
            safeLog('Message keys:', message ? Object.keys(message) : 'no message');
            safeLog('Stringified message:', JSON.stringify(message, null, 2));
            safeLog('Data channel state:', peerState.dataChannel.readyState);
            console.groupEnd();

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

            pendingAction: null,

            remoteScreenShareId: null,
            iceCandidateQueue: []

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

            // Provide user-friendly connection state messages
            const stateMessages: Record<string, string> = {
                'new': `%c[WebRTC] 🆕 New connection to peer ${peerId}`,
                'connecting': `%c[WebRTC] 🔄 Connecting to peer ${peerId}...`,
                'connected': `%c[WebRTC] ✅ Connected to peer ${peerId}`,
                'disconnected': `%c[WebRTC] 🔌 Disconnected from peer ${peerId} (normal during cleanup)`,
                'failed': `%c[WebRTC] ❌ Connection to peer ${peerId} failed`,
                'closed': `%c[WebRTC] 🔒 Connection to peer ${peerId} closed (normal during cleanup)`
            };
            
            const message = stateMessages[state] || `%c[WebRTC] 🔄 Connection state for peer ${peerId}: ${state}`;
            const color = state === 'connected' ? 'green' : state === 'failed' ? 'red' : 'blue';
            console.log(message, `font-weight: bold; color: ${color};`);

            // Check if this is a graceful disconnect - if so, don't dispatch connection events
            if (this.isGracefulDisconnect && (state === 'disconnected' || state === 'closed')) {
                console.log(`%c[WebRTC] 🏷️ GRACEFUL DISCONNECT - NOT DISPATCHING CONNECTION EVENT for ${state}`, 'font-weight: bold; color: purple;');
                return;
            }

            const peerState = this.connections.get(peerId);

            if (!peerState) {
                // This is normal during cleanup - peer state may have been cleared already
                console.log(`%c[WebRTC] ℹ️ No peer state found for ${peerId} during connection state change (normal during cleanup)`, 'font-weight: bold; color: blue;');
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

            // Provide user-friendly ICE connection state messages
            const iceStateMessages = {
                'new': `%c[WebRTC] 🧊 ICE: Starting connection to peer ${peerId}...`,
                'checking': `%c[WebRTC] 🧊 ICE: Checking connection to peer ${peerId}...`,
                'connected': `%c[WebRTC] 🧊 ICE: Connected to peer ${peerId}`,
                'completed': `%c[WebRTC] 🧊 ICE: Connection to peer ${peerId} established`,
                'failed': `%c[WebRTC] 🧊 ICE: Connection to peer ${peerId} failed`,
                'disconnected': `%c[WebRTC] 🧊 ICE: Disconnected from peer ${peerId} (normal during cleanup)`,
                'closed': `%c[WebRTC] 🧊 ICE: Connection to peer ${peerId} closed (normal during cleanup)`
            };
            
            const message = iceStateMessages[state] || `%c[WebRTC] 🧊 ICE connection state for peer ${peerId}: ${state}`;
            const color = state === 'connected' || state === 'completed' ? 'green' : state === 'failed' ? 'red' : 'blue';
            console.log(message, `font-weight: bold; color: ${color};`);

            

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
                    // Provide user-friendly message for ICE disconnection
                    console.log(`%c[WebRTC] 🧊 ICE: Disconnected from peer ${peerId} (normal during cleanup)`, 'font-weight: bold; color: blue;');
                    
                    // Check if this is a graceful disconnect or cleanup phase
                    if (this.isGracefulDisconnect || this.isDestroying) {
                        console.log(`%c[WebRTC] 🧊 ICE: Disconnection during cleanup - not treating as error`, 'font-weight: bold; color: blue;');
                        return; // Don't treat as error during cleanup
                    }
                    
                    // Check if this is a temporary disconnection during renegotiation
                    const currentPeerState = this.connections.get(peerId);
                    if (currentPeerState && (currentPeerState.phase === 'connecting' || currentPeerState.phase === 'connected')) {
                        console.log(`%c[WebRTC] 🔄 ICE disconnection detected during active phase - this may be temporary during renegotiation`, 'font-weight: bold; color: orange;');
                        
                        // Don't immediately clean up - wait for reconnection or failure
                        // The connection will either reconnect or fail, and we'll handle it then
                    } else {
                        console.log(`%c[WebRTC] ⚠️ ICE disconnection in inactive phase - cleaning up connection`, 'font-weight: bold; color: orange;');
                        this.handleError(peerId, new Error('ICE connection disconnected'));
                    }
                    break;

                case 'closed':
                    console.log(`%c[WebRTC] 🧊 ICE: Connection closed for peer ${peerId} (normal during cleanup)`, 'font-weight: bold; color: blue;');
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

                hasRemoteVideo: this.streamManager.hasRemoteVideo(peerId),

                remoteStreamsSize: this.streamManager.hasAnyRemoteStreams() ? 1 : 0,

                existingRemoteStreamId: this.streamManager.getRemoteVideo(peerId)?.id

            });

            

            // Check if this is a screen share track
            // Screen share tracks can be identified by:
            // 1. 🔍 GEMINI'S SUGGESTION: Explicit custom ID prefix "screen-share-"
            // 2. Track label containing screen/display/window keywords
            // 3. Coming from a different stream than the main video stream
            // 4. Track settings (contentHint, aspectRatio, frameRate, etc.)
            
            const trackLabel = event.track.label.toLowerCase();
            
            // 🔍 PRIMARY DETECTION: Check for explicit screen share ID
            const explicitScreenShareDetection = this.isExplicitScreenShareTrack(event.track);

            const streamId = event.streams?.[0]?.id;
            const existingRemoteVideoStream = this.streamManager.getRemoteVideo(peerId);
            const trackSettings = event.track.getSettings();

            const contentHint = event.track.contentHint;
            
            // 🔍 DATA CHANNEL DETECTION: Check if this track's stream ID matches the stored screen share ID
            const peerState = this.connections.get(peerId);
            const dataChannelDetection = peerState && peerState.remoteScreenShareId && 
                streamId === peerState.remoteScreenShareId;
            
            // Debug data channel detection
            if (peerState) {
                console.log(`[WebRTC] 🔍 Data channel detection for track ${event.track.id}:`, {
                    trackStreamId: streamId,
                    storedScreenShareId: peerState.remoteScreenShareId,
                    dataChannelDetection: dataChannelDetection
                });
            }
            

            // Enhanced screen share detection based on Gemini's suggestions
            const labelBasedDetection = trackLabel.includes('screen') || 

                                      trackLabel.includes('display') || 

                                      trackLabel.includes('window') ||

                                      trackLabel.includes('monitor') ||

                                      trackLabel.includes('desktop');

            

            const streamBasedDetection = streamId && existingRemoteVideoStream && streamId !== existingRemoteVideoStream.id;
            

            const settingsBasedDetection = event.track.kind === 'video' && (

                contentHint === 'detail' || // Screen share often has 'detail' content hint
                (trackSettings.aspectRatio && trackSettings.aspectRatio > 1.5) || // Screen share often has wide aspect ratio
                (trackSettings.frameRate && trackSettings.frameRate > 24) // Screen share often has higher frame rate
            );
            
            // 🔍 ENHANCED DETECTION: Check for our custom contentHint modification
            const customContentHintDetection = event.track.kind === 'video' && contentHint === 'detail';
            
            // 🔍 GEMINI'S SUGGESTION: Check for custom SDP extension in track context
            // This would be set if the track came from an SDP with our custom extension
            const customSdpExtensionDetection = false; // TODO: Implement when we have SDP context
            
            const isScreenShareTrack = event.track.kind === 'video' && 

                (explicitScreenShareDetection || dataChannelDetection || customContentHintDetection || customSdpExtensionDetection || labelBasedDetection || streamBasedDetection || settingsBasedDetection);

            // 🔍 DETECTION PRIORITY SUMMARY
            console.log(`[WebRTC] 🔍 DETECTION PRIORITY for track ${event.track.id}:`, {
                priority1_explicit: explicitScreenShareDetection,
                priority2_dataChannel: dataChannelDetection,
                priority3_contentHint: customContentHintDetection,
                priority4_sdpExtension: customSdpExtensionDetection,
                priority5_label: labelBasedDetection,
                priority6_stream: streamBasedDetection,
                priority7_settings: settingsBasedDetection,
                finalResult: isScreenShareTrack ? 'SCREEN_SHARE' : 'CAMERA_VIDEO',
                methodUsed: explicitScreenShareDetection ? 'EXPLICIT_ID' : 
                           dataChannelDetection ? 'DATA_CHANNEL_ID_MATCH' :
                           customContentHintDetection ? 'CONTENT_HINT_DETAIL' :
                           customSdpExtensionDetection ? 'CUSTOM_SDP_EXTENSION' :
                           labelBasedDetection ? 'LABEL_ANALYSIS' :
                           streamBasedDetection ? 'STREAM_ANALYSIS' :
                           settingsBasedDetection ? 'SETTINGS_ANALYSIS' : 'NONE'
            });
            

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
                explicitScreenShareDetection,
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

                existingRemoteStreamId: this.streamManager.getRemoteVideo(peerId)?.id,

                streamIdDifferent: streamId && existingRemoteVideoStream ? streamId !== existingRemoteVideoStream.id : false,
                
                // Enhanced stream context for debugging
                allRemoteStreams: this.getConnectedPeers().map(peer => ({ 
                    peer, 
                    streamId: this.streamManager.getRemoteVideo(peer)?.id || this.streamManager.getRemoteAudio(peer)?.id 
                })),
                streamManagerRemoteVideo: this.streamManager.getRemoteVideo(peerId)?.id,
                streamManagerRemoteScreen: this.streamManager.getRemoteScreen(peerId)?.id,
                streamManagerLocalScreen: this.streamManager.getLocalScreen()?.id,
                

                // Current state

                hasRemoteVideo: this.streamManager.hasRemoteVideo(peerId),

                remoteStreamsSize: this.streamManager.hasAnyRemoteStreams() ? 1 : 0,

                

                // Classification result

                isScreenShareTrack,

                finalClassification: isScreenShareTrack ? 'SCREEN_SHARE' : 'CAMERA_VIDEO/AUDIO'

            });

            

            if (isScreenShareTrack) {

                console.log(`[WebRTC] 🖥️ Detected screen share track from peer ${peerId}`);
                console.log(`[WebRTC] 🖥️ CLASSIFICATION REASON:`, {
                    explicit: explicitScreenShareDetection,
                    contentHint: customContentHintDetection,
                    labelBased: labelBasedDetection,
                    streamBased: streamBasedDetection,
                    settingsBased: settingsBasedDetection,
                    finalDecision: 'SCREEN_SHARE'
                });

                this.handleScreenShareTrack(event, peerId);

                return;

            } else {
                console.log(`[WebRTC] 🎥 CLASSIFICATION REASON for camera video:`, {
                    explicit: explicitScreenShareDetection,
                    contentHint: customContentHintDetection,
                    labelBased: labelBasedDetection,
                    streamBased: streamBasedDetection,
                    settingsBased: settingsBasedDetection,
                    finalDecision: 'CAMERA_VIDEO'
                });
            }

            

            // Add track to streamManager
            const trackType = event.track.kind === 'audio' ? 'audio' : 'video';
            // Note: setRemoteTrack is handled by the stream creation logic below
            console.log(`[WebRTC] 🗂️ Remote ${trackType} track added to track management system for peer ${peerId}:`, event.track.id);
            

            // Check if we should ignore this track based on current media state

            // Only ignore video tracks if we have explicitly received a media state message saying video is off

            // This allows us to accept video tracks when a peer turns on video

            if (event.track.kind === 'video' && !this.streamManager.hasRemoteVideo(peerId)) {

                console.log(`[WebRTC] 🎥 Accepting video track from peer ${peerId} despite hasRemoteVideo=false - updating state`);

                // Update the remote video state to true since we're receiving a video track

                this.updateRemoteVideoState(true, false, peerId); // Don't notify UI yet

            }

            

            // Store or update the remote stream for this peer based on track type
            let remoteStream = this.streamManager.getRemoteAudio(peerId);
            if (trackType === 'video') {
                remoteStream = this.streamManager.getRemoteVideo(peerId);
            }
            
            let streamCreated = false;

            if (!remoteStream) {

                remoteStream = new MediaStream();

                

                // CRITICAL DEBUG: Log what we're storing

                console.log(`[WebRTC] 🔍 STORING NEW REMOTE ${trackType.toUpperCase()} STREAM FOR PEER ${peerId}:`, {
                    newRemoteStreamId: remoteStream.id,

                    peerId,

                    eventStreamIds: event.streams?.map(s => s.id) || [],

                    trackId: event.track.id,

                    trackKind: event.track.kind

                });

                

                // Store the stream in the appropriate category
                if (trackType === 'audio') {
                    this.streamManager.setRemoteAudio(peerId, remoteStream);
                } else {
                    this.streamManager.setRemoteVideo(peerId, remoteStream);
                }
                
                console.log(`[WebRTC] ✅ Created and stored new remote ${trackType} stream for peer ${peerId}:`, {
                    streamId: remoteStream.id
                });

                streamCreated = true;

            }

            

            // Add the track to the remote stream

            remoteStream.addTrack(event.track);

            console.log(`[WebRTC] Added ${event.track.kind} track to remote stream for peer ${peerId}`);

            

            // Update remote state variables based on track kind

            if (event.track.kind === 'video') {

                this.updateRemoteVideoState(true, false, peerId); // Don't notify UI yet

                console.log(`[WebRTC] ✅ Updated hasRemoteVideo to true`);

                

                // Always notify UI when we receive a video track

                console.log(`[WebRTC] 🔄 Video track received, notifying UI of stream availability`);

                this.notifyStateChange();

            } else if (event.track.kind === 'audio') {

                this.updateRemoteAudioState(true, peerId);

                console.log(`[WebRTC] ✅ Updated hasRemoteAudio to true`);

                

                // If this is a new stream or the first audio track, notify UI even if state didn't change

                if (streamCreated || remoteStream.getAudioTracks().length === 1) {

                    console.log(`[WebRTC] 🔄 Audio stream created/updated, notifying UI of stream availability`);

                    this.notifyStateChange();

                }

            }

            

            // Handle track ended events

            event.track.onended = () => {

                console.log(`%c[WebRTC] ✅ ${event.track.kind} track ended (normal during connection cleanup)`, 'font-weight: bold; color: blue;');

                if (event.track.kind === 'video') {

                    this.updateRemoteVideoState(false, false, peerId); // Don't notify UI yet

                    console.log(`[WebRTC] ✅ Updated hasRemoteVideo to false`);

                    

                    // Clean up remote stream if no more video tracks

                    const remoteVideoStream = this.streamManager.getRemoteVideo(peerId);
                    if (remoteVideoStream) {
                        const remainingVideoTracks = remoteVideoStream.getVideoTracks().filter((track: MediaStreamTrack) => track.readyState !== 'ended');
                        console.log(`[WebRTC] 🔍 Remaining video tracks for peer ${peerId}: ${remainingVideoTracks.length}`);

                        

                        if (remainingVideoTracks.length === 0) {

                            console.log(`[WebRTC] 🧹 Cleaning up remote video stream for peer ${peerId} (no more video tracks)`);
                            

                            // End all remaining tracks in the stream

                            const allTracks = remoteVideoStream.getTracks();
                            allTracks.forEach((track: MediaStreamTrack) => {
                                console.log(`[WebRTC] 🛑 Ending remaining track:`, {

                                    kind: track.kind,

                                    id: track.id,

                                    enabled: track.enabled,

                                    readyState: track.readyState

                                });

                                track.stop();

                            });

                            

                            this.streamManager.setRemoteVideo(peerId, null);
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

                    this.updateRemoteAudioState(false, peerId);

                    console.log(`[WebRTC] ✅ Updated hasRemoteAudio to false`);

                    

                    // Clean up remote stream if no more audio tracks
                    const remoteAudioStream = this.streamManager.getRemoteAudio(peerId);
                    if (remoteAudioStream) {
                        const remainingAudioTracks = remoteAudioStream.getAudioTracks().filter((track: MediaStreamTrack) => track.readyState !== 'ended');
                        console.log(`[WebRTC] 🔍 Remaining audio tracks for peer ${peerId}: ${remainingAudioTracks.length}`);
                        
                        if (remainingAudioTracks.length === 0) {
                            console.log(`[WebRTC] 🧹 Cleaning up remote audio stream for peer ${peerId} (no more audio tracks)`);
                            this.streamManager.setRemoteAudio(peerId, null);
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


private detectTrackRemoval(peerId: string, changeType: 'sender' | 'receiver') {
    console.log(`[WebRTC] 🔍 Detecting track removal for peer ${peerId}, change type: ${changeType}`);
    
    const peerState = this.connections.get(peerId);
    if (!peerState) return;
    
    const connection = peerState.connection;
    
    // Check if video tracks were removed
    const currentSenders = connection.getSenders();
    const currentReceivers = connection.getReceivers();
    
    console.log(`[WebRTC] 🔍 Current senders: ${currentSenders.length}, receivers: ${currentReceivers.length}`);
    
    // If we have no video senders but still have a remote video stream, clear it
    const videoSenders = currentSenders.filter(sender => sender.track?.kind === 'video');
    const hasRemoteVideo = this.streamManager.hasRemoteVideo(peerId);
    
    if (videoSenders.length === 0 && hasRemoteVideo) {
        console.log(`[WebRTC] 🗑️ No video senders detected but remote video exists - clearing remote video for peer ${peerId}`);
        
        // Clear the remote video stream
        this.streamManager.setRemoteVideo(peerId, null);
        
        // Notify UI that remote video was removed
        this.dispatchEvent({
            type: 'stream',
            peerId: peerId,
            data: {
                stream: null,
                type: 'remote',
                streamType: 'video'
            }
        });
        
        // Update state
        this.updateRemoteVideoState(false, true, peerId);
    }
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
            // Improved logging to show message contents properly
            safeLog(`[WebRTC] Received message on data channel from peer ${peerId}:`, {
                eventDataType: typeof event.data,
                eventDataContent: event.data,
                parsedMessage: (() => {
                    try {
                        return JSON.parse(event.data);
                    } catch (e) {
                        return 'Failed to parse JSON';
                    }
                })()
            });
            
            try {
                const message = JSON.parse(event.data);
                
                // Handle screen share signaling messages
                if (message.type === 'screenShare') {
                    this.handleScreenShareSignal(peerId, message);
                } else if (message.type === 'mediaState') {
                    // Handle media state changes from peer
                    this.handleMediaStateMessage(peerId, message);
                } else {
                    // Dispatch other messages as before
                    this.dispatchEvent({
                        type: 'message',
                        peerId,
                        data: message
                    });
                }
            } catch (error) {
                console.error(`[WebRTC] Error parsing message from peer ${peerId}:`, error);
            }
        };

    }

    /**
     * Start screen sharing
     */
    public async startScreenShare(): Promise<void> {
        console.log('[WebRTC] 🖥️ Starting screen share...');
        
        try {
            // Get screen share stream
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    // displaySurface: 'monitor' // Removed as it's not a standard MediaTrackConstraints property
                }
            });
            
            // Store in stream manager
            this.streamManager.setLocalScreen(screenStream);
            console.log('[WebRTC] 🖥️ Screen share stream obtained:', screenStream.id);
            
            // Add screen share tracks to all peer connections
            const renegotiationPromises: Promise<void>[] = [];
            
            for (const [peerId, peerState] of this.connections.entries()) {
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] 🖥️ Adding screen share tracks to peer ${peerId}`);
                    
                    // Add video track from screen share
                    const videoTrack = screenStream.getVideoTracks()[0];
                    if (videoTrack) {
                        // Explicitly set contentHint for screen share detection
                        videoTrack.contentHint = 'detail';
                        console.log(`[WebRTC] 🖥️ Set contentHint 'detail' for screen share video track: ${videoTrack.id}`);
                        const sender = peerState.connection.addTrack(videoTrack, screenStream);
                        console.log(`[WebRTC] 🖥️ Added screen share video track to peer ${peerId}:`, {
                            trackId: videoTrack.id,
                            contentHint: videoTrack.contentHint
                        });
                    }
                    
                    // Send screen share signal via data channel BEFORE renegotiation
                    console.log(`[WebRTC] 🖥️ Sending screen share signal to peer ${peerId} via data channel`);
                    this.sendScreenShareSignal(peerId, screenStream.id);
                    
                    // Trigger renegotiation
                    console.log(`[WebRTC] 🖥️ Triggering renegotiation for screen share to peer ${peerId}`);
                    renegotiationPromises.push(this.forceRenegotiation(peerId));
                }
            }
            
            // Wait for all renegotiations to complete
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
            // Get the screen share stream (StreamManager will stop tracks when clearing)
            const screenShareStream = this.streamManager.getLocalScreen();
            
            // Store the screen share track ID BEFORE clearing the stream
            const screenShareTrackId = screenShareStream?.getVideoTracks()[0]?.id;
            
            console.log(`[WebRTC] 🔍 Screen share track ID extracted:`, {
                screenShareStreamExists: !!screenShareStream,
                screenShareStreamId: screenShareStream?.id,
                videoTracksCount: screenShareStream?.getVideoTracks().length || 0,
                screenShareTrackId: screenShareTrackId
            });
            
            // Safety check: if we don't have a valid track ID, we can't proceed
            if (!screenShareTrackId) {
                console.warn(`[WebRTC] ⚠️ No screen share track ID found, skipping track removal`);
                // Still clear the stream
                this.streamManager.setLocalScreen(null);
                console.log('[WebRTC] ✅ Screen share stopped successfully (no tracks to remove)');
                return;
            }
            
            // Remove screen share tracks from all peer connections
            for (const [peerId, peerState] of this.connections.entries()) {
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] 🖥️ Removing screen share tracks from peer ${peerId}`);
                    
                    // Remove all senders that have screen share tracks
                    const senders = peerState.connection.getSenders();
                    let removedAnyTrack = false;
                    
                    console.log(`[WebRTC] 🔍 Checking ${senders.length} senders for screen share track removal`);
                    
                    senders.forEach((sender, index) => {
                        console.log(`[WebRTC] 🔍 Sender ${index}:`, {
                            hasTrack: !!sender.track,
                            trackKind: sender.track?.kind,
                            trackId: sender.track?.id,
                            isVideo: sender.track?.kind === 'video',
                            matchesScreenShare: screenShareTrackId && sender.track?.id === screenShareTrackId
                        });
                        
                        if (sender.track && sender.track.kind === 'video' && 
                            screenShareTrackId && sender.track.id === screenShareTrackId) {
                            const trackId = sender.track.id; // Capture ID BEFORE removal
                            peerState.connection.removeTrack(sender);
                            removedAnyTrack = true;
                            console.log(`[WebRTC] 🖥️ Removed screen share track from peer ${peerId}:`, trackId);
                        }
                    });
                    
                    // Send screen share stop signal via data channel
                    console.log(`[WebRTC] 🖥️ Sending screen share stop signal to peer ${peerId} via data channel`);
                    this.sendScreenShareSignal(peerId, null);
                    
                    // Trigger renegotiation if we removed any tracks
                    if (removedAnyTrack) {
                        console.log(`[WebRTC] 🖥️ Triggering renegotiation after removing screen share from peer ${peerId}`);
                        await this.forceRenegotiation(peerId);
                    }
                }
            }
            
            // Clear local screen share stream AFTER processing all peers
            this.streamManager.setLocalScreen(null);
            console.log('[WebRTC] ✅ Screen share stopped successfully');
            
        } catch (error) {
            console.error('[WebRTC] ❌ Failed to stop screen share:', error);
            throw error;
        }
    }

    /**
     * Handle media state changes from peer via data channel
     * This provides IMMEDIATE feedback for UI updates, faster than SDP renegotiation
     */
    private handleMediaStateMessage(peerId: string, message: any): void {
        // Bold logging for media state changes received from peer
        if (message.audio !== undefined) {
            console.log(`%c[WebRTC] 🔊 AUDIO STATE RECEIVED from peer (responder side):`, 'font-weight: bold; color: blue;', peerId, message.audio ? 'ENABLED' : 'DISABLED');
        }
        if (message.video !== undefined) {
            console.log(`%c[WebRTC] 📹 VIDEO STATE RECEIVED from peer (responder side):`, 'font-weight: bold; color: purple;', peerId, message.video ? 'ENABLED' : 'DISABLED');
        }
        console.log(`[WebRTC] 📱 Received media state message from peer ${peerId}:`, message);
        
        // Update the peer's media state to track what we've been told
        const peerState = this.connections.get(peerId);
        if (peerState) {
            peerState.mediaState = {
                audio: message.audio !== undefined ? message.audio : peerState.mediaState.audio,
                video: message.video !== undefined ? message.video : peerState.mediaState.video
            };
            console.log(`[WebRTC] 📱 Updated media state for peer ${peerId}:`, peerState.mediaState);
        }
        
        // Handle video state changes - IMMEDIATE response for instant UI updates
        if (message.video === false) {
            console.log(`[WebRTC] 🗑️ Peer ${peerId} turned off video - clearing remote video stream IMMEDIATELY`);
            
            // Clear the remote video stream immediately for instant UI feedback
            console.log(`[WebRTC] 🗑️ Clearing remote video stream for peer ${peerId} - current stream ID:`, this.streamManager.getRemoteVideo(peerId)?.id || 'none');
            this.streamManager.setRemoteVideo(peerId, null);
            
            // Update remote video state and notify UI immediately
            this.updateRemoteVideoState(false, true, peerId);
            
            console.log(`[WebRTC] ✅ Remote video stream cleared IMMEDIATELY for peer ${peerId}`);
        } else if (message.video === true) {
            console.log(`[WebRTC] ✅ Peer ${peerId} turned on video`);
            // Video will be handled by the ontrack event when the offer is received
        }
        
        // Handle audio state changes
        if (message.audio === false) {
            console.log(`[WebRTC] 🗑️ Peer ${peerId} turned off audio - clearing remote audio stream`);
            
            // Clear the remote audio stream
            this.streamManager.setRemoteAudio(peerId, null);
            
            console.log(`[WebRTC] ✅ Remote audio stream cleared for peer ${peerId}`);
        } else if (message.audio === true) {
            console.log(`[WebRTC] ✅ Peer ${peerId} turned on audio`);
            console.log(`[WebRTC] 🔍 Current video stream state before audio operation:`, {
                hasRemoteVideo: this.streamManager.hasRemoteVideo(peerId),
                remoteVideoStreamId: this.streamManager.getRemoteVideo(peerId)?.id || 'none',
                peerId
            });
            

            
            // Audio will be handled by the ontrack event when the offer is received
        }
    }

    /**
     * Handle screen share signals from data channels
     */
    private handleScreenShareSignal(peerId: string, message: any): void {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] No peer state found when handling screen share signal from peer ${peerId}`);
            return;
        }
        
        // Bold logging for screen share signals received from peer
        if (message.screenId) {
            console.log(`%c[WebRTC] 🖥️ SCREEN SHARE STARTED RECEIVED from peer (responder side):`, 'font-weight: bold; color: orange;', peerId);
        } else {
            console.log(`%c[WebRTC] 🖥️ SCREEN SHARE STOPPED RECEIVED from peer (responder side):`, 'font-weight: bold; color: orange;', peerId);
        }
        console.log(`[WebRTC] 🖥️ Received screen share signal from peer ${peerId}:`, message);
        
        if (message.screenId) {
            peerState.remoteScreenShareId = message.screenId;
            console.log(`[WebRTC] 🖥️ Stored remote screen share ID for peer ${peerId}: ${message.screenId}`);
        } else {
            peerState.remoteScreenShareId = null;
            console.log(`[WebRTC] 🖥️ Cleared remote screen share ID for peer ${peerId}`);
            this.streamManager.setRemoteScreen(peerId, null);
            // Don't dispatch event for null stream - just notify stream change
            this.streamManager.notifyStreamChange('remote', 'screen', peerId);
        }
    }

    /**
     * Send screen share signals via data channels
     */
    private sendScreenShareSignal(peerId: string, screenId: string | null): void {
        const peerState = this.connections.get(peerId);
        if (!peerState || !peerState.dataChannel || peerState.dataChannel.readyState !== 'open') {
            console.warn(`[WebRTC] Cannot send screen share signal to peer ${peerId}: data channel not ready`);
            return;
        }
        
        const message = {
            type: 'screenShare',
            screenId: screenId || null,
            timestamp: Date.now()
        };
        
        try {
            peerState.dataChannel.send(JSON.stringify(message));
            
            // Bold logging for screen share signals sent to peer
            if (screenId) {
                console.log(`%c[WebRTC] 🖥️ SCREEN SHARE STARTED SENT to peer (initiator side):`, 'font-weight: bold; color: orange;', peerId);
            } else {
                console.log(`%c[WebRTC] 🖥️ SCREEN SHARE STOPPED SENT to peer (initiator side):`, 'font-weight: bold; color: orange;', peerId);
            }
            console.log(`[WebRTC] 🖥️ Sent screen share signal to peer ${peerId}:`, message);
        } catch (error) {
            console.error(`[WebRTC] Failed to send screen share signal to peer ${peerId}:`, error);
        }
    }

    // Interface compliance methods
    public getScreenShareStream(): MediaStream | null {
        return this.streamManager.getLocalScreen();
    }

    public isScreenSharingActive(): boolean {
        return this.streamManager.hasLocalScreen();
    }

    public updateConfiguration(config: Partial<WebRTCConfig>): void {
        this.config = { ...this.config, ...config };
        if (config.iceServers) {
            this.rtcConfiguration.iceServers = config.iceServers;
        }
    }

    public destroy(): void {
        console.log(`%c[WebRTC] 💥 WEBRTC PROVIDER DESTROYED - Instance ${this.instanceId} for user ${this.userId}`, 'font-weight: bold; color: red; font-size: 14px;');
        this.isDestroying = true; // Set flag before cleanup
        this.isDestroyed = true;
        
        // Note: Message handler cleanup is now handled by DashboardPage
        // DashboardPage will call signalingService.removeMessageHandler() before calling destroy()
        
        this.disconnectAll();
        // Note: WebRTCProvider.activeInstance should be set to null by DashboardPage, not here
        console.log(`[WebRTC] WebRTCProvider instance ${this.instanceId} destroyed`);
    }

    // Missing internal methods
    private cleanup(peerId?: string): void {
        if (peerId) {
            const peerState = this.connections.get(peerId);
            if (peerState) {
                if (peerState.connection) {
                    // Check if connection is already closed to avoid errors
                    const currentState = peerState.connection.connectionState;
                    if (currentState !== 'closed') {
                        console.log(`[WebRTC] Closing connection for peer ${peerId} (current state: ${currentState})`);
                        peerState.connection.close();
                    } else {
                        console.log(`[WebRTC] Connection for peer ${peerId} is already closed, skipping close()`);
                    }
                }
                if (peerState.connectionTimeout) {
                    clearTimeout(peerState.connectionTimeout);
                }
                this.connections.delete(peerId);
                // Clean up streams for this peer
                this.streamManager.clearPeerStreams(peerId);
                console.log(`[WebRTC] Cleaned up peer ${peerId}`);
            }
        } else {
            // Clean up all connections
            for (const [id, peerState] of this.connections.entries()) {
                if (peerState.connection) {
                    // Check if connection is already closed to avoid errors
                    const currentState = peerState.connection.connectionState;
                    if (currentState !== 'closed') {
                        console.log(`[WebRTC] Closing connection for peer ${id} (current state: ${currentState})`);
                        peerState.connection.close();
                    } else {
                        console.log(`[WebRTC] Connection for peer ${id} is already closed, skipping close()`);
                    }
                }
                if (peerState.connectionTimeout) {
                    clearTimeout(peerState.connectionTimeout);
                }
            }
            this.connections.clear();
            // Clean up all streams
            this.streamManager.clearAllStreams();
            console.log('[WebRTC] Cleaned up all connections and streams');
        }
    }

    private cleanupLocalResources(peerId: string): void {
        console.log(`[WebRTC] 🔄 Cleaning up local resources for peer ${peerId} (responder side)`);
        
        const peerState = this.connections.get(peerId);
        if (peerState) {
            // Clear timeouts
            if (peerState.connectionTimeout) {
                clearTimeout(peerState.connectionTimeout);
            }
            
            // Remove from connections map
            this.connections.delete(peerId);
            
            // Clean up streams for this peer (local streams only)
            this.streamManager.clearPeerStreams(peerId);
            
            console.log(`[WebRTC] ✅ Local resources cleaned up for peer ${peerId} (connection left for initiator to close)`);
        } else {
            console.log(`[WebRTC] ⚠️ No peer state found for ${peerId} during local resource cleanup`);
        }
    }

    private async handleSignalingMessage(message: any): Promise<void> {
        console.log(`[WebRTC] �� Received signaling message:`, message);
        
        try {
            switch (message.type) {
                case 'offer':
                    console.log(`[WebRTC] 📥 Processing OFFER from peer ${message.from}`);
                    await this.handleOffer(message.from, message.sdp);
                    break;
                case 'answer':
                    console.log(`[WebRTC] 📥 Processing ANSWER from peer ${message.from}`);
                    await this.handleAnswer(message.from, message.sdp);
                    break;
                case 'ice-candidate':
                    console.log(`[WebRTC] 🧊 Processing ICE CANDIDATE from peer ${message.from}`);
                    await this.handleIceCandidate(message.from, message.candidate);
                    break;
                case 'initiate':
                    console.log(`[WebRTC] 🤝 Processing INITIATE from peer ${message.from}`);
                    await this.handleInitiation(message.from, message.data);
                    break;
                case 'initiate-ack':
                    console.log(`[WebRTC] ✅ Processing INITIATE-ACK from peer ${message.from}`);
                    await this.handleInitiateAck(message.from, message);
                    break;
                case 'offer-ack':
                    console.log(`[WebRTC] ✅ Processing OFFER-ACK from peer ${message.from}`);
                    await this.handleOfferAck(message.from, message);
                    break;
                case 'answer-ack':
                    console.log(`[WebRTC] ✅ Processing ANSWER-ACK from peer ${message.from}`);
                    await this.handleAnswerAck(message.from, message);
                    break;
                case 'ice-candidate-ack':
                    console.log(`[WebRTC] ✅ Processing ICE-CANDIDATE-ACK from peer ${message.from}`);
                    await this.handleIceCandidateAck(message.from, message);
                    break;
                case 'ice-complete':
                    console.log(`[WebRTC] 🧊 Processing ICE-COMPLETE from peer ${message.from}`);
                    await this.handleIceComplete(message.from, message.data);
                    break;
                case 'ice-complete-ack':
                    console.log(`[WebRTC] ✅ Processing ICE-COMPLETE-ACK from peer ${message.from}`);
                    await this.handleIceCompleteAck(message.from, message.data);
                    break;
                case 'disconnect':
                    console.log(`[WebRTC] 🔴 DISCONNECT RECEIVED from peer ${message.from} (responder side)`);
                    await this.handleDisconnectMessage(message.from, message.data);
                    break;
                default:
                    console.log(`[WebRTC] 📥 Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error(`[WebRTC] ❌ Error handling signaling message:`, error);
            
            // For critical errors, we should clean up the connection
            if (message.from && error instanceof Error && (error.message?.includes('Invalid SDP') || error.message?.includes('Invalid offer SDP'))) {
                console.error(`[WebRTC] 🚨 Critical SDP error from peer ${message.from}, cleaning up connection`);
                this.cleanup(message.from);
            }
            
            // Re-throw the error to ensure it's not silently ignored
            throw error;
        }
    }

    private async handleInitiation(fromPeerId: string, data: any): Promise<void> {
        console.log(`[WebRTC] 🤝 Handling initiation from peer ${fromPeerId}`);
        
        // Check if we already have a connection state for this peer
        if (this.connections.has(fromPeerId)) {
            const existingState = this.connections.get(fromPeerId)!;
            if (existingState.phase === 'initiating') {
                console.log(`[WebRTC] ⚠️ Already initiating to peer ${fromPeerId}, ignoring their initiation`);
                return;
            }
            if (existingState.phase === 'responding') {
                console.log(`[WebRTC] ⚠️ Already responding to peer ${fromPeerId}, ignoring duplicate initiation`);
                return;
            }
        }
        
        // Create peer state if it doesn't exist
        if (!this.connections.has(fromPeerId)) {
            const peerState = this.createPeerState(fromPeerId);
            this.connections.set(fromPeerId, peerState);
        }
        
        const peerState = this.connections.get(fromPeerId)!;
        peerState.phase = 'responding';
        
        // IMPORTANT: Responders do NOT create data channels - only initiators do
        // The data channel will be created when we receive the offer and set up the connection
        console.log(`[WebRTC] 📡 Responder mode: waiting for offer from initiator ${fromPeerId}`);
        
        // Send initiate-ack response to confirm we're ready to receive the offer
        if (this.signalingService) {
            // Add a small delay to ensure message handler is fully registered
            console.log(`[WebRTC] ⏳ Waiting 100ms for message handler registration to complete...`);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const ackMessage = {
                type: 'initiate-ack',
                from: this.userId,
                to: fromPeerId,
                timestamp: Date.now()
            };
            this.signalingService.send(ackMessage);
            console.log(`[WebRTC] ✅ Initiate-ack sent to peer ${fromPeerId} - ready to receive offer`);
        } else {
            console.warn(`[WebRTC] ⚠️ No signaling service available to send initiate-ack`);
        }
    }

    private async handleInitiateAck(fromPeerId: string, message: any): Promise<void> {
        console.log(`[WebRTC] ✅ Received initiate-ack from peer ${fromPeerId} - proceeding with offer creation`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.warn(`[WebRTC] ⚠️ No connection state found for peer ${fromPeerId} when handling initiate-ack`);
            return;
        }
        
        if (peerState.phase !== 'initiating') {
            console.warn(`[WebRTC] ⚠️ Unexpected phase ${peerState.phase} for peer ${fromPeerId} when handling initiate-ack`);
            return;
        }
        
        // Double-check: only the initiator should ever call this method
        if (peerState.phase !== 'initiating') {
            console.error(`[WebRTC] 🚨 CRITICAL: handleInitiateAck called by non-initiator peer ${fromPeerId} with phase ${peerState.phase}`);
            return;
        }
        
        try {
            // Now that we have the ack, create and send the SDP offer
            console.log(`[WebRTC] 🔄 Creating offer after receiving initiate-ack from peer ${fromPeerId}`);
            
            // Check RTCPeerConnection state before creating offer
            console.log(`[WebRTC] 📊 RTCPeerConnection state before createOffer:`, {
                connectionState: peerState.connection.connectionState,
                iceConnectionState: peerState.connection.iceConnectionState,
                iceGatheringState: peerState.connection.iceGatheringState,
                signalingState: peerState.connection.signalingState,
                localDescription: peerState.connection.localDescription ? 'set' : 'not set',
                remoteDescription: peerState.connection.remoteDescription ? 'set' : 'not set'
            });
            
            // Check if we have any tracks to offer
            const senders = peerState.connection.getSenders();
            const receivers = peerState.connection.getReceivers();
            console.log(`[WebRTC] 📡 Track state before createOffer:`, {
                senders: senders.length,
                receivers: receivers.length,
                senderTracks: senders.map(s => s.track?.kind || 'null'),
                receiverTracks: receivers.map(r => r.track?.kind || 'null')
            });
            
            // Ensure we have at least one track before creating offer
            if (senders.length === 0) {
                console.warn(`[WebRTC] ⚠️ No tracks in connection for peer ${fromPeerId}, adding default tracks`);
                
                // Add default audio/video tracks if available
                const localAudio = this.streamManager.getLocalAudio();
                const localVideo = this.streamManager.getLocalVideo();
                
                if (localAudio) {
                    const audioTrack = localAudio.getAudioTracks()[0];
                    if (audioTrack) {
                        peerState.connection.addTrack(audioTrack, localAudio);
                        console.log(`[WebRTC] ✅ Added default audio track to connection`);
                    }
                }
                
                if (localVideo) {
                    const videoTrack = localVideo.getVideoTracks()[0];
                    if (videoTrack) {
                        peerState.connection.addTrack(videoTrack, localVideo);
                        console.log(`[WebRTC] ✅ Added default video track to connection`);
                    }
                }
                
                // Re-check senders after adding tracks
                const updatedSenders = peerState.connection.getSenders();
                console.log(`[WebRTC] 📡 Updated track state after adding defaults:`, {
                    senders: updatedSenders.length,
                    senderTracks: updatedSenders.map(s => s.track?.kind || 'null')
                });
            }
            
            const offer = await peerState.connection.createOffer();
            
            // Log the entire offer object to debug
            console.log(`[WebRTC] 📋 Raw offer object:`, offer);
            console.log(`[WebRTC] 📋 Offer type:`, typeof offer);
            console.log(`[WebRTC] 📋 Offer.sdp type:`, typeof offer.sdp);
            console.log(`[WebRTC] 📋 Offer.sdp value:`, offer.sdp);
            
            // Validate SDP before processing
            if (!offer.sdp || typeof offer.sdp !== 'string') {
                throw new Error(`Invalid offer SDP: ${typeof offer.sdp} - ${offer.sdp}`);
            }
            
            console.log(`[WebRTC] 📋 Offer created for peer ${fromPeerId}:`, {
                sdpLength: offer.sdp.length,
                sdpStart: offer.sdp.substring(0, 100),
                sdpEnd: offer.sdp.substring(offer.sdp.length - 100)
            });
            
            await peerState.connection.setLocalDescription(offer);
            console.log(`[WebRTC] ✅ Local description set for peer ${fromPeerId}`);
            
            // Send the offer via signaling service
            if (this.signalingService) {
                const offerMessage = {
                    type: 'offer',
                    from: this.userId,
                    to: fromPeerId,
                    sdp: offer.sdp
                };
                
                // Log the offer message being sent
                console.log(`[WebRTC] 📤 Sending offer message:`, {
                    type: offerMessage.type,
                    from: offerMessage.from,
                    to: offerMessage.to,
                    sdpLength: offerMessage.sdp?.length || 'undefined',
                    sdpType: typeof offerMessage.sdp,
                    sdpStart: offerMessage.sdp?.substring(0, 50) || 'undefined',
                    callerPhase: peerState.phase,
                    callerRole: 'initiator'
                });
                
                this.signalingService.send(offerMessage);
                console.log(`[WebRTC] 📤 Offer sent to peer ${fromPeerId}`);
                
                // Update phase to indicate we're waiting for answer
                peerState.phase = 'connecting';
            } else {
                throw new Error('No signaling service available to send offer');
            }
            
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to create and send offer after initiate-ack from peer ${fromPeerId}:`, error);
            this.handleError(fromPeerId, error);
            throw error;
        }
    }

    private handleConnectionTimeout(peerId: string): void {
        console.log(`[WebRTC] Connection timeout for peer ${peerId}`);
        this.cleanup(peerId);
    }

    private handleError(peerId: string, error: any): void {
        console.error(`[WebRTC] Error for peer ${peerId}:`, error);
        this.cleanup(peerId);
    }

    private async reset(): Promise<void> {
        console.log('[WebRTC] Resetting WebRTC provider');
        this.cleanup();
        // Note: localStream is now managed by streamManager, no need to nullify here
        this.streamManager.clearAllStreams();
        this.lastResetTime = Date.now();
    }

    private async sendMediaState(peerId: string, state: any): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || !peerState.dataChannel || peerState.dataChannel.readyState !== 'open') {
            console.warn(`[WebRTC] Cannot send media state to peer ${peerId}: data channel not ready`);
            return;
        }
        
        try {
            const message = {
                type: 'mediaState',
                audio: state.audio,
                video: state.video,
                timestamp: Date.now()
            };
            
            peerState.dataChannel.send(JSON.stringify(message));
            
            // Bold logging for media state changes sent to peer
            if (state.audio !== undefined) {
                console.log(`%c[WebRTC] 🔊 AUDIO STATE SENT to peer (initiator side):`, 'font-weight: bold; color: blue;', peerId, state.audio ? 'ENABLED' : 'DISABLED');
            }
            if (state.video !== undefined) {
                console.log(`%c[WebRTC] 📹 VIDEO STATE SENT to peer (initiator side):`, 'font-weight: bold; color: purple;', peerId, state.video ? 'ENABLED' : 'DISABLED');
            }
            console.log(`[WebRTC] 📤 Media state sent to peer ${peerId}:`, message);
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to send media state to peer ${peerId}:`, error);
        }
    }

    private async forceRenegotiation(peerId: string): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || peerState.phase !== 'connected') {
            console.warn(`[WebRTC] Cannot renegotiate with peer ${peerId} - not connected`);
            return;
        }
    
        try {
            console.log(`[WebRTC] 🔄 Starting renegotiation with peer ${peerId}`);
            
            // Debug: Check what tracks are in the connection before creating offer
            const senders = peerState.connection.getSenders();
            const receivers = peerState.connection.getReceivers();
            console.log(`[WebRTC] 🔍 Connection state before createOffer:`, {
                senders: senders.length,
                receivers: receivers.length,
                senderTracks: senders.map(s => ({
                    id: s.track?.id,
                    kind: s.track?.kind,
                    enabled: s.track?.enabled,
                    readyState: s.track?.readyState
                })),
                receiverTracks: receivers.map(r => ({
                    id: r.track?.id,
                    kind: r.track?.kind,
                    enabled: r.track?.enabled,
                    readyState: r.track?.readyState
                }))
            });
            
            // Create and send offer
            const offer = await peerState.connection.createOffer();
            
            // Validate SDP before processing
            if (!offer.sdp || typeof offer.sdp !== 'string') {
                throw new Error(`Invalid renegotiation offer SDP: ${typeof offer.sdp} - ${offer.sdp}`);
            }
            
            console.log(`[WebRTC] 📋 Renegotiation offer created for peer ${peerId}:`, {
                sdpLength: offer.sdp.length,
                sdpStart: offer.sdp.substring(0, 100),
                sdpEnd: offer.sdp.substring(offer.sdp.length - 100)
            });
            
            await peerState.connection.setLocalDescription(offer);
            
            // Send offer via signaling service
            if (this.signalingService) {
                const offerMessage = {
                    type: 'offer',
                    from: this.userId,
                    to: peerId,
                    sdp: offer.sdp
                };
                
                // Log the renegotiation offer message being sent
                console.log(`[WebRTC] 📤 Sending renegotiation offer message:`, {
                    type: offerMessage.type,
                    from: offerMessage.from,
                    to: offerMessage.to,
                    sdpLength: offerMessage.sdp?.length || 'undefined',
                    sdpType: typeof offerMessage.sdp,
                    sdpStart: offerMessage.sdp?.substring(0, 50) || 'undefined',
                    callerPhase: 'connected',
                    callerRole: 'renegotiation'
                });
                
                this.signalingService.send(offerMessage);
            }
            
            console.log(`[WebRTC] ✅ Renegotiation offer sent to peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] ❌ Renegotiation failed for peer ${peerId}:`, error);
            throw error;
        }
    }
    private handleScreenShareTrack(event: any, peerId: string): void {
        console.log(`[WebRTC] 🖥️ Handling screen share track from peer ${peerId}`);
        
        // Create new MediaStream for screen share
        const screenStream = new MediaStream([event.track]);
        
        // Store in stream manager
        this.streamManager.setRemoteScreen(peerId, screenStream);
        
        // Dispatch event for UI updates
        this.dispatchEvent({
            type: 'stream',
            peerId,
            data: {
                stream: screenStream,
                type: 'remote',
                streamType: 'screen'
            }
        });
        
        console.log(`[WebRTC] ✅ Screen share stream stored for peer ${peerId}:`, {
            streamId: screenStream.id,
            trackId: event.track.id,
            trackKind: event.track.kind,
            trackLabel: event.track.label,
            contentHint: event.track.contentHint,
            streamManagerHasRemoteScreen: this.streamManager.hasRemoteScreen(peerId),
            streamManagerRemoteScreenId: this.streamManager.getRemoteScreen(peerId)?.id
        });
    }
    private async handleOffer(peerId: string, sdp: string): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] ❌ No peer state found for peer ${peerId} when handling offer`);
            return;
        }
        
        try {
            console.log(`[WebRTC] 📥 Handling offer from peer ${peerId}`);
            
            // Check the current signaling state before attempting to set remote description
            const currentSignalingState = peerState.connection.signalingState;
            console.log(`[WebRTC] 🔍 Current signaling state for peer ${peerId}: ${currentSignalingState}`);
            
            // Only set remote description if we're in a valid state for it
            if (currentSignalingState === 'stable') {
                console.log(`[WebRTC] ⚠️ Cannot set remote offer in 'stable' state for peer ${peerId}`);
                console.log(`[WebRTC] 🔍 This usually means the connection is already established or there's a state mismatch`);
                console.log(`[WebRTC] 🔍 Current connection state:`, {
                    signalingState: currentSignalingState,
                    connectionState: peerState.connection.connectionState,
                    iceConnectionState: peerState.connection.iceConnectionState,
                    hasLocalDescription: !!peerState.connection.localDescription,
                    hasRemoteDescription: !!peerState.connection.remoteDescription
                });
                
                // If we're already connected, this might be a renegotiation
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] 🔄 Peer ${peerId} is already connected - this appears to be a renegotiation`);
                    console.log(`[WebRTC] 🔄 Proceeding with renegotiation...`);
                } else {
                    // If we're in stable state but not connected, this might be a renegotiation
                    console.log(`[WebRTC] 🔄 Peer ${peerId} appears to be in stable state but not connected - this might be a renegotiation`);
                    console.log(`[WebRTC] 🔄 Attempting to handle as potential renegotiation...`);
                }
            }
            
            // Validate SDP before processing
            if (!sdp || typeof sdp !== 'string') {
                throw new Error(`Invalid SDP: ${typeof sdp} - ${sdp}`);
            }
            
            // Check if SDP starts with the required 'v=' line
            if (!sdp.trim().startsWith('v=')) {
                console.error(`[WebRTC] ❌ Malformed SDP received from peer ${peerId}:`, {
                    sdpLength: sdp.length,
                    sdpStart: sdp.substring(0, 100),
                    sdpEnd: sdp.substring(sdp.length - 100)
                });
                throw new Error('Malformed SDP: Missing version line (v=)');
            }
            
            console.log(`[WebRTC] 📋 SDP validation passed for peer ${peerId}:`, {
                sdpLength: sdp.length,
                sdpStart: sdp.substring(0, 50),
                hasVersion: sdp.includes('v='),
                hasOrigin: sdp.includes('o='),
                hasSession: sdp.includes('s='),
                hasTime: sdp.includes('t=')
            });
            
            const offer = new RTCSessionDescription({ type: 'offer', sdp });
            await peerState.connection.setRemoteDescription(offer);
            
            // Check if this offer contains video tracks
            const offerHasVideo = sdp.includes('m=video');
            const hasRemoteVideo = this.streamManager.hasRemoteVideo(peerId);
            
            console.log(`[WebRTC] 🔍 Offer analysis for peer ${peerId}:`, {
                offerHasVideo,
                hasRemoteVideo,
                currentVideoStreamId: this.streamManager.getRemoteVideo(peerId)?.id || 'none',
                sdpVideoSection: sdp.includes('m=video') ? 'Present' : 'Missing',
                sdpAudioSection: sdp.includes('m=audio') ? 'Present' : 'Missing'
            });
            
            // If offer has no video but we currently have remote video, clear it IMMEDIATELY
            // BUT ONLY if we've explicitly received a media state message saying video is off
            // This prevents clearing video during audio-only renegotiations
            if (!offerHasVideo && hasRemoteVideo) {
                console.log(`[WebRTC] 🔍 Offer contains no video tracks but we have remote video for peer ${peerId}`);
                console.log(`[WebRTC] 🔍 Checking if this is a legitimate video-off state or just audio renegotiation`);
                
                // Check if we've explicitly been told that video is off via media state message
                // If not, don't clear the video stream as it might just be an audio-only renegotiation
                const peerState = this.connections.get(peerId);
                const hasExplicitVideoOffMessage = peerState && peerState.mediaState && peerState.mediaState.video === false;
                
                if (hasExplicitVideoOffMessage) {
                    console.log(`[WebRTC] 🗑️ Confirmed video-off state via media state message - clearing remote video for peer ${peerId}`);
                    
                    // Clear the remote video stream immediately
                    this.streamManager.setRemoteVideo(peerId, null);
                    
                    // Update state and notify UI immediately
                    this.updateRemoteVideoState(false, true, peerId);
                    
                    // Dispatch stream removal event immediately for instant UI update
                    this.dispatchEvent({
                        type: 'stream',
                        peerId: peerId,
                        data: {
                            stream: null,
                            type: 'remote',
                            streamType: 'video'
                        }
                    });
                    
                    console.log(`[WebRTC] ✅ Remote video cleared immediately for peer ${peerId}`);
                } else {
                    console.log(`[WebRTC] ⚠️ Offer has no video but no explicit video-off message - preserving video stream for peer ${peerId}`);
                    console.log(`[WebRTC] 🔍 This is likely an audio-only renegotiation, video stream will be preserved`);
                    console.log(`[WebRTC] 🔍 Current video stream preserved:`, {
                        streamId: this.streamManager.getRemoteVideo(peerId)?.id || 'none',
                        hasRemoteVideo: this.streamManager.hasRemoteVideo(peerId),
                        peerId
                    });
                }
            }
            
            // Process any queued ICE candidates now that remote description is set
            await this.processQueuedIceCandidates(peerId);
            
            // Send offer-ack to confirm we received and processed the offer
            if (this.signalingService) {
                const offerAckMessage = {
                    type: 'offer-ack',
                    from: this.userId,
                    to: peerId,
                    timestamp: Date.now()
                };
                this.signalingService.send(offerAckMessage);
                console.log(`[WebRTC] ✅ Offer-ack sent to peer ${peerId}`);
            }
            
            // Now create and send the answer
            const answer = await peerState.connection.createAnswer();
            await peerState.connection.setLocalDescription(answer);
            
            if (this.signalingService) {
                this.signalingService.send({
                    type: 'answer',
                    from: this.userId,
                    to: peerId,
                    sdp: answer.sdp
                });
            }
            
            console.log(`[WebRTC] ✅ Answer sent to peer ${peerId}`);
            
            // Update connection phase to connected since we've sent the answer and connection is established
            peerState.phase = 'connected';
            console.log(`[WebRTC] 🎉 Connection phase updated to 'connected' for peer ${peerId}`);
            
            // Clear any existing connection timeout since connection is now established
            this.clearConnectionTimeout(peerId);
            console.log(`[WebRTC] ⏰ Connection timeout cleared for peer ${peerId} (connection established)`);
            
            // Dispatch connection event to notify UI
            this.dispatchConnectionEvent(peerId, 'connected');
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to handle offer from peer ${peerId}:`, error);
            
            // Enhanced error logging for debugging
            console.error(`[WebRTC] 🔍 Offer handling error details:`, {
                peerId,
                peerPhase: peerState?.phase,
                signalingState: peerState?.connection?.signalingState,
                connectionState: peerState?.connection?.connectionState,
                iceConnectionState: peerState?.connection?.iceConnectionState,
                hasLocalDescription: !!peerState?.connection?.localDescription,
                hasRemoteDescription: !!peerState?.connection?.remoteDescription,
                sdpType: typeof sdp,
                sdpLength: sdp?.length || 0,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown'
            });
            
            // Clean up failed connection
            this.handleError(peerId, error);
        }
    }
    
    private async handleAnswer(peerId: string, sdp: string): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) return;
        
        try {
            console.log(`[WebRTC] 📥 Handling answer from peer ${peerId}`);
            
            // Check the current signaling state before attempting to set remote description
            const currentSignalingState = peerState.connection.signalingState;
            console.log(`[WebRTC] 🔍 Current signaling state for peer ${peerId}: ${currentSignalingState}`);
            
            // Only set remote description if we're in a valid state for it
            if (currentSignalingState === 'stable') {
                console.log(`[WebRTC] ⚠️ Cannot set remote answer in 'stable' state for peer ${peerId}`);
                console.log(`[WebRTC] 🔍 This usually means the connection is already established or there's a state mismatch`);
                console.log(`[WebRTC] 🔍 Current connection state:`, {
                    signalingState: currentSignalingState,
                    connectionState: peerState.connection.connectionState,
                    iceConnectionState: peerState.connection.iceConnectionState,
                    hasLocalDescription: !!peerState.connection.localDescription,
                    hasRemoteDescription: !!peerState.connection.remoteDescription
                });
                
                // If we're already connected, just log and return
                if (peerState.phase === 'connected') {
                    console.log(`[WebRTC] ✅ Peer ${peerId} is already connected, ignoring duplicate answer`);
                    return;
                }
                
                // If we're in stable state but not connected, this might be a renegotiation
                console.log(`[WebRTC] 🔄 Peer ${peerId} appears to be in stable state but not connected - this might be a renegotiation`);
                console.log(`[WebRTC] 🔄 Attempting to handle as potential renegotiation...`);
            }
            
            const answer = new RTCSessionDescription({ type: 'answer', sdp });
            await peerState.connection.setRemoteDescription(answer);
            
            // Process any queued ICE candidates now that remote description is set
            await this.processQueuedIceCandidates(peerId);
            
            // Send answer-ack to confirm we received and processed the answer
            if (this.signalingService) {
                const answerAckMessage = {
                    type: 'answer-ack',
                    from: this.userId,
                    to: peerId,
                    timestamp: Date.now()
                };
                this.signalingService.send(answerAckMessage);
                console.log(`[WebRTC] ✅ Answer-ack sent to peer ${peerId}`);
            }
            
            console.log(`[WebRTC] ✅ Answer processed for peer ${peerId}`);
            
            // Update connection phase to connected
            peerState.phase = 'connected';
            console.log(`[WebRTC] 🎉 Connection established with peer ${peerId}`);
            
            // Clear connection timeout since connection is now established
            this.clearConnectionTimeout(peerId);
            console.log(`[WebRTC] ⏰ Connection timeout cleared for peer ${peerId}`);
            
            // Dispatch connection event
            this.dispatchConnectionEvent(peerId, 'connected');
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to handle answer from peer ${peerId}:`, error);
            
            // Enhanced error logging for debugging
            console.error(`[WebRTC] 🔍 Answer handling error details:`, {
                peerId,
                peerPhase: peerState?.phase,
                signalingState: peerState?.connection?.signalingState,
                connectionState: peerState?.connection?.connectionState,
                iceConnectionState: peerState?.connection?.iceConnectionState,
                hasLocalDescription: !!peerState?.connection?.localDescription,
                hasRemoteDescription: !!peerState?.connection?.remoteDescription,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown'
            });
        }
    }
    
    /**
     * Process any queued ICE candidates for a peer after remote description is set
     */
    private async processQueuedIceCandidates(peerId: string): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState || !peerState.iceCandidateQueue || peerState.iceCandidateQueue.length === 0) {
            return;
        }
        
        console.log(`[WebRTC] 🔄 Processing ${peerState.iceCandidateQueue.length} queued ICE candidates for peer ${peerId}`);
        
        // Process all queued candidates
        for (const candidate of peerState.iceCandidateQueue) {
            try {
                await peerState.connection.addIceCandidate(candidate);
                console.log(`[WebRTC] 🧊 Queued ICE candidate added for peer ${peerId}:`, {
                    type: candidate.type,
                    address: candidate.address,
                    port: candidate.port
                });
            } catch (error) {
                console.error(`[WebRTC] ❌ Failed to add queued ICE candidate for peer ${peerId}:`, error);
            }
        }
        
        // Clear the queue after processing
        peerState.iceCandidateQueue = [];
        console.log(`[WebRTC] ✅ ICE candidate queue cleared for peer ${peerId}`);
    }
    
    private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
        const peerState = this.connections.get(peerId);
        if (!peerState) {
            console.error(`[WebRTC] ❌ No peer state found for peer ${peerId} when handling ICE candidate`);
            return;
        }
        
        try {
            // Check if remote description is set before adding ICE candidate
            if (!peerState.connection.remoteDescription) {
                console.log(`[WebRTC] ⏳ Queuing ICE candidate for peer ${peerId} - no remote description set yet`);
                
                // Initialize ICE candidate queue if it doesn't exist
                if (!peerState.iceCandidateQueue) {
                    peerState.iceCandidateQueue = [];
                }
                
                // Add candidate to queue
                peerState.iceCandidateQueue.push(candidate);
                console.log(`[WebRTC] 📥 ICE candidate queued for peer ${peerId} (queue size: ${peerState.iceCandidateQueue.length})`);
                
                // Send ice-candidate-ack to confirm we received the candidate
                if (this.signalingService) {
                    const iceCandidateAckMessage = {
                        type: 'ice-candidate-ack',
                        from: this.userId,
                        to: peerId,
                        timestamp: Date.now()
                    };
                    this.signalingService.send(iceCandidateAckMessage);
                    console.log(`[WebRTC] ✅ ICE candidate-ack sent to peer ${peerId} (candidate queued)`);
                }
                return;
            }
            
            // Remote description is set, add the candidate immediately
            await peerState.connection.addIceCandidate(candidate);
            console.log(`[WebRTC] 🧊 ICE candidate added for peer ${peerId}`);
            
            // Send ice-candidate-ack to confirm we received and processed the ICE candidate
            if (this.signalingService) {
                const iceCandidateAckMessage = {
                    type: 'ice-candidate-ack',
                    from: this.userId,
                    to: peerId,
                    timestamp: Date.now()
                };
                this.signalingService.send(iceCandidateAckMessage);
                console.log(`[WebRTC] ✅ ICE candidate-ack sent to peer ${peerId}`);
            }
        } catch (error) {
            console.error(`[WebRTC] ❌ Failed to add ICE candidate for peer ${peerId}:`, error);
            
            // Log additional debugging info
            console.error(`[WebRTC] 🔍 ICE candidate handling debug info:`, {
                peerId,
                peerStateExists: !!peerState,
                peerPhase: peerState?.phase,
                connectionState: peerState?.connection?.connectionState,
                hasRemoteDescription: !!peerState?.connection?.remoteDescription,
                candidateType: candidate?.type,
                candidateAddress: candidate?.address
            });
        }
    }

    private clearConnectionTimeout(peerId: string): void {
        const peerState = this.connections.get(peerId);
        if (peerState?.connectionTimeout) {
            console.log(`[WebRTC] ⏰ Clearing connection timeout for peer ${peerId}`);
            clearTimeout(peerState.connectionTimeout);
            peerState.connectionTimeout = null;
        } else {
            console.log(`[WebRTC] ⏰ No connection timeout to clear for peer ${peerId}`);
        }
    }

    private dispatchConnectionEvent(peerId: string, eventType: string): void {
        this.dispatchEvent({
            type: 'connection',
            peerId,
            data: { 
                state: eventType as ConnectionPhase,
                connected: eventType === 'connected'
            }
        });
    }

    private requestUpdatedPeerList(): void {
        console.log('[WebRTC] Requesting updated peer list');
        // Implementation can be expanded later
    }

    /**
     * Handle offer acknowledgment from responder
     */
    private async handleOfferAck(fromPeerId: string, message: any): Promise<void> {
        console.log(`[WebRTC] ✅ Received offer-ack from peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.warn(`[WebRTC] ⚠️ No connection state found for peer ${fromPeerId} when handling offer-ack`);
            return;
        }
        
        if (peerState.phase !== 'connecting') {
            console.warn(`[WebRTC] ⚠️ Unexpected phase ${peerState.phase} for peer ${fromPeerId} when handling offer-ack`);
            return;
        }
        
        console.log(`[WebRTC] ✅ Offer acknowledged by peer ${fromPeerId} - waiting for answer`);
        // The offer has been acknowledged, now we wait for the answer
        // No additional action needed at this point
    }

    /**
     * Handle answer acknowledgment from initiator
     */
    private async handleAnswerAck(fromPeerId: string, message: any): Promise<void> {
        console.log(`[WebRTC] ✅ Received answer-ack from peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.warn(`[WebRTC] ⚠️ No connection state found for peer ${fromPeerId} when handling answer-ack`);
            return;
        }
        
        if (peerState.phase !== 'connecting') {
            console.warn(`[WebRTC] ⚠️ Unexpected phase ${peerState.phase} for peer ${fromPeerId} when handling answer-ack`);
            return;
        }
        
        console.log(`[WebRTC] ✅ Answer acknowledged by peer ${fromPeerId} - connection negotiation complete`);
        // The answer has been acknowledged, connection negotiation is complete
        // The connection should now be established
    }

    /**
     * Handle ICE candidate acknowledgment
     */
    private async handleIceCandidateAck(fromPeerId: string, message: any): Promise<void> {
        console.log(`[WebRTC] ✅ Received ice-candidate-ack from peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.warn(`[WebRTC] ⚠️ No connection state found for peer ${fromPeerId} when handling ice-candidate-ack`);
            return;
        }
        
        console.log(`[WebRTC] ✅ ICE candidate acknowledged by peer ${fromPeerId}`);
        // The ICE candidate has been acknowledged
        // This helps ensure both peers are in sync with ICE candidate exchange
    }

    /**
     * Handle ICE completion notification from peer
     */
    private async handleIceComplete(fromPeerId: string, data: any): Promise<void> {
        console.log(`[WebRTC] 🧊 ICE gathering completed by peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring ice-complete from ${fromPeerId} - no peer state`);
            return;
        }
        
        // Acknowledge ICE completion
        if (this.signalingService) {
            this.signalingService.send({
                type: 'ice-complete-ack',
                from: this.userId,
                to: fromPeerId,
                data: { timestamp: Date.now() }
            });
        }
    }

    /**
     * Handle ICE completion acknowledgment from peer
     */
    private async handleIceCompleteAck(fromPeerId: string, data: any): Promise<void> {
        console.log(`[WebRTC] ✅ ICE completion acknowledged by peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (!peerState) {
            console.log(`[WebRTC] Ignoring ice-complete-ack from ${fromPeerId} - no peer state`);
            return;
        }
        
        console.log(`[WebRTC] ✅ ICE completion acknowledged by peer ${fromPeerId}`);
        peerState.waitingForAck = false;
        peerState.pendingAction = null;
    }

    /**
     * Handle disconnect message from peer
     */
    private async handleDisconnectMessage(fromPeerId: string, data: any): Promise<void> {
        console.log(`[WebRTC] 🔴 Handling disconnect message from peer ${fromPeerId}`);
        
        const peerState = this.connections.get(fromPeerId);
        if (peerState && peerState.connection) {
            const currentState = peerState.connection.connectionState;
            console.log(`[WebRTC] 🔍 Current connection state for peer ${fromPeerId}: ${currentState}`);
            
            // Check if connection is already disconnected/closed
            if (currentState === 'disconnected' || currentState === 'closed' || currentState === 'failed') {
                console.log(`[WebRTC] ⚠️ Connection for peer ${fromPeerId} is already ${currentState}, cleaning up resources only`);
            } else {
                console.log(`[WebRTC] 🔄 Connection for peer ${fromPeerId} is still active (${currentState}), proceeding with disconnect`);
            }
        } else {
            console.log(`[WebRTC] ⚠️ No active connection found for peer ${fromPeerId}, cleaning up resources only`);
        }
        
        // Clean up local resources only (responder side should not close connection)
        // The initiator will close the connection automatically
        this.cleanupLocalResources(fromPeerId);
        
        // Notify UI of disconnection
        this.dispatchEvent({
            type: 'connection',
            peerId: fromPeerId,
            data: { state: 'disconnected', connected: false }
        });
        
        console.log(`[WebRTC] ✅ Disconnect handling completed for peer ${fromPeerId}`);
    }
}
    
    
                




