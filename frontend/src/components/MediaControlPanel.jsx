import React from 'react';
import '../styles/MediaControlPanel.css';

const MediaControlPanel = ({ isConnected, showVideo, onToggleVideo }) => {
    return (
        <div className="media-controls">
            {isConnected && (
                <button
                    className={`media-toggle-button ${showVideo ? 'active' : ''}`}
                    onClick={onToggleVideo}
                >
                    {showVideo ? 'Hide Video' : 'Show Video'}
                </button>
            )}
        </div>
    );
};

export default MediaControlPanel; 