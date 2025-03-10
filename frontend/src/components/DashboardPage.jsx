import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import Whiteboard from './Whiteboard';

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

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const toggleLeftPanel = () => {
    setIsLeftPanelOpen(!isLeftPanelOpen);
  };

  if (!user) return null;

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
        <div className="dashboard-content">
          <h2>Welcome to Your Learning Space</h2>
          <Whiteboard 
            userId={user.id.toString()}
            username={user.email}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 