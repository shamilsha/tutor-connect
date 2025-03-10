import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ isLoggedIn }) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">TutorConnect</div>
      <div className="navbar-links">
        {isLoggedIn ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/logout">Logout</Link>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/signup">Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;