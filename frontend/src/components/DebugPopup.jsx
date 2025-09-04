import React from 'react';
import '../styles/DebugPopup.css';

const DebugPopup = ({ 
    isVisible, 
    onClose, 
    dashboardContent, 
    videoChat, 
    videoContainer, 
    mainVideoWrapper, 
    videoStreams, 
    viewport, 
    state 
}) => {
    if (!isVisible) return null;

    return (
        <div className="debug-popup-overlay" onClick={onClose}>
            <div className="debug-popup" onClick={(e) => e.stopPropagation()}>
                <div className="debug-popup-header">
                    <h3>🔍 Debug Information</h3>
                    <button 
                        className="debug-popup-close" 
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>
                <div className="debug-popup-content">
                    <div className="debug-section">
                        <h4>Viewport</h4>
                        <p>Width: {viewport.width}px, Height: {viewport.height}px</p>
                    </div>
                    
                    <div className="debug-section">
                        <h4>Dashboard Content</h4>
                        {dashboardContent ? (
                            <div>
                                <p>getBoundingClientRect: {Math.round(dashboardContent.rect.width)}px × {Math.round(dashboardContent.rect.height)}px</p>
                                <p>offsetWidth/Height: {dashboardContent.offsetWidth}px × {dashboardContent.offsetHeight}px</p>
                                <p>clientWidth/Height: {dashboardContent.clientWidth}px × {dashboardContent.clientHeight}px</p>
                                <p>Computed Style:</p>
                                <ul>
                                    <li>display: {dashboardContent.computedStyle.display}</li>
                                    <li>position: {dashboardContent.computedStyle.position}</li>
                                    <li>width: {dashboardContent.computedStyle.width}</li>
                                    <li>height: {dashboardContent.computedStyle.height}</li>
                                    <li>min-height: {dashboardContent.computedStyle.minHeight}</li>
                                    <li>flex: {dashboardContent.computedStyle.flex}</li>
                                </ul>
                            </div>
                        ) : (
                            <p>❌ Element not found</p>
                        )}
                    </div>
                    
                    <div className="debug-section">
                        <h4>Video Chat</h4>
                        {videoChat ? (
                            <div>
                                <p>getBoundingClientRect: {Math.round(videoChat.rect.width)}px × {Math.round(videoChat.rect.height)}px</p>
                                <p>offsetWidth/Height: {videoChat.offsetWidth}px × {videoChat.offsetHeight}px</p>
                                <p>clientWidth/Height: {videoChat.clientWidth}px × {videoChat.clientHeight}px</p>
                                <p>Computed Style:</p>
                                <ul>
                                    <li>display: {videoChat.computedStyle.display}</li>
                                    <li>position: {videoChat.computedStyle.position}</li>
                                    <li>width: {videoChat.computedStyle.width}</li>
                                    <li>height: {videoChat.computedStyle.height}</li>
                                    <li>min-height: {videoChat.computedStyle.minHeight}</li>
                                    <li>margin: {videoChat.computedStyle.margin}</li>
                                </ul>
                            </div>
                        ) : (
                            <p>❌ Element not found</p>
                        )}
                    </div>
                    
                    <div className="debug-section">
                        <h4>Video Container</h4>
                        {videoContainer ? (
                            <div>
                                <p>getBoundingClientRect: {Math.round(videoContainer.rect.width)}px × {Math.round(videoContainer.rect.height)}px</p>
                                <p>offsetWidth/Height: {videoContainer.offsetWidth}px × {videoContainer.offsetHeight}px</p>
                                <p>clientWidth/Height: {videoContainer.clientWidth}px × {videoContainer.clientHeight}px</p>
                                <p>Computed Style:</p>
                                <ul>
                                    <li>display: {videoContainer.computedStyle.display}</li>
                                    <li>position: {videoContainer.computedStyle.position}</li>
                                    <li>width: {videoContainer.computedStyle.width}</li>
                                    <li>height: {videoContainer.computedStyle.height}</li>
                                </ul>
                            </div>
                        ) : (
                            <p>❌ Element not found</p>
                        )}
                    </div>
                    
                    <div className="debug-section">
                        <h4>Video Streams</h4>
                        {videoStreams.length === 0 ? (
                            <p>❌ No video elements found</p>
                        ) : (
                            videoStreams.map((stream, index) => (
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
                            ))
                        )}
                    </div>
                    
                    <div className="debug-section">
                        <h4>State</h4>
                        <ul>
                            <li>isPeerConnected: {state.isPeerConnected ? '✅' : '❌'}</li>
                            <li>isConnecting: {state.isConnecting ? '✅' : '❌'}</li>
                            <li>isAudioEnabled: {state.isAudioEnabled ? '✅' : '❌'}</li>
                            <li>isVideoEnabled: {state.isVideoEnabled ? '✅' : '❌'}</li>
                            <li>isScreenSharing: {state.isScreenSharing ? '✅' : '❌'}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DebugPopup;
