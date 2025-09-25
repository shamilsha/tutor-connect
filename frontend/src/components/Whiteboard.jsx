import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Line, Circle, Ellipse, Rect, Transformer, Group, Text, RegularPolygon } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import { Document, Page } from 'react-pdf';
import '../styles/pdf.css';
import '../styles/Whiteboard.css';
import { pdfjs } from 'react-pdf';
import { WebRTCProvider } from '../services/WebRTCProvider';

// Configure PDF.js worker - use local worker to avoid CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Logging system for Whiteboard
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, VERBOSE: 4 };
const LOG_LEVEL = process.env.REACT_APP_LOG_LEVEL || 'INFO';

const log = (level, component, message, data = null) => {
  if (LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL]) {
    const prefix = `[${component}] ${level}:`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }
};

const Whiteboard = forwardRef(({ 
  userId, 
  username, 
  screenShareStream = null, 
  isScreenShareActive = false, 
  currentImageUrl = null,
  containerSize = { width: 1200, height: 800 },
  onClose = null, 
  onBackgroundCleared = null,
  onImageChange = null, 
  onPdfChange = null,
  webRTCProvider = null, 
  selectedPeer = null,
  // New props from toolbar
  currentTool = null,
  currentColor = '#000000',
  onToolChange = null,
  onColorChange = null,
  onUndo = null,
  onRedo = null,
  onHistoryChange = null,
  onImageUpload = null,
  onFileUpload = null,
  onClear = null,
  canUndo = false,
  canRedo = false,
  // PDF Navigation props
  pdfCurrentPage = 1,
  pdfScale = 1,
  onPdfPageChange = null,
  onPdfPagesChange = null,
}, ref) => {
  log('INFO', 'Whiteboard', 'Component mounted', { userId, username, screenShareStream: !!screenShareStream, isScreenShareActive });
  
  // Track remounting with detailed logging
  useEffect(() => {
    log('ERROR', 'Whiteboard', '🚨 COMPONENT MOUNTED - This should NOT happen during mouse move!', {
      userId,
      username,
      screenShareStream: !!screenShareStream,
      isScreenShareActive,
      backgroundType,
      pdfLoaded: backgroundType === 'pdf',
      timestamp: Date.now(),
      stackTrace: new Error().stack
    });
  }, []);
  
  // Drawing state
  const [lines, setLines] = useState([]);
  const [shapes, setShapes] = useState([]);
  
  // PDF render timing
  const [pdfRenderStartTime, setPdfRenderStartTime] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  
  
  const [selectedShape, setSelectedShape] = useState(null);
  const [history, setHistory] = useState([{ 
    lines: [], 
    shapes: [], 
    historyStep: 0 
  }]);
  const [historyStep, setHistoryStep] = useState(0);
  
  // Log current state after all state variables are declared
  log('DEBUG', 'Whiteboard', 'Current state on mount', { lines: lines.length, shapes: shapes.length, historyStep, historyLength: history.length });
  
  const [defaultFill, setDefaultFill] = useState(false);
  const [strokeColor, setStrokeColor] = useState(currentColor);
  const [fillColor, setFillColor] = useState(currentColor);
  const [triangleType, setTriangleType] = useState('equilateral');
  const [cursors, setCursors] = useState(new Map());
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundType, setBackgroundType] = useState(null);
  const [pdfPages, setPdfPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  // Use dynamic container size from props
  const [currentContainerSize, setCurrentContainerSize] = useState(containerSize);
  const [pageShapes, setPageShapes] = useState({});
  const [pageLines, setPageLines] = useState({});
  // State to track background dimensions
  const [backgroundDimensions, setBackgroundDimensions] = useState({ width: 0, height: 0 });
  // State to track screen share dimensions
  const [screenShareDimensions, setScreenShareDimensions] = useState({ width: 0, height: 0 });

  // Debug flag to control verbose logging
  const DEBUG_MOUSE_MOVEMENT = LOG_LEVEL === 'VERBOSE'; // Enable mouse movement logs in VERBOSE mode

  // Refs
  const startPointRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const screenShareVideoRef = useRef(null);
  const webRTCProviderRef = useRef(null);
  const selectedPeerRef = useRef(null);

  // Update stroke color when currentColor prop changes
  useEffect(() => {
    setStrokeColor(currentColor);
  }, [currentColor]);

  // Update container size when prop changes
  useEffect(() => {
    setCurrentContainerSize(containerSize);
    log('DEBUG', 'Whiteboard', 'Container size updated', containerSize);
  }, [containerSize]);


  // WebRTC setup
  useEffect(() => {
    if (webRTCProvider && selectedPeer) {
      log('INFO', 'Whiteboard', 'Setting up data channel communication with peer', selectedPeer);
      webRTCProviderRef.current = webRTCProvider;
      selectedPeerRef.current = selectedPeer;

      const handleWhiteboardMessage = (event) => {
        const { data } = event;
        log('DEBUG', 'Whiteboard', 'Received whiteboard message', data);
        handleRemoteWhiteboardUpdate(data);
      };

      webRTCProvider.addEventListener('whiteboard', handleWhiteboardMessage);

    return () => {
        webRTCProvider.removeEventListener('whiteboard', handleWhiteboardMessage);
    };
    }
  }, [webRTCProvider, selectedPeer]);

  // Container size tracking - use dynamic dimensions
  useEffect(() => {
    log('DEBUG', 'Whiteboard', 'Using dynamic container size', { 
      width: currentContainerSize.width, 
      height: currentContainerSize.height,
      isScreenShareActive
    });
  }, [currentContainerSize, isScreenShareActive]); // Update when container size or overlay state changes

  // Track background dimensions changes
  useEffect(() => {
    log('DEBUG', 'Whiteboard', 'Background dimensions changed', {
      backgroundDimensions,
      currentContainerSize,
      isScreenShareActive,
      screenShareDimensions,
      willUseBackgroundDimensions: backgroundDimensions.width > 0 && backgroundDimensions.height > 0,
      willUseScreenShareDimensions: isScreenShareActive && screenShareDimensions.width > 0 && screenShareDimensions.height > 0,
      finalContainerWidth: isScreenShareActive && screenShareDimensions.width > 0 
        ? screenShareDimensions.width 
        : backgroundDimensions.width > 0 
          ? backgroundDimensions.width 
          : currentContainerSize.width,
      finalContainerHeight: isScreenShareActive && screenShareDimensions.height > 0 
        ? screenShareDimensions.height 
        : backgroundDimensions.height > 0 
          ? backgroundDimensions.height 
          : currentContainerSize.height
    });
  }, [backgroundDimensions, currentContainerSize, isScreenShareActive, screenShareDimensions]);

  // Calculate screen share dimensions when screen share is active
  
  // Log dimension changes for debugging
  useEffect(() => {
    log('DEBUG', 'Whiteboard', 'Dimension debug', {
      isScreenShareActive,
      screenShareDimensions,
      backgroundDimensions,
      currentContainerSize,
      willUseScreenShareDimensions: isScreenShareActive && screenShareDimensions.width > 0 && screenShareDimensions.height > 0,
      finalContainerWidth: isScreenShareActive && screenShareDimensions.width > 0 
        ? screenShareDimensions.width 
        : backgroundDimensions.width > 0 
          ? backgroundDimensions.width 
          : currentContainerSize.width,
      finalContainerHeight: isScreenShareActive && screenShareDimensions.height > 0 
        ? screenShareDimensions.height 
        : backgroundDimensions.height > 0 
          ? backgroundDimensions.height 
          : currentContainerSize.height
    });
  }, [isScreenShareActive, screenShareDimensions, backgroundDimensions, currentContainerSize]);
  
  useEffect(() => {
    let timeoutId = null;
    
    if (isScreenShareActive) {
      // Poll for screen share video dimensions until we get them
      let pollCount = 0;
      const maxPolls = 50; // Maximum 5 seconds of polling
      
      const pollForDimensions = () => {
        pollCount++;
        
        // Safety check to prevent infinite polling
        if (pollCount > maxPolls) {
          log('WARN', 'Whiteboard', 'Polling timeout - screen share video dimensions not available');
          return;
        }
        
        try {
          const screenShareVideo = document.querySelector('.screen-share-window video');
          if (screenShareVideo) {
            const videoWidth = screenShareVideo.videoWidth;
            const videoHeight = screenShareVideo.videoHeight;
            const displayWidth = screenShareVideo.offsetWidth;
            const displayHeight = screenShareVideo.offsetHeight;
            
            log('DEBUG', 'Whiteboard', 'Checking screen share video dimensions', {
              videoWidth,
              videoHeight,
              displayWidth,
              displayHeight,
              hasOriginalDimensions: videoWidth > 0 && videoHeight > 0,
              hasDisplayDimensions: displayWidth > 0 && displayHeight > 0,
              isCompressed: videoWidth !== displayWidth || videoHeight !== displayHeight,
              pollCount
            });
            
            if (videoWidth > 0 && videoHeight > 0) {
              log('DEBUG', 'Whiteboard', 'Screen share video ORIGINAL dimensions detected', { videoWidth, videoHeight });
              log('DEBUG', 'Whiteboard', 'SETTING screenShareDimensions', { width: videoWidth, height: videoHeight });
              setScreenShareDimensions({ width: videoWidth, height: videoHeight });
              return; // Stop polling once we get dimensions
            }
          }
          // Continue polling if dimensions not available yet
          timeoutId = setTimeout(pollForDimensions, 100);
        } catch (error) {
          log('ERROR', 'Whiteboard', 'Error polling for screen share dimensions', error);
        }
      };
      
      pollForDimensions();
    } else {
      setScreenShareDimensions({ width: 0, height: 0 });
    }
    
    // Cleanup function to clear timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isScreenShareActive]);

  // Note: Background clearing is now handled by the parent component's mutual exclusivity logic
  // The image will be visible below the screen share window when both are active

  // Handle remote whiteboard updates
  const handleRemoteWhiteboardUpdate = (data) => {
    log('INFO', 'Whiteboard', '📨 PROCESSING remote whiteboard update', {
      action: data.action,
      hasShape: !!data.shape,
      shapeType: data.shape?.type,
      shapeTool: data.shape?.tool,
      shapeId: data.shape?.id,
      pointsCount: data.shape?.points?.length,
      coordinates: data.shape?.points,
      coordinatesString: JSON.stringify(data.shape?.points),
      messageBackgroundType: data.backgroundType,
      localBackgroundType: backgroundType,
      pdfLoaded: data.backgroundType === 'pdf' || backgroundType === 'pdf',
      currentImageUrl: !!currentImageUrl,
      currentLinesCount: lines.length,
      currentPageLinesCount: Object.keys(pageLines).length,
      timestamp: Date.now()
    });
    
    // Note: clearBackground messages now handled via checkExclusivity() approach
    
    switch (data.action) {
      case 'draw':
        if (data.shape) {
          log('INFO', 'Whiteboard', '🖊️ PROCESSING draw action', {
            shapeType: data.shape.type,
            shapeTool: data.shape.tool,
            shapeId: data.shape.id,
            pointsCount: data.shape.points?.length,
            backgroundType,
            pdfLoaded: backgroundType === 'pdf',
            timestamp: Date.now()
          });
          
          if (data.shape.tool === 'pen' || data.shape.tool === 'line') {
            // Use regular lines storage for all backgrounds (including PDF)
            log('INFO', 'Whiteboard', '🖼️ UPDATING regular lines', {
              shapeType: data.shape.type,
              pointsCount: data.shape.points?.length,
              currentLinesCount: lines.length,
              timestamp: Date.now()
            });
            
            setLines(prev => {
              const newLines = [...prev, data.shape];
              log('INFO', 'Whiteboard', '✅ UPDATED regular lines', {
                oldCount: prev.length,
                newCount: newLines.length,
                shapeType: data.shape.type,
                timestamp: Date.now()
              });
              return newLines;
            });
          } else {
            // Use regular shapes storage for all backgrounds (including PDF)
            log('INFO', 'Whiteboard', '📨 RECEIVING line tool creation', {
              shapeId: data.shape.id,
              shapeX: data.shape.x,
              shapeY: data.shape.y,
              points: data.shape.points,
              pointsString: JSON.stringify(data.shape.points),
              shapeType: data.shape.type,
              shapeTool: data.shape.tool,
              timestamp: Date.now()
            });
            setShapes(prev => [...prev, data.shape]);
          }
        }
        break;
      case 'update':
        if (data.shape) {
          if (data.shape.tool === 'pen' || data.shape.tool === 'line') {
            // Use regular lines storage for all backgrounds (including PDF)
            setLines(prev => prev.map(line => line.id === data.shape.id ? data.shape : line));
          } else {
            // Use regular shapes storage for all backgrounds (including PDF)
            log('INFO', 'Whiteboard', '📨 RECEIVING line tool update', {
              shapeId: data.shape.id,
              shapeX: data.shape.x,
              shapeY: data.shape.y,
              points: data.shape.points,
              pointsString: JSON.stringify(data.shape.points),
              shapeType: data.shape.type,
              shapeTool: data.shape.tool,
              timestamp: Date.now()
            });
            setShapes(prev => prev.map(shape => shape.id === data.shape.id ? data.shape : shape));
          }
        }
        break;
      case 'erase':
        if (data.shape) {
          if (data.shape.tool === 'pen' || data.shape.tool === 'line') {
            // Use regular lines storage for all backgrounds (including PDF)
            setLines(prev => prev.filter(line => line.id !== data.shape.id));
          } else {
            // Use regular shapes storage for all backgrounds (including PDF)
            setShapes(prev => prev.filter(shape => shape.id !== data.shape.id));
          }
        }
        break;
      case 'undo':
        if (data.state && data.state.historyStep !== undefined) {
          setHistoryStep(data.state.historyStep);
          setLines(data.state.lines || []);
          setShapes(data.state.shapes || []);
        }
        break;
      case 'redo':
        if (data.state && data.state.historyStep !== undefined) {
          setHistoryStep(data.state.historyStep);
          setLines(data.state.lines || []);
          setShapes(data.state.shapes || []);
        }
        break;
      case 'state':
        if (data.state) {
          setLines(data.state.lines || []);
          setShapes(data.state.shapes || []);
          setHistoryStep(data.state.historyStep || 0);
          
          // For PDFs, also update page-specific state if provided
          if (backgroundType === 'pdf' && data.state.pageLines && data.state.pageShapes) {
            setPageLines(data.state.pageLines);
            setPageShapes(data.state.pageShapes);
          }
          
          // Also update history if it's provided
          if (data.state.history) {
            setHistory(data.state.history);
          }
        }
        break;
      case 'cursor':
        if (data.position) {
          setCursors(prev => {
            const newCursors = new Map(prev);
            newCursors.set(data.userId, {
              position: data.position,
              color: data.color,
              username: data.username
            });
            return newCursors;
          });
        }
        break;
        case 'background':
          if (data.background) {
            log('INFO', 'Whiteboard', 'Received background update', data.background);
            log('INFO', 'Whiteboard', 'Received background from remote', { 
              type: data.background.type, 
              file: data.background.file
            });
            
            // Check mutual exclusivity when receiving background from remote peer
            if (data.background.type === 'image' && onImageChange) {
              log('INFO', 'Whiteboard', 'Remote image received, checking exclusivity');
              log('INFO', 'Whiteboard', 'Triggering image exclusivity check', data.background.file);
              onImageChange(data.background.file);
            } else if (data.background.type === 'pdf' && onPdfChange) {
              log('INFO', 'Whiteboard', 'Remote PDF received, checking exclusivity');
              log('INFO', 'Whiteboard', 'Triggering PDF exclusivity check', data.background.file);
              onPdfChange(data.background.file);
            }
            
            setBackgroundFile(data.background.file);
            setBackgroundType(data.background.type);
            
            log('INFO', 'Whiteboard', '✅ UPDATED background type from remote', {
              type: data.background.type,
              file: data.background.file,
              timestamp: Date.now()
            });
          }
          break;
      // Note: clearBackground case removed - now using checkExclusivity() approach
      default:
        log('WARN', 'Whiteboard', 'Unknown action', data.action);
    }
  };

  // Generic function to send whiteboard messages via WebRTC data channel
  const sendWhiteboardMsg = async (action, data = {}) => {
    // Use VERBOSE for cursor messages to reduce noise
    const logLevel = action === 'cursor' ? 'VERBOSE' : 'INFO';
    log(logLevel, 'Whiteboard', '📤 SENDING WebRTC message', {
      action,
      hasShape: !!data.shape,
      shapeType: data.shape?.type,
      shapeTool: data.shape?.tool,
      shapeId: data.shape?.id,
      pointsCount: data.shape?.points?.length,
      coordinates: data.shape?.points,
      coordinatesString: JSON.stringify(data.shape?.points),
      backgroundType,
      pdfLoaded: backgroundType === 'pdf',
      currentImageUrl: !!currentImageUrl,
      timestamp: Date.now()
    });
    
    if (!webRTCProviderRef.current || !selectedPeerRef.current) {
      log('WARN', 'Whiteboard', '❌ No datachannel available, skipping message', {
        action,
        hasProvider: !!webRTCProviderRef.current,
        hasSelectedPeer: !!selectedPeerRef.current,
        timestamp: Date.now()
      });
      return;
    }

    // Check if data channel is ready by attempting to send a test message
    // The WebRTCProvider's sendMessage method already handles data channel readiness checks

    try {
      const message = {
        action,
        userId,
        username,
        color: currentColor,
        backgroundType: backgroundType
      };

      // Handle different data structures based on action type
      if (data.shape) {
        // For draw, update, erase actions - ensure shape has proper type/tool properties
        message.shape = {
          ...data.shape,
          type: data.shape.type || data.shape.tool,
          tool: data.shape.tool || data.shape.type
        };
      } else if (data.state) {
        // For undo, redo, state actions
        message.state = data.state;
      } else if (data.background) {
        // For background actions
        message.background = data.background;
      } else if (data.page) {
        // For page actions
        message.page = data.page;
      } else if (data.position) {
        // For cursor actions
        message.position = data.position;
      } else {
        // Fallback - spread other data properties
        Object.assign(message, data);
      }

      // Add stack trace to see where the message is being sent from
      const stack = new Error().stack;
      log('DEBUG', 'Whiteboard', 'Sending whiteboard message via data channel', {
        action,
        userId,
        username,
        stack: stack?.split('\n').slice(1, 4).join('\n') // Show first 3 lines of stack
      });
      
      await webRTCProviderRef.current.sendWhiteboardMessage(selectedPeerRef.current, message);
      
      log('INFO', 'Whiteboard', '✅ SENT WebRTC message successfully', { 
        action, 
        messageSize: JSON.stringify(message).length,
        backgroundType,
        pdfLoaded: backgroundType === 'pdf',
        hasShape: !!message.shape,
        shapeType: message.shape?.type,
        timestamp: Date.now()
      });
    } catch (error) {
      log('ERROR', 'Whiteboard', '❌ Error sending whiteboard message', {
        error: error.message,
        action,
        backgroundType,
        pdfLoaded: backgroundType === 'pdf',
        hasShape: !!data.shape,
        shapeType: data.shape?.type,
        timestamp: Date.now()
      });
    }
  };

  // Update cursor positions
  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Get coordinate information for analysis
    const stageRect = stage.container().getBoundingClientRect();
    const nativeX = e.evt.clientX;
    const nativeY = e.evt.clientY;
    const offsetX = nativeX - stageRect.left;
    const offsetY = nativeY - stageRect.top;
    const correctedX = offsetX; // Use calculated offset for X coordinate
    const correctedY = offsetY; // Use calculated offset for Y coordinate
    
    // Log coordinates when drawing with line tool (only if debug enabled)
    if (DEBUG_MOUSE_MOVEMENT && currentTool === 'line' && isDrawing) {
      const stageContainer = stage.container();
      const stageContainerRect = stageContainer.getBoundingClientRect();
      const stageTransform = stageContainer.style.transform;
      const stageScale = stage.scaleX();
      
      log('VERBOSE', 'Whiteboard', 'Mouse move - Native event coordinates', { clientX: nativeX, clientY: nativeY });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Stage rect', { left: stageRect.left, top: stageRect.top });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Stage container rect', { left: stageContainerRect.left, top: stageContainerRect.top });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Stage transform', stageTransform);
      log('VERBOSE', 'Whiteboard', 'Mouse move - Stage scale', stageScale);
      log('VERBOSE', 'Whiteboard', 'Mouse move - Calculated offset', { offsetX, offsetY });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Konva point vs offset', { konvaX: point.x, konvaY: point.y, offsetX, offsetY });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Coordinate difference', { diffX: point.x - offsetX, diffY: point.y - offsetY });
      log('VERBOSE', 'Whiteboard', 'Mouse move - Using corrected coordinates', { correctedX, correctedY, offsetX, offsetY });
    }

    // Only send cursor position when a tool is selected (throttled to avoid spam)
    if (currentTool) {
      // Throttle cursor messages to avoid flooding the data channel
      const now = Date.now();
      if (!window.lastCursorTime || now - window.lastCursorTime > 100) { // Send max every 100ms
        window.lastCursorTime = now;
        // Adjust coordinates for scroll position only for cursor display
        const scrollContainer = containerRef.current;
        const adjustedPoint = { ...point };
        if (scrollContainer) {
          adjustedPoint.x += scrollContainer.scrollLeft;
          adjustedPoint.y += scrollContainer.scrollTop;
        }
        sendWhiteboardMsg('cursor', { position: adjustedPoint });
      }
    }

    if (!isDrawing) return;

    if (currentTool === 'pen') {
      // Use regular lines storage for all backgrounds (including PDF)
      let lastLine = lines[lines.length - 1];
      const newLastLine = {
        ...lastLine,
        points: [...lastLine.points, correctedX, correctedY]
      };
      setLines(prev => [...prev.slice(0, -1), newLastLine]);
      // Send line update via WebRTC data channel
      sendWhiteboardMsg('update', { shape: newLastLine });
    } else if (selectedShape) {
      const startPoint = startPointRef.current;
      const dx = correctedX - startPoint.x;
      const dy = correctedY - startPoint.y;
      
      // Use regular shapes storage for all backgrounds (including PDF)
      const updatedShapes = shapes.map(shape => {
        if (shape.id === selectedShape.id) {
          switch (shape.type) {
            case 'line':
              if (DEBUG_MOUSE_MOVEMENT) {
                log('VERBOSE', 'Whiteboard', 'Line drawing mouse', { correctedX, correctedY, startX: startPoint.x, startY: startPoint.y, deltaX: dx, deltaY: dy });
              }
              return {
                ...shape,
                points: [startPoint.x, startPoint.y, correctedX, correctedY]  // Absolute coordinates: start at actual mouse down position, end at current mouse position
              };
            case 'circle':
                  return {
                    ...shape,
                radius: Math.sqrt(dx * dx + dy * dy)
              };
            case 'ellipse':
                  return {
                    ...shape,
                radiusX: Math.abs(dx),
                radiusY: Math.abs(dy)
              };
            case 'rectangle':
              return {
                ...shape,
                width: Math.abs(dx),
                height: Math.abs(dy)
              };
            case 'triangle':
              return {
                ...shape,
                width: Math.abs(dx),
                height: Math.abs(dy)
              };
            default:
              return shape;
          }
        }
        return shape;
      });
      setShapes(updatedShapes);
      // Send shape update via WebRTC data channel - send the updated shape
      const updatedShape = updatedShapes.find(shape => shape.id === selectedShape.id);
      if (updatedShape) {
        log('INFO', 'Whiteboard', `📤 SENDING ${currentTool} tool update`, {
          shapeId: updatedShape.id,
          shapeX: updatedShape.x,
          shapeY: updatedShape.y,
          dx,
          dy,
          correctedX,
          correctedY,
          timestamp: Date.now()
        });
        sendWhiteboardMsg('update', { shape: updatedShape });
      }
    }
  };

  const handleMouseDown = (e) => {
    log('VERBOSE', 'Whiteboard', 'Mouse down - Current state', {
      tool: currentTool,
      isDrawing,
      selectedShape: selectedShape?.id
    });

    // Ensure we have a default tool for drawing
    const drawingTool = currentTool || 'pen';

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Get the Stage's bounding rectangle to calculate offset from viewport
    const stageRect = stage.container().getBoundingClientRect();
    const nativeX = e.evt.clientX;
    const nativeY = e.evt.clientY;
    
    // Calculate the offset between native coordinates and Konva coordinates
    const offsetX = nativeX - stageRect.left;
    const offsetY = nativeY - stageRect.top;
    
    // Get additional coordinate system information
    const stageContainer = stage.container();
    const stageContainerRect = stageContainer.getBoundingClientRect();
    const stageTransform = stageContainer.style.transform;
    const stageScale = stage.scaleX();
    
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse down - Starting drawing with tool', { drawingTool, position: point });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Stage dimensions', { width: stage.width(), height: stage.height() });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Container size', containerSize);
      log('VERBOSE', 'Whiteboard', 'Mouse down - Native event coordinates', { clientX: nativeX, clientY: nativeY });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Stage rect', { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Stage container rect', { left: stageContainerRect.left, top: stageContainerRect.top, width: stageContainerRect.width, height: stageContainerRect.height });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Stage transform', stageTransform);
      log('VERBOSE', 'Whiteboard', 'Mouse down - Stage scale', stageScale);
      log('VERBOSE', 'Whiteboard', 'Mouse down - Calculated offset', { offsetX, offsetY });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Konva point vs offset', { konvaX: point.x, konvaY: point.y, offsetX, offsetY });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Coordinate difference', { diffX: point.x - offsetX, diffY: point.y - offsetY });
    }

    // Calculate corrected coordinates to account for Stage positioning offset
    // The Stage is positioned relative to its container, but we want coordinates relative to the visual drawing area
    const correctedX = offsetX; // Use calculated offset for X coordinate
    const correctedY = offsetY; // Use calculated offset for Y coordinate
    
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse down - Using corrected coordinates', { correctedX, correctedY, offsetX, offsetY });
    }

    if (drawingTool === 'pen') {
      const newLine = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: 'pen',
        type: 'line',
        points: [correctedX, correctedY],
        stroke: currentColor,
        strokeWidth: 2,
        lineCap: 'round',
        lineJoin: 'round'
      };
      
      // Use regular lines storage for all backgrounds (including PDF)
      setLines(prev => [...prev, newLine]);
      
      setIsDrawing(true);
      // Send line creation via WebRTC data channel
      sendWhiteboardMsg('draw', { shape: newLine });
    } else {
      const newShape = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: drawingTool,
        type: drawingTool,
        x: correctedX,
        y: correctedY,
        stroke: currentColor,
        strokeWidth: 2,
        fill: defaultFill ? currentColor : 'transparent'
      };

      log('DEBUG', 'Whiteboard', 'Creating new shape', newShape);

      // Set specific properties based on shape type
      switch (drawingTool) {
        case 'line':
          newShape.points = [0, 0, 0, 0];  // Initialize with relative coordinates for current layout
          break;
        case 'circle':
          newShape.radius = 0;
          break;
        case 'ellipse':
          newShape.radiusX = 0;
          newShape.radiusY = 0;
          break;
        case 'rectangle':
          newShape.width = 0;
          newShape.height = 0;
          break;
        case 'triangle':
          newShape.width = 0;
          newShape.height = 0;
          break;
      }

      // Use regular shapes storage for all backgrounds (including PDF)
      setShapes(prev => [...prev, newShape]);
      
      setSelectedShape(newShape);
      setIsDrawing(true);
      startPointRef.current = { x: correctedX, y: correctedY };
      if (DEBUG_MOUSE_MOVEMENT) {
        log('VERBOSE', 'Whiteboard', 'Mouse down - Set startPoint', { x: correctedX, y: correctedY });
      }
      
      // Send shape creation via WebRTC data channel
      log('INFO', 'Whiteboard', `📤 SENDING ${currentTool} tool creation`, {
        shapeId: newShape.id,
        shapeX: newShape.x,
        shapeY: newShape.y,
        correctedX,
        correctedY,
        timestamp: Date.now()
      });
      sendWhiteboardMsg('draw', { shape: newShape });
    }
  };

  const handleMouseUp = (e) => {
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse up - Current state', {
        isDrawing,
        tool: currentTool,
        selectedShape: selectedShape?.id,
        startPoint: startPointRef.current
      });
    }

    if (!isDrawing) return;

    setIsDrawing(false);
      setSelectedShape(null);
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse up - Set isDrawing=false, selectedShape=null');
    }
    startPointRef.current = null;
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse up - Cleared startPoint');
    }
  };

  const handleClick = (e) => {
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Click - Current state', {
        tool: currentTool,
        isDrawing,
        selectedShape: selectedShape?.id,
        clickedTarget: e.target.constructor.name,
        isStage: e.target.getStage() === e.target
      });
    }

    // If a tool is active, don't handle click (let mouse up handle it)
    if (currentTool) {
      if (DEBUG_MOUSE_MOVEMENT) {
        log('VERBOSE', 'Whiteboard', 'Click - Tool is active, returning early', currentTool);
      }
      return;
    }

    // Handle shape selection when no tool is active
    const clickedShape = e.target;
    if (clickedShape.getStage() !== clickedShape) {
      setSelectedShape(clickedShape);
    } else {
      setSelectedShape(null);
    }
  };

  const addToHistory = (currentLines = lines, currentShapes = shapes) => {
    log('DEBUG', 'Whiteboard', 'Adding to history', { 
      currentHistoryLength: history.length, 
      currentHistoryStep: historyStep,
      linesCount: currentLines.length,
      shapesCount: currentShapes.length
    });
    
    const newHistory = history.slice(0, historyStep + 1);
    
    // For PDFs, include page-specific state in history
    if (backgroundType === 'pdf') {
      newHistory.push({ 
        lines: [...currentLines], 
        shapes: [...currentShapes],
        pageLines: { ...pageLines },
        pageShapes: { ...pageShapes }
      });
    } else {
      newHistory.push({ lines: [...currentLines], shapes: [...currentShapes] });
    }
    
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    log('DEBUG', 'Whiteboard', 'History updated', { 
      newHistoryLength: newHistory.length, 
      newHistoryStep: newHistory.length - 1 
    });

    // Send history update via WebRTC data channel
    sendWhiteboardMsg('state', { 
          state: {
        lines: currentLines, 
        shapes: currentShapes, 
        historyStep: newHistory.length - 1,
        history: newHistory
      } 
    });
  };

  // Add to history when drawing is completed (only on mouse up, not during drawing)
  useEffect(() => {
    if (!isDrawing) {
      // Only add to history when we finish drawing a new shape
      // Check if the current state is different from the last history entry
      const currentHistoryEntry = history[historyStep];
      const hasChanged = !currentHistoryEntry || 
        JSON.stringify(currentHistoryEntry.lines) !== JSON.stringify(lines) ||
        JSON.stringify(currentHistoryEntry.shapes) !== JSON.stringify(shapes);
      
      if (hasChanged && (lines.length > 0 || shapes.length > 0)) {
        log('DEBUG', 'Whiteboard', 'Adding to history after drawing completion');
        addToHistory();
      }
    }
  }, [isDrawing]); // Only depend on isDrawing, not lines/shapes


  const handleUndo = () => {
    log('DEBUG', 'Whiteboard', 'Undo function called', { historyStep, historyLength: history.length });
    log('DEBUG', 'Whiteboard', 'Current history', history);
    
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const prevState = history[newStep];
      log('DEBUG', 'Whiteboard', 'Undoing to step', { newStep, state: prevState });
      log('DEBUG', 'Whiteboard', 'Current lines before undo', lines.length);
      log('DEBUG', 'Whiteboard', 'Current shapes before undo', shapes.length);
      log('DEBUG', 'Whiteboard', 'New lines after undo', prevState.lines.length);
      log('DEBUG', 'Whiteboard', 'New shapes after undo', prevState.shapes.length);
      
      // Simple approach - just update state directly
      setLines(prevState.lines);
      setShapes(prevState.shapes);
      
      // For PDFs, also restore page-specific state
      if (backgroundType === 'pdf' && prevState.pageLines && prevState.pageShapes) {
        setPageLines(prevState.pageLines);
        setPageShapes(prevState.pageShapes);
      }
      
      setHistoryStep(newStep);

      log('DEBUG', 'Whiteboard', 'State updates called - lines and shapes should be updated');

      // Send state via WebRTC data channel (like the backup version)
      sendWhiteboardMsg('state', { 
        state: {
          lines: prevState.lines, 
          shapes: prevState.shapes, 
          historyStep: newStep,
          history: history
        }
      });
    } else {
      log('DEBUG', 'Whiteboard', 'Cannot undo - already at first step');
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      const state = history[newStep];
      
      // Simple approach - just update state directly
      setLines(state.lines);
      setShapes(state.shapes);
      
      // For PDFs, also restore page-specific state
      if (backgroundType === 'pdf' && state.pageLines && state.pageShapes) {
        setPageLines(state.pageLines);
        setPageShapes(state.pageShapes);
      }
      
      setHistoryStep(newStep);

      // Send state via WebRTC data channel (like the backup version)
      sendWhiteboardMsg('state', { 
        state: {
          lines: state.lines, 
          shapes: state.shapes, 
          historyStep: newStep,
          history: history
        }
      });
    }
  };

  // Handle undo/redo from toolbar
  useEffect(() => {
    log('DEBUG', 'Whiteboard', 'Setting up undo ref', { onUndo, hasCurrent: onUndo?.current !== undefined });
    if (onUndo) {
      onUndo.current = handleUndo;
      log('DEBUG', 'Whiteboard', 'Undo function set in ref');
    }
  }, [onUndo, handleUndo]);

  useEffect(() => {
    log('DEBUG', 'Whiteboard', 'Setting up redo ref', { onRedo, hasCurrent: onRedo?.current !== undefined });
    if (onRedo) {
      onRedo.current = handleRedo;
      log('DEBUG', 'Whiteboard', 'Redo function set in ref');
    }
  }, [onRedo, handleRedo]);

  // Notify parent of history changes
  useEffect(() => {
    if (onHistoryChange) {
      onHistoryChange({
        canUndo: historyStep > 0,
        canRedo: historyStep < history.length - 1,
        historyStep,
        historyLength: history.length
      });
    }
  }, [historyStep, history.length, onHistoryChange]);


  const handleImageUpload = async (event) => {
    log('DEBUG', 'Whiteboard', 'File input change event triggered', { 
      hasFiles: event.target.files.length > 0, 
      fileCount: event.target.files.length,
      isScreenShareActive,
      hasBackgroundFile: !!backgroundFile
    });
    
    const file = event.target.files[0];
    if (!file) {
      log('DEBUG', 'Whiteboard', 'No file selected, returning');
      return;
    }
    
    log('INFO', 'Whiteboard', 'Image upload started', file.name);
    
    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        log('ERROR', 'Whiteboard', 'Invalid file type', file.type);
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        log('ERROR', 'Whiteboard', 'File too large', file.size);
        return;
      }
      
      // Upload to backend
      const formData = new FormData();
      formData.append('file', file);
      
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net';
      const response = await fetch(`${backendUrl}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      log('INFO', 'Whiteboard', 'Upload successful', result);
      
      // Use backend proxy URL to avoid CORS issues
      const imageUrl = `${backendUrl}/api/files/proxy/${result.filename}`;
      
      // Clear PDF-specific state when switching to image
      setPdfPages(0);
      
      // Clear PDF dimensions to prevent layout conflicts
      setBackgroundDimensions({ width: 0, height: 0 });
      
      // Clear all drawings when switching to image
      clearAllDrawings();
      
      // Set background (preserve existing drawings)
      setBackgroundFile(imageUrl);
      setBackgroundType('image');
      
      // Add to history with current state (preserve existing drawings)
      addToHistory();
      
      // Notify parent component
      if (onImageChange) {
        onImageChange(imageUrl);
      }
      
      // Send to remote peers
        if (webRTCProvider && selectedPeer) {
          log('INFO', 'Whiteboard', 'Sending image to remote peer', { selectedPeer, imageUrl });
          log('INFO', 'Whiteboard', 'Sending image to remote peer', { peer: selectedPeer, imageUrl });
          webRTCProvider.sendWhiteboardMessage(selectedPeer, {
            action: 'background',
            background: {
              file: imageUrl,
              type: 'image'
            }
          });
        } else {
          log('WARN', 'Whiteboard', 'Cannot send image to remote peer', { 
            hasWebRTCProvider: !!webRTCProvider, 
            selectedPeer, 
            imageUrl 
          });
        }
      
    } catch (error) {
      log('ERROR', 'Whiteboard', 'Upload failed', error);
    }
  };

  // Helper function to clear all drawings
  const clearAllDrawings = () => {
    log('INFO', 'Whiteboard', 'Clearing all drawings');
    setLines([]);
    setShapes([]);
    setPageLines({});
    setPageShapes({});
    setHistory([{ lines: [], shapes: [] }]);
    setHistoryStep(0);
  };

  // Expose global functions
  useEffect(() => {
    // Global clear drawings function
    window.clearDrawings = clearAllDrawings;
    
    // Global function to get current drawing state
    window.getDrawingState = () => ({
      lines: lines,
      shapes: shapes,
      pageLines: pageLines,
      pageShapes: pageShapes,
      historyStep: historyStep,
      historyLength: history.length
    });
    
    // Global function to check if there are any drawings
    window.hasDrawings = () => {
      return lines.length > 0 || shapes.length > 0 || 
             Object.keys(pageLines).length > 0 || Object.keys(pageShapes).length > 0;
    };
    
    log('DEBUG', 'Whiteboard', 'Global functions exposed', {
      clearDrawings: 'Clear all drawings',
      getDrawingState: 'Get current drawing state',
      hasDrawings: 'Check if there are any drawings'
    });
    
    return () => {
      delete window.clearDrawings;
      delete window.getDrawingState;
      delete window.hasDrawings;
    };
  }, [lines, shapes, pageLines, pageShapes, historyStep, history]);

  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    handleImageUpload: handleImageUpload,
    handleFileUpload: handleFileUpload,
    clearBackground: () => {
      log('INFO', 'Whiteboard', 'Clearing background due to screen share activation');
      setBackgroundFile(null);
      setBackgroundType(null);
      
      // Clear all drawings when screen share is activated
      clearAllDrawings();
    },
    clearDrawings: clearAllDrawings
  }));

  const handleFileUpload = async (event) => {
    const uploadStartTime = performance.now();
    const absoluteStartTime = Date.now();
    window.pdfUploadStartTime = absoluteStartTime;
    log('INFO', 'Whiteboard', 'PDF upload triggered via DashboardPage');
    log('DEBUG', 'Whiteboard', 'End-to-end start time', {
      timestamp: new Date(absoluteStartTime).toISOString(),
      performanceTime: uploadStartTime
    });
    
    const file = event.target.files[0];
    if (file) {
      log('INFO', 'Whiteboard', 'PDF file received', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });
      
      // Note: onFileUpload not called for PDFs to avoid infinite loop
      // Mutual exclusivity is handled by DashboardPage before calling this function
      
      // Upload PDF to backend and get CDN URL (same as images)
      log('INFO', 'Whiteboard', 'Starting PDF upload to backend for CDN URL');
      try {
        // Validate file type
        if (file.type !== 'application/pdf') {
          log('ERROR', 'Whiteboard', 'Invalid file type', file.type);
          return;
        }
        
        // Validate file size (max 50MB for PDFs)
        if (file.size > 50 * 1024 * 1024) {
          log('ERROR', 'Whiteboard', 'File too large', file.size);
          return;
        }
        
        log('INFO', 'Whiteboard', 'Uploading PDF to backend');
        // Upload to backend (same as images)
        const formData = new FormData();
        formData.append('file', file);
        
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net';
        const uploadRequestStart = performance.now();
        const response = await fetch(`${backendUrl}/api/files/upload`, {
          method: 'POST',
          body: formData
        });
        const uploadRequestEnd = performance.now();
        
        if (!response.ok) {
          if (response.status === 400) {
            throw new Error(`Backend doesn't support PDF uploads yet (400 Bad Request). Please ask Gemini to enable PDF support in the backend.`);
          }
          throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        const uploadEndTime = performance.now();
        window.pdfUploadEndTime = Date.now();
        log('INFO', 'Whiteboard', 'PDF upload successful', result);
        log('DEBUG', 'Whiteboard', 'Upload timing', {
          totalUploadTime: `${(uploadEndTime - uploadStartTime).toFixed(2)}ms`,
          networkRequestTime: `${(uploadRequestEnd - uploadRequestStart).toFixed(2)}ms`,
          fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
          uploadSpeed: `${((file.size / 1024 / 1024) / ((uploadEndTime - uploadStartTime) / 1000)).toFixed(2)}MB/s`
        });
        
        // Use backend proxy URL to avoid CORS issues
        const pdfUrl = `${backendUrl}/api/files/proxy/${result.filename}`;
        log('INFO', 'Whiteboard', 'PDF proxy URL generated', pdfUrl);
        
        // Clear image-specific state when switching to PDF
        setBackgroundDimensions({ width: 0, height: 0 });
        
        // Clear all drawings when switching to PDF
        clearAllDrawings();
        
        // Set background (preserve existing drawings)
        log('INFO', 'Whiteboard', 'Setting PDF as background file with CDN URL');
        setBackgroundFile(pdfUrl);
        setBackgroundType('pdf');
        
        // Add to history with current state (preserve existing drawings)
        addToHistory();
        
        // Send to remote peers (same as images)
        if (webRTCProvider && selectedPeer) {
          const peerSendStart = performance.now();
          log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { selectedPeer, pdfUrl });
          log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { peer: selectedPeer, pdfUrl });
          webRTCProvider.sendWhiteboardMessage(selectedPeer, {
            action: 'background',
            background: {
              file: pdfUrl,
              type: 'pdf'
            }
          });
          const peerSendEnd = performance.now();
          log('INFO', 'Whiteboard', 'PDF sent to remote peer successfully');
          log('DEBUG', 'Whiteboard', 'Peer send timing', {
            peerSendTime: `${(peerSendEnd - peerSendStart).toFixed(2)}ms`
          });
        } else {
          log('WARN', 'Whiteboard', 'Cannot send PDF to remote peer', { 
            hasWebRTCProvider: !!webRTCProvider, 
            selectedPeer, 
            pdfUrl 
          });
        }
        
        const totalEndTime = performance.now();
        log('INFO', 'Whiteboard', 'PDF upload and sharing completed successfully');
        log('DEBUG', 'Whiteboard', 'Total processing time', {
          totalTime: `${(totalEndTime - uploadStartTime).toFixed(2)}ms`,
          breakdown: {
            upload: `${(uploadEndTime - uploadStartTime).toFixed(2)}ms`,
            peerSend: webRTCProvider && selectedPeer ? `${(totalEndTime - uploadEndTime).toFixed(2)}ms` : 'N/A (no peer)'
          }
        });
        
      } catch (error) {
        log('ERROR', 'Whiteboard', 'PDF upload failed', error);
        // Fallback: set file directly (won't work with remote peers)
        log('WARN', 'Whiteboard', 'Falling back to direct file setting (no remote sharing)');
        setBackgroundFile(file);
        setBackgroundType('pdf');
        
        // Add to history with current state (preserve existing drawings)
        addToHistory();
      }
      
      // Note: onPdfChange not called to avoid loop
      // Mutual exclusivity is already handled by DashboardPage before calling this function
    } else {
      log('DEBUG', 'Whiteboard', 'No file selected');
    }
  };

  // NEW: Enhanced PDF upload with CDN support (optional)
  const handleFileUploadWithCDN = async (event) => {
    log('INFO', 'Whiteboard', 'PDF upload with CDN started');
    
    const file = event.target.files[0];
    if (!file) {
      log('DEBUG', 'Whiteboard', 'No file selected, returning');
      return;
    }
    
    log('INFO', 'Whiteboard', 'PDF upload started', file.name);
    
    try {
      // Validate file type
      if (file.type !== 'application/pdf') {
        log('ERROR', 'Whiteboard', 'Invalid file type', file.type);
        return;
      }
      
      // Validate file size (max 50MB for PDFs)
      if (file.size > 50 * 1024 * 1024) {
        log('ERROR', 'Whiteboard', 'File too large', file.size);
        return;
      }
      
      // Upload to backend (same as images)
      const formData = new FormData();
      formData.append('file', file);
      
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net';
      const response = await fetch(`${backendUrl}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      log('INFO', 'Whiteboard', 'PDF upload successful', result);
      
      // Use CDN URL for better performance (same as images)
      const pdfUrl = result.url;
      
      // Set background (preserve existing drawings)
      setBackgroundFile(pdfUrl);
      setBackgroundType('pdf');
      
      // Add to history with current state (preserve existing drawings)
      addToHistory();
      
      // Notify parent component
      if (onPdfChange) {
        onPdfChange(pdfUrl);
      }
      
      // Send to remote peers (same as images)
      if (webRTCProvider && selectedPeer) {
        log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { selectedPeer, pdfUrl });
        log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { peer: selectedPeer, pdfUrl });
        webRTCProvider.sendWhiteboardMessage(selectedPeer, {
          action: 'background',
          background: {
            file: pdfUrl,
            type: 'pdf'
          }
        });
      } else {
        log('WARN', 'Whiteboard', 'Cannot send PDF to remote peer', { 
          hasWebRTCProvider: !!webRTCProvider, 
          selectedPeer, 
          pdfUrl 
        });
      }
      
    } catch (error) {
      log('ERROR', 'Whiteboard', 'PDF upload failed', error);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Calculate page position including gaps for navigation
  const getPagePosition = (pageNumber) => {
    const pageHeight = 800; // Standard page height
    const gap = 5; // Gap between pages
    return (pageNumber - 1) * (pageHeight + gap);
  };

  // Scroll to specific page
  const scrollToPage = (pageNumber) => {
    const position = getPagePosition(pageNumber);
    log('INFO', 'Whiteboard', 'Scrolling to page', { pageNumber, position });
    
    // Find the dashboard-content element and scroll to position
    const dashboardContent = document.querySelector('.dashboard-content');
    if (dashboardContent) {
      dashboardContent.scrollTo({
        top: position,
        behavior: 'smooth'
      });
    }
  };

  // Navigate to previous page
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      scrollToPage(newPage);
      // Notify parent component
      if (onPdfPageChange) {
        onPdfPageChange(newPage);
      }
    }
  };

  // Navigate to next page
  const goToNextPage = () => {
    if (currentPage < pdfPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      scrollToPage(newPage);
      // Notify parent component
      if (onPdfPageChange) {
        onPdfPageChange(newPage);
      }
    }
  };

  // Handle external page changes from PDFNavigation component
  useEffect(() => {
    if (pdfCurrentPage && pdfCurrentPage !== currentPage) {
      setCurrentPage(pdfCurrentPage);
      scrollToPage(pdfCurrentPage);
    }
  }, [pdfCurrentPage]);

  // Get current visible page based on scroll position
  const getCurrentVisiblePage = () => {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return 1;
    
    const scrollTop = dashboardContent.scrollTop;
    const pageHeight = 800; // Standard page height
    const gap = 5; // Gap between pages
    
    // Calculate which page is currently in view
    const pageNumber = Math.floor(scrollTop / (pageHeight + gap)) + 1;
    return Math.max(1, Math.min(pageNumber, pdfPages));
  };

  // Track background type changes
  useEffect(() => {
    log('INFO', 'Whiteboard', '🔄 BACKGROUND TYPE CHANGED', {
      backgroundType,
      pdfLoaded: backgroundType === 'pdf',
      timestamp: Date.now()
    });
  }, [backgroundType]);

  // Update current page when scrolling
  useEffect(() => {
    if (backgroundType === 'pdf' && pdfPages > 1) {
      const dashboardContent = document.querySelector('.dashboard-content');
      if (dashboardContent) {
        const handleScroll = () => {
          const visiblePage = getCurrentVisiblePage();
          if (visiblePage !== currentPage) {
            setCurrentPage(visiblePage);
          }
        };
        
        dashboardContent.addEventListener('scroll', handleScroll);
        return () => dashboardContent.removeEventListener('scroll', handleScroll);
      }
    }
  }, [backgroundType, pdfPages, currentPage]);

  const handleClear = () => {
    if (backgroundType === 'pdf') {
      // Clear drawings for current page only
      const currentPageNum = getCurrentVisiblePage();
      setPageLines(prev => ({
        ...prev,
        [currentPageNum]: []
      }));
      setPageShapes(prev => ({
        ...prev,
        [currentPageNum]: []
      }));
    } else {
      // Clear all drawings for non-PDF backgrounds
      setLines([]);
      setShapes([]);
    }
    setSelectedShape(null);
    
    addToHistory();
    
    // Send clear via WebRTC data channel
    sendWhiteboardMsg('state', { 
      state: { 
          lines: [],
          shapes: [],
        historyStep: 0,
        history: [{ lines: [], shapes: [], historyStep: 0 }]
      }
    });
  };

  log('DEBUG', 'Whiteboard', 'Rendering whiteboard with toolbar', {
            userId,
            username,
    isScreenShareActive,
    hasBackgroundFile: !!backgroundFile,
    backgroundType,
    containerSize
  });

  // Debug transparency issues
  log('DEBUG', 'Whiteboard', 'Transparency debug', {
    isScreenShareActive,
    containerBackgroundColor: isScreenShareActive ? 'transparent' : 'rgba(230, 243, 255, 0.9)',
    scrollContainerBackgroundColor: isScreenShareActive ? 'transparent' : '#f0f8ff',
    drawingSurfaceBackgroundColor: isScreenShareActive ? 'transparent' : 'transparent',
    stageBackground: isScreenShareActive ? 'transparent' : 'transparent',
    hasBackgroundFile: !!backgroundFile,
    backgroundType,
    showBackgroundLayer: backgroundFile && !isScreenShareActive
  });

  // Add useEffect to debug actual computed styles
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const computedStyle = window.getComputedStyle(container);
      log('DEBUG', 'Whiteboard', 'Computed styles debug', {
        containerBackgroundColor: computedStyle.backgroundColor,
        containerBorder: computedStyle.border,
        containerBoxShadow: computedStyle.boxShadow,
        containerPosition: computedStyle.position,
        containerZIndex: computedStyle.zIndex,
        containerWidth: computedStyle.width,
        containerHeight: computedStyle.height,
        isScreenShareActive
      });

      // Debug all child elements
      const children = container.children;
      log('DEBUG', 'Whiteboard', 'Child elements debug', {
        childCount: children.length,
        children: Array.from(children).map((child, index) => ({
          index,
          tagName: child.tagName,
          className: child.className,
          backgroundColor: window.getComputedStyle(child).backgroundColor,
          border: window.getComputedStyle(child).border,
          position: window.getComputedStyle(child).position,
          zIndex: window.getComputedStyle(child).zIndex,
          display: window.getComputedStyle(child).display,
          visibility: window.getComputedStyle(child).visibility
        }))
      });

      // Debug the whiteboard container (parent of scroll container)
      const whiteboardContainer = container.parentElement;
      if (whiteboardContainer) {
        const whiteboardComputedStyle = window.getComputedStyle(whiteboardContainer);
        log('DEBUG', 'Whiteboard', 'Whiteboard container debug', {
          className: whiteboardContainer.className,
          backgroundColor: whiteboardComputedStyle.backgroundColor,
          border: whiteboardComputedStyle.border,
          boxShadow: whiteboardComputedStyle.boxShadow,
          position: whiteboardComputedStyle.position,
          zIndex: whiteboardComputedStyle.zIndex,
          width: whiteboardComputedStyle.width,
          height: whiteboardComputedStyle.height,
          hasScreenShareOverlayClass: whiteboardContainer.classList.contains('screen-share-overlay')
        });
      }
    }
  }, [isScreenShareActive]);

  return (
    <>
      {/* Whiteboard Container - Drawing Surface Only */}
      <div 
        ref={containerRef}
        className={`whiteboard-container ${isScreenShareActive ? 'screen-share-overlay' : ''}`}
        style={(() => {
          const finalWidth = isScreenShareActive && screenShareDimensions.width > 0 
            ? `${screenShareDimensions.width}px` 
            : backgroundDimensions.width > 0 
              ? `${backgroundDimensions.width}px` 
              : currentContainerSize.width;
          const finalHeight = isScreenShareActive && screenShareDimensions.height > 0 
            ? `${screenShareDimensions.height}px` 
            : backgroundDimensions.height > 0 
              ? `${backgroundDimensions.height}px` 
              : currentContainerSize.height;
          
          log('INFO', 'Whiteboard', '🎨 RENDERING container', {
            isScreenShareActive,
            screenShareDimensions,
            backgroundDimensions,
            currentContainerSize,
            finalWidth,
            finalHeight,
            backgroundType,
            pdfLoaded: backgroundType === 'pdf',
            currentImageUrl: !!currentImageUrl,
            linesCount: lines.length,
            pageLinesCount: Object.keys(pageLines).length,
            timestamp: Date.now()
          });
          
          const zIndex = 2; // Drawing layer should always be above any background
          
          log('INFO', 'Whiteboard', '📐 APPLYING z-index and positioning', {
            zIndex,
            isScreenShareActive,
            backgroundType,
            pdfLoaded: backgroundType === 'pdf',
            position: isScreenShareActive ? 'absolute' : 'relative',
            containerWidth: finalWidth,
            containerHeight: finalHeight,
            containerTop: isScreenShareActive ? '0' : 'auto',
            containerLeft: isScreenShareActive ? '0' : 'auto',
            backgroundColor: isScreenShareActive ? 'transparent' : 'rgba(230, 243, 255, 0.9)',
            border: isScreenShareActive ? 'none' : '4px solid #8B4513',
            pointerEvents: isScreenShareActive ? 'all' : 'auto',
            timestamp: Date.now()
          });
          
          return {
            position: isScreenShareActive ? 'absolute' : 'relative',
            top: isScreenShareActive ? '0' : 'auto',
            left: isScreenShareActive ? '0' : 'auto',
            width: finalWidth,
            height: finalHeight,
            minWidth: isScreenShareActive && screenShareDimensions.width > 0 
              ? `${screenShareDimensions.width}px` 
              : currentContainerSize.width,
            minHeight: isScreenShareActive && screenShareDimensions.height > 0 
              ? `${screenShareDimensions.height}px` 
              : currentContainerSize.height,
            zIndex: zIndex,
            backgroundColor: isScreenShareActive ? 'transparent' : 'rgba(230, 243, 255, 0.9)',
            border: isScreenShareActive ? 'none' : '4px solid #8B4513',
            pointerEvents: isScreenShareActive ? 'all' : 'auto',
            overflow: 'visible' // Let dashboard-content handle scrolling
          };
        })()}
      >
        {/* Background Layer - PDF and Images */}
        {backgroundFile && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 1,
              backgroundColor: '#f5f5f5',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start', // Start from top instead of center
              padding: '10px', // Add 10px padding around the PDF
              pointerEvents: 'none' // Allow mouse events to pass through to Stage
            }}
            onMouseEnter={() => {
              log('INFO', 'Whiteboard', '📄 PDF BACKGROUND HOVER', {
                backgroundType,
                pdfLoaded: backgroundType === 'pdf',
                zIndex: 1,
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#f5f5f5',
                padding: '10px',
                timestamp: Date.now()
              });
            }}
          >
            {backgroundType === 'pdf' ? (
              <Document
                file={backgroundFile}
                onLoadStart={() => {
                  const downloadStartTime = performance.now();
                  log('DEBUG', 'Whiteboard', 'PDF download started', {
                    url: backgroundFile,
                    timestamp: downloadStartTime
                  });
                  // Store start time for later calculation
                  window.pdfDownloadStartTime = downloadStartTime;
                }}
                onLoadSuccess={({ numPages }) => {
                  const renderStartTime = performance.now();
                  setPdfRenderStartTime(renderStartTime);
                  window.pdfRenderStartTime = renderStartTime;
                  const downloadTime = window.pdfDownloadStartTime ? 
                    (renderStartTime - window.pdfDownloadStartTime) : null;
                  
                  log('INFO', 'Whiteboard', 'PDF loaded successfully with pages', numPages);
                  if (downloadTime) {
                    log('DEBUG', 'Whiteboard', 'PDF download timing', {
                      downloadTime: `${downloadTime.toFixed(2)}ms`,
                      url: backgroundFile,
                      fileSize: 'Unknown (from proxy)'
                    });
                  }
                  setPdfPages(numPages);
                  
                  // Notify parent component about PDF pages
                  if (onPdfPagesChange) {
                    onPdfPagesChange(numPages);
                  }
                  
                  // Calculate total PDF height for all pages + gaps
                  // Account for 10px padding on each side (20px total)
                  const containerWidth = backgroundDimensions.width > 0 ? backgroundDimensions.width : currentContainerSize.width;
                  const pageWidth = containerWidth - 20; // Subtract 20px for padding (10px on each side)
                  
                  // Calculate initial height estimate (will be updated when pages render)
                  const estimatedPageHeight = 800; // Fallback estimate
                  const gap = 6;
                  const estimatedContentHeight = estimatedPageHeight * numPages; // Just the page heights
                  const estimatedGapSpace = (numPages - 1) * gap; // Total space taken by gaps
                  const estimatedTotalHeight = estimatedContentHeight + estimatedGapSpace + 20; // Add gaps + 20px for padding
                  
                  log('DEBUG', 'Whiteboard', 'PDF dimensions calculated', {
                    numPages,
                    pageWidth,
                    willExceedContainer: true,
                    scrollbarsNeeded: 'YES - PDF will exceed dashboard-content (800px)',
                    spacingInfo: {
                      gapBetweenPages: '6px',
                      totalGaps: (numPages - 1) * 6
                    }
                  });
                  
                  // Set initial background dimensions - will be updated when pages actually render
                  setBackgroundDimensions({ 
                    width: pageWidth, 
                    height: 0 // Will be updated when pages render
                  });
                  
                  // Log container sizing for debugging
                  log('DEBUG', 'Whiteboard', 'Container will expand to', {
                    containerWidth: pageWidth,
                    containerHeight: 'Will be calculated when pages render',
                    dashboardContentSize: '1200x800px',
                    willShowScrollbars: true
                  });
                  
                  // Debug: Log actual dimensions after a short delay to see rendered size
                  setTimeout(() => {
                    const pdfContainer = document.querySelector('.pdf-pages-container');
                    if (pdfContainer) {
                      const rect = pdfContainer.getBoundingClientRect();
                      const renderEndTime = performance.now();
                      log('DEBUG', 'Whiteboard', 'Actual PDF container dimensions', {
                        width: rect.width,
                        height: rect.height,
                        expectedHeight: 'Will be calculated when pages render',
                        difference: 'N/A - using dynamic calculation',
                        hasExtraSpacing: 'N/A - using dynamic calculation'
                      });
                      log('DEBUG', 'Whiteboard', 'PDF render timing', {
                        renderTime: pdfRenderStartTime ? `${(renderEndTime - pdfRenderStartTime).toFixed(2)}ms` : 'N/A',
                        numPages: numPages,
                        renderSpeed: pdfRenderStartTime ? `${(numPages / ((renderEndTime - pdfRenderStartTime) / 1000)).toFixed(2)} pages/sec` : 'N/A'
                      });
                    }
                  }, 1000);
                }}
                onLoadError={(error) => {
                  console.error('[Whiteboard] 📄 Error loading PDF:', error);
                }}
                loading={<div>Loading PDF...</div>}
              >
                {/* PDF Navigation is now handled by external PDFNavigation component */}

                {/* Render ALL pages with 6px gaps between pages only */}
                <div className="pdf-pages-container">
                  {Array.from({ length: pdfPages }, (_, index) => (
                    <div 
                      key={index + 1} 
                      className="pdf-page-container"
                      style={{ 
                        marginBottom: index < pdfPages - 1 ? '6px' : '0px' // 6px gap between pages, no gap after last page
                      }}
                    >
                      <Page
                        pageNumber={index + 1}
                        width={(() => {
                          const containerWidth = backgroundDimensions.width > 0 ? backgroundDimensions.width : currentContainerSize.width;
                          return containerWidth - 20; // Subtract 20px for padding (10px on each side)
                        })()}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        error={<div>Error loading page {index + 1}!</div>}
                        loading={<div>Loading page {index + 1}...</div>}
                        onLoadSuccess={(page) => {
                          const pageRenderTime = performance.now();
                          log('DEBUG', 'Whiteboard', `Page ${index + 1} rendered`, {
                            pageNumber: index + 1,
                            renderTime: pdfRenderStartTime ? `${(pageRenderTime - pdfRenderStartTime).toFixed(2)}ms` : 'N/A',
                            cumulativeTime: `${(pageRenderTime - (window.pdfDownloadStartTime || pdfRenderStartTime || 0)).toFixed(2)}ms`
                          });
                          
                          // Get actual PDF page dimensions from metadata
                          if (page && page.originalWidth && page.originalHeight) {
                            log('DEBUG', 'Whiteboard', `Page ${index + 1} PDF metadata`, {
                              originalWidth: page.originalWidth,
                              originalHeight: page.originalHeight,
                              scale: page.scale,
                              renderedWidth: page.width,
                              renderedHeight: page.height
                            });
                            
                            // Calculate the actual rendered height based on PDF metadata
                            // Account for 10px padding on each side (20px total)
                            const containerWidth = backgroundDimensions.width > 0 ? backgroundDimensions.width : currentContainerSize.width;
                            const currentPageWidth = containerWidth - 20; // Subtract 20px for padding (10px on each side)
                            const scale = currentPageWidth / page.originalWidth;
                            const actualPageHeight = page.originalHeight * scale;
                            
                            log('DEBUG', 'Whiteboard', `Page ${index + 1} calculated dimensions`, {
                              pdfOriginalWidth: page.originalWidth,
                              pdfOriginalHeight: page.originalHeight,
                              renderedWidth: currentPageWidth,
                              calculatedHeight: actualPageHeight,
                              scale: scale
                            });
                            
                            // Update background dimensions with actual PDF metadata
                            // Include gaps in height calculation since they affect the total rendered height
                            const gap = 6;
                            const contentHeight = actualPageHeight * pdfPages; // Just the page heights
                            const totalGapSpace = (pdfPages - 1) * gap; // Total space taken by gaps between pages
                            const totalHeight = contentHeight + totalGapSpace + 20; // Add gaps + 20px for padding
                            
                            setBackgroundDimensions(prev => ({
                              ...prev,
                              height: totalHeight
                            }));
                            
                            log('DEBUG', 'Whiteboard', 'Updated background dimensions from PDF metadata', {
                              width: currentPageWidth,
                              height: totalHeight,
                              contentHeight: contentHeight,
                              totalGapSpace: totalGapSpace,
                              padding: 20,
                              actualPageHeight,
                              numPages: pdfPages,
                              gapPerPage: gap,
                              source: 'PDF metadata'
                            });
                            
                            // Debug: Check actual DOM dimensions after a short delay
                            setTimeout(() => {
                              const pdfDoc = document.querySelector('.react-pdf__Document');
                              const pdfContainer = document.querySelector('.pdf-pages-container');
                              const parentDiv = pdfDoc?.parentElement;
                              const pageContainers = document.querySelectorAll('.pdf-page-container');
                              
                              if (pdfDoc && pdfContainer && parentDiv) {
                                const docRect = pdfDoc.getBoundingClientRect();
                                const containerRect = pdfContainer.getBoundingClientRect();
                                const parentRect = parentDiv.getBoundingClientRect();
                                
                                // Check individual page containers
                                const pageHeights = Array.from(pageContainers).map((container, index) => {
                                  const rect = container.getBoundingClientRect();
                                  const computedStyle = window.getComputedStyle(container);
                                  return {
                                    page: index + 1,
                                    height: rect.height,
                                    marginBottom: computedStyle.marginBottom,
                                    backgroundColor: computedStyle.backgroundColor
                                  };
                                });
                                
                                // Check dashboard-content dimensions
                                const dashboardContent = document.querySelector('.dashboard-content');
                                const dashboardRect = dashboardContent?.getBoundingClientRect();
                                
                                log('DEBUG', 'Whiteboard', 'Actual DOM dimensions', {
                                  reactPdfHeight: docRect.height,
                                  pdfContainerHeight: containerRect.height,
                                  parentDivHeight: parentRect.height,
                                  difference: parentRect.height - docRect.height,
                                  expectedDifference: 20, // Only padding, gaps are applied via CSS
                                  gapAppliedViaCSS: (pdfPages - 1) * 6,
                                  pageContainers: pageHeights,
                                  dashboardContent: {
                                    width: dashboardRect?.width,
                                    height: dashboardRect?.height,
                                    scrollWidth: dashboardContent?.scrollWidth,
                                    scrollHeight: dashboardContent?.scrollHeight,
                                    hasHorizontalScroll: dashboardContent?.scrollWidth > dashboardContent?.clientWidth,
                                    hasVerticalScroll: dashboardContent?.scrollHeight > dashboardContent?.clientHeight
                                  }
                                });
                              }
                            }, 500);
                          } else {
                            log('WARN', 'Whiteboard', `Page ${index + 1} - No PDF metadata available, using fallback`);
                          }
                          
                          // Log end-to-end timing for the last page
                          if (index + 1 === pdfPages) {
                            const absoluteEndTime = Date.now();
                            const totalEndToEndTime = absoluteEndTime - window.pdfUploadStartTime;
                            log('DEBUG', 'Whiteboard', 'End-to-end complete', {
                              totalTime: `${totalEndToEndTime}ms`,
                              totalTimeSeconds: `${(totalEndToEndTime / 1000).toFixed(2)}s`,
                              timestamp: new Date(absoluteEndTime).toISOString(),
                              breakdown: {
                                upload: `${(window.pdfUploadEndTime - window.pdfUploadStartTime).toFixed(2)}ms`,
                                render: `${(pageRenderTime - window.pdfRenderStartTime).toFixed(2)}ms`,
                                total: `${totalEndToEndTime}ms`
                              }
                            });
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </Document>
            ) : backgroundType === 'image' ? (
              <img
                src={backgroundFile}
                alt="Background Image"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }}
                onLoad={(e) => {
                  const img = e.target;
                  const naturalWidth = img.naturalWidth;
                  const naturalHeight = img.naturalHeight;
                  log('INFO', 'Whiteboard', 'Image loaded successfully', {
                    src: backgroundFile,
                    naturalWidth,
                    naturalHeight,
                    displayWidth: img.offsetWidth,
                    displayHeight: img.offsetHeight
                  });
                  
                  // Set background dimensions to image's natural size
                  log('DEBUG', 'Whiteboard', 'Setting background dimensions to image natural size', {
                    width: naturalWidth,
                    height: naturalHeight,
                    previousDimensions: backgroundDimensions
                  });
                  setBackgroundDimensions({ width: naturalWidth, height: naturalHeight });
                  
                  // Log container size changes
                  log('DEBUG', 'Whiteboard', 'Container dimensions will change from', {
                    currentWidth: currentContainerSize.width,
                    currentHeight: currentContainerSize.height
                  });
                  log('DEBUG', 'Whiteboard', 'Container dimensions will change to', {
                    newWidth: naturalWidth,
                    newHeight: naturalHeight,
                    exceedsDashboardContent: naturalWidth > 1200 || naturalHeight > 800,
                    shouldShowScrollbars: naturalWidth > 1200 || naturalHeight > 800 ? 'YES - Image exceeds dashboard-content (1200x800)' : 'NO - Image fits in dashboard-content'
                  });
                }}
                onError={(e) => console.error('[Whiteboard] 🖼️ Image failed to load:', backgroundFile, e)}
              />
            ) : null}
          </div>
        )}

        {/* Drawing Layer */}
        <Stage
          width={(() => {
            const stageWidth = isScreenShareActive && screenShareDimensions.width > 0 
              ? screenShareDimensions.width 
              : backgroundDimensions.width > 0 
                ? backgroundDimensions.width 
                : currentContainerSize.width;
            log('DEBUG', 'Whiteboard', 'Stage width set', {
              isScreenShareActive,
              screenShareDimensions,
              backgroundDimensions,
              currentContainerSize,
              finalStageWidth: stageWidth
            });
            return stageWidth;
          })()}
          height={(() => {
            const stageHeight = isScreenShareActive && screenShareDimensions.height > 0 
              ? screenShareDimensions.height 
              : backgroundDimensions.height > 0 
                ? backgroundDimensions.height 
                : currentContainerSize.height;
            log('DEBUG', 'Whiteboard', 'Stage height set', {
              isScreenShareActive,
              screenShareDimensions,
              backgroundDimensions,
              currentContainerSize,
              finalStageHeight: stageHeight
            });
            return stageHeight;
          })()}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 2,
            pointerEvents: 'all',
            background: 'transparent'
          }}
          onMouseEnter={() => {
            log('INFO', 'Whiteboard', '🎯 STAGE HOVER', {
              backgroundType,
              pdfLoaded: backgroundType === 'pdf',
              pageLinesCount: Object.keys(pageLines).length,
              totalLines: Object.values(pageLines).flat().length,
              stageWidth: isScreenShareActive && screenShareDimensions.width > 0 
                ? screenShareDimensions.width 
                : backgroundDimensions.width > 0 
                  ? backgroundDimensions.width 
                  : currentContainerSize.width,
              stageHeight: isScreenShareActive && screenShareDimensions.height > 0 
                ? screenShareDimensions.height 
                : backgroundDimensions.height > 0 
                  ? backgroundDimensions.height 
                  : currentContainerSize.height,
              containerSize: currentContainerSize,
              backgroundDimensions,
              screenShareDimensions,
              stagePosition: 'absolute',
              stageZIndex: 2,
              timestamp: Date.now()
            });
          }}
          onMouseDown={(e) => {
            log('INFO', 'Whiteboard', '🖱️ STAGE MOUSE DOWN', {
              backgroundType,
              pdfLoaded: backgroundType === 'pdf',
              currentTool,
              isDrawing,
              timestamp: Date.now()
            });
            handleMouseDown(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
            <Layer>
              {/* Render lines - use regular lines for all backgrounds */}
              {lines.map((line, index) => (
                <Line
                  key={line.id || index}
                  points={line.points}
                  stroke={line.stroke}
                  strokeWidth={line.strokeWidth}
                  lineCap={line.lineCap}
                  lineJoin={line.lineJoin}
                  draggable={!currentTool}
                  onClick={() => setSelectedShape(line)}
                />
              ))}

              {/* Render shapes - use regular shapes for all backgrounds */}
              {shapes.map((shape, index) => {
                    const commonProps = {
                      key: `shape-${shape.id || index}`,
                      x: shape.x,
                      y: shape.y,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill,
                      draggable: !currentTool,
                      onClick: () => setSelectedShape(shape)
                    };

                switch (shape.type) {
                  case 'line':
                    // Use absolute coordinates directly
                    return (
                      <Line
                        {...commonProps}
                        x={0}  // Reset x since we're using absolute coordinates
                        y={0}  // Reset y since we're using absolute coordinates
                        points={shape.points}  // Already absolute coordinates: [startX, startY, endX, endY]
                      />
                    );
                  case 'circle':
                    return (
                      <Circle
                        {...commonProps}
                        radius={shape.radius}
                      />
                    );
                  case 'ellipse':
                    return (
                      <Ellipse
                        {...commonProps}
                        radiusX={shape.radiusX}
                        radiusY={shape.radiusY}
                      />
                    );
                  case 'rectangle':
                    return (
                      <Rect
                        {...commonProps}
                        width={shape.width}
                        height={shape.height}
                      />
                    );
                  case 'triangle':
                    return (
                      <Group {...commonProps}>
                      <Line
                          points={[0, shape.height, shape.width / 2, 0, shape.width, shape.height]}
                          closed
                          stroke={shape.stroke}
                          strokeWidth={shape.strokeWidth}
                          fill={shape.fill}
                        />
                      </Group>
                    );
                  default:
                    return null;
                }
              })}

              {/* Render remote cursors */}
              {Array.from(cursors.entries()).map(([userId, cursor]) => (
                <Group key={userId}>
                  <Circle
                    x={cursor.position.x}
                    y={cursor.position.y}
                    radius={5}
                    fill={cursor.color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  <Text
                    x={cursor.position.x + 10}
                    y={cursor.position.y - 10}
                    text={cursor.username}
                    fontSize={12}
                    fill={cursor.color}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                </Group>
              ))}
            </Layer>
        </Stage>
      </div>
    </>
  );
});

export default Whiteboard; 