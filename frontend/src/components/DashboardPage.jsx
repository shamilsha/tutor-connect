import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { WebRTCProvider } from '../services/WebRTCProvider';
import ChatPanel from './ChatPanel';
import ConnectionPanel from './ConnectionPanel';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [lessons] = useState([
    {
      id: 1,
      date: '2024-03-15',
      subject: 'Mathematics',
      topic: 'Calculus',
      status: 'Completed',
      goalAchieved: true,
      notes: 'Successfully covered derivatives and integrals'
    },
    {
      id: 2,
      date: '2024-03-18',
      subject: 'Physics',
      topic: 'Mechanics',
      status: 'Scheduled',
      goalAchieved: null,
      notes: 'Will cover Newton\'s laws of motion'
    }
  ]);
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser) {
      navigate('/login');
      return null;
    }
    return JSON.parse(savedUser);
  });
  const [provider, setProvider] = useState(null);
  const [peers, setPeers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('initial');
  const [error, setError] = useState(null);
  const [targetPeerId, setTargetPeerId] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    console.log('[DashboardPage] Creating WebRTC provider for user:', user.id);
    const rtcProvider = new WebRTCProvider(user.id);
    
    rtcProvider.onConnectionStateChange = (peerId, state) => {
        console.log('[DashboardPage] Connection state changed:', { peerId, state });
        if (state === 'connected') {
            setPeers(prev => [...prev, peerId]);
            setConnectionStatus('connected');
            setError(null);
        } else if (state === 'disconnected' || state === 'error') {
            setPeers(prev => prev.filter(p => p !== peerId));
            setConnectionStatus(prev => 
                prev === 'connected' && peers.length <= 1 ? 'initial' : prev
            );
        }
    };

    rtcProvider.onError = (error) => {
      console.error('WebRTC error:', error);
      setConnectionStatus('error');
      setError(error.message);
    };

    setProvider(rtcProvider);

    return () => {
        console.log('[DashboardPage] Cleaning up WebRTC provider');
        peers.forEach(peerId => rtcProvider.disconnect(peerId));
    };
  }, [user.id]);

  const handleLogout = () => {
    if (provider) {
      console.log('[DashboardPage] Disconnecting all peers before logout');
      peers.forEach(peerId => {
        provider.disconnect(peerId);
      });
      
      if (provider.signalingSocket) {
        provider.signalingSocket.close();
      }
    }

    setPeers([]);
    setConnectionStatus('initial');
    setError(null);
    setTargetPeerId('');
    setProvider(null);

    localStorage.removeItem('user');
    navigate('/');
  };

  useEffect(() => {
    return () => {
      if (provider) {
        console.log('[DashboardPage] Component unmounting, cleaning up connections');
        peers.forEach(peerId => {
          provider.disconnect(peerId);
        });
        if (provider.signalingSocket) {
          provider.signalingSocket.close();
        }
      }
    };
  }, [provider, peers]);

  const toggleLeftPanel = () => {
    setIsLeftPanelOpen(!isLeftPanelOpen);
  };

  const handleConnect = async () => {
    if (!targetPeerId.trim() || targetPeerId === user.id) {
      setError('Invalid peer ID');
      return;
    }
    try {
      setError(null);
      setConnectionStatus('connecting');
      await provider.connect(targetPeerId);
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to connect to peer');
      setConnectionStatus('error');
    }
  };

  const handleDisconnect = () => {
    if (peers.length > 0) {
      peers.forEach(peerId => {
        provider.disconnect(peerId);
      });
      setPeers([]);
      setConnectionStatus('initial');
      setError(null);
      setTargetPeerId('');
    }
  };

  if (!user) return null;

  console.log('[DashboardPage] Rendering with provider:', provider);

  return (
    <div className="dashboard">
      <div className={`left-panel ${isLeftPanelOpen ? 'open' : 'closed'}`}>
        <div className="panel-header">
          <h2>My Lessons</h2>
          <button onClick={toggleLeftPanel} className="toggle-button">
            {isLeftPanelOpen ? <FaChevronLeft /> : <FaChevronRight />}
          </button>
        </div>
        <div className="lesson-list">
          {lessons.map(lesson => (
            <div key={lesson.id} className="lesson-card">
              <div className="lesson-header">
                <h3>{lesson.subject}</h3>
                <span className={`status ${lesson.status.toLowerCase()}`}>
                  {lesson.status}
                </span>
              </div>
              <div className="lesson-details">
                <p><strong>Date:</strong> {lesson.date}</p>
                <p><strong>Topic:</strong> {lesson.topic}</p>
                {lesson.status === 'Completed' && (
                  <p>
                    <strong>Goal Achieved:</strong>
                    <span className={lesson.goalAchieved ? 'success' : 'failure'}>
                      {lesson.goalAchieved ? ' Yes' : ' No'}
                    </span>
                  </p>
                )}
                <p><strong>Notes:</strong> {lesson.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={`main-content ${isLeftPanelOpen ? 'with-panel' : 'full-width'}`}>
        <div className="dashboard-header">
          <h1>Student Dashboard</h1>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
        <ConnectionPanel 
          userId={user.id.toString()}
          connectionStatus={connectionStatus}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          error={error}
          targetPeerId={targetPeerId}
          setTargetPeerId={setTargetPeerId}
          provider={provider}
        />
        <ChatPanel 
          user={user}
          provider={provider}
          peers={peers}
        />
      </div>
    </div>
  );
};

export default DashboardPage; 