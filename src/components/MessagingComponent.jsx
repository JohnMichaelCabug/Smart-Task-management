import React, { useState, useEffect, useRef } from 'react';
import {
  getMessages,
  sendMessage,
  markMessagesAsRead,
  subscribeToMessages,
  unsubscribeFromChannel,
  getConversations,
} from '../services/messagingService';
import { Send, X, MoreVertical } from 'lucide-react';
import '../styles/messaging.css';

const MessagingComponent = ({ currentUserId, currentUserRole, partnerUserId, partnerName, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);

  // Load messages on component mount or when partner changes
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const data = await getMessages(currentUserId, partnerUserId);
        setMessages(data);
        
        // Mark messages as read
        await markMessagesAsRead(currentUserId, partnerUserId);
      } catch (err) {
        console.error('Failed to load messages:', err);
        setError('Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // Subscribe to new messages
    if (channelRef.current) {
      unsubscribeFromChannel(channelRef.current);
    }
    channelRef.current = subscribeToMessages(currentUserId, partnerUserId, (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    return () => {
      if (channelRef.current) {
        unsubscribeFromChannel(channelRef.current);
      }
    };
  }, [currentUserId, partnerUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    try {
      setError(null);
      await sendMessage(currentUserId, partnerUserId, inputValue);
      setInputValue('');
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Failed to send message');
    }
  };

  // Check if user can send messages
  const canSendMessages = currentUserRole !== 'guest';

  return (
    <div className="messaging-modal-overlay" onClick={onClose}>
      <div className="messaging-modal" onClick={(e) => e.stopPropagation()}>
        <div className="messaging-container">
          {/* Header */}
          <div className="messaging-header">
            <div className="messaging-header-content">
              <h2 className="messaging-title">{partnerName}</h2>
              <p className="messaging-subtitle">Direct message</p>
            </div>
            <div className="messaging-header-buttons">
              <button className="messaging-menu-btn">
                <MoreVertical size={20} />
              </button>
              <button className="messaging-close-btn" onClick={onClose} title="Close chat">
                <X size={20} />
              </button>
            </div>
          </div>

      {/* Messages Area */}
      <div className="messages-area">
        {loading ? (
          <div className="messages-loading">
            <p>Loading messages...</p>
          </div>
        ) : error ? (
          <div className="messages-error">
            <p>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="messages-empty">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg) => {
              const senderName = msg.sender?.full_name || (msg.sender_id === currentUserId ? 'You' : partnerName);
              return (
                <div
                  key={msg.id}
                  className={`message-item ${msg.sender_id === currentUserId ? 'sent' : 'received'}`}
                >
                  <div className="message-content">
                    <div className="message-sender text-xs text-gray-500 mb-1">{senderName}</div>
                    <p className="message-text">{msg.message}</p>
                    <span className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="messaging-footer">
        {!canSendMessages && (
          <div className="messaging-restriction">
            <p>⚠️ Guests cannot send messages</p>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="message-input-form" style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={canSendMessages ? 'Type a message...' : 'You cannot send messages as a guest'}
            disabled={!canSendMessages}
            className="message-input"
            style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <button
            type="submit"
            disabled={!canSendMessages || !inputValue.trim()}
            className="send-message-btn"
            style={{ 
              padding: '10px 16px', 
              backgroundColor: canSendMessages && inputValue.trim() ? '#3B82F6' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: canSendMessages && inputValue.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
        </div>
      </div>
    </div>
  );
};

export default MessagingComponent;
