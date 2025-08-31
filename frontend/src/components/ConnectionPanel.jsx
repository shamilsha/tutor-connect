import React, { useState, useEffect } from 'react';
import { FaVideo, FaVideoSlash, FaMicrophone, FaMicrophoneSlash, FaDesktop, FaStop, FaBan } from 'react-icons/fa';
import ConnectionStatusLight from './ConnectionStatusLight';
import '../styles/ConnectionPanel.css';

const ConnectionPanel = ({
    selectedPeer,
    onPeerSelect,
    isConnected,
    isConnecting,
    onConnect,
    onDisconnect,
    onLogout, // Add logout handler
    peerList = [],
    loginStatus = 'connected', // 'connected' or 'failed'
    isAudioEnabled = false,
    isVideoEnabled = false,
    isScreenSharing = false,
    isScreenShareSupported = true,
    onToggleAudio,
    onToggleVideo,
    onToggleScreenShare
}) => {
    const [isPeerListEnabled, setIsPeerListEnabled] = useState(true);

    useEffect(() => {
        // Disable peer selection when connected
        setIsPeerListEnabled(!isConnected && !isConnecting);
    }, [isConnected, isConnecting]);

    // Auto-select first peer if there's only one and none selected
    useEffect(() => {
        if (peerList.length === 1 && !selectedPeer && !isConnected && !isConnecting) {
            onPeerSelect(peerList[0].id);
        }
    }, [peerList, selectedPeer, isConnected, isConnecting, onPeerSelect]);

    const handleConnectionClick = () => {
        if (isConnected) {
            onDisconnect();
        } else if (!isConnecting && selectedPeer) {
            onConnect();
        }
    };

    // Determine button state and text
    const getButtonState = () => {
        if (isConnecting) {
            return {
                text: 'Connecting...',
                disabled: true
            };
        }
        
        if (isConnected) {
            return {
                text: 'Disconnect',
                disabled: false
            };
        }
        
        if (peerList.length === 0) {
            return {
                text: 'No Peers Available',
                disabled: true
            };
        }
        
        if (!selectedPeer) {
            return {
                text: 'Select a Peer',
                disabled: true
            };
        }
        
        return {
            text: 'Connect',
            disabled: false
        };
    };

    const buttonState = getButtonState();

    // Reset Methods
    const resetPeerList = () => {
        console.log('[ConnectionPanel] 🔄 RESET: Starting peer list reset');
        
        // DON'T reset peer selection - keep it for reconnection
        // if (onPeerSelect) {
        //     onPeerSelect('');
        // }
        
        // Enable peer list for future connections
        setIsPeerListEnabled(true);
        
        console.log('[ConnectionPanel] 🔄 RESET: Peer list reset completed - peer selection preserved');
    };

    const resetConnectionState = () => {
        console.log('[ConnectionPanel] 🔄 RESET: Starting connection state reset');
        
        // Reset connection-related states
        // Note: Connection states are managed by parent components
        // This method is for any local state cleanup
        
        console.log('[ConnectionPanel] 🔄 RESET: Connection state reset completed');
    };

    const reset = () => {
        console.log('[ConnectionPanel] 🔄 RESET: Starting complete connection panel reset');
        
        try {
            // Reset in order: peer list → connection state
            resetPeerList();
            resetConnectionState();
            
            console.log('[ConnectionPanel] 🔄 RESET: Complete connection panel reset successful');
        } catch (error) {
            console.error('[ConnectionPanel] ❌ RESET: Error during reset:', error);
            throw error;
        }
    };

    // Reset method available for parent component to call
    // Note: Parent can call this method directly if needed

    // Debug logging for mobile visibility
    console.log('[ConnectionPanel] Rendering with state:', {
        isConnected,
        isAudioEnabled,
        isVideoEnabled,
        isScreenSharing,
        isScreenShareSupported,
        peerListLength: peerList.length,
        selectedPeer,
        buttonState: buttonState.text
    });

    return (
        <div className="connection-panel">
            {/* Login Status */}
            <div className="status-section">
                <ConnectionStatusLight status={loginStatus} />
                <span className="status-text">
                    {loginStatus === 'connected' ? 'Logged In' : 'Login Failed'}
                </span>
            </div>

            {/* Peer Selection Section */}
            <div className="peer-selection-section">
                {peerList.length === 0 ? (
                    <div className="no-peers-message">
                        No peers available. Waiting for others to join...
                    </div>
                ) : (
                    <select
                        value={selectedPeer}
                        onChange={(e) => onPeerSelect(e.target.value)}
                        disabled={!isPeerListEnabled}
                        className="peer-select"
                    >
                        <option value="">Select a peer</option>
                        {peerList.map((peer) => (
                            <option key={peer.id} value={peer.id}>
                                {peer.name || peer.id}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Connect Button - Only show when not connected */}
            {!isConnected && (
                <div className="connection-button-section">
                    <button
                        className="connection-button"
                        onClick={handleConnectionClick}
                        disabled={buttonState.disabled}
                    >
                        {buttonState.text}
                    </button>
                </div>
            )}

            {/* Media Controls - Only show when connected */}
            {isConnected && (
                <div className="media-controls-section">
                    <button
                        className={`media-button ${isConnected ? 'connected' : ''}`}
                        onClick={handleConnectionClick}
                        title="Disconnect"
                    >
                        Disconnect
                    </button>
                    <button
                        className={`media-button ${isAudioEnabled ? 'active' : ''}`}
                        onClick={onToggleAudio}
                        title={isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                    >
                        {isAudioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    </button>
                    <button
                        className={`media-button ${isVideoEnabled ? 'active' : ''}`}
                        onClick={onToggleVideo}
                        title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
                    >
                        {isVideoEnabled ? <FaVideo /> : <FaVideoSlash />}
                    </button>
                    <button
                        className={`media-button ${isScreenSharing ? 'active' : ''}`}
                        onClick={onToggleScreenShare}
                        disabled={!isScreenShareSupported}
                        title={
                            !isScreenShareSupported 
                                ? 'Screen sharing not supported on this device/browser' 
                                : (isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share')
                        }
                    >
                        {!isScreenShareSupported ? <FaBan /> : (isScreenSharing ? <FaStop /> : <FaDesktop />)}
                    </button>
                    {onLogout && (
                        <button
                            className="logout-button"
                            onClick={onLogout}
                            title="Logout"
                        >
                            Logout
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default ConnectionPanel; 