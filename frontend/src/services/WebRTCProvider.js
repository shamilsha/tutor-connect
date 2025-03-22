import { ICommunicationProvider } from './ICommunicationProvider';

export class WebRTCProvider extends ICommunicationProvider {
    constructor(userId) {
        super();
        this.userId = userId.toString();
        console.log(`[WebRTC] Initializing for user: ${this.userId}`);
        this.peerConnections = new Map(); // Store RTCPeerConnection for each peer
        this.dataChannels = new Map();     // Store RTCDataChannel for each peer
        this.signalingService = null;
        this.localStream = null;
        this.onTrack = null;  // Add this line
        
        // STUN servers for NAT traversal
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };

        // Add connection state monitoring
        this.monitorConnectionStates();
    }

    monitorConnectionStates() {
        // Remove this method or modify it to be less aggressive
        // The connection state changes are now handled by the event handlers
    }

    setSignalingService(service) {
        this.signalingService = service;
        // Set up message handler for WebRTC signaling
        this.signalingService.onMessage = this.handleSignalingMessage.bind(this);
    }

    handleSignalingMessage = async (message) => {
        try {
            switch (message.type) {
                case 'offer':
                    console.log('[WebRTC] Received offer from:', message.from);
                    await this.handleOffer(message.from, message.data);
                    break;
                    
                case 'answer':
                    console.log('[WebRTC] Received answer from:', message.from);
                    await this.handleAnswer(message.from, message.data);
                    break;
                    
                case 'ice-candidate':
                    console.log('[WebRTC] Received ICE candidate from:', message.from);
                    await this.handleIceCandidate(message.from, message.data);
                    break;
            }
        } catch (error) {
            console.error('[WebRTC] Error handling signaling message:', error);
        }
    };

    async connect(peerId) {
        if (!this.signalingService) {
            throw new Error('SignalingService not initialized');
        }

        try {
            const targetPeerId = peerId.toString();
            console.log(`[WebRTC] Initiating connection to peer: ${targetPeerId}`);

            // Create peer connection
            const peerConnection = new RTCPeerConnection(this.configuration);
            this.peerConnections.set(targetPeerId, peerConnection);

            // Set up connection handlers first
            this.setupPeerConnectionHandlers(peerConnection, targetPeerId);

            // Create data channel - ONLY the initiator creates the channel
            if (!this.dataChannels.has(targetPeerId)) {
                console.log('[WebRTC] Creating data channel as initiator');
                const dataChannel = peerConnection.createDataChannel('messageChannel', {
                    ordered: true
                });
                this.setupDataChannel(dataChannel, targetPeerId);
                this.dataChannels.set(targetPeerId, dataChannel);
            }

            // Add existing tracks if available
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }

            // Create and send offer
            console.log('[WebRTC] Creating offer');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.signalingService.send({
                type: 'offer',
                from: this.userId,
                target: targetPeerId,
                data: offer
            });

        } catch (error) {
            console.error('[WebRTC] Connection error:', error);
            this.onError?.({
                message: 'Failed to create connection',
                type: 'CONNECTION_ERROR',
                error
            });
            throw error;
        }
    }

    async handleOffer(peerId, offer) {
        try {
            const fromPeerId = peerId.toString();
            console.log(`[WebRTC] Handling offer from peer: ${fromPeerId}`);
            
            let peerConnection = this.peerConnections.get(fromPeerId);
            
            if (!peerConnection) {
                peerConnection = new RTCPeerConnection(this.configuration);
                this.peerConnections.set(fromPeerId, peerConnection);
                this.setupPeerConnectionHandlers(peerConnection, fromPeerId);
            }

            // Check if we're in the middle of negotiation
            const currentState = peerConnection.signalingState;
            console.log(`[WebRTC] Current signaling state: ${currentState}`);

            if (currentState === 'have-local-offer') {
                // We need to rollback our local description
                await peerConnection.setLocalDescription({ type: 'rollback' });
            }

            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and set local answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Send answer (not offer)
            this.signalingService.send({
                type: 'answer',  // Changed from 'offer' to 'answer'
                from: this.userId,
                target: fromPeerId,
                data: answer
            });

        } catch (error) {
            console.error('[WebRTC] Error handling offer:', error);
            throw error;
        }
    }

    async handleAnswer(peerId, answer) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                throw new Error(`No connection found for peer: ${peerId}`);
            }

            console.log(`[WebRTC] Setting remote answer for peer: ${peerId}, current state: ${peerConnection.signalingState}`);
            
            // Only set remote description if we're in the right state
            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log(`[WebRTC] Successfully set remote description, new state: ${peerConnection.signalingState}`);

                // Add any pending ICE candidates
                if (this.pendingCandidates?.has(peerId)) {
                    const candidates = this.pendingCandidates.get(peerId);
                    console.log(`[WebRTC] Adding ${candidates.length} pending ICE candidates`);
                    for (const candidate of candidates) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    this.pendingCandidates.delete(peerId);
                }
            } else {
                console.log(`[WebRTC] Ignoring answer - wrong signaling state: ${peerConnection.signalingState}`);
            }
        } catch (error) {
            console.error('[WebRTC] Error handling answer:', error);
            throw error;
        }
    }

    async handleIceCandidate(peerId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                console.log(`[WebRTC] No connection found for ICE candidate from peer: ${peerId}`);
                return;
            }

            // Only add ICE candidate if we have a remote description
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[WebRTC] Added ICE candidate from:', peerId);
            } else {
                console.log('[WebRTC] Queuing ICE candidate - no remote description yet');
                // Store the candidate to add later
                if (!this.pendingCandidates) {
                    this.pendingCandidates = new Map();
                }
                if (!this.pendingCandidates.has(peerId)) {
                    this.pendingCandidates.set(peerId, []);
                }
                this.pendingCandidates.get(peerId).push(candidate);
            }
        } catch (error) {
            console.error('[WebRTC] Error handling ICE candidate:', error);
        }
    }

    setupDataChannel(dataChannel, peerId) {
        console.log(`[WebRTC] Setting up data channel for peer: ${peerId}`);
        
        dataChannel.onopen = () => {
            console.log(`[WebRTC] Data channel opened with peer: ${peerId}`);
            this.onConnectionStateChange?.(peerId, 'connected');
        };

        dataChannel.onclose = () => {
            console.log(`[WebRTC] Data channel closed with peer: ${peerId}`);
            // Only handle intentional closes
            if (this.peerConnections.get(peerId)?.connectionState === 'closed') {
                this.onConnectionStateChange?.(peerId, 'disconnected');
            }
        };

        dataChannel.onerror = (error) => {
            console.error(`[WebRTC] Data channel error with peer ${peerId}:`, error);
            this.onConnectionStateChange?.(peerId, 'error');
        };

        dataChannel.onmessage = (event) => {
            console.log(`[WebRTC] Received message from peer ${peerId}:`, event.data);
            try {
                const data = JSON.parse(event.data);
                // Only handle disconnect if it's an actual disconnect message
                if (data.type === 'disconnect' && data.sender !== this.userId) {
                    console.log(`[WebRTC] Peer ${peerId} disconnected intentionally`);
                    this.disconnect(peerId);
                    return;
                }
                this.onMessageReceived?.({
                    from: peerId,
                    content: event.data,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };
    }

    async sendMessage(peerId, message) {
        try {
            const dataChannel = this.dataChannels.get(peerId);
            if (dataChannel?.readyState === 'open') {
                dataChannel.send(JSON.stringify(message));
            } else {
                throw new Error('Data channel not ready');
            }
        } catch (error) {
            this.onError?.({
                message: 'Failed to send message',
                type: 'SEND_ERROR',
                error
            });
        }
    }

    disconnect(peerId) {
        try {
            console.log(`[WebRTC] Disconnecting from peer: ${peerId}`);
            
            // Send disconnect message before closing
            const dataChannel = this.dataChannels.get(peerId);
            if (dataChannel?.readyState === 'open') {
                try {
                    dataChannel.send(JSON.stringify({
                        type: 'disconnect',
                        content: 'Peer disconnected intentionally',
                        sender: this.userId,
                        timestamp: new Date()
                    }));
                } catch (e) {
                    console.warn('[WebRTC] Could not send disconnect message:', e);
                }
            }

            // Close and cleanup data channel
            if (dataChannel) {
                try {
                    dataChannel.onopen = null;
                    dataChannel.onclose = null;
                    dataChannel.onerror = null;
                    dataChannel.onmessage = null;
                    dataChannel.close();
                } catch (e) {
                    console.warn('[WebRTC] Error closing data channel:', e);
                }
                this.dataChannels.delete(peerId);
            }

            // Close and cleanup peer connection
            const peerConnection = this.peerConnections.get(peerId);
            if (peerConnection) {
                try {
                    peerConnection.onicecandidate = null;
                    peerConnection.onconnectionstatechange = null;
                    peerConnection.onsignalingstatechange = null;
                    peerConnection.oniceconnectionstatechange = null;
                    peerConnection.close();
                } catch (e) {
                    console.warn('[WebRTC] Error closing peer connection:', e);
                }
                this.peerConnections.delete(peerId);
            }

            // Notify about disconnection
            this.onConnectionStateChange?.(peerId, 'disconnected');

            console.log(`[WebRTC] Successfully disconnected from peer: ${peerId}`);
        } catch (error) {
            console.error('Error during disconnect:', error);
        }
    }

    closeAllConnections() {
        console.log('[WebRTC] Closing all connections');
        
        // Close all data channels and peer connections
        this.peerConnections.forEach((_, peerId) => {
            this.disconnect(peerId);
        });

        // Reset state
        this.peerConnections.clear();
        this.dataChannels.clear();
    }

    // Get connection state for a peer
    getPeerConnectionState(peerId) {
        return this.peerConnections.get(peerId)?.connectionState || 'disconnected';
    }

    // Get all connected peer IDs
    getConnectedPeers() {
        return Array.from(this.peerConnections.keys()).filter(peerId => 
            this.getPeerConnectionState(peerId) === 'connected'
        );
    }

    async addMediaStream(stream) {
        console.log('[WebRTC] Adding media stream to peer connections');
        
        try {
            // Store stream first
            this.localStream = stream;

            await Promise.all(Array.from(this.peerConnections.entries()).map(async ([peerId, peerConnection]) => {
                try {
                    // Get existing senders
                    const senders = peerConnection.getSenders();
                    let negotiationNeeded = false;
                    
                    // Add or replace tracks
                    for (const track of stream.getTracks()) {
                        console.log(`[WebRTC] Processing ${track.kind} track for peer: ${peerId}`);
                        const sender = senders.find(s => s.track?.kind === track.kind);
                        if (sender) {
                            console.log(`[WebRTC] Replacing ${track.kind} track`);
                            await sender.replaceTrack(track);
                        } else {
                            console.log(`[WebRTC] Adding new ${track.kind} track`);
                            peerConnection.addTrack(track, stream);
                            negotiationNeeded = true;
                        }
                    }

                    // Only renegotiate if we added new tracks
                    if (negotiationNeeded) {
                        console.log(`[WebRTC] Starting renegotiation for peer: ${peerId}`);
                        
                        // Wait for signaling state to stabilize
                        if (peerConnection.signalingState !== 'stable') {
                            console.log(`[WebRTC] Waiting for signaling state to stabilize`);
                            await new Promise(resolve => {
                                const checkState = () => {
                                    if (peerConnection.signalingState === 'stable') {
                                        resolve();
                                    } else {
                                        setTimeout(checkState, 100);
                                    }
                                };
                                checkState();
                            });
                        }

                        // Create new offer
                        const offer = await peerConnection.createOffer();
                        await peerConnection.setLocalDescription(offer);
                        
                        this.signalingService.send({
                            type: 'offer',
                            from: this.userId,
                            target: peerId,
                            data: offer
                        });

                        console.log(`[WebRTC] Sent media renegotiation offer to peer: ${peerId}`);
                    } else {
                        console.log(`[WebRTC] No renegotiation needed for peer: ${peerId}`);
                    }
                } catch (error) {
                    console.error(`[WebRTC] Error updating tracks for peer ${peerId}:`, error);
                }
            }));
        } catch (error) {
            console.error('[WebRTC] Error in addMediaStream:', error);
        }
    }

    setupPeerConnectionHandlers(peerConnection, peerId) {
        // Handle incoming tracks
        peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Received remote track:', event.track.kind, 'from peer:', peerId);
            this.onTrack?.(peerId, event.streams[0]);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalingService.send({
                    type: 'ice-candidate',
                    from: this.userId,
                    target: peerId,
                    data: event.candidate
                });
            }
        };

        // Handle data channel creation by remote peer
        peerConnection.ondatachannel = (event) => {
            console.log('[WebRTC] Received data channel from remote peer');
            if (!this.dataChannels.has(peerId)) {
                this.setupDataChannel(event.channel, peerId);
                this.dataChannels.set(peerId, event.channel);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log(`[WebRTC] Connection state changed for peer ${peerId}:`, state);
            
            switch (state) {
                case 'connected':
                    this.onConnectionStateChange?.(peerId, 'connected');
                    break;
                case 'failed':
                case 'closed':
                    this.onConnectionStateChange?.(peerId, 'disconnected');
                    this.disconnect(peerId);
                    break;
            }
        };
    }
} 