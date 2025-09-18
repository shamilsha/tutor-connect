import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebRTCProvider } from '../services/WebRTCProvider';
import VideoChat from './VideoChat';
import Whiteboard from './Whiteboard';
import WhiteboardToolbar from './WhiteboardToolbar';
import ConnectionPanel from './ConnectionPanel';
import ChatPanel from './ChatPanel';
import ConnectionStatusLight from './ConnectionStatusLight';
import ScreenShareWindow from './ScreenShareWindow';
import ImageDisplayWindow from './ImageDisplayWindow';
import '../styles/DashboardPage.css';
import { useCommunication } from '../context/CommunicationContext';
import { WebSocketProvider } from '../services/WebSocketProvider';
import { getBuildDisplay } from '../utils/buildVersion';

// Utility function to properly log objects with fallbacks
const safeLog = (label, obj, fallback = 'No data') => {
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
    } catch (error) {
        console.log(label, `[Error logging object: ${error.message}]`, obj);
    }
};

const DashboardPage = () => {
    const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
    const [isPeerConnected, setIsPeerConnected] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const navigate = useNavigate();
    const { signalingService } = useCommunication();

    // Check WebRTC compatibility on component mount
    useEffect(() => {
        const checkWebRTCSupport = () => {
            const isSupported = !!(
                window.RTCPeerConnection &&
                window.RTCSessionDescription &&
                window.RTCIceCandidate &&
                navigator.mediaDevices &&
                navigator.mediaDevices.getUserMedia
            );
            
            if (!isSupported) {
                console.warn('[DashboardPage] ⚠️ WebRTC not fully supported on this device');
                setError('Your browser does not fully support video calling features. Some features may not work properly.');
            } else {
                console.log('[DashboardPage] ✅ WebRTC is supported on this device');
            }
        };
        
        checkWebRTCSupport();
    }, []);

    // WebRTC state
    const [provider, setProvider] = useState(null);
    const [isCreatingProvider, setIsCreatingProvider] = useState(false);
    
    // Connection state
    const [selectedPeer, setSelectedPeer] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [peerList, setPeerList] = useState([]);
    
    // UI state - minimal state, get everything else from WebRTCProvider
    const [showChat, setShowChat] = useState(false);
    const [error, setError] = useState(null);
    const [isGracefulDisconnect, setIsGracefulDisconnect] = useState(false);
    
    // Media state for ConnectionPanel
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isScreenShareSupported, setIsScreenShareSupported] = useState(true);
    const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
    
    // Whiteboard toolbar state
    const [currentTool, setCurrentTool] = useState(null);
    const [currentColor, setCurrentColor] = useState('#000000');
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    const [isImageActive, setIsImageActive] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState(null);
    const [dynamicContainerSize, setDynamicContainerSize] = useState({ width: 1200, height: 800 });
    
    // Whiteboard function references
    const whiteboardUndoRef = useRef(null);
    const whiteboardRedoRef = useRef(null);
    const whiteboardImageUploadRef = useRef(null);
    
    // Stable callback functions to prevent Whiteboard remounting
    const handleWhiteboardClose = useCallback(() => {
        setIsWhiteboardActive(false);
    }, []);
    
    const handleWhiteboardBackgroundCleared = useCallback(() => {
        console.log('[DashboardPage] 🎨 Background file cleared from whiteboard');
    }, []);
    
    // Debug: Track state changes to identify what's causing re-renders
    const prevStateRef = useRef({});
    useEffect(() => {
        const currentState = {
            isWebSocketConnected,
            isPeerConnected,
            userEmail,
            provider: !!provider,
            selectedPeer,
            isConnecting,
            peerListLength: peerList.length,
            showChat,
            error,
            isGracefulDisconnect,
            isAudioEnabled,
            isVideoEnabled,
            isScreenSharing,
            isScreenShareSupported,
            isWhiteboardActive,
            currentTool,
            currentColor,
            canUndo,
            canRedo,
            receivedMessagesLength: receivedMessages.length
        };
        
        const prevState = prevStateRef.current;
        const changedStates = [];
        
        Object.keys(currentState).forEach(key => {
            if (prevState[key] !== currentState[key]) {
                changedStates.push({
                    key,
                    from: prevState[key],
                    to: currentState[key]
                });
            }
        });
        
        if (changedStates.length > 0) {
            console.log('[DashboardPage] 🔍 State changes detected:', JSON.stringify(changedStates, null, 2));
        }
        
        prevStateRef.current = currentState;
    });
    
    // Removed streamRevision state that was causing constant re-renders
    

    
    // Chat state
    const [receivedMessages, setReceivedMessages] = useState([]);

    // Store user data and message handler IDs in ref
    const userRef = useRef(null);
    const messageHandlerRef = useRef(null);
    
    
    // Store WebRTC event handlers for cleanup
    const webRTCEventHandlersRef = useRef({
        connection: null,
        error: null,
        message: null,
        stream: null,
        stateChange: null,
        track: null
    });
    
    // Save connected peer with timestamp when connection is lost to detect logout vs disconnect
    const disconnectedPeerRef = useRef(null); // { peerId, timestamp }
    
    // Track which peers have had their logout handled to prevent duplicate cleanup
    const handledLogoutPeersRef = useRef(new Set()); // Set of peer IDs that have had logout handled
    
    // Function to clear selectedPeer with automatic timestamp saving for logout detection
    const clearSelectedPeer = (reason = 'unknown') => {
        if (selectedPeer) {
            console.log(`%c[DashboardPage] 🧹 CLEARING SELECTED PEER: ${selectedPeer} (reason: ${reason})`, 'font-weight: bold; color: orange;');
            // Save selectedPeer with timestamp before clearing it for logout detection
            disconnectedPeerRef.current = {
                peerId: selectedPeer,
                timestamp: Date.now()
            };
            setSelectedPeer('');
            console.log(`%c[DashboardPage] 🧹 SELECTED PEER SAVED FOR LOGOUT DETECTION:`, 'font-weight: bold; color: blue;', disconnectedPeerRef.current);
        }
    };

    // Function to properly clean up streams before setting provider to null
    const cleanupStreamsAndSetProviderNull = (reason = 'unknown') => {
        const userFriendlyReason = getLogoutReasonMessage(reason);
        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: ${userFriendlyReason}`, 'font-weight: bold; color: orange;');
        
        try {
            // Check if provider exists and has streams
            if (provider) {
                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Provider exists, checking for streams`, 'font-weight: bold; color: blue;');
                
                // Try to get local streams from provider if possible
                try {
                    const localVideoStream = provider.getLocalVideoStream();
                    const localAudioStream = provider.getLocalAudioStream();
                    const localScreenStream = provider.getLocalScreenStream();
                    
                    if (localVideoStream) {
                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopping local video stream`, 'font-weight: bold; color: orange;');
                        localVideoStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopped local video track`, 'font-weight: bold; color: orange;');
                            } catch (trackError) {
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Video track already stopped (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                            }
                        });
                    }
                    
                    if (localAudioStream) {
                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopping local audio stream`, 'font-weight: bold; color: orange;');
                        localAudioStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopped local audio track`, 'font-weight: bold; color: orange;');
                            } catch (trackError) {
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Audio track already stopped (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                            }
                        });
                    }
                    
                    if (localScreenStream) {
                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopping local screen stream`, 'font-weight: bold; color: orange;');
                        localScreenStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopped local screen track`, 'font-weight: bold; color: orange;');
                            } catch (trackError) {
                                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Screen track already stopped (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                            }
                        });
                    }
                } catch (error) {
                    console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Provider streams already cleaned up (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                }
            }
            
            // Clean up all video elements
            try {
                const videoElements = document.querySelectorAll('video');
                videoElements.forEach((video, index) => {
                    if (video.srcObject) {
                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Clearing video element ${index}`, 'font-weight: bold; color: orange;');
                        try {
                            const stream = video.srcObject;
                            if (stream && stream.getTracks) {
                                stream.getTracks().forEach(track => {
                                    try {
                                        track.stop();
                                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Stopped track: ${track.kind}`, 'font-weight: bold; color: orange;');
                                    } catch (trackError) {
                                        console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Track already stopped (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                                    }
                                });
                            }
                            video.srcObject = null;
                        } catch (videoError) {
                            console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Video element already cleared (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
                        }
                    }
                });
            } catch (videoCleanupError) {
                console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: Video elements already cleaned up (normal during ${userFriendlyReason.toLowerCase()})`, 'font-weight: bold; color: blue;');
            }
            
            console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: ${userFriendlyReason} completed successfully`, 'font-weight: bold; color: green;');
            setProvider(null);
            
        } catch (error) {
            console.log(`%c[DashboardPage] 🎥 STREAM CLEANUP: ${userFriendlyReason} completed with minor cleanup issues (this is normal)`, 'font-weight: bold; color: blue;');
            // Still set provider to null even if cleanup fails
            setProvider(null);
        }
    };

    // Helper function to provide user-friendly logout reason messages
    const getLogoutReasonMessage = (reason) => {
        const reasonMessages = {
            'user_logout': 'User logout - cleaning up streams',
            'logout_disconnect': 'Peer logout detected - cleaning up streams',
            'disconnect_responder_no_provider': 'Peer disconnected - cleaning up streams',
            'disconnect_initiator_no_provider': 'Disconnecting - cleaning up streams',
            'disconnect_responder_with_provider': 'Peer disconnected - cleaning up streams',
            'disconnect_initiator_with_provider': 'Disconnecting - cleaning up streams',
            'connection_disconnected': 'Connection lost - cleaning up streams',
            'connection_failed': 'Connection failed - cleaning up streams',
            'connection_state_reset': 'Resetting connection - cleaning up streams'
        };
        return reasonMessages[reason] || `Cleaning up streams (${reason})`;
    };

    // Simple logout detection function
    const handlePeerLogout = async (loggedOutPeerId) => {
        console.log(`%c[DashboardPage] 👋 PEER LOGOUT DETECTED: ${loggedOutPeerId}`, 'font-weight: bold; color: orange; font-size: 14px;');
        
        // Clear the saved peer since we've detected and handled the logout
        disconnectedPeerRef.current = null;
        handledLogoutPeersRef.current.add(loggedOutPeerId);
        console.log(`%c[DashboardPage] 👋 CLEARED SAVED PEER after logout detection`, 'font-weight: bold; color: blue;');
        console.log(`%c[DashboardPage] 👋 MARKED PEER ${loggedOutPeerId} as logout handled`, 'font-weight: bold; color: blue;');
        
        // Debug: Check provider state
        console.log(`%c[DashboardPage] 👋 DEBUG: Provider state during logout:`, 'font-weight: bold; color: purple;', {
            provider: provider,
            providerExists: !!provider,
            providerType: typeof provider
        });
        
        // Disconnect gracefully from the logged out peer
        if (provider) {
            console.log(`%c[DashboardPage] 👋 Disconnecting from logged out peer: ${loggedOutPeerId}`, 'font-weight: bold; color: blue;');
            
            // Use existing disconnect logic but don't send disconnect message
            // The other peer already logged out, so no need to notify them
            try {
                provider.destroy();
                cleanupStreamsAndSetProviderNull('logout_disconnect');
                reset();
                console.log(`%c[DashboardPage] 👋 ✅ Graceful disconnect from logged out peer completed`, 'font-weight: bold; color: green;');
            } catch (error) {
                console.warn('[DashboardPage] Error during logout disconnect:', error);
                // Still reset the UI even if disconnect fails
                cleanupStreamsAndSetProviderNull('logout_disconnect_error');
                reset();
            }
        } else {
            console.log(`%c[DashboardPage] 👋 No provider to disconnect, but ensuring proper cleanup for logged out peer: ${loggedOutPeerId}`, 'font-weight: bold; color: blue;');
            
            // CRITICAL: Even without provider, we need to ensure proper disconnect flow
            // The WebRTC connection might have been cleaned up already, but we still need to
            // trigger the proper disconnect sequence to clean up any remaining state
            console.log(`%c[DashboardPage] 👋 FORCING DISCONNECT FLOW: Calling performDisconnect for logged out peer`, 'font-weight: bold; color: orange;');
            try {
                // Call the disconnect method directly to ensure proper cleanup
                await performDisconnect(false); // false = responder side (we're responding to peer logout)
                console.log(`%c[DashboardPage] 👋 ✅ FORCED DISCONNECT COMPLETED for logged out peer`, 'font-weight: bold; color: green;');
            } catch (error) {
                console.warn(`%c[DashboardPage] ⚠️ Error during forced disconnect for logged out peer:`, 'font-weight: bold; color: yellow;', error);
                // Still reset the UI even if forced disconnect fails
                reset();
            }
        }
        
        // Stream cleanup is now handled by cleanupStreamsAndSetProviderNull function when provider is destroyed
        
        // FALLBACK: Always ensure UI is reset after logout detection
        console.log(`%c[DashboardPage] 👋 FALLBACK: Ensuring UI reset after logout detection`, 'font-weight: bold; color: red;');
        setTimeout(() => {
            if (isPeerConnected || isConnecting) {
                console.log(`%c[DashboardPage] 👋 FALLBACK: UI still shows connected state, forcing reset`, 'font-weight: bold; color: red;');
                reset();
            }
        }, 100);
    };
 
    // Global flag to prevent multiple provider instances
    const [hasActiveProvider, setHasActiveProvider] = useState(false);
    const [activeProviderTimestamp, setActiveProviderTimestamp] = useState(0);
    const [incomingHandlerRegistered, setIncomingHandlerRegistered] = useState(false);

    // Helper function to check if the provider is still the active one
    const isProviderActive = (providerInstance) => {
        return providerInstance && activeProviderTimestamp > 0;
    };

    // Helper function to safely destroy a provider
    const destroyProvider = async (providerInstance) => {
        if (providerInstance) {
            try {
                console.log('[DashboardPage] 🔄 Destroying provider instance');
                providerInstance.destroy();
                // Add a small delay to ensure the destroy operation completes
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.warn('[DashboardPage] ⚠️ Error destroying provider:', error);
            }
        }
    };

    // Cleanup provider when provider state changes
    useEffect(() => {
        return () => {
            if (provider) {
                console.log('[DashboardPage] 🧹 Cleaning up WebRTC provider on provider change');
                WebRTCProvider.clearAllInstances();
                WebRTCProvider.clearActiveInstance(); // Clear the active instance reference
            }
        };
    }, [provider]);
    

    // Check screen sharing support on component mount
    useEffect(() => {
        const checkScreenShareSupport = () => {
            // Check if getDisplayMedia is supported
            const hasGetDisplayMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
            
            // Check if it's a mobile device
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // Check if it's iOS (which has limited screen sharing support)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            // Check if it's Android
            const isAndroid = /Android/i.test(navigator.userAgent);
            
            // Check if it's a desktop browser
            const isDesktop = !isMobile;
            
            // Screen sharing support logic:
            // - Desktop browsers: Usually supported if getDisplayMedia is available
            // - Android: Limited support, but some browsers support it
            // - iOS: Very limited support, mostly Safari with specific conditions
            // - Mobile browsers: Generally limited support
            
            let isSupported = false;
            
            if (isDesktop) {
                // Desktop browsers generally support screen sharing
                isSupported = hasGetDisplayMedia;
            } else if (isAndroid) {
                // Android has limited screen sharing support
                // Only enable if getDisplayMedia is available and it's a modern browser
                isSupported = hasGetDisplayMedia && /Chrome|Firefox|Edge/i.test(navigator.userAgent);
            } else if (isIOS) {
                // iOS has very limited screen sharing support
                // Only Safari 14+ on iOS 14+ supports it, and only in specific contexts
                const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent);
                isSupported = hasGetDisplayMedia && isSafari;
            } else {
                // Other mobile devices - generally not supported
                isSupported = false;
            }
            
            console.log('[DashboardPage] 🖥️ Screen share support check:', {
                hasGetDisplayMedia,
                isMobile,
                isIOS,
                isAndroid,
                isDesktop,
                isSafari: /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent),
                isSupported,
                userAgent: navigator.userAgent
            });
            
            setIsScreenShareSupported(isSupported);
        };
        
        checkScreenShareSupport();
    }, []);

    // Initialize user and WebSocket connection
    useEffect(() => {
        console.log('[DashboardPage] 🔄 Component mounted');
        console.log('[DashboardPage] 📦 Build version:', getBuildDisplay());

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

            // Check if WebSocket is already connected and set status accordingly
            if (wsProvider.isConnected) {
                console.log('[DashboardPage] WebSocket is already connected, setting status to connected');
                setIsWebSocketConnected(true);
                setError(null);
            } else {
                // Connect WebSocket if not already connected
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
            // Component unmount cleanup - WebRTC provider cleanup is handled by the [provider] useEffect
        };
    }, []);

    // Component unmount cleanup
    useEffect(() => {
        return () => {
            console.log('[DashboardPage] 🧹 Component unmounting, performing cleanup');
            // Clean up message handler if it exists
            if (messageHandlerRef.current) {
                signalingService?.removeMessageHandler(messageHandlerRef.current);
                messageHandlerRef.current = null;
            }
            // Clear all WebRTC instances
            WebRTCProvider.clearAllInstances();
        };
    }, []);







    // Function to handle removal of connected peer (logout detection)
    const removeConnectedPeer = (removedPeerId) => {
        console.log('%c[DashboardPage] 👋 CONNECTED PEER REMOVED - Peer no longer available:', 'font-weight: bold; color: red; font-size: 14px;', {
            removedPeerId: removedPeerId,
            connectedPeer: connectedPeerRef.current,
            selectedPeer: selectedPeer,
            wasConnected: isPeerConnected,
            providerExists: !!provider,
            timestamp: new Date().toISOString(),
            reason: 'peer_logged_out',
            detectionMethod: 'session_level_check'
        });
        
        // Set graceful disconnect flag to prevent "unexpected disconnect" error
        console.log('%c[DashboardPage] 🏷️ SETTING GRACEFUL DISCONNECT FLAG for peer logout', 'font-weight: bold; color: purple;');
        setIsGracefulDisconnect(true);
        
        // Disconnect gracefully from the logged-out peer
        if (provider) {
            console.log('%c[DashboardPage] 🔌 DISCONNECTING from logged-out peer (responder side)', 'font-weight: bold; color: orange;');
            try {
                // OWNERSHIP: DashboardPage owns WebRTCProvider - call disconnect for cleanup
                console.log('%c[DashboardPage] 🔌 Calling provider.disconnect() - DashboardPage owns provider', 'font-weight: bold; color: blue;');
                provider.disconnect(removedPeerId, false); // false = not initiator, use detected peer
                console.log('%c[DashboardPage] ✅ Disconnect from logged-out peer completed', 'font-weight: bold; color: green;');
            } catch (error) {
                console.warn('%c[DashboardPage] ⚠️ Error disconnecting from logged-out peer:', 'font-weight: bold; color: yellow;', error);
            }
        } else {
            console.log('%c[DashboardPage] ⚠️ No provider available for disconnect (peer already logged out)', 'font-weight: bold; color: yellow;');
        }
        
        // Reset to logged-in state
        console.log('%c[DashboardPage] 🔄 RESETTING TO LOGGED-IN STATE after peer logout', 'font-weight: bold; color: blue;');
        setIsPeerConnected(false);
        setIsConnecting(false);
        setShowChat(false);
        setError(null);
        
        // Clear media states
        setIsAudioEnabled(false);
        setIsVideoEnabled(false);
        setIsScreenSharing(false);
        setIsWhiteboardActive(false);
        setReceivedMessages([]);
        
        // Clear peer selection and disconnected peer tracking
        clearSelectedPeer('peer_logout_cleanup');
        disconnectedPeerRef.current = null;
        
        console.log('%c[DashboardPage] ✅ Successfully returned to logged-in state after peer logout', 'font-weight: bold; color: green;');
    };

    // Define handlePeerListUpdate outside useEffect so it can be accessed by other functions
    const handlePeerListUpdate = async (peers) => {
        const user = userRef.current;
        if (!user) {
            console.log('[DashboardPage] No user data available for peer list handler');
            return;
        }

        console.log(`%c[DashboardPage] 📨 PEER LIST UPDATE RECEIVED:`, 'font-weight: bold; color: blue; font-size: 14px;', {
            currentUser: user.id,
            receivedPeers: peers,
            timestamp: new Date().toISOString(),
            selectedPeer: selectedPeer,
            disconnectedPeerRef: disconnectedPeerRef.current,
            willCheckForLogout: selectedPeer && !peers.some(p => p.id === selectedPeer)
        });
        
        // Filter out current user and format peer list using user ID
        const filteredPeers = peers
            .filter(peerId => peerId !== user.id)
            .map(peerId => ({
                id: peerId,
                name: `Peer ${peerId}`
            }));

        console.log('%c[DashboardPage] 🔍 FILTERED PEER LIST:', 'font-weight: bold; color: blue;', {
            filteredPeers: filteredPeers,
            currentUser: user.id
        });
        
        // Check if we have a recently cleared selectedPeer that might indicate logout
        if (disconnectedPeerRef.current) {
            const { peerId, timestamp } = disconnectedPeerRef.current;
            const timeSinceCleared = Date.now() - timestamp;
            
            // If within 2 seconds and peer is not in the updated list = logout
            if (timeSinceCleared <= 2000 && !filteredPeers.some(p => p.id === peerId)) {
                console.log(`%c[DashboardPage] 👋 PEER ${peerId} LOGGED OUT (detected within ${timeSinceCleared}ms)`, 'font-weight: bold; color: red; font-size: 14px;');
                await handlePeerLogout(peerId);
                // Note: handlePeerLogout() will clear disconnectedPeerRef.current
            } else if (timeSinceCleared > 2000) {
                // More than 2 seconds = just a normal disconnect, clear the ref
                console.log(`%c[DashboardPage] 🔌 Normal disconnect detected (${timeSinceCleared}ms ago)`, 'font-weight: bold; color: blue;');
                disconnectedPeerRef.current = null;
            }
        }
        
        // Check if current selectedPeer is missing from updated list (immediate logout detection)
        if (selectedPeer && !filteredPeers.some(p => p.id === selectedPeer)) {
            console.log(`%c[DashboardPage] 👋 CONNECTED PEER ${selectedPeer} LOGGED OUT (immediate detection)`, 'font-weight: bold; color: red; font-size: 14px;');
            await handlePeerLogout(selectedPeer);
        }
        
        // Update the peer list
        setPeerList(filteredPeers);
    };

    // Set up peer list handler - separate effect to avoid re-runs
    useEffect(() => {
        const user = userRef.current;
        if (!user) {
            console.log('[DashboardPage] No user data available for peer list handler');
            return;
        }

        console.log('[DashboardPage] Setting up peer list handler for user:', user.id);

        // Set up handlers in signaling service
        if (signalingService) {
            console.log('[DashboardPage] Registering peer list handler with signaling service');
            signalingService.onPeerListUpdate = handlePeerListUpdate;
            
            // Set up incoming connection handler
            signalingService.onIncomingConnection = async (message) => {
                console.log('%c[DashboardPage] 🟢 CONNECT RECEIVED from peer (responder side):', 'font-weight: bold; color: green;', message.from);
                console.log('[DashboardPage] 🔄 Incoming connection detected:', message.type, 'from peer', message.from);
                
                // Always create a fresh WebRTC provider for incoming connections
                if (message.type === 'initiate') {
                    try {
                        console.log('[DashboardPage] 🔄 Creating fresh WebRTC provider for incoming connection');
                        
                        // Prevent multiple simultaneous provider creation
                        if (isCreatingProvider) {
                            console.log('[DashboardPage] ⚠️ Provider creation already in progress for incoming connection, skipping');
                            return;
                        }
                        
                        // Set connecting state for incoming connection
                        setIsConnecting(true);
                        setError(null);
                        setIsCreatingProvider(true);
                        setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection
                        
                        // Destroy any existing provider first to ensure clean state
                        if (provider) {
                            console.log('[DashboardPage] 🔄 Destroying existing provider before creating new one for incoming connection');
                            
                            // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                            try {
                                console.log('%c[DashboardPage] 🧹 DashboardPage managing WebRTCProvider cleanup', 'font-weight: bold; color: blue;');
                                
                                // DashboardPage removes the message handler (it owns the provider)
                                if (signalingService) {
                                    const handlerId = provider.getMessageHandlerId();
                                    if (handlerId !== null) {
                                        console.log(`%c[DashboardPage] 🧹 REMOVING HANDLER ${handlerId} (DashboardPage owns provider)`, 'font-weight: bold; color: orange;');
                                        const removed = signalingService.removeMessageHandler(handlerId);
                                        console.log(`%c[DashboardPage] 🧹 HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange;');
                                    }
                                }
                                
                                // Then destroy the provider
                                provider.destroy();
                                // Add a small delay to ensure the destroy operation completes
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } catch (error) {
                                console.warn('[DashboardPage] ⚠️ Error destroying existing provider for incoming connection:', error);
                            }
                        }
                        
                        console.log('%c[DashboardPage] 🚀 CREATING WEBRTC PROVIDER for incoming connection', 'font-weight: bold; color: green; font-size: 14px;');
                        const rtcProvider = new WebRTCProvider({
                            userId: user.id,
                            iceServers: [
                                {
                                    urls: [
                                        'stun:stun.l.google.com:19302',
                                        'stun:stun1.l.google.com:19302',
                                        'stun:stun2.l.google.com:19302',
                                        'stun:stun3.l.google.com:19302',
                                        'stun:stun4.l.google.com:19302'
                                    ]
                                }
                            ]
                        });

                        // Set up WebRTC event listeners
                        setupWebRTCEventListeners(rtcProvider);

                        // Connect to signaling service
                        rtcProvider.setSignalingService(signalingService);
                        setProvider(rtcProvider); // Set provider directly
                    } catch (error) {
                        console.error('[DashboardPage] ❌ Error creating provider for incoming connection:', error);
                        setIsConnecting(false);
                    } finally {
                        setIsCreatingProvider(false);
                    }
                }
            };
            
            // Set up disconnect message handler
            signalingService.onDisconnectMessage = async (message) => {
                console.log('%c[DashboardPage] 🔴 DISCONNECT RECEIVED from peer (responder side):', 'font-weight: bold; color: red;', message.from, 'reason:', message.reason);
                console.log('[DashboardPage] 📥 DISCONNECT RECEIVED from peer (responder side):', message.from, 'reason:', message.reason);
                
                // Responder side - received disconnect message from peer
                // Don't send disconnect message back, just clean up local resources
                await performDisconnect(false);
            };
            
        } else {
            console.warn('[DashboardPage] No signaling service available for peer list updates');
        }

        return () => {
            console.log('[DashboardPage] Cleaning up peer list handler');
            if (signalingService) {
                signalingService.onPeerListUpdate = null;
                signalingService.onIncomingConnection = null;
                signalingService.onDisconnectMessage = null;
            }
        };
    }, [signalingService]); // Only depend on signalingService

    // Auto-select single peer when available, and clear selection when no peers available
    useEffect(() => {
        if (peerList.length === 1 && !selectedPeer && !isPeerConnected && !isConnecting) {
            console.log('[DashboardPage] Auto-selecting single available peer:', peerList[0].id);
            setSelectedPeer(peerList[0].id);
        } else if (peerList.length === 0 && selectedPeer) {
            console.log('[DashboardPage] No peers available, clearing selected peer');
            clearSelectedPeer('no_peers_available');
        }
    }, [peerList, selectedPeer, isPeerConnected, isConnecting]);

    // WebRTC Provider lifecycle management
    useEffect(() => {
        // Cleanup function to destroy provider when it changes or component unmounts
        return () => {
            if (provider) {
                console.log('[DashboardPage] 🔄 Cleaning up WebRTC provider on unmount/change');
                
                // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                try {
                    console.log('%c[DashboardPage] 🧹 DashboardPage managing WebRTCProvider cleanup', 'font-weight: bold; color: blue;');
                    
                    // DashboardPage removes the message handler (it owns the provider)
                    if (signalingService) {
                        const handlerId = provider.getMessageHandlerId();
                        if (handlerId !== null) {
                            console.log(`%c[DashboardPage] 🧹 REMOVING HANDLER ${handlerId} (DashboardPage owns provider)`, 'font-weight: bold; color: orange;');
                            const removed = signalingService.removeMessageHandler(handlerId);
                            console.log(`%c[DashboardPage] 🧹 HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange;');
                        }
                    }
                    
                    // Then destroy the provider
                    provider.destroy();
                } catch (error) {
                    console.warn('[DashboardPage] ⚠️ Error during provider cleanup:', error);
                }
            }
        };
    }, [provider]); // This effect runs when provider changes or component unmounts




    // Sync media state with WebRTC provider state
    useEffect(() => {
        if (!provider) return;

        const handleStateChange = (event) => {
            console.log('[DashboardPage] 🔄 Received stateChange event from provider:', event.data);
            
            // Update media state based on provider state
            setIsAudioEnabled(provider.getLocalAudioState());
            setIsVideoEnabled(provider.getLocalVideoState());
            setIsScreenSharing(provider.isScreenSharingActive());
        };

        const handleStreamChange = (event) => {
            console.log('[DashboardPage] 🔄 Received stream event from provider:', event.data);
            
            // Update screen share active status when streams change
            const hasLocalScreenShare = !!provider.getScreenShareStream();
            const hasRemoteScreenShare = !!provider.getRemoteScreen(selectedPeer);
            const newIsScreenShareActive = isScreenSharing || hasLocalScreenShare || hasRemoteScreenShare;
            
            console.log('[DashboardPage] 🔍 Updating screen share status:', {
                isScreenSharing,
                hasLocalScreenShare,
                hasRemoteScreenShare,
                selectedPeer,
                newIsScreenShareActive
            });
            
            setIsScreenShareActive(newIsScreenShareActive);
        };

        provider.addEventListener('stateChange', handleStateChange);
        provider.addEventListener('stream', handleStreamChange);
        
        // Also update initial state
        setIsAudioEnabled(provider.getLocalAudioState());
        setIsVideoEnabled(provider.getLocalVideoState());
        setIsScreenSharing(provider.isScreenSharingActive());

        return () => {
            provider.removeEventListener('stateChange', handleStateChange);
            provider.removeEventListener('stream', handleStreamChange);
        };
    }, [provider, isScreenSharing, selectedPeer]);

    // Debug: Measure and display element dimensions
    useEffect(() => {
        const updateDimensions = () => {
            const measureElements = () => {
                const dashboardContent = document.querySelector('.dashboard-content');
                const videoChat = document.querySelector('.video-chat');
                
                console.log('🔍 Measuring elements:', {
                    dashboardContentFound: !!dashboardContent,
                    videoChatFound: !!videoChat,
                    dashboardContentClasses: dashboardContent?.className,
                    videoChatClasses: videoChat?.className
                });
                
                if (dashboardContent) {
                    const rect = dashboardContent.getBoundingClientRect();
                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);
                    dashboardContent.setAttribute('data-width', `${width}px`);
                    dashboardContent.setAttribute('data-height', `${height}px`);
                    console.log('Dashboard Content dimensions:', width, 'x', height);
                } else {
                    console.log('❌ Dashboard Content element not found');
                }
                
                if (videoChat) {
                    const rect = videoChat.getBoundingClientRect();
                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);
                    videoChat.setAttribute('data-width', `${width}px`);
                    videoChat.setAttribute('data-height', `${height}px`);
                    console.log('Video Chat dimensions:', width, 'x', height);
                } else {
                    console.log('❌ Video Chat element not found - checking all video-chat elements...');
                    const allVideoChats = document.querySelectorAll('.video-chat');
                    console.log('Found video-chat elements:', allVideoChats.length);
                    allVideoChats.forEach((el, index) => {
                        console.log(`Video-chat ${index}:`, {
                            className: el.className,
                            id: el.id,
                            visible: el.offsetParent !== null
                        });
                    });
                }
            };

            // Try immediately
            measureElements();
            
            // Try again after a short delay
            setTimeout(measureElements, 100);
            
            // Try again after a longer delay
            setTimeout(measureElements, 500);
            
            // Try again after 1 second
            setTimeout(measureElements, 1000);
        };

        // Update dimensions on mount and resize
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        
        return () => window.removeEventListener('resize', updateDimensions);
    }, [isPeerConnected, isConnecting]); // Re-run when VideoChat component state changes

    // Debug popup state
    const [showDebugPopup, setShowDebugPopup] = useState(false);

    // Function to get video stream dimensions
    const getVideoStreamDimensions = () => {
        const videoElements = document.querySelectorAll('video');
        const videoInfo = [];
        
        videoElements.forEach((video, index) => {
            const info = {
                index,
                element: video,
                videoWidth: video.videoWidth || 0,
                videoHeight: video.videoHeight || 0,
                displayWidth: video.offsetWidth,
                displayHeight: video.offsetHeight,
                srcObject: video.srcObject ? 'Has Stream' : 'No Stream',
                paused: video.paused,
                currentTime: video.currentTime,
                duration: video.duration,
                aspectRatio: video.videoWidth && video.videoHeight ? 
                    (video.videoWidth / video.videoHeight).toFixed(3) : 'N/A'
            };
            
            // Get stream info if available
            if (video.srcObject) {
                const tracks = video.srcObject.getTracks();
                info.tracks = tracks.map(track => ({
                    kind: track.kind,
                    enabled: track.enabled,
                    readyState: track.readyState,
                    settings: track.getSettings ? track.getSettings() : 'Not available'
                }));
            }
            
            videoInfo.push(info);
        });
        
        return videoInfo;
    };

    // Function to show debug popup with current dimensions
    const showDebugInfo = () => {
        const dashboardContent = document.querySelector('.dashboard-content');
        const videoChat = document.querySelector('.video-chat');
        const videoContainer = document.querySelector('.video-container');
        const mainVideoWrapper = document.querySelector('.main-video-wrapper');
        
        // Get video stream dimensions
        const videoStreams = getVideoStreamDimensions();
        
        const debugInfo = {
            dashboardContent: dashboardContent ? {
                width: Math.round(dashboardContent.getBoundingClientRect().width),
                height: Math.round(dashboardContent.getBoundingClientRect().height),
                offsetWidth: dashboardContent.offsetWidth,
                offsetHeight: dashboardContent.offsetHeight,
                clientWidth: dashboardContent.clientWidth,
                clientHeight: dashboardContent.clientHeight,
                computedStyle: window.getComputedStyle(dashboardContent)
            } : null,
            videoChat: videoChat ? {
                width: Math.round(videoChat.getBoundingClientRect().width),
                height: Math.round(videoChat.getBoundingClientRect().height),
                offsetWidth: videoChat.offsetWidth,
                offsetHeight: videoChat.offsetHeight,
                clientWidth: videoChat.clientWidth,
                clientHeight: videoChat.clientHeight,
                computedStyle: window.getComputedStyle(videoChat)
            } : null,
            videoContainer: videoContainer ? {
                width: Math.round(videoContainer.getBoundingClientRect().width),
                height: Math.round(videoContainer.getBoundingClientRect().height),
                offsetWidth: videoContainer.offsetWidth,
                offsetHeight: videoContainer.offsetHeight,
                clientWidth: videoContainer.clientWidth,
                clientHeight: videoContainer.clientHeight,
                computedStyle: window.getComputedStyle(videoContainer)
            } : null,
            mainVideoWrapper: mainVideoWrapper ? {
                width: Math.round(mainVideoWrapper.getBoundingClientRect().width),
                height: Math.round(mainVideoWrapper.getBoundingClientRect().height),
                offsetWidth: mainVideoWrapper.offsetWidth,
                offsetHeight: mainVideoWrapper.offsetHeight,
                clientWidth: mainVideoWrapper.clientWidth,
                clientHeight: mainVideoWrapper.clientHeight,
                computedStyle: window.getComputedStyle(mainVideoWrapper)
            } : null,
            videoStreams,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            state: {
                isPeerConnected,
                isConnecting,
                isAudioEnabled,
                isVideoEnabled,
                isScreenSharing
            }
        };
        
        console.log('🔍 Debug Info:', debugInfo);
        setShowDebugPopup(true);
        
        // Auto-hide after 10 seconds
        setTimeout(() => setShowDebugPopup(false), 10000);
    };

    // Helper function to set up WebRTC event listeners
    const setupWebRTCEventListeners = (rtcProvider) => {
        // Connection event listener
        const connectionHandler = (event) => {
            const state = event.data.state;
            console.log(`[DashboardPage] Connection state changed:`, state);
            
            if (state === 'connected') {
                setIsPeerConnected(true);
                setIsConnecting(false);
                setShowChat(true);
                setError(null);
                setIsGracefulDisconnect(false); // Reset graceful disconnect flag on successful connection
                
                // Automatically enable whiteboard when connection is established
                if (!isWhiteboardActive) {
                    console.log('[DashboardPage] 🎨 Auto-enabling whiteboard on connection');
                    setIsWhiteboardActive(true);
                }
                
                // Clear any previous disconnected peer tracking since we have a new connection
                disconnectedPeerRef.current = null;
                handledLogoutPeersRef.current.clear(); // Clear handled logout tracking for new connection
                console.log('%c[DashboardPage] 🔗 CONNECTION ESTABLISHED:', 'font-weight: bold; color: green;', {
                    selectedPeer: selectedPeer,
                    clearedDisconnectedPeer: true,
                    clearedHandledLogoutPeers: true
                });
            } else if (state === 'connecting') {
                setIsConnecting(true);
                setIsPeerConnected(false);
                setShowChat(false);
                // Don't reset graceful disconnect flag here - let it persist until we know the final state
            } else if (state === 'disconnected' || state === 'failed') {
                setIsPeerConnected(false);
                setIsConnecting(false);
                setShowChat(false);
                
                // Save disconnected peer with timestamp to detect logout vs disconnect
                if (selectedPeer) {
                    disconnectedPeerRef.current = {
                        peerId: selectedPeer,
                        timestamp: Date.now()
                    };
                    console.log('%c[DashboardPage] 🔌 CONNECTION LOST - Saved peer for logout detection:', 'font-weight: bold; color: red;', {
                        disconnectedPeer: disconnectedPeerRef.current,
                        reason: 'Will check if peer is missing from updated list within 2 seconds'
                    });
                }
                
                // Clean up message handler when disconnected
                if (messageHandlerRef.current) {
                    signalingService.removeMessageHandler(messageHandlerRef.current);
                    messageHandlerRef.current = null;
                }
                
                // Destroy provider on disconnect or failure to ensure fresh instance for retry
                if (state === 'failed' || state === 'disconnected') {
                    console.log(`[DashboardPage] Connection ${state} - destroying provider for retry`);
                    
                    // Check if we've already handled a logout for this peer to prevent duplicate cleanup
                    const isLogoutHandled = selectedPeer && handledLogoutPeersRef.current.has(selectedPeer);
                    if (isLogoutHandled) {
                        console.log(`%c[DashboardPage] 🚫 SKIPPING STREAM CLEANUP - Logout already handled for peer ${selectedPeer}`, 'font-weight: bold; color: orange;');
                    } else {
                        console.log(`%c[DashboardPage] 🎥 PROCEEDING WITH STREAM CLEANUP - No logout detected yet for peer ${selectedPeer}`, 'font-weight: bold; color: blue;');
                        cleanupStreamsAndSetProviderNull(`connection_${state}`); // Clean up streams before setting provider to null
                    }
                    
                    // Only show error message for unexpected disconnections
                    console.log(`%c[DashboardPage] 🔍 CONNECTION STATE CHANGE: ${state}, isGracefulDisconnect: ${isGracefulDisconnect}`, 'font-weight: bold; color: blue;');
                    console.log(`%c[DashboardPage] 🔍 DISCONNECT FLAG DEBUG: flag=${isGracefulDisconnect}, state=${state}`, 'font-weight: bold; color: purple;');
                    
                    if (state === 'failed') {
                        // Failed connections are always unexpected
                        console.log('[DashboardPage] Failed connection - showing error message');
                        setError('Connection failed. This may be due to network issues or firewall restrictions. Please try reconnecting.');
                    } else if (state === 'disconnected' && !isGracefulDisconnect) {
                        // Only show "Connection lost" for unexpected disconnections
                        console.log('%c[DashboardPage] ❌ Unexpected disconnect - showing error message', 'font-weight: bold; color: red;');
                        setError('Connection lost. Please try reconnecting.');
                    } else if (state === 'disconnected' && isGracefulDisconnect) {
                        // Graceful disconnect - clear any existing error and don't show new error
                        console.log('%c[DashboardPage] ✅ Graceful disconnect detected - not showing error message', 'font-weight: bold; color: green;');
                        setError(null);
                    }
                }
            }
        };
        
        // Store the connection handler
        webRTCEventHandlersRef.current.connection = connectionHandler;
        rtcProvider.addEventListener('connection', connectionHandler);

        const errorHandler = (event) => {
            console.error('[DashboardPage] WebRTC error:', event.data);
            
            // Provide more specific error messages for common issues
            let errorMessage = event.data.message;
            if (event.data.error && event.data.error.name === 'InvalidStateError') {
                errorMessage = 'Connection state error - this usually resolves automatically. Please try reconnecting.';
            } else if (event.data.message && event.data.message.includes('Failed to execute')) {
                errorMessage = 'Connection setup error - please try reconnecting.';
            }
            
            setError(errorMessage);
        };
        
        // Store the error handler
        webRTCEventHandlersRef.current.error = errorHandler;
        rtcProvider.addEventListener('error', errorHandler);

        const messageHandler = (event) => {
            // Enhanced debugging to identify message structure issues
            console.group('[DashboardPage] 🔍 Message Event Debug');
            safeLog('Event type:', event.type);
            safeLog('Event peerId:', event.peerId);
            safeLog('Event data type:', typeof event.data);
            safeLog('Event data:', event.data);
            
            // Try to show the actual message content
            if (event.data) {
                safeLog('Data keys:', Object.keys(event.data));
                safeLog('Data content:', event.data);
                
                // Try to stringify the data to see its actual content
                try {
                    safeLog('Stringified data:', JSON.stringify(event.data, null, 2));
                } catch (e) {
                    safeLog('Could not stringify data:', e);
                }
            } else {
                console.log('No data in event');
            }
            
            // Log the full event object structure
            safeLog('Full event object:', event);
            safeLog('Event constructor:', event.constructor.name);
            safeLog('Event prototype chain:', Object.getPrototypeOf(event));
            console.groupEnd();
            
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
        };
        
        // Store the message handler
        webRTCEventHandlersRef.current.message = messageHandler;
        rtcProvider.addEventListener('message', messageHandler);
    };

    const handleConnect = async () => {
        // Safety check: Perform cleanup if we're in a corrupted state
        if (provider && !isPeerConnected && !isConnecting) {
            console.log('%c[DashboardPage] ⚠️ DETECTED CORRUPTED STATE - Performing cleanup before connect', 'font-weight: bold; color: orange;');
            performComprehensiveCleanup('corrupted_state_before_connect');
        }
        
        if (!selectedPeer) {
            setError('Please select a peer');
            return;
        }

        // Prevent multiple simultaneous provider creation
        if (isCreatingProvider) {
            console.log('[DashboardPage] ⚠️ Provider creation already in progress, skipping');
            return;
        }

        try {
            setIsCreatingProvider(true);
            setIsConnecting(true);
            setError(null);
            setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection

            // Destroy any existing provider first to ensure clean state
            if (provider) {
                console.log('[DashboardPage] 🔄 Destroying existing provider before creating new one');
                
                // Clean up message handler before destroying provider
                if (signalingService) {
                    const handlerId = provider.getMessageHandlerId();
                    if (handlerId !== null) {
                        console.log(`%c[DashboardPage] 🧹 REMOVING EXISTING HANDLER ${handlerId} before creating new provider`, 'font-weight: bold; color: orange; font-size: 14px;');
                        const removed = signalingService.removeMessageHandler(handlerId);
                        console.log(`%c[DashboardPage] 🧹 EXISTING HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange; font-size: 14px;');
                    }
                }
                
                try {
                    provider.destroy();
                    // Add a small delay to ensure the destroy operation completes
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn('[DashboardPage] ⚠️ Error destroying existing provider:', error);
                }
            }
            
            // Reset signaling service to ensure clean state
            if (signalingService) {
                console.log('[DashboardPage] 🔄 Resetting signaling service before creating new provider');
                signalingService.reset();
                // Add a small delay to ensure the reset operation completes
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Re-register peer list handler after reset
                console.log('[DashboardPage] 🔄 Re-registering peer list handler after signaling service reset');
                const user = userRef.current;
                if (user) {
                    signalingService.onPeerListUpdate = handlePeerListUpdate;
                    signalingService.onIncomingConnection = async (message) => {
                        console.log('[DashboardPage] 🔄 Incoming connection detected after reset:', message.type, 'from peer', message.from);
                        
                        // Always create a fresh WebRTC provider for incoming connections
                        if (message.type === 'initiate') {
                            try {
                                console.log('[DashboardPage] 🔄 Creating fresh WebRTC provider for incoming connection after reset');
                                
                                // Prevent multiple simultaneous provider creation
                                if (isCreatingProvider) {
                                    console.log('[DashboardPage] ⚠️ Provider creation already in progress for incoming connection after reset, skipping');
                                    return;
                                }
                                
                                // Set connecting state for incoming connection
                                setIsConnecting(true);
                                setError(null);
                                setIsCreatingProvider(true);
                                setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection
                                
                                // Destroy any existing provider first to ensure clean state
                                if (provider) {
                                    console.log('[DashboardPage] 🔄 Destroying existing provider before creating new one for incoming connection after reset');
                                    
                                    // Clean up message handler before destroying provider
                                    if (signalingService) {
                                        const handlerId = provider.getMessageHandlerId();
                                        if (handlerId !== null) {
                                            console.log(`%c[DashboardPage] 🧹 REMOVING EXISTING HANDLER ${handlerId} before creating new provider for incoming connection after reset`, 'font-weight: bold; color: orange; font-size: 14px;');
                                            const removed = signalingService.removeMessageHandler(handlerId);
                                            console.log(`%c[DashboardPage] 🧹 EXISTING HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange; font-size: 14px;');
                                        }
                                    }
                                    
                                    try {
                                        provider.destroy();
                                        // Add a small delay to ensure the destroy operation completes
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    } catch (error) {
                                        console.warn('[DashboardPage] ⚠️ Error destroying existing provider for incoming connection after reset:', error);
                                    }
                                }
                                
                                console.log('%c[DashboardPage] 🚀 CREATING WEBRTC PROVIDER for incoming connection after reset', 'font-weight: bold; color: green; font-size: 14px;');
                                const rtcProvider = new WebRTCProvider({
                                    userId: user.id,
                                    iceServers: [
                                        {
                                            urls: [
                                                'stun:stun.l.google.com:19302',
                                                'stun:stun1.l.google.com:19302',
                                                'stun:stun2.l.google.com:19302',
                                                'stun:stun3.l.google.com:19302',
                                                'stun:stun4.l.google.com:19302'
                                            ]
                                        }
                                    ]
                                });

                                // Set up WebRTC event listeners
                                setupWebRTCEventListeners(rtcProvider);

                                // Connect to signaling service
                                rtcProvider.setSignalingService(signalingService);
                                setProvider(rtcProvider); // Set provider directly
                            } catch (error) {
                                console.error('[DashboardPage] ❌ Error creating provider for incoming connection after reset:', error);
                                setIsConnecting(false);
                            } finally {
                                setIsCreatingProvider(false);
                            }
                        }
                    };
                    
                }
            }

            // Always create a fresh WebRTC provider for clean connection
            console.log('[DashboardPage] 🔄 Creating fresh WebRTC provider for connection');
            const user = userRef.current;
            const currentTimestamp = Date.now();
            setActiveProviderTimestamp(currentTimestamp);
            
            console.log('%c[DashboardPage] 🚀 CREATING WEBRTC PROVIDER for connect button', 'font-weight: bold; color: green; font-size: 14px;');
            
            let rtcProvider;
            try {
                rtcProvider = new WebRTCProvider({
                    userId: user.id,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302',
                                'stun:stun2.l.google.com:19302',
                                'stun:stun3.l.google.com:19302',
                                'stun:stun4.l.google.com:19302'
                            ]
                        }
                    ]
                });
            } catch (error) {
                console.error('[DashboardPage] ❌ Failed to create WebRTC provider:', error);
                setError('Failed to initialize connection. This might be due to browser compatibility issues.');
                return;
            }

            // Set up WebRTC event listeners
            setupWebRTCEventListeners(rtcProvider);

            // Connect to signaling service
            rtcProvider.setSignalingService(signalingService);
            setProvider(rtcProvider); // Set provider directly

            // Connect to the selected peer
            await rtcProvider.connect(selectedPeer);
            
        } catch (error) {
            console.error('[DashboardPage] ❌ Connection error:', error);
            setError(error.message);
            setIsConnecting(false);
        } finally {
            setIsCreatingProvider(false);
        }
    };

    // Extracted disconnect logic that can be used by both initiator and responder
    const performDisconnect = async (isInitiator = true) => {
        try {
            const disconnectType = isInitiator ? 'initiator side' : 'responder side';
            if (isInitiator) {
                console.log('%c[DashboardPage] 🔴 DISCONNECT STARTED from initiator side', 'font-weight: bold; color: red;');
            } else {
                console.log('%c[DashboardPage] 🔴 DISCONNECT STARTED from responder side', 'font-weight: bold; color: red;');
            }
            console.log(`[DashboardPage] 🔴 DISCONNECT STARTED from ${disconnectType}`);
            
            // Mark this as a graceful disconnect (peer initiated)
            console.log(`%c[DashboardPage] 🏷️ SETTING GRACEFUL DISCONNECT FLAG: ${isInitiator ? 'initiator' : 'responder'}`, 'font-weight: bold; color: purple;');
            setIsGracefulDisconnect(true);
            console.log(`%c[DashboardPage] 🏷️ GRACEFUL DISCONNECT FLAG SET TO: true`, 'font-weight: bold; color: purple;');
            
            // CRITICAL: Wait for the state update to be applied before proceeding
            // This ensures the connection state change handler sees the correct flag value
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Send disconnect message to peer (only if initiator)
            if (isInitiator && signalingService && selectedPeer) {
                try {
                    console.log(`[DashboardPage] 📤 Sending disconnect message to peer ${selectedPeer}`);
                    signalingService.send({
                        type: 'disconnect',
                        from: userRef.current?.id,
                        to: selectedPeer,
                        data: { timestamp: Date.now() }
                    });
                    console.log(`[DashboardPage] ✅ Disconnect message sent to peer ${selectedPeer}`);
                } catch (error) {
                    console.warn('[DashboardPage] Failed to send disconnect message:', error);
                }
            } else if (!isInitiator) {
                console.log(`[DashboardPage] 🔄 Responder side - not sending disconnect message to peer ${selectedPeer}`);
            }
            
            // STEP 1: Stop all media resources BEFORE disconnecting
            console.log('%c[DashboardPage] 🛑 STOPPING ALL MEDIA RESOURCES before disconnect', 'font-weight: bold; color: orange; font-size: 14px;');
            
            // Stop screen share before disconnect if it's active
            if (isScreenSharing && provider) {
                console.log('[DashboardPage] 🖥️ Stopping screen share before disconnect');
                try {
                    await provider.stopScreenShare();
                    setIsScreenSharing(false);
                } catch (error) {
                    console.warn('[DashboardPage] Failed to stop screen share during disconnect:', error);
                }
            }
            
            // STEP 2: Disconnect from the specific peer - this will:
            // 1. Clear all audio, video, screen resources
            // 2. Reset remote resources (remote peer will clear its resources)
            if (provider) {
                console.log('%c[DashboardPage] 🔌 DISCONNECTING WEBRTC from peer', 'font-weight: bold; color: orange; font-size: 14px;');
                
                // CRITICAL: Remove event listeners BEFORE disconnecting to prevent delayed events (especially on responder side)
                console.log(`%c[DashboardPage] 🔌 REMOVING EVENT LISTENERS before disconnect (${disconnectType})`, 'font-weight: bold; color: orange;');
                try {
                    const handlers = webRTCEventHandlersRef.current;
                    if (handlers.connection) {
                        provider.removeEventListener('connection', handlers.connection);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed connection event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    if (handlers.error) {
                        provider.removeEventListener('error', handlers.error);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed error event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    if (handlers.message) {
                        provider.removeEventListener('message', handlers.message);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed message event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    if (handlers.stream) {
                        provider.removeEventListener('stream', handlers.stream);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed stream event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    if (handlers.stateChange) {
                        provider.removeEventListener('stateChange', handlers.stateChange);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed stateChange event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    if (handlers.track) {
                        provider.removeEventListener('track', handlers.track);
                        console.log(`%c[DashboardPage] 🔌 ✅ Removed track event listener (${disconnectType})`, 'font-weight: bold; color: green;');
                    }
                    
                    // Clear the stored handlers
                    webRTCEventHandlersRef.current = {
                        connection: null,
                        error: null,
                        message: null,
                        stream: null,
                        stateChange: null,
                        track: null
                    };
                    
                    console.log(`%c[DashboardPage] 🔌 ✅ All event listeners removed (${disconnectType})`, 'font-weight: bold; color: green;');
                } catch (error) {
                    console.warn(`%c[DashboardPage] 🔌 ⚠️ Error removing event listeners (${disconnectType}):`, 'font-weight: bold; color: yellow;', error);
                }
                
                // Set graceful disconnect flag on WebRTC provider to prevent connection state events
                provider.setGracefulDisconnect(true);
                await provider.disconnect(selectedPeer, isInitiator);
            } else {
                console.log(`[DashboardPage] ⚠️ No WebRTC provider available for disconnect (${disconnectType})`);
                // CRITICAL: Even without provider, we need to clean up streams
                console.log(`%c[DashboardPage] 🎥 CLEANING UP STREAMS without provider (${disconnectType})`, 'font-weight: bold; color: orange;');
                cleanupStreamsAndSetProviderNull(`disconnect_${disconnectType}_no_provider`);
            }
            
            // STEP 3: Reset dashboard state to go back to logged in page
            console.log('[DashboardPage] 🔄 Resetting dashboard state after disconnect');
            reset();
            
            // STEP 4: Destroy the provider (DashboardPage owns WebRTCProvider)
            console.log('%c[DashboardPage] 💥 DESTROYING WEBRTC PROVIDER after disconnect', 'font-weight: bold; color: red; font-size: 14px;');
            console.log('[DashboardPage] 🔄 Destroying WebRTC provider after disconnect');
            if (provider) {
                // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                console.log('%c[DashboardPage] 💥 DashboardPage managing WebRTCProvider cleanup', 'font-weight: bold; color: blue;');
                try {
                    // DashboardPage removes the message handler (it owns the provider)
                    if (signalingService) {
                        const handlerId = provider.getMessageHandlerId();
                        if (handlerId !== null) {
                            console.log(`%c[DashboardPage] 🧹 REMOVING HANDLER ${handlerId} (DashboardPage owns provider)`, 'font-weight: bold; color: orange;');
                            const removed = signalingService.removeMessageHandler(handlerId);
                            console.log(`%c[DashboardPage] 🧹 HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange;');
                        }
                    }
                    
                    // Then destroy the provider and clean up streams properly
                    provider.destroy();
                    cleanupStreamsAndSetProviderNull(`disconnect_${disconnectType}_with_provider`);
                } catch (error) {
                    console.warn('[DashboardPage] Error during provider destroy:', error);
                }
            }
            
            // STEP 6: The existing disconnect logic already handles cleanup properly
            // No need for additional comprehensive cleanup here as it might interfere
            console.log(`[DashboardPage] ✅ Disconnect cleanup completed by existing logic`);
            
            console.log(`[DashboardPage] ✅ Disconnect process completed - user remains logged in (${disconnectType})`);
        } catch (error) {
            console.error('[DashboardPage] Disconnect error:', error);
            setError(error.message);
        }
    };

    const handleDisconnect = async () => {
        // Initiator side - user clicked disconnect button
        await performDisconnect(true);
    };

    const handleLogout = async () => {
        console.log('%c[DashboardPage] 👋 LOGOUT INITIATED by user', 'font-weight: bold; color: red; font-size: 14px;');
        console.log('[DashboardPage] 👋 User logging out - starting logout process');
        
        try {
            // STEP 1: If user is connected to a peer, disconnect gracefully (but don't send disconnect message)
            if (provider && selectedPeer && isPeerConnected) {
                console.log('%c[DashboardPage] 👋 STEP 1: User is connected to peer, disconnecting gracefully', 'font-weight: bold; color: orange;');
                console.log('[DashboardPage] 👋 Connected peer:', selectedPeer, 'Provider exists:', !!provider);
                
                try {
                    // OWNERSHIP: DashboardPage owns WebRTCProvider - call disconnect for cleanup
                    // WebRTCProvider.disconnect() will handle internal WebRTC cleanup
                    console.log('%c[DashboardPage] 👋 Calling provider.disconnect() - DashboardPage owns provider', 'font-weight: bold; color: blue;');
                    await provider.disconnect(selectedPeer, true); // true = isInitiator, but we won't send disconnect message
                    console.log('%c[DashboardPage] 👋 ✅ Disconnect completed before logout', 'font-weight: bold; color: green;');
                } catch (disconnectError) {
                    console.warn('%c[DashboardPage] ⚠️ Error during disconnect before logout:', 'font-weight: bold; color: yellow;', disconnectError);
                    // Continue with logout even if disconnect fails
                }
            } else {
                console.log('%c[DashboardPage] 👋 STEP 1: No active connection to disconnect', 'font-weight: bold; color: blue;');
                console.log('[DashboardPage] 👋 Provider exists:', !!provider, 'Selected peer:', selectedPeer, 'Is connected:', isPeerConnected);
            }
            
            // STEP 2: Send logout message to signaling server so other peers can remove this user
            if (signalingService) {
                console.log('%c[DashboardPage] 👋 STEP 2: Sending logout message to signaling server', 'font-weight: bold; color: orange;');
                console.log('[DashboardPage] 👋 Signaling service exists:', !!signalingService);
                signalingService.sendLogout();
                console.log('%c[DashboardPage] 👋 ✅ Logout message sent to server', 'font-weight: bold; color: green;');
                
                // STEP 2.5: Clean up signaling service state to prevent "already connected" issue
                console.log('%c[DashboardPage] 👋 STEP 2.5: Cleaning up signaling service state', 'font-weight: bold; color: orange;');
                signalingService.cleanup();
                console.log('%c[DashboardPage] 👋 ✅ Signaling service state cleaned up', 'font-weight: bold; color: green;');
            } else {
                console.log('%c[DashboardPage] ⚠️ STEP 2: No signaling service available for logout', 'font-weight: bold; color: yellow;');
            }
            
            // STEP 3: Close WebRTC connection silently (no disconnect message)
            if (provider) {
                console.log('%c[DashboardPage] 👋 STEP 3: Closing WebRTC connection', 'font-weight: bold; color: orange;');
                
                // CRITICAL: Remove event listeners BEFORE destroying provider to prevent delayed events
                console.log('%c[DashboardPage] 👋 STEP 3.1: Removing WebRTC event listeners', 'font-weight: bold; color: orange;');
                try {
                    // Remove stored event handlers
                    const handlers = webRTCEventHandlersRef.current;
                    if (handlers.connection) {
                        provider.removeEventListener('connection', handlers.connection);
                        console.log('%c[DashboardPage] 👋 ✅ Removed connection event listener', 'font-weight: bold; color: green;');
                    }
                    if (handlers.error) {
                        provider.removeEventListener('error', handlers.error);
                        console.log('%c[DashboardPage] 👋 ✅ Removed error event listener', 'font-weight: bold; color: green;');
                    }
                    if (handlers.message) {
                        provider.removeEventListener('message', handlers.message);
                        console.log('%c[DashboardPage] 👋 ✅ Removed message event listener', 'font-weight: bold; color: green;');
                    }
                    if (handlers.stream) {
                        provider.removeEventListener('stream', handlers.stream);
                        console.log('%c[DashboardPage] 👋 ✅ Removed stream event listener', 'font-weight: bold; color: green;');
                    }
                    if (handlers.stateChange) {
                        provider.removeEventListener('stateChange', handlers.stateChange);
                        console.log('%c[DashboardPage] 👋 ✅ Removed stateChange event listener', 'font-weight: bold; color: green;');
                    }
                    if (handlers.track) {
                        provider.removeEventListener('track', handlers.track);
                        console.log('%c[DashboardPage] 👋 ✅ Removed track event listener', 'font-weight: bold; color: green;');
                    }
                    
                    // Clear the stored handlers
                    webRTCEventHandlersRef.current = {
                        connection: null,
                        error: null,
                        message: null,
                        stream: null,
                        stateChange: null,
                        track: null
                    };
                    
                    console.log('%c[DashboardPage] 👋 ✅ All WebRTC event listeners removed', 'font-weight: bold; color: green;');
                } catch (error) {
                    console.warn('%c[DashboardPage] ⚠️ Error removing event listeners:', 'font-weight: bold; color: yellow;', error);
                }
                
                // Now destroy the provider
                console.log('%c[DashboardPage] 👋 STEP 3.2: Destroying WebRTC provider', 'font-weight: bold; color: orange;');
                provider.destroy();
                cleanupStreamsAndSetProviderNull('user_logout');
                console.log('%c[DashboardPage] 👋 ✅ WebRTC connection closed', 'font-weight: bold; color: green;');
            }
            
            // STEP 3.5: Stream cleanup is now handled by cleanupStreamsAndSetProviderNull function
            
            // STEP 4: Reset state and navigate
            console.log('%c[DashboardPage] 👋 STEP 4: Resetting state and navigating', 'font-weight: bold; color: orange;');
            reset();
            localStorage.removeItem('user');
            navigate('/');
            console.log('%c[DashboardPage] 👋 ✅ LOGOUT COMPLETED', 'font-weight: bold; color: green; font-size: 14px;');
            
        } catch (error) {
            console.error('%c[DashboardPage] ❌ Error during logout:', 'font-weight: bold; color: red;', error);
            // Still navigate to login even if reset fails
            localStorage.removeItem('user');
            navigate('/');
        }
    };

    const handleSendMessage = useCallback(async (message) => {
        if (!provider || !selectedPeer) return;
        
        // Debug: Log what message is being sent
        console.group('[DashboardPage] 📤 Sending Message Debug');
        safeLog('Message object:', message);
        safeLog('Message type:', typeof message);
        safeLog('Message keys:', message ? Object.keys(message) : 'no message');
        safeLog('Message content:', message);
        safeLog('Selected peer:', selectedPeer);
        safeLog('Provider exists:', !!provider);
        console.groupEnd();
        
        try {
            await provider.sendMessage(selectedPeer, message);
        } catch (err) {
            console.error('[DashboardPage] Failed to send message:', err);
            setError('Failed to send message');
        }
    }, [provider, selectedPeer]);

    // Media toggle handlers for ConnectionPanel
    const handleToggleAudio = async () => {
        const newAudioState = !isAudioEnabled;
        console.log('%c[DashboardPage] 🔊 AUDIO TOGGLE STARTED (initiator side):', 'font-weight: bold; color: blue;', newAudioState ? 'ENABLE' : 'DISABLE');
        console.log('[DashboardPage] 🔊 Toggle audio requested:', newAudioState);
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                console.log('[DashboardPage] 🔊 No provider available - creating new one for audio');
                const user = userRef.current;
                if (!user) {
                    setError('User not found. Please refresh the page.');
                    return;
                }
                
                currentProvider = new WebRTCProvider({
                    userId: user.id,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302',
                                'stun:stun2.l.google.com:19302',
                                'stun:stun3.l.google.com:19302',
                                'stun:stun4.l.google.com:19302'
                            ]
                        }
                    ]
                });
                
                // Set up event listeners
                setupWebRTCEventListeners(currentProvider);
                
                // Connect to signaling service
                if (signalingService) {
                    currentProvider.setSignalingService(signalingService);
                }
                
                setProvider(currentProvider);
            }
            
            // If no local stream exists and user wants to enable audio, create one
            if (!currentProvider.getLocalStream() && newAudioState) {
                console.log('[DashboardPage] 🔊 No local stream found - creating new stream with audio enabled');
                await currentProvider.initializeLocalMedia({ audio: true, video: false });
                setIsAudioEnabled(true);
                console.log('[DashboardPage] ✅ Local stream created with audio enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (currentProvider.getLocalStream()) {
                console.log('[DashboardPage] 🔊 Using toggleMedia for existing stream');
                await currentProvider.toggleMedia({ audio: newAudioState });
                setIsAudioEnabled(newAudioState);
                console.log(`[DashboardPage] ✅ Audio toggled to: ${newAudioState}`);
            } else {
                console.log('[DashboardPage] 🔒 No local stream and not enabling audio - nothing to do');
            }
        } catch (err) {
            console.error('[DashboardPage] Audio toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                setError('Microphone access denied. Please allow microphone permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                setError('Microphone is in use by another application. Please close other apps using the microphone and try again.');
            } else {
                setError('Failed to access microphone. Please check your microphone permissions and try again.');
            }
        }
    };

    const handleToggleVideo = async () => {
        const newVideoState = !isVideoEnabled;
        console.log('%c[DashboardPage] 📹 VIDEO TOGGLE STARTED (initiator side):', 'font-weight: bold; color: purple;', newVideoState ? 'ENABLE' : 'DISABLE');
        console.log('[DashboardPage] 📹 Toggle video requested:', newVideoState);
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                console.log('[DashboardPage] 📹 No provider available - creating new one for video');
                const user = userRef.current;
                if (!user) {
                    setError('User not found. Please refresh the page.');
                    return;
                }
                
                currentProvider = new WebRTCProvider({
                    userId: user.id,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302',
                                'stun:stun2.l.google.com:19302',
                                'stun:stun3.l.google.com:19302',
                                'stun:stun4.l.google.com:19302'
                            ]
                        }
                    ]
                });
                
                // Set up event listeners
                setupWebRTCEventListeners(currentProvider);
                
                // Connect to signaling service
                if (signalingService) {
                    currentProvider.setSignalingService(signalingService);
                }
                
                setProvider(currentProvider);
            }
            
            // If no local stream exists and user wants to enable video, create one
            if (!currentProvider.getLocalStream() && newVideoState) {
                console.log('[DashboardPage] 📹 No local stream found - creating new stream with video enabled');
                await currentProvider.initializeLocalMedia({ audio: false, video: true });
                setIsVideoEnabled(true);
                console.log('[DashboardPage] ✅ Local stream created with video enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (currentProvider.getLocalStream()) {
                console.log('[DashboardPage] 📹 Using toggleMedia for existing stream');
                await currentProvider.toggleMedia({ video: newVideoState });
                setIsVideoEnabled(newVideoState);
                console.log(`[DashboardPage] ✅ Video toggled to: ${newVideoState}`);
            } else {
                console.log('[DashboardPage] 🔒 No local stream and not enabling video - nothing to do');
            }
        } catch (err) {
            console.error('[DashboardPage] Video toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                setError('Camera access denied. Please allow camera permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                setError('Camera is in use by another application. Please close other apps using the camera and try again.');
            } else {
                setError('Failed to access camera. Please check your camera permissions and try again.');
            }
        }
    };

    const handleToggleScreenShare = async () => {
        const newScreenShareState = !isScreenSharing;
        console.log('%c[DashboardPage] 🖥️ SCREEN SHARE TOGGLE STARTED (initiator side):', 'font-weight: bold; color: orange;', newScreenShareState ? 'ENABLE' : 'DISABLE');
        console.log('[DashboardPage] 🖥️ Toggle screen share requested:', newScreenShareState);
        
        // If enabling screen share, ensure whiteboard background is cleared (mutual exclusivity)
        if (newScreenShareState && isWhiteboardActive) {
            console.log('[DashboardPage] 🖥️ Screen share enabled - whiteboard will clear any background files');
        }
        
        // Clear image if screen share becomes active (mutual exclusivity)
        if (newScreenShareState && isImageActive) {
            console.log('[DashboardPage] 🖥️ Clearing image due to screen share activation');
            setIsImageActive(false);
            setCurrentImageUrl(null);
        }
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                console.log('[DashboardPage] 🖥️ No provider available - creating new one for screen share');
                const user = userRef.current;
                if (!user) {
                    setError('User not found. Please refresh the page.');
                    return;
                }
                
                currentProvider = new WebRTCProvider({
                    userId: user.id,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun.l.google.com:19302',
                                'stun:stun1.l.google.com:19302',
                                'stun:stun2.l.google.com:19302',
                                'stun:stun3.l.google.com:19302',
                                'stun:stun4.l.google.com:19302'
                            ]
                        }
                    ]
                });
                
                // Set up event listeners
                setupWebRTCEventListeners(currentProvider);
                
                // Connect to signaling service
                if (signalingService) {
                    currentProvider.setSignalingService(signalingService);
                }
                
                setProvider(currentProvider);
            }
            
            if (newScreenShareState) {
                // Start screen sharing
                console.log('[DashboardPage] 🖥️ Starting screen share...');
                await currentProvider.startScreenShare();
                setIsScreenSharing(true);
                console.log('[DashboardPage] ✅ Screen share started');
            } else {
                // Stop screen sharing
                console.log('[DashboardPage] 🖥️ Stopping screen share...');
                await currentProvider.stopScreenShare();
                setIsScreenSharing(false);
                console.log('[DashboardPage] ✅ Screen share stopped');
            }
        } catch (err) {
            console.error('[DashboardPage] Screen share toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                setError('Screen sharing access denied. Please allow screen sharing permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                setError('Screen sharing is in use by another application. Please close other apps using screen sharing and try again.');
            } else {
                setError('Failed to start screen sharing. Please check your permissions and try again.');
            }
        }
    };

    const handleToggleWhiteboard = () => {
        const newWhiteboardState = !isWhiteboardActive;
        console.log('%c[DashboardPage] 🎨 WHITEBOARD TOGGLE STARTED:', 'font-weight: bold; color: purple;', newWhiteboardState ? 'ENABLE' : 'DISABLE');
        
        // If enabling whiteboard, stop screen share first (mutual exclusivity)
        if (newWhiteboardState && isScreenSharing) {
            console.log('[DashboardPage] 🎨 Stopping screen share before opening whiteboard');
            handleToggleScreenShare();
        }
        
        setIsWhiteboardActive(newWhiteboardState);
        console.log('[DashboardPage] ✅ Whiteboard state updated:', newWhiteboardState);
    };

    // Whiteboard toolbar handlers
    const handleToolChange = (tool) => {
        console.log('[DashboardPage] 🎨 Tool changed to:', tool);
        setCurrentTool(tool);
    };

    const handleColorChange = (color) => {
        console.log('[DashboardPage] 🎨 Color changed to:', color);
        setCurrentColor(color);
    };

    const handleWhiteboardUndo = () => {
        console.log('[DashboardPage] 🎨 Undo requested');
        console.log('[DashboardPage] Undo ref:', { hasRef: !!whiteboardUndoRef.current, ref: whiteboardUndoRef.current });
        if (whiteboardUndoRef.current) {
            console.log('[DashboardPage] Calling undo function');
            whiteboardUndoRef.current();
        } else {
            console.log('[DashboardPage] No undo function available');
        }
    };

    const handleWhiteboardRedo = () => {
        console.log('[DashboardPage] 🎨 Redo requested');
        console.log('[DashboardPage] Redo ref:', { hasRef: !!whiteboardRedoRef.current, ref: whiteboardRedoRef.current });
        if (whiteboardRedoRef.current) {
            console.log('[DashboardPage] Calling redo function');
            whiteboardRedoRef.current();
        } else {
            console.log('[DashboardPage] No redo function available');
        }
    };

    const handleWhiteboardHistoryChange = useCallback((historyState) => {
        console.log('[DashboardPage] 🎨 History changed:', historyState);
        setCanUndo(historyState.canUndo);
        setCanRedo(historyState.canRedo);
    }, []);

    const handleImageChange = (imageUrl) => {
        console.log('[DashboardPage] 🎨 Image changed:', imageUrl);
        setCurrentImageUrl(imageUrl);
        setIsImageActive(true);
        
        // Clear screen share if image becomes active (mutual exclusivity)
        if (isScreenShareActive) {
            console.log('[DashboardPage] 🎨 Clearing screen share due to image activation');
            setIsScreenShareActive(false);
        }
    };

    const handleImageSizeChange = (newSize) => {
        console.log('[DashboardPage] 🎨 Image size changed:', newSize);
        setDynamicContainerSize(newSize);
    };

    const handleWhiteboardImageUpload = (event) => {
        console.log('[DashboardPage] 🎨 Image upload requested');
        console.log('[DashboardPage] 🎨 File:', event.target.files[0]);
        // Pass the file directly to the Whiteboard component
        if (whiteboardImageUploadRef.current && typeof whiteboardImageUploadRef.current.handleImageUpload === 'function') {
            whiteboardImageUploadRef.current.handleImageUpload(event);
        } else {
            console.error('[DashboardPage] 🎨 Ref not available or handleImageUpload not a function');
        }
    };

    const handleWhiteboardFileUpload = (event) => {
        console.log('[DashboardPage] 🎨 File upload requested');
        // The whiteboard component will handle the actual upload logic
    };

    const handleWhiteboardClear = () => {
        console.log('[DashboardPage] 🎨 Clear requested');
        // The whiteboard component will handle the actual clear logic
    };


    const resetConnectionState = () => {
        console.log('[DashboardPage] 🔄 RESET: Starting connection state reset');
        
        // Reset connection states
        setIsPeerConnected(false);
        setIsConnecting(false);
        setShowChat(false);
        setError(null);
        
        // Clear peer selection when resetting - this prevents UI inconsistency
        // when a peer logs out without explicitly disconnecting
        clearSelectedPeer('connection_state_reset');
        
        // Clear disconnected peer tracking
        disconnectedPeerRef.current = null;
        
        // Stream cleanup is now handled by cleanupStreamsAndSetProviderNull function when provider is destroyed
        
        console.log('[DashboardPage] 🔄 RESET: Connection state reset completed - peer selection and session cleared');
        console.log('[DashboardPage] 🔄 RESET: UI should now show logged-in state (no disconnect buttons)');
    };

    const resetPeerManagement = () => {
        console.log('[DashboardPage] 🔄 RESET: Starting peer management reset');
        
        // DON'T clear peer list - keep it available for reconnection
        // setPeerList([]); // REMOVED - peers should remain available
        
        // Clear received messages
        setReceivedMessages([]);
        
        // Clear message handler
        if (messageHandlerRef.current) {
            signalingService.removeMessageHandler(messageHandlerRef.current);
            messageHandlerRef.current = null;
        }
        
        console.log('[DashboardPage] 🔄 RESET: Peer management reset completed - peer list preserved');
    };

    const resetUIState = () => {
        console.log('[DashboardPage] 🔄 RESET: Starting UI state reset');
        
        // Reset all UI-related states to initial values
        setShowChat(false);
        setError(null);
        setReceivedMessages([]);
        
        // Reset media states to initial values
        setIsAudioEnabled(false);
        setIsVideoEnabled(false);
        setIsScreenSharing(false);
        setIsWhiteboardActive(false);
        
        // Don't reset isGracefulDisconnect here - let it persist for connection state handler
        // It will be reset when starting a new connection
        
        console.log('[DashboardPage] 🔄 RESET: UI state reset completed');
    };

    const reset = () => {
        console.log('[DashboardPage] 🔄 RESET: Starting complete dashboard reset');
        
        try {
            // Reset in order: connection state → peer management → UI state
            resetConnectionState();
            resetPeerManagement();
            resetUIState();
            
            console.log('[DashboardPage] 🔄 RESET: Complete dashboard reset successful');
        } catch (error) {
            console.error('[DashboardPage] ❌ RESET: Error during reset:', error);
            throw error;
        }
    };

    if (!userEmail) return null;

    console.log('[DashboardPage] 🔄 Parent component is re-rendering');
    
    // Debug: Log all state variables to identify what's changing
    console.log('[DashboardPage] 🔍 State values:', JSON.stringify({
      isWebSocketConnected,
      isPeerConnected,
      userEmail,
      provider: !!provider,
      selectedPeer,
      isConnecting,
      peerList: peerList.length,
      showChat,
      error,
      isGracefulDisconnect,
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
      isScreenShareSupported,
      isWhiteboardActive,
      currentTool,
      currentColor,
      canUndo,
      canRedo,
      receivedMessages: receivedMessages.length
    }, null, 2));

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
            {/* Connection Panel - First direct child of dashboard container */}
            <ConnectionPanel
                selectedPeer={selectedPeer}
                onPeerSelect={setSelectedPeer}
                isConnected={isPeerConnected}
                isConnecting={isConnecting}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onLogout={handleLogout}
                peerList={peerList}
                loginStatus={isWebSocketConnected ? 'connected' : 'failed'}
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing}
                isScreenShareSupported={isScreenShareSupported}
                isWhiteboardActive={isWhiteboardActive}
                onToggleAudio={handleToggleAudio}
                onToggleVideo={handleToggleVideo}
                onToggleScreenShare={handleToggleScreenShare}
                onToggleWhiteboard={handleToggleWhiteboard}
            />
            
            <div className="dashboard-header">
                <h1>Video xyz Dashboard</h1>
                <div className="user-actions">
                    <ConnectionStatusLight isConnected={isWebSocketConnected} />
                    <span className="user-email">{userEmail}</span>
                    {/* Debug Icon */}
                    <button 
                        className="debug-icon" 
                        onClick={showDebugInfo}
                        title="Show Debug Info"
                    >
                        🔍
                    </button>
                </div>
                <div className="build-info">
                    <span className="build-version">{getBuildDisplay()}</span>
                </div>
            </div>
            {/* Video Chat - Movable, outside dashboard-content */}
            <VideoChat
                key={videoChatKey} // Force re-render when key changes
                selectedPeer={selectedPeer}
                onPeerSelect={setSelectedPeer}
                isConnected={isPeerConnected}
                isConnecting={isConnecting}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onLogout={handleLogout}
                peerList={peerList}
                loginStatus={isWebSocketConnected ? 'connected' : 'failed'}
                showChat={showChat}
                onSendMessage={handleSendMessage}
                receivedMessages={receivedMessages}
                error={error}
                user={userRef.current}
                provider={provider}
            />
            
            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}
            
            {/* Whiteboard Toolbar - Outside dashboard-content, below connection panel */}
            {isWhiteboardActive && (
                <WhiteboardToolbar
                    userId={userRef.current?.id}
                    username={userRef.current?.name || userEmail}
                    isScreenShareActive={isScreenShareActive}
                    onToolChange={handleToolChange}
                    onColorChange={handleColorChange}
                    onUndo={handleWhiteboardUndo}
                    onRedo={handleWhiteboardRedo}
                    onImageUpload={handleWhiteboardImageUpload}
                    onFileUpload={handleWhiteboardFileUpload}
                    onClear={handleWhiteboardClear}
                    currentTool={currentTool}
                    currentColor={currentColor}
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            )}
            
            <div className="dashboard-content">
                
                {/* Screen Share Window - Inside dashboard-content, same space as drawing surface */}
                <ScreenShareWindow
                    key="screen-share-stable"
                    screenShareStream={provider?.getScreenShareStream() || provider?.getRemoteScreen(selectedPeer)}
                    isVisible={isScreenSharing || !!(provider?.getScreenShareStream() || provider?.getRemoteScreen(selectedPeer))}
                    position={{ top: '0', left: '0' }}
                    size={{ width: '1200px', height: '800px' }}
                    onStreamChange={(stream) => {
                        console.log('[DashboardPage] 🖥️ Screen share stream change notified:', stream?.id);
                    }}
                    debugMode={true}
                    useRelativePositioning={true}
                />
                
                {/* Image Display Window - Same position as screen share */}
                <ImageDisplayWindow
                    key="image-display-stable"
                    imageUrl={currentImageUrl}
                    isVisible={isImageActive}
                    size={dynamicContainerSize}
                    onSizeChange={handleImageSizeChange}
                />

                {/* Whiteboard Component */}
               {console.log('[DashboardPage] 🔍 Is whiteboard active?', isWhiteboardActive)}
               {console.log('[DashboardPage] 🔍 Screen share detection debug:', {
                 isScreenSharing,
                 hasLocalScreenShare: !!provider?.getScreenShareStream(),
                 selectedPeer,
                 hasRemoteScreen: !!provider?.getRemoteScreen(selectedPeer),
                 isScreenShareActiveState: isScreenShareActive
               })}
               {isWhiteboardActive && (
                   <Whiteboard
                       key="whiteboard-stable"
                       userId={userRef.current?.id}
                       username={userRef.current?.name || userEmail}
                       screenShareStream={null}
                       isScreenShareActive={isScreenShareActive}
                       isImageActive={isImageActive}
                       currentImageUrl={currentImageUrl}
                       containerSize={dynamicContainerSize}
                       onClose={handleWhiteboardClose}
                       onBackgroundCleared={handleWhiteboardBackgroundCleared}
                       onImageChange={handleImageChange}
                       webRTCProvider={provider}
                       selectedPeer={selectedPeer}
                       currentTool={currentTool}
                       currentColor={currentColor}
                       onToolChange={handleToolChange}
                       onColorChange={handleColorChange}
                       onUndo={whiteboardUndoRef}
                       onRedo={whiteboardRedoRef}
                       onHistoryChange={handleWhiteboardHistoryChange}
                       onImageUpload={handleWhiteboardImageUpload}
                       onFileUpload={handleWhiteboardFileUpload}
                       onClear={handleWhiteboardClear}
                       canUndo={canUndo}
                       canRedo={canRedo}
                       ref={whiteboardImageUploadRef}
                   />
               )}
            </div>
            
            
            {/* Debug Popup */}
            {showDebugPopup && (
                <div className="debug-popup-overlay" onClick={() => setShowDebugPopup(false)}>
                    <div className="debug-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="debug-popup-header">
                            <h3>🔍 Debug Information</h3>
                            <button 
                                className="debug-popup-close" 
                                onClick={() => setShowDebugPopup(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="debug-popup-content">
                            <div className="debug-section">
                                <h4>Viewport</h4>
                                <p>Width: {window.innerWidth}px, Height: {window.innerHeight}px</p>
                            </div>
                            
                            <div className="debug-section">
                                <h4>Dashboard Content</h4>
                                {(() => {
                                    const el = document.querySelector('.dashboard-content');
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        return (
                                            <div>
                                                <p>getBoundingClientRect: {Math.round(rect.width)}px × {Math.round(rect.height)}px</p>
                                                <p>offsetWidth/Height: {el.offsetWidth}px × {el.offsetHeight}px</p>
                                                <p>clientWidth/Height: {el.clientWidth}px × {el.clientHeight}px</p>
                                                <p>Computed Style:</p>
                                                <ul>
                                                    <li>display: {window.getComputedStyle(el).display}</li>
                                                    <li>position: {window.getComputedStyle(el).position}</li>
                                                    <li>width: {window.getComputedStyle(el).width}</li>
                                                    <li>height: {window.getComputedStyle(el).height}</li>
                                                    <li>min-height: {window.getComputedStyle(el).minHeight}</li>
                                                    <li>flex: {window.getComputedStyle(el).flex}</li>
                                                </ul>
                                            </div>
                                        );
                                    }
                                    return <p>❌ Element not found</p>;
                                })()}
                            </div>
                            
                            <div className="debug-section">
                                <h4>Video Chat</h4>
                                {(() => {
                                    const el = document.querySelector('.video-chat');
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        return (
                                            <div>
                                                <p>getBoundingClientRect: {Math.round(rect.width)}px × {Math.round(rect.height)}px</p>
                                                <p>offsetWidth/Height: {el.offsetWidth}px × {el.offsetHeight}px</p>
                                                <p>clientWidth/Height: {el.clientWidth}px × {el.clientHeight}px</p>
                                                <p>Computed Style:</p>
                                                <ul>
                                                    <li>display: {window.getComputedStyle(el).display}</li>
                                                    <li>position: {window.getComputedStyle(el).position}</li>
                                                    <li>width: {window.getComputedStyle(el).width}</li>
                                                    <li>height: {window.getComputedStyle(el).height}</li>
                                                    <li>min-height: {window.getComputedStyle(el).minHeight}</li>
                                                    <li>margin: {window.getComputedStyle(el).margin}</li>
                                                </ul>
                                            </div>
                                        );
                                    }
                                    return <p>❌ Element not found</p>;
                                })()}
                            </div>
                            
                            <div className="debug-section">
                                <h4>Video Container</h4>
                                {(() => {
                                    const el = document.querySelector('.video-container');
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        return (
                                            <div>
                                                <p>getBoundingClientRect: {Math.round(rect.width)}px × {Math.round(rect.height)}px</p>
                                                <p>offsetWidth/Height: {el.offsetWidth}px × {el.offsetHeight}px</p>
                                                <p>clientWidth/Height: {el.clientWidth}px × {el.clientHeight}px</p>
                                                <p>Computed Style:</p>
                                                <ul>
                                                    <li>display: {window.getComputedStyle(el).display}</li>
                                                    <li>position: {window.getComputedStyle(el).position}</li>
                                                    <li>width: {window.getComputedStyle(el).width}</li>
                                                    <li>height: {window.getComputedStyle(el).height}</li>
                                                </ul>
                                            </div>
                                        );
                                    }
                                    return <p>❌ Element not found</p>;
                                })()}
                            </div>
                            
                                                         <div className="debug-section">
                                 <h4>Video Streams</h4>
                                 {(() => {
                                     const videoStreams = getVideoStreamDimensions();
                                     if (videoStreams.length === 0) {
                                         return <p>❌ No video elements found</p>;
                                     }
                                     
                                     return videoStreams.map((stream, index) => (
                                         <div key={index} style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
                                             <h5>Video Element {index + 1}</h5>
                                             <ul>
                                                 <li><strong>Stream:</strong> {stream.srcObject}</li>
                                                 <li><strong>Video Dimensions:</strong> {stream.videoWidth} × {stream.videoHeight}</li>
                                                 <li><strong>Display Dimensions:</strong> {stream.displayWidth} × {stream.displayHeight}</li>
                                                 <li><strong>Aspect Ratio:</strong> {stream.aspectRatio}</li>
                                                 <li><strong>Paused:</strong> {stream.paused ? '✅' : '❌'}</li>
                                                 <li><strong>Current Time:</strong> {stream.currentTime.toFixed(2)}s</li>
                                                 <li><strong>Duration:</strong> {stream.duration.toFixed(2)}s</li>
                                                 {stream.tracks && stream.tracks.length > 0 && (
                                                     <li>
                                                         <strong>Tracks:</strong>
                                                         <ul>
                                                             {stream.tracks.map((track, trackIndex) => (
                                                                 <li key={trackIndex}>
                                                                     {track.kind}: {track.enabled ? '✅' : '❌'} ({track.readyState})
                                                                     {track.settings && typeof track.settings === 'object' && (
                                                                         <div style={{ marginLeft: '1rem', fontSize: '0.8em' }}>
                                                                             {Object.entries(track.settings).map(([key, value]) => (
                                                                                 <div key={key}>{key}: {value}</div>
                                                                             ))}
                                                                         </div>
                                                                     )}
                                                                 </li>
                                                             ))}
                                                         </ul>
                                                     </li>
                                                 )}
                                             </ul>
                                         </div>
                                     ));
                                 })()}
                             </div>
                             
                             <div className="debug-section">
                                 <h4>State</h4>
                                 <ul>
                                     <li>isPeerConnected: {isPeerConnected ? '✅' : '❌'}</li>
                                     <li>isConnecting: {isConnecting ? '✅' : '❌'}</li>
                                     <li>isAudioEnabled: {isAudioEnabled ? '✅' : '❌'}</li>
                                     <li>isVideoEnabled: {isVideoEnabled ? '✅' : '❌'}</li>
                                     <li>isScreenSharing: {isScreenSharing ? '✅' : '❌'}</li>
                                 </ul>
                             </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Chat Panel - Last element under dashboard-container */}
            {showChat && (
                <ChatPanel
                    user={{ id: userRef.current?.id, name: userRef.current?.name || userEmail }}
                    provider={provider}
                    onSendMessage={handleSendMessage}
                    receivedMessages={receivedMessages}
                />
            )}
        </div>
    );
};

export default DashboardPage; 