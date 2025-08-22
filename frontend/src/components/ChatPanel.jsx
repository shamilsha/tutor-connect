import React, { useState, useEffect, useRef } from 'react';
import '../styles/ChatPanel.css';

const ChatPanel = ({ user, provider, peers, onSendMessage, receivedMessages = [] }) => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const messagesEndRef = useRef(null);

    // Update messages when receivedMessages prop changes
    useEffect(() => {
        if (receivedMessages.length > 0) {
            const lastMessage = receivedMessages[receivedMessages.length - 1];
            setMessages(prev => [...prev, {
                id: Date.now(),
                sender: lastMessage.sender || 'Peer',
                content: lastMessage.content,
                timestamp: new Date(lastMessage.timestamp || Date.now()),
                type: 'received'
            }]);
        }
    }, [receivedMessages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const sendMessage = async () => {
        if (!inputMessage.trim() || !onSendMessage) return;

        const newMessage = {
            content: inputMessage,
            sender: user?.email || 'You',
            timestamp: new Date().toISOString(),
            type: 'sent'
        };

        // Add to local messages immediately
        setMessages(prev => [...prev, { ...newMessage, id: Date.now() }]);
        setInputMessage('');

        // Send to peer via WebRTC
        try {
            await onSendMessage(newMessage);
        } catch (error) {
            console.error('Failed to send message:', error);
            // Remove the message if sending failed
            setMessages(prev => prev.slice(0, -1));
        }
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