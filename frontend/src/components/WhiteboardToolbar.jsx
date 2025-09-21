import React, { useState } from 'react';
import { 
  FaPen, 
  FaEraser, 
  FaMinus, 
  FaCircle, 
  FaDrawPolygon, 
  FaSquare, 
  FaUndo, 
  FaRedo,
  FaFileUpload,
  FaFilePdf,
  FaImage,
  FaTrash
} from 'react-icons/fa';
import { BsTriangleFill } from 'react-icons/bs';
import { TbTriangleInverted } from 'react-icons/tb';
import '../styles/WhiteboardToolbar.css';

const WhiteboardToolbar = ({ 
  userId, 
  username, 
  isScreenShareActive,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  onImageUpload,
  onFileUpload,
  onClear,
  currentTool,
  currentColor,
  canUndo,
  canRedo
}) => {
  const [triangleType, setTriangleType] = useState('equilateral');

  const handleToolClick = (toolName) => {
    console.log('[WhiteboardToolbar] 🖊️ Tool clicked:', toolName);
    onToolChange(toolName);
  };

  const handleColorChange = (color) => {
    onColorChange(color);
  };

  const handleUndo = () => {
    onUndo();
  };

  const handleRedo = () => {
    onRedo();
  };

  const handleImageUpload = (event) => {
    console.log('[WhiteboardToolbar] 🎨 File input onChange triggered directly');
    console.log('[WhiteboardToolbar] 🎨 File input element during onChange:', event.target);
    console.log('[WhiteboardToolbar] 🎨 File input files during onChange:', event.target.files);
    console.log('[WhiteboardToolbar] 🎨 FILE SELECTED:', {
      hasFiles: event.target.files.length > 0,
      fileCount: event.target.files.length,
      fileName: event.target.files[0]?.name || 'No file',
      fileSize: event.target.files[0]?.size || 0,
      fileType: event.target.files[0]?.type || 'No type'
    });
    console.log('[WhiteboardToolbar] 🎨 Image upload triggered, calling onImageUpload');
    console.log('[WhiteboardToolbar] 🎨 onImageUpload function:', typeof onImageUpload);
    
    // Call the upload handler
    onImageUpload(event);
    
    // Clear the file input value so the same file can be selected again
    event.target.value = '';
    console.log('[WhiteboardToolbar] 🎨 File input value cleared for next selection');
  };

  const handleFileUpload = (event) => {
    onFileUpload(event);
  };

  // Debug: Monitor component re-renders and file input element
  React.useEffect(() => {
    console.log('[WhiteboardToolbar] 🔄 Component re-rendered');
    const fileInput = document.getElementById('image-upload');
    console.log('[WhiteboardToolbar] 🔍 File input element after render:', fileInput);
    if (fileInput) {
      console.log('[WhiteboardToolbar] 🔍 File input has onChange handler:', typeof fileInput.onchange);
    }
  });

  const handleClear = () => {
    onClear();
  };

  return (
    <div 
      className={`whiteboard-toolbar ${isScreenShareActive ? 'screen-share-active' : ''}`}
    >
      {/* Color Picker */}
      <div className="user-color-picker">
        <label>Your Color:</label>
        <input
          type="color"
          value={currentColor}
          onChange={(e) => handleColorChange(e.target.value)}
          className="color-picker"
        />
        <span>{username}</span>
      </div>
      
      {/* Main Toolbar */}
      <div className="toolbar">
        {/* Drawing Tools */}
        <button
          className={`tool-button ${currentTool === 'pen' ? 'active' : ''}`}
          onClick={() => handleToolClick('pen')}
          title="Pen"
        >
          <FaPen />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'eraser' ? 'active' : ''}`}
          onClick={() => handleToolClick('eraser')}
          title="Eraser"
        >
          <FaEraser />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'line' ? 'active' : ''}`}
          onClick={() => handleToolClick('line')}
          title="Line"
        >
          <FaMinus />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'circle' ? 'active' : ''}`}
          onClick={() => handleToolClick('circle')}
          title="Circle"
        >
          <FaCircle />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'ellipse' ? 'active' : ''}`}
          onClick={() => handleToolClick('ellipse')}
          title="Ellipse"
        >
          <FaDrawPolygon />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'rectangle' ? 'active' : ''}`}
          onClick={() => handleToolClick('rectangle')}
          title="Rectangle"
        >
          <FaSquare />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'triangle' && triangleType === 'equilateral' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('equilateral');
            handleToolClick('triangle');
          }}
          title="Equilateral Triangle"
        >
          <BsTriangleFill />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'triangle' && triangleType === 'right' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('right');
            handleToolClick('triangle');
          }}
          title="Right Triangle"
        >
          <TbTriangleInverted />
        </button>
        
        <button
          className={`tool-button ${currentTool === 'triangle' && triangleType === 'isosceles' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('isosceles');
            handleToolClick('triangle');
          }}
          title="Isosceles Triangle"
        >
          <FaDrawPolygon />
        </button>

        {/* Divider */}
        <div className="toolbar-divider"></div>

        {/* Action Tools */}
        <button
          className="tool-button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <FaUndo />
        </button>
        
        <button
          className="tool-button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <FaRedo />
        </button>

        {/* Divider */}
        <div className="toolbar-divider"></div>

        {/* File Upload Tools */}
        <button
          className="tool-button"
          onClick={() => {
            console.log('[WhiteboardToolbar] 🎨 Image button clicked');
            const fileInput = document.getElementById('image-upload');
            console.log('[WhiteboardToolbar] 🎨 File input element:', fileInput);
            if (fileInput) {
              console.log('[WhiteboardToolbar] 🎨 File input found, clicking...');
              fileInput.click();
            } else {
              console.error('[WhiteboardToolbar] 🎨 File input not found!');
            }
          }}
          title="Upload Image"
        >
          <FaImage />
        </button>
        
        <button
          className="tool-button"
          onClick={() => document.getElementById('file-upload').click()}
          title="Upload PDF"
        >
          <FaFilePdf />
        </button>

        {/* Hidden file inputs */}
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        
        <input
          id="file-upload"
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {/* Divider */}
        <div className="toolbar-divider"></div>

        {/* Clear Button */}
        <button
          className="tool-button clear-button"
          onClick={handleClear}
          title="Clear All"
        >
          <FaTrash />
        </button>
      </div>
    </div>
  );
};

export default WhiteboardToolbar;
