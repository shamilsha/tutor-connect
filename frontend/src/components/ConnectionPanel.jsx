import React, { useState, useEffect, useRef } from 'react';
import ConnectionStatusLight from './ConnectionStatusLight';
import '../styles/ConnectionPanel.css';
import { SignalingService } from '../services/SignalingService';

const ConnectionPanel = ({ 
    userId,
    connectionStatus,
    onConnect,
    onDisconnect,
    error,
    targetPeerId,
    setTargetPeerId,
    provider
}) => {
    const [availablePeers, setAvailablePeers] = useState([]);
    const signalingServiceRef = useRef(null);

    useEffect(() => {
        console.log('[ConnectionPanel] Initializing SignalingService');
        
        // Create SignalingService instance
        signalingServiceRef.current = new SignalingService(userId);
        
        // Set up peer list update handler
        signalingServiceRef.current.onPeerListUpdate = (peers) => {
            console.log('[ConnectionPanel] Received peer list update:', peers);
            setAvailablePeers(peers);
        };

        // Share SignalingService with WebRTCProvider
        if (provider) {
            provider.setSignalingService(signalingServiceRef.current);
        }

        // Cleanup on unmount
        return () => {
            console.log('[ConnectionPanel] Cleaning up SignalingService');
            if (signalingServiceRef.current) {
                signalingServiceRef.current.disconnect();
                signalingServiceRef.current = null;
            }
        };
    }, [userId, provider]);

    console.log('[ConnectionPanel] Rendering with peers:', availablePeers);
    const isPeerAvailable = availablePeers.length > 0;

    return (
        <div className="connection-panel">
            <div className="connection-panel-left">
                <ConnectionStatusLight status={connectionStatus} />
                <h3>Connection Status</h3>
            </div>
            <div className="connection-controls">
                <select
                    value={targetPeerId}
                    onChange={(e) => setTargetPeerId(e.target.value)}
                    disabled={connectionStatus === 'connected'}
                >
                    <option value="">Select a peer ({availablePeers.length} available)</option>
                    {availablePeers.map(peerId => (
                        <option key={peerId} value={peerId}>
                            Peer {peerId}
                        </option>
                    ))}
                </select>
                {connectionStatus !== 'connected' ? (
                    <button 
                        onClick={onConnect}
                        disabled={connectionStatus === 'connecting' || !isPeerAvailable || !targetPeerId}
                    >
                        {!isPeerAvailable ? 'No Peers Available' : 
                         connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                    </button>
                ) : (
                    <button 
                        onClick={onDisconnect}
                        className="disconnect-button"
                    >
                        Disconnect
                    </button>
                )}
            </div>
            <div className="user-info">Your ID: {userId}</div>
            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}
        </div>
    );
};

export default ConnectionPanel; 