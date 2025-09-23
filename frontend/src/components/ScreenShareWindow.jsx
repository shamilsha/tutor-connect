import React, { useRef, useEffect } from 'react';
import '../styles/ScreenShareWindow.css';

const ScreenShareWindow = ({ 
    screenShareStream, 
    isVisible = true,
    position = { top: '0', left: '0' },
    size = { width: '100%', height: '100%' },
    onStreamChange = null,
    debugMode = false,
    useRelativePositioning = false
}) => {
    const screenShareVideoRef = useRef(null);

    // Monitor screen share stream changes
    useEffect(() => {
        if (screenShareStream) {
            console.log('[ScreenShareWindow] 🖥️ Screen share stream changed:', {
                id: screenShareStream.id,
                active: screenShareStream.active,
                trackCount: screenShareStream.getTracks().length
            });

            // Notify parent component about stream change
            if (onStreamChange) {
                onStreamChange(screenShareStream);
            }
        }
    }, [screenShareStream, onStreamChange]);

    // Monitor video dimensions and container expansion
    useEffect(() => {
        if (screenShareVideoRef.current && screenShareStream) {
            const video = screenShareVideoRef.current;
            const logDimensions = () => {
                console.log('[ScreenShareWindow] 📏 Screen share video dimensions:', {
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    displayWidth: video.offsetWidth,
                    displayHeight: video.offsetHeight,
                    containerWidth: size.width,
                    containerHeight: size.height,
                    naturalAspectRatio: video.videoWidth / video.videoHeight,
                    displayAspectRatio: video.offsetWidth / video.offsetHeight,
                    isCompressed: Math.abs((video.videoWidth / video.videoHeight) - (video.offsetWidth / video.offsetHeight)) > 0.01,
                    exceedsWidth: video.videoWidth > parseInt(size.width),
                    exceedsHeight: video.videoHeight > parseInt(size.height),
                    shouldShowScrollbar: video.videoWidth > parseInt(size.width) || video.videoHeight > parseInt(size.height),
                    scrollbarNeeded: video.videoWidth > parseInt(size.width) || video.videoHeight > parseInt(size.height) ? 'YES - Screen share exceeds container' : 'NO - Screen share fits in container'
                });
            };
            video.addEventListener('loadedmetadata', logDimensions);
            video.addEventListener('playing', logDimensions);
            return () => {
                video.removeEventListener('loadedmetadata', logDimensions);
                video.removeEventListener('playing', logDimensions);
            };
        }
    }, [screenShareStream, size]);

    // Handle video element stream assignment
    useEffect(() => {
        if (screenShareVideoRef.current) {
            if (screenShareStream) {
                console.log('[ScreenShareWindow] 🖥️ Setting screen share video srcObject and playing');
                screenShareVideoRef.current.srcObject = screenShareStream;
                screenShareVideoRef.current.play().catch(error => {
                    // Provide user-friendly error message for screen share video play errors
                    if (error.name === 'AbortError' || error.message?.includes('interrupted by a new load request')) {
                        console.log(`%c[ScreenShareWindow] ✅ Screen share video playback interrupted (normal during logout/cleanup)`, 'font-weight: bold; color: blue;');
                    } else {
                        console.log(`%c[ScreenShareWindow] ⚠️ Screen share video playback issue (normal during cleanup):`, 'font-weight: bold; color: blue;', error.message || error.name);
                    }
                });
            } else {
                // Clear screen share video when stream is removed to prevent still image
                console.log('[ScreenShareWindow] 🖥️ Clearing screen share video srcObject');
                screenShareVideoRef.current.srcObject = null;
                screenShareVideoRef.current.pause();
                screenShareVideoRef.current.currentTime = 0;
                screenShareVideoRef.current.load();
            }
        }
    }, [screenShareStream]);

        // Cleanup effect for component unmount
    useEffect(() => {
        return () => {
            console.log('[ScreenShareWindow] 🧹 Component unmounting, cleaning up screen share');

            // Clear video element to prevent memory leaks
            if (screenShareVideoRef.current) {
                screenShareVideoRef.current.srcObject = null;
                screenShareVideoRef.current.pause();
                screenShareVideoRef.current.currentTime = 0;
                screenShareVideoRef.current.load();
            }
        };
    }, []);

    // Browser/tab close cleanup for ScreenShareWindow
    useEffect(() => {
        const handleBeforeUnload = () => {
            console.log('[ScreenShareWindow] 🚪 Browser/tab closing - cleaning up screen share');
            
            // Clear video element to prevent memory leaks
            if (screenShareVideoRef.current) {
                screenShareVideoRef.current.srcObject = null;
                screenShareVideoRef.current.pause();
                screenShareVideoRef.current.currentTime = 0;
                screenShareVideoRef.current.load();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Debug mode: always show debug info
    if (debugMode) {
        console.log('[ScreenShareWindow] 🖥️ Debug mode - Component state:', {
            isVisible,
            hasStream: !!screenShareStream,
            streamId: screenShareStream?.id,
            streamActive: screenShareStream?.active,
            trackCount: screenShareStream?.getTracks().length,
            position,
            size,
            useRelativePositioning
        });
    }

    // Don't render if not visible - prioritize isVisible over stream existence
    if (!isVisible) {
        if (debugMode) {
            console.log('[ScreenShareWindow] 🖥️ Not rendering - isVisible is false:', {
                isVisible,
                hasStream: !!screenShareStream,
                reason: 'isVisible is false - hiding component'
            });
        }
        return null;
    }
    
    // Also don't render if no stream (but only if isVisible is true)
    if (!screenShareStream) {
        if (debugMode) {
            console.log('[ScreenShareWindow] 🖥️ Not rendering - no stream available:', {
                isVisible,
                hasStream: !!screenShareStream,
                reason: 'No stream available'
            });
        }
        return null;
    }

    return (
        <div 
            className="screen-share-window"
            style={{ 
                position: useRelativePositioning ? 'relative' : 'fixed',
                top: position.top,
                left: position.left,
                width: 'auto', // Allow container to expand to match video dimensions
                height: 'auto', // Allow container to expand to match video dimensions
                background: '#000',
                zIndex: useRelativePositioning ? 1 : 100,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                border: '3px solid #ff6b6b',
                boxSizing: 'border-box',
                overflow: 'visible' // Let dashboard-content handle scrolling
            }}
        >
            <video
                ref={screenShareVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: 'auto', // Allow video to maintain aspect ratio
                    height: 'auto', // Allow video to maintain aspect ratio
                    minWidth: '100%', // Ensure video is at least container width
                    minHeight: '100%', // Ensure video is at least container height
                    maxWidth: 'none', // Allow video to exceed container width
                    maxHeight: 'none', // Allow video to exceed container height
                    objectFit: 'contain', // Show full video content without distortion
                    background: '#000'
                }}
            />
            
            {debugMode && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '5px',
                    fontSize: '12px',
                    borderRadius: '3px'
                }}>
                    Screen Share: {screenShareStream?.id || 'No ID'}
                </div>
            )}
        </div>
    );
};

export default ScreenShareWindow;
