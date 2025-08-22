import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebRTCProvider } from '../services/WebRTCProvider';
import VideoChat from './VideoChat';
import ConnectionStatusLight from './ConnectionStatusLight';
import '../styles/DashboardPage.css';
import { useCommunication } from '../context/CommunicationContext';
import { WebSocketProvider } from '../services/WebSocketProvider';

const DashboardPage = () => {
    const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
    const [isPeerConnected, setIsPeerConnected] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const navigate = useNavigate();
    const { signalingService } = useCommunication();

    // WebRTC state
    const [provider, setProvider] = useState(null);
    
    // Connection state
    const [selectedPeer, setSelectedPeer] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [peerList, setPeerList] = useState([]);
    
    // UI state - minimal state, get everything else from WebRTCProvider
    const [showChat, setShowChat] = useState(false);
    const [error, setError] = useState(null);
    
    // Chat state
    const [receivedMessages, setReceivedMessages] = useState([]);

    // Store user data and message handler IDs in ref
    const userRef = useRef(null);
    const messageHandlerRef = useRef(null);
    
    // Initialize user and WebSocket connection
    useEffect(() => {
        console.log('[DashboardPage] 🔄 Component mounted');

        // Get user email from localStorage
        const user = JSON.parse(localStorage.getItem('user'));
        if (user?.email) {
            setUserEmail(user.email);
            userRef.current = user;

            // Initialize WebSocket provider only (WebRTC will be created when needed)
            const wsProvider = WebSocketProvider.getInstance(user.id);

            // Monitor WebSocket connection status
            wsProvider.onConnect(() => {
                setIsWebSocketConnected(true);
                setError(null);
            });

            wsProvider.onDisconnect(() => {
                setIsWebSocketConnected(false);
                setError('Lost connection to server. Please check your internet connection.');
            });

            // Connect WebSocket if not already connected
            if (!wsProvider.isConnected) {
                wsProvider.connect().catch(error => {
                    console.error('[DashboardPage] Failed to connect to WebSocket:', error);
                    setError('Failed to connect to server. Please try again later.');
                });
            }
        } else {
            navigate('/login');
            return;
        }

        return () => {
            // Cleanup
            if (provider) {
                provider.cleanup();
            }
        };
    }, []);

    // Cleanup provider on unmount only
    useEffect(() => {
        return () => {
            if (provider) {
                console.log('[DashboardPage] 🧹 Cleaning up WebRTC provider');
                provider.closeAllConnections();
            }
        };
    }, []); // Empty dependency array for unmount only



    // Set up peer list handler - separate effect to avoid re-runs
    useEffect(() => {
        const user = userRef.current;
        if (!user) {
            console.log('[DashboardPage] No user data available for peer list handler');
            return;
        }

        console.log('[DashboardPage] Setting up peer list handler for user:', user.id);

        const handlePeerListUpdate = (peers) => {
            console.log('[DashboardPage] Received peer list update:', peers);
            
            // Filter out current user and format peer list using user ID
            const filteredPeers = peers
                .filter(peerId => peerId !== user.id)
                .map(peerId => ({
                    id: peerId,
                    name: `Peer ${peerId}`
                }));

            console.log('[DashboardPage] Filtered peer list:', filteredPeers);
            
            // Update peer list state
            setPeerList(prevPeers => {
                // Compare with current peer list
                const currentPeerIds = new Set(prevPeers.map(p => p.id));
                const newPeerIds = new Set(filteredPeers.map(p => p.id));
                
                // Check if the sets are different
                const hasChanged = currentPeerIds.size !== newPeerIds.size || 
                                 [...currentPeerIds].some(id => !newPeerIds.has(id)) ||
                                 [...newPeerIds].some(id => !currentPeerIds.has(id));

                if (hasChanged) {
                    console.log('[DashboardPage] Updating peer list state:', filteredPeers);
                    return filteredPeers;
                }
                return prevPeers;
            });
        };

        // Set up handlers in signaling service
        if (signalingService) {
            console.log('[DashboardPage] Registering peer list handler with signaling service');
            signalingService.onPeerListUpdate = handlePeerListUpdate;
            
            // Set up incoming connection handler
            signalingService.onIncomingConnection = async (message) => {
                console.log('[DashboardPage] 🔄 Incoming connection detected:', message.type, 'from peer', message.from);
                
                // Only create WebRTC provider for the first incoming message (initiate)
                if (message.type === 'initiate' && !provider) {
                    console.log('[DashboardPage] 🔄 Creating WebRTC provider for incoming connection');
                    
                    // Set connecting state for incoming connection
                    setIsConnecting(true);
                    setError(null);
                    
                    const rtcProvider = new WebRTCProvider({
                        userId: user.id,
                        iceServers: [
                            {
                                urls: [
                                    'stun:stun.l.google.com:19302',
                                    'stun:stun1.l.google.com:19302'
                                ]
                            }
                        ]
                    });

                    // Set up WebRTC event listeners
                    setupWebRTCEventListeners(rtcProvider);

                    // Connect to signaling service
                    rtcProvider.setSignalingService(signalingService);
                    setProvider(rtcProvider);
                } else if (message.type === 'initiate' && provider) {
                    // If we already have a provider, just set connecting state
                    console.log('[DashboardPage] WebRTC provider already exists for incoming connection');
                    setIsConnecting(true);
                    setError(null);
                }
            };
            
            // Request initial peer list
            signalingService.wsProvider?.publish('get_peers', {
                type: 'get_peers',
                userId: user.id
            });
        } else {
            console.warn('[DashboardPage] No signaling service available for peer list updates');
        }

        return () => {
            console.log('[DashboardPage] Cleaning up peer list handler');
            if (signalingService) {
                signalingService.onPeerListUpdate = null;
                signalingService.onIncomingConnection = null;
            }
        };
    }, [signalingService]); // Only depend on signalingService

    // Auto-select single peer when available
    useEffect(() => {
        if (peerList.length === 1 && !selectedPeer && !isPeerConnected && !isConnecting) {
            console.log('[DashboardPage] Auto-selecting single available peer:', peerList[0].id);
            setSelectedPeer(peerList[0].id);
        }
    }, [peerList, selectedPeer, isPeerConnected, isConnecting]);

    // Helper function to set up WebRTC event listeners
    const setupWebRTCEventListeners = (rtcProvider) => {
        // Connection event listener
        rtcProvider.addEventListener('connection', (event) => {
            const state = event.data.state;
            console.log(`[DashboardPage] Connection state changed:`, state);
            
            if (state === 'connected') {
                setIsPeerConnected(true);
                setIsConnecting(false);
                setShowChat(true);
                setError(null);
            } else if (state === 'connecting') {
                setIsConnecting(true);
                setIsPeerConnected(false);
                setShowChat(false);
            } else if (state === 'disconnected' || state === 'failed') {
                setIsPeerConnected(false);
                setIsConnecting(false);
                setShowChat(false);
                
                // Clean up message handler when disconnected
                if (messageHandlerRef.current) {
                    signalingService.removeMessageHandler(messageHandlerRef.current);
                    messageHandlerRef.current = null;
                }
            }
        });

        rtcProvider.addEventListener('error', (event) => {
            console.error('[DashboardPage] WebRTC error:', event.data);
            setError(event.data.message);
        });

        rtcProvider.addEventListener('message', (event) => {
            console.log('[DashboardPage] Received message from peer:', event.data);
            try {
                const messageData = event.data;
                setReceivedMessages(prev => [...prev, {
                    sender: messageData.sender || 'Peer',
                    content: messageData.content,
                    timestamp: messageData.timestamp || new Date().toISOString()
                }]);
            } catch (error) {
                console.error('[DashboardPage] Error processing received message:', error);
            }
        });
    };

    const handleConnect = async () => {
        if (!selectedPeer) {
            setError('Please select a peer');
            return;
        }

        try {
            setIsConnecting(true);
            setError(null);

            // Use existing provider or create if not exists
            let rtcProvider = provider;
            if (!rtcProvider) {
                console.log('[DashboardPage] 🔄 Creating WebRTC provider for outgoing connection');
                const user = userRef.current;
                rtcProvider = new WebRTCProvider({
                    userId: user.id,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302'
                            ]
                        }
                    ]
                });

                // Set up WebRTC event listeners
                setupWebRTCEventListeners(rtcProvider);

                // Connect to signaling service
                rtcProvider.setSignalingService(signalingService);
                setProvider(rtcProvider);
            }

            // Connect to the selected peer
            await rtcProvider.connect(selectedPeer);
            
        } catch (error) {
            console.error('[DashboardPage] ❌ Connection error:', error);
            setError(error.message);
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            if (messageHandlerRef.current) {
                signalingService.removeMessageHandler(messageHandlerRef.current);
                messageHandlerRef.current = null;
            }
            await provider.disconnect(selectedPeer);
            setIsPeerConnected(false);
            setShowChat(false);
        } catch (error) {
            console.error('[DashboardPage] Disconnect error:', error);
            setError(error.message);
        }
    };

    const handleLogout = () => {
        console.log('[DashboardPage] 👋 User logging out');
        if (provider) {
            provider.closeAllConnections();
        }
        signalingService.disconnect();
        localStorage.removeItem('user');
        navigate('/');
    };

    const handleSendMessage = async (message) => {
        if (!provider || !selectedPeer) return;
        
        try {
            await provider.sendMessage(selectedPeer, message);
        } catch (err) {
            console.error('[DashboardPage] Failed to send message:', err);
            setError('Failed to send message');
        }
    };

    if (!userEmail) return null;

    // Calculate VideoChat key
    const videoChatKey = `videochat-${isPeerConnected}-${isConnecting}`;
    console.log('[DashboardPage] 🎯 VideoChat key:', videoChatKey);
    console.log('[DashboardPage] 📊 VideoChat props being passed:', {
        isPeerConnected,
        isConnecting,
        showChat,
        provider: !!provider,
        key: videoChatKey
    });

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Video Tutoring Dashboard</h1>
                <div className="user-actions">
                    <ConnectionStatusLight isConnected={isWebSocketConnected} />
                    <span className="user-email">{userEmail}</span>
                    <button className="logout-button" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </div>
            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}
            <div className="dashboard-content">
                {/* Video Chat */}
                <VideoChat
                    key={videoChatKey} // Force re-render when key changes
                    selectedPeer={selectedPeer}
                    onPeerSelect={setSelectedPeer}
                    isConnected={isPeerConnected}
                    isConnecting={isConnecting}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    peerList={peerList}
                    loginStatus={isWebSocketConnected ? 'connected' : 'failed'}
                    showChat={showChat}
                    onSendMessage={handleSendMessage}
                    receivedMessages={receivedMessages}
                    error={error}
                    user={userRef.current}
                    provider={provider}
                />
            </div>
        </div>
    );
};

export default DashboardPage; 