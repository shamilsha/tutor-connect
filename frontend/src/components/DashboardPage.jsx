import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebRTCProvider } from '../services/WebRTCProvider';
import VideoChat from './VideoChat';
import ConnectionPanel from './ConnectionPanel';
import ChatPanel from './ChatPanel';
import ConnectionStatusLight from './ConnectionStatusLight';
import ScreenShareWindow from './ScreenShareWindow';
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
    
    // Force re-render when streams change
    const [streamRevision, setStreamRevision] = useState(0);
    

    
    // Chat state
    const [receivedMessages, setReceivedMessages] = useState([]);

    // Store user data and message handler IDs in ref
    const userRef = useRef(null);
    const messageHandlerRef = useRef(null);

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







    // Define handlePeerListUpdate outside useEffect so it can be accessed by other functions
    const handlePeerListUpdate = (peers) => {
        const user = userRef.current;
        if (!user) {
            console.log('[DashboardPage] No user data available for peer list handler');
            return;
        }

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
                
                // Check if we're connected to a peer that's no longer in the list
                if (provider && isPeerConnected && selectedPeer) {
                    const isPeerStillAvailable = filteredPeers.some(p => p.id === selectedPeer);
                    if (!isPeerStillAvailable) {
                        console.log('[DashboardPage] 🔄 Connected peer is no longer available, disconnecting and clearing selection');
                        // The peer we're connected to is no longer in the list, disconnect and clear selection
                        handleDisconnect();
                        setSelectedPeer(''); // Clear the selected peer since it's no longer available
                    }
                }
                
                return filteredPeers;
            }
            return prevPeers;
        });
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
                            
                            // Clean up message handler before destroying provider
                            if (signalingService) {
                                const handlerId = provider.getMessageHandlerId();
                                if (handlerId !== null) {
                                    console.log(`%c[DashboardPage] 🧹 REMOVING EXISTING HANDLER ${handlerId} before creating new provider for incoming connection`, 'font-weight: bold; color: orange; font-size: 14px;');
                                    const removed = signalingService.removeMessageHandler(handlerId);
                                    console.log(`%c[DashboardPage] 🧹 EXISTING HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange; font-size: 14px;');
                                }
                            }
                            
                            try {
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
            setSelectedPeer('');
        }
    }, [peerList, selectedPeer, isPeerConnected, isConnecting]);

    // WebRTC Provider lifecycle management
    useEffect(() => {
        // Cleanup function to destroy provider when it changes or component unmounts
        return () => {
            if (provider) {
                console.log('[DashboardPage] 🔄 Cleaning up WebRTC provider on unmount/change');
                
                // Clean up message handler before destroying provider
                if (signalingService) {
                    const handlerId = provider.getMessageHandlerId();
                    if (handlerId !== null) {
                        console.log(`%c[DashboardPage] 🧹 REMOVING HANDLER ${handlerId} during cleanup`, 'font-weight: bold; color: orange; font-size: 14px;');
                        const removed = signalingService.removeMessageHandler(handlerId);
                        console.log(`%c[DashboardPage] 🧹 CLEANUP HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange; font-size: 14px;');
                    }
                }
                
                try {
                    provider.destroy();
                } catch (error) {
                    console.warn('[DashboardPage] ⚠️ Error during provider cleanup:', error);
                }
            }
        };
    }, [provider]); // This effect runs when provider changes or component unmounts

    // Periodic peer list refresh to handle unexpected disconnections
    useEffect(() => {
        if (!signalingService || !userRef.current) return;

        const refreshInterval = setInterval(() => {
            console.log('[DashboardPage] 🔄 Periodic peer list refresh');
            signalingService.wsProvider?.publish('get_peers', {
                type: 'get_peers',
                userId: userRef.current.id
            });
        }, 30000); // Refresh every 30 seconds

        return () => {
            clearInterval(refreshInterval);
        };
    }, [signalingService]);



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
            // Force re-render of components that depend on streams
            setStreamRevision(prev => prev + 1);
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
    }, [provider]);

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
        rtcProvider.addEventListener('connection', (event) => {
            const state = event.data.state;
            console.log(`[DashboardPage] Connection state changed:`, state);
            
            if (state === 'connected') {
                setIsPeerConnected(true);
                setIsConnecting(false);
                setShowChat(true);
                setError(null);
                setIsGracefulDisconnect(false); // Reset graceful disconnect flag on successful connection
            } else if (state === 'connecting') {
                setIsConnecting(true);
                setIsPeerConnected(false);
                setShowChat(false);
                // Don't reset graceful disconnect flag here - let it persist until we know the final state
            } else if (state === 'disconnected' || state === 'failed') {
                setIsPeerConnected(false);
                setIsConnecting(false);
                setShowChat(false);
                
                // Clean up message handler when disconnected
                if (messageHandlerRef.current) {
                    signalingService.removeMessageHandler(messageHandlerRef.current);
                    messageHandlerRef.current = null;
                }
                
                // Destroy provider on disconnect or failure to ensure fresh instance for retry
                if (state === 'failed' || state === 'disconnected') {
                    console.log(`[DashboardPage] Connection ${state} - destroying provider for retry`);
                    setProvider(null); // Set provider to null to trigger cleanup
                    
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
        });

        rtcProvider.addEventListener('error', (event) => {
            console.error('[DashboardPage] WebRTC error:', event.data);
            
            // Provide more specific error messages for common issues
            let errorMessage = event.data.message;
            if (event.data.error && event.data.error.name === 'InvalidStateError') {
                errorMessage = 'Connection state error - this usually resolves automatically. Please try reconnecting.';
            } else if (event.data.message && event.data.message.includes('Failed to execute')) {
                errorMessage = 'Connection setup error - please try reconnecting.';
            }
            
            setError(errorMessage);
        });

        rtcProvider.addEventListener('message', (event) => {
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
        });
    };

    const handleConnect = async () => {
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
                    
                    // Request initial peer list
                    signalingService.wsProvider?.publish('get_peers', {
                        type: 'get_peers',
                        userId: user.id
                    });
                }
            }

            // Always create a fresh WebRTC provider for clean connection
            console.log('[DashboardPage] 🔄 Creating fresh WebRTC provider for connection');
            const user = userRef.current;
            const currentTimestamp = Date.now();
            setActiveProviderTimestamp(currentTimestamp);
            
            console.log('%c[DashboardPage] 🚀 CREATING WEBRTC PROVIDER for connect button', 'font-weight: bold; color: green; font-size: 14px;');
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
                await provider.disconnect(selectedPeer, isInitiator);
            } else {
                console.log(`[DashboardPage] ⚠️ No WebRTC provider available for disconnect (${disconnectType})`);
            }
            
            // STEP 3: Reset dashboard state to go back to logged in page
            console.log('[DashboardPage] 🔄 Resetting dashboard state after disconnect');
            reset();
            
            // STEP 4: Clean up message handler before destroying provider
            console.log('%c[DashboardPage] 🧹 CLEANING UP MESSAGE HANDLER before provider destroy', 'font-weight: bold; color: orange; font-size: 14px;');
            if (provider && signalingService) {
                const handlerId = provider.getMessageHandlerId();
                if (handlerId !== null) {
                    console.log(`%c[DashboardPage] 🧹 REMOVING MESSAGE HANDLER ${handlerId} from signaling service`, 'font-weight: bold; color: orange; font-size: 14px;');
                    const removed = signalingService.removeMessageHandler(handlerId);
                    console.log(`%c[DashboardPage] 🧹 HANDLER REMOVAL RESULT: ${removed}`, 'font-weight: bold; color: orange; font-size: 14px;');
                } else {
                    console.log(`%c[DashboardPage] ⚠️ NO HANDLER ID TO REMOVE`, 'font-weight: bold; color: yellow; font-size: 14px;');
                }
            }
            
            // STEP 5: Destroy the provider to clean up WebRTC resources
            console.log('%c[DashboardPage] 💥 DESTROYING WEBRTC PROVIDER after disconnect', 'font-weight: bold; color: red; font-size: 14px;');
            console.log('[DashboardPage] 🔄 Destroying WebRTC provider after disconnect');
            if (provider) {
                // Clean up the provider before setting to null
                try {
                    provider.destroy();
                } catch (error) {
                    console.warn('[DashboardPage] Error during provider destroy:', error);
                }
            }
            
            // STEP 6: Clear all WebRTC instances and set provider to null
            WebRTCProvider.clearAllInstances();
            WebRTCProvider.clearActiveInstance(); // Clear the active instance reference
            setProvider(null); // DashboardPage sets provider to null
            
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
        console.log('[DashboardPage] 👋 User logging out');
        
        try {
            // If user is connected to a peer, disconnect first
            if (provider && selectedPeer && isPeerConnected) {
                console.log('[DashboardPage] 👋 User is connected to peer, disconnecting first');
                try {
                    await provider.disconnect(selectedPeer);
                    console.log('[DashboardPage] 👋 Disconnect completed before logout');
                } catch (disconnectError) {
                    console.warn('[DashboardPage] ⚠️ Error during disconnect before logout:', disconnectError);
                    // Continue with logout even if disconnect fails
                }
            }
            
            // Clear all WebRTC instances
            WebRTCProvider.clearAllInstances();
            
            // Send logout message to signaling server so other peers can remove this user
            if (signalingService) {
                console.log('[DashboardPage] 👋 Sending logout message to signaling server');
                signalingService.sendLogout();
            }
            
            // Reset signaling service
            if (signalingService) {
                signalingService.reset();
            }
            
            // Reset dashboard state
            reset();
            
            // Clean up user data
            localStorage.removeItem('user');
            
            // Navigate to login
            navigate('/');
            
            console.log('[DashboardPage] 👋 Logout completed successfully');
        } catch (error) {
            console.error('[DashboardPage] ❌ Error during logout:', error);
            // Still navigate to login even if reset fails
            localStorage.removeItem('user');
            navigate('/');
        }
    };

    const handleSendMessage = async (message) => {
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
    };

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

    const resetConnectionState = () => {
        console.log('[DashboardPage] 🔄 RESET: Starting connection state reset');
        
        // Reset connection states
        setIsPeerConnected(false);
        setIsConnecting(false);
        setShowChat(false);
        setError(null);
        
        // Clear peer selection when resetting - this prevents UI inconsistency
        // when a peer logs out without explicitly disconnecting
        setSelectedPeer('');
        
        console.log('[DashboardPage] 🔄 RESET: Connection state reset completed - peer selection cleared');
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
                onToggleAudio={handleToggleAudio}
                onToggleVideo={handleToggleVideo}
                onToggleScreenShare={handleToggleScreenShare}
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
            
            <div className="dashboard-content">
                {/* Debug info for screen share */}
                {provider && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '10px', 
                        left: '10px', 
                        background: 'rgba(0,0,0,0.8)', 
                        color: 'white', 
                        padding: '10px', 
                        fontSize: '12px', 
                        zIndex: 1000,
                        maxWidth: '300px'
                    }}>
                        <div>🖥️ Screen Share Debug:</div>
                        <div>Local: {provider.getScreenShareStream()?.id || 'None'}</div>
                        <div>Remote: {provider.getRemoteScreen(selectedPeer)?.id || 'None'}</div>
                        <div>Selected Peer: {selectedPeer}</div>
                        <div>Is Screen Sharing: {isScreenSharing ? 'Yes' : 'No'}</div>
                        <div>Stream Revision: {streamRevision}</div>
                    </div>
                )}
                
                {/* Screen Share Window - Inside dashboard-content */}
                <ScreenShareWindow
                    key={`screen-share-${streamRevision}`}
                    screenShareStream={provider?.getScreenShareStream() || provider?.getRemoteScreen(selectedPeer)}
                    isVisible={isScreenSharing || !!(provider?.getScreenShareStream() || provider?.getRemoteScreen(selectedPeer))}
                    position={{ top: '0', left: '0' }}
                    size={{ width: '100%', height: '100%' }}
                    onStreamChange={(stream) => {
                        console.log('[DashboardPage] 🖥️ Screen share stream change notified:', stream?.id);
                    }}
                    debugMode={true}
                    useRelativePositioning={true}
                />
            </div>
            
            {/* Chat Panel - Below everything */}
            {showChat && (
                <ChatPanel
                    user={userRef.current}
                    provider={provider}
                    onSendMessage={handleSendMessage}
                    receivedMessages={receivedMessages}
                />
            )}
            
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
        </div>
    );
};

export default DashboardPage; 