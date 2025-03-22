import React from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import '../styles/MediaControlPanel.css';

const MediaControlPanel = ({ 
    isAudioEnabled, 
    isVideoEnabled, 
    onToggleAudio, 
    onToggleVideo 
}) => {
    return (
        <div className="media-control-panel">
            <button 
                className={`control-button ${!isAudioEnabled ? 'disabled' : ''}`}
                onClick={onToggleAudio}
                title={isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}
            >
                {isAudioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
            </button>
            <button 
                className={`control-button ${!isVideoEnabled ? 'disabled' : ''}`}
                onClick={onToggleVideo}
                title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
            >
                {isVideoEnabled ? <FaVideo /> : <FaVideoSlash />}
            </button>
        </div>
    );
};

export default MediaControlPanel; 