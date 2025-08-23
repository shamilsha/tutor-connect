// Server configuration for cross-machine connectivity
export const SERVER_CONFIG = {
    // Get the server hostname - use environment variable or fallback to current hostname
    getServerHostname: () => {
        // If we're accessing via IP address (cross-machine), use that IP for backend calls
        if (window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            console.log(`[Config] Using server hostname: ${window.location.hostname} (cross-machine access)`);
            return window.location.hostname;
        }
        // If we're on localhost, use the server's IP address for cross-machine connections
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // You can set this environment variable or use a default
            const serverHostname = process.env.REACT_APP_SERVER_HOSTNAME || '192.168.18.15';
            console.log(`[Config] Using server hostname: ${serverHostname} (from localhost)`);
            return serverHostname;
        }
        console.log(`[Config] Using server hostname: ${window.location.hostname} (current location)`);
        return window.location.hostname;
    },
    
    // Check if we're in development mode
    isDevelopment: () => {
        // Use HTTP for localhost development
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const result = process.env.NODE_ENV === 'development' && isLocalhost;
        console.log(`[Config] isDevelopment check: hostname=${window.location.hostname}, NODE_ENV=${process.env.NODE_ENV}, isLocalhost=${isLocalhost}, result=${result}`);
        return result;
    },
    
    // Backend API configuration
    backend: {
        getProtocol: () => {
            // Use HTTP for development to avoid SSL certificate issues
            return SERVER_CONFIG.isDevelopment() ? 'http' : 'http';
        },
        port: 8080,
        getUrl: () => {
            const protocol = SERVER_CONFIG.backend.getProtocol();
            const url = `${protocol}://${SERVER_CONFIG.getServerHostname()}:${SERVER_CONFIG.backend.port}`;
            console.log(`[Config] Backend URL: ${url} (${SERVER_CONFIG.isDevelopment() ? 'development' : 'production'} mode)`);
            return url;
        }
    },
    
    // WebSocket signaling server configuration
    signaling: {
        getProtocol: () => {
            // Use WS for development to avoid SSL certificate issues
            return SERVER_CONFIG.isDevelopment() ? 'ws' : 'ws';
        },
        port: 8081,
        getUrl: () => {
            const protocol = SERVER_CONFIG.signaling.getProtocol();
            const url = `${protocol}://${SERVER_CONFIG.getServerHostname()}:${SERVER_CONFIG.signaling.port}`;
            console.log(`[Config] Signaling URL: ${url} (${SERVER_CONFIG.isDevelopment() ? 'development' : 'production'} mode)`);
            return url;
        }
    }
};

export default SERVER_CONFIG;
