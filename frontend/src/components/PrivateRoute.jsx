import React from 'react';
import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ children }) => {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        return <Navigate to="/login" />;
    }

    // Pass the user data to the child component
    return React.cloneElement(children, { user });
};

export default PrivateRoute; 