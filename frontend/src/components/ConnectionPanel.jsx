import React, { useState, useEffect } from 'react';
import { FaVideo, FaVideoSlash, FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';
import ConnectionStatusLight from './ConnectionStatusLight';
import '../styles/ConnectionPanel.css';

const ConnectionPanel = ({
    selectedPeer,
    onPeerSelect,
    isConnected,
    isConnecting,
    onConnect,
    onDisconnect,
    peerList = [],
    loginStatus = 'connected', // 'connected' or 'failed'
    isAudioEnabled = true,
    isVideoEnabled = false,
    onToggleAudio,
    onToggleVideo
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

    return (
        <div className="connection-panel">
            {/* Login Status Indicator */}
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

            {/* Connect/Disconnect Button */}
            <div className="connection-button-section">
                <button
                    className={`connection-button ${isConnected ? 'connected' : ''}`}
                    onClick={handleConnectionClick}
                    disabled={buttonState.disabled}
                >
                    {buttonState.text}
                </button>
            </div>

            {/* Media Controls */}
            <div className="media-controls-section">
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
            </div>
        </div>
    );
};

export default ConnectionPanel; 