import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import PDFRenderer from './PDFRenderer';
import ImageRenderer from './ImageRenderer';
import ArabicAlphabetOverlay from './ArabicAlphabetOverlay';
import { Stage, Layer, Line, Circle, Ellipse, Rect, Transformer, Group, Text, RegularPolygon } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import { throttle } from 'lodash';
import { Document, Page } from 'react-pdf';
import '../styles/pdf.css';
import '../styles/Whiteboard.css';
import { pdfjs } from 'react-pdf';
import { WebRTCProvider } from '../services/WebRTCProvider';
import logger from '../utils/Logger';

// Configure PDF.js worker - use local worker to avoid CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Logging system for Whiteboard - now uses Logger to send to server
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, VERBOSE: 4 };
const LOG_LEVEL = process.env.REACT_APP_LOG_LEVEL || 'INFO';

const log = (level, component, message, data = null) => {
  if (LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL]) {
    const prefix = `[${component}]`;
    const fullMessage = `${prefix} ${message}`;
    
    // Use Logger to send to both console and server
    switch (level) {
      case 'ERROR':
        logger.error(fullMessage, data);
        break;
      case 'WARN':
        logger.warn(fullMessage, data);
        break;
      case 'INFO':
        logger.info(fullMessage, data);
        break;
      case 'DEBUG':
        logger.debug(fullMessage, data);
        break;
      case 'VERBOSE':
        logger.verbose(fullMessage, data);
        break;
      default:
        logger.info(fullMessage, data);
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
  onRemoteStateTransition = null,
  onImageChange = null, 
  selectedContent = null, 
  onContentSelect = null,
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
    actualTool,
    actualColor,
    timestamp: Date.now()
  });
  
  // Drawing state
  const [lines, setLines] = useState([]);
  const [shapes, setShapes] = useState([]);

  // State to track background dimensions - MOVED TO TOP TO PREVENT HOISTING ERRORS
  const [backgroundDimensions, setBackgroundDimensions] = useState({ width: 0, height: 0 });
  const [arabicAlphabetShuffleOrder, setArabicAlphabetShuffleOrder] = useState(null);
  const [isArabicAlphabetClickMode, setIsArabicAlphabetClickMode] = useState(true); // Default to click mode
  const arabicAlphabetOverlayRef = useRef(null); // Ref to access AlphabetOverlay methods
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
    } else if (backgroundType === 'arabic-alphabet') {
      // For Arabic alphabet, always use fixed dimensions to prevent coordinate shifts
      finalWidth = backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200;
      finalHeight = backgroundDimensions.height > 0 ? backgroundDimensions.height : 800;
      source = 'arabic-alphabet-fixed';
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
      backgroundType,
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
  
  // Text Annotations State - Persistent text objects
  const [textAnnotations, setTextAnnotations] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextPosition, setEditingTextPosition] = useState({ x: 0, y: 0 });
  const textInputRef = useRef(null); // For editing text
  const editingTextValueRef = useRef(''); // Use ref to avoid remounts during typing
  
  // Focus text input when editing starts
  useEffect(() => {
    if (editingTextId && textInputRef.current) {
      textInputRef.current.focus();
      textInputRef.current.select(); // Select all text for easy editing
      // Set the input value from ref
      textInputRef.current.value = editingTextValueRef.current;
    }
  }, [editingTextId]);
  
  const [cursors, setCursors] = useState(new Map());
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundType, setBackgroundType] = useState(null);
  const [pdfPages, setPdfPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  // Use fixed container size for consistency between peers
  const [currentContainerSize, setCurrentContainerSize] = useState({ width: 1200, height: 800 });
  const [pageShapes, setPageShapes] = useState({});
  const [pageLines, setPageLines] = useState({});

  // Calculate container dimensions - will be set in useEffect
  const [finalWidth, setFinalWidth] = useState(containerSize.width);
  const [finalHeight, setFinalHeight] = useState(containerSize.height);

  // Debug flag to control verbose logging
  const DEBUG_MOUSE_MOVEMENT = LOG_LEVEL === 'INFO'; //'VERBOSE'; // Enable mouse movement logs in VERBOSE mode

  // Refs
  const startPointRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const screenShareVideoRef = useRef(null);
  const webRTCProviderRef = useRef(null);
  const selectedPeerRef = useRef(null);
  const pdfDimensionsRef = useRef(null); // Cache PDF dimensions to avoid recalculating
  const stageRef = useRef(null); // Konva stage reference for direct rendering
  const layerRef = useRef(null); // Konva layer reference for direct API calls
  const currentLineRef = useRef(null); // Reference to current Konva Line being drawn
  const currentShapeRef = useRef(null); // Reference to current Konva shape being drawn (rect, circle, etc.)
  const startPosRef = useRef({ x: 0, y: 0 }); // Track initial mouse position for shape drawing

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
  }, [isScreenShareActive, backgroundType, backgroundDimensions, screenShareDimensions]); // Include dimensions to recalculate when they change

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
          
          if (data.shape.tool === 'pen') {
            // Use regular lines storage for pen tool only
            log('INFO', 'Whiteboard', '🖼️ UPDATING regular lines', {
              shapeType: data.shape.type,
              pointsCount: data.shape.points?.length,
              currentLinesCount: lines.length,
              timestamp: Date.now()
            });
            
            // CRITICAL: Round all coordinates to integers to prevent sub-pixel differences
            // Floating-point coordinates can render differently on different browsers/devices
            const roundedShape = {
              ...data.shape,
              points: data.shape.points ? data.shape.points.map((coord, index) => 
                index % 2 === 0 ? Math.round(coord) : Math.round(coord) // Round x and y coordinates
              ) : data.shape.points,
              x: data.shape.x !== undefined ? Math.round(data.shape.x) : data.shape.x,
              y: data.shape.y !== undefined ? Math.round(data.shape.y) : data.shape.y
            };
            
            // Use rounded coordinates to ensure pixel-perfect alignment
            setLines(prev => {
              const newLines = [...prev, roundedShape];
              log('INFO', 'Whiteboard', '✅ UPDATED regular lines with unified coordinates (rounded)', {
                oldCount: prev.length,
                newCount: newLines.length,
                shapeType: roundedShape.type,
                // Enhanced debugging for Y shift investigation
                receivedCoordinates: data.shape.points,
                roundedCoordinates: roundedShape.points,
                coordinateAnalysis: {
                  firstPoint: roundedShape.points?.[0],
                  secondPoint: roundedShape.points?.[1],
                  coordinateCount: roundedShape.points?.length,
                  isLine: roundedShape.type === 'line',
                  isPen: roundedShape.tool === 'pen'
                },
                peerType: 'REMOTE_PEER',
                points: roundedShape.points,
                timestamp: Date.now()
              });
              return newLines;
            });
            } else {
            // KONVA-BASED REMOTE SYNC: Create Konva objects for shapes
            log('INFO', 'Whiteboard', '📨 RECEIVING shape creation', {
                shapeId: data.shape.id,
              shapeType: data.shape.type,
              shapeTool: data.shape.tool,
              shapeX: data.shape.x,
              shapeY: data.shape.y,
              points: data.shape.points,
              pointsString: JSON.stringify(data.shape.points),
              shapeType: data.shape.type,
              shapeTool: data.shape.tool,
              timestamp: Date.now()
            });
            
            // Create Konva object for remote peer
            if (layerRef.current) {
              let konvaShape;
              // CRITICAL: Round all coordinates to integers for pixel-perfect alignment
              const roundedPoints = data.shape.points ? data.shape.points.map((coord, index) => 
                index % 2 === 0 ? Math.round(coord) : Math.round(coord) // Round x and y coordinates
              ) : data.shape.points;
              
              switch (data.shape.type) {
                case 'line':
                  konvaShape = new Konva.Line({
                    id: data.shape.id,
                    points: roundedPoints,
                    stroke: data.shape.stroke,
                    strokeWidth: data.shape.strokeWidth,
                    lineCap: 'round',
                    lineJoin: 'round'
                  });
                  break;
                case 'circle':
                  konvaShape = new Konva.Circle({
                    id: data.shape.id,
                    x: Math.round(data.shape.x),
                    y: Math.round(data.shape.y),
                    radius: Math.round(data.shape.radius),
                    stroke: data.shape.stroke,
                    strokeWidth: data.shape.strokeWidth,
                    fill: data.shape.fill
                  });
                  break;
                case 'ellipse':
                  konvaShape = new Konva.Ellipse({
                    id: data.shape.id,
                    x: data.shape.x,
                    y: data.shape.y,
                    radiusX: data.shape.radiusX,
                    radiusY: data.shape.radiusY,
                    stroke: data.shape.stroke,
                    strokeWidth: data.shape.strokeWidth,
                    fill: data.shape.fill
                  });
                  break;
                case 'rectangle':
                  konvaShape = new Konva.Rect({
                    id: data.shape.id,
                    x: data.shape.x,
                    y: data.shape.y,
                    width: data.shape.width,
                    height: data.shape.height,
                    stroke: data.shape.stroke,
                    strokeWidth: data.shape.strokeWidth,
                    fill: data.shape.fill
                  });
                  break;
                case 'triangle':
                  konvaShape = new Konva.RegularPolygon({
                    id: data.shape.id,
                    x: data.shape.x,
                    y: data.shape.y,
                    sides: 3,
                    radius: data.shape.radius,
                    stroke: data.shape.stroke,
                    strokeWidth: data.shape.strokeWidth,
                    fill: data.shape.fill
                  });
                  break;
                case 'text':
                  // Handle text annotations from remote peer
                  konvaShape = new Konva.Text({
                    id: data.shape.id,
                    x: data.shape.x,
                    y: data.shape.y,
                    text: data.shape.text,
                    fontSize: data.shape.fontSize,
                    fontFamily: data.shape.fontFamily,
                    fill: data.shape.fill,
                    draggable: true
                  });
                  
                  // Also update textAnnotations state for remote peer
                  setTextAnnotations(prev => [...prev, data.shape]);
                  break;
              }
              if (konvaShape) {
                layerRef.current.add(konvaShape);
                layerRef.current.batchDraw();
              }
            }
          }
        }
        break;
      case 'update':
        if (data.shape) {
          if (data.shape.tool === 'pen') {
            // CRITICAL: Round all coordinates to integers to prevent sub-pixel differences
            const roundedShape = {
              ...data.shape,
              points: data.shape.points ? data.shape.points.map((coord, index) => 
                index % 2 === 0 ? Math.round(coord) : Math.round(coord) // Round x and y coordinates
              ) : data.shape.points
            };
            // Use regular lines storage for pen tool only
            setLines(prev => prev.map(line => line.id === data.shape.id ? roundedShape : line));
          } else {
            // KONVA-BASED REMOTE SYNC: Update Konva objects for shapes
            log('INFO', 'Whiteboard', '📨 RECEIVING shape update', {
              shapeId: data.shape.id,
              shapeType: data.shape.type,
              shapeTool: data.shape.tool,
              shapeX: data.shape.x,
              shapeY: data.shape.y,
              points: data.shape.points,
              pointsString: JSON.stringify(data.shape.points),
              timestamp: Date.now()
            });
            
            // CRITICAL: Round all coordinates to integers for pixel-perfect alignment
            const roundedPoints = data.shape.points ? data.shape.points.map((coord, index) => 
              index % 2 === 0 ? Math.round(coord) : Math.round(coord) // Round x and y coordinates
            ) : data.shape.points;
            
            // Update Konva object for remote peer
            if (layerRef.current) {
              const existingShape = layerRef.current.findOne(`#${data.shape.id}`);
              if (existingShape) {
                // Update existing Konva object
                switch (data.shape.type) {
                  case 'line':
                    existingShape.points(roundedPoints);
                    break;
                  case 'circle':
                    existingShape.x(Math.round(data.shape.x));
                    existingShape.y(Math.round(data.shape.y));
                    existingShape.radius(Math.round(data.shape.radius));
                    break;
                  case 'ellipse':
                    existingShape.x(Math.round(data.shape.x));
                    existingShape.y(Math.round(data.shape.y));
                    existingShape.radiusX(Math.round(data.shape.radiusX));
                    existingShape.radiusY(Math.round(data.shape.radiusY));
                    break;
                  case 'rectangle':
                    existingShape.x(Math.round(data.shape.x));
                    existingShape.y(Math.round(data.shape.y));
                    existingShape.width(Math.round(data.shape.width));
                    existingShape.height(Math.round(data.shape.height));
                    break;
                  case 'triangle':
                    existingShape.x(Math.round(data.shape.x));
                    existingShape.y(Math.round(data.shape.y));
                    existingShape.radius(Math.round(data.shape.radius));
                    break;
                  case 'text':
                    // Handle text annotation updates from remote peer
                    existingShape.x(data.shape.x);
                    existingShape.y(data.shape.y);
                    existingShape.text(data.shape.text);
                    existingShape.fontSize(data.shape.fontSize);
                    existingShape.fontFamily(data.shape.fontFamily);
                    existingShape.fill(data.shape.fill);
                    
                    // Also update textAnnotations state for remote peer
                    setTextAnnotations(prev => prev.map(annotation => 
                      annotation.id === data.shape.id ? data.shape : annotation
                    ));
                    break;
                }
                layerRef.current.batchDraw();
              }
            }
          }
        }
        break;
      case 'erase':
        if (data.shape) {
          if (data.shape.tool === 'pen') {
            // Use regular lines storage for pen tool only
            setLines(prev => prev.filter(line => line.id !== data.shape.id));
          } else if (data.shape.tool === 'text') {
            // Handle text annotation deletion from remote peer
            // Remove from Konva layer
            if (layerRef.current) {
              const existingText = layerRef.current.findOne(`#${data.shape.id}`);
              if (existingText) {
                existingText.destroy();
                layerRef.current.batchDraw();
              }
            }
            
            // Remove from textAnnotations state
            setTextAnnotations(prev => prev.filter(annotation => annotation.id !== data.shape.id));
            
            // Also remove from shapes for consistency
            setShapes(prev => prev.filter(shape => shape.id !== data.shape.id));
          } else {
            // Use regular shapes storage for all backgrounds (including PDF)
            setShapes(prev => prev.filter(shape => shape.id !== data.shape.id));
          }
        }
        break;
      case 'undo':
        log('INFO', 'Whiteboard', '📨 RECEIVED UNDO from peer', {
          receivedState: data.state,
          receivedHistoryStep: data.state?.historyStep,
          receivedLinesCount: data.state?.lines?.length,
          receivedShapesCount: data.state?.shapes?.length,
          receivedTextAnnotationsCount: data.state?.textAnnotations?.length
        });
        
        // Use the remote state instead of local history
        if (data.state) {
          setLines(data.state.lines || []);
          setTextAnnotations(data.state.textAnnotations || []);
          setHistoryStep(data.state.historyStep || 0);
          
          if (data.state.history) {
            setHistory(data.state.history);
          }
          
          const prevState = data.state;
          
          // KONVA-BASED REMOTE UNDO: Clear and recreate Konva objects
          if (layerRef.current) {
            layerRef.current.destroyChildren();
            
            // Recreate lines from history
            if (prevState.lines) {
              prevState.lines.forEach(line => {
                const konvaLine = new Konva.Line({
                  id: line.id,
                  points: line.points,
                  stroke: line.stroke,
                  strokeWidth: line.strokeWidth,
                  lineCap: line.lineCap,
                  lineJoin: line.lineJoin,
                  tension: 0.5
                });
                layerRef.current.add(konvaLine);
              });
            }
            
            // Recreate shapes from history
            if (prevState.shapes) {
              prevState.shapes.forEach(shape => {
                let konvaShape;
                switch (shape.type) {
                  case 'line':
                    konvaShape = new Konva.Line({
                      id: shape.id,
                      points: shape.points,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      lineCap: 'round',
                      lineJoin: 'round'
                    });
                    break;
                  case 'circle':
                    konvaShape = new Konva.Circle({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      radius: shape.radius,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'ellipse':
                    konvaShape = new Konva.Ellipse({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      radiusX: shape.radiusX,
                      radiusY: shape.radiusY,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'rectangle':
                    konvaShape = new Konva.Rect({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      width: shape.width,
                      height: shape.height,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'triangle':
                    konvaShape = new Konva.RegularPolygon({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      sides: 3,
                      radius: shape.radius,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                }
                if (konvaShape) {
                  layerRef.current.add(konvaShape);
                }
              });
            }
            
            // Recreate text annotations from history
            if (prevState.textAnnotations) {
              prevState.textAnnotations.forEach(textAnnotation => {
                const konvaText = new Konva.Text({
                  id: textAnnotation.id,
                  x: textAnnotation.x,
                  y: textAnnotation.y,
                  text: textAnnotation.text,
                  fontSize: textAnnotation.fontSize,
                  fontFamily: textAnnotation.fontFamily,
                  fill: textAnnotation.fill,
                  draggable: true
                });
                layerRef.current.add(konvaText);
              });
            }
            
            layerRef.current.batchDraw();
          }
          
          // For PDFs, also restore page-specific state
          if (backgroundType === 'pdf' && prevState.pageLines && prevState.pageShapes) {
            setPageLines(prevState.pageLines);
            setPageShapes(prevState.pageShapes);
          }
        } else {
          log('WARN', 'Whiteboard', 'No state received in undo message');
        }
        break;
      case 'redo':
        log('INFO', 'Whiteboard', '📨 RECEIVED REDO from peer', {
          receivedState: data.state,
          receivedHistoryStep: data.state?.historyStep,
          receivedLinesCount: data.state?.lines?.length,
          receivedShapesCount: data.state?.shapes?.length
        });
        
        // Use the remote state instead of local history
        if (data.state) {
          setLines(data.state.lines || []);
          setTextAnnotations(data.state.textAnnotations || []);
          setHistoryStep(data.state.historyStep || 0);
          
          if (data.state.history) {
            setHistory(data.state.history);
          }
          
          const state = data.state;
          
          // KONVA-BASED REMOTE REDO: Clear and recreate Konva objects
          if (layerRef.current) {
            layerRef.current.destroyChildren();
            
            // Recreate lines from history
            if (state.lines) {
              state.lines.forEach(line => {
                const konvaLine = new Konva.Line({
                  id: line.id,
                  points: line.points,
                  stroke: line.stroke,
                  strokeWidth: line.strokeWidth,
                  lineCap: line.lineCap,
                  lineJoin: line.lineJoin,
                  tension: 0.5
                });
                layerRef.current.add(konvaLine);
              });
            }
            
            // Recreate shapes from history
            if (state.shapes) {
              state.shapes.forEach(shape => {
                let konvaShape;
                switch (shape.type) {
                  case 'line':
                    konvaShape = new Konva.Line({
                      id: shape.id,
                      points: shape.points,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      lineCap: 'round',
                      lineJoin: 'round'
                    });
                    break;
                  case 'circle':
                    konvaShape = new Konva.Circle({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      radius: shape.radius,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'ellipse':
                    konvaShape = new Konva.Ellipse({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      radiusX: shape.radiusX,
                      radiusY: shape.radiusY,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'rectangle':
                    konvaShape = new Konva.Rect({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      width: shape.width,
                      height: shape.height,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                  case 'triangle':
                    konvaShape = new Konva.RegularPolygon({
                      id: shape.id,
                      x: shape.x,
                      y: shape.y,
                      sides: 3,
                      radius: shape.radius,
                      stroke: shape.stroke,
                      strokeWidth: shape.strokeWidth,
                      fill: shape.fill
                    });
                    break;
                }
                if (konvaShape) {
                  layerRef.current.add(konvaShape);
                }
              });
            }
            
            // Recreate text annotations from history
            if (state.textAnnotations) {
              state.textAnnotations.forEach(textAnnotation => {
                const konvaText = new Konva.Text({
                  id: textAnnotation.id,
                  x: textAnnotation.x,
                  y: textAnnotation.y,
                  text: textAnnotation.text,
                  fontSize: textAnnotation.fontSize,
                  fontFamily: textAnnotation.fontFamily,
                  fill: textAnnotation.fill,
                  draggable: true
                });
                layerRef.current.add(konvaText);
              });
            }
            
            layerRef.current.batchDraw();
          }
          
          // For PDFs, also restore page-specific state
          if (backgroundType === 'pdf' && state.pageLines && state.pageShapes) {
            setPageLines(state.pageLines);
            setPageShapes(state.pageShapes);
          }
        } else {
          log('WARN', 'Whiteboard', 'No state received in redo message');
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
      case 'contentSelection':
        if (data.content && onContentSelect) {
          log('INFO', 'Whiteboard', '📚 Received content selection from peer', {
            contentId: data.content.id,
            contentType: data.content.type,
            contentName: data.content.name
          });
          // Update selected content in parent component
          onContentSelect(data.content);
        }
        break;
      case 'arabicAlphabetShuffle': // Handle Arabic alphabet shuffle synchronization
        if (data.shuffleOrder !== undefined) {
          log('INFO', 'Whiteboard', '🔀 RECEIVED ARABIC ALPHABET SHUFFLE ORDER from peer', { 
            shuffleOrder: data.shuffleOrder,
            isReset: data.shuffleOrder === null
          });
          setArabicAlphabetShuffleOrder(data.shuffleOrder);
        }
        break;
      case 'arabicAlphabetCharacterClick': // Handle Arabic alphabet character click synchronization
        // Check if characterIndex is valid
        if (data.characterIndex !== undefined) {
          // Try to trigger speech even if backgroundType is not set yet
          // This handles cases where the message arrives before background is fully loaded
          log('INFO', 'Whiteboard', '🔊 RECEIVED ARABIC ALPHABET CHARACTER CLICK from peer', { 
            characterIndex: data.characterIndex,
            backgroundType,
            hasRef: !!arabicAlphabetOverlayRef.current,
            timestamp: Date.now()
          });
          
          // Find the character by originalIndex and trigger speech
          if (arabicAlphabetOverlayRef.current) {
            try {
              log('INFO', 'Whiteboard', '🔊 Calling speakCharacterByIndex', { characterIndex: data.characterIndex });
              arabicAlphabetOverlayRef.current.speakCharacterByIndex(data.characterIndex);
              log('INFO', 'Whiteboard', '🔊 speakCharacterByIndex called successfully');
            } catch (error) {
              log('ERROR', 'Whiteboard', '🔊 Error calling speakCharacterByIndex', { error: error.message, characterIndex: data.characterIndex });
            }
          } else {
            log('WARN', 'Whiteboard', '🔊 arabicAlphabetOverlayRef.current is null - will retry after delay', { characterIndex: data.characterIndex });
            // Retry after a short delay in case the ref isn't ready yet
            setTimeout(() => {
              if (arabicAlphabetOverlayRef.current) {
                log('INFO', 'Whiteboard', '🔊 Retry: Calling speakCharacterByIndex', { characterIndex: data.characterIndex });
                try {
                  arabicAlphabetOverlayRef.current.speakCharacterByIndex(data.characterIndex);
                } catch (error) {
                  log('ERROR', 'Whiteboard', '🔊 Retry: Error calling speakCharacterByIndex', { error: error.message, characterIndex: data.characterIndex });
                }
              } else {
                log('WARN', 'Whiteboard', '🔊 Retry: arabicAlphabetOverlayRef.current is still null', { characterIndex: data.characterIndex });
              }
            }, 500);
          }
        } else {
          log('WARN', 'Whiteboard', '🔊 Received character click but characterIndex is undefined', { 
            data,
            backgroundType
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
            
            // UNIFIED IMAGE LOADING: Both peers use identical logic with state-aware cleanup
            if (data.background.type === 'image' && onImageChange) {
              log('INFO', 'Whiteboard', '🖼️ UNIFIED: Remote image received, calling loadImage with state-aware cleanup');
              log('INFO', 'Whiteboard', 'Remote image URL', { imageUrl: data.background.file });
              // UNIFIED APPROACH: Both peers use same loadImage function with smart cleanup
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
            } else if (data.background.type === 'arabic-alphabet') {
              log('INFO', 'Whiteboard', '🕌 REMOTE ARABIC ALPHABET RECEIVED', {
                timestamp: Date.now(),
                receivedDimensions: data.background.dimensions
              });
              
              // CRITICAL: Ensure both peers use the same dimensions for coordinate synchronization
              // Use received dimensions if available, otherwise use default
              const dimensions = data.background.dimensions || { width: 1200, height: 800 };
              
              // CRITICAL: Set backgroundType and backgroundFile BEFORE calling setBackgroundDirectly
              // This ensures the ref is available when character clicks arrive
              setBackgroundType('arabic-alphabet');
              setBackgroundFile('arabic-alphabet');
              setBackgroundDimensions(dimensions);
              
              // Use setBackgroundDirectly with dimensions to ensure synchronization
              setBackgroundDirectly('arabic-alphabet', 'arabic-alphabet', dimensions);
              
              log('INFO', 'Whiteboard', '🕌 ARABIC ALPHABET DIMENSIONS SYNCHRONIZED', {
                dimensions,
                backgroundType: 'arabic-alphabet',
                backgroundFile: 'arabic-alphabet',
                note: 'Both peers now have identical Stage dimensions (1200x800) for coordinate synchronization'
              });
            }
            
            // Only set background file/type if not already handled above
            if (data.background.type !== 'arabic-alphabet') {
            setBackgroundFile(data.background.file);
            setBackgroundType(data.background.type);
            }
            
            log('INFO', 'Whiteboard', '✅ UPDATED background type from remote', {
              type: data.background.type,
              file: data.background.file,
              timestamp: Date.now()
            });
          }
          
          // Handle batched state if present
          if (data.state) {
            log('INFO', 'Whiteboard', '📦 BATCHED STATE: Processing state from background message', {
              linesCount: data.state.lines?.length || 0,
              shapesCount: data.state.shapes?.length || 0,
              historyStep: data.state.historyStep,
              historyLength: data.state.history?.length || 0
            });
            
            setLines(data.state.lines || []);
            setShapes(data.state.shapes || []);
            setHistoryStep(data.state.historyStep || 0);
            
            // Sync history if provided
            if (data.state.history) {
              setHistory(data.state.history);
              log('INFO', 'Whiteboard', '📚 BATCHED HISTORY SYNCED from peer', {
                historyLength: data.state.history.length,
                historyStep: data.state.historyStep,
                linesCount: data.state.lines?.length || 0,
                shapesCount: data.state.shapes?.length || 0
              });
            }
            
            // For PDFs, also update page-specific state if provided
            if (data.background?.type === 'pdf' && data.state.pageLines && data.state.pageShapes) {
              setPageLines(data.state.pageLines);
              setPageShapes(data.state.pageShapes);
            }
          }
          break;
      case 'stateTransition':
        log('INFO', 'Whiteboard', '🔄 RECEIVED STATE TRANSITION', {
          newState: data.newState,
          timestamp: Date.now()
        });
        
        // Clear drawings first (always needed for state transitions)
        log('INFO', 'Whiteboard', '🎨 CLEANUP: Clearing drawings due to remote state transition');
        clearAllDrawings();
        
        // Notify parent component about state change (with React.startTransition to prevent remounts)
        if (onRemoteStateTransition) {
          log('INFO', 'Whiteboard', '📡 Notifying parent of remote state transition', { newState: data.newState });
          // Use setTimeout to ensure this runs after current render cycle
          setTimeout(() => {
            onRemoteStateTransition(data.newState);
          }, 0);
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
          
          // Clear drawings on remote peer when background changes
          log('INFO', 'Whiteboard', '🎨 CLEANUP: Clearing drawings due to remote background transition');
          clearAllDrawings();
          
          // PDF dimensions will be calculated identically by both peers
          // No need to sync dimensions - both peers use same calculation function
          if (data.transitionData.backgroundType === 'pdf') {
            log('INFO', 'Whiteboard', '📐 PDF BACKGROUND - Both peers will calculate dimensions identically', {
              backgroundType: data.transitionData.backgroundType,
              timestamp: Date.now()
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
    const isConnected = webRTCProviderRef.current && selectedPeerRef.current;
    
    // OPTIMIZATION: Only log shape details for drawing actions, not for undo/redo
    const isDrawingAction = ['draw', 'update', 'erase'].includes(action);
    
    log(logLevel, 'Whiteboard', isConnected ? '📤 SENDING WebRTC message' : '📝 LOCAL ONLY - No peer connected', {
      action,
      hasShape: isDrawingAction && !!data.shape,
      shapeType: isDrawingAction ? data.shape?.type : undefined,
      shapeTool: isDrawingAction ? data.shape?.tool : undefined,
      shapeId: isDrawingAction ? data.shape?.id : undefined,
      pointsCount: isDrawingAction ? data.shape?.points?.length : undefined,
      coordinates: isDrawingAction ? data.shape?.points : undefined,
      coordinatesString: isDrawingAction ? JSON.stringify(data.shape?.points) : undefined,
      backgroundType,
      pdfLoaded: backgroundType === 'pdf',
      currentImageUrl: !!currentImageUrl,
      isConnected,
      timestamp: Date.now()
    });
    
    if (!isConnected) {
      // Local drawing works, but no sync to peers
      log('INFO', 'Whiteboard', '🎨 LOCAL DRAWING - Working offline, will sync when peer connects', {
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
      } else if (data.shuffleOrder !== undefined) {
        // For Arabic alphabet shuffle actions
        message.shuffleOrder = data.shuffleOrder;
      } else if (data.characterIndex !== undefined) {
        // For Arabic alphabet character click actions
        message.characterIndex = data.characterIndex;
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

    // CRITICAL: Always calculate coordinates relative to Stage's top-left corner
    // getPointerPosition() automatically handles viewport-to-stage coordinate transformation
    const stage = e.target.getStage();
    if (!stage) {
      log('WARN', 'Whiteboard', 'Stage not found in mouse move event');
      return;
    }
    
    const point = stage.getPointerPosition();
    if (!point) {
      log('WARN', 'Whiteboard', 'Could not get pointer position from stage');
      return;
    }
    
    // Coordinates are ALWAYS relative to Stage's top-left corner (0,0)
    // This ensures drawings stay in correct position regardless of container movement
    const correctedX = point.x;
    const correctedY = point.y;
    
    // Validate coordinates to prevent NaN/Infinity values
    if (!isFinite(correctedX) || !isFinite(correctedY) || isNaN(correctedX) || isNaN(correctedY)) {
      log('WARN', 'Whiteboard', 'Invalid coordinates detected, skipping', { correctedX, correctedY });
      return;
    }
    
    // Log coordinates when drawing with line tool (only if debug enabled)
    if (DEBUG_MOUSE_MOVEMENT && actualTool === 'line') {
      log('INFO', 'Whiteboard', 'Mouse move - Using Stage-relative coordinates', { 
        correctedX, 
        correctedY, 
        konvaX: point.x, 
        konvaY: point.y,
        stageWidth: stage.width(),
        stageHeight: stage.height(),
        note: 'Coordinates are relative to Stage top-left (0,0)'
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
      // DIRECT KONVA API APPROACH: Update the current line directly on Konva object
      if (currentLineRef.current && layerRef.current) {
        // Get current points and add new point
        const currentPoints = currentLineRef.current.points();
        const newPoints = [...currentPoints, correctedX, correctedY];
        
        // Update the Konva Line object directly
        currentLineRef.current.points(newPoints);
        
        // Force Konva to re-render without React state updates
        layerRef.current.batchDraw();
        
        // Send line update via WebRTC data channel (for remote sync)
        const lineData = {
          id: currentLineRef.current.id(),
          tool: actualTool,
          type: 'line',
          points: newPoints,
          stroke: currentLineRef.current.stroke(),
          strokeWidth: currentLineRef.current.strokeWidth(),
          lineCap: currentLineRef.current.lineCap(),
          lineJoin: currentLineRef.current.lineJoin()
        };
        sendWhiteboardMsg('update', { shape: lineData });
      }
    } else if (selectedShape) {
      const startPoint = startPointRef.current;
      const dx = correctedX - startPoint.x;
      const dy = correctedY - startPoint.y;
      
      // DIRECT KONVA API APPROACH: Update Konva shape directly
      if (currentShapeRef.current) {
        // Update Konva shape properties directly based on tool type
        switch (selectedShape.type) {
              case 'line':
            // Update line end point
            const startPoint = startPointRef.current;
            currentShapeRef.current.points([startPoint.x, startPoint.y, correctedX, correctedY]);
            break;
              case 'circle':
            const radius = Math.sqrt(dx * dx + dy * dy);
            currentShapeRef.current.radius(radius);
            break;
              case 'ellipse':
            currentShapeRef.current.radiusX(Math.abs(dx));
            currentShapeRef.current.radiusY(Math.abs(dy));
            break;
              case 'rectangle':
            currentShapeRef.current.width(Math.abs(dx));
            currentShapeRef.current.height(Math.abs(dy));
            // Adjust position for negative width/height
            if (dx < 0) {
              currentShapeRef.current.x(correctedX);
            }
            if (dy < 0) {
              currentShapeRef.current.y(correctedY);
            }
            break;
              case 'triangle':
            currentShapeRef.current.radius(Math.sqrt(dx * dx + dy * dy));
            break;
        }
      }
      // Force Konva to re-render without React state updates
      if (layerRef.current) {
        layerRef.current.batchDraw();
      }
      
      // Send shape update via WebRTC data channel
      if (currentShapeRef.current) {
        const shapeData = {
          id: selectedShape.id,
          tool: selectedShape.tool,
          type: selectedShape.type,
          x: currentShapeRef.current.x(),
          y: currentShapeRef.current.y(),
          stroke: currentShapeRef.current.stroke(),
          strokeWidth: currentShapeRef.current.strokeWidth(),
          fill: currentShapeRef.current.fill()
        };
        
        // Add tool-specific properties
        switch (selectedShape.type) {
            case 'line':
              shapeData.points = currentShapeRef.current.points();
              break;
            case 'circle':
            shapeData.radius = currentShapeRef.current.radius();
            break;
            case 'ellipse':
            shapeData.radiusX = currentShapeRef.current.radiusX();
            shapeData.radiusY = currentShapeRef.current.radiusY();
            break;
            case 'rectangle':
              shapeData.width = currentShapeRef.current.width();
              shapeData.height = currentShapeRef.current.height();
              break;
            case 'triangle':
              shapeData.radius = currentShapeRef.current.radius();
              break;
        }
        
        sendWhiteboardMsg('update', { shape: shapeData });
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

    // CRITICAL: Always calculate coordinates relative to Stage's top-left corner
    // getPointerPosition() automatically handles viewport-to-stage coordinate transformation
    const stage = e.target.getStage();
    if (!stage) {
      log('WARN', 'Whiteboard', 'Stage not found in mouse down event');
      return;
    }
    
    const point = stage.getPointerPosition();
    if (!point) {
      log('WARN', 'Whiteboard', 'Could not get pointer position from stage');
      return;
    }
    
    // Coordinates are ALWAYS relative to Stage's top-left corner (0,0)
    // This ensures drawings stay in correct position regardless of container movement
    // CRITICAL: Round to integers to prevent sub-pixel differences between peers
    // Floating-point coordinates can render differently on different browsers/devices
    const correctedX = Math.round(point.x);
    const correctedY = Math.round(point.y);
    
    // LOCAL TOGGLE: Only disable drawing over alphabet area when in click mode
    if (backgroundType === 'arabic-alphabet' && isArabicAlphabetClickMode) {
      // Check if click is within alphabet area (1200x800)
      if (correctedX >= 0 && correctedX <= 1200 && correctedY >= 0 && correctedY <= 800) {
        // Check if click target is an alphabet card - if so, let it handle the click
        const target = e.evt?.target || e.target;
        const isAlphabetCard = target && (
          target.classList?.contains('arabic-letter-card') ||
          target.closest?.('.arabic-letter-card') ||
          target.closest?.('.arabic-alphabet-grid')
        );
        
        if (isAlphabetCard) {
          log('INFO', 'Whiteboard', '🖱️ Click on alphabet card - allowing card to handle click', {
            backgroundType,
            isArabicAlphabetClickMode,
            x: correctedX,
            y: correctedY,
            timestamp: Date.now()
          });
          return; // Let alphabet card handle the click
        }
        
        log('INFO', 'Whiteboard', '🖱️ Drawing disabled over alphabet area - Click mode active', {
          backgroundType,
          isArabicAlphabetClickMode,
          x: correctedX,
          y: correctedY,
          timestamp: Date.now()
        });
        return; // Don't allow drawing over alphabet area in click mode
      }
      // If click is outside alphabet area, allow drawing normally
    }
    
    // Validate coordinates to prevent NaN/Infinity values
    if (!isFinite(correctedX) || !isFinite(correctedY) || isNaN(correctedX) || isNaN(correctedY)) {
      log('WARN', 'Whiteboard', 'Invalid coordinates detected, skipping', { correctedX, correctedY });
      return;
    }
    
    if (DEBUG_MOUSE_MOVEMENT) {
      log('VERBOSE', 'Whiteboard', 'Mouse down - Starting drawing with tool', { drawingTool, position: point });
      log('VERBOSE', 'Whiteboard', 'Mouse down - Using Stage-relative coordinates', { 
        correctedX, 
        correctedY,
        stageWidth: stage.width(),
        stageHeight: stage.height(),
        note: 'Coordinates are relative to Stage top-left (0,0)'
      });
    }

    if (currentTool === 'text') {
      // Text tool - handle double-click to add text
      return; // Text tool doesn't use mouse down, only double-click
    }
    
    if (currentTool === 'pen') { // CRITICAL FIX: Use fresh currentTool instead of stale actualTool
      // DIRECT KONVA API APPROACH: Create Konva Line object directly
      const lineId = `${userId}-${Date.now()}-${uuidv4()}`;
      
      // POC: Log drawing start to server
      logger.info('[Whiteboard] 🖊️ Drawing started - Pen tool', {
        lineId,
        tool: currentTool,
        color: currentColor,
        startPoint: { x: correctedX, y: correctedY },
        userId,
        username,
        timestamp: new Date().toISOString()
      });
      
      if (layerRef.current) {
        // Create Konva Line object directly
        const konvaLine = new Konva.Line({
          id: lineId,
          points: [correctedX, correctedY],
          stroke: currentColor,
          strokeWidth: 2,
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0.5
        });
        
        // Add to Konva layer directly
        layerRef.current.add(konvaLine);
        currentLineRef.current = konvaLine;
        
        // Force initial render
        layerRef.current.batchDraw();
      }
      
      // Create line data for React state and WebRTC
      const newLine = {
        id: lineId,
        tool: currentTool,
        type: 'line',
        points: [correctedX, correctedY],
        stroke: currentColor,
        strokeWidth: 2,
        lineCap: 'round',
        lineJoin: 'round'
      };
      
      // Add to React state for persistence
      setLines(prev => [...prev, newLine]);
      setIsDrawing(true);
      
      // Send line creation via WebRTC data channel
      sendWhiteboardMsg('draw', { shape: newLine });
    } else {
      // DIRECT KONVA API APPROACH: Create Konva shapes directly
      if (layerRef.current) {
        const shapeId = `${userId}-${Date.now()}-${uuidv4()}`;
        const shapeColor = currentColor;
        const shapeFill = defaultFill ? currentColor : 'transparent';
        
        // Store starting position
        startPosRef.current = { x: correctedX, y: correctedY };
        
        let konvaShape;
      
        // Create appropriate Konva shape based on tool
        switch (currentTool) {
          case 'line':
            konvaShape = new Konva.Line({
              id: shapeId,
              points: [correctedX, correctedY, correctedX, correctedY], // Start and end at same point initially
              stroke: shapeColor,
              strokeWidth: 2,
              lineCap: 'round',
              lineJoin: 'round'
            });
            break;
          case 'rectangle':
            konvaShape = new Konva.Rect({
              id: shapeId,
              x: correctedX,
              y: correctedY,
              width: 0,
              height: 0,
              stroke: shapeColor,
              strokeWidth: 2,
              fill: shapeFill
            });
            break;
          case 'circle':
            konvaShape = new Konva.Circle({
              id: shapeId,
              x: correctedX,
              y: correctedY,
              radius: 0,
              stroke: shapeColor,
              strokeWidth: 2,
              fill: shapeFill
            });
            break;
          case 'ellipse':
            konvaShape = new Konva.Ellipse({
              id: shapeId,
              x: correctedX,
              y: correctedY,
              radiusX: 0,
              radiusY: 0,
              stroke: shapeColor,
              strokeWidth: 2,
              fill: shapeFill
            });
            break;
          case 'triangle':
            konvaShape = new Konva.RegularPolygon({
              id: shapeId,
              x: correctedX,
              y: correctedY,
              sides: 3,
              radius: 0,
              stroke: shapeColor,
              strokeWidth: 2,
              fill: shapeFill
            });
            break;
          default:
            return; // Unknown tool
        }

        // Add to Konva layer directly
        layerRef.current.add(konvaShape);
        currentShapeRef.current = konvaShape;
        
        // Force initial render
        layerRef.current.batchDraw();
        
        // Create shape data for WebRTC and history (but don't add to React state for rendering)
      const newShape = {
          id: shapeId,
          tool: currentTool,
          type: currentTool,
        x: correctedX,
        y: correctedY,
          stroke: shapeColor,
        strokeWidth: 2,
          fill: shapeFill
      };

      // Set specific properties based on shape type
        switch (currentTool) {
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
          newShape.radius = 0;
          break;
      }

        // Store shape reference for mouse move/up handling
      setSelectedShape(newShape);
      setIsDrawing(true);
      startPointRef.current = { x: correctedX, y: correctedY };
        
        // Send shape creation via WebRTC data channel
        sendWhiteboardMsg('draw', { shape: newShape });
      }
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

    // FINALIZE PEN TOOL: Update React state with final line data
    if (actualTool === 'pen' && currentLineRef.current) {
      // Get final line data from Konva object
      const finalLineData = {
        id: currentLineRef.current.id(),
        tool: actualTool,
        type: 'line',
        points: currentLineRef.current.points(),
        stroke: currentLineRef.current.stroke(),
        strokeWidth: currentLineRef.current.strokeWidth(),
        lineCap: currentLineRef.current.lineCap(),
        lineJoin: currentLineRef.current.lineJoin()
      };
      
      // POC: Log drawing completion to server
      logger.info('[Whiteboard] ✅ Drawing completed - Pen tool', {
        lineId: finalLineData.id,
        tool: actualTool,
        color: finalLineData.stroke,
        pointCount: finalLineData.points.length / 2, // Each point is x,y
        userId,
        username,
        timestamp: new Date().toISOString()
      });
      
      // Update React state with final line (for persistence and undo/redo)
      setLines(prev => {
        const updatedLines = [...prev];
        const lastIndex = updatedLines.length - 1;
        if (lastIndex >= 0) {
          updatedLines[lastIndex] = finalLineData;
        }
        return updatedLines;
      });
      
      // Send final line data via WebRTC for remote peer sync
      sendWhiteboardMsg('update', { shape: finalLineData });
      
      // Clear the current line reference
      currentLineRef.current = null;
    }

    // FINALIZE SHAPE TOOLS: Update React state with final shape data
    if (actualTool !== 'pen' && currentShapeRef.current && selectedShape) {
      // Get final shape data from Konva object
      const finalShapeData = {
        id: currentShapeRef.current.id(),
        tool: selectedShape.tool,
        type: selectedShape.type,
        x: currentShapeRef.current.x(),
        y: currentShapeRef.current.y(),
        stroke: currentShapeRef.current.stroke(),
        strokeWidth: currentShapeRef.current.strokeWidth(),
        fill: currentShapeRef.current.fill()
      };
      
      // Add tool-specific properties
      switch (selectedShape.type) {
        case 'line':
          finalShapeData.points = currentShapeRef.current.points();
          break;
        case 'circle':
          finalShapeData.radius = currentShapeRef.current.radius();
          break;
        case 'ellipse':
          finalShapeData.radiusX = currentShapeRef.current.radiusX();
          finalShapeData.radiusY = currentShapeRef.current.radiusY();
          break;
        case 'rectangle':
          finalShapeData.width = currentShapeRef.current.width();
          finalShapeData.height = currentShapeRef.current.height();
          break;
        case 'triangle':
          finalShapeData.radius = currentShapeRef.current.radius();
          break;
      }
      
      // REMOVED: No longer updating React state for shapes since we're using Konva objects only
      // The Konva object is already updated and rendered directly
      
      // Clear the current shape reference
      currentShapeRef.current = null;
      
      // Add to history for undo/redo (batched to avoid remounts during drawing)
      React.startTransition(() => {
        addToHistory();
      });
    }

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

  // Handle double-click for text tool
  const handleDoubleClick = (e) => {
    const currentTool = getActualTool();
    
    if (currentTool === 'text') {
      // CRITICAL: Always calculate coordinates relative to Stage's top-left corner
      const stage = e.target.getStage();
      if (!stage) {
        log('WARN', 'Whiteboard', 'Stage not found in double-click event');
        return;
      }
      
      const point = stage.getPointerPosition();
      if (!point) {
        log('WARN', 'Whiteboard', 'Could not get pointer position from stage');
        return;
      }
      
      log('INFO', 'Whiteboard', '📝 TEXT TOOL: Double-click detected', {
        position: point,
        timestamp: Date.now()
      });
      
      // Check if clicking on existing text to edit
      const clickedText = stage.findOne(`#text-${editingTextId}`);
      if (clickedText && clickedText.getClassName() === 'Text') {
        // Edit existing text
        setEditingTextId(clickedText.id());
        editingTextValueRef.current = clickedText.text();
        setEditingTextPosition({ x: clickedText.x(), y: clickedText.y() });
        return;
      }
      
      // Create new text annotation
      const newTextId = `text-${userId}-${Date.now()}-${uuidv4()}`;
      setEditingTextId(newTextId);
      editingTextValueRef.current = '';
      setEditingTextPosition({ x: point.x, y: point.y });
    }
  };

  // Handle text input completion - Create or update persistent text
  const handleTextInputComplete = (text) => {
    if (text.trim() && layerRef.current) {
      
      if (editingTextId) {
        // Check if this is editing existing text or creating new
        const existingText = layerRef.current.findOne(`#${editingTextId}`);
        
        if (existingText) {
          // Update existing text
          existingText.text(text);
          existingText.x(editingTextPosition.x);
          existingText.y(editingTextPosition.y);
          layerRef.current.batchDraw();
          
          // Update in textAnnotations state
          setTextAnnotations(prev => prev.map(annotation => 
            annotation.id === editingTextId 
              ? { ...annotation, text, x: editingTextPosition.x, y: editingTextPosition.y }
              : annotation
          ));
          
          log('INFO', 'Whiteboard', '📝 TEXT UPDATED', {
            text,
            position: editingTextPosition,
            id: editingTextId
          });
        } else {
          // Create new text annotation
          const konvaText = new Konva.Text({
            id: editingTextId,
            x: editingTextPosition.x,
            y: editingTextPosition.y,
            text: text,
            fontSize: 16,
            fontFamily: 'Arial',
            fill: '#000000',
            draggable: true
          });
          
          // Add to Konva layer
          layerRef.current.add(konvaText);
          layerRef.current.batchDraw();
          
          // Create text data
          const textData = {
            id: editingTextId,
            tool: 'text',
            type: 'text',
            x: editingTextPosition.x,
            y: editingTextPosition.y,
            text: text,
            fontSize: 16,
            fontFamily: 'Arial',
            fill: '#000000'
          };
          
          // Update states first
          setTextAnnotations(prev => [...prev, textData]);
          setShapes(prev => [...prev, textData]);
          sendWhiteboardMsg('draw', { shape: textData });
          
          // Add to history with the updated text annotations
          React.startTransition(() => {
            addToHistory(lines, null, [...textAnnotations, textData]);
          });
          
          log('INFO', 'Whiteboard', '📝 TEXT CREATED', {
            text,
            position: editingTextPosition,
            id: editingTextId
          });
        }
      }
    }
    
    // Reset editing state
    setEditingTextId(null);
    editingTextValueRef.current = '';
    setEditingTextPosition({ x: 0, y: 0 });
  };

  // Handle text input cancellation
  const handleTextInputCancel = () => {
    setEditingTextId(null);
    editingTextValueRef.current = '';
    setEditingTextPosition({ x: 0, y: 0 });
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
    handleShapeSelection(e);
  };

  // Handle right-click to delete text annotations
  const handleRightClick = (e) => {
    const currentTool = getActualTool();
    if (currentTool === 'text') {
      e.evt.preventDefault(); // Prevent context menu
      
      const stage = e.target.getStage();
      const point = stage.getPointerPosition();
      
      // Find text at click position
      const clickedText = stage.findOne(`#text-${editingTextId}`);
      if (clickedText && clickedText.getClassName() === 'Text') {
        // Delete the text
        clickedText.destroy();
        layerRef.current.batchDraw();
        
        // Remove from textAnnotations state
        setTextAnnotations(prev => prev.filter(annotation => annotation.id !== clickedText.id()));
        
        // Also remove from shapes for WebRTC sync
        setShapes(prev => prev.filter(shape => shape.id !== clickedText.id()));
        sendWhiteboardMsg('erase', { shape: { id: clickedText.id(), tool: 'text', type: 'text' } });
        
        log('INFO', 'Whiteboard', '📝 TEXT DELETED', {
          id: clickedText.id(),
          position: point
        });
      }
    }
  };

  // Handle shape selection when no tool is active
  const handleShapeSelection = (e) => {
    const clickedShape = e.target;
    if (clickedShape.getStage() !== clickedShape) {
      setSelectedShape(clickedShape);
    } else {
      setSelectedShape(null);
    }
  };

  // Helper function to extract shapes from Konva layer
  const getShapesFromKonva = () => {
    if (!layerRef.current) return [];
    
    const shapes = [];
    layerRef.current.children.forEach(child => {
      if (child.className === 'Line' && child.id() && !child.id().includes('cursor')) {
        // This is a shape line (not a pen line)
        shapes.push({
          id: child.id(),
          type: 'line',
          tool: 'line',
          x: child.x(),
          y: child.y(),
          points: child.points(),
          stroke: child.stroke(),
          strokeWidth: child.strokeWidth(),
          fill: child.fill()
        });
      } else if (child.className === 'Circle') {
        shapes.push({
          id: child.id(),
          type: 'circle',
          tool: 'circle',
          x: child.x(),
          y: child.y(),
          radius: child.radius(),
          stroke: child.stroke(),
          strokeWidth: child.strokeWidth(),
          fill: child.fill()
        });
      } else if (child.className === 'Ellipse') {
        shapes.push({
          id: child.id(),
          type: 'ellipse',
          tool: 'ellipse',
          x: child.x(),
          y: child.y(),
          radiusX: child.radiusX(),
          radiusY: child.radiusY(),
          stroke: child.stroke(),
          strokeWidth: child.strokeWidth(),
          fill: child.fill()
        });
      } else if (child.className === 'Rect') {
        shapes.push({
          id: child.id(),
          type: 'rectangle',
          tool: 'rectangle',
          x: child.x(),
          y: child.y(),
          width: child.width(),
          height: child.height(),
          stroke: child.stroke(),
          strokeWidth: child.strokeWidth(),
          fill: child.fill()
        });
      } else if (child.className === 'RegularPolygon') {
        shapes.push({
          id: child.id(),
          type: 'triangle',
          tool: 'triangle',
          x: child.x(),
          y: child.y(),
          radius: child.radius(),
          stroke: child.stroke(),
          strokeWidth: child.strokeWidth(),
          fill: child.fill()
        });
      }
    });
    return shapes;
  };

  const addToHistory = (currentLines = lines, currentShapes = null, currentTextAnnotations = null) => {
    // Get shapes from Konva if not provided
    const shapes = currentShapes || getShapesFromKonva();
    // Use provided text annotations or current state
    const textAnnotationsToUse = currentTextAnnotations !== null ? currentTextAnnotations : textAnnotations;
    
    log('DEBUG', 'Whiteboard', 'Adding to history', { 
      currentHistoryLength: history.length, 
      currentHistoryStep: historyStep,
      linesCount: currentLines.length,
      shapesCount: shapes.length,
      textAnnotationsCount: textAnnotationsToUse.length
    });
    
    const newHistory = history.slice(0, historyStep + 1);
    
    // For PDFs, include page-specific state in history
    if (backgroundType === 'pdf') {
      newHistory.push({ 
        lines: [...currentLines], 
        shapes: [...shapes],
        textAnnotations: [...textAnnotationsToUse], // Include text annotations
        pageLines: { ...pageLines },
        pageShapes: { ...pageShapes }
      });
    } else {
    newHistory.push({ 
      lines: [...currentLines], 
      shapes: [...shapes],
      textAnnotations: [...textAnnotationsToUse] // Include text annotations
    });
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
    
    // Add to history (batched to avoid remounts)
    React.startTransition(() => {
      addToHistory();
    });
    
    log('INFO', 'Whiteboard', 'PDF file set for rendering', { pdfUrl });
  }, []);

  // Unified PDF rendering function for both peers
 const renderPDFUrl = useCallback((pdfUrl, numPages = null, sendToPeers = false) => {
    // Clear image-specific state when switching to PDF
    console.log('webRTCProvider:', webRTCProvider);
    console.log('selectedPeer:', selectedPeer);
    console.log('sendToPeers:', sendToPeers);
    //clearAllDrawings();
    if (sendToPeers && webRTCProvider && selectedPeer) {
      const peerSendStart = performance.now();
      log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { selectedPeer, pdfUrl });
      log('INFO', 'Whiteboard', 'Sending PDF to remote peer', { peer: selectedPeer, pdfUrl });
      
      // Enhanced debugging for WebRTC connection status
      log('DEBUG', 'Whiteboard', 'WebRTC Connection Status', {
        hasWebRTCProvider: !!webRTCProvider,
        hasSelectedPeer: !!selectedPeer,
        selectedPeerId: selectedPeer?.id || selectedPeer,
        webRTCProviderType: typeof webRTCProvider,
        sendWhiteboardMessageExists: typeof webRTCProvider?.sendWhiteboardMessage === 'function'
      });
      
      // Check data channel ready state
      if (webRTCProvider && selectedPeer) {
        try {
          // Access the internal connections map to check data channel state
          const connections = webRTCProvider.connections || webRTCProvider._connections;
          if (connections) {
            const peerState = connections.get(selectedPeer);
            if (peerState) {
              log('DEBUG', 'Whiteboard', 'Data Channel State', {
                hasDataChannel: !!peerState.dataChannel,
                dataChannelReadyState: peerState.dataChannel?.readyState,
                peerPhase: peerState.phase,
                isDataChannelOpen: peerState.dataChannel?.readyState === 'open'
              });
            } else {
              log('WARN', 'Whiteboard', 'No peer state found in connections', {
                selectedPeer,
                availablePeers: Array.from(connections.keys())
              });
            }
          }
        } catch (error) {
          log('WARN', 'Whiteboard', 'Could not access WebRTC connections for debugging', { error: error.message });
        }
      }
      
      try {
        // Use the same method as chat messages for consistency
        const pdfMessage = {
          action: 'background',
          background: {
            file: pdfUrl,
            type: 'pdf'
          },
          timestamp: Date.now()
        };
        
        log('DEBUG', 'Whiteboard', 'PDF Message Structure', {
          messageSize: JSON.stringify(pdfMessage).length,
          pdfUrl: pdfUrl,
          messageKeys: Object.keys(pdfMessage)
        });
        
        // Try both methods to see which one works
        webRTCProvider.sendWhiteboardMessage(selectedPeer, pdfMessage);
        
        const peerSendEnd = performance.now();
        log('INFO', 'Whiteboard', 'PDF sent to remote peer successfully');
        log('DEBUG', 'Whiteboard', 'Peer send timing', {
          peerSendTime: `${(peerSendEnd - peerSendStart).toFixed(2)}ms`
        });
      } catch (error) {
        log('ERROR', 'Whiteboard', 'Failed to send PDF to remote peer', {
          error: error.message,
          selectedPeer,
          pdfUrl,
          errorStack: error.stack
        });
        
        // Fallback: Try using the same method as chat messages
        try {
          log('INFO', 'Whiteboard', 'Trying fallback method (same as chat messages)');
          webRTCProvider.sendMessage(selectedPeer, {
            type: 'whiteboard',
            action: 'background',
            background: {
              file: pdfUrl,
              type: 'pdf'
            },
            timestamp: Date.now()
          });
          log('INFO', 'Whiteboard', 'PDF sent via fallback method successfully');
        } catch (fallbackError) {
          log('ERROR', 'Whiteboard', 'Fallback method also failed', {
            fallbackError: fallbackError.message,
            originalError: error.message
          });
        }
      }
    } else {
      log('WARN', 'Whiteboard', 'Cannot send PDF to remote peer', { 
        hasWebRTCProvider: !!webRTCProvider, 
        selectedPeer, 
        pdfUrl,
        sendToPeers,
        webRTCProviderType: typeof webRTCProvider,
        selectedPeerType: typeof selectedPeer
      });
    }

    const startRenderTime = performance.now();
    setBackgroundDimensions({ width: 0, height: 0 });
            
    // Use unified PDF rendering function with peer sync for initiator
    log('INFO', 'Whiteboard', 'Using unified PDF rendering for local upload');

    renderPDF(pdfUrl, numPages); // Use sendToPeers parameter

    const totalEndTime = performance.now();
    log('DEBUG', 'Whiteboard', 'Total rendering time', {
      totalTime: `${(totalEndTime - startRenderTime).toFixed(2)}ms`
    });
  }, [renderPDF, webRTCProvider, selectedPeer]);





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
        React.startTransition(() => {
        addToHistory();
        });
      }
    }
  }, [isDrawing]); // Only depend on isDrawing, not lines/shapes


  // Debounce undo/redo operations to prevent rapid clicking
  const [isUndoRedoProcessing, setIsUndoRedoProcessing] = useState(false);
  
  const handleUndo = () => {
    if (isUndoRedoProcessing) {
      log('DEBUG', 'Whiteboard', 'Undo already processing, ignoring');
      return;
    }
    
    log('DEBUG', 'Whiteboard', 'Undo function called', { historyStep, historyLength: history.length });
    
    if (historyStep > 0) {
      setIsUndoRedoProcessing(true);
      const newStep = historyStep - 1;
      const prevState = history[newStep];
      log('DEBUG', 'Whiteboard', 'Undoing to step', { newStep, state: prevState });
      
      // OPTIMIZATION: Batch all state updates together to reduce re-renders
      React.startTransition(() => {
        // Update React state for lines (still needed for persistence)
        setLines(prevState.lines);
        
        // Update text annotations state
        if (prevState.textAnnotations) {
          setTextAnnotations(prevState.textAnnotations);
        } else {
          setTextAnnotations([]);
        }
        
        // Update shapes state for consistency
        if (prevState.shapes) {
          setShapes(prevState.shapes);
        } else {
          setShapes([]);
        }
      });
      
      // OPTIMIZATION: Batch all Konva operations for better performance
      if (layerRef.current) {
        // Clear all Konva objects
        layerRef.current.destroyChildren();
        
        // Recreate lines from history
        if (prevState.lines) {
          prevState.lines.forEach(line => {
            const konvaLine = new Konva.Line({
              id: line.id,
              points: line.points,
              stroke: line.stroke,
              strokeWidth: line.strokeWidth,
              lineCap: line.lineCap,
              lineJoin: line.lineJoin,
              tension: 0.5
            });
            layerRef.current.add(konvaLine);
          });
        }
        
        // Recreate text annotations from history
        if (prevState.textAnnotations) {
          prevState.textAnnotations.forEach(textAnnotation => {
            const konvaText = new Konva.Text({
              id: textAnnotation.id,
              x: textAnnotation.x,
              y: textAnnotation.y,
              text: textAnnotation.text,
              fontSize: textAnnotation.fontSize,
              fontFamily: textAnnotation.fontFamily,
              fill: textAnnotation.fill,
              draggable: true
            });
            layerRef.current.add(konvaText);
          });
        }
        
        // Recreate shapes from history
        if (prevState.shapes) {
          prevState.shapes.forEach(shape => {
            let konvaShape;
            switch (shape.type) {
              case 'line':
                konvaShape = new Konva.Line({
                  id: shape.id,
                  points: shape.points,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  lineCap: 'round',
                  lineJoin: 'round'
                });
                break;
              case 'circle':
                konvaShape = new Konva.Circle({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  radius: shape.radius,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'ellipse':
                konvaShape = new Konva.Ellipse({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  radiusX: shape.radiusX,
                  radiusY: shape.radiusY,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'rectangle':
                konvaShape = new Konva.Rect({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  width: shape.width,
                  height: shape.height,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'triangle':
                konvaShape = new Konva.RegularPolygon({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  sides: 3,
                  radius: shape.radius,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
            }
            if (konvaShape) {
              layerRef.current.add(konvaShape);
            }
          });
        }
        
        // Force re-render
        layerRef.current.batchDraw();
      }
      
      // For PDFs, also restore page-specific state
      if (backgroundType === 'pdf' && prevState.pageLines && prevState.pageShapes) {
        setPageLines(prevState.pageLines);
        setPageShapes(prevState.pageShapes);
      }
      
      setHistoryStep(newStep);

      // Send undo action to peers for remote sync
      sendWhiteboardMsg('undo', { 
        state: {
          lines: prevState.lines, 
          shapes: prevState.shapes,
          textAnnotations: prevState.textAnnotations || [],
          historyStep: newStep,
          history: history
        }
      });
      
      // Reset debounce after operations complete
      setTimeout(() => setIsUndoRedoProcessing(false), 100);
    } else {
      log('DEBUG', 'Whiteboard', 'Cannot undo - already at first step');
    }
  };

  const handleRedo = () => {
    if (isUndoRedoProcessing) {
      log('DEBUG', 'Whiteboard', 'Redo already processing, ignoring');
      return;
    }
    
    if (historyStep < history.length - 1) {
      setIsUndoRedoProcessing(true);
      const newStep = historyStep + 1;
      const state = history[newStep];
      
      // OPTIMIZATION: Batch all state updates together to reduce re-renders
      React.startTransition(() => {
        // Update React state for lines (still needed for persistence)
        setLines(state.lines);
        
        // Update text annotations state
        if (state.textAnnotations) {
          setTextAnnotations(state.textAnnotations);
        } else {
          setTextAnnotations([]);
        }
        
        // Update shapes state for consistency
        if (state.shapes) {
          setShapes(state.shapes);
        } else {
          setShapes([]);
        }
      });
      
      // KONVA-BASED REDO: Clear and recreate Konva objects
      if (layerRef.current) {
        // Clear all Konva objects
        layerRef.current.destroyChildren();
        
        // Recreate lines from history
        if (state.lines) {
          state.lines.forEach(line => {
            const konvaLine = new Konva.Line({
              id: line.id,
              points: line.points,
              stroke: line.stroke,
              strokeWidth: line.strokeWidth,
              lineCap: line.lineCap,
              lineJoin: line.lineJoin,
              tension: 0.5
            });
            layerRef.current.add(konvaLine);
          });
        }
        
        // Recreate text annotations from history
        if (state.textAnnotations) {
          state.textAnnotations.forEach(textAnnotation => {
            const konvaText = new Konva.Text({
              id: textAnnotation.id,
              x: textAnnotation.x,
              y: textAnnotation.y,
              text: textAnnotation.text,
              fontSize: textAnnotation.fontSize,
              fontFamily: textAnnotation.fontFamily,
              fill: textAnnotation.fill,
              draggable: true
            });
            layerRef.current.add(konvaText);
          });
        }
        
        // Recreate shapes from history
        if (state.shapes) {
          state.shapes.forEach(shape => {
            let konvaShape;
            switch (shape.type) {
              case 'line':
                konvaShape = new Konva.Line({
                  id: shape.id,
                  points: shape.points,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  lineCap: 'round',
                  lineJoin: 'round'
                });
                break;
              case 'circle':
                konvaShape = new Konva.Circle({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  radius: shape.radius,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'ellipse':
                konvaShape = new Konva.Ellipse({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  radiusX: shape.radiusX,
                  radiusY: shape.radiusY,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'rectangle':
                konvaShape = new Konva.Rect({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  width: shape.width,
                  height: shape.height,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
              case 'triangle':
                konvaShape = new Konva.RegularPolygon({
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  sides: 3,
                  radius: shape.radius,
                  stroke: shape.stroke,
                  strokeWidth: shape.strokeWidth,
                  fill: shape.fill
                });
                break;
            }
            if (konvaShape) {
              layerRef.current.add(konvaShape);
            }
          });
        }
        
        // Force re-render
        layerRef.current.batchDraw();
      }
      
      // For PDFs, also restore page-specific state
      if (backgroundType === 'pdf' && state.pageLines && state.pageShapes) {
        setPageLines(state.pageLines);
        setPageShapes(state.pageShapes);
      }
      
      setHistoryStep(newStep);

      // Send redo action to peers for remote sync
      sendWhiteboardMsg('redo', { 
        state: {
          lines: state.lines, 
          shapes: state.shapes, 
          textAnnotations: state.textAnnotations || [],
          historyStep: newStep,
          history: history
        }
      });
      
      // Reset debounce after operations complete
      setTimeout(() => setIsUndoRedoProcessing(false), 100);
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
      
    log('INFO', 'Whiteboard', '📤 IDEAL FLOW: Delegating to parent for upload + processing', { fileName: file.name });
    
    // DELEGATE TO PARENT: Parent handles the complete ideal flow
    if (onImageChange) {
      // Parent will handle: uploadImage(file) → processImage(imageUrl)
      onImageChange(file);
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
    
    // KONVA-BASED CLEARING: Clear Konva objects as well
    if (layerRef.current) {
      layerRef.current.destroyChildren();
      layerRef.current.batchDraw();
      log('INFO', 'Whiteboard', 'Cleared Konva layer');
    }
  };

  // Function to set background directly (for remote peers) - REMOUNT-SAFE
  const setBackgroundDirectly = (type, url, dimensions = null) => {
    log('INFO', 'Whiteboard', '🖼️ UNIFIED: Setting background directly', { type, url, dimensions });
    
    if (type === 'pdf') {
      // Use unified PDF rendering for consistent dimensions
      log('INFO', 'Whiteboard', 'Using unified PDF rendering for remote PDF');
      renderPDF(url);
    } else if (type === 'arabic-alphabet') {
      // Handle Arabic alphabet background
      log('INFO', 'Whiteboard', '🕌 Setting Arabic alphabet background from remote', { dimensions });
      
      // Clear drawings when switching to Arabic alphabet
      clearAllDrawings();
      
      // Set background state
      setBackgroundFile('arabic-alphabet');
      setBackgroundType('arabic-alphabet');
      
      // CRITICAL: Use received dimensions to ensure both peers have identical Stage size
      // This ensures coordinates are synchronized between peers
      const finalDimensions = dimensions || { width: 1200, height: 800 };
      setBackgroundDimensions(finalDimensions);
      
      log('INFO', 'Whiteboard', '🕌 Arabic alphabet background set from remote', {
        dimensions: finalDimensions,
        note: 'Using synchronized dimensions for coordinate consistency'
      });
    } else {
      // For images, use REMOUNT-SAFE approach
      log('INFO', 'Whiteboard', '🖼️ UNIFIED: Setting image background safely');
      
      // Only clear drawings if there are any (avoid unnecessary state changes)
      if (lines.length > 0 || shapes.length > 0) {
        log('INFO', 'Whiteboard', 'Clearing existing drawings before image load');
      clearAllDrawings();
      }
      
      // Set background state (these are necessary for image display)
      setBackgroundFile(url);
      setBackgroundType(type);
      
      // Skip addToHistory() to avoid unnecessary state changes
      // History will be managed by the parent component
      log('INFO', 'Whiteboard', '🖼️ UNIFIED: Image background set without history update');
    }
    
    log('INFO', 'Whiteboard', '✅ UNIFIED: Background set directly', { type, url });
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
      backgroundFile,
      currentImageUrl,
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
        } else if (backgroundType === 'arabic-alphabet') {
      // For Arabic alphabet, use fixed dimensions to ensure coordinate synchronization
      containerStyle.width = `${finalWidth}px`;
      containerStyle.height = `${finalHeight}px`;
      containerStyle.minWidth = `${finalWidth}px`;
      containerStyle.minHeight = `${finalHeight}px`;
      containerStyle.maxWidth = `${finalWidth}px`; // Prevent resizing
      containerStyle.maxHeight = `${finalHeight}px`; // Prevent resizing
      
      log('DEBUG', 'Whiteboard', '📦 CONTAINER STYLE CALCULATION (Arabic Alphabet)', {
        backgroundType,
        finalWidth,
        finalHeight,
        backgroundDimensions,
        containerStyle: {
          width: containerStyle.width,
          height: containerStyle.height,
          minWidth: containerStyle.minWidth,
          minHeight: containerStyle.minHeight,
          maxWidth: containerStyle.maxWidth,
          maxHeight: containerStyle.maxHeight
        },
        note: 'Fixed dimensions (1200x800) for coordinate synchronization between peers'
      });
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
  // CRITICAL: Stage is positioned at top: 0, left: 0 relative to container
  // This ensures coordinates from getPointerPosition() are always relative to Stage's top-left corner (0,0)
  // regardless of where the container is positioned on the screen
  const stageStyle = useMemo(() => {
    // In click mode, allow pointer events to pass through to alphabet cards
    // But we still need to capture events for drawing outside alphabet area
    const pointerEvents = (backgroundType === 'arabic-alphabet' && isArabicAlphabetClickMode) 
      ? 'none' // Disable Stage events in click mode so alphabet cards can capture
      : 'all'; // Enable Stage events in drawing mode
    
    return {
      position: 'absolute',
      top: 0,  // Always at top of container
      left: 0, // Always at left of container
      zIndex: backgroundType === 'arabic-alphabet' && isArabicAlphabetClickMode ? 1 : 2, // Lower z-index in click mode so cards are above
      pointerEvents: pointerEvents,
      background: 'transparent'
    };
  }, [backgroundType, isArabicAlphabetClickMode]); // Recalculate when mode changes

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


  // Function to set Arabic alphabet as background
  const setArabicAlphabetBackground = useCallback((show, sendToPeers = false) => {
    log('INFO', 'Whiteboard', 'Setting Arabic alphabet background', { show, sendToPeers });
    if (show) {
      // Clear drawings when switching to Arabic alphabet
      clearAllDrawings();
      
      setBackgroundType('arabic-alphabet');
      setBackgroundFile('arabic-alphabet'); // Use a marker value
      // Set default dimensions for Arabic alphabet display
      setBackgroundDimensions({ width: 1200, height: 800 });
      
      // Send to peers if requested
      if (sendToPeers && webRTCProvider && selectedPeer) {
        try {
          log('INFO', 'Whiteboard', 'Sending Arabic alphabet to remote peer', { selectedPeer });
          
          const arabicAlphabetMessage = {
            action: 'background',
            background: {
              file: 'arabic-alphabet',
              type: 'arabic-alphabet',
              dimensions: { width: 1200, height: 800 } // Send fixed dimensions for synchronization
            },
            timestamp: Date.now()
          };
          
          webRTCProvider.sendWhiteboardMessage(selectedPeer, arabicAlphabetMessage);
          log('INFO', 'Whiteboard', 'Arabic alphabet sent to remote peer successfully');
        } catch (error) {
          log('ERROR', 'Whiteboard', 'Failed to send Arabic alphabet to remote peer', {
            error: error.message,
            selectedPeer
          });
        }
      }
    } else {
      setBackgroundFile(null);
      setBackgroundType(null);
    }
  }, [webRTCProvider, selectedPeer]);

  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    handleImageUpload: handleImageUpload,
    handleFileUpload: handleFileUpload,
    setBackgroundDirectly: setBackgroundDirectly,
    renderPDFUrl: renderPDFUrl,
    setArabicAlphabetBackground: setArabicAlphabetBackground,
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
        
        const totalEndTime = performance.now();
        log('INFO', 'Whiteboard', 'PDF upload and sharing completed successfully');
        log('DEBUG', 'Whiteboard', 'Total processing time', {
          totalTime: `${(totalEndTime - uploadStartTime).toFixed(2)}ms`,
          breakdown: {
            upload: `${(uploadEndTime - uploadStartTime).toFixed(2)}ms`,
            peerSend: webRTCProvider && selectedPeer ? `${(totalEndTime - uploadEndTime).toFixed(2)}ms` : 'N/A (no peer)'
          }
        });

        renderPDFUrl(pdfUrl, null, true);
        // // Clear image-specific state when switching to PDF
        // setBackgroundDimensions({ width: 0, height: 0 });
        
        // // Clear all drawings when switching to PDF
        // clearAllDrawings();
        
        // // Use unified PDF rendering function
        // log('INFO', 'Whiteboard', 'Using unified PDF rendering for local upload');
        // renderPDF(pdfUrl);
        
        // Send to remote peers (same as images)
        
      } catch (error) {
        log('ERROR', 'Whiteboard', 'PDF upload failed', error);
        // Fallback: set file directly (won't work with remote peers)
        log('WARN', 'Whiteboard', 'Falling back to direct file setting (no remote sharing)');
        setBackgroundFile(file);
        setBackgroundType('pdf');
        
        // Add to history with current state (preserve existing drawings)
        React.startTransition(() => {
        addToHistory();
        });
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
      React.startTransition(() => {
      addToHistory();
      });
      
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
    
    React.startTransition(() => {
    addToHistory();
    });
    
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

  

      // Image preloading handled by ImageRenderer component


  return (
    <>
      
      {/* Whiteboard Container - Drawing Surface Only */}
      <div 
        ref={containerRef}
        className={`whiteboard-container ${isScreenShareActive ? 'screen-share-overlay' : ''}`}
         style={containerStyle}
      >
        {/* Background Layer - PDF, Images, and Arabic Alphabet */}
        {backgroundFile && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              // CRITICAL: Background div must match Stage dimensions exactly for coordinate synchronization
              width: backgroundType === 'image' 
                ? `${backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200}px` 
                : backgroundType === 'arabic-alphabet'
                ? `${backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200}px` 
                : '100%',
              height: backgroundType === 'image' 
                ? `${backgroundDimensions.height > 0 ? backgroundDimensions.height : 800}px` 
                : backgroundType === 'arabic-alphabet'
                ? `${backgroundDimensions.height > 0 ? backgroundDimensions.height : 800}px` 
                : '100%',
              zIndex: 1,
              backgroundColor: backgroundType === 'arabic-alphabet' ? 'rgba(255, 255, 255, 0.85)' : '#f5f5f5',
              display: 'flex',
              justifyContent: 'flex-start', // Left-align instead of center
              alignItems: 'flex-start', // Start from top instead of center
              // CRITICAL: No padding for Arabic alphabet to ensure exact alignment with Stage
              // Padding would offset content and cause coordinate mismatch between peers
              padding: backgroundType === 'arabic-alphabet' ? '0px' : '10px',
              boxSizing: 'border-box', // Ensure padding is included in width/height calculation
              pointerEvents: 'none' // Allow mouse events to pass through to Stage
            }}
            onLoad={() => {
              const bgWidth = backgroundType === 'image' 
                ? (backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200)
                : backgroundType === 'arabic-alphabet'
                ? (backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200)
                : '100%';
              const bgHeight = backgroundType === 'image' 
                ? (backgroundDimensions.height > 0 ? backgroundDimensions.height : 800)
                : backgroundType === 'arabic-alphabet'
                ? (backgroundDimensions.height > 0 ? backgroundDimensions.height : 800)
                : '100%';
              
              log('INFO', 'Whiteboard', 'Background div rendered', {
                backgroundType,
                backgroundDimensions,
                calculatedWidth: bgWidth,
                calculatedHeight: bgHeight,
                finalWidth,
                finalHeight,
                stageWidth: backgroundType === 'arabic-alphabet' 
                  ? (backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200)
                  : 'N/A',
                stageHeight: backgroundType === 'arabic-alphabet'
                  ? (backgroundDimensions.height > 0 ? backgroundDimensions.height : 800)
                  : 'N/A',
                coordinateSync: backgroundType === 'arabic-alphabet' 
                  ? 'Background div and Stage must match exactly (1200x800)'
                  : 'Standard sizing',
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
              containerWidth={1200}
              isMobile={isMobile}
              scale={1}
            />
            ) : backgroundType === 'arabic-alphabet' ? (
              // Arabic alphabet overlay - rendered in background
              // In click mode: cards are above Stage, container allows pointer events
              // In drawing mode: cards are below Stage, container blocks pointer events
              <div style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%', 
                height: '100%',
                zIndex: isArabicAlphabetClickMode ? 3 : 1, // Above Stage in click mode, below in drawing mode
                pointerEvents: isArabicAlphabetClickMode ? 'auto' : 'none' // Allow clicks in click mode, block in drawing mode
              }}>
                <ArabicAlphabetOverlay
                  ref={arabicAlphabetOverlayRef}
                  isVisible={true}
                  onClose={() => {
                    setBackgroundFile(null);
                    setBackgroundType(null);
                    setArabicAlphabetShuffleOrder(null);
                    setIsArabicAlphabetClickMode(true); // Reset to click mode
                  }}
                  shuffleOrder={arabicAlphabetShuffleOrder}
                  onShuffleOrderChange={(shuffleOrder) => {
                    console.log('[Whiteboard] Arabic alphabet shuffle order changed', { 
                      shuffleOrder,
                      isNull: shuffleOrder === null,
                      isArray: Array.isArray(shuffleOrder),
                      length: Array.isArray(shuffleOrder) ? shuffleOrder.length : undefined,
                      timestamp: Date.now()
                    });
                    setArabicAlphabetShuffleOrder(shuffleOrder);
                    sendWhiteboardMsg('arabicAlphabetShuffle', { shuffleOrder });
                  }}
                  onModeChange={(isClickMode) => {
                    console.log('[Whiteboard] Arabic alphabet mode changed', { 
                      isClickMode,
                      mode: isClickMode ? 'Click Mode' : 'Drawing Mode',
                      timestamp: Date.now()
                    });
                    setIsArabicAlphabetClickMode(isClickMode);
                  }}
                  onCharacterClick={(characterIndex) => {
                    console.log('[Whiteboard] Arabic alphabet character clicked', { 
                      characterIndex,
                      timestamp: Date.now(),
                      hasWebRTCProvider: !!webRTCProviderRef.current,
                      hasSelectedPeer: !!selectedPeerRef.current
                    });
                    // Send character click to peer
                    if (webRTCProviderRef.current && selectedPeerRef.current) {
                      sendWhiteboardMsg('arabicAlphabetCharacterClick', { characterIndex });
                      log('INFO', 'Whiteboard', '🔊 SENT ARABIC ALPHABET CHARACTER CLICK to peer', { 
                        characterIndex,
                        timestamp: Date.now()
                      });
                    } else {
                      log('WARN', 'Whiteboard', '🔊 Cannot send character click - no peer connection', { 
                        characterIndex,
                        hasWebRTCProvider: !!webRTCProviderRef.current,
                        hasSelectedPeer: !!selectedPeerRef.current
                      });
                    }
                  }}
                />
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {/* ImageRenderer handles ALL image logic - parent only needs dimensions for canvas matching */}
                {backgroundType === 'image' && backgroundFile && (
                  <ImageRenderer
                    imageUrl={backgroundFile}
                    onDimensionsChange={(dimensions) => {
                      console.log('🔍 DEBUG: Whiteboard - Image dimensions received for canvas matching', {
                        dimensions,
                        timestamp: Date.now()
                      });
                      // CONDITIONAL UPDATE: Only update if dimensions actually changed (REDUCES REMOUNTS)
                      if (backgroundDimensions.width !== dimensions.width || backgroundDimensions.height !== dimensions.height) {
                        console.log('🔍 DEBUG: Whiteboard - Dimensions changed, updating canvas');
                        setBackgroundDimensions(dimensions);
                          } else {
                        console.log('🔍 DEBUG: Whiteboard - Dimensions unchanged, skipping update');
                      }
                    }}
                    containerWidth={1200}
                    containerHeight={800}
                  />
                )}
                  </div>
                )}
          </div>
        )}

        {/* Selected Content Background Layer - Exclude Arabic alphabet (handled by overlay) */}
        {selectedContent && !backgroundFile && selectedContent.type !== 'arabic-alphabet' && (
                          <div 
                      style={{
              position: 'absolute',
              top: 0,
              left: 0,
                              width: '100%',
              height: '100%',
              zIndex: 1,
              backgroundColor: '#ffffff',
              padding: '20px',
              pointerEvents: 'none', // Allow mouse events to pass through to Stage
              overflow: 'auto'
            }}
          >
            <div className="content-background">
              <div className="content-header">
                <h3 style={{ margin: '0 0 16px 0', color: '#333', fontSize: '18px' }}>
                  📚 {selectedContent.name}
                </h3>
                  </div>
              <div className="content-text" style={{ 
                fontSize: '14px', 
                lineHeight: '1.6', 
                color: '#555',
                maxHeight: 'calc(100% - 60px)',
                overflow: 'auto'
              }}>
                {selectedContent.content}
                    </div>
                </div>
          </div>
        )}

        {/* Drawing Layer - MUST be on top for drawing to work */}
        <Stage
          width={(() => {
            const stageWidth = isScreenShareActive && screenShareDimensions.width > 0 
              ? screenShareDimensions.width 
              : backgroundType === 'pdf' 
                ? backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200  // Use PDF width for left-aligned layout
              : backgroundType === 'arabic-alphabet'
                ? backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200  // Fixed width for Arabic alphabet
              : backgroundDimensions.width > 0 
                ? backgroundDimensions.width 
                : currentContainerSize.width;
            log('DEBUG', 'Whiteboard', 'Stage width set', {
              isScreenShareActive,
              screenShareDimensions,
              backgroundDimensions,
              backgroundType,
              currentContainerSize,
              finalStageWidth: stageWidth,
              note: backgroundType === 'arabic-alphabet' 
                ? 'Arabic alphabet: Using fixed 1200px width for coordinate synchronization'
                : 'Standard width calculation'
            });
            return stageWidth;
          })()}
          height={(() => {
            const stageHeight = isScreenShareActive && screenShareDimensions.height > 0 
              ? screenShareDimensions.height 
              : backgroundType === 'pdf' 
                ? backgroundDimensions.height > 0 ? backgroundDimensions.height : 800  // Use PDF height for drawing area
              : backgroundType === 'arabic-alphabet'
                ? backgroundDimensions.height > 0 ? backgroundDimensions.height : 800  // Fixed height for Arabic alphabet
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
              note: backgroundType === 'arabic-alphabet'
                ? 'Arabic alphabet: Using fixed 800px height for coordinate synchronization'
                : 'Stage height should match container height for PDF/Arabic alphabet drawing',
              coordinateSystem: 'All coordinates are relative to Stage top-left (0,0)'
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
              isArabicAlphabetClickMode,
              timestamp: Date.now()
            });
            // handleMouseDown will check if drawing should be disabled over alphabet area
            handleMouseDown(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onDblClick={handleDoubleClick}
          onContextMenu={handleRightClick}
          ref={stageRef}
          // Touch event handlers for mobile devices
            onTouchStart={(e) => {
              // Access the native event object via the 'evt' property
              const nativeEvent = e.evt;
              
              // Check if we're in drawing mode for Arabic alphabet (not click mode)
              const isDrawingMode = backgroundType === 'arabic-alphabet' && !isArabicAlphabetClickMode;
              
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
                  isDrawingMode,
                  timestamp: Date.now()
                });
              }

              if (isMobileDrawingMode || isDrawingMode) {
                log('INFO', 'Whiteboard', '👆 STAGE TOUCH START (Drawing Mode)', {
                  actualTool,
                  isDrawing,
                  touchCount: nativeEvent.touches?.length || 0,
                  isMobileDrawingMode,
                  isDrawingMode,
                  timestamp: Date.now()
                });
                
                // Convert touch to mouse event FIRST before preventing default
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
                    preventDefault: () => { 
                      if (nativeEvent && nativeEvent.preventDefault) nativeEvent.preventDefault();
                      if (e.preventDefault) e.preventDefault(); 
                    },
                    stopPropagation: () => { 
                      if (nativeEvent && nativeEvent.stopPropagation) nativeEvent.stopPropagation();
                      if (e.stopPropagation) e.stopPropagation(); 
                    }
                  };
                  
                  // CRITICAL: Prevent default AFTER creating the event to stop scrolling but allow drawing
                  // This prevents page scrolling while still allowing the drawing handler to process the event
                  if (nativeEvent && nativeEvent.preventDefault) {
                    nativeEvent.preventDefault();
                  }
                  // Also prevent on Konva event wrapper
                  if (e.preventDefault) e.preventDefault();
                  if (e.stopPropagation) e.stopPropagation();
                  
                  // Use the same mouse handler - it will check if drawing should be disabled over alphabet area
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
            
            // Check if we're in drawing mode for Arabic alphabet (not click mode)
            const isDrawingMode = backgroundType === 'arabic-alphabet' && !isArabicAlphabetClickMode;
            
            // Debug the actual touch event structure only when drawing is active
            if ((isMobileDrawingMode || isDrawingMode) && (isDrawing || drawingTool !== 'select')) {
              log('INFO', 'Whiteboard', '👆 TOUCH MOVE DEBUG (Drawing Active)', {
                hasNativeTouches: !!nativeEvent.touches,
                nativeTouchesLength: nativeEvent.touches?.length,
                hasNativeChangedTouches: !!nativeEvent.changedTouches,
                nativeChangedTouchesLength: nativeEvent.changedTouches?.length,
                eventType: e.type,
                isMobileDrawingMode,
                isDrawingMode,
                isDrawing,
                drawingTool,
                timestamp: Date.now()
              });
            }

            // Only log general touch move when drawing is active
            if ((isMobileDrawingMode || isDrawingMode) && (isDrawing || drawingTool !== 'select')) {
              log('INFO', 'Whiteboard', '👆 STAGE TOUCH MOVE (Drawing Active)', {
                isMobileDrawingMode,
                isDrawingMode,
                touchCount: nativeEvent.touches?.length || 0,
                hasTouch: !!nativeEvent.touches?.[0],
                isDrawing,
                drawingTool,
                timestamp: Date.now()
              });
            }

            if (isMobileDrawingMode || isDrawingMode) {
              // Convert touch to mouse event FIRST
              const touch = nativeEvent.touches?.[0];
              if (touch) {
                log('INFO', 'Whiteboard', '👆 TOUCH MOVE - CONVERTING TO MOUSE', {
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
                  preventDefault: () => { 
                    if (nativeEvent && nativeEvent.preventDefault) nativeEvent.preventDefault();
                    if (e.preventDefault) e.preventDefault(); 
                  },
                  stopPropagation: () => { 
                    if (nativeEvent && nativeEvent.stopPropagation) nativeEvent.stopPropagation();
                    if (e.stopPropagation) e.stopPropagation(); 
                  }
                };
                
                // CRITICAL: Prevent default AFTER creating the event to stop scrolling but allow drawing
                if (nativeEvent && nativeEvent.preventDefault) {
                  nativeEvent.preventDefault();
                }
                // Also prevent on Konva event wrapper
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                
                log('INFO', 'Whiteboard', '👆 STAGE TOUCH MOVE (Drawing Mode)', {
                  actualTool,
                  isDrawing,
                  touchCount: nativeEvent.touches?.length || 0,
                  isMobileDrawingMode,
                  isDrawingMode,
                  timestamp: Date.now()
                });
                
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
            
            // Check if we're in drawing mode for Arabic alphabet (not click mode)
            const isDrawingMode = backgroundType === 'arabic-alphabet' && !isArabicAlphabetClickMode;
            
            if (isMobileDrawingMode || isDrawingMode) {
              // Convert touch to mouse event FIRST
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
                  preventDefault: () => { 
                    if (nativeEvent && nativeEvent.preventDefault) nativeEvent.preventDefault();
                    if (e.preventDefault) e.preventDefault(); 
                  },
                  stopPropagation: () => { 
                    if (nativeEvent && nativeEvent.stopPropagation) nativeEvent.stopPropagation();
                    if (e.stopPropagation) e.stopPropagation(); 
                  }
                };
                
                // CRITICAL: Prevent default AFTER creating the event to stop scrolling but allow drawing
                if (nativeEvent && nativeEvent.preventDefault) {
                  nativeEvent.preventDefault();
                }
                // Also prevent on Konva event wrapper
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                
                log('INFO', 'Whiteboard', '👆 STAGE TOUCH END (Drawing Mode)', {
                  actualTool,
                  isDrawing,
                  touchCount: nativeEvent.touches?.length || 0,
                  isMobileDrawingMode,
                  isDrawingMode,
                  timestamp: Date.now()
                });
                
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
            <Layer ref={layerRef}>
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

              {/* REMOVED: Shapes are now rendered directly via Konva objects, not React state */}
              {/* {shapes.map((shape, index) => {
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
              })} */}

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
      
      {/* Text Editing Overlay - For editing persistent text annotations */}
      {editingTextId && (
        <div
          style={{
            position: 'absolute',
            left: editingTextPosition.x,
            top: editingTextPosition.y,
            zIndex: 9999, // Higher z-index to appear above all drawings
            background: 'transparent', // Completely transparent background
            border: '2px solid #007bff',
            borderRadius: '4px',
            padding: '4px 8px',
            minWidth: '200px',
            boxShadow: 'none', // Remove shadow for cleaner look
            backdropFilter: 'none' // No blur effect
          }}
        >
          <input
            type="text"
            defaultValue={editingTextValueRef.current}
            ref={textInputRef}
            onChange={(e) => {
              // OPTIMIZATION: Use ref instead of state to avoid remounts during typing
              editingTextValueRef.current = e.target.value;
              
              // Auto-expand width based on content
              const input = e.target;
              const text = e.target.value || e.target.placeholder;
              
              // Create a temporary canvas to measure text width accurately
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              context.font = '16px Arial';
              const textWidth = context.measureText(text).width;
              
              // Expand by 20px when reaching end, with minimum width
              const newWidth = Math.max(200, textWidth + 40); // 40px for padding and cursor
              input.style.width = `${newWidth}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleTextInputComplete(editingTextValueRef.current);
              } else if (e.key === 'Escape') {
                handleTextInputCancel();
              }
            }}
            onFocus={(e) => {
              // Highlight the input box when focused - keep transparent
              e.target.parentElement.style.background = 'transparent';
              e.target.parentElement.style.borderColor = '#0056b3';
            }}
            onBlur={(e) => {
              // Reset background when not focused - keep transparent
              e.target.parentElement.style.background = 'transparent';
              e.target.parentElement.style.borderColor = '#007bff';
              
              if (editingTextValueRef.current.trim()) {
                handleTextInputComplete(editingTextValueRef.current);
              } else {
                handleTextInputCancel();
              }
            }}
            autoFocus
            placeholder="Type text here..."
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              fontFamily: 'Arial',
              width: '200px', // Start with minimum width
              background: 'transparent',
              color: '#333',
              transition: 'width 0.1s ease' // Smooth width transition
            }}
          />
        </div>
      )}
    </>
  );
});

export default Whiteboard; 