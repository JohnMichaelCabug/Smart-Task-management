import React, { useState, useEffect, useRef } from 'react';
import {
  getConversations,
  getEligibleRecipients,
  subscribeToConversations,
  unsubscribeFromChannel,
} from '../services/messagingService';
import { MessageCircle, Plus, Search } from 'lucide-react';
import '../styles/conversations.css';

const ConversationsList = ({ currentUserId, currentUserRole, onSelectConversation }) => {
  const [conversations, setConversations] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const channelRef = useRef(null);

  // Load conversations and eligible recipients
  useEffect(() => {
    // Do nothing until we have a valid user id
    if (!currentUserId) return;

    loadConversations();
    loadEligibleRecipients();

    // Subscribe to new messages
    if (channelRef.current) {
      unsubscribeFromChannel(channelRef.current);
    }
    channelRef.current = subscribeToConversations(currentUserId, () => {
      loadConversations();
    });

    return () => {
      if (channelRef.current) {
        unsubscribeFromChannel(channelRef.current);
      }
    };
  }, [currentUserId, currentUserRole]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Loading conversations for user:', currentUserId);
      
      const data = await getConversations(currentUserId);
      
      if (!data) {
        console.warn('⚠️ No data returned from getConversations');
        setConversations([]);
      } else {
        console.log(`✅ Loaded ${data.length} conversations`);
        setConversations(data);
      }
    } catch (err) {
      console.error('❌ Failed to load conversations:', err);
      console.error('📋 Full error:', JSON.stringify(err, null, 2));
      setError('Failed to load conversations: ' + (err.message || 'Unknown error'));
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEligibleRecipients = async () => {
    try {
      console.log('🔄 Loading eligible recipients for role:', currentUserRole);
      const data = await getEligibleRecipients(currentUserId, currentUserRole);
      
      if (data) {
        console.log(`✅ Loaded ${data.length} eligible recipients`);
        setEligibleUsers(data);
      } else {
        setEligibleUsers([]);
      }
    } catch (err) {
      console.error('❌ Failed to load eligible recipients:', err);
      setEligibleUsers([]);
    }
  };

  // Filter conversations by search term
  const filteredConversations = conversations.filter(
    (conv) =>
      conv.partnerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.partnerEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter eligible users by search term
  const filteredEligibleUsers = eligibleUsers.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartConversation = (userId, userName) => {
    onSelectConversation(userId, userName);
    setShowNewConversation(false);
    setSearchTerm('');
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return '#ff6b6b';
      case 'staff':
        return '#4ecdc4';
      case 'client':
        return '#45b7d1';
      case 'guest':
        return '#999999';
      default:
        return '#666666';
    }
  };

  const canSendMessages = currentUserRole !== 'guest';

  return (
    <div className="conversations-container">
      {/* Header */}
      <div className="conversations-header">
        <h2 className="conversations-title">
          <MessageCircle size={20} /> Messages
        </h2>
        {canSendMessages && (
          <button
            className="new-conversation-btn"
            onClick={() => setShowNewConversation(!showNewConversation)}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="conversations-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={showNewConversation ? "Search users..." : "Search conversations..."}
          value={searchTerm}
          onChange={handleSearchChange}
          className="search-input"
        />
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="search-clear-btn"
            title="Clear search"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px' }}
          >
            ×
          </button>
        )}
      </div>

      {/* New Conversation View */}
      {showNewConversation && (
        <div className="new-conversation-panel">
          <h3>Start a New Conversation</h3>
          <div className="eligible-users-list">
            {filteredEligibleUsers.length === 0 ? (
              <p className="no-users-text">
                {currentUserRole === 'guest'
                  ? 'Guests cannot send messages'
                  : 'No available users to message'}
              </p>
            ) : (
              filteredEligibleUsers.map((user) => (
                <button
                  key={user.id}
                  className="eligible-user-item"
                  onClick={() => handleStartConversation(user.id, user.full_name)}
                >
                  <div className="user-avatar">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.full_name} />
                    ) : (
                      <span>{user.full_name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="user-info">
                    <p className="user-name">{user.full_name}</p>
                    <p className="user-email">{user.email}</p>
                  </div>
                  <span
                    className="user-role-badge"
                    style={{ backgroundColor: getRoleColor(user.role) }}
                  >
                    {user.role}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="conversations-list">
        {loading ? (
          <div className="conversations-loading">
            <p>Loading conversations...</p>
          </div>
        ) : error ? (
          <div className="conversations-error">
            <p>{error}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="conversations-empty">
            <p>No conversations yet</p>
            {canSendMessages && (
              <button onClick={() => setShowNewConversation(true)} className="start-btn">
                Start a conversation
              </button>
            )}
          </div>
        ) : (
          filteredConversations.map((conversation) => (
            <div key={conversation.partnerId} className="conversation-item">
              <div className="conversation-avatar">
                {conversation.partnerAvatar ? (
                  <img src={conversation.partnerAvatar} alt={conversation.partnerName} />
                ) : (
                  <span>{conversation.partnerName.charAt(0)}</span>
                )}
              </div>
              <div className="conversation-content">
                <div className="conversation-header">
                  <p className="conversation-name">{conversation.partnerName}</p>
                  {conversation.lastMessage && (
                    <span className="conversation-time">
                      {new Date(conversation.lastMessage.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <div className="conversation-preview">
                  {conversation.lastMessage && (
                    <p
                      className={`preview-text ${
                        conversation.unreadCount > 0 ? 'unread' : ''
                      }`}
                    >
                      {conversation.lastMessage.message.substring(0, 50)}...
                    </p>
                  )}
                </div>
              </div>
              {conversation.unreadCount > 0 && (
                <div className="unread-badge">{conversation.unreadCount}</div>
              )}
              <button
                className="chat-button"
                onClick={() => onSelectConversation(conversation.partnerId, conversation.partnerName)}
                title="Open chat"
              >
                💬
              </button>
            </div>
          ))
        )}
      </div>

      {!canSendMessages && (
        <div className="messaging-restriction-banner">
          <p>⚠️ You cannot send messages as a guest. Upgrade your account to start messaging.</p>
        </div>
      )}
    </div>
  );
};

export default ConversationsList;
