import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunication } from '../context/CommunicationContext';
import '../styles/LoginForm.css';

export default function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { signalingService } = useCommunication();

    useEffect(() => {
        // this useEffect is used to log the component when it is mounted
        console.log('[LoginForm] 🔄 Component mounted');
        // this return function is used to clean up the component when it is unmounted
        return () => {
            console.log('[LoginForm] 🧹 Cleaning up component');
        };
    }, []); // empty dependency array means this useEffect will only run once when the component is mounted

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            // Step 1: Call backend directly for login validation
            console.log('[LoginForm] 🔐 Calling backend for login validation');
            const { SERVER_CONFIG } = await import('../services/config');
            const response = await fetch(`${SERVER_CONFIG.backend.getUrl()}/api/users/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                // Get the specific error message from the backend
                let errorMessage = 'Login failed';
                try {
                    const errorData = await response.text();
                    errorMessage = errorData || `Login failed (${response.status})`;
                } catch (e) {
                    errorMessage = `Login failed: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const userData = await response.json();
            console.log('[LoginForm] ✅ Backend login successful:', userData);

            // Step 2: Store user data in localStorage
            localStorage.setItem('user', JSON.stringify({
                id: userData.id,
                email: userData.email,
                name: userData.email // Use email as name since User model doesn't have name field
            }));

            // Step 3: Connect to signaling server
            console.log('[LoginForm] 🔌 Connecting to signaling server');
            await new Promise((resolve, reject) => {
                let connectionTimeout;
                
                const handleConnection = (isConnected) => {
                    if (isConnected) {
                        console.log('[LoginForm] ✅ Signaling server connection confirmed');
                        clearTimeout(connectionTimeout);
                        signalingService.onConnectionStatusChange = null;
                        resolve();
                    }
                };

                signalingService.onConnectionStatusChange = handleConnection;

                connectionTimeout = setTimeout(() => {
                    console.error('[LoginForm] ⏰ SIGNALING TIMEOUT: Signaling server connection failed after 10 seconds');
                    signalingService.onConnectionStatusChange = null;
                    reject(new Error('Signaling server connection timeout'));
                }, 10000);

                // Connect to signaling server with user ID
                signalingService.connectWithUserId(userData.id.toString()).catch((error) => {
                    clearTimeout(connectionTimeout);
                    reject(error);
                });
            });

            console.log('[LoginForm] 🚀 Navigating to dashboard');
            navigate('/dashboard');

        } catch (error) {
            console.error('[LoginForm] ❌ Login error:', error);
            setError(error.message || 'Failed to login. Please try again.');
            signalingService.onConnectionStatusChange = null; // Cleanup handler
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h2>Welcome to MyTutor</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                            required
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
} 