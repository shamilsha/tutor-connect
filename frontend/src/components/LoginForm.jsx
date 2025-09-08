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
            // Set up registration handler before attempting to connect
            await new Promise((resolve, reject) => {
                let registrationTimeout;
                
                // Set up one-time registration handler
                const handleRegistration = (isConnected) => {
                    if (isConnected) {
                        console.log('[LoginForm] ✅ Registration confirmed');
                        clearTimeout(registrationTimeout);
                        signalingService.onConnectionStatusChange = null; // Remove handler
                        resolve();
                    }
                };

                // Set up connection status handler
                signalingService.onConnectionStatusChange = handleRegistration;

                // Set timeout for registration
                registrationTimeout = setTimeout(() => {
                    console.error('[LoginForm] ⏰ LOGIN TIMEOUT: Login process failed after 5 seconds');
                    console.error('[LoginForm] ⏰ LOGIN TIMEOUT: Source - LoginForm.jsx registration timeout');
                    signalingService.onConnectionStatusChange = null;
                    reject(new Error('Login timeout'));
                }, 5000);

                // Attempt to login and connect
                signalingService.connect({
                    email,
                    password
                }).catch(reject);
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
                    {error && <div className="error-message">{error}</div>}
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