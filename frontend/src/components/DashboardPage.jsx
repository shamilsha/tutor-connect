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
import PDFNavigation from './PDFNavigation';
import '../styles/DashboardPage.css';
import { useCommunication } from '../context/CommunicationContext';
import { WebSocketProvider } from '../services/WebSocketProvider';
import { getBuildDisplay } from '../utils/buildVersion';

// Logging system
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, VERBOSE: 4 };
const LOG_LEVEL = process.env.REACT_APP_LOG_LEVEL || 'INFO';

const log = (level, component, message, data = null) => {
  if (LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL]) {
    const prefix = `[${component}] ${level}:`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
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
                log('WARN', 'DashboardPage', 'WebRTC not fully supported on this device');
                setError('Your browser does not fully support video calling features. Some features may not work properly.');
            } else {
                log('INFO', 'DashboardPage', 'WebRTC is supported on this device');
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
    
    // PDF Navigation state
    const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
    const [pdfTotalPages, setPdfTotalPages] = useState(0);
    const [pdfScale, setPdfScale] = useState(1);
    const [showPdfNavigation, setShowPdfNavigation] = useState(false);
    const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
    
    // Whiteboard toolbar state
    const [currentTool, setCurrentTool] = useState(null);
    const [currentColor, setCurrentColor] = useState('#000000');
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState(null);
    const currentImageUrlRef = useRef(null);
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
        log('INFO', 'DashboardPage', 'Background file cleared from whiteboard');
    }, []);
    
    // PDF Navigation handlers
    const handlePdfPageChange = useCallback((page) => {
        log('INFO', 'DashboardPage', 'PDF page changed to', { page });
        setPdfCurrentPage(page);
    }, []);
    
    const handlePdfZoomIn = useCallback(() => {
        setPdfScale(prev => Math.min(prev + 0.1, 3.0));
    }, []);
    
    const handlePdfZoomOut = useCallback(() => {
        setPdfScale(prev => Math.max(prev - 0.1, 0.5));
    }, []);
    
    const handlePdfZoomReset = useCallback(() => {
        setPdfScale(1);
    }, []);
    
    const handlePdfPagesChange = useCallback((totalPages) => {
        log('INFO', 'DashboardPage', 'PDF total pages changed to', { totalPages });
        setPdfTotalPages(totalPages);
        setShowPdfNavigation(totalPages > 0);
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
            log('DEBUG', 'DashboardPage', 'State changes detected', { changedStates });
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
            log('WARN', 'DashboardPage', 'CLEARING SELECTED PEER', { selectedPeer, reason });
            // Save selectedPeer with timestamp before clearing it for logout detection
            disconnectedPeerRef.current = {
                peerId: selectedPeer,
                timestamp: Date.now()
            };
            setSelectedPeer('');
            log('INFO', 'DashboardPage', 'SELECTED PEER SAVED FOR LOGOUT DETECTION', { disconnectedPeer: disconnectedPeerRef.current });
        }
    };

    // Function to properly clean up streams before setting provider to null
    const cleanupStreamsAndSetProviderNull = (reason = 'unknown') => {
        const userFriendlyReason = getLogoutReasonMessage(reason);
        log('WARN', 'DashboardPage', 'STREAM CLEANUP', { reason: userFriendlyReason });
        
        try {
            // Check if provider exists and has streams
            if (provider) {
                log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Provider exists, checking for streams');
                
                // Try to get local streams from provider if possible
                try {
                    const localVideoStream = provider.getLocalVideoStream();
                    const localAudioStream = provider.getLocalAudioStream();
                    const localScreenStream = provider.getLocalScreenStream();
                    
                    if (localVideoStream) {
                        log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopping local video stream');
                        localVideoStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopped local video track');
                            } catch (trackError) {
                                log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Video track already stopped (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                            }
                        });
                    }
                    
                    if (localAudioStream) {
                        log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopping local audio stream');
                        localAudioStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopped local audio track');
                            } catch (trackError) {
                                log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Audio track already stopped (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                            }
                        });
                    }
                    
                    if (localScreenStream) {
                        log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopping local screen stream');
                        localScreenStream.getTracks().forEach(track => {
                            try {
                                track.stop();
                                log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopped local screen track');
                            } catch (trackError) {
                                log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Screen track already stopped (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                            }
                        });
                    }
                } catch (error) {
                    log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Provider streams already cleaned up (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                }
            }
            
            // Clean up all video elements
            try {
                const videoElements = document.querySelectorAll('video');
                videoElements.forEach((video, index) => {
                    if (video.srcObject) {
                        log('WARN', 'DashboardPage', 'STREAM CLEANUP: Clearing video element', { index });
                        try {
                            const stream = video.srcObject;
                            if (stream && stream.getTracks) {
                                stream.getTracks().forEach(track => {
                                    try {
                                        track.stop();
                                        log('WARN', 'DashboardPage', 'STREAM CLEANUP: Stopped track', { kind: track.kind });
                                    } catch (trackError) {
                                        log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Track already stopped (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                                    }
                                });
                            }
                            video.srcObject = null;
                        } catch (videoError) {
                            log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Video element already cleared (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
                        }
                    }
                });
            } catch (videoCleanupError) {
                log('DEBUG', 'DashboardPage', 'STREAM CLEANUP: Video elements already cleaned up (normal during cleanup)', { reason: userFriendlyReason.toLowerCase() });
            }
            
            log('INFO', 'DashboardPage', 'STREAM CLEANUP completed successfully', { reason: userFriendlyReason });
            setProvider(null);
            
        } catch (error) {
            log('INFO', 'DashboardPage', 'STREAM CLEANUP completed with minor cleanup issues (this is normal)', { reason: userFriendlyReason });
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
        log('WARN', 'DashboardPage', 'PEER LOGOUT DETECTED', { loggedOutPeerId });
        
        // Clear the saved peer since we've detected and handled the logout
        disconnectedPeerRef.current = null;
        handledLogoutPeersRef.current.add(loggedOutPeerId);
        log('INFO', 'DashboardPage', 'CLEARED SAVED PEER after logout detection');
        log('INFO', 'DashboardPage', 'MARKED PEER as logout handled', { loggedOutPeerId });
        
        // Debug: Check provider state
        log('DEBUG', 'DashboardPage', 'DEBUG: Provider state during logout', {
            provider: provider,
            providerExists: !!provider,
            providerType: typeof provider
        });
        
        // Disconnect gracefully from the logged out peer
        if (provider) {
            log('INFO', 'DashboardPage', 'Disconnecting from logged out peer', { loggedOutPeerId });
            
            // Use existing disconnect logic but don't send disconnect message
            // The other peer already logged out, so no need to notify them
            try {
                provider.destroy();
                cleanupStreamsAndSetProviderNull('logout_disconnect');
                reset();
                log('INFO', 'DashboardPage', 'Graceful disconnect from logged out peer completed');
            } catch (error) {
                log('WARN', 'DashboardPage', 'Error during logout disconnect', error);
                // Still reset the UI even if disconnect fails
                cleanupStreamsAndSetProviderNull('logout_disconnect_error');
                reset();
            }
        } else {
            log('INFO', 'DashboardPage', 'No provider to disconnect, but ensuring proper cleanup for logged out peer', { loggedOutPeerId });
            
            // CRITICAL: Even without provider, we need to ensure proper disconnect flow
            // The WebRTC connection might have been cleaned up already, but we still need to
            // trigger the proper disconnect sequence to clean up any remaining state
            log('WARN', 'DashboardPage', 'FORCING DISCONNECT FLOW: Calling performDisconnect for logged out peer');
            try {
                // Call the disconnect method directly to ensure proper cleanup
                await performDisconnect(false); // false = responder side (we're responding to peer logout)
                log('INFO', 'DashboardPage', 'FORCED DISCONNECT COMPLETED for logged out peer');
            } catch (error) {
                log('WARN', 'DashboardPage', 'Error during forced disconnect for logged out peer', error);
                // Still reset the UI even if forced disconnect fails
                reset();
            }
        }
        
        // Stream cleanup is now handled by cleanupStreamsAndSetProviderNull function when provider is destroyed
        
        // FALLBACK: Always ensure UI is reset after logout detection
        log('WARN', 'DashboardPage', 'FALLBACK: Ensuring UI reset after logout detection');
        setTimeout(() => {
            if (isPeerConnected || isConnecting) {
                log('WARN', 'DashboardPage', 'FALLBACK: UI still shows connected state, forcing reset');
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
                log('INFO', 'DashboardPage', 'Destroying provider instance');
                providerInstance.destroy();
                // Add a small delay to ensure the destroy operation completes
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                log('WARN', 'DashboardPage', 'Error destroying provider', error);
            }
        }
    };

    // Cleanup provider when provider state changes
    useEffect(() => {
        return () => {
            if (provider) {
                log('INFO', 'DashboardPage', 'Cleaning up WebRTC provider on provider change');
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
            
            log('DEBUG', 'DashboardPage', 'Screen share support check', {
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
        log('INFO', 'DashboardPage', 'Component mounted');
        log('INFO', 'DashboardPage', 'Build version', { version: getBuildDisplay() });

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
                log('INFO', 'DashboardPage', 'WebSocket is already connected, setting status to connected');
                setIsWebSocketConnected(true);
                setError(null);
            } else {
                // Connect WebSocket if not already connected
                wsProvider.connect().catch(error => {
                    log('ERROR', 'DashboardPage', 'Failed to connect to WebSocket', error);
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
            log('INFO', 'DashboardPage', 'Component unmounting, performing cleanup');
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
        log('WARN', 'DashboardPage', 'CONNECTED PEER REMOVED - Peer no longer available', {
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
        log('INFO', 'DashboardPage', 'SETTING GRACEFUL DISCONNECT FLAG for peer logout');
        setIsGracefulDisconnect(true);
        
        // Disconnect gracefully from the logged-out peer
        if (provider) {
            log('WARN', 'DashboardPage', 'DISCONNECTING from logged-out peer (responder side)');
            try {
                // OWNERSHIP: DashboardPage owns WebRTCProvider - call disconnect for cleanup
                log('INFO', 'DashboardPage', 'Calling provider.disconnect() - DashboardPage owns provider');
                provider.disconnect(removedPeerId, false); // false = not initiator, use detected peer
                log('INFO', 'DashboardPage', 'Disconnect from logged-out peer completed');
            } catch (error) {
                log('WARN', 'DashboardPage', 'Error disconnecting from logged-out peer', error);
            }
        } else {
            log('INFO', 'DashboardPage', 'No provider available for disconnect (peer already logged out)');
        }
        
        // Reset to logged-in state
        log('INFO', 'DashboardPage', 'RESETTING TO LOGGED-IN STATE after peer logout');
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
        
        log('INFO', 'DashboardPage', 'Successfully returned to logged-in state after peer logout');
    };

    // Define handlePeerListUpdate outside useEffect so it can be accessed by other functions
    const handlePeerListUpdate = async (peers) => {
        const user = userRef.current;
        if (!user) {
            log('WARN', 'DashboardPage', 'No user data available for peer list handler');
            return;
        }

        log('INFO', 'DashboardPage', 'PEER LIST UPDATE RECEIVED', {
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

        log('DEBUG', 'DashboardPage', 'FILTERED PEER LIST', {
            filteredPeers: filteredPeers,
            currentUser: user.id
        });
        
        // Check if we have a recently cleared selectedPeer that might indicate logout
        if (disconnectedPeerRef.current) {
            const { peerId, timestamp } = disconnectedPeerRef.current;
            const timeSinceCleared = Date.now() - timestamp;
            
            // If within 2 seconds and peer is not in the updated list = logout
            if (timeSinceCleared <= 2000 && !filteredPeers.some(p => p.id === peerId)) {
                log('WARN', 'DashboardPage', 'PEER LOGGED OUT (detected within timeout)', { peerId, timeSinceCleared });
                await handlePeerLogout(peerId);
                // Note: handlePeerLogout() will clear disconnectedPeerRef.current
            } else if (timeSinceCleared > 2000) {
                // More than 2 seconds = just a normal disconnect, clear the ref
                log('INFO', 'DashboardPage', 'Normal disconnect detected', { timeSinceCleared });
                disconnectedPeerRef.current = null;
            }
        }
        
        // Check if current selectedPeer is missing from updated list (immediate logout detection)
        if (selectedPeer && !filteredPeers.some(p => p.id === selectedPeer)) {
            log('WARN', 'DashboardPage', 'CONNECTED PEER LOGGED OUT (immediate detection)', { selectedPeer });
            await handlePeerLogout(selectedPeer);
        }
        
        // Update the peer list
        setPeerList(filteredPeers);
    };

    // Set up peer list handler - separate effect to avoid re-runs
    useEffect(() => {
        const user = userRef.current;
        if (!user) {
            log('WARN', 'DashboardPage', 'No user data available for peer list handler');
            return;
        }

        log('INFO', 'DashboardPage', 'Setting up peer list handler for user', { userId: user.id });

        // Set up handlers in signaling service
        if (signalingService) {
            log('INFO', 'DashboardPage', 'Registering peer list handler with signaling service');
            signalingService.onPeerListUpdate = handlePeerListUpdate;
            
            // Set up incoming connection handler
            signalingService.onIncomingConnection = async (message) => {
                log('INFO', 'DashboardPage', 'CONNECT RECEIVED from peer (responder side)', { from: message.from });
                log('INFO', 'DashboardPage', 'Incoming connection detected', { type: message.type, from: message.from });
                
                // Always create a fresh WebRTC provider for incoming connections
                if (message.type === 'initiate') {
                    try {
                        log('INFO', 'DashboardPage', 'Creating fresh WebRTC provider for incoming connection');
                        
                        // Prevent multiple simultaneous provider creation
                        if (isCreatingProvider) {
                            log('INFO', 'DashboardPage', 'Provider creation already in progress for incoming connection, skipping');
                            return;
                        }
                        
                        // Set connecting state for incoming connection
                        setIsConnecting(true);
                        setError(null);
                        setIsCreatingProvider(true);
                        setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection
                        
                        // Destroy any existing provider first to ensure clean state
                        if (provider) {
                            log('INFO', 'DashboardPage', 'Destroying existing provider before creating new one for incoming connection');
                            
                            // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                            try {
                                log('INFO', 'DashboardPage', 'DashboardPage managing WebRTCProvider cleanup');
                                
                                // DashboardPage removes the message handler (it owns the provider)
                                if (signalingService) {
                                    const handlerId = provider.getMessageHandlerId();
                                    if (handlerId !== null) {
                                        log('INFO', 'DashboardPage', 'REMOVING HANDLER (DashboardPage owns provider)', { handlerId });
                                        const removed = signalingService.removeMessageHandler(handlerId);
                                        log('INFO', 'DashboardPage', 'HANDLER REMOVAL RESULT', { removed });
                                    }
                                }
                                
                                // Then destroy the provider
                                provider.destroy();
                                // Add a small delay to ensure the destroy operation completes
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } catch (error) {
                                log('WARN', 'DashboardPage', 'Error destroying existing provider for incoming connection', error);
                            }
                        }
                        
                        log('INFO', 'DashboardPage', 'CREATING WEBRTC PROVIDER for incoming connection');
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
                        log('ERROR', 'DashboardPage', 'Error creating provider for incoming connection', error);
                        setIsConnecting(false);
                    } finally {
                        setIsCreatingProvider(false);
                    }
                }
            };
            
            // Set up disconnect message handler
            signalingService.onDisconnectMessage = async (message) => {
                log('WARN', 'DashboardPage', 'DISCONNECT RECEIVED from peer (responder side)', { from: message.from, reason: message.reason });
                
                // Responder side - received disconnect message from peer
                // Don't send disconnect message back, just clean up local resources
                await performDisconnect(false);
            };
            
        } else {
            log('WARN', 'DashboardPage', 'No signaling service available for peer list updates');
        }

        return () => {
            log('INFO', 'DashboardPage', 'Cleaning up peer list handler');
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
            log('INFO', 'DashboardPage', 'Auto-selecting single available peer', { peerId: peerList[0].id });
            setSelectedPeer(peerList[0].id);
        } else if (peerList.length === 0 && selectedPeer) {
            log('INFO', 'DashboardPage', 'No peers available, clearing selected peer');
            clearSelectedPeer('no_peers_available');
        }
    }, [peerList, selectedPeer, isPeerConnected, isConnecting]);

    // WebRTC Provider lifecycle management
    useEffect(() => {
        // Cleanup function to destroy provider when it changes or component unmounts
        return () => {
            if (provider) {
                log('INFO', 'DashboardPage', 'Cleaning up WebRTC provider on unmount/change');
                
                // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                try {
                    log('INFO', 'DashboardPage', 'DashboardPage managing WebRTCProvider cleanup');
                    
                    // DashboardPage removes the message handler (it owns the provider)
                    if (signalingService) {
                        const handlerId = provider.getMessageHandlerId();
                        if (handlerId !== null) {
                            log('INFO', 'DashboardPage', 'REMOVING HANDLER (DashboardPage owns provider)', { handlerId });
                            const removed = signalingService.removeMessageHandler(handlerId);
                            log('INFO', 'DashboardPage', 'HANDLER REMOVAL RESULT', { removed });
                        }
                    }
                    
                    // Then destroy the provider
                    provider.destroy();
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Error during provider cleanup', error);
                }
            }
        };
    }, [provider]); // This effect runs when provider changes or component unmounts




    // Sync media state with WebRTC provider state
    useEffect(() => {
        if (!provider) return;

        const handleStateChange = (event) => {
            const timestamp = Date.now();
            log('DEBUG', 'DashboardPage', 'Received stateChange event from provider', { timestamp, data: event.data });
            
            // Update media state based on provider state
            const newAudioState = provider.getLocalAudioState();
            const newVideoState = provider.getLocalVideoState();
            const newScreenShareState = provider.isScreenSharingActive();
            
            log('DEBUG', 'DashboardPage', 'StateChange updating states', { timestamp, states: {
                audio: newAudioState,
                video: newVideoState,
                screenShare: newScreenShareState,
                currentIsScreenShareActive: isScreenShareActive,
                note: 'Screen share state will be handled by handleStreamChange only'
            }});
            
            setIsAudioEnabled(newAudioState);
            setIsVideoEnabled(newVideoState);
            // Don't update screen share state here - let handleStreamChange handle it
            // setIsScreenSharing(newScreenShareState);
        };

        const handleStreamChange = (event) => {
            const timestamp = Date.now();
            log('DEBUG', 'DashboardPage', 'Received stream event from provider', { timestamp, data: event.data });
            
            // Update screen share active status when streams change
            const hasLocalScreenShare = !!provider.getScreenShareStream();
            const hasRemoteScreenShare = !!provider.getRemoteScreen(selectedPeer);
            
            // Get the current screen sharing state from provider (this should be the source of truth)
            const currentProviderScreenShareState = provider.isScreenSharingActive();
            
            // The new screen share active state should be based on actual streams, not the old state
            const newIsScreenShareActive = hasLocalScreenShare || hasRemoteScreenShare;
            
            log('DEBUG', 'DashboardPage', 'Updating screen share status', { timestamp, status: {
                isScreenSharing,
                hasLocalScreenShare,
                hasRemoteScreenShare,
                selectedPeer,
                currentProviderScreenShareState,
                newIsScreenShareActive,
                currentIsScreenShareActive: isScreenShareActive
            }});
            
            // Separate log for comparison to ensure it's visible
            log('DEBUG', 'DashboardPage', 'COMPARISON', { timestamp, comparison: `${newIsScreenShareActive} !== ${isScreenShareActive} = ${newIsScreenShareActive !== isScreenShareActive}` });
            log('DEBUG', 'DashboardPage', 'VALUES', { timestamp, values: { newIsScreenShareActive, newIsScreenShareActiveType: typeof newIsScreenShareActive, isScreenShareActive, isScreenShareActiveType: typeof isScreenShareActive } });
            
        // Always update the screen share state based on actual stream presence
        if (newIsScreenShareActive !== isScreenShareActive) {
            log('INFO', 'DashboardPage', 'Screen share state changed, updating', { newIsScreenShareActive });
            log('DEBUG', 'DashboardPage', 'CALLING setIsScreenShareActive from handleStreamChange', { newIsScreenShareActive, timestamp });
            setIsScreenShareActive(newIsScreenShareActive);
            
            // Check mutual exclusivity when screen share becomes active (from remote peer)
            if (newIsScreenShareActive) {
                log('INFO', 'DashboardPage', 'Remote screen share detected, checking exclusivity');
                log('DEBUG', 'DashboardPage', 'Current image URL', { currentImageUrl: currentImageUrlRef.current });
                log('INFO', 'DashboardPage', 'TRIGGERING SCREEN SHARE EXCLUSIVITY CHECK');
                checkExclusivity('screenShare', true);
            } else {
                log('INFO', 'DashboardPage', 'Screen share stopped, clearing any existing content');
                // When screen share stops, we don't need to clear anything since it's just stopping
            }
        } else {
            // CRITICAL FIX: Even if state appears unchanged, force update if stream was removed
            // This handles the race condition where isScreenShareActive was already set to false
            if (!newIsScreenShareActive && !hasLocalScreenShare && !hasRemoteScreenShare) {
                log('WARN', 'DashboardPage', 'FORCING screen share state update due to stream removal (race condition fix)');
                log('DEBUG', 'DashboardPage', 'CALLING setIsScreenShareActive(false) from handleStreamChange - FORCED UPDATE', { timestamp });
                setIsScreenShareActive(false);
            } else {
                log('DEBUG', 'DashboardPage', 'Screen share state unchanged, keeping current state');
            }
        }
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
                
                log('DEBUG', 'DashboardPage', 'Measuring elements', {
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
                    log('DEBUG', 'DashboardPage', 'Dashboard Content dimensions', { width, height });
                } else {
                    log('DEBUG', 'DashboardPage', 'Dashboard Content element not found');
                }
                
                if (videoChat) {
                    const rect = videoChat.getBoundingClientRect();
                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);
                    videoChat.setAttribute('data-width', `${width}px`);
                    videoChat.setAttribute('data-height', `${height}px`);
                    log('DEBUG', 'DashboardPage', 'Video Chat dimensions', { width, height });
                } else {
                    log('DEBUG', 'DashboardPage', 'Video Chat element not found - checking all video-chat elements...');
                    const allVideoChats = document.querySelectorAll('.video-chat');
                    log('DEBUG', 'DashboardPage', 'Found video-chat elements', { count: allVideoChats.length });
                    allVideoChats.forEach((el, index) => {
                        log('DEBUG', 'DashboardPage', 'Video-chat element details', { index, details: {
                            className: el.className,
                            id: el.id,
                            visible: el.offsetParent !== null
                        }});
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
        
        log('DEBUG', 'DashboardPage', 'Debug Info', debugInfo);
        setShowDebugPopup(true);
        
        // Auto-hide after 10 seconds
        setTimeout(() => setShowDebugPopup(false), 10000);
    };

    // Helper function to set up WebRTC event listeners
    const setupWebRTCEventListeners = (rtcProvider) => {
        // Connection event listener
        const connectionHandler = (event) => {
            const state = event.data.state;
            log('INFO', 'DashboardPage', 'Connection state changed', { state });
            
            if (state === 'connected') {
                setIsPeerConnected(true);
                setIsConnecting(false);
                setShowChat(true);
                setError(null);
                setIsGracefulDisconnect(false); // Reset graceful disconnect flag on successful connection
                
                // Automatically enable whiteboard when connection is established
                if (!isWhiteboardActive) {
                    log('INFO', 'DashboardPage', 'Auto-enabling whiteboard on connection');
                    setIsWhiteboardActive(true);
                }
                
                // Clear any previous disconnected peer tracking since we have a new connection
                disconnectedPeerRef.current = null;
                handledLogoutPeersRef.current.clear(); // Clear handled logout tracking for new connection
                
        // Send current image state to newly connected peer
        if (currentImageUrlRef.current && provider && selectedPeer) {
            log('INFO', 'DashboardPage', 'Sending current image to newly connected peer', { imageUrl: currentImageUrlRef.current });
            log('INFO', 'DashboardPage', 'SENDING IMAGE TO PEER', { peer: selectedPeer, imageUrl: currentImageUrlRef.current });
            provider.sendWhiteboardMessage(selectedPeer, {
                action: 'background',
                background: {
                    file: currentImageUrlRef.current,
                    type: 'image'
                }
            });
        }
                
                log('INFO', 'DashboardPage', 'CONNECTION ESTABLISHED', {
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
                    log('WARN', 'DashboardPage', 'CONNECTION LOST - Saved peer for logout detection', {
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
                    log('INFO', 'DashboardPage', 'Connection destroying provider for retry', { state });
                    
                    // Check if we've already handled a logout for this peer to prevent duplicate cleanup
                    const isLogoutHandled = selectedPeer && handledLogoutPeersRef.current.has(selectedPeer);
                    if (isLogoutHandled) {
                        log('INFO', 'DashboardPage', 'SKIPPING STREAM CLEANUP - Logout already handled for peer', { selectedPeer });
                    } else {
                        log('INFO', 'DashboardPage', 'PROCEEDING WITH STREAM CLEANUP - No logout detected yet for peer', { selectedPeer });
                        cleanupStreamsAndSetProviderNull(`connection_${state}`); // Clean up streams before setting provider to null
                    }
                    
                    // Only show error message for unexpected disconnections
                    log('INFO', 'DashboardPage', 'CONNECTION STATE CHANGE', { state, isGracefulDisconnect });
                    log('DEBUG', 'DashboardPage', 'DISCONNECT FLAG DEBUG', { flag: isGracefulDisconnect, state });
                    
                    if (state === 'failed') {
                        // Failed connections are always unexpected
                        log('WARN', 'DashboardPage', 'Failed connection - showing error message');
                        setError('Connection failed. This may be due to network issues or firewall restrictions. Please try reconnecting.');
                    } else if (state === 'disconnected' && !isGracefulDisconnect) {
                        // Only show "Connection lost" for unexpected disconnections
                        log('WARN', 'DashboardPage', 'Unexpected disconnect - showing error message');
                        setError('Connection lost. Please try reconnecting.');
                    } else if (state === 'disconnected' && isGracefulDisconnect) {
                        // Graceful disconnect - clear any existing error and don't show new error
                        log('INFO', 'DashboardPage', 'Graceful disconnect detected - not showing error message');
                        setError(null);
                    }
                }
            }
        };
        
        // Store the connection handler
        webRTCEventHandlersRef.current.connection = connectionHandler;
        rtcProvider.addEventListener('connection', connectionHandler);

        const errorHandler = (event) => {
            log('ERROR', 'DashboardPage', 'WebRTC error', event.data);
            
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
            log('DEBUG', 'DashboardPage', 'Message Event Debug');
            log('DEBUG', 'DashboardPage', 'Event type', { eventType: event.type });
            log('DEBUG', 'DashboardPage', 'Event peerId', { peerId: event.peerId });
            log('DEBUG', 'DashboardPage', 'Event data type', { dataType: typeof event.data });
            log('DEBUG', 'DashboardPage', 'Event data', event.data);
            
            // Try to show the actual message content
            if (event.data) {
                log('DEBUG', 'DashboardPage', 'Data keys', { keys: Object.keys(event.data) });
                log('DEBUG', 'DashboardPage', 'Data content', event.data);
                
                // Try to stringify the data to see its actual content
                try {
                    log('DEBUG', 'DashboardPage', 'Stringified data', { stringified: JSON.stringify(event.data, null, 2) });
                } catch (e) {
                    log('WARN', 'DashboardPage', 'Could not stringify data', e);
                }
            } else {
                log('DEBUG', 'DashboardPage', 'No data in event');
            }
            
            // Log the full event object structure
            log('DEBUG', 'DashboardPage', 'Full event object', event);
            log('DEBUG', 'DashboardPage', 'Event constructor', { constructor: event.constructor.name });
            log('DEBUG', 'DashboardPage', 'Event prototype chain', { prototypeChain: Object.getPrototypeOf(event) });
            // End debug group
            
            try {
                const messageData = event.data;
                setReceivedMessages(prev => [...prev, {
                    sender: messageData.sender || 'Peer',
                    content: messageData.content,
                    timestamp: messageData.timestamp || new Date().toISOString()
                }]);
            } catch (error) {
                log('ERROR', 'DashboardPage', 'Error processing received message', error);
            }
        };
        
        // Store the message handler
        webRTCEventHandlersRef.current.message = messageHandler;
        rtcProvider.addEventListener('message', messageHandler);
    };

    const handleConnect = async () => {
        // Safety check: Perform cleanup if we're in a corrupted state
        if (provider && !isPeerConnected && !isConnecting) {
            log('WARN', 'DashboardPage', 'DETECTED CORRUPTED STATE - Performing cleanup before connect');
            performComprehensiveCleanup('corrupted_state_before_connect');
        }
        
        if (!selectedPeer) {
            setError('Please select a peer');
            return;
        }

        // Prevent multiple simultaneous provider creation
        if (isCreatingProvider) {
            log('INFO', 'DashboardPage', 'Provider creation already in progress, skipping');
            return;
        }

        try {
            setIsCreatingProvider(true);
            setIsConnecting(true);
            setError(null);
            setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection

            // Destroy any existing provider first to ensure clean state
            if (provider) {
                log('INFO', 'DashboardPage', 'Destroying existing provider before creating new one');
                
                // Clean up message handler before destroying provider
                if (signalingService) {
                    const handlerId = provider.getMessageHandlerId();
                    if (handlerId !== null) {
                        log('INFO', 'DashboardPage', 'REMOVING EXISTING HANDLER before creating new provider', { handlerId });
                        const removed = signalingService.removeMessageHandler(handlerId);
                        log('INFO', 'DashboardPage', 'EXISTING HANDLER REMOVAL RESULT', { removed });
                    }
                }
                
                try {
                    provider.destroy();
                    // Add a small delay to ensure the destroy operation completes
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Error destroying existing provider', error);
                }
            }
            
            // Reset signaling service to ensure clean state
            if (signalingService) {
                log('INFO', 'DashboardPage', 'Resetting signaling service before creating new provider');
                signalingService.reset();
                // Add a small delay to ensure the reset operation completes
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Re-register peer list handler after reset
                log('INFO', 'DashboardPage', 'Re-registering peer list handler after signaling service reset');
                const user = userRef.current;
                if (user) {
                    signalingService.onPeerListUpdate = handlePeerListUpdate;
                    signalingService.onIncomingConnection = async (message) => {
                        log('INFO', 'DashboardPage', 'Incoming connection detected after reset', { type: message.type, from: message.from });
                        
                        // Always create a fresh WebRTC provider for incoming connections
                        if (message.type === 'initiate') {
                            try {
                                log('INFO', 'DashboardPage', 'Creating fresh WebRTC provider for incoming connection after reset');
                                
                                // Prevent multiple simultaneous provider creation
                                if (isCreatingProvider) {
                                    log('WARN', 'DashboardPage', 'Provider creation already in progress for incoming connection after reset, skipping');
                                    return;
                                }
                                
                                // Set connecting state for incoming connection
                                setIsConnecting(true);
                                setError(null);
                                setIsCreatingProvider(true);
                                setIsGracefulDisconnect(false); // Reset graceful disconnect flag for new connection
                                
                                // Destroy any existing provider first to ensure clean state
                                if (provider) {
                                    log('INFO', 'DashboardPage', 'Destroying existing provider before creating new one for incoming connection after reset');
                                    
                                    // Clean up message handler before destroying provider
                                    if (signalingService) {
                                        const handlerId = provider.getMessageHandlerId();
                                        if (handlerId !== null) {
                                            log('INFO', 'DashboardPage', `REMOVING EXISTING HANDLER ${handlerId} before creating new provider for incoming connection after reset`);
                                            const removed = signalingService.removeMessageHandler(handlerId);
                                            log('INFO', 'DashboardPage', `EXISTING HANDLER REMOVAL RESULT: ${removed}`);
                                        }
                                    }
                                    
                                    try {
                                        provider.destroy();
                                        // Add a small delay to ensure the destroy operation completes
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    } catch (error) {
                                        log('WARN', 'DashboardPage', 'Error destroying existing provider for incoming connection after reset', error);
                                    }
                                }
                                
                                log('INFO', 'DashboardPage', 'CREATING WEBRTC PROVIDER for incoming connection after reset');
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
                                log('ERROR', 'DashboardPage', 'Error creating provider for incoming connection after reset', error);
                                setIsConnecting(false);
                            } finally {
                                setIsCreatingProvider(false);
                            }
                        }
                    };
                    
                }
            }

            // Always create a fresh WebRTC provider for clean connection
            log('INFO', 'DashboardPage', 'Creating fresh WebRTC provider for connection');
            const user = userRef.current;
            const currentTimestamp = Date.now();
            setActiveProviderTimestamp(currentTimestamp);
            
            log('INFO', 'DashboardPage', 'CREATING WEBRTC PROVIDER for connect button');
            
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
                log('ERROR', 'DashboardPage', 'Failed to create WebRTC provider', error);
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
            log('ERROR', 'DashboardPage', 'Connection error', error);
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
                log('INFO', 'DashboardPage', 'DISCONNECT STARTED from initiator side');
            } else {
                log('INFO', 'DashboardPage', 'DISCONNECT STARTED from responder side');
            }
            log('INFO', 'DashboardPage', `DISCONNECT STARTED from ${disconnectType}`);
            
            // Mark this as a graceful disconnect (peer initiated)
            log('INFO', 'DashboardPage', `SETTING GRACEFUL DISCONNECT FLAG: ${isInitiator ? 'initiator' : 'responder'}`);
            setIsGracefulDisconnect(true);
            log('INFO', 'DashboardPage', 'GRACEFUL DISCONNECT FLAG SET TO: true');
            
            // CRITICAL: Wait for the state update to be applied before proceeding
            // This ensures the connection state change handler sees the correct flag value
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Send disconnect message to peer (only if initiator)
            if (isInitiator && signalingService && selectedPeer) {
                try {
                    log('INFO', 'DashboardPage', `Sending disconnect message to peer ${selectedPeer}`);
                    signalingService.send({
                        type: 'disconnect',
                        from: userRef.current?.id,
                        to: selectedPeer,
                        data: { timestamp: Date.now() }
                    });
                    log('INFO', 'DashboardPage', `Disconnect message sent to peer ${selectedPeer}`);
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Failed to send disconnect message', error);
                }
            } else if (!isInitiator) {
                log('INFO', 'DashboardPage', `Responder side - not sending disconnect message to peer ${selectedPeer}`);
            }
            
            // STEP 1: Stop all media resources BEFORE disconnecting
            log('INFO', 'DashboardPage', 'STOPPING ALL MEDIA RESOURCES before disconnect');
            
            // Stop screen share before disconnect if it's active
            if (isScreenSharing && provider) {
                log('INFO', 'DashboardPage', 'Stopping screen share before disconnect');
                try {
                    await provider.stopScreenShare();
                    setIsScreenSharing(false);
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Failed to stop screen share during disconnect', error);
                }
            }
            
            // STEP 2: Disconnect from the specific peer - this will:
            // 1. Clear all audio, video, screen resources
            // 2. Reset remote resources (remote peer will clear its resources)
            if (provider) {
                log('INFO', 'DashboardPage', 'DISCONNECTING WEBRTC from peer');
                
                // CRITICAL: Remove event listeners BEFORE disconnecting to prevent delayed events (especially on responder side)
                log('INFO', 'DashboardPage', `REMOVING EVENT LISTENERS before disconnect (${disconnectType})`);
                try {
                    const handlers = webRTCEventHandlersRef.current;
                    if (handlers.connection) {
                        provider.removeEventListener('connection', handlers.connection);
                        log('INFO', 'DashboardPage', `Removed connection event listener (${disconnectType})`);
                    }
                    if (handlers.error) {
                        provider.removeEventListener('error', handlers.error);
                        log('INFO', 'DashboardPage', `Removed error event listener (${disconnectType})`);
                    }
                    if (handlers.message) {
                        provider.removeEventListener('message', handlers.message);
                        log('INFO', 'DashboardPage', `Removed message event listener (${disconnectType})`);
                    }
                    if (handlers.stream) {
                        provider.removeEventListener('stream', handlers.stream);
                        log('INFO', 'DashboardPage', `Removed stream event listener (${disconnectType})`);
                    }
                    if (handlers.stateChange) {
                        provider.removeEventListener('stateChange', handlers.stateChange);
                        log('INFO', 'DashboardPage', `Removed stateChange event listener (${disconnectType})`);
                    }
                    if (handlers.track) {
                        provider.removeEventListener('track', handlers.track);
                        log('INFO', 'DashboardPage', `Removed track event listener (${disconnectType})`);
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
                    
                    log('INFO', 'DashboardPage', `All event listeners removed (${disconnectType})`);
                } catch (error) {
                    log('WARN', 'DashboardPage', `Error removing event listeners (${disconnectType})`, error);
                }
                
                // Set graceful disconnect flag on WebRTC provider to prevent connection state events
                provider.setGracefulDisconnect(true);
                await provider.disconnect(selectedPeer, isInitiator);
            } else {
                log('WARN', 'DashboardPage', `No WebRTC provider available for disconnect (${disconnectType})`);
                // CRITICAL: Even without provider, we need to clean up streams
                log('INFO', 'DashboardPage', `CLEANING UP STREAMS without provider (${disconnectType})`);
                cleanupStreamsAndSetProviderNull(`disconnect_${disconnectType}_no_provider`);
            }
            
            // STEP 3: Reset dashboard state to go back to logged in page
            log('INFO', 'DashboardPage', 'Resetting dashboard state after disconnect');
            reset();
            
            // STEP 4: Destroy the provider (DashboardPage owns WebRTCProvider)
            log('INFO', 'DashboardPage', 'DESTROYING WEBRTC PROVIDER after disconnect');
            log('INFO', 'DashboardPage', 'Destroying WebRTC provider after disconnect');
            if (provider) {
                // OWNERSHIP: DashboardPage owns WebRTCProvider - manage its cleanup
                log('INFO', 'DashboardPage', 'DashboardPage managing WebRTCProvider cleanup');
                try {
                    // DashboardPage removes the message handler (it owns the provider)
                    if (signalingService) {
                        const handlerId = provider.getMessageHandlerId();
                        if (handlerId !== null) {
                            log('INFO', 'DashboardPage', 'REMOVING HANDLER (DashboardPage owns provider)', { handlerId });
                            const removed = signalingService.removeMessageHandler(handlerId);
                            log('INFO', 'DashboardPage', 'HANDLER REMOVAL RESULT', { removed });
                        }
                    }
                    
                    // Then destroy the provider and clean up streams properly
                    provider.destroy();
                    cleanupStreamsAndSetProviderNull(`disconnect_${disconnectType}_with_provider`);
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Error during provider destroy', error);
                }
            }
            
            // STEP 6: The existing disconnect logic already handles cleanup properly
            // No need for additional comprehensive cleanup here as it might interfere
                log('INFO', 'DashboardPage', 'Disconnect cleanup completed by existing logic');
            
            log('INFO', 'DashboardPage', `Disconnect process completed - user remains logged in (${disconnectType})`);
        } catch (error) {
            log('ERROR', 'DashboardPage', 'Disconnect error', error);
            setError(error.message);
        }
    };

    const handleDisconnect = async () => {
        // Initiator side - user clicked disconnect button
        await performDisconnect(true);
    };

    const handleLogout = async () => {
        log('INFO', 'DashboardPage', 'LOGOUT INITIATED by user');
        log('INFO', 'DashboardPage', 'User logging out - starting logout process');
        
        try {
            // STEP 1: If user is connected to a peer, disconnect gracefully (but don't send disconnect message)
            if (provider && selectedPeer && isPeerConnected) {
                log('INFO', 'DashboardPage', 'STEP 1: User is connected to peer, disconnecting gracefully');
                log('INFO', 'DashboardPage', 'Connected peer', { selectedPeer, providerExists: !!provider });
                
                try {
                    // OWNERSHIP: DashboardPage owns WebRTCProvider - call disconnect for cleanup
                    // WebRTCProvider.disconnect() will handle internal WebRTC cleanup
                    log('INFO', 'DashboardPage', 'Calling provider.disconnect() - DashboardPage owns provider');
                    await provider.disconnect(selectedPeer, true); // true = isInitiator, but we won't send disconnect message
                    log('INFO', 'DashboardPage', 'Disconnect completed before logout');
                } catch (disconnectError) {
                    log('WARN', 'DashboardPage', 'Error during disconnect before logout', disconnectError);
                    // Continue with logout even if disconnect fails
                }
            } else {
                log('INFO', 'DashboardPage', 'STEP 1: No active connection to disconnect');
                log('INFO', 'DashboardPage', 'Provider state', { providerExists: !!provider, selectedPeer, isPeerConnected });
            }
            
            // STEP 2: Send logout message to signaling server so other peers can remove this user
            if (signalingService) {
                log('INFO', 'DashboardPage', 'STEP 2: Sending logout message to signaling server');
                log('INFO', 'DashboardPage', 'Signaling service exists', { signalingServiceExists: !!signalingService });
                signalingService.sendLogout();
                log('INFO', 'DashboardPage', 'Logout message sent to server');
                
                // STEP 2.5: Clean up signaling service state to prevent "already connected" issue
                log('INFO', 'DashboardPage', 'STEP 2.5: Cleaning up signaling service state');
                signalingService.cleanup();
                log('INFO', 'DashboardPage', 'Signaling service state cleaned up');
            } else {
                log('WARN', 'DashboardPage', 'STEP 2: No signaling service available for logout');
            }
            
            // STEP 3: Close WebRTC connection silently (no disconnect message)
            if (provider) {
                log('INFO', 'DashboardPage', 'STEP 3: Closing WebRTC connection');
                
                // CRITICAL: Remove event listeners BEFORE destroying provider to prevent delayed events
                log('INFO', 'DashboardPage', 'STEP 3.1: Removing WebRTC event listeners');
                try {
                    // Remove stored event handlers
                    const handlers = webRTCEventHandlersRef.current;
                    if (handlers.connection) {
                        provider.removeEventListener('connection', handlers.connection);
                        log('INFO', 'DashboardPage', 'Removed connection event listener');
                    }
                    if (handlers.error) {
                        provider.removeEventListener('error', handlers.error);
                        log('INFO', 'DashboardPage', 'Removed error event listener');
                    }
                    if (handlers.message) {
                        provider.removeEventListener('message', handlers.message);
                        log('INFO', 'DashboardPage', 'Removed message event listener');
                    }
                    if (handlers.stream) {
                        provider.removeEventListener('stream', handlers.stream);
                        log('INFO', 'DashboardPage', 'Removed stream event listener');
                    }
                    if (handlers.stateChange) {
                        provider.removeEventListener('stateChange', handlers.stateChange);
                        log('INFO', 'DashboardPage', 'Removed stateChange event listener');
                    }
                    if (handlers.track) {
                        provider.removeEventListener('track', handlers.track);
                        log('INFO', 'DashboardPage', 'Removed track event listener');
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
                    
                    log('INFO', 'DashboardPage', 'All WebRTC event listeners removed');
                } catch (error) {
                    log('WARN', 'DashboardPage', 'Error removing event listeners', error);
                }
                
                // Now destroy the provider
                log('INFO', 'DashboardPage', 'STEP 3.2: Destroying WebRTC provider');
                provider.destroy();
                cleanupStreamsAndSetProviderNull('user_logout');
                log('INFO', 'DashboardPage', 'WebRTC connection closed');
            }
            
            // STEP 3.5: Stream cleanup is now handled by cleanupStreamsAndSetProviderNull function
            
            // STEP 4: Reset state and navigate
            log('INFO', 'DashboardPage', 'STEP 4: Resetting state and navigating');
            reset();
            localStorage.removeItem('user');
            navigate('/');
            log('INFO', 'DashboardPage', 'LOGOUT COMPLETED');
            
        } catch (error) {
            log('ERROR', 'DashboardPage', 'Error during logout', error);
            // Still navigate to login even if reset fails
            localStorage.removeItem('user');
            navigate('/');
        }
    };

    const handleSendMessage = useCallback(async (message) => {
        if (!provider || !selectedPeer) return;
        
        // Debug: Log what message is being sent
        log('DEBUG', 'DashboardPage', 'Sending Message Debug');
        log('DEBUG', 'DashboardPage', 'Message object', message);
        log('DEBUG', 'DashboardPage', 'Message type', { type: typeof message });
        log('DEBUG', 'DashboardPage', 'Message keys', { keys: message ? Object.keys(message) : 'no message' });
        log('DEBUG', 'DashboardPage', 'Message content', message);
        log('DEBUG', 'DashboardPage', 'Selected peer', { selectedPeer });
        log('DEBUG', 'DashboardPage', 'Provider exists', { providerExists: !!provider });
        // End debug group
        
        try {
            await provider.sendMessage(selectedPeer, message);
        } catch (err) {
            log('ERROR', 'DashboardPage', 'Failed to send message', err);
            setError('Failed to send message');
        }
    }, [provider, selectedPeer]);

    // Media toggle handlers for ConnectionPanel
    const handleToggleAudio = async () => {
        const newAudioState = !isAudioEnabled;
        log('INFO', 'DashboardPage', `AUDIO TOGGLE STARTED (initiator side): ${newAudioState ? 'ENABLE' : 'DISABLE'}`);
        log('INFO', 'DashboardPage', 'Toggle audio requested', { newAudioState });
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                log('INFO', 'DashboardPage', 'No provider available - creating new one for audio');
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
                log('INFO', 'DashboardPage', 'No local stream found - creating new stream with audio enabled');
                await currentProvider.initializeLocalMedia({ audio: true, video: false });
                setIsAudioEnabled(true);
                log('INFO', 'DashboardPage', 'Local stream created with audio enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (currentProvider.getLocalStream()) {
                log('INFO', 'DashboardPage', 'Using toggleMedia for existing stream');
                await currentProvider.toggleMedia({ audio: newAudioState });
                setIsAudioEnabled(newAudioState);
                log('INFO', 'DashboardPage', `Audio toggled to: ${newAudioState}`);
            } else {
                log('INFO', 'DashboardPage', 'No local stream and not enabling audio - nothing to do');
            }
        } catch (err) {
            log('ERROR', 'DashboardPage', 'Audio toggle error', err);
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
        log('INFO', 'DashboardPage', `VIDEO TOGGLE STARTED (initiator side): ${newVideoState ? 'ENABLE' : 'DISABLE'}`);
        log('INFO', 'DashboardPage', 'Toggle video requested', { newVideoState });
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                log('INFO', 'DashboardPage', 'No provider available - creating new one for video');
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
                log('INFO', 'DashboardPage', 'No local stream found - creating new stream with video enabled');
                await currentProvider.initializeLocalMedia({ audio: false, video: true });
                setIsVideoEnabled(true);
                log('INFO', 'DashboardPage', 'Local stream created with video enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (currentProvider.getLocalStream()) {
                log('INFO', 'DashboardPage', 'Using toggleMedia for existing stream');
                await currentProvider.toggleMedia({ video: newVideoState });
                setIsVideoEnabled(newVideoState);
                log('INFO', 'DashboardPage', `Video toggled to: ${newVideoState}`);
            } else {
                log('INFO', 'DashboardPage', 'No local stream and not enabling video - nothing to do');
            }
        } catch (err) {
            log('ERROR', 'DashboardPage', 'Video toggle error', err);
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
        log('INFO', 'DashboardPage', `SCREEN SHARE TOGGLE STARTED (initiator side): ${newScreenShareState ? 'ENABLE' : 'DISABLE'}`);
        log('INFO', 'DashboardPage', 'Toggle screen share requested', { newScreenShareState });
        
        try {
            // Create provider if it doesn't exist
            let currentProvider = provider;
            if (!currentProvider) {
                log('INFO', 'DashboardPage', 'No provider available - creating new one for screen share');
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
                log('INFO', 'DashboardPage', 'Starting screen share...');
                await currentProvider.startScreenShare();
                setIsScreenSharing(true);
                log('INFO', 'DashboardPage', 'Screen share started');
                
                // Note: checkExclusivity is handled by handleStreamChange when stream starts
            } else {
                // Stop screen sharing
                log('INFO', 'DashboardPage', 'Stopping screen share...');
                await currentProvider.stopScreenShare();
                setIsScreenSharing(false);
                log('INFO', 'DashboardPage', 'Screen share stopped');
            }
        } catch (err) {
            log('ERROR', 'DashboardPage', 'Screen share toggle error', err);
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
        log('INFO', 'DashboardPage', `WHITEBOARD TOGGLE STARTED: ${newWhiteboardState ? 'ENABLE' : 'DISABLE'}`);
        
        // If enabling whiteboard, stop screen share first (mutual exclusivity)
        if (newWhiteboardState && isScreenSharing) {
            log('INFO', 'DashboardPage', 'Stopping screen share before opening whiteboard');
            handleToggleScreenShare();
        }
        
        setIsWhiteboardActive(newWhiteboardState);
        log('INFO', 'DashboardPage', 'Whiteboard state updated', { newWhiteboardState });
    };

    // Whiteboard toolbar handlers
    const handleToolChange = (tool) => {
        log('INFO', 'DashboardPage', 'Tool changed to', { tool });
        setCurrentTool(tool);
    };

    const handleColorChange = (color) => {
        log('INFO', 'DashboardPage', 'Color changed to', { color });
        setCurrentColor(color);
    };

    const handleWhiteboardUndo = () => {
        log('INFO', 'DashboardPage', 'Undo requested');
        log('DEBUG', 'DashboardPage', 'Undo ref', { hasRef: !!whiteboardUndoRef.current, ref: whiteboardUndoRef.current });
        if (whiteboardUndoRef.current) {
            log('INFO', 'DashboardPage', 'Calling undo function');
            whiteboardUndoRef.current();
        } else {
            log('WARN', 'DashboardPage', 'No undo function available');
        }
    };

    const handleWhiteboardRedo = () => {
        log('INFO', 'DashboardPage', 'Redo requested');
        log('DEBUG', 'DashboardPage', 'Redo ref', { hasRef: !!whiteboardRedoRef.current, ref: whiteboardRedoRef.current });
        if (whiteboardRedoRef.current) {
            log('INFO', 'DashboardPage', 'Calling redo function');
            whiteboardRedoRef.current();
        } else {
            log('WARN', 'DashboardPage', 'No redo function available');
        }
    };

    const handleWhiteboardHistoryChange = useCallback((historyState) => {
        log('INFO', 'DashboardPage', 'History changed', historyState);
        setCanUndo(historyState.canUndo);
        setCanRedo(historyState.canRedo);
    }, []);

    // Centralized mutual exclusivity function
    const checkExclusivity = async (newType, newValue) => {
        log('DEBUG', 'DashboardPage', 'Checking exclusivity', { newType, newValue, currentImageUrl: currentImageUrlRef.current, isScreenSharing });
        
        // ALWAYS clear any existing content before loading new content
        // This ensures mutual exclusivity regardless of what's currently active
        
        // 1. Clear screen share if active
        if (isScreenSharing && provider) {
            log('INFO', 'DashboardPage', `Stopping existing screen share due to ${newType} activation`);
            try {
                await provider.stopScreenShare();
                setIsScreenSharing(false);
                log('DEBUG', 'DashboardPage', `CALLING setIsScreenShareActive(false) from checkExclusivity (${Date.now()}) - stopping screen share due to ${newType}`);
                setIsScreenShareActive(false);
                log('INFO', 'DashboardPage', `Screen share stopped due to ${newType} activation`);
            } catch (error) {
                log('ERROR', 'DashboardPage', 'Failed to stop screen share', error);
                setIsScreenSharing(false);
                log('DEBUG', 'DashboardPage', `CALLING setIsScreenShareActive(false) from checkExclusivity error handler (${Date.now()})`);
                setIsScreenShareActive(false);
            }
        }
        
        // 2. Clear image/pdf if active (but not if we're setting the same type)
        if (currentImageUrlRef.current && newType !== 'image') {
            log('INFO', 'DashboardPage', `Clearing existing image due to ${newType} activation`);
            log('DEBUG', 'DashboardPage', 'Previous currentImageUrl was', { currentImageUrl: currentImageUrlRef.current });
            setCurrentImageUrl(null);
            currentImageUrlRef.current = null;
            log('DEBUG', 'DashboardPage', 'currentImageUrl cleared, should now be null');
        }
        
        // Always clear Whiteboard's internal background state when screen share is activated
        if (newType === 'screenShare' && whiteboardImageUploadRef.current && typeof whiteboardImageUploadRef.current.clearBackground === 'function') {
            log('INFO', 'DashboardPage', 'Clearing Whiteboard background due to screen share activation');
            whiteboardImageUploadRef.current.clearBackground();
        }
        
        log('INFO', 'DashboardPage', `All existing content cleared, ready for ${newType}`);
    };

    const handleImageChange = async (imageUrl) => {
        log('INFO', 'DashboardPage', 'Image changed', { imageUrl });
        
        if (imageUrl === null) {
            log('INFO', 'DashboardPage', 'Image cleared (received from remote peer)');
            setCurrentImageUrl(null);
            currentImageUrlRef.current = null;
            return;
        }
        
        // Set the new image FIRST, then check exclusivity
        log('INFO', 'DashboardPage', 'Setting currentImageUrl to', { imageUrl });
        setCurrentImageUrl(imageUrl);
        currentImageUrlRef.current = imageUrl;
        log('DEBUG', 'DashboardPage', 'currentImageUrl state should now be', { imageUrl });
        
        // Check mutual exclusivity after setting the image
        // Note: We pass the imageUrl directly to avoid relying on state that might not be updated yet
        await checkExclusivity('image', imageUrl);
    };

    const handlePdfChange = async (pdfFile) => {
        log('INFO', 'DashboardPage', 'PDF changed', { pdfFile });
        
        // Check mutual exclusivity first
        await checkExclusivity('pdf', pdfFile);
        
        // Pass the PDF file to Whiteboard component
        if (whiteboardImageUploadRef.current && whiteboardImageUploadRef.current.handleFileUpload) {
            log('INFO', 'DashboardPage', 'Passing PDF to Whiteboard component', {
                fileName: pdfFile.name,
                fileSize: pdfFile.size,
                fileType: pdfFile.type
            });
            // Create a synthetic event object for the Whiteboard component
            const syntheticEvent = {
                target: {
                    files: [pdfFile]
                }
            };
            log('INFO', 'DashboardPage', 'Calling Whiteboard.handleFileUpload with synthetic event');
            whiteboardImageUploadRef.current.handleFileUpload(syntheticEvent);
            log('INFO', 'DashboardPage', 'PDF successfully passed to Whiteboard component');
        } else {
            log('WARN', 'DashboardPage', 'Whiteboard ref not available', {
                hasRef: !!whiteboardImageUploadRef.current,
                hasHandleFileUpload: !!(whiteboardImageUploadRef.current && whiteboardImageUploadRef.current.handleFileUpload)
            });
        }
    };

    const handleImageSizeChange = (newSize) => {
        log('INFO', 'DashboardPage', 'Image size changed', { newSize });
        setDynamicContainerSize(newSize);
    };

    const handleWhiteboardImageUpload = (event) => {
        log('INFO', 'DashboardPage', 'Image upload requested');
        log('DEBUG', 'DashboardPage', 'File', { file: event.target.files[0] });
        log('DEBUG', 'DashboardPage', 'Screen share state', { isScreenShareActive, isScreenSharing });
        
        // Pass the file directly to the Whiteboard component
        if (whiteboardImageUploadRef.current && typeof whiteboardImageUploadRef.current.handleImageUpload === 'function') {
            log('INFO', 'DashboardPage', 'Calling Whiteboard handleImageUpload');
            whiteboardImageUploadRef.current.handleImageUpload(event);
        } else {
            log('ERROR', 'DashboardPage', 'Ref not available or handleImageUpload not a function');
        }
    };

    const handleWhiteboardFileUpload = async (event) => {
        log('INFO', 'DashboardPage', 'File upload requested');
        
        // Check mutual exclusivity for PDF uploads
        await handlePdfChange(event.target.files[0]);
        
        // The whiteboard component will handle the actual upload logic
    };

    const handleWhiteboardClear = () => {
        log('INFO', 'DashboardPage', 'Clear requested');
        // The whiteboard component will handle the actual clear logic
    };


    const resetConnectionState = () => {
        log('INFO', 'DashboardPage', 'RESET: Starting connection state reset');
        
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
        
        log('INFO', 'DashboardPage', 'RESET: Connection state reset completed - peer selection and session cleared');
        log('INFO', 'DashboardPage', 'RESET: UI should now show logged-in state (no disconnect buttons)');
    };

    const resetPeerManagement = () => {
        log('INFO', 'DashboardPage', 'RESET: Starting peer management reset');
        
        // DON'T clear peer list - keep it available for reconnection
        // setPeerList([]); // REMOVED - peers should remain available
        
        // Clear received messages
        setReceivedMessages([]);
        
        // Clear message handler
        if (messageHandlerRef.current) {
            signalingService.removeMessageHandler(messageHandlerRef.current);
            messageHandlerRef.current = null;
        }
        
        log('INFO', 'DashboardPage', 'RESET: Peer management reset completed - peer list preserved');
    };

    const resetUIState = () => {
        log('INFO', 'DashboardPage', 'RESET: Starting UI state reset');
        
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
        
        log('INFO', 'DashboardPage', 'RESET: UI state reset completed');
    };

    const reset = () => {
        log('INFO', 'DashboardPage', 'RESET: Starting complete dashboard reset');
        
        try {
            // Reset in order: connection state → peer management → UI state
            resetConnectionState();
            resetPeerManagement();
            resetUIState();
            
            log('INFO', 'DashboardPage', 'RESET: Complete dashboard reset successful');
        } catch (error) {
            log('ERROR', 'DashboardPage', 'RESET: Error during reset', error);
            throw error;
        }
    };

    if (!userEmail) return null;

    log('DEBUG', 'DashboardPage', 'Parent component is re-rendering');
    
    // Debug: Log all state variables to identify what's changing
    log('DEBUG', 'DashboardPage', 'State values', {
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
    });

    // Calculate VideoChat key
    const videoChatKey = `videochat-${isPeerConnected}-${isConnecting}`;
    log('DEBUG', 'DashboardPage', 'VideoChat key', { videoChatKey });
    log('DEBUG', 'DashboardPage', 'VideoChat props being passed', {
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
            
            {/* PDF Navigation - Above dashboard-content, can be positioned anywhere */}
            <PDFNavigation
                currentPage={pdfCurrentPage}
                totalPages={pdfTotalPages}
                onPageChange={handlePdfPageChange}
                onZoomIn={handlePdfZoomIn}
                onZoomOut={handlePdfZoomOut}
                onZoomReset={handlePdfZoomReset}
                scale={pdfScale}
                isVisible={showPdfNavigation}
            />
            
            <div className="dashboard-content">
                {/* Log the expected image loading flow */}
                {/* Log the expected image loading flow */}
                {log('DEBUG', 'DashboardPage', 'EXPECTED IMAGE LOADING FLOW', {
                  step1: 'Image loads with natural dimensions (e.g., 2000x1500px)',
                  step2: 'whiteboard-container expands to match image dimensions (2000x1500px)',
                  step3: 'dashboard-content (1200x800px) shows scrollbars because child (2000x1500px) exceeds container',
                  step4: 'User can scroll within dashboard-content to see full image',
                  note: 'whiteboard-container should NOT be constrained to 1200x800px'
                })}
                
                {/* Whiteboard Component - Handles both drawing and backgrounds (PDF/Images) */}
               {log('DEBUG', 'DashboardPage', 'Is whiteboard active?', { isWhiteboardActive })}
               {log('DEBUG', 'DashboardPage', 'Screen share detection debug', {
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
                       currentImageUrl={currentImageUrl}
                       containerSize={dynamicContainerSize}
                       onClose={handleWhiteboardClose}
                       onBackgroundCleared={handleWhiteboardBackgroundCleared}
                       onImageChange={handleImageChange}
                       onPdfChange={handlePdfChange}
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
                       // PDF Navigation props
                       pdfCurrentPage={pdfCurrentPage}
                       pdfScale={pdfScale}
                       onPdfPageChange={handlePdfPageChange}
                       onPdfPagesChange={handlePdfPagesChange}
                       ref={whiteboardImageUploadRef}
                   />
               )}
                
                <ScreenShareWindow
                    key="screen-share-stable"
                    screenShareStream={provider?.getScreenShareStream() || provider?.getRemoteScreen(selectedPeer)}
                    isVisible={isScreenShareActive}
                    position={{ top: '0', left: '0' }}
                    size={{ width: '1200px', height: '800px' }}
                    onStreamChange={(stream) => {
                        log('DEBUG', 'DashboardPage', 'Screen share stream change notified', { streamId: stream?.id });
                    }}
                    debugMode={true}
                    useRelativePositioning={true}
                />
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