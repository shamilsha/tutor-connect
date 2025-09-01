import React, { useState, useEffect, useRef } from 'react';
import '../styles/VideoChat.css';
import ChatPanel from './ChatPanel';

const VideoDisplay = React.memo(({ mainStream, pipStream, isMainStreamRemote, isScreenSharing }) => {
    const mainVideoRef = useRef(null);
    const pipVideoRef = useRef(null);
    const [hasUserInteracted, setHasUserInteracted] = useState(false);

    console.log('[VideoDisplay] 🎬 RENDERING VIDEODISPLAY COMPONENT:', {
        mainStream: mainStream ? 'present' : 'null',
        mainStreamId: mainStream?.id,
        pipStream: pipStream ? 'present' : 'null',
        pipStreamId: pipStream?.id,
        isMainStreamRemote,
        mainStreamTracks: mainStream?.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })) || [],
        pipStreamTracks: pipStream?.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })) || []
    });

    // Debug: Check PiP window rendering condition
    if (pipStream) {
        console.log('[VideoDisplay] 🟢 PiP WINDOW WILL BE RENDERED:', {
            pipStreamId: pipStream?.id,
            pipStreamTracks: pipStream?.getTracks().length || 0,
            pipVideoTracks: pipStream?.getVideoTracks().length || 0,
            pipAudioTracks: pipStream?.getAudioTracks().length || 0
        });
    } else {
        console.log('[VideoDisplay] ❌ PiP WINDOW WILL NOT BE RENDERED - pipStream is null');
    }

    const playVideo = async (videoRef, stream) => {
        console.log(`[VideoDisplay] 🚨 playVideo CALLED for ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video:`, {
            hasVideoRef: !!videoRef?.current,
            hasStream: !!stream,
            streamId: stream?.id,
            videoRefType: videoRef === pipVideoRef ? 'PIP' : 'MAIN'
        });

        // Early return if videoRef or stream is null/undefined
        if (!videoRef?.current || !stream) {
            console.log('[VideoDisplay] ⚠️ Cannot play video - missing videoRef or stream:', {
                hasVideoRef: !!videoRef?.current,
                hasStream: !!stream,
                streamId: stream?.id,
                isPipVideo: videoRef === pipVideoRef
            });
            return;
        }

        // Additional check for PiP video - prevent any calls when pipStream is null
        if (videoRef === pipVideoRef && !pipStream) {
            console.log('[VideoDisplay] 🚫 BLOCKING PiP playVideo call - pipStream is null');
            return;
        }

        try {
            console.log(`[VideoDisplay] 🎬 Starting playVideo for ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video:`, {
                streamId: stream.id,
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
                currentSrcObject: videoRef.current.srcObject?.id
            });

            // Log current video element state
            console.log(`[VideoDisplay] 📊 ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video element state:`, {
                paused: videoRef.current.paused,
                readyState: videoRef.current.readyState,
                currentTime: videoRef.current.currentTime,
                duration: videoRef.current.duration,
                videoWidth: videoRef.current.videoWidth,
                videoHeight: videoRef.current.videoHeight
            });

            // Log stream tracks
            console.log(`[VideoDisplay] 🎵 ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} stream tracks:`, stream.getTracks().map(t => ({
                kind: t.kind,
                    enabled: t.enabled,
                    readyState: t.readyState,
                    muted: t.muted,
                    id: t.id
            })));

            // Always update srcObject to ensure proper stream switching
            if (stream !== videoRef.current.srcObject) {
                console.log(`[VideoDisplay] 🔄 Updating ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video srcObject:`, {
                    oldSrcObject: videoRef.current.srcObject?.id,
                    newSrcObject: stream.id,
                    elementType: videoRef === pipVideoRef ? 'PIP' : 'MAIN',
                    streamDetails: {
                        streamId: stream.id,
                        videoTracks: stream.getVideoTracks().length,
                        audioTracks: stream.getAudioTracks().length,
                        trackDetails: stream.getTracks().map(t => ({
                            kind: t.kind,
                            enabled: t.enabled,
                            readyState: t.readyState,
                            id: t.id
                        }))
                    }
                });
                
                // Pause current playback before changing srcObject
                if (!videoRef.current.paused) {
                    videoRef.current.pause();
                }
                
                // Clear the old srcObject first to ensure proper cleanup
                videoRef.current.srcObject = null;
                
                // Force reload to clear any cached frames
                videoRef.current.load();
                
                // Pause and reset video element to ensure complete cleanup
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
                
                // Wait a moment for the old stream to be properly cleared
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Set the new srcObject
                videoRef.current.srcObject = stream;
                console.log(`[VideoDisplay] ✅ ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video srcObject updated`);
                
                // Wait a bit before trying to play to avoid AbortError
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                console.log(`[VideoDisplay] ℹ️ ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video srcObject unchanged`);
            }

            // Always try to play if we have a valid stream, regardless of pause state
            if (videoRef.current.srcObject) {
                console.log('[VideoDisplay] 🎬 Attempting to play video:', {
                    streamId: stream?.id,
                    videoTracks: stream?.getVideoTracks().length || 0,
                    audioTracks: stream?.getAudioTracks().length || 0,
                    paused: videoRef.current.paused,
                    readyState: videoRef.current.readyState
                });
                
                // Debug video element visibility and styling
                const videoElement = videoRef.current;
                const rect = videoElement.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(videoElement);
                console.log('[VideoDisplay] 📐 Video element dimensions and styling:', {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left,
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    zIndex: computedStyle.zIndex,
                    position: computedStyle.position,
                    overflow: computedStyle.overflow,
                    clip: computedStyle.clip,
                    clipPath: computedStyle.clipPath,
                    transform: computedStyle.transform,
                    videoWidth: videoElement.videoWidth,
                    videoHeight: videoElement.videoHeight,
                    offsetWidth: videoElement.offsetWidth,
                    offsetHeight: videoElement.offsetHeight,
                    clientWidth: videoElement.clientWidth,
                    clientHeight: videoElement.clientHeight
                });
                
                // Check if video element is actually visible
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                computedStyle.display !== 'none' && 
                                computedStyle.visibility !== 'hidden' && 
                                parseFloat(computedStyle.opacity) > 0;
                console.log('[VideoDisplay] 👁️ Video element visibility check:', {
                    isVisible,
                    hasDimensions: rect.width > 0 && rect.height > 0,
                    displayNotNone: computedStyle.display !== 'none',
                    visibilityNotHidden: computedStyle.visibility !== 'hidden',
                    opacityGreaterThanZero: parseFloat(computedStyle.opacity) > 0
                });
                
                try {
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) {
                        await playPromise;
                        console.log('[VideoDisplay] ▶️ Video playback started successfully');
                        
                        // Check if video is actually playing
                        setTimeout(() => {
                            const videoElement = videoRef.current;
                            if (videoElement) {
                                console.log('[VideoDisplay] 📊 Video playback status:', {
                                    currentTime: videoElement.currentTime,
                                    duration: videoElement.duration,
                                    paused: videoElement.paused,
                                    ended: videoElement.ended,
                                    readyState: videoElement.readyState,
                                    videoWidth: videoElement.videoWidth,
                                    videoHeight: videoElement.videoHeight
                                });
                            }
                        }, 1000);
                    } else {
                        console.log('[VideoDisplay] ⚠️ Play promise is undefined (autoplay blocked)');
                    }
                } catch (playError) {
                    console.error('[VideoDisplay] ❌ Play error:', playError);
                    
                    if (playError.name === 'AbortError') {
                        console.log('[VideoDisplay] ⚠️ Play request was interrupted, retrying...');
                        // Retry once after a short delay
                        setTimeout(async () => {
                            try {
                                const retryPromise = videoRef.current.play();
                                if (retryPromise !== undefined) {
                                    await retryPromise;
                                    console.log('[VideoDisplay] ▶️ Retry successful');
                                }
                            } catch (retryError) {
                                console.error('[VideoDisplay] ❌ Retry failed:', retryError);
                            }
                        }, 200);
                    } else if (playError.name === 'NotAllowedError') {
                        console.error('[VideoDisplay] ❌ Autoplay blocked by browser policy. User interaction required.');
                    }
                }
            }
        } catch (error) {
            console.error('[VideoDisplay] ❌ Error in playVideo:', error);
        }
    };

    useEffect(() => {
        console.log('[VideoDisplay] 🔄 Streams updated:', {
            hasMainStream: !!mainStream,
            hasPipStream: !!pipStream,
            mainStreamId: mainStream?.id,
            pipStreamId: pipStream?.id,
            mainStreamTracks: mainStream?.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            })),
            pipStreamTracks: pipStream?.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            }))
        });

        // 🔍 DETAILED VIDEO ELEMENT ASSIGNMENT LOGGING
        console.log('[VideoDisplay] 🎬 VIDEO ELEMENT ASSIGNMENT:', {
            // Main video element
            mainVideoElement: {
                willReceiveStream: !!mainStream,
                streamId: mainStream?.id || 'NO_STREAM',
                streamType: mainStream ? (mainStream === pipStream ? 'SAME_AS_PIP' : 'UNIQUE') : 'NONE',
                isMainStreamRemote,
                videoTracks: mainStream?.getVideoTracks().length || 0,
                audioTracks: mainStream?.getAudioTracks().length || 0
            },
            
            // PiP video element
            pipVideoElement: {
                willReceiveStream: !!pipStream,
                streamId: pipStream?.id || 'NO_STREAM',
                streamType: pipStream ? (pipStream === mainStream ? 'SAME_AS_MAIN' : 'UNIQUE') : 'NONE',
                videoTracks: pipStream?.getVideoTracks().length || 0,
                audioTracks: pipStream?.getAudioTracks().length || 0
            },
            
            // Assignment summary
            assignmentSummary: {
                mainWindowShows: mainStream ? (isMainStreamRemote ? 'REMOTE_VIDEO' : 'LOCAL_VIDEO') : 'NO_VIDEO',
                pipWindowShows: pipStream ? 'LOCAL_VIDEO' : 'NO_VIDEO',
                totalUniqueStreams: new Set([mainStream?.id, pipStream?.id].filter(Boolean)).size
            }
        });

        // Play main video immediately
        console.log('[VideoDisplay] 🎬 CALLING playVideo for mainStream:', {
            streamId: mainStream?.id,
            videoTracks: mainStream?.getVideoTracks().length || 0,
            isMainStreamRemote
        });
        
        // Only call playVideo if mainStream exists
        if (mainStream) {
            // can I log mainStream here?
        console.log("mainStream", mainStream)
        console.log("assign the main stream to the main video element")
        playVideo(mainVideoRef, mainStream);
        } else {
            console.log('[VideoDisplay] ⚠️ mainStream is null/undefined, skipping playVideo call');
        }
        
        // For PiP video, don't call playVideo automatically - let the video element handle it
        if (pipStream) {
            console.log("pipStream", pipStream)
            console.log("assign the pip stream to the pip video element")
            console.log('[VideoDisplay] 🎬 PiP stream available, but not calling playVideo automatically');
            console.log('[VideoDisplay] 🎬 PiP video will play when element is created via ref callback');
        } else {
            console.log('[VideoDisplay] ⚠️ pipStream is null/undefined, no PiP video to play');
        }
    }, [mainStream, pipStream, isMainStreamRemote]);

    // Debug: Track when main video element changes
    useEffect(() => {
        if (mainVideoRef.current) {
            console.log('[VideoDisplay] 🎥 Main video element updated:', {
                srcObject: mainVideoRef.current.srcObject?.id,
                expectedStreamId: mainStream?.id,
                videoWidth: mainVideoRef.current.videoWidth,
                videoHeight: mainVideoRef.current.videoHeight,
                paused: mainVideoRef.current.paused,
                readyState: mainVideoRef.current.readyState,
                currentTime: mainVideoRef.current.currentTime
            });
            
            // Force update srcObject if it doesn't match the expected stream
            if (mainStream && mainVideoRef.current.srcObject !== mainStream) {
                console.log('[VideoDisplay] 🔧 FORCING srcObject update - mismatch detected:', {
                    currentSrcObject: mainVideoRef.current.srcObject?.id,
                    expectedStream: mainStream?.id
                });
                mainVideoRef.current.srcObject = mainStream;
            }
        }
    }, [mainStream]);

    const hasActiveVideo = (stream) => {
        return stream?.getVideoTracks().some(track => 
            track.readyState === 'live' && !track.muted
        ) || false;
    };

    const hasActiveAudio = (stream) => {
        return stream?.getAudioTracks().some(track => 
            track.readyState === 'live' && !track.muted
        ) || false;
    };

    const handleUserInteraction = () => {
        if (!hasUserInteracted) {
            console.log('[VideoDisplay] 👆 User interaction detected, enabling autoplay');
            setHasUserInteracted(true);
        }
    };

    return (
        <div className={`video-container ${isScreenSharing ? 'screen-share-active' : ''}`} onClick={handleUserInteraction}>
            <div className="main-video-wrapper">
                <video
                    key="main-video"  // Fixed key to prevent React from creating new elements
                    ref={(ref) => {
                        mainVideoRef.current = ref;
                        if (ref) {
                            console.log('[VideoDisplay] 🎥 MAIN VIDEO ELEMENT CREATED/REFERENCED:', {
                                element: ref,
                                currentSrcObject: ref.srcObject?.id || 'NO_SRCOBJECT',
                                expectedStream: mainStream?.id || 'NO_STREAM',
                                streamMatch: ref.srcObject?.id === mainStream?.id,
                                videoWidth: ref.videoWidth,
                                videoHeight: ref.videoHeight,
                                paused: ref.paused,
                                readyState: ref.readyState
                            });
                        }
                    }}
                    autoPlay
                    playsInline
                    muted={!isMainStreamRemote}  // Only mute if it's our local stream
                    controls={false}
                />
                {!hasActiveVideo(mainStream) && (
                    <div className="video-placeholder">
                        {isMainStreamRemote ? 'Remote Camera Off' : 'Camera Off'}
                    </div>
                )}
                {hasActiveVideo(mainStream) && mainVideoRef.current?.paused && (
                    <button 
                        className="play-button"
                        onClick={() => {
                            console.log('[VideoDisplay] 🎬 Manual play button clicked');
                            mainVideoRef.current?.play().catch(e => 
                                console.error('[VideoDisplay] Manual play failed:', e)
                            );
                        }}
                    >
                        ▶️ Play Video
                    </button>
                )}
                {mainStream && !hasActiveAudio(mainStream) && (
                    <div className="audio-indicator">
                        {isMainStreamRemote ? 'Remote Audio Off' : 'Audio Off'}
                    </div>
                )}
                
                {/* PiP window - ALWAYS visible, but only shows video when pipStream exists */}
                <div 
                    className="pip-video-wrapper"
                    style={{
                        zIndex: 1000, // Ensure PiP is above other elements
                        border: '3px solid red', // Temporary debug border
                        backgroundColor: 'rgba(255, 0, 0, 0.3)', // Temporary debug background
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        width: '200px',
                        height: '150px',
                        overflow: 'visible',
                        display: 'block',
                        visibility: 'visible',
                        opacity: '1',
                        pointerEvents: 'auto',
                        transform: 'none',
                        clip: 'auto',
                        clipPath: 'none'
                    }}
                >
                    {/* Debug indicator */}
                    <div style={{
                        position: 'absolute',
                        top: '-20px',
                        left: '0',
                        background: 'red',
                        color: 'white',
                        padding: '2px 4px',
                        fontSize: '10px',
                        zIndex: 10000
                    }}>
                        PIP RENDERED
                    </div>
                    
                    {pipStream ? (
                        <>
                            {console.log('[VideoDisplay] 🟢 RENDERING PIP WINDOW WITH STREAM:', {
                                streamId: pipStream?.id,
                                videoTracks: pipStream?.getVideoTracks().length || 0,
                                audioTracks: pipStream?.getAudioTracks().length || 0
                            })}
                        <video
                                key="pip-video"  // Fixed key to prevent React from creating new elements
                                ref={(ref) => {
                                    pipVideoRef.current = ref;
                                    if (ref) {
                                        console.log('[VideoDisplay] 🎥 PIP VIDEO ELEMENT CREATED:', {
                                            element: ref,
                                            srcObject: ref.srcObject,
                                            streamId: pipStream?.id,
                                            videoTracks: pipStream?.getVideoTracks().length || 0
                                        });
                                        
                                        // Set srcObject and play immediately when element is created
                                        if (pipStream) {
                                            console.log('[VideoDisplay] 🎬 Setting PiP video srcObject and playing');
                                            ref.srcObject = pipStream;
                                            
                                            // Play the video after a short delay to ensure srcObject is set
                                            setTimeout(() => {
                                                if (ref.srcObject) {
                                                    ref.play().catch(e => {
                                                        console.error('[VideoDisplay] PiP video play failed:', e);
                                                    });
                                                }
                                            }, 100);
                                        }
                                    }
                                }}
                            autoPlay
                            playsInline
                                muted
                                controls={false}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                    visibility: 'visible',
                                    opacity: '1'
                                }}
                                onLoadedMetadata={() => {
                                    console.log('[VideoDisplay] 🎬 PIP VIDEO onLoadedMetadata:', {
                                        videoWidth: pipVideoRef.current?.videoWidth,
                                        videoHeight: pipVideoRef.current?.videoHeight,
                                        duration: pipVideoRef.current?.duration,
                                        srcObject: pipVideoRef.current?.srcObject?.id
                                    });
                                }}
                                onCanPlay={() => {
                                    console.log('[VideoDisplay] 🎬 PIP VIDEO onCanPlay - video ready to play');
                                }}
                                onPlay={() => {
                                    console.log('[VideoDisplay] 🎬 PIP VIDEO STARTED PLAYING');
                                }}
                                onError={(e) => {
                                    console.error('[VideoDisplay] 🎬 PIP VIDEO ERROR:', e);
                                }}
                            />
                        </>
                    ) : (
                        <>
                            {console.log('[VideoDisplay] 🔴 PIP WINDOW RENDERED BUT NO STREAM AVAILABLE')}
                            <div style={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '12px',
                                textAlign: 'center'
                            }}>
                                No Local Video
                            </div>
                        </>
                        )}
                    </div>
            </div>
        </div>
    );
});

const VideoChat = ({
    // Connection state
    selectedPeer,
    onPeerSelect,
    isConnected,
    isConnecting,
    onConnect,
    onDisconnect,
    onLogout, // Add logout handler
    peerList,
    loginStatus,
    // Chat
    onSendMessage,
    receivedMessages,
    // UI state
    showChat,
    error,
    // User data
    user,
    provider
}) => {
    const [hasUserInteracted, setHasUserInteracted] = useState(false);
    const [mediaStateVersion, setMediaStateVersion] = useState(0); // Force re-renders on media state changes
    const mainVideoRef = useRef(null);
    const pipVideoRef = useRef(null);
    
    // Local state storage - updated only when WebRTC notifies us
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [screenShareStream, setScreenShareStream] = useState(null);
    const [remoteScreenShareStream, setRemoteScreenShareStream] = useState(null);
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [hasLocalVideo, setHasLocalVideo] = useState(false);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
    
    // Screen share support detection
    const [isScreenShareSupported, setIsScreenShareSupported] = useState(false);
    
    // Check screen share support on component mount
    useEffect(() => {
        const checkScreenShareSupport = () => {
            const isSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
            console.log('[VideoChat] 🖥️ Screen share support check:', {
                hasMediaDevices: !!navigator.mediaDevices,
                hasGetDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
                isSupported
            });
            setIsScreenShareSupported(isSupported);
        };
        
        checkScreenShareSupport();
    }, []);
    
    // Getter functions that use local state instead of calling provider
    const getLocalStream = () => localStream;
    const getRemoteStream = () => remoteStream;
    const getIsAudioEnabled = () => isAudioEnabled;
    const getIsVideoEnabled = () => isVideoEnabled;
    const getHasLocalVideo = () => hasLocalVideo;
    const getHasRemoteVideo = () => hasRemoteVideo;
    const getHasRemoteAudio = () => hasRemoteAudio;
    
    // Screen share stream assignment (moved up to avoid hoisting issue)
    // Prioritize local screen share over remote screen share
    const screenShareStreamForDisplay = screenShareStream || remoteScreenShareStream;
    
    // 🔍 SCREEN SHARE STREAM ASSIGNMENT LOGGING
    console.log('[VideoChat] 🖥️ SCREEN SHARE STREAM ASSIGNMENT:', {
        screenShareStreamForDisplayId: screenShareStreamForDisplay?.id,
        localScreenShareStreamId: screenShareStream?.id,
        remoteScreenShareStreamId: remoteScreenShareStream?.id,
        isLocalScreenShare: !!screenShareStream,
        isRemoteScreenShare: !!remoteScreenShareStream,
        finalStreamSource: screenShareStream ? 'LOCAL' : remoteScreenShareStream ? 'REMOTE' : 'NONE',
        streamTracks: screenShareStreamForDisplay?.getTracks().map(t => ({ 
            id: t.id, 
            kind: t.kind, 
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState
        })) || []
    });
    
    // Computed values - show video panel if any stream is available
    const shouldShowVideo = !!localStream || !!remoteStream || !!screenShareStreamForDisplay;
    
    // Debug: Log every time VideoChat renders
    console.log('[VideoChat] 🎬 RENDERING VIDEOCHAT COMPONENT:', {
        shouldShowVideo,
        isConnected,
        isVideoEnabled,
        localStreamExists: !!localStream,
        remoteStreamExists: !!remoteStream,
        hasUserInteracted,
        localStreamId: localStream?.id,
        remoteStreamId: remoteStream?.id,
        localVideoTracks: localStream?.getVideoTracks().length || 0,
        remoteVideoTracks: remoteStream?.getVideoTracks().length || 0
    });

    // Debug: Log when state changes
    useEffect(() => {
        console.log('[VideoChat] 🔄 VideoChat state changed:', {
            shouldShowVideo,
            isConnected,
            isVideoEnabled,
            localStreamExists: !!localStream,
            remoteStreamExists: !!remoteStream,
            localStreamId: localStream?.id,
            remoteStreamId: remoteStream?.id
        });
    }, [shouldShowVideo, isConnected, isVideoEnabled, localStream, remoteStream, mediaStateVersion]);
    
    // Listen for state changes from WebRTCProvider and update local state
    useEffect(() => {
        if (!provider) return;
        
        const handleStateChange = (event) => {
            console.log('[VideoChat] 🔄 Received stateChange event from provider:', event.data);
            
            // Get current state from provider before updating
            const oldLocalStream = localStream;
            const oldRemoteStream = remoteStream;
            const newLocalStream = provider.getLocalStream();
            const newRemoteStream = provider.getRemoteStream();
            
            // 🚨 DETECTION POINT: Check if remote video was lost
            const oldRemoteVideoState = hasRemoteVideo;
            const newRemoteVideoState = provider.getRemoteVideoState();
            const oldRemoteStreamExists = !!oldRemoteStream;
            const newRemoteStreamExists = !!newRemoteStream;
            
            if (oldRemoteVideoState && !newRemoteVideoState) {
                console.log('[VideoChat] 🚨 DETECTION POINT: Remote video state changed from ON to OFF');
            }
            
            if (oldRemoteStreamExists && !newRemoteStreamExists) {
                console.log('[VideoChat] 🚨 DETECTION POINT: Remote stream was removed/deleted');
            }
            
            if (oldRemoteStream?.id !== newRemoteStream?.id) {
                console.log('[VideoChat] 🚨 DETECTION POINT: Remote stream ID changed:', {
                    oldRemoteStreamId: oldRemoteStream?.id || 'NO_STREAM',
                    newRemoteStreamId: newRemoteStream?.id || 'NO_STREAM'
                });
            }
            
            console.log('[VideoChat] 🔄 STREAM STATE COMPARISON:', {
                oldLocalStreamId: oldLocalStream?.id,
                newLocalStreamId: newLocalStream?.id,
                oldRemoteStreamId: oldRemoteStream?.id,
                newRemoteStreamId: newRemoteStream?.id,
                localStreamChanged: oldLocalStream?.id !== newLocalStream?.id,
                remoteStreamChanged: oldRemoteStream?.id !== newRemoteStream?.id,
                oldLocalVideoTracks: oldLocalStream?.getVideoTracks().length || 0,
                newLocalVideoTracks: newLocalStream?.getVideoTracks().length || 0,
                oldRemoteVideoTracks: oldRemoteStream?.getVideoTracks().length || 0,
                newRemoteVideoTracks: newRemoteStream?.getVideoTracks().length || 0
            });
            
            // Update local state based on WebRTC provider state
            console.log('[VideoChat] 🔄 UPDATING LOCAL STATE FROM PROVIDER:', {
                newLocalStreamId: newLocalStream?.id,
                newRemoteStreamId: newRemoteStream?.id,
                providerLocalAudio: provider.getLocalAudioState(),
                providerLocalVideo: provider.getLocalVideoState(),
                providerRemoteVideo: provider.getRemoteVideoState(),
                providerRemoteAudio: provider.getRemoteAudioState(),
                providerScreenShare: provider.getScreenShareStream(),
                providerIsScreenSharing: provider.isScreenSharingActive(),
                oldLocalStreamId: localStream?.id,
                oldRemoteStreamId: remoteStream?.id
            });
            
            const newScreenShareStream = provider.getScreenShareStream();
            const newRemoteScreenShareStream = provider.getRemoteScreenShareStream(selectedPeer);
            
            console.log('[VideoChat] 🖥️ SCREEN SHARE STREAM UPDATE:', {
                oldScreenShareStreamId: screenShareStream?.id,
                newScreenShareStreamId: newScreenShareStream?.id,
                oldRemoteScreenShareStreamId: remoteScreenShareStream?.id,
                newRemoteScreenShareStreamId: newRemoteScreenShareStream?.id,
                selectedPeer,
                screenShareStreamChanged: screenShareStream?.id !== newScreenShareStream?.id,
                remoteScreenShareStreamChanged: remoteScreenShareStream?.id !== newRemoteScreenShareStream?.id
            });
            
            setLocalStream(newLocalStream);
            setRemoteStream(newRemoteStream);
            setScreenShareStream(newScreenShareStream);
            setRemoteScreenShareStream(newRemoteScreenShareStream);
            setIsAudioEnabled(provider.getLocalAudioState());
            setIsVideoEnabled(provider.getLocalVideoState());
            setIsScreenSharing(provider.isScreenSharingActive());
            setHasLocalVideo(provider.getLocalVideoState());
            setHasRemoteVideo(provider.getRemoteVideoState());
            setHasRemoteAudio(provider.getRemoteAudioState());
            
            // Force re-render by incrementing the media state version
            setMediaStateVersion(prev => prev + 1);
            
            console.log('[VideoChat] 🔄 STATE UPDATE COMPLETED - New values:', {
                localStreamId: newLocalStream?.id,
                remoteStreamId: newRemoteStream?.id,
                isAudioEnabled: provider.getLocalAudioState(),
                isVideoEnabled: provider.getLocalVideoState(),
                hasLocalVideo: provider.getLocalVideoState(),
                hasRemoteVideo: provider.getRemoteVideoState(),
                hasRemoteAudio: provider.getRemoteAudioState(),
                mediaStateVersion: mediaStateVersion + 1
            });
            
            // Debug: Check if streams are actually available
            console.log('[VideoChat] 🔄 STREAM AVAILABILITY CHECK:', {
                localStreamExists: !!newLocalStream,
                remoteStreamExists: !!newRemoteStream,
                localStreamVideoTracks: newLocalStream?.getVideoTracks().length || 0,
                remoteStreamVideoTracks: newRemoteStream?.getVideoTracks().length || 0,
                localStreamAudioTracks: newLocalStream?.getAudioTracks().length || 0,
                remoteStreamAudioTracks: newRemoteStream?.getAudioTracks().length || 0,
                shouldShowVideo: !!(newLocalStream || newRemoteStream)
            });
        };
        
        provider.addEventListener('stateChange', handleStateChange);
        
        return () => {
            provider.removeEventListener('stateChange', handleStateChange);
        };
    }, [provider, localStream, remoteStream, mediaStateVersion]);
    
    // Clean up screen sharing when disconnecting
    useEffect(() => {
        if (!isConnected && isScreenSharing && provider) {
            console.log('[VideoChat] 🖥️ Disconnect detected - cleaning up screen sharing');
            provider.stopScreenShare().catch(err => {
                console.error('[VideoChat] ❌ Error stopping screen share on disconnect:', err);
            });
        }
    }, [isConnected, isScreenSharing, provider]);
    
    // Helper function to check if local stream has video tracks
    const hasLocalVideoTracks = () => {
        const result = localStream && localStream.getVideoTracks().length > 0;
        console.log('[VideoChat] 🔍 hasLocalVideoTracks called:', {
            localStreamExists: !!localStream,
            localStreamId: localStream?.id,
            localVideoTracks: localStream?.getVideoTracks().length || 0,
            localAudioTracks: localStream?.getAudioTracks().length || 0,
            result
        });
        return result;
    };

    // Helper function to check if remote stream has enabled video tracks
    const hasEnabledRemoteVideo = () => {
        console.log('[VideoChat] 🔍 hasEnabledRemoteVideo called with:', {
            remoteStreamExists: !!remoteStream,
            remoteStreamId: remoteStream?.id,
            remoteVideoTracks: remoteStream?.getVideoTracks().length || 0,
            remoteAudioTracks: remoteStream?.getAudioTracks().length || 0
        });
        
        if (!remoteStream) {
            console.log('[VideoChat] 🚨 DETECTION POINT: No remote stream - remote video lost');
            return false;
        }
        const videoTracks = remoteStream.getVideoTracks();
        const enabledVideoTracks = videoTracks.filter(track => track.enabled);
        
        console.log('[VideoChat] 🔍 hasEnabledRemoteVideo check:', {
            totalVideoTracks: videoTracks.length,
            enabledVideoTracks: enabledVideoTracks.length,
            trackDetails: videoTracks.map(track => ({
                id: track.id,
                enabled: track.enabled,
                readyState: track.readyState,
                muted: track.muted
            }))
        });
        
        // Check if any video track exists and is enabled
        const hasEnabled = videoTracks.length > 0 && videoTracks.some(track => track.enabled);
        
        if (!hasEnabled) {
            console.log('[VideoChat] 🚨 DETECTION POINT: Remote video tracks disabled or missing - remote video lost');
        } else {
            console.log('[VideoChat] ✅ Remote video is available');
        }
        
        console.log('[VideoChat] ✅ hasEnabledRemoteVideo result:', hasEnabled);
        
        return hasEnabled;
    };

    // UI decides which stream goes where based on available streams
    // Main window: Show remote video if available, otherwise local video
    // FIXED: Prioritize video over audio - don't switch to remote stream just because it has audio
    
    // 🔍 CRITICAL STREAM ASSIGNMENT LOGGING - DETECTING LOST REMOTE VIDEO
    const hasEnabledRemoteVideoResult = hasEnabledRemoteVideo();
    console.log('[VideoChat] 🚨 CRITICAL STREAM ASSIGNMENT - DETECTING LOST REMOTE VIDEO:', {
        // Input conditions
        remoteStreamExists: !!remoteStream,
        localStreamExists: !!localStream,
        hasEnabledRemoteVideoResult,
        
        // Stream IDs for tracking
        remoteStreamId: remoteStream?.id || 'NO_REMOTE_STREAM',
        localStreamId: localStream?.id || 'NO_LOCAL_STREAM',
        
        // Remote stream details
        remoteVideoTracks: remoteStream?.getVideoTracks().length || 0,
        remoteAudioTracks: remoteStream?.getAudioTracks().length || 0,
        remoteVideoTracksEnabled: remoteStream?.getVideoTracks().filter(t => t.enabled).length || 0,
        
        // Local stream details
        localVideoTracks: localStream?.getVideoTracks().length || 0,
        localAudioTracks: localStream?.getAudioTracks().length || 0,
        localVideoTracksEnabled: localStream?.getVideoTracks().filter(t => t.enabled).length || 0,
        
        // Detection point identification
        detectionPoint: 'STREAM_ASSIGNMENT_LOGIC',
        timestamp: new Date().toISOString()
    });
    
    // LINE 1: Main stream assignment
    const mainStream = (remoteStream && hasEnabledRemoteVideoResult) ? remoteStream : localStream;
    console.log('[VideoChat] 🎯 LINE 1 - MAIN STREAM ASSIGNMENT:', {
        condition: `(remoteStream && hasEnabledRemoteVideoResult) ? remoteStream : localStream`,
        conditionResult: remoteStream && hasEnabledRemoteVideoResult,
        mainStreamResult: mainStream ? (remoteStream && hasEnabledRemoteVideoResult ? 'REMOTE' : 'LOCAL') : 'NONE',
        mainStreamId: mainStream?.id || 'NO_STREAM',
        mainStreamType: mainStream ? (mainStream === remoteStream ? 'REMOTE' : 'LOCAL') : 'NONE',
        remoteStreamId: remoteStream?.id || 'NO_REMOTE',
        localStreamId: localStream?.id || 'NO_LOCAL',
        hasEnabledRemoteVideoResult
    });
    
    // LINE 2: PiP stream assignment
    const hasRemoteVideoEnabled = hasEnabledRemoteVideoResult;
    const pipStream = (remoteStream && localStream && hasRemoteVideoEnabled) ? localStream : null;
    
    // LINE 3: Screen share stream assignment (NEW - separate from existing logic)
    // Prioritize local screen share over remote screen share
    console.log('[VideoChat] 🎯 LINE 3 - SCREEN SHARE STREAM ASSIGNMENT:', {
        localScreenShareStream: screenShareStream ? 'present' : 'null',
        remoteScreenShareStream: remoteScreenShareStream ? 'present' : 'null',
        finalScreenShareStream: screenShareStreamForDisplay ? 'present' : 'null',
        screenShareStreamId: screenShareStreamForDisplay?.id
    });
    console.log('[VideoChat] 🎯 LINE 2 - PIP STREAM ASSIGNMENT:', {
        condition: `(remoteStream && localStream && hasRemoteVideoEnabled) ? localStream : null`,
        conditionResult: remoteStream && localStream && hasRemoteVideoEnabled,
        pipStreamResult: pipStream ? 'LOCAL' : 'NONE',
        pipStreamId: pipStream?.id || 'NO_STREAM',
        pipStreamType: pipStream ? 'LOCAL' : 'NONE',
        remoteStreamId: remoteStream?.id || 'NO_REMOTE',
        localStreamId: localStream?.id || 'NO_LOCAL',
        hasRemoteVideoEnabled
    });
    
    // 🔍 FINAL CALCULATED VALUES - AFTER ALL ASSIGNMENTS
    console.log('[VideoChat] 🎯 FINAL CALCULATED STREAM VALUES:', {
        // Main stream final value
        mainStream: mainStream,
        mainStreamId: mainStream?.id || 'NO_STREAM',
        mainStreamType: mainStream ? (mainStream === remoteStream ? 'REMOTE' : 'LOCAL') : 'NONE',
        mainStreamVideoTracks: mainStream?.getVideoTracks().length || 0,
        mainStreamAudioTracks: mainStream?.getAudioTracks().length || 0,
        
        // PiP stream final value
        pipStream: pipStream,
        pipStreamId: pipStream?.id || 'NO_STREAM',
        pipStreamType: pipStream ? 'LOCAL' : 'NONE',
        pipStreamVideoTracks: pipStream?.getVideoTracks().length || 0,
        pipStreamAudioTracks: pipStream?.getAudioTracks().length || 0,
        
        // Comparison with input streams
        mainStreamIsRemote: mainStream === remoteStream,
        mainStreamIsLocal: mainStream === localStream,
        pipStreamIsLocal: pipStream === localStream,
        
        // Final assignment summary
        finalAssignment: {
            mainWindowShows: mainStream ? (mainStream === remoteStream ? 'REMOTE_VIDEO' : 'LOCAL_VIDEO') : 'NO_VIDEO',
            pipWindowShows: pipStream ? 'LOCAL_VIDEO' : 'NO_VIDEO',
            totalStreamsAssigned: [mainStream, pipStream].filter(Boolean).length
        }
    });

    // 🔍 DETAILED STREAM ASSIGNMENT LOGGING
    console.log('[VideoChat] 🎯 DETAILED STREAM ASSIGNMENT:', {
        // Input conditions
        remoteStreamExists: !!remoteStream,
        localStreamExists: !!localStream,
        hasEnabledRemoteVideo: hasEnabledRemoteVideo(),
        hasRemoteVideoEnabled,
        
        // Stream IDs
        remoteStreamId: remoteStream?.id,
        localStreamId: localStream?.id,
        
        // Assignment logic
        mainStreamLogic: `(remoteStream && hasEnabledRemoteVideo()) ? remoteStream : localStream`,
        mainStreamResult: mainStream ? (remoteStream && hasEnabledRemoteVideo() ? 'REMOTE' : 'LOCAL') : 'NONE',
        mainStreamId: mainStream?.id,
        
        pipStreamLogic: `(remoteStream && localStream && hasRemoteVideoEnabled) ? localStream : null`,
        pipStreamResult: pipStream ? 'LOCAL' : 'NONE',
        pipStreamId: pipStream?.id,
        
        // Final assignment
        mainVideoElementStream: mainStream?.id || 'NO_STREAM',
        pipVideoElementStream: pipStream?.id || 'NO_STREAM'
    });

    console.log('[VideoChat] 🎯 STREAM ASSIGNMENT DEBUG:', {
        hasLocalVideo,
        hasRemoteVideo,
        hasRemoteVideoEnabled,
        localStreamExists: !!localStream,
        remoteStreamExists: !!remoteStream,
        localStreamId: localStream?.id,
        remoteStreamId: remoteStream?.id,
        mainStreamType: remoteStream ? 'REMOTE' : 'LOCAL',
        mainStreamId: mainStream?.id,
        pipStreamType: pipStream ? 'LOCAL' : 'NONE',
        pipStreamId: pipStream?.id,
        pipCondition: (remoteStream && localStream && hasRemoteVideoEnabled) ? 'SHOW' : 'HIDE',
        mainStreamVideoTracks: mainStream?.getVideoTracks().length || 0,
        pipStreamVideoTracks: pipStream?.getVideoTracks().length || 0,
        mainStreamAudioTracks: mainStream?.getAudioTracks().length || 0,
        pipStreamAudioTracks: pipStream?.getAudioTracks().length || 0
    });

    console.log('[VideoChat] 🎯 STREAM ASSIGNMENT LOGIC:', {
        remoteStreamExists: !!remoteStream,
        localStreamExists: !!localStream,
        hasRemoteVideoEnabled,
        mainStreamLogic: 'remoteStream || localStream',
        mainStreamResult: mainStream ? (remoteStream ? 'remote' : 'local') : 'none',
        pipStreamLogic: '(remoteStream && localStream && hasRemoteVideoEnabled) ? localStream : null',
        pipStreamResult: pipStream ? 'local' : 'none',
        pipCondition: (remoteStream && localStream && hasRemoteVideoEnabled) ? 'SHOW' : 'HIDE'
    });

    console.log('[VideoChat] 🎬 RENDERING VIDEOCHAT COMPONENT:', {
        shouldShowVideo,
        isConnected,
        isVideoEnabled,
        mainStreamExists: !!mainStream,
        pipStreamExists: !!pipStream,
        willRenderVideoDisplay: shouldShowVideo
    });

    // Debug: Check if we should render VideoDisplay
    if (shouldShowVideo) {
        console.log('[VideoChat] 🎯 SHOULD RENDER VIDEODISPLAY - Conditions met:', {
            shouldShowVideo,
            isConnected,
            isVideoEnabled,
            mainStreamExists: !!mainStream,
            pipStreamExists: !!pipStream,
            localStreamExists: !!localStream,
            localStreamId: localStream?.id,
            localStreamTracks: localStream?.getTracks().length || 0
        });
        
                 // Debug PiP window CSS if it should render
         if (remoteStream && localStream && hasRemoteVideoEnabled) {
            console.log('[VideoChat] 🎨 PiP WINDOW CSS PROPERTIES (if rendered):', {
                position: 'absolute',
                top: '20px',
                left: '20px',
                width: '200px',
                height: '150px',
                borderRadius: '8px',
                overflow: 'visible',
                backgroundColor: '#2a2a2a',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                display: 'block',
                visibility: 'visible',
                opacity: '1'
            });
            console.log('[VideoChat] ✅ PiP WINDOW SHOULD BE VISIBLE - All conditions met');
                 } else {
             console.log('[VideoChat] ❌ PiP WINDOW WILL NOT RENDER - Conditions not met:', {
                 hasRemoteVideo,
                 hasRemoteVideoEnabled,
                 localStreamExists: !!localStream,
                 hasLocalVideoTracks: localStream && localStream.getVideoTracks().length > 0,
                 isVideoEnabled,
                 localStreamId: localStream?.id,
                 localStreamTracks: localStream?.getTracks().length || 0,
                 localVideoTracks: localStream?.getVideoTracks().length || 0,
                 condition: remoteStream && localStream && hasRemoteVideoEnabled
             });
         }
    } else {
        console.log('[VideoChat] ❌ NOT RENDERING VIDEODISPLAY - Conditions not met:', {
            shouldShowVideo,
            isConnected,
            isVideoEnabled,
            mainStreamExists: !!mainStream,
            pipStreamExists: !!pipStream,
            localStreamExists: !!localStream
        });
    }

    // Handle media toggles directly
    const handleToggleAudio = async () => {
        if (!provider) return;
        
        const newAudioState = !isAudioEnabled;
        console.log(`[VideoChat] 🎤 handleToggleAudio called:`, {
            currentIsAudioEnabled: isAudioEnabled,
            newAudioState,
            provider: !!provider,
            hasLocalStream: !!localStream
        });
        
        try {
            // If no local stream exists and user wants to enable audio, create one
            if (!localStream && newAudioState) {
                console.log('[VideoChat] 🎤 No local stream found - creating new stream with audio enabled');
                await provider.initializeLocalMedia({ audio: true, video: false });
                console.log('[VideoChat] ✅ Local stream created with audio enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (localStream) {
                console.log('[VideoChat] 🎤 Using toggleMedia for existing stream');
                await provider.toggleMedia({ audio: newAudioState });
                console.log(`[VideoChat] ✅ Audio toggled to: ${newAudioState}`);
            } else {
                console.log('[VideoChat] 🔒 No local stream and not enabling audio - nothing to do');
            }
        } catch (err) {
            console.error('[VideoChat] Audio toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                alert('Microphone access denied. Please allow microphone permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                alert('Microphone is in use by another application. Please close other apps using the microphone and try again.');
            } else {
                alert('Failed to access microphone. Please check your microphone permissions and try again.');
            }
        }
    };

    const handleToggleVideo = async () => {
        if (!provider) return;
        
        const newVideoState = !isVideoEnabled;
        console.log(`[VideoChat] 🎬 handleToggleVideo called:`, {
            currentIsVideoEnabled: isVideoEnabled,
            newVideoState,
            provider: !!provider,
            hasLocalStream: !!localStream
        });
        
        try {
            // If no local stream exists and user wants to enable video, create one
            if (!localStream && newVideoState) {
                console.log('[VideoChat] 🎥 No local stream found - creating new stream with video enabled');
                await provider.initializeLocalMedia({ audio: false, video: true });
                console.log('[VideoChat] ✅ Local stream created with video enabled');
                return;
            }
            
            // Always use toggleMedia for existing streams to maintain consistent state management
            if (localStream) {
                console.log('[VideoChat] 🎥 Using toggleMedia for existing stream');
                await provider.toggleMedia({ video: newVideoState });
                console.log(`[VideoChat] ✅ Video toggled to: ${newVideoState}`);
            } else {
                console.log('[VideoChat] 🔒 No local stream and not enabling video - nothing to do');
            }
        } catch (err) {
            console.error('[VideoChat] Video toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                alert('Camera access denied. Please allow camera permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                alert('Camera is in use by another application. Please close other apps using the camera and try again.');
            } else {
                alert('Failed to access camera. Please check your camera permissions and try again.');
            }
        }
    };

    const handleToggleScreenShare = async () => {
        if (!provider) return;
        
        const newScreenShareState = !isScreenSharing;
        console.log(`[VideoChat] 🖥️ handleToggleScreenShare called:`, {
            currentIsScreenSharing: isScreenSharing,
            newScreenShareState,
            provider: !!provider
        });
        
        try {
            if (newScreenShareState) {
                // Start screen sharing
                console.log('[VideoChat] 🖥️ Starting screen share...');
                await provider.startScreenShare();
                console.log('[VideoChat] ✅ Screen share started');
            } else {
                // Stop screen sharing
                console.log('[VideoChat] 🖥️ Stopping screen share...');
                await provider.stopScreenShare();
                console.log('[VideoChat] ✅ Screen share stopped');
            }
        } catch (err) {
            console.error('[VideoChat] Screen share toggle error:', err);
            // Show user-friendly error message
            if (err.name === 'NotAllowedError') {
                alert('Screen sharing access denied. Please allow screen sharing permissions and try again.');
            } else if (err.name === 'NotReadableError') {
                alert('Screen sharing is in use by another application. Please close other apps using screen sharing and try again.');
            } else {
                alert('Failed to start screen sharing. Please check your permissions and try again.');
            }
        }
    };

    // Reset Methods
    const resetVideoDisplay = () => {
        console.log('[VideoChat] 🔄 RESET: Starting video display reset');
        
        // Reset video-related states
        setIsVideoEnabled(false);
        setHasRemoteVideo(false);
        setHasRemoteVideoEnabled(false);
        
        // Clear any video-related refs or state
        // Note: VideoDisplay component handles its own cleanup via React's cleanup
        
        console.log('[VideoChat] 🔄 RESET: Video display reset completed');
    };

    const resetMediaState = () => {
        console.log('[VideoChat] 🔄 RESET: Starting media state reset');
        
        // Reset all media-related states
        setIsVideoEnabled(false);
        setHasRemoteVideo(false);
        setHasRemoteVideoEnabled(false);
        
        // Clear any media-related state
        setLocalStream(null);
        setRemoteStream(null);
        
        console.log('[VideoChat] 🔄 RESET: Media state reset completed');
    };

    const reset = () => {
        console.log('[VideoChat] 🔄 RESET: Starting complete video chat reset');
        
        try {
            // Reset in order: video display → media state
            resetVideoDisplay();
            resetMediaState();
            
            console.log('[VideoChat] 🔄 RESET: Complete video chat reset successful');
        } catch (error) {
            console.error('[VideoChat] ❌ RESET: Error during reset:', error);
            throw error;
        }
    };

    // Reset method available for parent component to call
    // Note: Parent can call this method directly if needed

    return (
        <div className="video-chat">
            

            
            {shouldShowVideo && (
                <>
                    {console.log('[VideoChat] 🖥️ RENDERING VIDEODISPLAY WITH:', {
                        mainStream: remoteStream ? 'remote' : 'local',
                        mainStreamId: remoteStream ? remoteStream?.id : localStream?.id,
                        pipStream: (remoteStream && localStream && hasRemoteVideoEnabled) ? 'local' : 'null',
                        pipStreamId: (remoteStream && localStream && hasRemoteVideoEnabled) ? localStream?.id : null,
                        screenShareStream: screenShareStreamForDisplay ? 'present' : 'null',
                        screenShareStreamId: screenShareStreamForDisplay?.id,
                        hasRemoteVideo,
                        hasRemoteVideoEnabled,
                        hasLocalVideo,
                        localStreamExists: !!localStream,
                        isVideoEnabled,
                        shouldShowVideo,
                        pipStreamCondition: remoteStream && localStream && hasRemoteVideoEnabled,
                        isScreenSharing
                    })}
                    
                    {/* Screen Share Window (Window #1) - Full window, z-index bottom */}
                    {screenShareStreamForDisplay && (
                        <div className="screen-share-window">
                            <video
                                ref={(videoRef) => {
                                    if (videoRef && videoRef.srcObject !== screenShareStreamForDisplay) {
                                        console.log('[VideoChat] 🖥️ Setting screen share video srcObject:', screenShareStreamForDisplay.id);
                                        videoRef.srcObject = screenShareStreamForDisplay;
                                        videoRef.play().catch(e => console.log('[VideoChat] 🖥️ Screen share video play error:', e));
                                    }
                                }}
                                autoPlay
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        </div>
                    )}
                    
                    {/* Separate audio element for remote audio when remote has no video */}
                    {remoteStream && !hasEnabledRemoteVideo() && remoteStream.getAudioTracks().length > 0 && (
                        <audio
                            ref={(audioRef) => {
                                if (audioRef && audioRef.srcObject !== remoteStream) {
                                    console.log('[VideoChat] 🔊 Setting remote audio element srcObject:', remoteStream.id);
                                    audioRef.srcObject = remoteStream;
                                    audioRef.play().catch(e => console.log('[VideoChat] 🔊 Remote audio play error:', e));
                                }
                            }}
                            autoPlay
                            style={{ display: 'none' }}
                        />
                    )}
                    
                    <VideoDisplay
                        mainStream={mainStream}
                        pipStream={pipStream}
                        isMainStreamRemote={!!remoteStream}
                        isScreenSharing={!!screenShareStreamForDisplay}
                    />
                                         {console.log('[VideoChat] ✅ VideoDisplay component rendered with props:', {
                         mainStream: mainStream ? 'present' : 'null',
                         pipStream: pipStream ? 'present' : 'null',
                         shouldShowVideo,
                         pipStreamCondition: remoteStream && localStream && hasRemoteVideoEnabled,
                         hasRemoteVideo,
                         hasRemoteVideoEnabled,
                         localStreamExists: !!localStream,
                         isVideoEnabled
                     })}
                                         {console.log('[VideoChat] 🎯 PiP WINDOW RENDERING CONDITION:', {
                         condition: remoteStream && localStream && hasRemoteVideoEnabled,
                         hasRemoteVideo,
                         hasRemoteVideoEnabled,
                         hasLocalVideo,
                         localStreamExists: !!localStream,
                         isVideoEnabled,
                         pipStream: pipStream ? 'WILL RENDER' : 'WILL NOT RENDER'
                     })}
                                         {console.log('[VideoChat] 🔍 DETAILED PiP CONDITION BREAKDOWN:', {
                         hasRemoteVideo,
                         hasRemoteVideoEnabled,
                         hasLocalVideo,
                         localStreamExists: !!localStream,
                         isVideoEnabled,
                         condition1: !!remoteStream,
                         condition2: !!localStream,
                         condition3: hasRemoteVideoEnabled,
                         finalCondition: remoteStream && localStream && hasRemoteVideoEnabled,
                         remoteStreamExists: !!remoteStream,
                         remoteVideoTracks: remoteStream?.getVideoTracks().length || 0,
                         localVideoTracks: localStream?.getVideoTracks().length || 0
                     })}
                </>
            )}
            
            {/* Debug logging for stream assignment */}
            {shouldShowVideo && console.log('[VideoChat] Stream assignment:', {
                hasRemoteVideo,
                isVideoEnabled,
                mainStreamType: remoteStream ? 'remote' : 'local',
                mainStreamId: mainStream?.id,
                pipStreamType: pipStream ? 'Local' : 'none',
                pipStreamId: pipStream?.id
            })}
            

            
            {error && (
                <div className="error-message">
                    <div className="error-content">
                        <span>{error}</span>
                        {error.includes('failed') || error.includes('lost') ? (
                            <button 
                                className="retry-button" 
                                onClick={onConnect}
                                disabled={isConnecting}
                            >
                                {isConnecting ? 'Retrying...' : 'Retry Connection'}
                            </button>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoChat; 