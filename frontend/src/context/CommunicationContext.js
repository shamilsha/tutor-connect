import { createContext, useContext } from 'react';
import SignalingService from '../services/SignalingService';

// Create singleton instances
const signalingService = new SignalingService();

// Create the context
export const CommunicationContext = createContext(null);

// Custom hook to use the communication context
export function useCommunication() {
    const context = useContext(CommunicationContext);
    if (!context) {
        throw new Error('useCommunication must be used within a CommunicationProvider');
    }
    return context;
}

// Provider component
export function CommunicationProvider({ children }) {
    // Create the value object that will be provided to consumers
    const value = {
        signalingService,
    };

    return (
        <CommunicationContext.Provider value={value}>
            {children}
        </CommunicationContext.Provider>
    );
} 