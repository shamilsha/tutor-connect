import { ICommunicationProvider } from './ICommunicationProvider';

export class WebRTCProvider extends ICommunicationProvider {
    constructor(userId) {
        super();
        this.userId = userId.toString();
        console.log(`[WebRTC] Initializing for user: ${this.userId}`);
        this.peerConnections = new Map(); // Store RTCPeerConnection for each peer
        this.dataChannels = new Map();     // Store RTCDataChannel for each peer
        this.signalingService = null;
        
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
        setInterval(() => {
            this.peerConnections.forEach((connection, peerId) => {
                if (connection.connectionState === 'failed' || 
                    connection.connectionState === 'closed' || 
                    connection.iceConnectionState === 'disconnected') {
                    console.log(`[WebRTC] Peer ${peerId} connection lost:`, {
                        connectionState: connection.connectionState,
                        iceState: connection.iceConnectionState
                    });
                    this.disconnect(peerId);
                }
            });
        }, 1000); // Check every second
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
            // Ensure peerId is a string
            const targetPeerId = peerId.toString();
            
            // Make sure any existing connection is fully cleaned up
            if (this.peerConnections.has(targetPeerId)) {
                console.log(`[WebRTC] Cleaning up existing connection to peer: ${targetPeerId}`);
                this.disconnect(targetPeerId);
            }

            console.log(`[WebRTC] Initiating connection to peer: ${targetPeerId}`);
            const peerConnection = new RTCPeerConnection(this.configuration);
            this.peerConnections.set(targetPeerId, peerConnection);

            // Log all state changes
            peerConnection.onconnectionstatechange = () => {
                console.log(`[WebRTC] Connection state changed:`, {
                    peer: targetPeerId,
                    state: peerConnection.connectionState,
                    iceState: peerConnection.iceConnectionState,
                    signalingState: peerConnection.signalingState
                });
            };

            peerConnection.oniceconnectionstatechange = () => {
                console.log(`[WebRTC] ICE connection state:`, {
                    peer: targetPeerId,
                    state: peerConnection.iceConnectionState
                });
            };

            peerConnection.onsignalingstatechange = () => {
                console.log(`[WebRTC] Signaling state:`, {
                    peer: targetPeerId,
                    state: peerConnection.signalingState
                });
            };

            // Create data channel
            console.log('[WebRTC] Creating data channel');
            const dataChannel = peerConnection.createDataChannel('chat');
            this.setupDataChannel(dataChannel, targetPeerId);
            this.dataChannels.set(targetPeerId, dataChannel);

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('[WebRTC] Sending ICE candidate to:', targetPeerId);
                    this.signalingService.send({
                        type: 'ice-candidate',
                        from: this.userId,
                        target: targetPeerId,
                        data: event.candidate
                    });
                }
            };

            // Create and send offer
            console.log('[WebRTC] Creating offer');
            const offer = await peerConnection.createOffer();
            console.log('[WebRTC] Setting local description (offer)');
            await peerConnection.setLocalDescription(offer);

            // Use signalingService.send instead of signalingSocket.send
            this.signalingService.send({
                type: 'offer',
                from: this.userId,
                target: peerId,
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
            
            const peerConnection = new RTCPeerConnection(this.configuration);
            this.peerConnections.set(fromPeerId, peerConnection);

            // Set up ICE candidate handling
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('[WebRTC] Sending ICE candidate to:', fromPeerId);
                    this.signalingService.send({
                        type: 'ice-candidate',
                        from: this.userId,
                        target: fromPeerId,
                        data: event.candidate
                    });
                }
            };

            // Handle data channel
            peerConnection.ondatachannel = (event) => {
                console.log('[WebRTC] Received data channel');
                this.setupDataChannel(event.channel, fromPeerId);
                this.dataChannels.set(fromPeerId, event.channel);
            };

            // Set the remote description (offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.signalingService.send({
                type: 'answer',
                from: this.userId,
                target: fromPeerId,
                data: answer
            });

        } catch (error) {
            console.error('[WebRTC] Error handling offer:', error);
            this.onError?.({
                message: 'Failed to handle offer',
                type: 'OFFER_ERROR',
                error
            });
        }
    }

    async handleAnswer(peerId, answer) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (peerConnection) {
                console.log('[WebRTC] Setting remote description (answer)');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('[WebRTC] Error handling answer:', error);
            this.onError?.({
                message: 'Failed to handle answer',
                type: 'ANSWER_ERROR',
                error
            });
        }
    }

    async handleIceCandidate(peerId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[WebRTC] Added ICE candidate from:', peerId);
            }
        } catch (error) {
            console.error('[WebRTC] Error handling ICE candidate:', error);
            this.onError?.({
                message: 'Failed to handle ICE candidate',
                type: 'ICE_ERROR',
                error
            });
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
            this.onConnectionStateChange?.(peerId, 'disconnected');
            this.disconnect(peerId);
        };

        dataChannel.onerror = (error) => {
            console.error(`[WebRTC] Data channel error with peer ${peerId}:`, error);
            this.onConnectionStateChange?.(peerId, 'error');
            this.disconnect(peerId);
        };

        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            peerConnection.oniceconnectionstatechange = () => {
                const state = peerConnection.iceConnectionState;
                console.log(`[WebRTC] ICE connection state changed for peer ${peerId}:`, state);
                
                if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.onConnectionStateChange?.(peerId, 'disconnected');
                    this.disconnect(peerId);
                }
            };
        }

        // Add periodic connection check with more specific conditions
        const connectionCheck = setInterval(() => {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) return; // Skip if no connection exists

            const isDisconnected = 
                peerConnection.connectionState === 'failed' ||
                peerConnection.connectionState === 'closed' ||
                (peerConnection.connectionState === 'disconnected' && 
                 dataChannel.readyState === 'closed');

            if (isDisconnected) {
                console.log(`[WebRTC] Peer ${peerId} connection lost`, {
                    connectionState: peerConnection.connectionState,
                    iceConnectionState: peerConnection.iceConnectionState,
                    dataChannelState: dataChannel.readyState
                });
                clearInterval(connectionCheck);
                this.disconnect(peerId);
            } else {
                // Log connection health
                console.debug(`[WebRTC] Connection health check for peer ${peerId}:`, {
                    connectionState: peerConnection.connectionState,
                    iceConnectionState: peerConnection.iceConnectionState,
                    dataChannelState: dataChannel.readyState
                });
            }
        }, 5000); // Increased interval to 5 seconds

        // Store the interval ID for cleanup
        this.connectionChecks = this.connectionChecks || new Map();
        this.connectionChecks.set(peerId, connectionCheck);

        dataChannel.onmessage = (event) => {
            console.log(`[WebRTC] Received message from peer ${peerId}:`, event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'disconnect') {
                    console.log(`[WebRTC] Peer ${peerId} disconnected intentionally`);
                    clearInterval(connectionCheck);
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

            // Clear connection check interval
            if (this.connectionChecks?.has(peerId)) {
                clearInterval(this.connectionChecks.get(peerId));
                this.connectionChecks.delete(peerId);
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

        // Clear all intervals
        this.connectionChecks?.forEach((interval) => {
            clearInterval(interval);
        });
        this.connectionChecks?.clear();

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
} 