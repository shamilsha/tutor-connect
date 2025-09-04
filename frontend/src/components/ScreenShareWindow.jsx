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

    // Handle video element stream assignment
    useEffect(() => {
        if (screenShareVideoRef.current) {
            if (screenShareStream) {
                console.log('[ScreenShareWindow] 🖥️ Setting screen share video srcObject and playing');
                screenShareVideoRef.current.srcObject = screenShareStream;
                screenShareVideoRef.current.play().catch(error => {
                    console.error('[ScreenShareWindow] 🖥️ Error playing screen share video:', error);
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

    // Don't render if not visible or no stream
    if (!isVisible || !screenShareStream) {
        if (debugMode) {
            console.log('[ScreenShareWindow] 🖥️ Not rendering - conditions not met:', {
                isVisible,
                hasStream: !!screenShareStream
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
                width: size.width,
                height: size.height,
                background: '#000',
                zIndex: useRelativePositioning ? 1 : 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid #ff6b6b',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
        >
            <video
                ref={screenShareVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
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
