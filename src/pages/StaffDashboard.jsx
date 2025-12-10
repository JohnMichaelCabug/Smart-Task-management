// src/pages/StaffDashboard.jsx
import { useState, useEffect } from 'react';
import supabase, { authService, taskService, notificationService } from '../services/supabaseClient';
import { PDFDownloadLink } from '@react-pdf/renderer';
import aiService from '../services/aiService';
import { pdfService } from '../services/pdfService';
import Sidebar from '../components/Sidebar';
import AIChatAssistant from '../components/AIChatAssistant';
import MessagingComponent from '../components/MessagingComponent';
import ConversationsList from '../components/ConversationsList';
import { getMessageWithSender, getConversations, getUnreadMessageCount } from '../services/messagingService';
import { Plus, CheckCircle2, Sparkles, Download, Bell, MessageSquare } from 'lucide-react';

// Small AddTodo inline component
function AddTodo({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a quick todo"
        className="flex-1 px-3 py-2 border rounded"
      />
      <button
        onClick={() => { onAdd(text); setText(''); }}
        className="px-3 py-2 bg-blue-600 text-white rounded"
      >Add</button>
    </div>
  );
}

export default function StaffDashboard({ user, onLogout, isAdminViewing = false, setViewingAsRole = null }) {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('tasks');
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [activeChatPartnerId, setActiveChatPartnerId] = useState(null);
  const [activeChatPartnerName, setActiveChatPartnerName] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [todos, setTodos] = useState([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [activeNotification, setActiveNotification] = useState(null);
  const [showNewConversationPicker, setShowNewConversationPicker] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [staffConversations, setStaffConversations] = useState([]);
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);

  useEffect(() => {
    // load clients for assignment and initial tasks
    loadClients();
    loadTasks();
    loadNotifications();
    loadTodos();
    // load unread count
    (async () => {
      try {
        const cnt = await getUnreadMessageCount(user.id);
        setUnreadMessageCount(cnt || 0);
      } catch (err) {
        console.warn('Could not fetch unread message count for staff:', err);
      }
    })();
  }, [user.id]);

  useEffect(() => {
    // reload tasks when selected client changes
    loadTasks();
  }, [selectedClientId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const targetUserId = selectedClientId || user.id;
      const userTasks = await taskService.getTasks(targetUserId);
      console.log('✅ Tasks loaded for:', targetUserId, userTasks);
      setTasks(Array.isArray(userTasks) ? userTasks : []);
    } catch (err) {
      console.error('❌ Error loading tasks:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const notifs = await notificationService.getNotifications(user.id);
      const enriched = await Promise.all(
        (notifs || []).map(async (n) => {
          if (n.type === 'new_message' && n.related_id) {
            try {
              const { data: msg } = await supabase
                .from('messages')
                .select('*, sender:sender_id(id,full_name, role)')
                .eq('id', n.related_id)
                .single();
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

  const loadTodos = () => {
    try {
      const key = `staff_todos_${user.id}`;
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setTodos(parsed || []);
    } catch (err) {
      setTodos([]);
    }
  };

  const saveTodos = (next) => {
    try {
      const key = `staff_todos_${user.id}`;
      localStorage.setItem(key, JSON.stringify(next));
      setTodos(next);
    } catch (err) {
      console.error('Error saving todos:', err);
    }
  };

  const loadStaffConversations = async () => {
    try {
      const convs = await getConversations(user.id);
      setStaffConversations(Array.isArray(convs) ? convs : []);
    } catch (err) {
      console.error('Error loading staff conversations:', err);
      setStaffConversations([]);
    }
  };

  const addTodo = (text) => {
    if (!text || !text.trim()) return;
    const next = [{ id: Date.now(), text: text.trim(), done: false }, ...todos];
    saveTodos(next);
  };

  const toggleTodo = (id) => {
    const next = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    saveTodos(next);
  };

  const removeTodo = (id) => {
    const next = todos.filter(t => t.id !== id);
    saveTodos(next);
  };

  const scrollToCreateTask = () => {
    const el = document.getElementById('create-task-form');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const openNewMessagePicker = () => setShowNewConversationPicker(true);

  const handleSelectConversationFromPicker = (partnerId, partnerName) => {
    setShowNewConversationPicker(false);
    setActiveChatPartnerId(partnerId);
    setActiveChatPartnerName(partnerName);
    setShowChatPanel(true);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const viewNotification = async (n) => {
    try {
      await markNotificationRead(n.id);
      // close dropdown if open
      setShowNotificationsDropdown(false);
      // If this notification has an associated message, open the chat with the sender
      if (n.messageRecord) {
        const senderId = n.messageRecord.sender?.id || n.messageRecord.sender_id;
        const senderName = n.messageRecord.sender?.full_name || 'Conversation';
        if (senderId) {
          setActiveChatPartnerId(senderId);
          setActiveChatPartnerName(senderName);
          setShowChatPanel(true);
          return;
        }
      }

      // If it's a task update, try to focus or alert
      if (n.type === 'task_update' && n.related_id) {
        // navigate to tasks tab, open the Create Task form and scroll to it
        setActiveTab('tasks');
        setShowCreateTask(true);
        setTimeout(() => scrollToCreateTask(), 150);
        return;
      }
    } catch (err) {
      console.error('Error viewing notification:', err);
    }
  };

  const openNotificationModal = async (n) => {
    try {
      // mark read and set as active
      await markNotificationRead(n.id);
      let notif = n;
      // If there's a related message but no sender info, fetch it with sender
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

  const loadClients = async () => {
    try {
      const data = await authService.getUsersByRole('client');
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('❌ Error loading clients:', err);
      setClients([]);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      alert('❌ Please enter a task title');
      return;
    }

    try {
      setLoading(true);
      const assigneeId = selectedClientId || user.id;
      const newTask = await taskService.createTask({
        user_id: assigneeId,
        title: newTaskTitle,
        description: newTaskDesc,
        status: 'pending',
        priority: 'medium',
        due_date: new Date().toISOString(),
      });

      console.log('✅ Task created:', newTask);
      setTasks([newTask, ...tasks]);
      setNewTaskTitle('');
      setNewTaskDesc('');
      alert('✅ Task created successfully!');
    } catch (err) {
      console.error('❌ Error creating task:', err);
      alert('Error creating task: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAISuggestions = async () => {
    if (!newTaskDesc.trim()) {
      alert('❌ Please describe a task first');
      return;
    }

    try {
      setLoading(true);
      const suggestions = await aiService.generateTaskSuggestions(newTaskDesc);
      console.log('✅ AI suggestions:', suggestions);
      setAiSuggestions(suggestions);
    } catch (err) {
      console.error('❌ Error getting AI suggestions:', err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await taskService.updateTask(taskId, { 
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      console.log('✅ Task updated:', taskId);
      await loadTasks();
    } catch (err) {
      console.error('❌ Error updating task:', err);
      alert('Error updating task: ' + err.message);
    }
  };

  const handleLogout = async () => {
    await onLogout();
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;

  return (
    <div className="flex h-screen bg-white text-gray-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} userRole="staff" />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white text-gray-900 p-4 shadow z-20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Staff Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome, {user?.full_name} | Manage your tasks efficiently</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !showCreateTask;
                  setShowCreateTask(next);
                  if (next) {
                    // ensure tasks tab is visible and scroll into view after render
                    setActiveTab('tasks');
                    setTimeout(() => scrollToCreateTask(), 150);
                  }
                }}
                title="Add Task"
                className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-2"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Task</span>
              </button>
              <div className="relative">
                <button 
                  onClick={() => { 
                    const next = !showMessagesDropdown; 
                    setShowMessagesDropdown(next); 
                    if (next) loadStaffConversations(); 
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
                      {staffConversations.length === 0 ? (
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
                          {staffConversations.map((conv) => (
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
              <div className="relative">
                <button onClick={() => {
                    const next = !showNotificationsDropdown;
                    setShowNotificationsDropdown(next);
                    if (next) loadNotifications();
                  }} title="Notifications" className="relative px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>
                  )}
                </button>

                {/* Dropdown */}
                {showNotificationsDropdown && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg z-50 border">
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
                            <div key={n.id} className={`p-3 rounded-md border ${n.read ? 'bg-gray-50' : 'bg-gray-100 border-blue-100'}`}>
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
                                    <button onClick={() => { openNotificationModal(n); }} className="px-2 py-1 text-xs bg-gray-800 text-white rounded">View</button>
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
        </div>

        {/* Content */}
        <div className="p-6 md:p-8">
          {/* Admin Viewing Banner */}
          {isAdminViewing && (
            <div className="absolute top-6 right-6 bg-yellow-500/20 border border-yellow-400 px-4 py-2 rounded-lg z-30">
              <p className="text-yellow-300 text-sm font-semibold">👁️ Admin Viewing - You are viewing as {user.role.toUpperCase()}</p>
              <button
                onClick={() => {
                  setViewingAsRole(null);
                  window.location.href = '/dashboard';
                }}
                className="mt-2 px-3 py-1 bg-yellow-500 text-gray-900 rounded text-xs font-semibold hover:bg-yellow-400 transition-all"
              >
                ← Back to Admin
              </button>
            </div>
          )}

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

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-8">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Total Tasks', value: tasks.length, color: 'from-gray-800 to-gray-900' },
                  { label: 'Completed', value: completedCount, color: 'from-green-500 to-green-600' },
                  { label: 'In Progress', value: inProgressCount, color: 'from-orange-500 to-orange-600' },
                ].map((stat, idx) => (
                  <div key={idx} className={`bg-gradient-to-br ${stat.color} rounded-lg p-6 text-white shadow-lg transform hover:-translate-y-1 transition-all`}>
                    <p className="text-gray-200 text-sm font-medium">{stat.label}</p>
                    <p className="text-4xl font-bold mt-2">{stat.value}</p>
                  </div>
                ))}
              </div>

                {/* To-Do List for Staff (notifications moved to header dropdown) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg shadow-lg p-4 border-2 border-gray-100 md:col-span-2">
                    <h3 className="font-bold text-lg mb-3">My To-Do List</h3>
                    <AddTodo onAdd={addTodo} />
                    {todos.length === 0 ? (
                      <p className="text-sm text-gray-500 mt-3">No todos yet</p>
                    ) : (
                      <ul className="space-y-2 mt-3">
                        {todos.map(t => (
                          <li key={t.id} className="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-3">
                              <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} />
                              <span className={`${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.text}</span>
                            </div>
                            <button onClick={() => removeTodo(t.id)} className="text-xs text-red-500">Remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

              {/* Create Task Form (hidden by default, toggled from header) */}
              {showCreateTask && (
                <div id="create-task-form" className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Plus size={24} className="text-gray-900" />
                  Create New Task
                </h2>
                <div className="mb-4">
                  <button onClick={() => setShowAIChat(true)} className="px-3 py-2 bg-black text-white rounded">Open AI Assistant</button>
                </div>
                <form onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">Assign To</label>
                      <select
                        value={selectedClientId || ''}
                        onChange={(e) => setSelectedClientId(e.target.value || null)}
                          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-gray-900 focus:outline-none dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">My Tasks (self)</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>
                        ))}
                      </select>
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">Task Title *</label>
                    <input
                      type="text"
                      placeholder="Enter task title"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-gray-900 focus:outline-none dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">Description</label>
                    <textarea
                      placeholder="Describe your task (helpful for AI suggestions)"
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      rows={4}
                        className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-gray-900 focus:outline-none dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={20} />
                      {loading ? 'Creating...' : 'Create Task'}
                    </button>
                    <button
                      type="button"
                      onClick={getAISuggestions}
                      disabled={loading || !newTaskDesc.trim()}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles size={20} />
                      {loading ? 'Getting Help...' : 'Get AI Help'}
                    </button>
                  </div>
                </form>
                </div>
              )}

              {/* AI Suggestions */}
              {aiSuggestions && (
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/40 rounded-lg p-6 border-2 border-purple-300 dark:border-purple-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Sparkles size={24} className="text-purple-500" />
                    AI Suggestions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Estimated Time</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{aiSuggestions.estimated_time || 'N/A'}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Priority Level</p>
                      <p className="text-lg font-bold text-red-500">{aiSuggestions.priority_level || 'Medium'}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Subtasks</p>
                      <p className="text-lg font-bold text-gray-900">{aiSuggestions.subtasks?.length || 0}</p>
                    </div>
                  </div>
                  {aiSuggestions.subtasks && aiSuggestions.subtasks.length > 0 && (
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2">Suggested Subtasks:</h4>
                      <ul className="space-y-2">
                        {aiSuggestions.subtasks.map((subtask, idx) => (
                          <li key={idx} className="flex items-start gap-3 bg-white dark:bg-gray-800 p-3 rounded-lg">
                            <span className="text-purple-500 font-bold">✓</span>
                            <span className="text-gray-700 dark:text-gray-300">{subtask}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {showAIChat && (
                <AIChatAssistant userId={user?.id} onClose={() => setShowAIChat(false)} />
              )}

              {/* Conversation picker modal */}
              {showNewConversationPicker && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="w-full max-w-3xl bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">Start Conversation</h3>
                      <button onClick={() => setShowNewConversationPicker(false)} className="px-3 py-1 rounded bg-gray-200">Close</button>
                    </div>
                    <ConversationsList currentUserId={user.id} currentUserRole={user.role} onSelectConversation={handleSelectConversationFromPicker} />
                  </div>
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Tasks</h2>
                {tasks.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
                    <CheckCircle2 size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No tasks yet. Create one above!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {tasks.map((task, idx) => (
                      <div
                        key={task.id}
                        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-xl transition-all border-l-4 border-gray-300 animate-fade-in"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white">{task.title}</h4>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">{task.description}</p>
                            <p className="text-sm text-gray-500 mt-2">Assigned to: {
                              task.user_id === user.id ? user.full_name : (
                                (clients.find(c => c.id === task.user_id) || {}).full_name || 'Unknown'
                              )
                            }</p>
                            <div className="flex gap-2 mt-4">
                              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {task.status || 'pending'}
                              </span>
                              {task.priority && (
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                  task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                  task.priority === 'medium' ? 'bg-orange-100 text-orange-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {task.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3 ml-4">
                            <select
                            value={task.status || 'pending'}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                            className="ml-4 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                            {/* Chat button: only show if task assigned to someone else */}
                            {task.user_id && task.user_id !== user.id && (
                              <button
                                onClick={() => {
                                  const partner = clients.find(c => c.id === task.user_id);
                                  setActiveChatPartnerId(task.user_id);
                                  setActiveChatPartnerName(partner ? partner.full_name : 'User');
                                  setShowChatPanel(true);
                                }}
                                className="mt-2 px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
                              >
                                Chat
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notification detail modal */}
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
                    {activeNotification.messageRecord && (
                      <button
                        onClick={() => {
                          const senderId = activeNotification.messageRecord.sender?.id || activeNotification.messageRecord.sender_id;
                          const senderName = activeNotification.messageRecord.sender?.full_name || 'Conversation';
                          if (senderId) {
                            setActiveChatPartnerId(senderId);
                            setActiveChatPartnerName(senderName);
                            setShowChatPanel(true);
                            closeNotificationModal();
                          }
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded"
                      >
                        Open Chat
                      </button>
                    )}

                    {activeNotification.type === 'task_update' && (
                      <button
                        onClick={() => {
                          setActiveTab('tasks');
                          setShowCreateTask(true);
                          setTimeout(() => scrollToCreateTask(), 150);
                          closeNotificationModal();
                        }}
                        className="px-3 py-2 bg-green-600 text-white rounded"
                      >
                        Open Task
                      </button>
                    )}

                    <button onClick={closeNotificationModal} className="px-3 py-2 bg-gray-200 rounded">Close</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeTab === 'reports' && (
            <div className="space-y-6 animate-slide-in-right max-w-2xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg text-center">
                <Download size={48} className="mx-auto text-gray-900 mb-4" />
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Generate Reports</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Download your task reports in PDF format.</p>
                {tasks.length > 0 ? (
                  <PDFDownloadLink
                    document={pdfService.generateTaskReportPDF(tasks, user.full_name)}
                    fileName={`${user.full_name}-tasks-report.pdf`}
                    className="inline-block px-8 py-3 bg-black text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                  >
                    📄 Download My Tasks Report
                  </PDFDownloadLink>
                ) : (
                  <button disabled className="inline-block px-8 py-3 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed">
                    No tasks to download
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}