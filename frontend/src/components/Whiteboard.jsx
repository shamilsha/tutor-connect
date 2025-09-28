import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import PDFRenderer from './PDFRenderer';
import { Stage, Layer, Line, Circle, Ellipse, Rect, Transformer, Group, Text, RegularPolygon } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import { throttle } from 'lodash';
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
  onPDFDimensionsChange = null,
  webRTCProvider = null, 
  selectedPeer = null,
  // GLOBAL STATE APPROACH: Not needed anymore
  // currentTool = null,
  // currentColor = '#000000',
  // onToolChange = null,
  // onColorChange = null,
  onUndo = null,
  onRedo = null,
  onHistoryChange = null,
  onImageUpload = null,
  onFileUpload = null,
  onClear = null,
  canUndo = false,
  canRedo = false,
  // Mobile drawing mode
  isMobileDrawingMode = false,
  // PDF Navigation props
  pdfCurrentPage = 1,
  pdfScale = 1,
  onPdfPageChange = null,
  onPdfPagesChange = null,
}, ref) => {
  // COMPLETELY DIFFERENT APPROACH: Use global state that doesn't require props
  // Initialize global state if not exists
  if (!window.whiteboardToolState) {
    window.whiteboardToolState = {
      currentTool: 'pen',
      currentColor: '#000000'
    };
  }
  
  // CRITICAL FIX: Read from global state dynamically every time
  const getActualTool = () => window.whiteboardToolState?.currentTool || 'pen';
  const getActualColor = () => window.whiteboardToolState?.currentColor || '#000000';
  
  // For logging purposes, get current values
  const actualTool = getActualTool();
  const actualColor = getActualColor();
  
  // PROPER FIX: Log current values for debugging
  console.log('[Whiteboard] 🔧 PROPER FIX: Current values', {
    // GLOBAL STATE APPROACH: Not needed anymore
    // currentTool,
    // currentColor,
    actualTool,
    actualColor,
    timestamp: Date.now()
  });
  
  // Drawing state
  const [lines, setLines] = useState([]);
  const [shapes, setShapes] = useState([]);

  // State to track background dimensions - MOVED TO TOP TO PREVENT HOISTING ERRORS
  const [backgroundDimensions, setBackgroundDimensions] = useState({ width: 0, height: 0 });
  // State to track screen share dimensions - MOVED TO TOP TO PREVENT HOISTING ERRORS
  const [screenShareDimensions, setScreenShareDimensions] = useState({ width: 0, height: 0 });
  
  // PDF render timing
  const [pdfRenderStartTime, setPdfRenderStartTime] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  // Use the prop instead of local state
  // const [isMobileDrawingMode, setIsMobileDrawingMode] = useState(false);
  
  
  
  const [selectedShape, setSelectedShape] = useState(null);
  const [history, setHistory] = useState([{ 
    lines: [], 
    shapes: [], 
    historyStep: 0 
  }]);
  const [historyStep, setHistoryStep] = useState(0);
  
  // Ensure we have a default tool for drawing (accessible to all functions)
  // CRITICAL FIX: Make drawingTool always reflect current actualTool
  const drawingTool = actualTool || 'pen';
  
  // Log current state after all state variables are declared
  log('DEBUG', 'Whiteboard', 'Current state on mount', { lines: lines.length, shapes: shapes.length, historyStep, historyLength: history.length });
  
  // Calculate proper container dimensions before rendering
  const calculateContainerDimensions = () => {
    let finalWidth, finalHeight;
    let source = 'unknown';
    
    if (isScreenShareActive && screenShareDimensions.width > 0 && screenShareDimensions.height > 0) {
      // Use screen share dimensions
      finalWidth = screenShareDimensions.width;
      finalHeight = screenShareDimensions.height;
      source = 'screenShare';
    } else if (backgroundDimensions.width > 0 && backgroundDimensions.height > 0) {
      // Use background dimensions
      finalWidth = backgroundDimensions.width;
      finalHeight = backgroundDimensions.height;
      source = 'background';
    } else {
      // Use default container size
      finalWidth = currentContainerSize.width;
      finalHeight = currentContainerSize.height;
      source = 'default';
    }
    
    log('DEBUG', 'Whiteboard', '📐 CALCULATE CONTAINER DIMENSIONS', {
      isScreenShareActive,
      screenShareDimensions,
      backgroundDimensions,
      currentContainerSize,
      source,
      finalWidth,
      finalHeight,
      timestamp: Date.now()
    });
    
    return { finalWidth, finalHeight };
  };
  
  const [defaultFill, setDefaultFill] = useState(false);
  const [strokeColor, setStrokeColor] = useState(actualColor);
  const [fillColor, setFillColor] = useState(actualColor);
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

  // Calculate container dimensions - will be set in useEffect
  const [finalWidth, setFinalWidth] = useState(containerSize.width);
  const [finalHeight, setFinalHeight] = useState(containerSize.height);

  // Debug flag to control verbose logging
  const DEBUG_MOUSE_MOVEMENT = LOG_LEVEL === 'VERBOSE'; // Enable mouse movement logs in VERBOSE mode

  // Refs
  const startPointRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const screenShareVideoRef = useRef(null);
  const webRTCProviderRef = useRef(null);
  const selectedPeerRef = useRef(null);
  const pdfDimensionsRef = useRef(null); // Cache PDF dimensions to avoid recalculating

  // PROPER FIX: Update stroke color when actualColor changes
  useEffect(() => {
    setStrokeColor(actualColor);
    setFillColor(actualColor);
  }, [actualColor]);

  // Update container size when prop changes
  useEffect(() => {
    setCurrentContainerSize(containerSize);
    log('DEBUG', 'Whiteboard', 'Container size updated', containerSize);
  }, [containerSize]);


  // Calculate container dimensions only during background transitions (one-time)
  useEffect(() => {
    const { finalWidth: newWidth, finalHeight: newHeight } = calculateContainerDimensions();
    
    // Only update if dimensions actually changed to prevent unnecessary re-renders
    if (newWidth !== finalWidth || newHeight !== finalHeight) {
      setFinalWidth(newWidth);
      setFinalHeight(newHeight);
      
      log('INFO', 'Whiteboard', '📐 CONTAINER DIMENSIONS CALCULATED (Background Transition)', {
        currentContainerSize,
        backgroundDimensions,
        screenShareDimensions,
        isScreenShareActive,
        backgroundType,
        pdfLoaded: backgroundType === 'pdf',
        calculatedWidth: newWidth,
        calculatedHeight: newHeight,
        isMobile: isMobile,
        timestamp: Date.now()
      });
    } else {
      log('DEBUG', 'Whiteboard', '📐 CONTAINER DIMENSIONS - No change needed', {
        currentFinalWidth: finalWidth,
        currentFinalHeight: finalHeight,
        calculatedWidth: newWidth,
        calculatedHeight: newHeight,
        isScreenShareActive,
        backgroundType,
        screenShareDimensions,
        backgroundDimensions,
        timestamp: Date.now()
      });
    }
  }, [isScreenShareActive, backgroundType, backgroundDimensions, screenShareDimensions]); // Include dimension changes

  // Handle image dimension updates directly in the image onLoad callback to prevent useEffect re-renders

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

  // Container size tracking - use dynamic dimensions (logging removed to prevent re-renders)

  // Track background dimensions changes only during background transitions
  // REMOVED: Background dimensions useEffect that was causing Whiteboard remounts
  // This useEffect was running on every background type change and causing unnecessary remounts

  // Calculate screen share dimensions when screen share is active
  
  // Log dimension changes for debugging (removed to prevent re-renders)
  
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
            
            // Use coordinates directly since both peers now use unified coordinate system
            setLines(prev => {
              const newLines = [...prev, data.shape];
              log('INFO', 'Whiteboard', '✅ UPDATED regular lines with unified coordinates', {
                oldCount: prev.length,
                newCount: newLines.length,
                shapeType: data.shape.type,
                // Enhanced debugging for Y shift investigation
                receivedCoordinates: data.shape.points,
                coordinateAnalysis: {
                  firstPoint: data.shape.points?.[0],
                  secondPoint: data.shape.points?.[1],
                  coordinateCount: data.shape.points?.length,
                  isLine: data.shape.type === 'line',
                  isPen: data.shape.tool === 'pen'
                },
                peerType: 'REMOTE_PEER',
                points: data.shape.points,
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
        log('INFO', 'Whiteboard', '📨 RECEIVED UNDO from peer');
        if (historyStep > 0) {
          const newStep = historyStep - 1;
          const prevState = history[newStep];
          setLines(prevState.lines);
          setShapes(prevState.shapes);
          setHistoryStep(newStep);
          
          // For PDFs, also restore page-specific state
          if (backgroundType === 'pdf' && prevState.pageLines && prevState.pageShapes) {
            setPageLines(prevState.pageLines);
            setPageShapes(prevState.pageShapes);
          }
        }
        break;
      case 'redo':
        log('INFO', 'Whiteboard', '📨 RECEIVED REDO from peer');
        if (historyStep < history.length - 1) {
          const newStep = historyStep + 1;
          const state = history[newStep];
          setLines(state.lines);
          setShapes(state.shapes);
          setHistoryStep(newStep);
          
          // For PDFs, also restore page-specific state
          if (backgroundType === 'pdf' && state.pageLines && state.pageShapes) {
            setPageLines(state.pageLines);
            setPageShapes(state.pageShapes);
          }
        }
        break;
      case 'state':
        if (data.state) {
          setLines(data.state.lines || []);
          setShapes(data.state.shapes || []);
          setHistoryStep(data.state.historyStep || 0);
          
          // Sync history if provided
          if (data.state.history) {
            setHistory(data.state.history);
            log('INFO', 'Whiteboard', '📚 HISTORY SYNCED from peer', {
              historyLength: data.state.history.length,
              historyStep: data.state.historyStep,
              linesCount: data.state.lines?.length || 0,
              shapesCount: data.state.shapes?.length || 0
            });
          }
          
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
            
            // Clear all drawings FIRST when receiving background from remote peer
            log('INFO', 'Whiteboard', 'Clearing all drawings due to remote background change');
            clearAllDrawings();
            
            // Check mutual exclusivity when receiving background from remote peer
            if (data.background.type === 'image' && onImageChange) {
              log('INFO', 'Whiteboard', 'Remote image received, checking exclusivity');
              log('INFO', 'Whiteboard', 'Triggering image exclusivity check', data.background.file);
              onImageChange(data.background.file);
            } else if (data.background.type === 'pdf' && onPdfChange) {
              log('INFO', 'Whiteboard', '📨 REMOTE PDF RECEIVED - Starting unified process', {
                pdfUrl: data.background.file,
                willUseUnifiedRenderPDF: true,
                timestamp: Date.now()
              });
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
      case 'backgroundTransition':
        if (data.transitionData) {
          log('INFO', 'Whiteboard', '🔄 RECEIVED BACKGROUND TRANSITION', {
            isScreenShareActive: data.transitionData.isScreenShareActive,
            backgroundType: data.transitionData.backgroundType,
            finalWidth: data.transitionData.finalWidth,
            finalHeight: data.transitionData.finalHeight,
            pdfDimensions: data.transitionData.pdfDimensions,
            timestamp: Date.now()
          });
          
          // Sync PDF dimensions from peer for consistency
          if (data.transitionData.pdfDimensions && data.transitionData.backgroundType === 'pdf') {
            pdfDimensionsRef.current = data.transitionData.pdfDimensions;
            log('INFO', 'Whiteboard', '📐 SYNCED PDF DIMENSIONS FROM PEER', {
              containerWidth: data.transitionData.pdfDimensions.containerWidth,
              pageWidth: data.transitionData.pdfDimensions.pageWidth,
              pageHeight: data.transitionData.pdfDimensions.pageHeight
            });
          }
          
          // Apply the same transition function for consistency
          const transitionStyle = applyBackgroundTransition(data.transitionData);
          
          // Update local state to match remote peer
          if (data.transitionData.isScreenShareActive !== undefined) {
            // This would need to be passed up to parent component
            log('INFO', 'Whiteboard', '🔄 APPLYING REMOTE TRANSITION', transitionStyle);
          }
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
        color: actualColor,
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
       
      log(logLevel, 'Whiteboard', '✅ SENT WebRTC message successfully', { 
        action, 
        messageSize: JSON.stringify(message).length,
        backgroundType,
        pdfLoaded: backgroundType === 'pdf',
        hasShape: !!message.shape,
        shapeType: message.shape?.type,
        shapeTool: message.shape?.tool,
        shapeId: message.shape?.id,
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
    // Early return if not drawing - no calculations needed for layout
    if (!isDrawing) {
      // Only send cursor position when a tool is selected AND not on mobile (throttled to avoid spam)
      if (actualTool && !isMobile) {
        const now = Date.now();
        if (!window.lastCursorTime || now - window.lastCursorTime > 500) { // Send max every 500ms
          window.lastCursorTime = now;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
          sendWhiteboardMsg('cursor', { position: point });
        }
      }
      return; // No layout calculations needed for non-drawing mouse movement
    }

    // Simple coordinate calculation for drawing within existing canvas
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const correctedX = point.x;
    const correctedY = point.y;
    
    // Log coordinates when drawing with line tool (only if debug enabled)
    if (DEBUG_MOUSE_MOVEMENT && actualTool === 'line') {
      log('VERBOSE', 'Whiteboard', 'Mouse move - Using simple coordinates', { 
        correctedX, 
        correctedY, 
        konvaX: point.x, 
        konvaY: point.y 
      });
    }

    // Send cursor position when drawing (throttled to avoid spam)
    if (actualTool && !isMobile) {
      const now = Date.now();
      if (!window.lastCursorTime || now - window.lastCursorTime > 500) { // Send max every 500ms
        window.lastCursorTime = now;
        sendWhiteboardMsg('cursor', { position: point });
      }
    }

    if (actualTool === 'pen') {
      // CRITICAL FIX: Debug what values are being used for drawing
      console.log('[Whiteboard] 🔧 CRITICAL FIX: Drawing with pen - Current values', {
        actualTool,
        actualColor,
        strokeColor,
        fillColor,
        drawingTool,
        timestamp: Date.now()
      });
      
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
        log('INFO', 'Whiteboard', `📤 SENDING ${actualTool} tool update`, {
          shapeId: updatedShape.id,
          shapeX: updatedShape.x,
          shapeY: updatedShape.y,
          dx,
          dy,
          correctedX,
          correctedY,
          timestamp: Date.now()
        });
        // Send shape update via WebRTC data channel
        sendWhiteboardMsg('update', { shape: updatedShape });
      }
    }
  };

  const handleMouseDown = (e) => {
    // CRITICAL FIX: Get fresh values from global state when drawing starts
    const currentTool = getActualTool();
    const currentColor = getActualColor();
    
    // COMPREHENSIVE LOGGING: Track tool/color values when drawing starts
    console.log('[Whiteboard] 🎯 DRAWING START - Tool/Color Values', {
      globalTool: window.whiteboardToolState?.currentTool,
      globalColor: window.whiteboardToolState?.currentColor,
      currentTool,
      currentColor,
      isDrawing,
      timestamp: Date.now()
    });
    
    log('VERBOSE', 'Whiteboard', 'Mouse down - Current state', {
      tool: currentTool,
      isDrawing,
      selectedShape: selectedShape?.id
    });

    // Simple coordinate calculation for drawing within existing canvas
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const correctedX = point.x;
    const correctedY = point.y;
    
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse down - Starting drawing with tool', { drawingTool, position: point });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Using simple coordinates', { correctedX, correctedY });
    }

    if (currentTool === 'pen') { // CRITICAL FIX: Use fresh currentTool instead of stale actualTool
      // CRITICAL FIX: Use fresh currentColor directly for pen tool as well
      const lineColor = currentColor;
      
      const newLine = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: currentTool, // CRITICAL FIX: Use fresh currentTool instead of hardcoded 'pen'
        type: 'line',
        points: [correctedX, correctedY],
        stroke: lineColor, // CRITICAL FIX: Use direct value
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
      // PROPER FIX: Debug what values are being used for shape creation
      console.log('[Whiteboard] 🔧 PROPER FIX: Creating shape - Current values', {
        currentTool,
        currentColor,
        strokeColor,
        fillColor,
        drawingTool,
        defaultFill,
        timestamp: Date.now()
      });
      
      // CRITICAL FIX: Use fresh currentColor directly instead of state variables to ensure immediate values
      const shapeColor = currentColor;
      const shapeFill = defaultFill ? currentColor : 'transparent';
      
      console.log('[Whiteboard] 🔧 CRITICAL FIX: Using direct values for shape', {
        shapeColor,
        shapeFill,
        currentColor,
        defaultFill
      });
      
      const newShape = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: currentTool, // CRITICAL FIX: Use fresh currentTool instead of drawingTool
        type: currentTool, // CRITICAL FIX: Use fresh currentTool instead of drawingTool
        x: correctedX,
        y: correctedY,
        stroke: shapeColor, // CRITICAL FIX: Use direct value
        strokeWidth: 2,
        fill: shapeFill // CRITICAL FIX: Use direct value
      };

      log('DEBUG', 'Whiteboard', 'Creating new shape', newShape);

      // Set specific properties based on shape type
      switch (actualTool) { // CRITICAL FIX: Use actualTool instead of drawingTool
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
      // Send shape creation via WebRTC data channel
      sendWhiteboardMsg('draw', { shape: newShape });
    }
  };

  const handleMouseUp = (e) => {
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse up - Current state', {
        isDrawing,
        tool: actualTool,
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
        tool: actualTool,
        isDrawing,
        selectedShape: selectedShape?.id,
        clickedTarget: e.target.constructor.name,
        isStage: e.target.getStage() === e.target
      });
    }

    // If a tool is active, don't handle click (let mouse up handle it)
    if (actualTool) {
      if (DEBUG_MOUSE_MOVEMENT) {
        log('VERBOSE', 'Whiteboard', 'Click - Tool is active, returning early', actualTool);
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

    // Send history update via WebRTC data channel only during background transitions
    // No need to send during drawing operations - peers will sync via drawing messages
    const now = Date.now();
    if (!window.lastStateTime || now - window.lastStateTime > 5000) { // Send max every 5 seconds during transitions
      window.lastStateTime = now;
    sendWhiteboardMsg('state', { 
          state: {
        lines: currentLines, 
        shapes: currentShapes, 
        historyStep: newHistory.length - 1,
        history: newHistory
      } 
    });
    }
  };

  // Centralized PDF dimensions function for both peers - ensures consistency
  const calculatePDFDimensions = useCallback((containerWidth = null) => {
    // Use provided container width or current container size
    const width = containerWidth || currentContainerSize.width;
    const pageWidth = width - 20; // Subtract 20px for padding (10px on each side)
    const pageHeight = 800; // Standard page height for navigation
    
    log('INFO', 'Whiteboard', '📐 CENTRALIZED PDF DIMENSIONS CALCULATED', {
      containerWidth: width,
      pageWidth,
      pageHeight,
      padding: 20,
      isMobile: isMobile,
      timestamp: Date.now()
    });
    
    return { 
      containerWidth: width, 
      pageWidth, 
      pageHeight 
    };
  }, [currentContainerSize.width]);

  // Centralized image dimensions function for both peers - ensures consistency
  const calculateImageDimensions = useCallback((imageUrl, naturalWidth, naturalHeight) => {
    // Use natural dimensions without fitting to screen
    const imageWidth = naturalWidth;
    const imageHeight = naturalHeight;
    
    log('INFO', 'Whiteboard', '📐 CENTRALIZED IMAGE DIMENSIONS CALCULATED', {
      imageUrl: imageUrl.substring(0, 50) + '...',
      naturalWidth,
      naturalHeight,
      calculatedWidth: imageWidth,
      calculatedHeight: imageHeight,
      timestamp: Date.now()
    });
    
    return { 
      width: imageWidth, 
      height: imageHeight 
    };
  }, []); // Removed isMobile dependency as it's a constant

  // Removed calculateDrawingCoordinates - not needed for drawing within existing canvas
  // Simple coordinate calculation is sufficient: stage.getPointerPosition()

  // Unified PDF rendering function for both peers

  const renderPDF = useCallback((pdfUrl, numPages = null) => {
    log('INFO', 'Whiteboard', 'Loading PDF file', { pdfUrl, numPages });
    
    // Clear all drawings first
    clearAllDrawings();
    
    // Set background file and type - PDFRenderer will handle the rest
    setBackgroundFile(pdfUrl);
    setBackgroundType('pdf');
    
    // Set PDF pages if provided
    if (numPages) {
      setPdfPages(numPages);
    }
    
    // Add to history
    addToHistory();
    
    log('INFO', 'Whiteboard', 'PDF file set for rendering', { pdfUrl });
  }, []);




  // Add to history when drawing is completed (only on mouse up, not during drawing)
  useEffect(() => {
    if (!isDrawing) {
      // Only add to history when we finish drawing a new shape
      // Check if the current state is different from the last history entry
      const currentHistoryEntry = history[historyStep];
      const hasChanged = !currentHistoryEntry || 
        JSON.stringify(currentHistoryEntry.lines) !== JSON.stringify(lines) ||
        JSON.stringify(currentHistoryEntry.shapes) !== JSON.stringify(shapes);
      
      // Add to history only when drawing is actually completed
      if (hasChanged && (lines.length > 0 || shapes.length > 0)) {
        log('DEBUG', 'Whiteboard', 'Drawing completed - adding to history');
        addToHistory();
      }
    }
  }, [isDrawing]); // Only depend on isDrawing, not lines/shapes


  const handleUndo = () => {
    log('DEBUG', 'Whiteboard', 'Undo function called', { historyStep, historyLength: history.length });
    
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const prevState = history[newStep];
      log('DEBUG', 'Whiteboard', 'Undoing to step', { newStep, state: prevState });
      
      // Update state directly
      setLines(prevState.lines);
      setShapes(prevState.shapes);
      
      // For PDFs, also restore page-specific state
      if (backgroundType === 'pdf' && prevState.pageLines && prevState.pageShapes) {
        setPageLines(prevState.pageLines);
        setPageShapes(prevState.pageShapes);
      }
      
      setHistoryStep(newStep);

      // Send current state to peers so they can sync their history
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

      // Send current state to peers so they can sync their history
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

  // Function to set background directly (for remote peers)
  const setBackgroundDirectly = (type, url) => {
    log('INFO', 'Whiteboard', 'Setting background directly', { type, url });
    
    if (type === 'pdf') {
      // Use unified PDF rendering for consistent dimensions
      log('INFO', 'Whiteboard', 'Using unified PDF rendering for remote PDF');
      renderPDF(url);
    } else {
      // For non-PDF backgrounds, use the original logic
      clearAllDrawings();
      setBackgroundFile(url);
      setBackgroundType(type);
      addToHistory();
    }
    
    log('INFO', 'Whiteboard', 'Background set directly', { type, url });
  };

  // Mobile detection for UI purposes only
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  
  // Component mounted logging (after all variables are declared)
  log('INFO', 'Whiteboard', 'Component mounted', { userId, username, screenShareStream: !!screenShareStream, isScreenShareActive });
  
  // Track remounting with detailed logging - DISABLED to prevent scroll issues
  // useEffect(() => {
  //   log('ERROR', 'Whiteboard', '🚨 COMPONENT MOUNTED - This should NOT happen during mouse move!', {
  //     userId,
  //     username,
  //     screenShareStream: !!screenShareStream,
  //     isScreenShareActive,
  //     backgroundType,
  //     pdfLoaded: backgroundType === 'pdf',
  //     timestamp: Date.now(),
  //     stackTrace: new Error().stack
  //   });
  // }, []);
  
  // Centralized background transition function - called once during background changes
  const applyBackgroundTransition = useCallback((transitionData) => {
    const {
      isScreenShareActive,
      backgroundType,
      finalWidth,
      finalHeight,
      isMobileDrawingMode
    } = transitionData;
    
    log('INFO', 'Whiteboard', '🔄 APPLYING BACKGROUND TRANSITION', {
      isScreenShareActive,
      backgroundType,
      finalWidth,
      finalHeight,
      isMobileDrawingMode,
          timestamp: Date.now()
    });
    
    // Calculate Z-index and positioning based on background type
    const zIndex = 2; // Drawing layer should always be above any background
    const position = isScreenShareActive ? 'absolute' : 'relative';
    const top = isScreenShareActive ? '0' : 'auto';
    const left = isScreenShareActive ? '0' : 'auto';
    
    // Calculate background-specific styles
    const backgroundColor = (isScreenShareActive || backgroundType === 'pdf') ? 'transparent' : 'rgba(230, 243, 255, 0.9)';
    const border = (isScreenShareActive || backgroundType === 'pdf') ? 'none' : '4px solid #8B4513';
    const pointerEvents = isScreenShareActive ? 'all' : 'auto';
    
    // For images, allow container to expand to match image dimensions
    // For other backgrounds (PDF, screen share), use fixed dimensions
    const containerStyle = {
      position,
      top,
      left,
      zIndex,
      backgroundColor,
      border,
      pointerEvents,
      overflow: 'visible',
      touchAction: isMobileDrawingMode ? 'none' : 'auto'
    };
    
    if (backgroundType === 'image') {
      // For images, use explicit dimensions to match image natural dimensions
      containerStyle.width = `${finalWidth}px`;
      containerStyle.height = `${finalHeight}px`;
      containerStyle.minWidth = `${finalWidth}px`;
      containerStyle.minHeight = `${finalHeight}px`;
    } else {
      // For PDFs and screen share, use fixed dimensions
      containerStyle.width = `${finalWidth}px`;
      containerStyle.height = `${finalHeight}px`;
      containerStyle.minWidth = `${finalWidth}px`;
      containerStyle.minHeight = `${finalHeight}px`;
      
      log('DEBUG', 'Whiteboard', '📦 CONTAINER STYLE CALCULATION', {
        backgroundType,
        finalWidth,
        finalHeight,
        backgroundDimensions,
        containerStyle: {
          width: containerStyle.width,
          height: containerStyle.height,
          minWidth: containerStyle.minWidth,
          minHeight: containerStyle.minHeight
        },
        note: 'Container should match PDF total dimensions for drawing across all pages'
      });
    }
    
    return containerStyle;
  }, []);

  // Send background transition to peers for consistency
  const sendBackgroundTransition = useCallback((transitionData) => {
    // Include PDF dimensions if it's a PDF background for peer consistency
    const enhancedTransitionData = {
      ...transitionData,
      pdfDimensions: transitionData.backgroundType === 'pdf' ? pdfDimensionsRef.current : null
    };
    
    log('INFO', 'Whiteboard', '📤 SENDING BACKGROUND TRANSITION TO PEERS', {
      isScreenShareActive: transitionData.isScreenShareActive,
      backgroundType: transitionData.backgroundType,
      finalWidth: transitionData.finalWidth,
      finalHeight: transitionData.finalHeight,
      pdfDimensions: enhancedTransitionData.pdfDimensions,
      timestamp: Date.now()
    });
    
    sendWhiteboardMsg('backgroundTransition', { transitionData: enhancedTransitionData });
  }, []);

  // New function to handle PDF dimensions from PDFRenderer component
  const handlePDFDimensionsChange = useCallback((dimensions) => {
    log('INFO', 'Whiteboard', '📐 PDF DIMENSIONS RECEIVED FROM PDFRENDERER', {
      receivedDimensions: dimensions,
      currentBackgroundDimensions: backgroundDimensions,
      currentFinalWidth: finalWidth,
      currentFinalHeight: finalHeight,
      timestamp: Date.now()
    });
    
    setBackgroundDimensions(dimensions);
    
    log('INFO', 'Whiteboard', '📐 PDF DIMENSIONS UPDATED - Let useEffect handle dimension transition', {
      newBackgroundDimensions: dimensions,
      note: 'useEffect will handle finalWidth/finalHeight update based on backgroundDimensions',
      timestamp: Date.now()
    });
    
    // Forward dimensions to parent DashboardPage to update container size
    if (onPDFDimensionsChange) {
      log('INFO', 'Whiteboard', 'Forwarding PDF dimensions to parent', dimensions);
      onPDFDimensionsChange(dimensions);
    }
  }, [onPDFDimensionsChange]);

  const handlePDFLoadComplete = useCallback(({ numPages, dimensions }) => {
    log('INFO', 'Whiteboard', 'PDF load complete', { numPages, dimensions });
    setPdfPages(numPages);
    setBackgroundDimensions(dimensions);
  }, []);

  // Memoized container style - only recalculates during background transitions
  const containerStyle = useMemo(() => {
    return applyBackgroundTransition({
      isScreenShareActive,
      backgroundType,
      finalWidth,
      finalHeight,
      isMobileDrawingMode
    });
  }, [
    // Only recalculate when background transitions occur
    isScreenShareActive,
    backgroundType,
    finalWidth,
    finalHeight,
    isMobileDrawingMode,
    applyBackgroundTransition
  ]);

  // Memoized stage style - only recalculates during background transitions
  const stageStyle = useMemo(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 2,
      pointerEvents: 'all',
      background: 'transparent'
    };
  }, []); // Stage style is static - no need to recalculate

  // Memoized stage dimensions - only recalculates during background transitions
  const stageDimensions = useMemo(() => {
    const stageWidth = isScreenShareActive && screenShareDimensions.width > 0 
      ? screenShareDimensions.width 
      : backgroundDimensions.width > 0 
        ? backgroundDimensions.width 
        : currentContainerSize.width;
    
    const stageHeight = isScreenShareActive && screenShareDimensions.height > 0 
      ? screenShareDimensions.height 
      : backgroundDimensions.height > 0 
        ? backgroundDimensions.height 
        : currentContainerSize.height;
    
    return { stageWidth, stageHeight };
  }, [
    isScreenShareActive,
    screenShareDimensions.width,
    screenShareDimensions.height,
    backgroundDimensions.width,
    backgroundDimensions.height,
    currentContainerSize.width,
    currentContainerSize.height
  ]);

  // Memoized background status - only recalculates during background transitions
  const backgroundStatus = useMemo(() => {
    return {
      pdfLoaded: backgroundType === 'pdf',
      pageLinesCount: Object.keys(pageLines).length,
      totalLines: Object.values(pageLines).flat().length
    };
  }, [backgroundType, pageLines]);

  // Trigger background transition when background changes occur
  useEffect(() => {
    // Only send transition when background actually changes (not during drawing)
    if (backgroundType || isScreenShareActive) {
      const transitionData = {
        isScreenShareActive,
        backgroundType,
        finalWidth,
        finalHeight,
        isMobileDrawingMode
      };
      
      // Send transition to peers for consistency
      sendBackgroundTransition(transitionData);
    }
  }, [isScreenShareActive, backgroundType, sendBackgroundTransition]); // Removed finalWidth, finalHeight, isMobileDrawingMode to prevent multiple triggers

  // Removed throttling - WebRTC handles message queuing efficiently

  // Unified PDF options for both desktop and mobile to ensure identical dimensions
  const unifiedPdfOptions = {
    // Use same scale for both desktop and mobile to ensure identical dimensions
    scale: 1.0, // Same scale for both peers
    renderTextLayer: false, // Disable text layer for performance
    renderAnnotationLayer: false, // Disable annotations for performance
    cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
    // Unified memory optimizations for both desktop and mobile
    disableWorker: false, // Keep worker for performance
    disableAutoFetch: true, // Don't auto-fetch all pages
    disableStream: true, // Disable streaming for memory
    maxImageSize: 1024 * 1024, // Limit image size (1MB)
    isEvalSupported: false, // Disable eval for security
  };

  // Mobile PDF memory management - DISABLED to prevent PDF rendering issues
  useEffect(() => {
    if (isMobile && backgroundType === 'pdf') {
      // Only log memory status, don't cleanup PDF resources
      const checkPdfMemory = () => {
        log('INFO', 'Whiteboard', '📱 Mobile PDF memory check (cleanup disabled)', { 
          isMobile: true,
          backgroundType: 'pdf',
          pdfPages: pdfPages
        });
        
        // Don't clear PDF cache - it interferes with rendering
        // if (window.PDFJS && window.PDFJS.cleanup) {
        //   window.PDFJS.cleanup();
        // }
        
        // Don't force garbage collection during PDF rendering
        // if (window.gc) {
        //   window.gc();
        // }
      };
      
      // Check every 2 minutes (less frequent)
      const pdfCheckInterval = setInterval(checkPdfMemory, 120000);
      
      return () => clearInterval(pdfCheckInterval);
    }
  }, [backgroundType, pdfPages]);

  // Mobile Konva canvas memory management - DISABLED to prevent rendering issues
  useEffect(() => {
    if (isMobile) {
      // Only log memory status, don't cleanup canvas resources
      const checkCanvasMemory = () => {
        log('INFO', 'Whiteboard', '📱 Mobile canvas memory check (cleanup disabled)', { 
          isMobile: true,
          linesCount: lines.length,
          shapesCount: shapes.length
        });
        
        // Don't clear Konva cache - it interferes with rendering
        // if (Konva && Konva.clearCache) {
        //   Konva.clearCache();
        // }
        
        // Don't force garbage collection during drawing
        // if (window.gc) {
        //   window.gc();
        // }
      };
      
      // Check every 3 minutes (less frequent)
      const canvasCheckInterval = setInterval(checkCanvasMemory, 180000);
      
      return () => clearInterval(canvasCheckInterval);
    }
  }, [lines.length, shapes.length]);

  // Mobile crash prevention: Memory monitoring
  useEffect(() => {
    if (isMobile) {
      // Monitor memory usage on mobile
      const checkMemory = () => {
        // Check if memory API is available
        if ('memory' in performance) {
          const memoryInfo = performance.memory;
          const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
          const totalMB = Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024);
          const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);
          const usagePercent = Math.round((usedMB / limitMB) * 100);
          
          log('INFO', 'Whiteboard', '📱 Mobile memory status', { 
            usedMB,
            totalMB,
            limitMB,
            usagePercent: `${usagePercent}%`,
            isMobile: true,
            linesCount: lines.length,
            shapesCount: shapes.length,
            backgroundType: backgroundType,
            pdfLoaded: backgroundType === 'pdf'
          });
          
          // Only force garbage collection if memory is critically high (>90%)
          if (window.gc && usagePercent > 90) {
            log('WARN', 'Whiteboard', '📱 Critical memory usage - forcing garbage collection', { usagePercent });
            window.gc();
          }
          
          // Only cleanup if memory usage is very high (>80%)
          if (usagePercent > 80) {
            log('WARN', 'Whiteboard', '📱 High memory usage detected, clearing old lines', { 
              usagePercent,
              linesCount: lines.length
            });
            // Only trim lines if memory is critically high
            if (lines.length > 200) {
              setLines(prev => prev.slice(-100)); // Keep last 100 lines
            }
          }
        } else {
          // Fallback: monitor drawing count
          log('INFO', 'Whiteboard', '📱 Mobile memory monitoring (fallback)', { 
            linesCount: lines.length,
            shapesCount: shapes.length,
            isMobile: true
          });
        }
      };
      
      // Check memory every 2 minutes on mobile (less frequent)
      const memoryInterval = setInterval(checkMemory, 120000);
      
      return () => clearInterval(memoryInterval);
    }
  }, [lines.length, shapes.length, backgroundType]);

  // Mobile crash prevention: Error handling
  useEffect(() => {
    if (isMobile) {
      const handleError = (error) => {
        log('ERROR', 'Whiteboard', '📱 Mobile error detected', { 
          error: error.message,
          isMobile: true,
          timestamp: Date.now()
        });
        
        // Clear drawings to free memory
        clearAllDrawings();
        
        // Notify user about mobile optimization
        log('INFO', 'Whiteboard', '📱 Mobile optimization: Cleared drawings due to error');
      };
      
      // Add error listeners for mobile
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleError);
      
      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleError);
      };
    }
  }, []);

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
    setBackgroundDirectly: setBackgroundDirectly,
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
        
        // Use unified PDF rendering function
        log('INFO', 'Whiteboard', 'Using unified PDF rendering for local upload');
        renderPDF(pdfUrl);
        
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
    // Use cached dimensions instead of hardcoded values
    const pageHeight = pdfDimensionsRef.current?.pageHeight || 800; // Use cached height
    const gap = 6; // Gap between pages - MUST match PDF rendering gap
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
      // CRITICAL: Don't notify parent to prevent remounts during scrolling
      // The parent doesn't need to know about internal page changes
    }
  };

  // Navigate to next page
  const goToNextPage = () => {
    if (currentPage < pdfPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      scrollToPage(newPage);
      // CRITICAL: Don't notify parent to prevent remounts during scrolling
      // The parent doesn't need to know about internal page changes
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
    // Use cached dimensions instead of hardcoded values
    const pageHeight = pdfDimensionsRef.current?.pageHeight || 800; // Use cached height
    const gap = 6; // Gap between pages - MUST match PDF rendering gap
    
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

  // COMPREHENSIVE LOGGING: Track all useEffect dependencies
  useEffect(() => {
    log('DEBUG', 'Whiteboard', '🔄 USEEFFECT - Background Type Dependencies', {
      backgroundType,
      pdfPages,
      currentPage,
      timestamp: Date.now()
    });
  }, [backgroundType, pdfPages, currentPage]);

  // Update current page when scrolling
  useEffect(() => {
    if (backgroundType === 'pdf' && pdfPages > 1) {
      const dashboardContent = document.querySelector('.dashboard-content');
      if (dashboardContent) {
        const handleScroll = () => {
          const visiblePage = getCurrentVisiblePage();
          if (visiblePage !== currentPage) {
            setCurrentPage(visiblePage);
            // CRITICAL: Don't notify parent during scroll to prevent remounts
            // The parent doesn't need to know about scroll-based page changes
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

  // COMPREHENSIVE LOGGING: Track all props that could cause remounts
  log('INFO', 'Whiteboard', '🔄 WHITEBOARD RENDER - All Props', {
    // Core props
            userId,
            username,
    isScreenShareActive,
    currentImageUrl,
    containerSize,
    // Background props
    hasBackgroundFile: !!backgroundFile,
    backgroundType,
    // WebRTC props
    hasWebRTCProvider: !!webRTCProvider,
    selectedPeer,
    // GLOBAL STATE APPROACH: Not needed anymore
    // Tool props
    // currentTool,
    // currentColor,
    // History props
    canUndo,
    canRedo,
    // Mobile props
    isMobileDrawingMode,
    // PDF props
    pdfCurrentPage,
    pdfScale,
    // Function props (check if they exist)
    hasOnClose: !!onClose,
    hasOnBackgroundCleared: !!onBackgroundCleared,
    hasOnImageChange: !!onImageChange,
    hasOnPdfChange: !!onPdfChange,
    hasOnPDFDimensionsChange: !!onPDFDimensionsChange,
    // GLOBAL STATE APPROACH: Not needed anymore
    // hasOnToolChange: !!onToolChange,
    // hasOnColorChange: !!onColorChange,
    hasOnUndo: !!onUndo,
    hasOnRedo: !!onRedo,
    hasOnHistoryChange: !!onHistoryChange,
    hasOnImageUpload: !!onImageUpload,
    hasOnFileUpload: !!onFileUpload,
    hasOnClear: !!onClear,
    hasOnPdfPageChange: !!onPdfPageChange,
    hasOnPdfPagesChange: !!onPdfPagesChange
  });

  // Debug: Track what's causing remounts (removed to reduce noise)

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
         style={containerStyle}
      >
        {/* Background Layer - PDF and Images */}
        {backgroundFile && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: backgroundType === 'image' 
                ? `${backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200}px` 
                : '100%',
              height: backgroundType === 'image' 
                ? `${backgroundDimensions.height > 0 ? backgroundDimensions.height : 800}px` 
                : '100%',
              zIndex: 1,
              backgroundColor: '#f5f5f5',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start', // Start from top instead of center
              padding: '10px', // Add 10px padding around the PDF
              pointerEvents: 'none' // Allow mouse events to pass through to Stage
            }}
            onLoad={() => {
              log('DEBUG', 'Whiteboard', 'Background div rendered', {
                backgroundType,
                backgroundDimensions,
                width: backgroundType === 'image' 
                  ? `${backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200}px` 
                  : '100%',
                height: backgroundType === 'image' 
                  ? `${backgroundDimensions.height > 0 ? backgroundDimensions.height : 800}px` 
                  : '100%',
                timestamp: Date.now()
              });
            }}
            onMouseEnter={() => {
              // No calculations needed for PDF background hover
              log('INFO', 'Whiteboard', '📄 PDF BACKGROUND HOVER', {
                backgroundType,
                timestamp: Date.now()
              });
            }}
          >
          {backgroundType === 'pdf' ? (
            <PDFRenderer
              pdfUrl={backgroundFile}
              onDimensionsChange={handlePDFDimensionsChange}
              onLoadComplete={handlePDFLoadComplete}
              containerWidth={currentContainerSize.width || 1200}
              isMobile={isMobile}
            />
            ) : backgroundType === 'image' ? (
              <img
                src={backgroundFile}
                alt="Background Image"
                style={{
                  width: 'auto',
                  height: 'auto',
                  display: 'block',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  objectFit: 'none'
                }}
                onLoad={(e) => {
                  const img = e.target;
                  const naturalWidth = img.naturalWidth;
                  const naturalHeight = img.naturalHeight;
                  
                  // Use centralized image dimensions calculation
                  const { width, height } = calculateImageDimensions(backgroundFile, naturalWidth, naturalHeight);
                  
                  log('INFO', 'Whiteboard', 'Image loaded successfully', {
                    src: backgroundFile,
                    naturalWidth,
                    naturalHeight,
                    calculatedWidth: width,
                    calculatedHeight: height,
                    displayWidth: img.offsetWidth,
                    displayHeight: img.offsetHeight,
                    imageStyle: {
                      width: img.style.width,
                      height: img.style.height,
                      maxWidth: img.style.maxWidth,
                      maxHeight: img.style.maxHeight,
                      objectFit: img.style.objectFit
                    }
                  });
                  
                  // Set background dimensions using centralized calculation
                  setBackgroundDimensions({ width, height });
                  
                  // Update container dimensions directly to prevent useEffect re-renders
                  setFinalWidth(width);
                  setFinalHeight(height);
                  
                  log('INFO', 'Whiteboard', '📐 IMAGE DIMENSIONS UPDATED DIRECTLY', {
                    backgroundDimensions: { width, height },
                    calculatedWidth: width,
                    calculatedHeight: height,
                    timestamp: Date.now()
                  });
                  
                  // Log container size changes
                  log('DEBUG', 'Whiteboard', 'Container dimensions will change from', {
                    currentWidth: currentContainerSize.width,
                    currentHeight: currentContainerSize.height
                  });
                  log('DEBUG', 'Whiteboard', 'Container dimensions will change to', {
                    newWidth: width,
                    newHeight: height,
                    exceedsDashboardContent: width > 1200 || height > 800,
                    shouldShowScrollbars: width > 1200 || height > 800 ? 'YES - Image exceeds dashboard-content (1200x800)' : 'NO - Image fits in dashboard-content'
                  });
                  
                  // Additional debugging - check actual image dimensions after a short delay
                  setTimeout(() => {
                    const actualImg = e.target;
                    log('DEBUG', 'Whiteboard', 'Image dimensions after load (delayed check)', {
                      naturalWidth: actualImg.naturalWidth,
                      naturalHeight: actualImg.naturalHeight,
                      offsetWidth: actualImg.offsetWidth,
                      offsetHeight: actualImg.offsetHeight,
                      clientWidth: actualImg.clientWidth,
                      clientHeight: actualImg.clientHeight,
                      scrollWidth: actualImg.scrollWidth,
                      scrollHeight: actualImg.scrollHeight,
                      computedStyle: {
                        width: window.getComputedStyle(actualImg).width,
                        height: window.getComputedStyle(actualImg).height,
                        maxWidth: window.getComputedStyle(actualImg).maxWidth,
                        maxHeight: window.getComputedStyle(actualImg).maxHeight
                      }
                    });
                  }, 100);
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
            
            log('DEBUG', 'Whiteboard', '🎯 KONVA STAGE HEIGHT CALCULATION', {
              isScreenShareActive,
              backgroundType,
              screenShareDimensions,
              backgroundDimensions,
              currentContainerSize,
              finalWidth,
              finalHeight,
              calculatedStageHeight: stageHeight,
              note: 'Stage height should match container height for PDF drawing across all pages'
            });
            return stageHeight;
          })()}
           style={stageStyle}
          onMouseEnter={() => {
            // No calculations needed for hover - just log essential info
            log('INFO', 'Whiteboard', '🎯 STAGE HOVER', {
              actualTool,
              isDrawing,
              timestamp: Date.now()
            });
          }}
          onMouseDown={(e) => {
            // Only log essential drawing info - no background calculations needed during drawing
            log('INFO', 'Whiteboard', '🖱️ STAGE MOUSE DOWN', {
              actualTool,
              isDrawing,
              timestamp: Date.now()
            });
            handleMouseDown(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          // Touch event handlers for mobile devices
            onTouchStart={(e) => {
              // Access the native event object via the 'evt' property
              const nativeEvent = e.evt;
              
              // Debug the actual touch event structure only when drawing is active
              if (isMobileDrawingMode && (isDrawing || drawingTool !== 'select')) {
                log('INFO', 'Whiteboard', '👆 TOUCH START DEBUG (Drawing Active)', {
                  hasNativeTouches: !!nativeEvent.touches,
                  nativeTouchesLength: nativeEvent.touches?.length,
                  hasNativeChangedTouches: !!nativeEvent.changedTouches,
                  nativeChangedTouchesLength: nativeEvent.changedTouches?.length,
                  eventType: e.type,
                  isMobileDrawingMode,
                  isDrawing,
                  drawingTool,
                  timestamp: Date.now()
                });
              }

              if (isMobileDrawingMode) {
                // Prevent scrolling only in drawing mode - use more aggressive prevention
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                log('INFO', 'Whiteboard', '👆 STAGE TOUCH START (Drawing Mode)', {
                  actualTool,
                  isDrawing,
                  touchCount: nativeEvent.touches?.length || 0,
                  isMobileDrawingMode,
                  timestamp: Date.now()
                });
                // Convert touch to mouse event and use same handler
                const touch = nativeEvent.touches?.[0];
                if (touch) {
                  log('INFO', 'Whiteboard', '👆 TOUCH START - CONVERTING TO MOUSE', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    timestamp: Date.now()
                  });
                  // Create mouse event with same coordinate system
                  const mouseEvent = {
                    ...e,
                    evt: {
                      ...e.evt,
                      clientX: touch.clientX,
                      clientY: touch.clientY
                    },
                    preventDefault: () => { if (e.preventDefault) e.preventDefault(); },
                    stopPropagation: () => { if (e.stopPropagation) e.stopPropagation(); }
                  };
                  // Use the same mouse handler - coordinates are already in same system
                  handleMouseDown(mouseEvent);
                } else {
                  log('WARN', 'Whiteboard', '👆 TOUCH START - NO TOUCH FOUND', {
                    nativeTouchesLength: nativeEvent.touches?.length,
                    nativeChangedTouchesLength: nativeEvent.changedTouches?.length,
                    eventType: e.type,
                    timestamp: Date.now()
                  });
                }
              } else {
                log('INFO', 'Whiteboard', '👆 STAGE TOUCH START (Scroll Mode)', {
                  actualTool,
                  isDrawing,
                  touchCount: nativeEvent.touches?.length || 0,
                  isMobileDrawingMode,
                  timestamp: Date.now()
                });
                // Allow normal scrolling behavior
              }
            }}
          onTouchMove={(e) => {
            // Access the native event object via the 'evt' property
            const nativeEvent = e.evt;
            
            // Debug the actual touch event structure only when drawing is active
            if (isMobileDrawingMode && (isDrawing || drawingTool !== 'select')) {
              log('INFO', 'Whiteboard', '👆 TOUCH MOVE DEBUG (Drawing Active)', {
                hasNativeTouches: !!nativeEvent.touches,
                nativeTouchesLength: nativeEvent.touches?.length,
                hasNativeChangedTouches: !!nativeEvent.changedTouches,
                nativeChangedTouchesLength: nativeEvent.changedTouches?.length,
                eventType: e.type,
                isMobileDrawingMode,
                isDrawing,
                drawingTool,
                timestamp: Date.now()
              });
            }

            // Only log general touch move when drawing is active
            if (isMobileDrawingMode && (isDrawing || drawingTool !== 'select')) {
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH MOVE (Drawing Active)', {
                isMobileDrawingMode,
                touchCount: nativeEvent.touches?.length || 0,
                hasTouch: !!nativeEvent.touches?.[0],
                isDrawing,
                drawingTool,
                timestamp: Date.now()
              });
            }

            if (isMobileDrawingMode) {
              // Prevent scrolling only in drawing mode - use more aggressive prevention
              if (e.preventDefault) e.preventDefault();
              if (e.stopPropagation) e.stopPropagation();
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH MOVE (Drawing Mode)', {
                actualTool,
                isDrawing,
                touchCount: nativeEvent.touches?.length || 0,
                isMobileDrawingMode,
                timestamp: Date.now()
              });
              // Convert touch to mouse event and use same handler
              const touch = nativeEvent.touches?.[0];
              if (touch) {
                log('INFO', 'Whiteboard', '👆 CONVERTING TOUCH TO MOUSE', {
                  clientX: touch.clientX,
                  clientY: touch.clientY,
                  timestamp: Date.now()
                });
                // Create mouse event with same coordinate system
                const mouseEvent = {
                  ...e,
                  evt: {
                    ...e.evt,
                    clientX: touch.clientX,
                    clientY: touch.clientY
                  },
                  preventDefault: () => { if (e.preventDefault) e.preventDefault(); },
                  stopPropagation: () => { if (e.stopPropagation) e.stopPropagation(); }
                };
                // Use the same mouse handler - coordinates are already in same system
                handleMouseMove(mouseEvent);
              }
            } else {
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH MOVE (Scroll Mode)', {
                actualTool,
                isDrawing,
                touchCount: nativeEvent.touches?.length || 0,
                isMobileDrawingMode,
                timestamp: Date.now()
              });
            }
            // Allow normal scrolling behavior when not in drawing mode
          }}
          onTouchEnd={(e) => {
            // Access the native event object via the 'evt' property
            const nativeEvent = e.evt;
            
            if (isMobileDrawingMode) {
              // Prevent scrolling only in drawing mode - use more aggressive prevention
              if (e.preventDefault) e.preventDefault();
              if (e.stopPropagation) e.stopPropagation();
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH END (Drawing Mode)', {
                actualTool,
                isDrawing,
                touchCount: nativeEvent.touches?.length || 0,
                isMobileDrawingMode,
                timestamp: Date.now()
              });
              // Convert touch to mouse event and use same handler
              const touch = nativeEvent.changedTouches?.[0];
              if (touch) {
                log('INFO', 'Whiteboard', '👆 TOUCH END - CONVERTING TO MOUSE', {
                  clientX: touch.clientX,
                  clientY: touch.clientY,
                  timestamp: Date.now()
                });
                // Create mouse event with same coordinate system
                const mouseEvent = {
                  ...e,
                  evt: {
                    ...e.evt,
                    clientX: touch.clientX,
                    clientY: touch.clientY
                  },
                  preventDefault: () => { if (e.preventDefault) e.preventDefault(); },
                  stopPropagation: () => { if (e.stopPropagation) e.stopPropagation(); }
                };
                // Use the same mouse handler - coordinates are already in same system
                handleMouseUp(mouseEvent);
              }
            } else {
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH END (Scroll Mode)', {
                actualTool,
                isDrawing,
                touchCount: nativeEvent.touches?.length || 0,
                isMobileDrawingMode,
                timestamp: Date.now()
              });
              // Allow normal scrolling behavior
            }
          }}
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
                    draggable={!actualTool}
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
                      draggable: !actualTool,
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