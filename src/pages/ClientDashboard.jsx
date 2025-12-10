// src/pages/ClientDashboard.jsx
import { useState, useEffect } from 'react';
import { authService, taskService, reportService, notificationService } from '../services/supabaseClient';
import { getMessageWithSender, getConversations, getEligibleRecipients, getUnreadMessageCount } from '../services/messagingService';
import aiService from '../services/aiService';
import Sidebar from '../components/Sidebar';
import MessagingComponent from '../components/MessagingComponent';
import ConversationsList from '../components/ConversationsList';
import { MessageCircle, TrendingUp, CheckCircle2, Clock, Send, Plus, Bell, MessageSquare } from 'lucide-react';

export default function ClientDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [activeNotification, setActiveNotification] = useState(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [activeChatPartnerId, setActiveChatPartnerId] = useState(null);
  const [activeChatPartnerName, setActiveChatPartnerName] = useState('');
  const [showNewConversationPicker, setShowNewConversationPicker] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [staffUsers, setStaffUsers] = useState([]);

  useEffect(() => {
    loadTasks();
    loadAIChatHistory();
    loadNotifications();
    loadConversations();
    loadStaffUsers();
    // load unread messages count for badge
    (async () => {
      try {
        const cnt = await getUnreadMessageCount(user.id);
        setUnreadMessageCount(cnt || 0);
      } catch (err) {
        console.warn('Could not fetch unread message count on mount:', err);
      }
    })();
  }, []);

  const loadStaffUsers = async () => {
    try {
      const staff = await authService.getUsersByRole('staff');
      setStaffUsers(Array.isArray(staff) ? staff : []);
    } catch (err) {
      console.error('Error loading staff users:', err);
      setStaffUsers([]);
    }
  };

  const loadAIChatHistory = async () => {
    try {
      const reports = await reportService.getReports(user.id);
      const aiChats = (reports || []).filter(r => r.report_type === 'ai_chat').sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const history = aiChats.map(r => ({ role: 'assistant', message: r.content, created_at: r.created_at }));
      setChatHistory(history);
    } catch (err) {
      console.error('Error loading AI chat history:', err);
    }
  };

  const loadTasks = async () => {
    try {
      const userTasks = await taskService.getTasks(user.id);
      setTasks(userTasks);
    } catch (err) {
      console.error('Error loading tasks:', err);
    }
  };

  const loadConversations = async () => {
    try {
      const convs = await getConversations(user.id);
      setConversations(Array.isArray(convs) ? convs : []);
    } catch (err) {
      console.error('Error loading conversations:', err);
      setConversations([]);
    }
  };

  const loadNotifications = async () => {
    try {
      const notifs = await notificationService.getNotifications(user.id);
      const enriched = await Promise.all(
        (notifs || []).map(async (n) => {
          if (n.type === 'new_message' && n.related_id) {
            try {
              const msg = await getMessageWithSender(n.related_id);
              return { ...n, messageRecord: msg };
            } catch (e) {
              return n;
            }
          }
          return n;
        })
      );
      setNotifications(enriched || []);
      
      // Count unread messages
      const unreadMessages = (enriched || []).filter(n => n.type === 'new_message' && !n.read).length;
      setUnreadMessageCount(unreadMessages);
    } catch (err) {
      console.error('Error loading notifications:', err);
      setNotifications([]);
      setUnreadMessageCount(0);
    }
  };

  const markNotificationRead = async (notifId) => {
    try {
      await notificationService.markNotificationAsRead(notifId);
      setNotifications((prev) => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  const openNotificationModal = async (n) => {
    try {
      await markNotificationRead(n.id);
      let notif = n;
      if (n.type === 'new_message' && (!n.messageRecord || !n.messageRecord.sender) && n.related_id) {
        try {
          const msg = await getMessageWithSender(n.related_id);
          if (msg) notif = { ...n, messageRecord: msg };
        } catch (err) {
          console.warn('Could not fetch message with sender for modal fallback:', err);
        }
      }
      setActiveNotification(notif);
      setShowNotificationModal(true);
      setShowNotificationsDropdown(false);
    } catch (err) {
      console.error('Error opening notification modal:', err);
    }
  };

  const closeNotificationModal = () => {
    setShowNotificationModal(false);
    setActiveNotification(null);
  };

  const getInsights = async () => {
    try {
      setLoading(true);
      const data = await aiService.generateInsights(tasks);
      setInsights(data);
    } catch (err) {
      console.error('Error getting insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const askAssistant = async () => {
    if (!chatMessage.trim()) return;

    const userMessage = chatMessage;
    setChatMessage('');
    setChatHistory([...chatHistory, { role: 'user', message: userMessage }]);

    try {
      setLoading(true);
      // Pass tasks data to AI for context-aware responses
      const systemPrompt = `You are a helpful task management assistant. Here are the user's current tasks:
${tasks.map(t => `- ${t.title}: ${t.description} (Status: ${t.status})`).join('\n')}

Use this context to provide relevant and personalized responses about their tasks. Be concise and helpful.`;
      
      const response = await aiService.chatAssistant(userMessage, systemPrompt);
      setChatHistory(prev => [...prev, { role: 'assistant', message: response }]);
      // Persist AI response as a report (ai_chat) so it's permanent
      try {
        await reportService.createReport({
          user_id: user.id,
          title: `AI Chat — ${new Date().toLocaleString()}`,
          content: response,
          report_type: 'ai_chat',
        });
      } catch (repErr) {
        console.error('Failed to save AI chat as report:', repErr);
      }
      setChatResponse(response);
    } catch (err) {
      console.error('Error:', err);
      setChatHistory(prev => [...prev, { role: 'assistant', message: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const saveRecommendationAsTask = async (rec) => {
    try {
      setLoading(true);
      const newTask = await taskService.createTask({
        user_id: user.id,
        title: rec,
        description: 'Created from AI recommendation',
        status: 'pending',
        priority: 'medium',
      });
      alert('✅ Task created from recommendation');
      await loadTasks();
    } catch (err) {
      console.error('Error creating task from recommendation:', err);
      alert('Failed to create task: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await onLogout();
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status !== 'completed').length;

  return (
    <div className="flex h-screen bg-white text-gray-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} userRole="client" unreadMessages={unreadMessageCount} />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white text-gray-900 p-4 shadow z-20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Welcome, {user?.full_name}!</h1>
              <p className="text-gray-600 mt-1">Track your tasks and get AI-powered insights</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button 
                  onClick={() => { 
                    const next = !showMessagesDropdown; 
                    setShowMessagesDropdown(next); 
                    if (next) loadConversations(); 
                  }} 
                  title="Messages" 
                  className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-2 relative"
                >
                  <MessageSquare size={16} />
                  <span className="hidden sm:inline">Messages</span>
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{unreadMessageCount}</span>
                  )}
                </button>

                {showMessagesDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50 border border-gray-200">
                    <div className="p-3 flex items-center justify-between border-b">
                      <h4 className="font-semibold text-gray-900">Messages</h4>
                      <button onClick={() => setShowMessagesDropdown(false)} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {conversations.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <p>No conversations yet</p>
                          <button 
                            onClick={() => { setShowNewConversationPicker(true); setShowMessagesDropdown(false); }}
                            className="mt-2 text-blue-600 hover:underline text-sm font-medium"
                          >
                            Start a conversation
                          </button>
                        </div>
                      ) : (
                        <div>
                          {conversations.map((conv) => (
                            <button
                              key={conv.partnerId}
                              onClick={() => {
                                setActiveChatPartnerId(conv.partnerId);
                                setActiveChatPartnerName(conv.partnerName);
                                setShowChatPanel(true);
                                setShowMessagesDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900">{conv.partnerName}</p>
                                <p className="text-sm text-gray-600 truncate">{conv.partnerEmail}</p>
                              </div>
                              {conv.unreadCount > 0 && (
                                <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-2 py-1 font-bold">{conv.unreadCount}</span>
                              )}
                            </button>
                          ))}
                          <button 
                            onClick={() => { setShowNewConversationPicker(true); setShowMessagesDropdown(false); }}
                            className="w-full px-4 py-3 text-blue-600 hover:bg-blue-50 font-medium text-sm border-t"
                          >
                            + Start New Conversation
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                id="client-notifications-button"
                aria-controls="client-notifications-menu"
                aria-haspopup="true"
                aria-expanded={showNotificationsDropdown}
                onClick={() => { const next = !showNotificationsDropdown; setShowNotificationsDropdown(next); if (next) loadNotifications(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const next = !showNotificationsDropdown; setShowNotificationsDropdown(next); if (next) loadNotifications(); }
                  if (e.key === 'Escape') setShowNotificationsDropdown(false);
                }}
                title="Notifications"
                className="relative px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                <Bell size={18} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{notifications.filter(n => !n.read).length}</span>
                )}
              </button>

              {showNotificationsDropdown && (
                <div id="client-notifications-menu" role="menu" aria-labelledby="client-notifications-button" className="absolute right-6 mt-12 w-96 bg-white rounded-lg shadow-lg z-50 border">
                  <div className="p-3 flex items-center justify-between">
                    <h4 className="font-semibold">Notifications</h4>
                    <button onClick={loadNotifications} className="text-sm text-blue-600 hover:underline">Refresh</button>
                  </div>
                  <div className="px-3 pb-3 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-gray-500">No notifications</p>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map((n) => (
                          <div key={n.id} role="menuitem" tabIndex={0} className={`p-3 rounded-md border ${n.read ? 'bg-gray-50' : 'bg-gray-100 border-blue-100'}`} onKeyDown={(e)=>{ if(e.key==='Enter'){ openNotificationModal(n); } }}>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm text-gray-800">{n.message}</p>
                                {n.messageRecord?.sender && (
                                  <p className="text-xs text-gray-500">From: {n.messageRecord.sender.full_name} ({n.messageRecord.sender.role})</p>
                                )}
                                <small className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</small>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                  {!n.read && <button onClick={() => markNotificationRead(n.id)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Mark read</button>}
                                  <button onClick={() => openNotificationModal(n)} className="px-2 py-1 text-xs bg-gray-800 text-white rounded">View</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notification modal for Client */}
        {showNotificationModal && activeNotification && (
          <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center">
            <div className="bg-white max-w-lg w-full rounded-lg shadow-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Notification</h3>
                  <p className="text-sm text-gray-600">{new Date(activeNotification.created_at).toLocaleString()}</p>
                </div>
                <button onClick={closeNotificationModal} className="px-2 py-1 rounded bg-gray-200">Close</button>
              </div>
              <div className="mt-4">
                <p className="text-gray-800 mb-3">{activeNotification.message}</p>

                {activeNotification.messageRecord && (
                  <div className="p-3 bg-gray-50 rounded mb-3">
                    <p className="text-sm text-gray-700 font-semibold">From: {activeNotification.messageRecord.sender?.full_name || activeNotification.messageRecord.sender_id}</p>
                    <p className="text-sm text-gray-600 mt-2">{activeNotification.messageRecord.message}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(activeNotification.messageRecord.created_at).toLocaleString()}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={closeNotificationModal} className="px-3 py-2 bg-gray-200 rounded">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 md:p-8">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Total Tasks', value: tasks.length, icon: Clock, color: 'from-gray-800 to-gray-900' },
                  { label: 'Completed', value: completedCount, icon: CheckCircle2, color: 'from-green-500 to-green-600' },
                  { label: 'In Progress', value: pendingCount, icon: TrendingUp, color: 'from-orange-500 to-orange-600' },
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={idx}
                      className={`bg-gradient-to-br ${stat.color} rounded-lg p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 animate-fade-in cursor-pointer group`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-gray-200 text-sm font-medium">{stat.label}</p>
                          <p className="text-4xl font-bold mt-2 group-hover:scale-110 transition-transform">{stat.value}</p>
                        </div>
                        <Icon size={40} className="opacity-30 group-hover:opacity-50 transition-opacity" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tasks List */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Tasks</h2>
                {tasks.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
                    <CheckCircle2 size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No tasks yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {tasks.map((task, idx) => (
                      <div
                        key={task.id}
                        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-xl transition-all hover:translate-x-2 hover:-translate-y-1 animate-fade-in border-l-4 border-blue-500"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white">{task.title}</h4>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">{task.description}</p>
                            <div className="flex gap-2 mt-4">
                              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {task.status}
                              </span>
                            </div>
                            {/* Chat button for clients to message assigned staff */}
                            {task.user_id && task.user_id !== user.id && (
                              <div className="mt-3">
                                <button
                                  onClick={() => {
                                    const partner = staffUsers.find(c => c.id === task.user_id);
                                    if (partner && partner.role === 'guest') {
                                      alert('❌ Cannot send messages to guests');
                                      return;
                                    }
                                    setActiveChatPartnerId(task.user_id);
                                    setActiveChatPartnerName(partner ? partner.full_name : 'User');
                                    setShowChatPanel(true);
                                  }}
                                  className="mt-2 px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
                                >
                                  Chat
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Insights Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp size={28} className="text-gray-900" />
                    AI Insights
                  </h2>
                  <button
                    onClick={getInsights}
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/50"
                  >
                    {loading ? 'Generating...' : 'Get Insights'}
                  </button>
                </div>

                {insights && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-in-right">
                    {/* Performance Score */}
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white shadow-lg hover:shadow-xl transition-all md:col-span-2">
                      <p className="text-purple-100 text-sm font-medium mb-2">Overall Performance Score</p>
                      <div className="flex items-center justify-between">
                        <p className="text-5xl font-bold">{insights.performance_score || 85}<span className="text-2xl">/100</span></p>
                        <div className="text-right">
                          <p className="text-purple-100 text-sm">Keep it up! 🎉</p>
                        </div>
                      </div>
                      <div className="mt-4 w-full bg-purple-700 rounded-full h-3">
                        <div className="bg-purple-300 h-3 rounded-full transition-all duration-500" style={{ width: `${insights.performance_score || 85}%` }} />
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg md:col-span-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recommendations</h3>
                      <ul className="space-y-2">
                        {insights.recommendations?.map((rec, idx) => (
                          <li key={idx} className="flex items-start justify-between gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">
                            <div className="flex items-start gap-3">
                              <span className="text-green-500 font-bold mt-1">✓</span>
                              <span className="text-gray-700 dark:text-gray-300">{rec}</span>
                            </div>
                            <button
                              title="Create task from recommendation"
                              onClick={() => saveRecommendationAsTask(rec)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-green-100 transition"
                            >
                              <Plus size={14} className="text-green-600" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Chat Assistant */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageCircle size={28} className="text-blue-500" />
                  AI Assistant Chat
                </h2>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                  {/* Chat History */}
                  <div className="h-80 overflow-y-auto mb-4 space-y-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    {chatHistory.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-center py-8">Start a conversation with the AI assistant!</p>
                    ) : (
                      chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs px-4 py-2 rounded-lg ${
                            msg.role === 'user' 
                              ? 'bg-blue-500 text-white rounded-br-none' 
                              : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-bl-none'
                          }`}>
                            {msg.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Chat Input */}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && askAssistant()}
                      placeholder="Ask me about your tasks, insights, performance..."
                      className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={askAssistant}
                      disabled={loading || !chatMessage.trim()}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/50"
                    >
                      <Send size={20} />
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-6 animate-slide-in-right">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">All Tasks</h2>
              {tasks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
                  <CheckCircle2 size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No tasks yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasks.map((task, idx) => (
                    <div
                      key={task.id}
                      className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-xl transition-all hover:translate-x-2 hover:-translate-y-1 animate-fade-in border-l-4 border-gray-300"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white">{task.title}</h4>
                      <p className="text-gray-600 dark:text-gray-400 mt-2">{task.description}</p>
                      <div className="flex gap-2 mt-4">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                          task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Modal */}
        {showChatPanel && activeChatPartnerId && (
          <MessagingComponent
            currentUserId={user.id}
            currentUserRole={user.role}
            partnerUserId={activeChatPartnerId}
            partnerName={activeChatPartnerName}
            onClose={() => setShowChatPanel(false)}
          />
        )}

        {/* New Conversation Picker Modal */}
        {showNewConversationPicker && (
          <div className="fixed inset-0 bg-black/50 z-1000 flex items-center justify-center" onClick={() => setShowNewConversationPicker(false)}>
            <div className="bg-white rounded-lg shadow-2xl w-96 max-h-96 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <ConversationsList
                currentUserId={user.id}
                currentUserRole={user.role}
                onSelectConversation={(partnerId, partnerName) => {
                  setActiveChatPartnerId(partnerId);
                  setActiveChatPartnerName(partnerName);
                  setShowChatPanel(true);
                  setShowNewConversationPicker(false);
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}