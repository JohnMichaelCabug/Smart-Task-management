import React, { useEffect, useState } from 'react';
import supabase, { taskService, notificationService } from '../services/supabaseClient';
import aiService from '../services/aiService';
import { pdfService } from '../services/pdfService';
import { Sparkles, Download, Users, CheckCircle, AlertCircle, Loader, MessageCircle, ArrowLeft } from 'lucide-react';

export default function UserProfile({ userId, currentUser, onClose }) {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [showConversations, setShowConversations] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        if (error) throw error;
        if (!mounted) return;
        setUser(data);

        // fetch tasks for user (for reports/insights)
        const t = await taskService.getTasks(userId);
        if (!mounted) return;
        setTasks(t || []);
      } catch (err) {
        console.error('Error loading user profile:', err);
        setError(err.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [userId]);

  const handleGenerateInsights = async () => {
    setAiLoading(true);
    try {
      const result = await aiService.generateInsights(tasks || []);
      setInsights(result);
    } catch (err) {
      console.error('AI insights error:', err);
      setError(err.message || String(err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadSummary = async () => {
    try {
      if (!user) {
        throw new Error('No user loaded to generate summary');
      }
      const doc = pdfService.generateCustomReportPDF(`${user.full_name} - Personal Summary`, [
        { title: 'Profile', content: `Name: ${user.full_name}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: ${user.status}` },
        { title: 'Bio', content: user.bio || 'No bio provided' },
        { title: 'Recent Tasks', content: tasks.slice(0, 10).map(t => `${t.title} — ${t.status} — ${t.priority}`) },
        { title: 'AI Insights', content: insights ? JSON.stringify(insights, null, 2) : 'No insights generated' }
      ]);

      // Render & download using react-pdf's PDFDownloadLink is left to the caller (component) or you can integrate PDF rendering in place.
      // For now, return the doc object so a parent component can render it.
      return doc;
    } catch (err) {
      console.error('PDF generation error:', err);
      setError(err.message || String(err));
    }
  };

  // Fetch messages involving this user (admin only)
  const handleStalkConversations = async () => {
    setConversationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:sender_id(full_name, email), recipient:recipient_id(full_name, email)')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setConversations(data || []);
      setShowConversations(true);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err.message || String(err));
    } finally {
      setConversationsLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-gray-800 via-gray-900 to-black rounded-2xl shadow-2xl border border-gray-700">
        {/* Header with gradient background */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 p-6 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Users size={20} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white">User Profile</h3>
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-200 backdrop-blur-sm"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader size={40} className="text-blue-400 animate-spin mb-4" />
              <p className="text-gray-400">Loading profile...</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-700 rounded-lg">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300">{error}</p>
            </div>
          ) : user ? (
            <div className="space-y-6">
              {/* User Header Card */}
              <div className="bg-gradient-to-r from-gray-700/50 to-gray-800/50 rounded-xl p-6 border border-gray-600 backdrop-blur-sm">
                <div className="flex items-start gap-6">
                  <div className="relative">
                    <img 
                      src={user.avatar_url || '/default-avatar.png'} 
                      alt="avatar" 
                      className="w-20 h-20 rounded-xl object-cover ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900" 
                    />
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-gray-900 ${user.status === 'approved' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white mb-1">{user.full_name}</h2>
                    <p className="text-blue-300 text-sm mb-2">{user.email}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-blue-600/30 text-blue-200 rounded-full text-sm border border-blue-500/30">
                        {user.role}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm border ${user.status === 'approved' ? 'bg-green-600/30 text-green-200 border-green-500/30' : 'bg-yellow-600/30 text-yellow-200 border-yellow-500/30'}`}>
                        {user.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              {user.bio && (
                <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600">
                  <h4 className="font-semibold text-gray-200 mb-2">About</h4>
                  <p className="text-gray-300">{user.bio}</p>
                </div>
              )}

              {/* Recent Tasks Section */}
              <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600">
                <h4 className="font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-400" />
                  Recent Tasks
                </h4>
                {tasks.length === 0 ? (
                  <p className="text-gray-400 text-sm">No tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.slice(0, 6).map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition">
                        <div className={`w-2 h-2 rounded-full ${t.status === 'completed' ? 'bg-green-500' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 truncate text-sm">{t.title}</p>
                          <p className="text-gray-500 text-xs">{t.priority} priority</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded font-medium ${t.status === 'completed' ? 'bg-green-600/30 text-green-300' : t.status === 'in_progress' ? 'bg-blue-600/30 text-blue-300' : 'bg-gray-600/30 text-gray-300'}`}>
                          {t.status}
                        </span>
                      </div>
                    ))}
                    {tasks.length > 6 && <p className="text-gray-400 text-xs mt-2">+{tasks.length - 6} more tasks</p>}
                  </div>
                )}
              </div>

              {/* AI Insights Section */}
              {insights && (
                <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 rounded-xl p-4 border border-purple-600/30 backdrop-blur-sm">
                  <h4 className="font-semibold text-purple-200 mb-3 flex items-center gap-2">
                    <Sparkles size={18} className="text-purple-400" />
                    AI Insights
                  </h4>
                  <div className="bg-gray-800/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{JSON.stringify(insights, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleGenerateInsights}
                  disabled={aiLoading}
                  className="group relative px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/50"
                >
                  {aiLoading ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate AI Insights
                    </>
                  )}
                </button>

                <button
                  onClick={async () => {
                    const doc = await handleDownloadSummary();
                    window.__lastGeneratedPDF = doc;
                    alert('PDF document created. Use react-pdf to render/download.');
                  }}
                  className="group relative px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-green-500/50"
                >
                  <Download size={18} />
                  Download Summary
                </button>

                {currentUser && currentUser.role === 'admin' && (
                  <>
                    <button
                      onClick={handleStalkConversations}
                      disabled={conversationsLoading}
                      className="group relative px-6 py-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-pink-500/50"
                    >
                      {conversationsLoading ? (
                        <>
                          <Loader size={18} className="animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <MessageCircle size={18} />
                          View Conversations
                        </>
                      )}
                    </button>

                    <button
                      onClick={async () => {
                        setApproving(true);
                        try {
                          const { data, error } = await supabase.from('users').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', userId).select().single();
                          if (error) throw error;
                          setUser(prev => prev ? { ...prev, status: 'approved' } : prev);

                          try {
                            await notificationService.createNotification(userId, 'approval', 'Your account has been approved', userId);
                          } catch (nerr) {
                            console.warn('Notification creation failed (non-critical):', nerr);
                          }

                          alert('User approved and notified');
                        } catch (err) {
                          console.error('Approve user error:', err);
                          alert('Failed to approve user: ' + (err.message || String(err)));
                        } finally {
                          setApproving(false);
                        }
                      }}
                      disabled={approving}
                      className="group relative px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-yellow-500/50"
                    >
                      {approving ? (
                        <>
                          <Loader size={18} className="animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={18} />
                          Approve User
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

              {showConversations && (
                <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600 mt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <button 
                      onClick={() => setShowConversations(false)}
                      className="p-2 hover:bg-gray-600 rounded-lg transition text-gray-400 hover:text-gray-200"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <h4 className="font-semibold text-gray-200 flex items-center gap-2">
                      <MessageCircle size={18} className="text-pink-400" />
                      Conversations ({conversations.length})
                    </h4>
                  </div>
                  
                  {conversations.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No conversations found</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {conversations.map((msg, idx) => {
                        const isUserSender = msg.sender_id === userId;
                        const otherParty = isUserSender ? msg.recipient : msg.sender;
                        return (
                          <div key={idx} className="p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition">
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <div className="flex-1">
                                <p className="text-xs text-gray-400">
                                  {isUserSender ? 'To:' : 'From:'} <span className="text-gray-300">{otherParty?.full_name || 'Unknown'}</span>
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 flex-shrink-0">
                                {new Date(msg.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 break-words">{msg.content}</p>
                            {msg.read && <p className="text-xs text-green-400 mt-1">✓ Read</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
