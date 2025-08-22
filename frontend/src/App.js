import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CommunicationProvider } from './context/CommunicationContext';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import DashboardPage from './components/DashboardPage';
import LandingPage from './components/LandingPage';
import PrivateRoute from './components/PrivateRoute';

function App() {
    return (
        <CommunicationProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginForm />} />
                    <Route path="/signup" element={<SignupForm />} />
                    <Route
                        path="/dashboard"
                        element={
                            <PrivateRoute>
                                <DashboardPage />
                            </PrivateRoute>
                        }
                    />
                </Routes>
            </Router>
        </CommunicationProvider>
    );
}

export default App; 