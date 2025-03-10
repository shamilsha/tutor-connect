import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <h1>Welcome to Tutor Connect</h1>
      <div className="auth-buttons">
        <Link to="/signup" className="btn">Sign Up</Link>
        <Link to="/login" className="btn">Login</Link>
      </div>
    </div>
  );
};

export default LandingPage; 