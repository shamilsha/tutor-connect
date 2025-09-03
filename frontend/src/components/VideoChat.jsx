import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import '../styles/VideoChat.css';
import ChatPanel from './ChatPanel';

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

const VideoDisplay = React.memo(({ mainStream, pipStream, isScreenSharing, windowPosition, isDragging, onMouseDown, onTouchStart, containerDimensions, setContainerDimensions, hasBeenManuallyResized, setHasBeenManuallyResized }) => {
    const mainVideoRef = React.useRef(null);
    const pipVideoRef = React.useRef(null);

    // Debug logging
    safeLog('[VideoDisplay] Received streams:', {
        mainStream: mainStream ? 'Has stream' : 'No stream',
        pipStream: pipStream ? 'Has stream' : 'No stream',
        isScreenSharing
    });

         // Ensure DOM dimensions stay in sync with React state when manually resized
     useLayoutEffect(() => {
         if (hasBeenManuallyResized && mainVideoRef.current) {
             const container = mainVideoRef.current.closest('.video-container');
             if (container) {
                 console.log('[VideoDisplay] 🔧 Syncing DOM with manual resize state:', containerDimensions);
                 container.style.setProperty('width', `${containerDimensions.width}px`, 'important');
                 container.style.setProperty('height', `${containerDimensions.height}px`, 'important');
                 // Force reflow to ensure immediate update
                 container.offsetHeight;
             }
         }
     }, [hasBeenManuallyResized, containerDimensions]);
     
     // Simple stream assignment to video elements
     useEffect(() => {
         console.log('[VideoDisplay] Main stream effect triggered:', mainStream ? 'Has stream' : 'No stream');
        if (mainVideoRef.current) {
            if (mainStream) {
                console.log('[VideoDisplay] Setting main video srcObject');
                mainVideoRef.current.srcObject = mainStream;
                
                // Add debugging for video element state
                safeLog('[VideoDisplay] Video element state after setting srcObject:', {
                    videoWidth: mainVideoRef.current.videoWidth,
                    videoHeight: mainVideoRef.current.videoHeight,
                    readyState: mainVideoRef.current.readyState,
                    paused: mainVideoRef.current.paused,
                    currentTime: mainVideoRef.current.currentTime
                });
                
                mainVideoRef.current.play().catch(e => console.log('Main video play error:', e));
            } else {
                // Clear video when stream is removed to prevent still image
                console.log('[VideoDisplay] Clearing main video srcObject');
                mainVideoRef.current.srcObject = null;
                mainVideoRef.current.pause();
                mainVideoRef.current.currentTime = 0;
                mainVideoRef.current.load(); // Force reload to clear any cached frames
            }
        }
    }, [mainStream]);

    useEffect(() => {
        console.log('[VideoDisplay] PIP stream effect triggered:', pipStream ? 'Has stream' : 'No stream');
        if (pipVideoRef.current) {
            if (pipStream) {
                console.log('[VideoDisplay] Setting PIP video srcObject');
                pipVideoRef.current.srcObject = pipStream;
                pipVideoRef.current.play().catch(e => console.log('PIP video play error:', e));
            } else {
                // Clear PIP video when stream is removed to prevent still image
                console.log('[VideoDisplay] Clearing PIP video srcObject');
                pipVideoRef.current.srcObject = null;
                pipVideoRef.current.pause();
                pipVideoRef.current.currentTime = 0;
                pipVideoRef.current.load(); // Force reload to clear any cached frames
            }
        }
    }, [pipStream]);

        console.log('[VideoDisplay] 🔧 Rendering VideoDisplay component with resize handle');
    
    return (
                           <div 
              className={`video-container ${isScreenSharing ? 'screen-share-active' : ''}`}
                                                     style={{ 
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  margin: '8px',
                  padding: '8px',
                  position: 'fixed',
                  top: `${windowPosition.y}px`,
                  left: `${windowPosition.x}px`,
                  zIndex: 2000,
                  background: 'white',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  width: `${containerDimensions.width}px !important`,
                  height: `${containerDimensions.height}px !important`,
                  minWidth: '300px',
                  maxWidth: '800px',
                  minHeight: '350px',
                  maxHeight: '600px',
                  overflow: 'hidden'
              }}
                                                       onMouseDown={onMouseDown}
               onTouchStart={onTouchStart}
             ref={(el) => {
                 if (el) {
                     // Force sync DOM dimensions with React state when component mounts/re-renders
                     if (hasBeenManuallyResized) {
                         console.log('[VideoDisplay] 🔧 Forcing DOM sync with manual resize dimensions:', containerDimensions);
                         el.style.setProperty('width', `${containerDimensions.width}px`, 'important');
                         el.style.setProperty('height', `${containerDimensions.height}px`, 'important');
                         // Force reflow to ensure immediate update
                         el.offsetHeight;
                     }
                     
                     safeLog('[VideoDisplay] Video container dimensions:', {
                         offsetWidth: el.offsetWidth,
                         offsetHeight: el.offsetHeight,
                         clientWidth: el.clientWidth,
                         clientHeight: el.clientHeight,
                         scrollWidth: el.scrollWidth,
                         scrollHeight: el.scrollHeight,
                         hasBeenManuallyResized,
                         containerDimensions
                     });
                 }
             }}
            
        >
                                                   {/* Resize handle indicator */}
              <div 
                  style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      width: '20px',
                      height: '20px',
                      background: 'linear-gradient(-45deg, transparent 30%, #ff0000 30%, #ff0000 70%, transparent 70%)',
                      cursor: 'nw-resize',
                      zIndex: 1001,
                      border: '2px solid #ff0000',
                      borderRadius: '3px',
                      boxShadow: '0 2px 6px rgba(255,0,0,0.5)'
                  }}
                  title="Drag to resize video window (RED HANDLE)"
                  onClick={() => console.log('[VideoDisplay] 🔧 Resize handle clicked (not dragged)')}
                                     onMouseDown={(e) => {
                       console.log('[VideoDisplay] 🔧 Resize handle mouse down triggered');
                       e.stopPropagation(); // Prevent drag when resizing
                       e.preventDefault();
                       
                       const container = e.currentTarget.parentElement;
                       if (!container) {
                           console.log('[VideoDisplay] ❌ Resize failed: No container found');
                           return;
                       }
                       
                       console.log('[VideoDisplay] 🔧 Resize started:', {
                           startX: e.clientX,
                           startY: e.clientY,
                           startWidth: container.offsetWidth,
                           startHeight: container.offsetHeight,
                           containerElement: container.tagName,
                           containerId: container.id || 'no-id'
                       });
                       
                       const startX = e.clientX;
                       const startY = e.clientY;
                       const startWidth = container.offsetWidth;
                       const startHeight = container.offsetHeight;
                       
                                               const handleMouseMove = (moveEvent) => {
                            if (!container) {
                                console.log('[VideoDisplay] ❌ Resize move failed: Container lost');
                                return;
                            }
                            
                            const deltaX = moveEvent.clientX - startX;
                            const deltaY = moveEvent.clientY - startY;
                            
                            const newWidth = Math.max(300, Math.min(600, startWidth + deltaX));
                            const newHeight = Math.max(200, Math.min(600, startHeight + deltaY)); // Allow height to change more freely
                            
                            // SMOOTH RESIZE: Only update DOM during resize, not React state
                            container.style.setProperty('width', `${newWidth}px`, 'important');
                            container.style.setProperty('height', `${newHeight}px`, 'important');
                            
                            // Force a reflow to ensure the DOM updates immediately
                            container.offsetHeight; // This triggers a reflow
                            
                            console.log('[VideoDisplay] 🔧 Resize move:', {
                                deltaX,
                                deltaY,
                                newWidth,
                                newHeight,
                                offsetWidth: container.offsetWidth,
                                offsetHeight: container.offsetHeight
                            });
                        };
                       
                                               const handleMouseUp = () => {
                            console.log('[VideoDisplay] 🔧 Resize mouse up, cleaning up event listeners');
                            
                            // Mark that manual resize has occurred
                            setHasBeenManuallyResized(true);
                            
                            // SYNC STATE: Update React state with final dimensions after resize is complete
                            if (container) {
                                const finalWidth = container.offsetWidth;
                                const finalHeight = container.offsetHeight;
                                
                                // Update the parent's state to ensure consistency
                                setContainerDimensions({
                                    width: finalWidth,
                                    height: finalHeight
                                });
                                
                                console.log('[VideoDisplay] ✅ Resize complete, state synced:', {
                                    finalWidth,
                                    finalHeight,
                                    stateWidth: finalWidth,
                                    stateHeight: finalHeight
                                });
                            }
                            
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                        };
                       
                                               // Immediately mark as manually resized to prevent any automatic sizing interference
                        setHasBeenManuallyResized(true);
                        
                        console.log('[VideoDisplay] 🔧 Adding resize event listeners');
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                   }}
                  onTouchStart={(e) => {
                      e.stopPropagation(); // Prevent drag when resizing
                      e.preventDefault();
                      
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      
                      const touch = e.touches[0];
                      const startX = touch.clientX;
                      const startY = touch.clientY;
                      const startWidth = container.offsetWidth;
                      const startHeight = container.offsetHeight;
                      
                                                                     const handleTouchMove = (moveEvent) => {
                            if (!container) return;
                            
                            const touch = moveEvent.touches[0];
                            const deltaX = touch.clientX - startX;
                            const deltaY = touch.clientY - startY;
                            
                            const newWidth = Math.max(300, Math.min(600, startWidth + deltaX));
                            const newHeight = Math.max(200, Math.min(600, startHeight + deltaY)); // Allow height to change more freely
                           
                           // SMOOTH RESIZE: Only update DOM during resize, not React state
                           container.style.setProperty('width', `${newWidth}px`, 'important');
                           container.style.setProperty('height', `${newHeight}px`, 'important');
                           
                           // Force a reflow to ensure the DOM updates immediately
                           container.offsetHeight; // This triggers a reflow
                       };
                      
                                                                                           const handleTouchEnd = () => {
                            // Mark that manual resize has occurred
                            setHasBeenManuallyResized(true);
                            
                            // SYNC STATE: Update React state with final dimensions after touch resize is complete
                            if (container) {
                                const finalWidth = container.offsetWidth;
                                const finalHeight = container.offsetHeight;
                                
                                // Update the parent's state to ensure consistency
                                setContainerDimensions({
                                    width: finalWidth,
                                    height: finalHeight
                                });
                                
                                console.log('[VideoDisplay] ✅ Touch resize complete, state synced:', {
                                    finalWidth,
                                    finalHeight
                                });
                            }
                           
                           document.removeEventListener('touchmove', handleTouchMove, { passive: false });
                           document.removeEventListener('touchend', handleTouchEnd);
                       };
                      
                      // Immediately mark as manually resized to prevent any automatic sizing interference
                      setHasBeenManuallyResized(true);
                      
                      document.addEventListener('touchmove', handleTouchMove, { passive: false });
                      document.addEventListener('touchend', handleTouchEnd);
                  }}
              />
             
                          <div className="main-video-wrapper" style={{
                 width: 'calc(100% - 140px)', // Account for PIP space (120px + 20px margin)
                 height: 'calc(100% - 50px)', // Account for PIP space (90px + 20px margin)
                 overflow: 'hidden',
                 position: 'relative',
                 backgroundColor: '#f0f8ff', // Light blue background for container
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center'
             }}>
                 <video
                     ref={mainVideoRef}
                     autoPlay
                     playsInline
                     muted={false}
                     controls={false}
                     style={{
                         maxWidth: '100%',
                         maxHeight: '100%',
                         width: 'auto',
                         height: 'auto',
                         objectFit: 'contain',
                         border: '2px solid red',
                         backgroundColor: 'black'
                     }}
                                         onLoadedMetadata={() => {
                         if (mainVideoRef.current) {
                             const videoElement = mainVideoRef.current;
                             const videoWidth = videoElement.videoWidth;
                             const videoHeight = videoElement.videoHeight;
                             
                             safeLog('[VideoDisplay] Video metadata loaded:', {
                                 videoWidth: videoWidth,
                                 videoHeight: videoHeight,
                                 duration: videoElement.duration,
                                 readyState: videoElement.readyState,
                                 paused: videoElement.paused,
                                 currentTime: videoElement.currentTime,
                                 srcObject: videoElement.srcObject ? 'Has Stream' : 'No Stream',
                                 streamId: videoElement.srcObject?.id || 'No ID'
                             });
                             
                                                           // NEVER calculate dimensions if container has been manually resized
                             if (hasBeenManuallyResized) {
                                 console.log('[VideoDisplay] Skipping automatic sizing - container has been manually resized (flag set)');
                                 return;
                             }
                             
                             // Check if current dimensions are close to initial/default dimensions
                             const currentWidth = containerDimensions.width;
                             const currentHeight = containerDimensions.height;
                             
                             // More robust check: if dimensions are significantly different from initial, skip auto-sizing
                             const initialWidth = 400;
                             const initialHeight = 300;
                             const tolerance = 100; // Increased tolerance to prevent override
                             const isInitialSize = Math.abs(currentWidth - initialWidth) < tolerance && Math.abs(currentHeight - initialHeight) < tolerance;
                             
                             if (isInitialSize && videoWidth > 0 && videoHeight > 0) {
                                 const videoAspectRatio = videoWidth / videoHeight;
                                 
                                 // Calculate container dimensions to perfectly fit the video
                                 // Account for PIP space (120px width + 20px margin) and container padding (16px total)
                                 const pipSpace = 140; // 120px PIP width + 20px margin
                                 const containerPadding = 16; // 8px padding on each side
                                 
                                 // More conservative base dimensions to prevent oversized containers
                                 const maxVideoHeight = 350; // Reduced from 400 to keep container smaller
                                 const maxVideoWidth = 500; // Reduced from 800 to keep container smaller
                                 
                                 let baseHeight = Math.min(maxVideoHeight, 400);
                                 let calculatedWidth = (baseHeight * videoAspectRatio) + pipSpace + containerPadding;
                                 
                                 // If the calculated width is too large, recalculate based on max width
                                 if (calculatedWidth > maxVideoWidth) {
                                     calculatedWidth = maxVideoWidth;
                                     baseHeight = (maxVideoWidth - pipSpace - containerPadding) / videoAspectRatio;
                                 }
                                 
                                 // Ensure height doesn't exceed reasonable limits
                                 const maxContainerHeight = 450; // Reduced from 600
                                 if (baseHeight > maxContainerHeight - 50) { // Leave some space for PIP
                                     baseHeight = maxContainerHeight - 50;
                                     calculatedWidth = (baseHeight * videoAspectRatio) + pipSpace + containerPadding;
                                 }
                                 
                                 // Ensure minimum dimensions
                                 const finalWidth = Math.max(300, Math.min(calculatedWidth, 600)); // Reduced max from 800 to 600
                                 const finalHeight = Math.max(350, Math.min(baseHeight + 50, maxContainerHeight)); // +50 for PIP space
                                 
                                 setContainerDimensions({
                                     width: finalWidth,
                                     height: finalHeight
                                 });
                                 
                                 console.log('[VideoDisplay] Calculated optimal container dimensions:', {
                                     videoAspectRatio: videoAspectRatio.toFixed(2),
                                     videoDimensions: `${videoWidth}x${videoHeight}`,
                                     containerDimensions: `${finalWidth}x${finalHeight}`,
                                     mainVideoArea: `${finalWidth - pipSpace - containerPadding}x${baseHeight}`,
                                     constraints: `Max: 600x450, Video area: ${finalWidth - pipSpace - containerPadding}x${baseHeight}`
                                 });
                             } else {
                                 console.log('[VideoDisplay] Skipping automatic sizing - container has been manually resized:', {
                                     currentDimensions: `${currentWidth}x${currentHeight}`,
                                     isInitialSize,
                                     videoDimensions: `${videoWidth}x${videoHeight}`
                                 });
                             }
                         }
                     }}
                    onCanPlay={() => {
                        console.log('[VideoDisplay] Video can play');
                    }}
                    onPlay={() => {
                        console.log('[VideoDisplay] Video started playing');
                    }}
                />
                {!mainStream && (
                    <div className="video-placeholder">
                        No Video Available
                    </div>
                )}
                
                                 {/* PiP window - only show when pipStream exists */}
                 {pipStream && (
                                          <div className="pip-video-wrapper" style={{
                         position: 'absolute',
                         top: '10px',
                         right: '10px',
                         width: '120px',
                         height: '90px',
                         zIndex: 10,
                         border: '2px solid #fff',
                         borderRadius: '4px',
                         overflow: 'hidden',
                         backgroundColor: '#f0f8ff' // Light blue background for container
                     }}>
                                                   <video
                              ref={pipVideoRef}
                              autoPlay
                              playsInline
                              muted
                              controls={false}
                              style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  width: 'auto',
                                  height: 'auto',
                                  objectFit: 'contain'
                              }}
                             onLoadedMetadata={() => {
                                 if (pipVideoRef.current) {
                                     const videoElement = pipVideoRef.current;
                                     console.log('[VideoDisplay] PIP video metadata loaded:', {
                                         videoWidth: videoElement.videoWidth,
                                         videoHeight: videoElement.videoHeight
                                     });
                                 }
                             }}
                         />
                            </div>
                        )}
            </div>
        </div>
    );
});

const VideoChat = ({
    selectedPeer,
    onPeerSelect,
    isConnected,
    isConnecting,
    onConnect,
    onDisconnect,
    onLogout,
    peerList,
    loginStatus,
    onSendMessage,
    receivedMessages,
    showChat,
    error,
    user,
    provider
}) => {
    // State to trigger re-renders when streams change
    const [streamUpdateTrigger, setStreamUpdateTrigger] = useState(0);
    
    // Draggable window state
    const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    
    // Container dimensions state for resize functionality
    const [containerDimensions, setContainerDimensions] = useState({
        width: 400,
        height: 300
    });
    
    // Flag to track if container has been manually resized (persistent across re-renders)
    const [hasBeenManuallyResized, setHasBeenManuallyResized] = useState(false);

    // Listen to WebRTC provider stream changes to trigger re-renders
    useEffect(() => {
        if (!provider) return;
        
        const handleStreamChange = (event) => {
            // Only trigger re-render for streams related to the selected peer or local streams
            const isRelevantStream = event.peerId === selectedPeer || event.data.type === 'local';
            
            console.log('[VideoChat] 🔄 Stream change received:', {
                type: event.data.type,
                streamType: event.data.streamType || 'unknown',
                peerId: event.peerId,
                selectedPeer: selectedPeer,
                isRelevantStream: isRelevantStream,
                hasStream: !!event.data.stream,
                streamId: event.data.stream?.id,
                eventPeerId: event.peerId,
                eventDataType: event.data.type,
                condition1: event.peerId === selectedPeer,
                condition2: event.data.type === 'local',
                streamRemoved: event.data.stream === null
            });
            
            // Log when streams are removed
            if (event.data.stream === null) {
                console.log('[VideoChat] 🗑️ Stream removal detected:', {
                    peerId: event.peerId,
                    streamType: event.data.streamType,
                    dataType: event.data.type
                });
            }
            
            if (isRelevantStream) {
                console.log('[VideoChat] ✅ Triggering re-render for relevant stream change');
                setStreamUpdateTrigger(prev => prev + 1);
            } else {
                console.log('[VideoChat] ❌ Stream change not relevant, skipping re-render');
            }
        };

        // Listen to stream events (more targeted than stateChange)
        provider.addEventListener('stream', handleStreamChange);

        // Cleanup
        return () => {
            provider.removeEventListener('stream', handleStreamChange);
        };
    }, [provider, selectedPeer]);

    // Debug: Log when component re-renders
    console.log('[VideoChat] 🔄 Component re-render, streamUpdateTrigger:', streamUpdateTrigger);

    // Get streams directly from WebRTCProvider with clear, separate assignment for audio and video
    const getStreams = () => {
        if (!provider) return { 
            mainStream: null, 
            pipStream: null, 
            screenShareStream: null,
            localAudioStream: null,
            remoteAudioStream: null
        };

        // Get streams using available methods
        const screenShareStream = provider.getScreenShareStream() || provider.getRemoteScreen(selectedPeer);
        const localStream = provider.getLocalStream();
        const remoteStream = provider.getRemoteStream(selectedPeer);
        const remoteVideoStream = provider.getRemoteVideo(selectedPeer);
        const remoteAudioStream = provider.getRemoteAudio(selectedPeer);
        
        // Extract local video and audio from combined stream
        const localVideoStream = localStream ? localStream.getVideoTracks().length > 0 ? localStream : null : null;
        const localAudioStream = localStream ? localStream.getAudioTracks().length > 0 ? localStream : null : null;
        
        // Debug screen share detection
        console.log('[VideoChat] 🔍 Screen share detection debug:', {
            providerGetScreenShareStream: provider.getScreenShareStream() ? 'Has local screen share' : 'No local screen share',
            providerGetRemoteScreen: provider.getRemoteScreen(selectedPeer) ? 'Has remote screen share' : 'No remote screen share',
            finalScreenShareStream: screenShareStream ? `Has screen share (${screenShareStream.id})` : 'No screen share',
            selectedPeer,
            hasRemoteScreen: provider.hasRemoteScreen ? provider.hasRemoteScreen(selectedPeer) : 'Method not available'
        });

        // Debug logging
        console.log('[VideoChat] Stream assignment debug:', {
            screenShareStream: screenShareStream ? `Has stream (${screenShareStream.id})` : 'No stream',
            localStream: localStream ? `Has stream (${localStream.id})` : 'No stream',
            remoteStream: remoteStream ? `Has stream (${remoteStream.id})` : 'No stream',
            localVideoStream: localVideoStream ? `Has stream (${localVideoStream.id})` : 'No stream',
            remoteVideoStream: remoteVideoStream ? `Has stream (${remoteVideoStream.id})` : 'No stream',
            localAudioStream: localAudioStream ? `Has stream (${localAudioStream.id})` : 'No stream',
            remoteAudioStream: remoteAudioStream ? `Has stream (${remoteAudioStream.id})` : 'No stream',
            selectedPeer,
            providerExists: !!provider
        });

                 // VIDEO STREAM ASSIGNMENT - Remote video gets priority for main window
         let mainStream = null;
         let pipStream = null;
         // Rule 1: If only one video stream exists, it goes to main window
         if (localVideoStream && !remoteVideoStream) {
             mainStream = localVideoStream;
             pipStream = null;
         } else if (remoteVideoStream && !localVideoStream) {
             mainStream = remoteVideoStream;
             pipStream = null;
         }
         // Rule 2: If both video streams exist, REMOTE goes to main, LOCAL goes to PIP
         else if (localVideoStream && remoteVideoStream) {
             mainStream = remoteVideoStream;  // Remote video in main window
             pipStream = localVideoStream;    // Local video in PIP window
         }
         // Rule 3: If no video streams exist, both are null
         else {
             mainStream = null;
             pipStream = null;
         }
        
        // Debug stream assignment logic
        console.log('[VideoChat] 🔍 Stream assignment logic debug:', {
            localVideoExists: !!localVideoStream,
            remoteVideoExists: !!remoteVideoStream,
            screenShareStreamExists: !!screenShareStream,
            mainStreamAssigned: !!mainStream,
            pipStreamAssigned: !!pipStream,
            mainStreamId: mainStream?.id || 'No main stream',
            pipStreamId: pipStream?.id || 'No PIP stream',
            screenShareStreamId: screenShareStream?.id || 'No screen share stream',
            localAudioExists: !!localAudioStream,
            remoteAudioExists: !!remoteAudioStream
        });
        
                 console.log('[VideoChat] Final stream assignment:', {
             mainStream: mainStream ? `Has stream (${mainStream.id})` : 'No stream',
             pipStream: pipStream ? `Has stream (${pipStream.id})` : 'No stream',
             screenShareStream: screenShareStream ? `Has stream (${screenShareStream.id})` : 'No stream',
             localAudioStream: localAudioStream ? `Has stream (${localAudioStream.id})` : 'No stream',
             remoteAudioStream: remoteAudioStream ? `Has stream (${remoteAudioStream.id})` : 'No stream',
             isScreenSharing: !!screenShareStream,
             note: 'Audio streams are handled separately, video streams: REMOTE gets main window, LOCAL gets PIP when both exist'
         });
        
        return {
            mainStream: mainStream,
            pipStream: pipStream,
            screenShareStream: screenShareStream,
            localAudioStream: localAudioStream,
            remoteAudioStream: remoteAudioStream
        };
    };

    // Call getStreams with dependency on streamUpdateTrigger to ensure re-evaluation
    const streams = useMemo(() => {
        console.log('[VideoChat] 🔄 Re-evaluating streams (trigger:', streamUpdateTrigger, ')');
        const result = getStreams();
        
        // Debug screen share rendering
        if (result.screenShareStream) {
            console.log('[VideoChat] 🖥️ Screen share stream detected, will show in dedicated screen share window:', result.screenShareStream.id);
        }
        
        return result;
    }, [streamUpdateTrigger, selectedPeer, provider]);

    // Media toggle handlers are handled by ConnectionPanel - no duplicate handlers here

    // No need to sync button states from provider - UI manages its own state
    // The provider only manages streams, UI manages button states

    // Screen sharing cleanup is handled by ConnectionPanel

    // Monitor screen share stream changes
    useEffect(() => {
        if (streams.screenShareStream) {
            console.log('[VideoChat] 🖥️ Screen share stream changed:', {
                id: streams.screenShareStream.id,
                active: streams.screenShareStream.active,
                trackCount: streams.screenShareStream.getTracks().length
            });
        }
    }, [streams.screenShareStream]);

    // Monitor audio stream changes
    useEffect(() => {
        if (streams.localAudioStream) {
            console.log('[VideoChat] 🔊 Local audio stream changed:', {
                id: streams.localAudioStream.id,
                active: streams.localAudioStream.active,
                trackCount: streams.localAudioStream.getAudioTracks().length
            });
        }
    }, [streams.localAudioStream]);

    useEffect(() => {
        if (streams.remoteAudioStream) {
            console.log('[VideoChat] 🔊 Remote audio stream changed:', {
                id: streams.remoteAudioStream.id,
                active: streams.remoteAudioStream.active,
                trackCount: streams.remoteAudioStream.getAudioTracks().length
            });
        }
    }, [streams.remoteAudioStream]);

    // Video element ref for screen share
    const screenShareVideoRef = useRef(null);
    
    // Drag and drop handlers
    const handleMouseDown = (e) => {
        // Allow dragging from anywhere in the video-chat window
        // Only prevent dragging if clicking on interactive elements like buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        
        setIsDragging(true);
        // Calculate offset from current window position to mouse position
        setDragOffset({
            x: e.clientX - windowPosition.x,
            y: e.clientY - windowPosition.y
        });
    };
    
    const handleTouchStart = (e) => {
        // Prevent default touch behavior
        e.preventDefault();
        
        // Allow dragging from anywhere in the video-chat window
        // Only prevent dragging if clicking on interactive elements like buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        
        setIsDragging(true);
        const touch = e.touches[0];
        // Calculate offset from current window position to touch position
        setDragOffset({
            x: touch.clientX - windowPosition.x,
            y: touch.clientY - windowPosition.y
        });
    };
    
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        // Calculate new position based on current mouse position minus the offset
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Keep window within viewport bounds
        const maxX = window.innerWidth - 400; // Approximate video window width
        const maxY = window.innerHeight - 300; // Approximate video window height
        
        setWindowPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
        });
    };
    
    const handleTouchMove = (e) => {
        if (!isDragging) return;
        
        // Prevent default to avoid scrolling while dragging
        e.preventDefault();
        
        const touch = e.touches[0];
        // Calculate new position based on current touch position minus the offset
        const newX = touch.clientX - dragOffset.x;
        const newY = touch.clientY - dragOffset.y;
        
        // Keep window within viewport bounds
        const maxX = window.innerWidth - 400; // Approximate video window width
        const maxY = window.innerHeight - 300; // Approximate video window height
        
        setWindowPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
        });
    };
    
    const handleMouseUp = () => {
        setIsDragging(false);
    };
    
    const handleTouchEnd = () => {
        setIsDragging(false);
    };
    
    // Add global mouse and touch event listeners
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging, dragOffset]);

    // Ensure video element gets the stream and plays
    useEffect(() => {
        if (screenShareVideoRef.current) {
            if (streams.screenShareStream) {
                console.log('[VideoChat] 🖥️ Setting screen share video srcObject and playing');
                screenShareVideoRef.current.srcObject = streams.screenShareStream;
                screenShareVideoRef.current.play().catch(error => {
                    console.error('[VideoChat] 🖥️ Error playing screen share video:', error);
                });
            } else {
                // Clear screen share video when stream is removed to prevent still image
                console.log('[VideoChat] 🖥️ Clearing screen share video srcObject');
                screenShareVideoRef.current.srcObject = null;
                screenShareVideoRef.current.pause();
                screenShareVideoRef.current.currentTime = 0;
                screenShareVideoRef.current.load(); // Force reload to clear any cached frames
            }
        }
    }, [streams.screenShareStream]);

            return (
        <div className="video-chat">
            {streams.screenShareStream ? (() => {
                console.log('[VideoChat] 🖥️ Rendering screen share window with stream:', streams.screenShareStream.id);
                return (
                <div 
                    className="screen-share-window"
                    style={{ 
                        position: 'fixed',
                        top: '144px',
                        left: '0',
                        width: '100vw',
                        height: 'calc(100vh - 144px)',
                        background: '#000',
                        zIndex: 2000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '3px solid #ff6b6b',
                        boxSizing: 'border-box'
                    }}
                >
                    <video
                        ref={(el) => {
                            screenShareVideoRef.current = el;
                            if (el) {
                                console.log('[VideoChat] 🖥️ Screen share video element ref set:', el);
                                console.log('[VideoChat] 🖥️ Screen share video srcObject:', el.srcObject);
                                console.log('[VideoChat] 🖥️ Screen share video readyState:', el.readyState);
                                
                                // Check stream details
                                if (streams.screenShareStream) {
                                    console.log('[VideoChat] 🖥️ Screen share stream details:', {
                                        id: streams.screenShareStream.id,
                                        active: streams.screenShareStream.active,
                                        tracks: streams.screenShareStream.getTracks().map(track => ({
                                            id: track.id,
                                            kind: track.kind,
                                            enabled: track.enabled,
                                            readyState: track.readyState
                                        }))
                                    });
                                }
                            }
                        }}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onLoadedMetadata={() => console.log('[VideoChat] 🖥️ Screen share video loaded metadata')}
                        onCanPlay={() => console.log('[VideoChat] 🖥️ Screen share video can play')}
                        onError={(e) => console.error('[VideoChat] 🖥️ Screen share video error:', e)}
                        onLoadStart={() => console.log('[VideoChat] 🖥️ Screen share video load start')}
                        onLoadedData={() => console.log('[VideoChat] 🖥️ Screen share video loaded data')}
                    />
                    {/* Debug info */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,0,0,0.9)', color: 'white', padding: '10px', fontSize: '16px', zIndex: 1001, fontWeight: 'bold' }}>
                        🖥️ SCREEN SHARE ACTIVE: {streams.screenShareStream.id}
                    </div>
                    <div style={{ position: 'absolute', top: '50px', left: '10px', background: 'rgba(0,255,0,0.9)', color: 'black', padding: '10px', fontSize: '14px', zIndex: 1001 }}>
                        If you can see this, the screen share window is visible!
                    </div>
                </div>
                );
            })() : (
                <div style={{ 
                    position: 'fixed', 
                    top: '10px', 
                    right: '10px', 
                    background: 'rgba(0,0,0,0.8)', 
                    color: 'white', 
                    padding: '10px', 
                    fontSize: '12px', 
                    zIndex: 1000,
                    borderRadius: '5px'
                }}>
                    No screen share stream detected
                </div>
            )}
            
            {/* Hidden Audio Element - Only for remote audio streams */}
            {streams.remoteAudioStream && (
                <audio
                    ref={(el) => {
                        if (el) {
                            console.log('[VideoChat] 🔊 Setting remote audio stream:', streams.remoteAudioStream.id);
                            el.srcObject = streams.remoteAudioStream;
                            el.play().catch(error => {
                                console.error('[VideoChat] 🔊 Error playing remote audio:', error);
                            });
                        }
                    }}
                    autoPlay
                    playsInline
                    style={{ display: 'none' }}
                    onLoadedMetadata={() => console.log('[VideoChat] 🔊 Remote audio loaded metadata:', streams.remoteAudioStream.id)}
                    onCanPlay={() => console.log('[VideoChat] 🔊 Remote audio can play:', streams.remoteAudioStream.id)}
                    onError={(e) => console.error('[VideoChat] 🔊 Remote audio error:', e)}
                />
            )}
            
            {/* Audio Stream Debug Info */}
            {(streams.localAudioStream || streams.remoteAudioStream) && (
                <div style={{ 
                    position: 'fixed', 
                    top: '10px', 
                    left: '10px', 
                    background: 'rgba(0,0,255,0.8)', 
                    color: 'white', 
                    padding: '10px', 
                    fontSize: '12px', 
                    zIndex: 1000,
                    borderRadius: '5px'
                }}>
                    🔊 Audio Streams: 
                    {streams.localAudioStream && ` Local(${streams.localAudioStream.id})`}
                    {streams.remoteAudioStream && ` Remote(${streams.remoteAudioStream.id})`}
                </div>
            )}
            
                                                   {/* Main Video Display - Only for video streams */}
              {(streams.mainStream || streams.pipStream) && (
                                                                      <VideoDisplay
                        mainStream={streams.mainStream}
                        pipStream={streams.pipStream}
                        isScreenSharing={!!streams.screenShareStream}
                        windowPosition={windowPosition}
                        isDragging={isDragging}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        containerDimensions={containerDimensions}
                        setContainerDimensions={setContainerDimensions}
                        hasBeenManuallyResized={hasBeenManuallyResized}
                        setHasBeenManuallyResized={setHasBeenManuallyResized}
                    />
              )}

            {/* Media controls are handled by ConnectionPanel - no duplicate buttons here */}

            {/* Error Display */}
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