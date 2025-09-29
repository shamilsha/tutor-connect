import React, { useState } from 'react';
import '../styles/ContentSelector.css';

const ContentSelector = ({ onContentSelect, selectedContent }) => {
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedChapters, setExpandedChapters] = useState({});

  // Sample content structure - will be replaced with dynamic data later
  const subjects = [
    {
      id: 'english',
      name: 'English',
      icon: '📚',
      chapters: [
        {
          id: 'grammar',
          name: 'Grammar',
          topics: [
            { 
              id: 'tenses', 
              name: 'Verb Tenses', 
              content: 'Learn about present, past, and future tenses. Practice with exercises and examples.',
              type: 'text'
            },
            { 
              id: 'prepositions', 
              name: 'Prepositions', 
              content: 'Master the use of in, on, at, by, for, with, and other prepositions.',
              type: 'text'
            }
          ]
        },
        {
          id: 'literature',
          name: 'Literature',
          topics: [
            { 
              id: 'poetry', 
              name: 'Poetry Analysis', 
              content: 'Analyze poems, identify literary devices, and understand poetic forms.',
              type: 'text'
            }
          ]
        }
      ]
    },
    {
      id: 'math',
      name: 'Mathematics',
      icon: '🔢',
      chapters: [
        {
          id: 'algebra',
          name: 'Algebra',
          topics: [
            { 
              id: 'equations', 
              name: 'Linear Equations', 
              content: 'Solve linear equations with one variable. Practice with step-by-step solutions.',
              type: 'text'
            },
            { 
              id: 'functions', 
              name: 'Functions', 
              content: 'Understand function notation, domain, range, and graphing.',
              type: 'text'
            }
          ]
        },
        {
          id: 'geometry',
          name: 'Geometry',
          topics: [
            { 
              id: 'triangles', 
              name: 'Triangle Properties', 
              content: 'Learn about angles, sides, and special triangle types.',
              type: 'text'
            }
          ]
        }
      ]
    },
    {
      id: 'chemistry',
      name: 'Chemistry',
      icon: '🧪',
      chapters: [
        {
          id: 'organic',
          name: 'Organic Chemistry',
          topics: [
            { 
              id: 'hydrocarbons', 
              name: 'Hydrocarbons', 
              content: 'Study alkanes, alkenes, and alkynes. Learn naming conventions.',
              type: 'text'
            }
          ]
        }
      ]
    }
  ];

  const toggleSubject = (subjectId) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectId]: !prev[subjectId]
    }));
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  const handleTopicSelect = (topic) => {
    onContentSelect(topic);
  };

  const isSubjectExpanded = (subjectId) => expandedSubjects[subjectId];
  const isChapterExpanded = (chapterId) => expandedChapters[chapterId];

  return (
    <div className="content-selector">
      <div className="content-selector-header">
        <h3>📚 Content Library</h3>
        <div className="content-selector-subtitle">Select a topic to annotate</div>
      </div>
      
      <div className="content-tree">
        {subjects.map(subject => (
          <div key={subject.id} className="subject-container">
            <div 
              className="subject-header"
              onClick={() => toggleSubject(subject.id)}
            >
              <span className="expand-icon">
                {isSubjectExpanded(subject.id) ? '▼' : '▶'}
              </span>
              <span className="subject-icon">{subject.icon}</span>
              <span className="subject-name">{subject.name}</span>
            </div>
            
            {isSubjectExpanded(subject.id) && (
              <div className="chapters-container">
                {subject.chapters.map(chapter => (
                  <div key={chapter.id} className="chapter-container">
                    <div 
                      className="chapter-header"
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <span className="expand-icon">
                        {isChapterExpanded(chapter.id) ? '▼' : '▶'}
                      </span>
                      <span className="chapter-name">{chapter.name}</span>
                    </div>
                    
                    {isChapterExpanded(chapter.id) && (
                      <div className="topics-container">
                        {chapter.topics.map(topic => (
                          <div 
                            key={topic.id}
                            className={`topic-item ${
                              selectedContent?.id === topic.id ? 'selected' : ''
                            }`}
                            onClick={() => handleTopicSelect(topic)}
                          >
                            <span className="topic-icon">📄</span>
                            <span className="topic-name">{topic.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {selectedContent && (
        <div className="selected-content-preview">
          <h4>Selected Content:</h4>
          <div className="preview-text">
            {selectedContent.name}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentSelector;
