import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import '../styles/VideoChat.css';

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
                
                mainVideoRef.current.play().catch(e => {
                    // Provide user-friendly error message for video play errors
                    if (e.name === 'AbortError' || e.message?.includes('interrupted by a new load request')) {
                        console.log(`%c[VideoChat] ✅ Video playback interrupted (normal during logout/cleanup)`, 'font-weight: bold; color: blue;');
                    } else {
                        console.log(`%c[VideoChat] ⚠️ Video playback issue (normal during cleanup):`, 'font-weight: bold; color: blue;', e.message || e.name);
                    }
                });
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
                pipVideoRef.current.play().catch(e => {
                    // Provide user-friendly error message for PIP video play errors
                    if (e.name === 'AbortError' || e.message?.includes('interrupted by a new load request')) {
                        console.log(`%c[VideoChat] ✅ PIP video playback interrupted (normal during logout/cleanup)`, 'font-weight: bold; color: blue;');
                    } else {
                        console.log(`%c[VideoChat] ⚠️ PIP video playback issue (normal during cleanup):`, 'font-weight: bold; color: blue;', e.message || e.name);
                    }
                });
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
                  position: 'relative',
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
    const [windowPosition, setWindowPosition] = useState({ x: 20, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    
    // Container dimensions state for resize functionality
    const [containerDimensions, setContainerDimensions] = useState({
        width: 400,
        height: 300
    });
    
    // Flag to track if container has been manually resized (persistent across re-renders)
    const [hasBeenManuallyResized, setHasBeenManuallyResized] = useState(false);

    // Simple dragging handlers
    const handleMouseDown = (e) => {
        // Don't drag if clicking on buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - windowPosition.x,
            y: e.clientY - windowPosition.y
        });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        setWindowPosition({
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e) => {
        // Don't drag if touching buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        
        setIsDragging(true);
        const touch = e.touches[0];
        setDragOffset({
            x: touch.clientX - windowPosition.x,
            y: touch.clientY - windowPosition.y
        });
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        const touch = e.touches[0];
        setWindowPosition({
            x: touch.clientX - dragOffset.x,
            y: touch.clientY - dragOffset.y
        });
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
    };

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
            localAudioStream: null,
            remoteAudioStream: null
        };

        // Get streams using available methods
        const localStream = provider.getLocalStream();
        const remoteStream = provider.getRemoteStream(selectedPeer);
        const remoteVideoStream = provider.getRemoteVideo(selectedPeer);
        const remoteAudioStream = provider.getRemoteAudio(selectedPeer);
        
        // Extract local video and audio from combined stream
        const localVideoStream = localStream ? localStream.getVideoTracks().length > 0 ? localStream : null : null;
        const localAudioStream = localStream ? localStream.getAudioTracks().length > 0 ? localStream : null : null;

        // Debug logging
        console.log('[VideoChat] Stream assignment debug:', {
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
            mainStreamAssigned: !!mainStream,
            pipStreamAssigned: !!pipStream,
            mainStreamId: mainStream?.id || 'No main stream',
            pipStreamId: pipStream?.id || 'No PIP stream',
            localAudioExists: !!localAudioStream,
            remoteAudioExists: !!remoteAudioStream
        });
        
                 console.log('[VideoChat] Final stream assignment:', {
             mainStream: mainStream ? `Has stream (${mainStream.id})` : 'No stream',
             pipStream: pipStream ? `Has stream (${pipStream.id})` : 'No stream',
             localAudioStream: localAudioStream ? `Has stream (${localAudioStream.id})` : 'No stream',
             remoteAudioStream: remoteAudioStream ? `Has stream (${remoteAudioStream.id})` : 'No stream',
             note: 'Audio streams are handled separately, video streams: REMOTE gets main window, LOCAL gets PIP when both exist'
         });
        
        return {
            mainStream: mainStream,
            pipStream: pipStream,
            localAudioStream: localAudioStream,
            remoteAudioStream: remoteAudioStream
        };
    };

    // Call getStreams with dependency on streamUpdateTrigger to ensure re-evaluation
    const streams = useMemo(() => {
        console.log('[VideoChat] 🔄 Re-evaluating streams (trigger:', streamUpdateTrigger, ')');
        const result = getStreams();
        return result;
    }, [streamUpdateTrigger, selectedPeer, provider]);

    // Media toggle handlers are handled by ConnectionPanel - no duplicate handlers here

    // No need to sync button states from provider - UI manages its own state
    // The provider only manages streams, UI manages button states

    // Screen sharing cleanup is handled by ConnectionPanel



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

    return (
        <>
            {/* Audio Elements - Always render when audio streams exist, regardless of video */}
            {streams.remoteAudioStream && (
                <audio
                    ref={(el) => {
                        if (el) {
                            console.log('[VideoChat] 🔊 Setting remote audio stream:', streams.remoteAudioStream.id);
                            el.srcObject = streams.remoteAudioStream;
                            el.volume = 1.0; // ✅ Maximum volume for remote audio
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
            
            
            {/* Video Window - Only show when there are video streams */}
            {(streams.mainStream || streams.pipStream) && (
                <div 
                    className="video-chat"
                    style={{
                        position: 'fixed',
                        top: `${windowPosition.y}px`,
                        left: `${windowPosition.x}px`,
                        zIndex: 9999,
                        cursor: 'grab',
                        width: '400px',
                        height: '300px',
                        touchAction: 'none'
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                    onMouseUp={handleMouseUp}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Main Video Display */}
                    <VideoDisplay
                        mainStream={streams.mainStream}
                        pipStream={streams.pipStream}
                        isScreenSharing={false}
                        windowPosition={windowPosition}
                        isDragging={isDragging}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        containerDimensions={containerDimensions}
                        setContainerDimensions={setContainerDimensions}
                        hasBeenManuallyResized={hasBeenManuallyResized}
                        setHasBeenManuallyResized={setHasBeenManuallyResized}
                    />

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
            )}
        </>
    );
};

export default VideoChat; 