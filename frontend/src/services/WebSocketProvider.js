import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { ICommunicationProvider } from './ICommunicationProvider';

export class WebSocketProvider extends ICommunicationProvider {
    static instance = null;
    
    static getInstance(userId) {
        if (!WebSocketProvider.instance) {
            WebSocketProvider.instance = new WebSocketProvider(userId);
        }
        return WebSocketProvider.instance;
    }

    constructor(userId) {
        super();
        if (WebSocketProvider.instance) {
            return WebSocketProvider.instance;
        }
        
        this.userId = userId;
        this.socket = null;
        this.subscribers = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // Event handlers
        this.connectHandler = null;
        this.disconnectHandler = null;
        this.errorHandler = null;
        this.reconnectHandler = null;
    }

    async connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('[WebSocketProvider] Already connected');
            return Promise.resolve(true);
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Clean up any existing socket
                if (this.socket) {
                    this.socket.close();
                    this.socket = null;
                }

                const { SERVER_CONFIG } = await import('./config');
                const wsUrl = SERVER_CONFIG.signaling.getUrl();
                console.log(`[WebSocketProvider] Connecting to ${wsUrl}`);
                this.socket = new WebSocket(wsUrl);

                this.socket.onopen = () => {
                    console.log('[WebSocketProvider] WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.connectHandler?.();
                    resolve(true);
                };

                this.socket.onclose = () => {
                    console.log('[WebSocketProvider] WebSocket closed');
                    this.isConnected = false;
                    this.disconnectHandler?.();
                    this.attemptReconnect();
                };

                this.socket.onerror = (error) => {
                    console.error('[WebSocketProvider] WebSocket error:', error);
                    this.errorHandler?.(error);
                };

                this.socket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        // Dispatch message to all relevant subscribers
                        this.subscribers.forEach((callbacks, topic) => {
                            if (this.messageMatchesTopic(message, topic)) {
                                callbacks.forEach(callback => callback(message));
                            }
                        });
                    } catch (error) {
                        console.error('[WebSocketProvider] Message processing error:', error);
                    }
                };
            } catch (error) {
                console.error('[WebSocketProvider] Error creating connection:', error);
                this.errorHandler?.(error);
                reject(error);
            }
        });
    }

    messageMatchesTopic(message, topic) {
        // Simple topic matching
        // For now, just check if message type matches the topic
        // This can be enhanced with more sophisticated routing if needed
        return topic === '*' || message.type === topic;
    }

    subscribe(topic, callback) {
        if (!this.subscribers.has(topic)) {
            this.subscribers.set(topic, new Set());
        }
        this.subscribers.get(topic).add(callback);
        
        return {
            unsubscribe: () => this.unsubscribe(topic, callback)
        };
    }

    unsubscribe(topic, callback) {
        const topicSubscribers = this.subscribers.get(topic);
        if (topicSubscribers) {
            topicSubscribers.delete(callback);
            if (topicSubscribers.size === 0) {
                this.subscribers.delete(topic);
            }
        }
    }

    publish(topic, message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('[WebSocketProvider] Cannot publish: WebSocket not connected');
            return;
        }

        try {
            this.socket.send(JSON.stringify(message));
        } catch (error) {
            console.error('[WebSocketProvider] Error publishing message:', error);
            throw error;
        }
    }

    disconnect() {
        // Clean up all subscriptions
        this.subscribers.clear();

        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.isConnected = false;
            console.log('[WebSocketProvider] Connection closed');
        }
    }

    handleRemoteUpdate = (update) => {
        try {
            console.group('Remote Update');
            console.log('Action:', update.action);
            console.log('Data size:', new Blob([JSON.stringify(update)]).size, 'bytes');
            console.groupEnd();

            if (update.userId === this.userId) return;

            switch (update.action) {
                case 'draw':
                case 'update':
                case 'erase':
                    // Create copies of current state
                    let updatedLines = [...this.lines];
                    let updatedShapes = [...this.shapes];

                    if (update.action === 'draw') {
                        if (update.shape.tool === 'pen') {
                            updatedLines = [...updatedLines, update.shape];
                            this.setLines(updatedLines);
                        } else {
                            updatedShapes = [...updatedShapes, update.shape];
                            this.setShapes(updatedShapes);
                        }
                    } else if (update.action === 'update') {
                        if (update.shape.tool === 'pen') {
                            updatedLines = updatedLines.map(line => 
                                line.id === update.shape.id ? update.shape : line
                            );
                            this.setLines(updatedLines);
                        } else {
                            updatedShapes = updatedShapes.map(shape => 
                                shape.id === update.shape.id ? update.shape : shape
                            );
                            this.setShapes(updatedShapes);
                        }
                    } else if (update.action === 'erase') {
                        if (update.type === 'shape') {
                            updatedShapes = updatedShapes.filter(shape => shape.id !== update.shapeId);
                            this.setShapes(updatedShapes);
                        } else if (update.type === 'line') {
                            updatedLines = updatedLines.filter(line => line.id !== update.shapeId);
                            this.setLines(updatedLines);
                        }
                    }

                    // Update page history after any shape/line changes
                    this.setPageHistory(prev => {
                        const currentPage = update.page || this.currentPage;
                        const currentHistory = prev[currentPage]?.history || [];
                        const currentStep = prev[currentPage]?.historyStep || 0;

                        const newState = {
                            lines: updatedLines,
                            shapes: updatedShapes,
                            background: prev[currentPage]?.history[currentStep]?.background
                        };

                        const newHistory = currentHistory.slice(0, currentStep + 1);
                        newHistory.push(newState);

                        return {
                            ...prev,
                            [currentPage]: {
                                history: newHistory,
                                historyStep: newHistory.length - 1
                            }
                        };
                    });
                    break;

                case 'state':
                    this.setLines(update.state.lines || []);
                    this.setShapes(update.state.shapes || []);
                    
                    if (update.state.page !== undefined && update.state.pageHistory) {
                        this.setPageHistory(prev => ({
                            ...prev,
                            [update.state.page]: update.state.pageHistory
                        }));
                    }
                    
                    if (update.state.background) {
                        this.setBackgroundFile(update.state.background.file);
                        this.setBackgroundType(update.state.background.type);
                    }
                    break;

                case 'shapes_chunk':
                    // Store chunks until complete
                    if (!this.shapeChunks) this.shapeChunks = [];
                    this.shapeChunks[update.chunkIndex] = update.shapes;
                    
                    // If all chunks received, update shapes
                    if (this.shapeChunks.length === update.totalChunks &&
                        !this.shapeChunks.includes(undefined)) {
                        const allShapes = this.shapeChunks.flat();
                        this.setShapes(allShapes);
                        this.shapeChunks = null;
                    }
                    break;

                case 'lines_chunk':
                    // Store chunks until complete
                    if (!this.lineChunks) this.lineChunks = [];
                    this.lineChunks[update.chunkIndex] = update.lines;
                    
                    // If all chunks received, update lines
                    if (this.lineChunks.length === update.totalChunks &&
                        !this.lineChunks.includes(undefined)) {
                        const allLines = this.lineChunks.flat();
                        this.setLines(allLines);
                        this.lineChunks = null;
                    }
                    break;

                case 'state_complete':
                    // Update final state
                    if (update.state.background) {
                        this.setBackgroundFile(update.state.background.file);
                        this.setBackgroundType(update.state.background.type);
                    }
                    break;

                case 'background':
                    if (update.background.type === 'pdf') {
                        this.setBackgroundFile(update.background.url);
                        this.setBackgroundType('pdf');
                        
                        // Clear everything and reset history
                        this.setShapes([]);
                        this.setLines([]);
                        const newPdfHistory = [{
                            lines: [],
                            shapes: [],
                            background: {
                                file: update.background.url,
                                type: 'pdf'
                            }
                        }];
                        this.setHistory(newPdfHistory);
                        this.setHistoryStep(0);
                    } else if (update.background.type === 'image') {
                        this.setShapes([]);
                        this.setLines([]);
                        this.setBackgroundFile(update.background.url);
                        this.setBackgroundType('image');
                        
                        const newImageHistory = [{
                            lines: [],
                            shapes: [],
                            background: {
                                file: update.background.url,
                                type: 'image'
                            }
                        }];
                        this.setHistory(newImageHistory);
                        this.setHistoryStep(0);
                    }
                    break;

                case 'pageChange':
                    if (update.page.type === 'pdf') {
                        this.setPageShapes(prev => ({
                            ...prev,
                            [this.currentPage]: { shapes: this.shapes, lines: this.lines }
                        }));
                        this.setCurrentPage(update.page.number);
                        this.setShapes(update.page.shapes.shapes || []);
                        this.setLines(update.page.shapes.lines || []);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling remote update:', error, {
                action: update.action,
                currentLines: this.lines,
                currentShapes: this.shapes,
                currentPage: this.currentPage
            });
            this.errorHandler?.({
                message: 'Failed to process remote update',
                type: 'PROCESS_ERROR',
                error,
                state: {
                    action: update.action,
                    lines: this.lines,
                    shapes: this.shapes,
                    page: this.currentPage
                }
            });
        }
    }

    onConnect(handler) {
        this.connectHandler = handler;
    }

    onDisconnect(handler) {
        this.disconnectHandler = handler;
    }

    onError(handler) {
        this.errorHandler = handler;
    }

    onReconnect(handler) {
        this.reconnectHandler = handler;
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.reconnectHandler?.(this.reconnectAttempts);
            
            // Exponential backoff
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            
            console.log(`[WebSocketProvider] Attempting reconnection ${this.reconnectAttempts} of ${this.maxReconnectAttempts} in ${delay}ms`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error('[WebSocketProvider] Reconnection failed:', error);
                });
            }, delay);
        } else {
            console.error('[WebSocketProvider] Max reconnection attempts reached');
            this.errorHandler?.({
                message: 'Max reconnection attempts reached',
                type: 'MAX_RECONNECT'
            });
        }
    }

    sendUpdate(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('Cannot send update: WebSocket not connected');
            return;
        }

        try {
            // Debug message size and content
            const fullMessageStr = JSON.stringify(message);
            const fullSize = new Blob([fullMessageStr]).size;
            console.group('Message Size Analysis');
            console.log('Total message size:', (fullSize / 1024).toFixed(2), 'KB');
            
            // Analyze message components
            if (message.action === 'state') {
                const shapes = message.state.shapes || [];
                const lines = message.state.lines || [];
                const history = message.state.history || [];
                
                console.log('Message breakdown:');
                console.log('- Action:', message.action);
                console.log('- Shapes:', shapes.length, 'items,', 
                    (new Blob([JSON.stringify(shapes)]).size / 1024).toFixed(2), 'KB');
                console.log('- Lines:', lines.length, 'items,',
                    (new Blob([JSON.stringify(lines)]).size / 1024).toFixed(2), 'KB');
                console.log('- History:', history.length, 'items,',
                    (new Blob([JSON.stringify(history)]).size / 1024).toFixed(2), 'KB');
                
                // Log the largest shapes
                if (shapes.length > 0) {
                    const shapeSizes = shapes.map(shape => ({
                        id: shape.id,
                        type: shape.type,
                        size: new Blob([JSON.stringify(shape)]).size
                    }));
                    const largestShapes = shapeSizes
                        .sort((a, b) => b.size - a.size)
                        .slice(0, 3);
                    console.log('Largest shapes:', largestShapes);
                }

                // Log the largest lines
                if (lines.length > 0) {
                    const lineSizes = lines.map(line => ({
                        id: line.id,
                        points: line.points?.length,
                        size: new Blob([JSON.stringify(line)]).size
                    }));
                    const largestLines = lineSizes
                        .sort((a, b) => b.size - a.size)
                        .slice(0, 3);
                    console.log('Largest lines:', largestLines);
                }
            } else {
                console.log('Message type:', message.action);
                if (message.shape) {
                    console.log('Shape size:', 
                        (new Blob([JSON.stringify(message.shape)]).size / 1024).toFixed(2), 'KB');
                    console.log('Shape details:', {
                        type: message.shape.type,
                        points: message.shape.points?.length,
                        id: message.shape.id
                    });
                }
            }
            console.groupEnd();

            // Continue with existing chunking logic...
            if (message.action === 'state') {
                // Send only essential data, no history
                const minimalState = {
                    userId: message.userId,
                    username: message.username,
                    action: 'state',
                    state: {
                        lines: message.state.lines,
                        shapes: message.state.shapes,
                        currentPage: message.state.currentPage,
                        background: message.state.background
                    }
                };

                const messageStr = JSON.stringify(minimalState);
                const messageSize = new Blob([messageStr]).size;
                console.log('State update size:', messageSize, 'bytes');

                // If still too large, chunk the data
                if (messageSize > 500 * 1024) { // 500KB threshold
                    console.log('Chunking large state update');
                    
                    // Send shapes in chunks
                    if (minimalState.state.shapes?.length > 0) {
                        const chunkSize = 50; // Adjust based on your needs
                        for (let i = 0; i < minimalState.state.shapes.length; i += chunkSize) {
                            const shapesChunk = minimalState.state.shapes.slice(i, i + chunkSize);
                            const chunkMessage = {
                                userId: message.userId,
                                username: message.username,
                                action: 'shapes_chunk',
                                chunkIndex: i / chunkSize,
                                totalChunks: Math.ceil(minimalState.state.shapes.length / chunkSize),
                                shapes: shapesChunk
                            };
                            this.socket.send(JSON.stringify(chunkMessage));
                        }
                    }

                    // Send lines in chunks
                    if (minimalState.state.lines?.length > 0) {
                        const chunkSize = 100; // Adjust based on your needs
                        for (let i = 0; i < minimalState.state.lines.length; i += chunkSize) {
                            const linesChunk = minimalState.state.lines.slice(i, i + chunkSize);
                            const chunkMessage = {
                                userId: message.userId,
                                username: message.username,
                                action: 'lines_chunk',
                                chunkIndex: i / chunkSize,
                                totalChunks: Math.ceil(minimalState.state.lines.length / chunkSize),
                                lines: linesChunk
                            };
                            this.socket.send(JSON.stringify(chunkMessage));
                        }
                    }

                    // Send final state without shapes and lines
                    const finalState = {
                        userId: message.userId,
                        username: message.username,
                        action: 'state_complete',
                        state: {
                            currentPage: minimalState.state.currentPage,
                            background: minimalState.state.background
                        }
                    };
                    this.socket.send(JSON.stringify(finalState));
                    return;
                }

                // If not too large, send as single message
                this.socket.send(messageStr);
                return;
            }

            // For non-state updates, send as is
            const messageStr = JSON.stringify(message);
            this.socket.send(messageStr);

        } catch (error) {
            console.error('Error sending update:', error);
            this.errorHandler?.({
                message: 'Failed to send update',
                type: 'SEND_ERROR',
                error
            });
        }
    }
} 