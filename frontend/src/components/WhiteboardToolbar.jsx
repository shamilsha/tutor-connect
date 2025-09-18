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
    console.log('[WhiteboardToolbar] 🎨 Image upload triggered, calling onImageUpload');
    onImageUpload(event);
  };

  const handleFileUpload = (event) => {
    onFileUpload(event);
  };

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
          onClick={() => document.getElementById('image-upload').click()}
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
