import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = ({ children }) => {
    const auth = useAuth(); // Get the whole auth object instead of destructuring

    if (!auth?.currentUser) {
        return <Navigate to="/login" />;
    }

    // Pass the user data to the child component (Dashboard)
    return React.cloneElement(children, { user: auth.currentUser });
};

export default PrivateRoute; 