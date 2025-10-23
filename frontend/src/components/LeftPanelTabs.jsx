import React from 'react';
import '../styles/LeftPanelTabs.css';

const LeftPanelTabs = ({ activeTab, onTabChange, hasUnreadMessages = false }) => {
    return (
        <div className="left-panel-tabs">
            <button 
                className={`tab-button ${activeTab === 'content' ? 'active' : ''}`}
                onClick={() => onTabChange('content')}
            >
                📚 Content Library
            </button>
            <button 
                className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => onTabChange('chat')}
            >
                💬 Chat Room
                {hasUnreadMessages && (
                    <span className="unread-indicator">●</span>
                )}
            </button>
        </div>
    );
};

export default LeftPanelTabs;
