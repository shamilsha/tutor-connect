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
  FaTrash,
  FaFont
} from 'react-icons/fa';
import { BsTriangleFill } from 'react-icons/bs';
import { TbTriangleInverted } from 'react-icons/tb';
import MobileCamera from './MobileCamera';
import '../styles/WhiteboardToolbar.css';

const WhiteboardToolbar = ({ 
  userId, 
  username, 
  isScreenShareActive,
  onUndo,
  onRedo,
  onImageUpload,
  onFileUpload,
  onClear,
  canUndo,
  canRedo,
  // Mobile toggle props
  isMobileDrawingMode,
  onMobileModeToggle
}) => {
  const [triangleType, setTriangleType] = useState('equilateral');
  
  // GLOBAL STATE APPROACH: Initialize with default values
  const [internalSelectedTool, setInternalSelectedTool] = useState('pen');
  const [internalSelectedColor, setInternalSelectedColor] = useState('#000000');
  const [showMobileCamera, setShowMobileCamera] = useState(false);
  
  // Removed visual progress states to prevent excessive re-renders

  // STEP 1 TEST: Log every render to see if toolbar re-renders cause remounts
  console.log('[WhiteboardToolbar] 🔬 STEP 1 TEST: Toolbar component rendered', {
    internalSelectedTool,
    internalSelectedColor,
    timestamp: Date.now()
  });
  
  // DEBUG: Log the active state for the pen button specifically
  console.log('[WhiteboardToolbar] 🔍 DEBUG: Pen button active state:', {
    internalSelectedTool,
    isPenActive: internalSelectedTool === 'pen',
    className: `tool-button ${internalSelectedTool === 'pen' ? 'active' : ''}`
  });

  const handleToolClick = (toolName) => {
    console.log('[WhiteboardToolbar] 🖊️ Tool clicked:', toolName);
    
    // CRITICAL FIX: Update global state FIRST, before any other operations
    if (!window.whiteboardToolState) {
      window.whiteboardToolState = {};
    }
    window.whiteboardToolState.currentTool = toolName;
    console.log('[WhiteboardToolbar] 🔧 CRITICAL FIX: Updated global tool IMMEDIATELY to:', toolName);
    
    // Then update internal state for UI
    setInternalSelectedTool(toolName);
    console.log('[WhiteboardToolbar] 🔧 CRITICAL FIX: Internal tool changed to:', toolName);
  };

  const handleColorChange = (color) => {
    // CRITICAL FIX: Update global state FIRST, before any other operations
    if (!window.whiteboardToolState) {
      window.whiteboardToolState = {};
    }
    window.whiteboardToolState.currentColor = color;
    console.log('[WhiteboardToolbar] 🔧 CRITICAL FIX: Updated global color IMMEDIATELY to:', color);
    
    // Then update internal state for UI
    setInternalSelectedColor(color);
    console.log('[WhiteboardToolbar] 🔧 CRITICAL FIX: Internal color changed to:', color);
  };

  const handleUndo = () => {
    onUndo();
  };

  const handleRedo = () => {
    onRedo();
  };

  const handleImageUpload = async (event) => {
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
    
    if (event.target.files.length === 0) return;

    // Connection stability check before camera operations
    console.log('[WhiteboardToolbar] 📱 Mobile camera operation - checking connection stability');
    
    // Check WebSocket connection status before camera access
    const wsProvider = window.wsProvider;
    if (wsProvider) {
      const isConnected = wsProvider.isConnected();
      console.log('[WhiteboardToolbar] 📱 WebSocket connection status before camera:', { isConnected });
      
      if (!isConnected) {
        console.log('[WhiteboardToolbar] 📱 WebSocket disconnected - checking network connectivity');
        
        // Check if we have basic network connectivity
        const hasNetwork = navigator.onLine;
        console.log('[WhiteboardToolbar] 📱 Network online status:', { hasNetwork });
        
        if (!hasNetwork) {
          console.log('[WhiteboardToolbar] 📱 No network connectivity - proceeding with offline upload');
          // Proceed with upload even if offline - it will be queued for sync when connection returns
        } else {
          console.log('[WhiteboardToolbar] 📱 Network available but WebSocket disconnected - waiting for reconnection');
          // Wait for WebSocket to reconnect (reduced attempts for mobile)
          let attempts = 0;
          while (!wsProvider.isConnected() && attempts < 5) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            console.log('[WhiteboardToolbar] 📱 WebSocket reconnection attempt:', attempts);
          }
        }
      }
    }
    
    // Add a small delay to let the browser stabilize after camera access
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      console.log('[WhiteboardToolbar] 🎨 Image upload triggered, calling onImageUpload');
      console.log('[WhiteboardToolbar] 🎨 onImageUpload function:', typeof onImageUpload);
      
      // Call the upload handler directly (no visual progress simulation)
      console.log('[WhiteboardToolbar] 🎨 PROGRESS: Calling onImageUpload...');
      const uploadStartTime = performance.now();
      await onImageUpload(event);
      const uploadEndTime = performance.now();
      console.log('[WhiteboardToolbar] 🎨 PROGRESS: onImageUpload completed');
      
      // Log upload timing for analysis
      console.log('[WhiteboardToolbar] 🎨 UPLOAD TIMING ANALYSIS', {
        totalTime: `${(uploadEndTime - uploadStartTime).toFixed(2)}ms`,
        timestamp: Date.now()
      });
      
      // Check WebSocket connection after upload for peer synchronization
      if (wsProvider) {
        const postUploadConnected = wsProvider.isConnected();
        const hasNetwork = navigator.onLine;
        console.log('[WhiteboardToolbar] 📱 WebSocket connection status after upload:', { 
          postUploadConnected, 
          hasNetwork,
          networkStatus: hasNetwork ? 'online' : 'offline'
        });
        
        if (!postUploadConnected) {
          if (!hasNetwork) {
            console.log('[WhiteboardToolbar] 📱 No network after upload - image will sync when connection returns');
            // Don't wait for reconnection if there's no network - the image will be queued
          } else {
            console.log('[WhiteboardToolbar] 📱 WebSocket disconnected after upload - waiting for reconnection for peer sync');
            // Wait for WebSocket to reconnect for peer synchronization (reduced attempts for mobile)
            let attempts = 0;
            while (!wsProvider.isConnected() && attempts < 8) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              attempts++;
              console.log('[WhiteboardToolbar] 📱 WebSocket reconnection attempt for peer sync:', attempts);
            }
          }
        }
      }
      
      // Clear the file input value so the same file can be selected again
      event.target.value = '';
      console.log('[WhiteboardToolbar] 🎨 File input value cleared for next selection');
      
    } catch (error) {
      console.error('[WhiteboardToolbar] 🎨 Upload failed:', error);
    }
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
          value={internalSelectedColor}
          onChange={(e) => handleColorChange(e.target.value)}
          className="color-picker"
        />
        <span>{username}</span>
      </div>
      
      {/* Mobile Drawing Mode Toggle */}
      <div className="mobile-toggle">
        <button
          className={`mobile-mode-btn ${isMobileDrawingMode ? 'drawing-mode' : 'scroll-mode'}`}
          onClick={onMobileModeToggle}
          title={isMobileDrawingMode ? 'Switch to Scroll Mode' : 'Switch to Drawing Mode'}
        >
          {isMobileDrawingMode ? '✏️ Drawing' : '📜 Scroll'}
        </button>
      </div>
      
      {/* Main Toolbar */}
      <div className="toolbar">
        {/* Drawing Tools */}
        <button
          className={`tool-button ${internalSelectedTool === 'pen' ? 'active' : ''}`}
          onClick={() => handleToolClick('pen')}
          title="Pen"
          data-debug-active={internalSelectedTool === 'pen'}
          data-debug-tool={internalSelectedTool}
        >
          <FaPen />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'eraser' ? 'active' : ''}`}
          onClick={() => handleToolClick('eraser')}
          title="Eraser"
        >
          <FaEraser />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'line' ? 'active' : ''}`}
          onClick={() => handleToolClick('line')}
          title="Line"
        >
          <FaMinus />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'circle' ? 'active' : ''}`}
          onClick={() => handleToolClick('circle')}
          title="Circle"
        >
          <FaCircle />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'ellipse' ? 'active' : ''}`}
          onClick={() => handleToolClick('ellipse')}
          title="Ellipse"
        >
          <FaDrawPolygon />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'rectangle' ? 'active' : ''}`}
          onClick={() => handleToolClick('rectangle')}
          title="Rectangle"
        >
          <FaSquare />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'triangle' && triangleType === 'equilateral' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('equilateral');
            handleToolClick('triangle');
          }}
          title="Equilateral Triangle"
        >
          <BsTriangleFill />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'triangle' && triangleType === 'right' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('right');
            handleToolClick('triangle');
          }}
          title="Right Triangle"
        >
          <TbTriangleInverted />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'triangle' && triangleType === 'isosceles' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('isosceles');
            handleToolClick('triangle');
          }}
          title="Isosceles Triangle"
        >
          <FaDrawPolygon />
        </button>
        
        <button
          className={`tool-button ${internalSelectedTool === 'text' ? 'active' : ''}`}
          onClick={() => handleToolClick('text')}
          title="Text Tool - Double click to add text"
        >
          <FaFont />
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
          title="Upload Image from Gallery"
        >
          <FaImage />
        </button>

        <button
          className="tool-button"
          onClick={() => {
            console.log('[WhiteboardToolbar] 📷 Mobile camera button clicked');
            setShowMobileCamera(true);
          }}
          title="Take Photo with Camera (No Connection Loss)"
        >
          📷
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
          id="camera-upload"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        
        <input
          id="file-upload"
          type="file"
          accept=".pdf,application/pdf,application/x-pdf"
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
      
      {/* Mobile Camera Component */}
      {showMobileCamera && (
        <MobileCamera
          onImageCapture={(file) => {
            console.log('[WhiteboardToolbar] 📷 Mobile camera captured image:', file.name);
            // Create a synthetic event for the existing upload handler
            const syntheticEvent = {
              target: {
                files: [file]
              }
            };
            handleImageUpload(syntheticEvent);
            setShowMobileCamera(false);
          }}
          onClose={() => {
            console.log('[WhiteboardToolbar] 📷 Mobile camera closed');
            setShowMobileCamera(false);
          }}
        />
      )}
    </div>
  );
};

export default WhiteboardToolbar;
