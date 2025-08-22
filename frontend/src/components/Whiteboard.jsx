import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Circle, Ellipse, Rect, Transformer, Group, Text } from 'react-konva';
import { FaEraser, FaPencilAlt, FaCircle, FaSquare, FaDrawPolygon, FaUndo, FaRedo, FaFill } from 'react-icons/fa';
import { BsTriangleFill, BsSlashLg } from 'react-icons/bs';
import { TbTriangleInverted, TbTriangleOff } from 'react-icons/tb';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { v4 as uuidv4 } from 'uuid';
import { Document, Page } from 'react-pdf/dist/esm/entry.webpack';
import '../styles/pdf.css';
import { pdfjs } from 'react-pdf';
import axios from 'axios';
import WebSocketProvider from '../contexts/WebSocketProvider';
import SignalingService from '../services/SignalingService';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const Whiteboard = ({ userId, username }) => {
  console.log('Whiteboard mounted with:', { userId, username });
  
  // Remove unused state variables
  const [tool, setTool] = useState(null);
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
  const [defaultFill, setDefaultFill] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('#000000');
  const [triangleType, setTriangleType] = useState('equilateral');
  const [userColor, setUserColor] = useState(strokeColor);
  const [cursors, setCursors] = useState(new Map());
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundType, setBackgroundType] = useState(null);
  const [pdfPages, setPdfPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pageShapes, setPageShapes] = useState({});  // { pageNumber: { shapes: [], lines: [] } }

  // Keep only used refs
  const startPointRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Move all useEffect hooks to the top, before any conditional returns
  // Clean up URLs when component unmounts or changes
  useEffect(() => {
    return () => {
      if (backgroundFile) {
        URL.revokeObjectURL(backgroundFile);
      }
    };
  }, [backgroundFile]);

  // WebSocket connection effect
  useEffect(() => {
    const wsProvider = WebSocketProvider.getInstance(userId);
    
    // Connect if not already connected
    if (!wsProvider.isConnected) {
        wsProvider.connect().catch(error => {
            console.error('Failed to connect to WebSocket:', error);
        });
    }

    // Subscribe to whiteboard updates
    const whiteboardSubscription = wsProvider.subscribe('/topic/whiteboard', (update) => {
        if (update.userId !== userId) {
            console.log('Processing remote update:', update);
            handleRemoteUpdate(update);
        } else {
            console.log('Ignoring own message');
        }
    });

    // Subscribe to cursor updates
    const cursorSubscription = wsProvider.subscribe('/topic/cursors', (cursorUpdate) => {
        if (cursorUpdate.userId !== userId) {
            updateRemoteCursor(cursorUpdate);
        }
    });

    // Cleanup subscriptions on unmount
    return () => {
        wsProvider.unsubscribe(whiteboardSubscription);
        wsProvider.unsubscribe(cursorSubscription);
    };
  }, [userId]);

  // Container resize effect
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Validation check after all hooks
  if (!userId || !username) {
    console.error('Missing required props:', { userId, username });
    return null;
  }

  // Send updates to other users
  const sendUpdate = (action, shape) => {
    if (!wsProvider?.connected) {
      console.error('Cannot send update: WebSocket not connected');
      return;
    }

    try {
      const message = {
        userId,
        username,
        action,
        shape: {
          ...shape,
          type: shape.type || shape.tool,
          tool: shape.tool || shape.type
        },
        color: userColor
      };
      console.log('Sending update:', JSON.stringify(message, null, 2));
      wsProvider.publish({
        destination: '/app/whiteboard',
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('Error sending update:', error);
    }
  };

  // Update cursor positions
  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    // Send cursor position
    if (wsProvider?.connected) {
      wsProvider.publish({
        destination: '/topic/cursors',
        body: JSON.stringify({
          userId,
          username,
          position: point,
          color: userColor
        })
      });
    }

    if (!isDrawing) return;

    if (tool === 'pen') {
      let lastLine = lines[lines.length - 1];
      const newLastLine = {
        ...lastLine,
        points: [...lastLine.points, point.x, point.y]
      };
      setLines(prev => [...prev.slice(0, -1), newLastLine]);
      // Send line update
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'update',
            shape: newLastLine
          })
        });
      }
    } else if (selectedShape) {
      const startPoint = startPointRef.current;
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      
      const updatedShapes = shapes.map(shape => {
        if (shape.id === selectedShape.id) {
          switch (shape.type) {
            case 'line':
              return {
                ...shape,
                x: startPoint.x,
                y: startPoint.y,
                points: [
                  0, 0,           // Start at origin
                  dx, dy         // End at relative position
                ]
              };

            case 'triangle':
              switch (shape.triangleType) {
                case 'right':
                  return {
                    ...shape,
                    x: startPoint.x,
                    y: startPoint.y,
                    points: [
                      0, 0,           // First vertex at origin
                      dx, dy,         // Second vertex relative
                      dx, 0           // Third vertex relative
                    ]
                  };
                
                case 'isosceles':
                  return {
                    ...shape,
                    x: startPoint.x,
                    y: startPoint.y,
                    points: [
                      0, 0,           // Top vertex at origin
                      dx, dy,         // Right vertex relative
                      -dx, dy         // Left vertex relative
                    ]
                  };
                
                case 'equilateral':
                  const side = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx);
                  const angle60 = Math.PI / 3;
                  
                  return {
                    ...shape,
                    x: startPoint.x,
                    y: startPoint.y,
                    points: [
                      0, 0,           // First vertex at origin
                      side * Math.cos(angle), side * Math.sin(angle),           // Second vertex relative
                      side * Math.cos(angle - angle60), side * Math.sin(angle - angle60)  // Third vertex relative
                    ]
                  };
                
                default:
                  return shape;
              }

            case 'rectangle':
              return {
                ...shape,
                width: dx,
                height: dy
              };

            case 'circle':
              return {
                ...shape,
                radius: Math.sqrt(dx * dx + dy * dy)
              };

            case 'ellipse':
              return {
                ...shape,
                width: Math.abs(dx) * 2,
                height: Math.abs(dy) * 2
              };

            default:
              return shape;
          }
        }
        return shape;
      });

      setShapes(updatedShapes);
      const updatedShape = updatedShapes.find(s => s.id === selectedShape.id);
      if (updatedShape) {
        if (wsProvider?.connected) {
          wsProvider.publish({
            destination: '/topic/whiteboard',
            body: JSON.stringify({
              userId,
              username,
              action: 'update',
              shape: updatedShape
            })
          });
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!tool) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    startPointRef.current = pos;

    if (tool === 'eraser') {
      // Check for shapes first
      const shapeToRemove = shapes.find(shape => isPointNearShape(pos, shape));
      if (shapeToRemove) {
        const newShapes = shapes.filter(shape => shape.id !== shapeToRemove.id);
        setShapes(newShapes);
        addToHistory([...lines], newShapes);
        // Send erase update
        sendUpdate('erase', shapeToRemove);
        return;
      }

      // Check for lines
      const lineToRemove = lines.find(line => {
        if (line.tool === 'pen') {
          // Check each segment of the line
          for (let i = 0; i < line.points.length - 2; i += 2) {
            const x1 = line.points[i];
            const y1 = line.points[i + 1];
            const x2 = line.points[i + 2];
            const y2 = line.points[i + 3];
            
            // Calculate distance from point to line segment
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const distance = Math.abs((pos.x - x1) * dy - (pos.y - y1) * dx) / length;
            
            // Check if point is within the line segment bounds
            const dot = ((pos.x - x1) * dx + (pos.y - y1) * dy) / (dx * dx + dy * dy);
            if (distance < 10 && dot >= 0 && dot <= 1) {
              return true;
            }
          }
        }
        return false;
      });

      if (lineToRemove) {
        const newLines = lines.filter(line => line.id !== lineToRemove.id);
        setLines(newLines);
        addToHistory(newLines, [...shapes]);
        // Send erase update
        sendUpdate('erase', lineToRemove);
        return;
      }
    } else if (tool === 'pen') {
      setIsDrawing(true);
      const newLine = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: 'pen',
        points: [pos.x, pos.y],
        stroke: strokeColor
      };
      console.log('Creating new line:', newLine);
      setLines(prev => [...prev, newLine]);
      // Send the new line to other users
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'draw',
            shape: newLine
          })
        });
      }
    } else {
      setIsDrawing(true);
      const newShape = {
        id: `${userId}-${Date.now()}-${uuidv4()}`,
        tool: tool,
        type: tool,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        radius: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        fill: defaultFill ? fillColor : 'transparent',
        stroke: strokeColor,
        points: tool === 'line' ? 
          [pos.x, pos.y, pos.x, pos.y] : // Line starts and ends at same point
          tool === 'triangle' ? 
            [pos.x, pos.y, pos.x, pos.y, pos.x, pos.y] : // Triangle starts from first vertex
            undefined,
        triangleType: tool === 'triangle' ? triangleType : undefined
      };
      console.log('Creating new shape:', newShape);
      setShapes(prev => [...prev, newShape]);
      setSelectedShape(newShape);
      // Send the new shape
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'draw',
            shape: newShape
          })
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      if (selectedShape) {
        const finalShape = shapes.find(s => s.id === selectedShape.id);
        if (finalShape) {
          sendUpdate('update', finalShape);
        }
      }
      addToHistory([...lines], [...shapes]);
      setIsDrawing(false);
      setSelectedShape(null);
    }
    startPointRef.current = null;
  };

  const handleDragStart = (e) => {
    if (tool) return;
    const id = e.target.id();
    const shape = shapes.find(s => s.id === id);
    if (shape) {
      setSelectedShape(shape);
    }
  };

  // Update handleClick to show handles when shape is selected
  const handleClick = (e) => {
    if (tool) return; // Don't select if a tool is active
    
    const clickedOn = e.target;
    const stage = e.target.getStage();
    
    // If clicked on empty space, deselect
    if (clickedOn === stage) {
      setSelectedShape(null);
      return;
    }

    // If clicked on a shape, select it
    const shape = shapes.find(s => s.id === clickedOn.id());
    if (shape) {
      setSelectedShape(shape);
    }
  };

  const handleDragEnd = (e) => {
    const shape = e.target;
    const updatedShape = {
      ...shapes.find(s => s.id === shape.id()),
      x: shape.x(),
      y: shape.y()
    };

    // Update shapes
    setShapes(prev => prev.map(s => 
      s.id === shape.id() ? updatedShape : s
    ));

    // Add to history
    const newHistory = [...history.slice(0, historyStep + 1), {
      lines,
      shapes: shapes.map(s => s.id === shape.id() ? updatedShape : s),
      background: backgroundFile ? {
        file: backgroundFile,
        type: backgroundType
      } : null
    }];
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    // Send update to other users
    if (wsProvider?.connected) {
      wsProvider.publish({
        destination: '/topic/whiteboard',
        body: JSON.stringify({
          userId,
          username,
          action: 'state',
          state: {
            lines,
            shapes: shapes.map(s => s.id === shape.id() ? updatedShape : s),
            background: backgroundFile ? {
              file: backgroundFile,
              type: backgroundType
            } : null,
            history: newHistory,
            historyStep: newHistory.length - 1
          }
        })
      });
    }
  };

  const handleTransformEnd = (e) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();

    const originalShape = shapes.find(s => s.id === node.id());
    
    // Get absolute position and dimensions based on shape type
    const updatedShape = {
      ...originalShape,
      x: node.x(),
      y: node.y(),
      rotation: rotation,
      scaleX: scaleX,
      scaleY: scaleY
    };

    // Add shape-specific properties
    if (originalShape.type === 'circle') {
      updatedShape.radius = node.radius() * Math.abs(scaleX);
    } else if (originalShape.type === 'rectangle' || originalShape.type === 'ellipse') {
      updatedShape.width = node.width() * Math.abs(scaleX);
      updatedShape.height = node.height() * Math.abs(scaleY);
    } else if (originalShape.type === 'triangle') {
      // For triangles, handle each type differently
      switch (originalShape.triangleType) {
        case 'right':
          updatedShape.points = [
            0, 0,                    // First vertex at origin
            node.width() * Math.abs(scaleX), 0,  // Second vertex (base)
            node.width() * Math.abs(scaleX),     // Third vertex (height)
            node.height() * Math.abs(scaleY)
          ];
          break;
          
        case 'isosceles':
          const halfWidth = node.width() * Math.abs(scaleX) / 2;
          updatedShape.points = [
            0, 0,              // Top vertex
            halfWidth, node.height() * Math.abs(scaleY),    // Right vertex
            -halfWidth, node.height() * Math.abs(scaleY)    // Left vertex
          ];
          break;
          
        case 'equilateral':
          const side = node.width() * Math.abs(scaleX);
          const height = side * Math.sqrt(3) / 2;
          updatedShape.points = [
            0, -height/2,           // Top vertex
            side/2, height/2,       // Bottom right
            -side/2, height/2       // Bottom left
          ];
          break;
      }
    } else if (originalShape.type === 'line') {
      updatedShape.points = node.points().map((point, i) => {
        return i % 2 === 0 
          ? point * Math.abs(scaleX)  // x coordinates
          : point * Math.abs(scaleY); // y coordinates
      });
    }

    // Update shapes
    setShapes(prev => prev.map(s => 
      s.id === node.id() ? updatedShape : s
    ));

    // Add to history
    const newHistory = [...history.slice(0, historyStep + 1), {
      lines,
      shapes: shapes.map(s => s.id === node.id() ? updatedShape : s),
      background: backgroundFile ? {
        file: backgroundFile,
        type: backgroundType
      } : null
    }];
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    // Send update to other users
    if (wsProvider?.connected) {
      wsProvider.publish({
        destination: '/topic/whiteboard',
        body: JSON.stringify({
          userId,
          username,
          action: 'state',
          state: {
            lines,
            shapes: shapes.map(s => s.id === node.id() ? updatedShape : s),
            background: backgroundFile ? {
              file: backgroundFile,
              type: backgroundType
            } : null,
            history: newHistory,
            historyStep: newHistory.length - 1
          }
        })
      });
    }
  };

  // Update handleShapeColorChange to only affect selected shape
  const handleShapeColorChange = (e) => {
    const selectedId = selectedShape?.id;
    if (selectedId) {
      const updatedShapes = shapes.map(shape => {
        if (shape.id === selectedId) {
          return {
            ...shape,
            // Only update the relevant color based on which color picker changed
            ...(e.target.type === 'checkbox' 
              ? { fill: e.target.checked ? fillColor : 'transparent' }
              : e.target.className.includes('fill') 
                ? { fill: defaultFill ? e.target.value : 'transparent' }
                : { stroke: e.target.value }
            )
          };
        }
        return shape;
      });
      setShapes(updatedShapes);
      addToHistory([...lines], updatedShapes);
    }
  };

  // Update addToHistory to better handle transformations
  const addToHistory = (newLines, newShapes) => {
    // Create deep copies to prevent reference issues
    const newLinesClone = JSON.parse(JSON.stringify(newLines));
    const newShapesClone = JSON.parse(JSON.stringify(newShapes));

    // Don't save if nothing has changed
    if (historyStep >= 0) {
      const currentState = history[historyStep];
      const isSameState = JSON.stringify(currentState.lines) === JSON.stringify(newLinesClone) &&
                         JSON.stringify(currentState.shapes) === JSON.stringify(newShapesClone);
      if (isSameState) return;
    }

    // Remove any future states after current step
    const newHistory = history.slice(0, historyStep + 1);
    
    // Add new state
    const newState = {
      lines: newLinesClone,
      shapes: newShapesClone,
      historyStep: historyStep + 1
    };
    
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    // Send state to other users
    if (wsProvider?.connected) {
      wsProvider.publish({
        destination: '/topic/whiteboard',
        body: JSON.stringify({
          userId,
          username,
          action: 'state',
          state: {
            lines: newLinesClone,
            shapes: newShapesClone,
            historyStep: newHistory.length - 1,
            history: newHistory
          }
        })
      });
    }
  };

  // Update handleUndo to sync with other users
  const handleUndo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const prevState = history[newStep];
      setLines(prevState.lines);
      setShapes(prevState.shapes);
      if (prevState.background) {
        setBackgroundFile(prevState.background.file);
        setBackgroundType(prevState.background.type);
      }
      setHistoryStep(newStep);

      // Send undo action to other users
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'state',
            state: {
              lines: prevState.lines,
              shapes: prevState.shapes,
              background: prevState.background,
              history: history,
              historyStep: newStep
            }
          })
        });
      }
    }
  };

  // Update handleRedo to sync with other users
  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      const nextState = history[newStep];
      setLines(nextState.lines);
      setShapes(nextState.shapes);
      if (nextState.background) {
        setBackgroundFile(nextState.background.file);
        setBackgroundType(nextState.background.type);
      }
      setHistoryStep(newStep);

      // Send redo action to other users
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'state',
            state: {
              lines: nextState.lines,
              shapes: nextState.shapes,
              background: nextState.background,
              history: history,
              historyStep: newStep
            }
          })
        });
      }
    }
  };

  const handleToolClick = (selectedTool) => {
    setTool(tool === selectedTool ? null : selectedTool);
  };

  const isPointNearShape = (point, shape) => {
    const distance = 10; // Define distance constant
    return distance < 10; // Use the constant
  };

  // Add this function to handle remote cursor updates
  const updateRemoteCursor = (cursorUpdate) => {
    setCursors(prev => new Map(prev).set(cursorUpdate.userId, {
      position: cursorUpdate.position,
      username: cursorUpdate.username,
      color: cursorUpdate.color
    }));
  };

  // Add this function to render cursors
  const renderCursors = () => {
    return Array.from(cursors.entries()).map(([userId, data]) => (
      <Group key={`cursor-${userId}`}>
        {/* Cursor dot */}
        <Circle
          x={data.position.x}
          y={data.position.y}
          radius={5}
          fill={data.color || '#000'}
        />
        {/* Username label */}
        <Text
          x={data.position.x + 10}
          y={data.position.y + 10}
          text={data.username}
          fontSize={12}
          fill={data.color || '#000'}
        />
      </Group>
    ));
  };

  // Add new function for handling images
  const handleImageUpload = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('http://localhost:8081/api/files/upload', formData);
      const filename = response.data;
      const fileUrl = `http://localhost:8081/api/files/${filename}`;
      
      // Clear everything
      setShapes([]);
      setLines([]);
      setBackgroundFile(fileUrl);
      setBackgroundType('image');
      setScale(1);
      
      // Reset history
      const newHistory = [{
        lines: [],
        shapes: [],
        background: {
          file: fileUrl,
          type: 'image'
        }
      }];
      setHistory(newHistory);
      setHistoryStep(0);

      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'background',
            background: {
              type: 'image',
              url: fileUrl  // Send server URL
            }
          })
        });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  };

  // Keep original handleFileUpload for PDF
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post('http://localhost:8081/api/files/upload', formData);
        const filename = response.data;
        const fileUrl = `http://localhost:8081/api/files/${filename}`;
        
        // Clear everything
        setShapes([]);
        setLines([]);
        setBackgroundFile(fileUrl);
        setBackgroundType('pdf');
        setScale(1);
        setCurrentPage(1);
        
        // Reset history
        const newHistory = [{
          lines: [],
          shapes: [],
          background: {
            file: fileUrl,
            type: 'pdf'
          }
        }];
        setHistory(newHistory);
        setHistoryStep(0);

        if (wsProvider?.connected) {
          wsProvider.publish({
            destination: '/topic/whiteboard',
            body: JSON.stringify({
              userId,
              username,
              action: 'background',
              background: {
                type: 'pdf',
                url: fileUrl
              }
            })
          });
        }
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    } else if (file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  };

  // Modify handlePageChange to handle page-specific shapes only in PDF mode
  const handlePageChange = (newPage) => {
    if (backgroundType === 'pdf') {
      // Save current page shapes
      setPageShapes(prev => ({
        ...prev,
        [currentPage]: { shapes, lines }
      }));

      // Load new page shapes
      const newPageShapes = pageShapes[newPage] || { shapes: [], lines: [] };
      setShapes(newPageShapes.shapes);
      setLines(newPageShapes.lines);
      setCurrentPage(newPage);

      // Send page change to other users
      if (wsProvider?.connected) {
        wsProvider.publish({
          destination: '/topic/whiteboard',
          body: JSON.stringify({
            userId,
            username,
            action: 'pageChange',
            page: {
              number: newPage,
              shapes: newPageShapes,
              type: 'pdf'  // Add type to identify PDF page changes
            }
          })
        });
      }
    }
  };

  useEffect(() => {
    if (!signalingService || !user) return;

    console.log('[Whiteboard] Adding signaling message handler for whiteboard synchronization');
    const handlerId = signalingService.addMessageHandler((message) => {
      // ... existing handler code ...
    });
    console.log(`[Whiteboard] Signaling handler added with ID: ${handlerId}`);

    return () => {
      console.log(`[Whiteboard] Removing signaling handler with ID: ${handlerId}`);
      signalingService.removeMessageHandler(handlerId);
    };
  }, [signalingService, user]);

  return (
    <div className="whiteboard-container">
      {/* Add color picker for user */}
      <div className="user-color-picker">
        <label>Your Color:</label>
        <input
          type="color"
          value={userColor}
          onChange={(e) => setUserColor(e.target.value)}
          className="color-picker"
        />
        <span>{username}</span>
      </div>
      
      <div className="toolbar">
        <button
          className={`tool-button ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => handleToolClick('pen')}
          title="Pen"
        >
          <FaPencilAlt />
        </button>
        <button
          className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => handleToolClick('eraser')}
          title="Eraser"
        >
          <FaEraser />
        </button>
        <button
          className={`tool-button ${tool === 'circle' ? 'active' : ''}`}
          onClick={() => handleToolClick('circle')}
          title="Circle"
        >
          <FaCircle />
        </button>
        <button
          className={`tool-button ${tool === 'ellipse' ? 'active' : ''}`}
          onClick={() => handleToolClick('ellipse')}
          title="Ellipse"
        >
          <FaDrawPolygon />
        </button>
        <button
          className={`tool-button ${tool === 'rectangle' ? 'active' : ''}`}
          onClick={() => handleToolClick('rectangle')}
          title="Rectangle"
        >
          <FaSquare />
        </button>
        <button
          className={`tool-button ${tool === 'triangle' && triangleType === 'equilateral' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('equilateral');
            handleToolClick('triangle');
          }}
          title="Equilateral Triangle"
        >
          <BsTriangleFill />
        </button>
        <button
          className={`tool-button ${tool === 'triangle' && triangleType === 'right' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('right');
            handleToolClick('triangle');
          }}
          title="Right Triangle"
        >
          <TbTriangleInverted />
        </button>
        <button
          className={`tool-button ${tool === 'triangle' && triangleType === 'isosceles' ? 'active' : ''}`}
          onClick={() => {
            setTriangleType('isosceles');
            handleToolClick('triangle');
          }}
          title="Isosceles Triangle"
        >
          <TbTriangleOff />
        </button>
        <button
          className={`tool-button ${tool === 'line' ? 'active' : ''}`}
          onClick={() => handleToolClick('line')}
          title="Straight Line"
        >
          <BsSlashLg />
        </button>
        <div className="toolbar-divider"></div>
        
        {/* Line color picker */}
        <div className="color-control">
          <label title="Line Color">Line:</label>
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => {
              setStrokeColor(e.target.value);
              handleShapeColorChange(e);
            }}
            className="color-picker"
          />
        </div>

        {/* Fill controls */}
        <div className="fill-control">
          <input
            type="checkbox"
            id="fillToggle"
            checked={defaultFill}
            onChange={(e) => {
              setDefaultFill(e.target.checked);
              handleShapeColorChange(e);
            }}
            title="Fill shapes"
          />
          <label title="Fill Color">Fill:</label>
          <input
            type="color"
            value={fillColor}
            onChange={(e) => {
              setFillColor(e.target.value);
              handleShapeColorChange(e);
            }}
            className="color-picker"
            disabled={!defaultFill}
          />
        </div>

        <div className="toolbar-divider"></div>
        <button
          className="tool-button"
          onClick={handleUndo}
          disabled={historyStep === 0}
          title="Undo"
        >
          <FaUndo />
        </button>
        <button
          className="tool-button"
          onClick={handleRedo}
          disabled={historyStep === history.length - 1}
          title="Redo"
        >
          <FaRedo />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
        />
        <button
          className="tool-button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Background"
        >
          <FaFill />
        </button>
        {backgroundType === 'pdf' && (
          <div className="pdf-controls">
            <button
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </button>
            <span>{currentPage} / {pdfPages}</span>
            <button
              disabled={currentPage === pdfPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div 
        ref={containerRef}
        className="whiteboard-scroll-container"
        style={{ 
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 200px)',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {/* Scrollable content wrapper */}
        <div style={{
          position: 'relative',
          minHeight: '100%',
          width: '100%'
        }}>
          {/* Background Layer */}
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
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 2,
              pointerEvents: 'all',
              background: 'transparent'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
          >
            <Layer>
              {shapes.map((shape) => {
                const commonProps = {
                  key: shape.id,
                  id: shape.id,
                  x: shape.x,
                  y: shape.y,
                  rotation: shape.rotation || 0,
                  scaleX: shape.scaleX || 1,
                  scaleY: shape.scaleY || 1,
                  fill: shape.fill || 'transparent',
                  stroke: shape.stroke || strokeColor,
                  draggable: !tool,
                  onDragStart: handleDragStart,
                  onDragEnd: handleDragEnd,
                  onTransformEnd: handleTransformEnd
                };

                switch (shape.type) {
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
                        radiusX={Math.abs(shape.width / 2)}
                        radiusY={Math.abs(shape.height / 2)}
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
                  case 'line':
                    return (
                      <Line
                        {...commonProps}
                        points={shape.points}
                        closed={shape.type === 'triangle'}
                      />
                    );
                  default:
                    return null;
                }
              })}
              {lines.map((line) => (
                <Line
                  key={line.id}
                  points={line.points}
                  stroke={line.tool === 'eraser' ? '#fff' : (line.stroke || strokeColor)}
                  strokeWidth={line.tool === 'eraser' ? 20 : 2}
                  tension={0.5}
                  lineCap="round"
                  globalCompositeOperation={
                    line.tool === 'eraser' ? 'destination-out' : 'source-over'
                  }
                />
              ))}
              {selectedShape && !tool && (
                <Transformer
                  ref={node => {
                    const shape = node?.getStage()?.findOne(`#${selectedShape.id}`);
                    if (node && shape) {
                      node.nodes([shape]);
                      node.getLayer().batchDraw();
                    }
                  }}
                  boundBoxFunc={(oldBox, newBox) => {
                    newBox.width = Math.max(5, newBox.width);
                    newBox.height = Math.max(5, newBox.height);
                    return newBox;
                  }}
                  rotateEnabled={true}
                  enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                  rotateAnchorOffset={30}
                  padding={5}
                  anchorSize={8}
                  anchorCornerRadius={4}
                  borderStroke="#0096FF"
                  anchorStroke="#0096FF"
                  anchorFill="#fff"
                  borderDash={[4, 4]}
                />
              )}
              
              {renderCursors()}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard; 