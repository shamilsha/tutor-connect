import React, { useState, useEffect, useRef } from 'react';
import '../styles/ChatPanel.css';

const ChatPanel = ({ user, provider, peers, onSendMessage, chatMessages = [] }) => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const messagesEndRef = useRef(null);

    // Update messages when chatMessages prop changes (from DashboardPage)
    useEffect(() => {
        console.log('ChatPanel: Received chatMessages prop', {
            chatMessagesLength: chatMessages.length,
            chatMessages: chatMessages
        });
        
        if (chatMessages.length > 0) {
            setMessages(chatMessages);
            console.log('ChatPanel: Set messages from chatMessages prop', chatMessages);
        } else {
            setMessages([]);
            console.log('ChatPanel: Cleared messages - no chatMessages');
        }
    }, [chatMessages]);

    // Send message function
    const sendMessage = async () => {
        if (!inputMessage.trim() || !onSendMessage) return;

        const newMessage = {
            content: inputMessage,
            sender: user?.email || 'You',
            timestamp: new Date().toISOString(),
            type: 'sent'
        };

        setInputMessage('');

        // Send to peer via WebRTC (DashboardPage will handle adding to chatMessages)
        try {
            await onSendMessage(newMessage);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

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
                <button onClick={sendMessage} title="Send message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default ChatPanel; 