import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(() => {
        // Check if user data exists in localStorage
        const savedUser = localStorage.getItem('user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    // Simple login function
    const login = (email, password) => {
        // In a real app, you would validate against your backend
        const user = {
            id: Date.now(),
            email: email,
            username: email.split('@')[0]
        };
        localStorage.setItem('user', JSON.stringify(user));
        setCurrentUser(user);
        return user;
    };

    // Simple logout function
    const logout = () => {
        localStorage.removeItem('user');
        setCurrentUser(null);
    };

    const value = {
        currentUser,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
} 