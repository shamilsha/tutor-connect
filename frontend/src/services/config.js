// Server configuration for Azure deployment

// Helper functions to avoid circular references
const isDevelopment = () => {
    // Check if we have Azure environment variables set
    if (process.env.REACT_APP_BACKEND_URL && process.env.REACT_APP_SIGNALING_URL) {
        console.log(`[Config] Azure environment variables detected, using production mode`);
        return false; // Use production mode when Azure env vars are set
    }
    
    // Use HTTP for localhost development
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const result = process.env.NODE_ENV === 'development' && isLocalhost;
    console.log(`[Config] isDevelopment check: hostname=${window.location.hostname}, NODE_ENV=${process.env.NODE_ENV}, isLocalhost=${isLocalhost}, result=${result}`);
    return result;
};

const getServerHostname = () => {
    // For Azure deployment, use environment variables
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const signalingUrl = process.env.REACT_APP_SIGNALING_URL;
    
    if (backendUrl && signalingUrl) {
        // Extract hostname from URLs
        const backendHostname = new URL(backendUrl).hostname;
        const signalingHostname = new URL(signalingUrl).hostname;
        
        // Both should be the same in Azure deployment
        console.log(`[Config] Using Azure hostname: ${backendHostname}`);
        return backendHostname;
    }
    
    // Fallback for local development
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
};

export const SERVER_CONFIG = {
    // Get the server hostname - use environment variable or fallback to current hostname
    getServerHostname,
    
    // Check if we're in development mode
    isDevelopment,
    
    // Backend API configuration
    backend: {
        getProtocol: () => {
            // Use HTTPS for Azure production
            return isDevelopment() ? 'http' : 'https';
        },
        port: isDevelopment() ? 8080 : 443, // Use 8080 for local, 443 for Azure
        getUrl: () => {
            // Hardcode Azure URLs for now
            const azureBackendUrl = 'https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net';
            const azureSignalingUrl = 'wss://tutor-cancen-signalling-e7bcaybxd0dygeec.canadacentral-01.azurewebsites.net';
            
            // Check if we're on Azure (not localhost)
            if (window.location.hostname.includes('azurestaticapps.net')) {
                console.log(`[Config] Using Azure backend URL: ${azureBackendUrl}`);
                return azureBackendUrl;
            }
            
            // Use environment variable for Azure deployment
            if (process.env.REACT_APP_BACKEND_URL) {
                console.log(`[Config] Using Azure backend URL: ${process.env.REACT_APP_BACKEND_URL}`);
                return process.env.REACT_APP_BACKEND_URL;
            }
            
            // Fallback for local development
            const protocol = isDevelopment() ? 'http' : 'https';
            const url = `${protocol}://${getServerHostname()}:${isDevelopment() ? 8080 : 443}`;
            console.log(`[Config] Backend URL: ${url} (${isDevelopment() ? 'development' : 'production'} mode)`);
            return url;
        }
    },
    
    // WebSocket signaling server configuration
    signaling: {
        getProtocol: () => {
            // Use WSS for Azure production
            return isDevelopment() ? 'ws' : 'wss';
        },
        port: isDevelopment() ? 8081 : 443, // Use 8081 for local, 443 for Azure
        getUrl: () => {
            // Hardcode Azure URLs for now
            const azureBackendUrl = 'https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net';
            const azureSignalingUrl = 'wss://tutor-cancen-signalling-e7bcaybxd0dygeec.canadacentral-01.azurewebsites.net';
            
            // Check if we're on Azure (not localhost)
            if (window.location.hostname.includes('azurestaticapps.net')) {
                console.log(`[Config] Using Azure signaling URL: ${azureSignalingUrl}`);
                return azureSignalingUrl;
            }
            
            // Use environment variable for Azure deployment
            if (process.env.REACT_APP_SIGNALING_URL) {
                console.log(`[Config] Using Azure signaling URL: ${process.env.REACT_APP_SIGNALING_URL}`);
                return process.env.REACT_APP_SIGNALING_URL;
            }
            
            // Fallback for local development
            const protocol = isDevelopment() ? 'ws' : 'wss';
            const url = `${protocol}://${getServerHostname()}:${isDevelopment() ? 8081 : 443}`;
            console.log(`[Config] Signaling URL: ${url} (${isDevelopment() ? 'development' : 'production'} mode)`);
            return url;
        }
    }
};

export default SERVER_CONFIG;
