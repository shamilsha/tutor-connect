import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
    return (
        <div className="landing-page">
            <div className="landing-content">
                <div className="landing-header">
                    <h1>Welcome to MyTutor - TEST</h1>
                    <p>
                        Connect with expert tutors in real-time through high-quality video calls,
                        interactive whiteboards, and seamless collaboration tools.
                    </p>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <h3>Video Tutoring</h3>
                        <p>
                            Crystal-clear video calls with screen sharing capabilities
                            for an immersive learning experience.
                        </p>
                    </div>
                    <div className="feature-card">
                        <h3>Interactive Whiteboard</h3>
                        <p>
                            Collaborate in real-time with our advanced digital
                            whiteboard for better understanding.
                        </p>
                    </div>
                    <div className="feature-card">
                        <h3>Instant Messaging</h3>
                        <p>
                            Stay connected with built-in chat functionality for
                            quick questions and file sharing.
                        </p>
                    </div>
                </div>

                <div className="auth-buttons">
                    <Link to="/signup" className="auth-button signup-button">
                        Get Started
                    </Link>
                    <Link to="/login" className="auth-button login-button">
                        Login
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default LandingPage; 