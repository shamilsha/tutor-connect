import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Circle, Ellipse, Rect, Transformer, Group, Text } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import { Document, Page } from 'react-pdf';
import '../styles/pdf.css';
import '../styles/Whiteboard.css';
import { pdfjs } from 'react-pdf';
import { WebRTCProvider } from '../services/WebRTCProvider';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const Whiteboard = ({ 
  userId, 
  username, 
  screenShareStream = null, 
  isScreenShareActive = false, 
  onClose = null, 
  onBackgroundCleared = null, 
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
}) => {
  console.log('Whiteboard mounted with:', { userId, username, screenShareStream: !!screenShareStream, isScreenShareActive });
  
  // Drawing state
  const [lines, setLines] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  
  
  const [selectedShape, setSelectedShape] = useState(null);
  const [history, setHistory] = useState([{ 
    lines: [], 
    shapes: [], 
    historyStep: 0 
  }]);
  const [historyStep, setHistoryStep] = useState(0);
  
  // Log current state after all state variables are declared
  console.log('[Whiteboard] 🔍 Current state on mount:', { lines: lines.length, shapes: shapes.length, historyStep, historyLength: history.length });
  
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
  const [containerSize, setContainerSize] = useState({ width: 320, height: 400 }); // Mobile-friendly default size
  const [pageShapes, setPageShapes] = useState({});

  // Debug flag to control verbose logging
  const DEBUG_MOUSE_MOVEMENT = false; // Set to true to enable mouse movement logs

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


  // WebRTC setup
  useEffect(() => {
    if (webRTCProvider && selectedPeer) {
      console.log('[Whiteboard] 🎨 Setting up data channel communication with peer:', selectedPeer);
      webRTCProviderRef.current = webRTCProvider;
      selectedPeerRef.current = selectedPeer;

      const handleWhiteboardMessage = (event) => {
        const { data } = event;
        console.log('[Whiteboard] 📨 Received whiteboard message:', data);
        handleRemoteWhiteboardUpdate(data);
      };

      webRTCProvider.addEventListener('whiteboard', handleWhiteboardMessage);

    return () => {
        webRTCProvider.removeEventListener('whiteboard', handleWhiteboardMessage);
    };
    }
  }, [webRTCProvider, selectedPeer]);

  // Container size tracking
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Ensure minimum size for drawing (mobile-friendly)
        const isMobile = window.innerWidth < 768;
        const minWidth = isMobile ? 320 : 800;
        const minHeight = isMobile ? 400 : 600;
        const width = Math.max(rect.width, minWidth);
        const height = Math.max(rect.height, minHeight);
        
        setContainerSize({ width, height });
        console.log('[Whiteboard] 📏 Container size updated:', { 
          originalWidth: rect.width, 
          originalHeight: rect.height,
          finalWidth: width, 
          finalHeight: height, 
          isScreenShareActive 
        });
      }
    };

    // Add a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateSize, 100);
    window.addEventListener('resize', updateSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateSize);
    };
  }, [isScreenShareActive]); // Also update when screen share state changes

  // Clear background when screen sharing becomes active
  useEffect(() => {
    if (isScreenShareActive && backgroundFile) {
      console.log('[Whiteboard] 🖥️ Screen sharing active, clearing background file');
      setBackgroundFile(null);
      setBackgroundType(null);
      if (onBackgroundCleared) {
        onBackgroundCleared();
      }
    }
  }, [isScreenShareActive, backgroundFile, onBackgroundCleared]);

  // Handle remote whiteboard updates
  const handleRemoteWhiteboardUpdate = (data) => {
    console.log('[Whiteboard] 📨 Processing remote whiteboard update:', data);
    
    switch (data.action) {
      case 'draw':
        if (data.shape) {
          if (data.shape.tool === 'pen') {
            setLines(prev => [...prev, data.shape]);
          } else {
            setShapes(prev => [...prev, data.shape]);
          }
        }
        break;
      case 'update':
        if (data.shape) {
          if (data.shape.tool === 'pen') {
            setLines(prev => prev.map(line => line.id === data.shape.id ? data.shape : line));
          } else {
            setShapes(prev => prev.map(shape => shape.id === data.shape.id ? data.shape : shape));
          }
        }
        break;
      case 'erase':
        if (data.shape) {
          if (data.shape.tool === 'pen') {
            setLines(prev => prev.filter(line => line.id !== data.shape.id));
          } else {
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
      default:
        console.log('[Whiteboard] Unknown action:', data.action);
    }
  };

  // Generic function to send whiteboard messages via WebRTC data channel
  const sendWhiteboardMsg = async (action, data = {}) => {
    if (!webRTCProviderRef.current || !selectedPeerRef.current) {
      console.log('[Whiteboard] No datachannel available, skipping message:', action);
      return;
    }

    // Check if data channel is ready by attempting to send a test message
    // The WebRTCProvider's sendMessage method already handles data channel readiness checks

    try {
      const message = {
        action,
        userId,
        username,
        color: currentColor
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
      console.log('[Whiteboard] 🎨 Sending whiteboard message via data channel:', {
        action,
        userId,
        username,
        stack: stack?.split('\n').slice(1, 4).join('\n') // Show first 3 lines of stack
      });
      
      await webRTCProviderRef.current.sendWhiteboardMessage(selectedPeerRef.current, message);
    } catch (error) {
      console.error('[Whiteboard] Error sending whiteboard message:', error);
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
      
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Native event coordinates:', { clientX: nativeX, clientY: nativeY });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Stage rect:', { left: stageRect.left, top: stageRect.top });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Stage container rect:', { left: stageContainerRect.left, top: stageContainerRect.top });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Stage transform:', stageTransform);
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Stage scale:', stageScale);
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Calculated offset:', { offsetX, offsetY });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Konva point vs offset:', { konvaX: point.x, konvaY: point.y, offsetX, offsetY });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Coordinate difference:', { diffX: point.x - offsetX, diffY: point.y - offsetY });
      console.log('[Whiteboard] 🖱️ MOUSE MOVE - Using corrected coordinates:', { correctedX, correctedY, offsetX, offsetY });
    }

    // Only send cursor position when a tool is selected
    if (currentTool) {
      // Adjust coordinates for scroll position only for cursor display
      const scrollContainer = containerRef.current;
      const adjustedPoint = { ...point };
      if (scrollContainer) {
        adjustedPoint.x += scrollContainer.scrollLeft;
        adjustedPoint.y += scrollContainer.scrollTop;
      }
      sendWhiteboardMsg('cursor', { position: adjustedPoint });
    }

    if (!isDrawing) return;

    if (currentTool === 'pen') {
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
      
      const updatedShapes = shapes.map(shape => {
        if (shape.id === selectedShape.id) {
          switch (shape.type) {
            case 'line':
              if (DEBUG_MOUSE_MOVEMENT) {
                console.log(`[Line Drawing] Mouse: (${correctedX}, ${correctedY}), Start: (${startPoint.x}, ${startPoint.y}), Delta: (${dx}, ${dy})`);
              }
              return {
                ...shape,
                points: [0, 0, dx, dy]  // Use relative coordinates from shape position
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
      // Send shape update via WebRTC data channel
      sendWhiteboardMsg('update', { shape: updatedShapes.find(s => s.id === selectedShape.id) });
    }
  };

  const handleMouseDown = (e) => {
    console.log('[Whiteboard] 🖱️ MOUSE DOWN - Current state:', {
      tool: currentTool,
      isDrawing,
      selectedShape: selectedShape?.id
    });

    if (!currentTool) return;

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
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Starting drawing with tool:', currentTool, 'at position:', point);
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Stage dimensions:', { width: stage.width(), height: stage.height() });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Container size:', containerSize);
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Native event coordinates:', { clientX: nativeX, clientY: nativeY });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Stage rect:', { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Stage container rect:', { left: stageContainerRect.left, top: stageContainerRect.top, width: stageContainerRect.width, height: stageContainerRect.height });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Stage transform:', stageTransform);
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Stage scale:', stageScale);
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Calculated offset:', { offsetX, offsetY });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Konva point vs offset:', { konvaX: point.x, konvaY: point.y, offsetX, offsetY });
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Coordinate difference:', { diffX: point.x - offsetX, diffY: point.y - offsetY });
    }

    // Calculate corrected coordinates to account for Stage positioning offset
    // The Stage is positioned relative to its container, but we want coordinates relative to the visual drawing area
    const correctedX = offsetX; // Use calculated offset for X coordinate
    const correctedY = offsetY; // Use calculated offset for Y coordinate
    
    if (DEBUG_MOUSE_MOVEMENT) {
      console.log('[Whiteboard] 🖱️ MOUSE DOWN - Using corrected coordinates:', { correctedX, correctedY, offsetX, offsetY });
    }

    if (currentTool === 'pen') {
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
      setLines(prev => [...prev, newLine]);
      setIsDrawing(true);
      // Send line creation via WebRTC data channel
      sendWhiteboardMsg('draw', { shape: newLine });
    } else {
      const newShape = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: currentTool,
        type: currentTool,
        x: correctedX,
        y: correctedY,
        stroke: currentColor,
        strokeWidth: 2,
        fill: defaultFill ? currentColor : 'transparent'
      };

      console.log('Creating new shape:', newShape);

      // Set specific properties based on shape type
      switch (currentTool) {
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

      setShapes(prev => [...prev, newShape]);
      setSelectedShape(newShape);
      setIsDrawing(true);
      startPointRef.current = { x: correctedX, y: correctedY };
      if (DEBUG_MOUSE_MOVEMENT) {
        console.log('[Whiteboard] 🖱️ MOUSE DOWN - Set startPoint to:', { x: correctedX, y: correctedY });
      }
      
      // Send shape creation via WebRTC data channel
      sendWhiteboardMsg('draw', { shape: newShape });
    }
  };

  const handleMouseUp = (e) => {
    if (DEBUG_MOUSE_MOVEMENT) {
      console.log('[Whiteboard] 🖱️ MOUSE UP - Current state:', {
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
      console.log('[Whiteboard] 🖱️ MOUSE UP - Set isDrawing=false, selectedShape=null');
    }
    startPointRef.current = null;
    if (DEBUG_MOUSE_MOVEMENT) {
      console.log('[Whiteboard] 🖱️ MOUSE UP - Cleared startPoint');
    }
  };

  const handleClick = (e) => {
    if (DEBUG_MOUSE_MOVEMENT) {
      console.log('[Whiteboard] 🖱️ CLICK - Current state:', {
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
        console.log('[Whiteboard] 🖱️ CLICK - Tool is active, returning early. Tool:', currentTool);
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
    console.log('[Whiteboard] Adding to history:', { 
      currentHistoryLength: history.length, 
      currentHistoryStep: historyStep,
      linesCount: currentLines.length,
      shapesCount: currentShapes.length
    });
    
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push({ lines: [...currentLines], shapes: [...currentShapes] });
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    console.log('[Whiteboard] History updated:', { 
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
        console.log('[Whiteboard] 🎨 Adding to history after drawing completion');
        addToHistory();
      }
    }
  }, [isDrawing]); // Only depend on isDrawing, not lines/shapes


  const handleUndo = () => {
    console.log('[Whiteboard] 🎨 Undo function called', { historyStep, historyLength: history.length });
    console.log('[Whiteboard] 🔍 Current history:', history);
    
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const prevState = history[newStep];
      console.log('[Whiteboard] Undoing to step:', newStep, 'state:', prevState);
      console.log('[Whiteboard] 🔍 Current lines before undo:', lines.length);
      console.log('[Whiteboard] 🔍 Current shapes before undo:', shapes.length);
      console.log('[Whiteboard] 🔍 New lines after undo:', prevState.lines.length);
      console.log('[Whiteboard] 🔍 New shapes after undo:', prevState.shapes.length);
      
      // Simple approach - just update state directly
      setLines(prevState.lines);
      setShapes(prevState.shapes);
      setHistoryStep(newStep);

      console.log('[Whiteboard] ✅ State updates called - lines and shapes should be updated');

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
      console.log('[Whiteboard] Cannot undo - already at first step');
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      const state = history[newStep];
      
      // Simple approach - just update state directly
      setLines(state.lines);
      setShapes(state.shapes);
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
    console.log('[Whiteboard] Setting up undo ref:', { onUndo, hasCurrent: onUndo?.current !== undefined });
    if (onUndo) {
      onUndo.current = handleUndo;
      console.log('[Whiteboard] Undo function set in ref');
    }
  }, [onUndo, handleUndo]);

  useEffect(() => {
    console.log('[Whiteboard] Setting up redo ref:', { onRedo, hasCurrent: onRedo?.current !== undefined });
    if (onRedo) {
      onRedo.current = handleRedo;
      console.log('[Whiteboard] Redo function set in ref');
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


  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setBackgroundFile(e.target.result);
        setBackgroundType('image');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setBackgroundFile(file);
      setBackgroundType('pdf');
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleClear = () => {
      setLines([]);
        setShapes([]);
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

  console.log('[Whiteboard] 🎨 Rendering whiteboard with toolbar:', {
            userId,
            username,
    isScreenShareActive,
    hasBackgroundFile: !!backgroundFile,
    backgroundType,
    containerSize
  });

  // Debug transparency issues
  console.log('[Whiteboard] 🔍 TRANSPARENCY DEBUG:', {
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
      console.log('[Whiteboard] 🔍 COMPUTED STYLES DEBUG:', {
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
      console.log('[Whiteboard] 🔍 CHILD ELEMENTS DEBUG:', {
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
        console.log('[Whiteboard] 🔍 WHITEBOARD CONTAINER DEBUG:', {
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
        className={`whiteboard-container ${isScreenShareActive ? 'screen-share-overlay' : ''}`}
      style={{
        position: isScreenShareActive ? 'absolute' : 'relative',
        top: isScreenShareActive ? '0' : 'auto',
        left: isScreenShareActive ? '0' : 'auto',
        width: '100%',
        height: isScreenShareActive ? '100%' : 'auto',
        zIndex: isScreenShareActive ? 2 : 1,
        backgroundColor: isScreenShareActive ? 'transparent' : 'rgba(230, 243, 255, 0.9)',
        border: isScreenShareActive ? 'none' : '4px solid #8B4513',
        pointerEvents: isScreenShareActive ? 'all' : 'auto'
      }}
      >
        <div 
          ref={containerRef}
          className="whiteboard-scroll-container"
          style={{ 
            position: 'relative',
            width: '100%',
            height: isScreenShareActive ? '100%' : 'auto',
            overflowY: isScreenShareActive ? 'hidden' : 'auto',
            overflowX: 'hidden',
            backgroundColor: isScreenShareActive ? 'transparent' : '#f0f8ff',
            border: isScreenShareActive ? 'none' : '2px solid #32CD32',
            pointerEvents: isScreenShareActive ? 'all' : 'auto'
          }}
        >
          {/* Drawing Surface Container - Overlay screen share when active */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: isScreenShareActive ? '100%' : 'auto',
            backgroundColor: isScreenShareActive ? 'transparent' : 'transparent',
            border: isScreenShareActive ? 'none' : '2px solid #FF6B35',
            pointerEvents: isScreenShareActive ? 'all' : 'auto'
          }}>
          {/* Background Layer - PDF/Image only (Screen share is handled by ScreenShareWindow component) */}
          {backgroundFile && !isScreenShareActive && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                zIndex: 1,
                backgroundColor: '#f5f5f5',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
                  {backgroundType === 'image' ? (
                    <img
                      src={backgroundFile}
                      alt="Background"
                      style={{
                        maxWidth: '100%',
                        height: 'auto',
                        objectFit: 'contain'
                      }}
                    />
                  ) : (
                    <Document
                      file={backgroundFile}
                      onLoadSuccess={({ numPages }) => {
                        console.log('PDF loaded successfully with', numPages, 'pages');
                        setPdfPages(numPages);
                      }}
                      onLoadError={(error) => {
                        console.error('Error loading PDF:', error);
                      }}
                      loading={<div>Loading PDF...</div>}
                    >
                      <Page
                        pageNumber={currentPage}
                        width={containerSize.width * 0.9}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        error={<div>Error loading page!</div>}
                        loading={<div>Loading page...</div>}
                      />
                    </Document>
              )}
            </div>
          )}

          {/* Drawing Layer */}
          <Stage
            width={containerSize.width}
            height={containerSize.height}
            style={{
              position: 'relative',
              top: 0,
              left: 0,
              zIndex: 2,
              pointerEvents: 'all',
              background: isScreenShareActive ? 'transparent' : 'transparent'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
          >
            <Layer>
              {/* Render lines */}
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

              {/* Render shapes */}
              {shapes.map((shape, index) => {
                const commonProps = {
                  key: shape.id || index,
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
                    return (
                      <Line
                        {...commonProps}
                        points={shape.points}
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

              {/* Render cursors */}
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
        </div>
      </div>
      
    </>
  );
};

export default Whiteboard; 