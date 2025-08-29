import React, { useState, useEffect, useRef } from 'react';
import '../styles/VideoChat.css';
import ConnectionPanel from './ConnectionPanel';
import ChatPanel from './ChatPanel';

const VideoDisplay = React.memo(({ mainStream, pipStream, isMainStreamRemote }) => {
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

            // Only update srcObject if it's actually different
            if (stream !== videoRef.current.srcObject) {
                console.log(`[VideoDisplay] 🔄 Updating ${videoRef === pipVideoRef ? 'PIP' : 'MAIN'} video srcObject:`, {
                    oldSrcObject: videoRef.current.srcObject?.id,
                    newSrcObject: stream.id
                });
                
                // Pause current playback before changing srcObject
                if (!videoRef.current.paused) {
                    videoRef.current.pause();
                }
                
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

        // Play main video immediately
        console.log('[VideoDisplay] 🎬 CALLING playVideo for mainStream:', {
            streamId: mainStream?.id,
            videoTracks: mainStream?.getVideoTracks().length || 0,
            isMainStreamRemote
        });
        
        // Only call playVideo if mainStream exists
        if (mainStream) {
        playVideo(mainVideoRef, mainStream);
        } else {
            console.log('[VideoDisplay] ⚠️ mainStream is null/undefined, skipping playVideo call');
        }
        
        // For PiP video, don't call playVideo automatically - let the video element handle it
        if (pipStream) {
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
                mainStreamId: mainStream?.id,
                videoWidth: mainVideoRef.current.videoWidth,
                videoHeight: mainVideoRef.current.videoHeight,
                paused: mainVideoRef.current.paused,
                readyState: mainVideoRef.current.readyState,
                currentTime: mainVideoRef.current.currentTime
            });
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
        <div className="video-container" onClick={handleUserInteraction}>
            <div className="main-video-wrapper">
                <video
                    key={`main-${mainStream?.id || 'null'}`}
                    ref={mainVideoRef}
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
                                key={`pip-${pipStream?.id || 'null'}`}
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
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [hasLocalVideo, setHasLocalVideo] = useState(false);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
    
    // Getter functions that use local state instead of calling provider
    const getLocalStream = () => localStream;
    const getRemoteStream = () => remoteStream;
    const getIsAudioEnabled = () => isAudioEnabled;
    const getIsVideoEnabled = () => isVideoEnabled;
    const getHasLocalVideo = () => hasLocalVideo;
    const getHasRemoteVideo = () => hasRemoteVideo;
    const getHasRemoteAudio = () => hasRemoteAudio;
    
    // Computed values - show video panel if any stream is available
    const shouldShowVideo = !!localStream || !!remoteStream;
    
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
                oldLocalStreamId: localStream?.id,
                oldRemoteStreamId: remoteStream?.id
            });
            
            setLocalStream(newLocalStream);
            setRemoteStream(newRemoteStream);
            setIsAudioEnabled(provider.getLocalAudioState());
            setIsVideoEnabled(provider.getLocalVideoState());
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
            console.log('[VideoChat] 🔍 hasEnabledRemoteVideo check: No remote stream');
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
        console.log('[VideoChat] ✅ hasEnabledRemoteVideo result:', hasEnabled);
        
        return hasEnabled;
    };

    // UI decides which stream goes where based on available streams
    // Main window: Show remote video if available, otherwise local video
    // FIXED: Prioritize video over audio - don't switch to remote stream just because it has audio
    const mainStream = (remoteStream && hasEnabledRemoteVideo()) ? remoteStream : localStream;
    // PiP window: Show local video only when remote video is in main window AND remote has enabled video
    const hasRemoteVideoEnabled = hasEnabledRemoteVideo();
    const pipStream = (remoteStream && localStream && hasRemoteVideoEnabled) ? localStream : null;

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
            <ConnectionPanel
                selectedPeer={selectedPeer}
                onPeerSelect={onPeerSelect}
                isConnected={isConnected}
                isConnecting={isConnecting}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                onToggleAudio={handleToggleAudio}
                onToggleVideo={handleToggleVideo}
                peerList={peerList}
            />
            
            {shouldShowVideo && (
                <>
                    {console.log('[VideoChat] 🖥️ RENDERING VIDEODISPLAY WITH:', {
                        mainStream: remoteStream ? 'remote' : 'local',
                        mainStreamId: remoteStream ? remoteStream?.id : localStream?.id,
                        pipStream: (remoteStream && localStream && hasRemoteVideoEnabled) ? 'local' : 'null',
                        pipStreamId: (remoteStream && localStream && hasRemoteVideoEnabled) ? localStream?.id : null,
                        hasRemoteVideo,
                        hasRemoteVideoEnabled,
                        hasLocalVideo,
                        localStreamExists: !!localStream,
                        isVideoEnabled,
                        shouldShowVideo,
                        pipStreamCondition: remoteStream && localStream && hasRemoteVideoEnabled
                    })}
                    
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
            
            {showChat && (
                <ChatPanel
                    user={user}
                    provider={provider}
                    peers={[selectedPeer]}
                    onSendMessage={onSendMessage}
                    receivedMessages={receivedMessages}
                />
            )}
            
            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}
        </div>
    );
};

export default VideoChat; 