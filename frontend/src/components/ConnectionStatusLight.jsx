import React from 'react';
import '../styles/ConnectionStatusLight.css';

const ConnectionStatusLight = ({ status }) => {
    const getStatusColor = () => {
        switch (status) {
            case 'connected':
                return 'green';
            case 'error':
                return 'red';
            case 'disconnected':
                return 'red';
            case 'initial':
            default:
                return 'gray';
        }
    };

    return (
        <div className="status-light-container" title={`Status: ${status}`}>
            <div className={`status-light ${getStatusColor()}`}>
                <div className="status-light-shine"></div>
            </div>
        </div>
    );
};

export default ConnectionStatusLight; 