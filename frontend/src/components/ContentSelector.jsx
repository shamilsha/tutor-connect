import React, { useState } from 'react';
import '../styles/ContentSelector.css';

const ContentSelector = ({ onContentSelect, selectedContent, onPdfTopicSelect, onImageTopicSelect, onArabicAlphabetSelect }) => {
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
    },
    {
      id: 'pdf-documents',
      name: 'PDF Documents',
      icon: '📄',
      chapters: [
        {
          id: 'sample-pdfs',
          name: 'Sample PDFs',
          topics: [
            { 
              id: 'sample-pdf-1', 
              name: 'Sample PDF Document', 
              content: 'Load a sample PDF document for annotation and collaboration.',
              type: 'pdf',
              filename: '01cd702c-2a19-4734-9fe9-cb61276dce16.pdf'
            }
          ]
        }
      ]
    },
    {
      id: 'sample-images',
      name: 'Sample Images',
      icon: '🖼️',
      chapters: [
        {
          id: 'demo-images',
          name: 'Demo Images',
          topics: [
            { 
              id: 'sample-image-1', 
              name: 'Sample Image', 
              content: 'Load a sample image for annotation and collaboration.',
              type: 'image',
              filename: '045ad443-4689-4d66-97ad-602036e300a2.jpg'
            }
          ]
        }
      ]
    },
    {
      id: 'arabic',
      name: 'Arabic',
      icon: '🕌',
      chapters: [
        {
          id: 'arabic-alphabet',
          name: 'Alphabet',
          topics: [
            { 
              id: 'arabic-alphabet-display', 
              name: 'Arabic Alphabet', 
              content: 'Display Arabic alphabet overlay for practice.',
              type: 'arabic-alphabet'
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
    if (topic.type === 'pdf') {
      // Handle PDF topic selection - Use backend proxy to avoid CORS issues
      const backendBaseUrl = "https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net";
      const pdfUrl = `${backendBaseUrl}/api/files/proxy/${topic.filename}`;
      
      console.log('PDF Topic Selected:', {
        topic: topic.name,
        filename: topic.filename,
        pdfUrl: pdfUrl
      });
      
      // Call the PDF topic handler
      if (onPdfTopicSelect) {
        onPdfTopicSelect(pdfUrl);
      }
    } else if (topic.type === 'image') {
      // Handle Image topic selection - Use backend proxy to avoid CORS issues
      const backendBaseUrl = "https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net";
      const imageUrl = `${backendBaseUrl}/api/files/proxy/${topic.filename}`;
      
      console.log('Image Topic Selected:', {
        topic: topic.name,
        filename: topic.filename,
        imageUrl: imageUrl
      });
      
      // Call the image topic handler
      if (onImageTopicSelect) {
        onImageTopicSelect(imageUrl);
      }
    } else if (topic.type === 'arabic-alphabet') {
      // Handle Arabic alphabet background
      console.log('Arabic Alphabet Selected:', {
        topic: topic.name
      });
      
      // Call the Arabic alphabet handler
      if (onArabicAlphabetSelect) {
        onArabicAlphabetSelect();
      }
    } else {
      // Handle regular content selection
      onContentSelect(topic);
    }
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
