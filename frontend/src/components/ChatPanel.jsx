import React, { useState, useEffect, useRef } from 'react';
import { WebRTCProvider } from '../services/WebRTCProvider';
import ConnectionStatusLight from './ConnectionStatusLight';
import '../styles/ChatPanel.css';

const ChatPanel = ({ user, provider, peers }) => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!provider) return;
        
        provider.onMessageReceived = (message) => {
            console.log('Received message:', message);
            try {
                const parsedContent = JSON.parse(message.content);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    sender: parsedContent.sender,
                    content: parsedContent.content,
                    timestamp: new Date(parsedContent.timestamp),
                    type: 'received'
                }]);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
    }, [provider]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const sendMessage = async () => {
        if (!inputMessage.trim()) return;

        const newMessage = {
            content: inputMessage,
            sender: user.username,
            timestamp: new Date(),
            type: 'sent'
        };

        setMessages(prev => [...prev, { ...newMessage, id: Date.now() }]);
        setInputMessage('');

        // Send to all connected peers
        peers.forEach(peer => {
            provider.sendMessage(peer, newMessage);
        });
    };

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <h2>Chat Room</h2>
            </div>
            <div className="chat-messages">
                {messages.map(message => (
                    <div 
                        key={message.id} 
                        className={`message ${message.type}`}
                    >
                        <div className="message-header">
                            <span className="sender">{message.sender}</span>
                            <span className="timestamp">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <div className="message-content">{message.content}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input">
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                />
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default ChatPanel; 