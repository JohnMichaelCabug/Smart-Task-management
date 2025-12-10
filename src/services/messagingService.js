import supabase from './supabaseClient';

// Get all conversations for the current user
export const getConversations = async (userId) => {
  try {
    // guard: if no userId provided, return empty conversations instead of building a malformed query
    if (!userId) {
      console.warn('⚠️ No userId provided to getConversations');
      return [];
    }

    console.log('📖 Loading conversations for user:', userId);
    
    // Get unique conversation partners (both senders and recipients)
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, recipient_id, created_at, read, message')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error loading messages for conversations:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('ℹ️ No conversations found for user:', userId);
      return [];
    }

    console.log(`✅ Loaded ${data.length} messages`);

    // Get unique user IDs from conversations
    const conversationUsers = new Set();
    data.forEach((msg) => {
      if (msg.sender_id && msg.sender_id !== userId) conversationUsers.add(msg.sender_id);
      if (msg.recipient_id && msg.recipient_id !== userId) conversationUsers.add(msg.recipient_id);
    });

    // Fetch user details for conversation partners
    const userIds = Array.from(conversationUsers);
    if (userIds.length === 0) {
      console.log('ℹ️ No conversation partners found');
      return [];
    }

    console.log('👥 Fetching details for users:', userIds);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('id', userIds);

    if (userError) {
      console.error('❌ Error fetching user details:', userError);
      // don't throw here; fall back to building conversations from messages
    }

    // Build a map of fetched users for quick lookup
    const usersMap = {};
    if (users && users.length > 0) {
      users.forEach((u) => {
        usersMap[u.id] = u;
      });
      console.log(`✅ Loaded ${users.length} user details`);
    } else {
      console.warn('⚠️ No users found for conversation partners — using message-based fallbacks');
    }

    // Map messages to conversation objects with last message and unread count
    const conversations = userIds.map((partnerId) => {
      const user = usersMap[partnerId] || {
        id: partnerId,
        full_name: 'Unknown User',
        email: null,
        role: 'unknown',
        avatar_url: null,
      };

      const userMessages = data.filter(
        (msg) =>
          (msg.sender_id === userId && msg.recipient_id === partnerId) ||
          (msg.sender_id === partnerId && msg.recipient_id === userId)
      );

      const lastMessage = userMessages[0];
      const unreadCount = userMessages.filter(
        (msg) => msg.recipient_id === userId && !msg.read
      ).length;

      return {
        partnerId: user.id,
        partnerName: user.full_name,
        partnerEmail: user.email,
        partnerRole: user.role,
        partnerAvatar: user.avatar_url,
        lastMessage: lastMessage,
        unreadCount,
      };
    });

    const sorted = conversations.sort(
      (a, b) =>
        new Date(b.lastMessage?.created_at || 0) -
        new Date(a.lastMessage?.created_at || 0)
    );

    console.log(`✅ Returning ${sorted.length} conversations`);
    return sorted;
  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    console.error('📋 Full error details:', JSON.stringify(error, null, 2));
    return [];
  }
};

// Get messages between two users
export const getMessages = async (userId, partnerId) => {
  try {
    console.log(`📨 Loading messages between ${userId} and ${partnerId}`);
    
    // return messages including sender relation so UI can show sender name/avatar
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id,full_name,role)')
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching messages:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw error;
    }

    console.log(`✅ Loaded ${data?.length || 0} messages`);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    console.error('📋 Full error details:', JSON.stringify(error, null, 2));
    return [];
  }
};

// Get a single message with sender relation populated
export const getMessageWithSender = async (messageId) => {
  try {
    console.log(`📨 Loading message: ${messageId}`);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id,full_name, role)')
      .eq('id', messageId)
      .single();

    if (error) {
      console.error('❌ Error fetching message with sender:', error);
      throw error;
    }

    console.log('✅ Message loaded successfully');
    return data;
  } catch (error) {
    console.error('❌ Error fetching message with sender:', error);
    return null;
  }
};

// Send a message
export const sendMessage = async (senderId, recipientId, messageText) => {
  try {
    console.log(`✉️ Sending message from ${senderId} to ${recipientId}`);

    if (!senderId || !recipientId || !messageText.trim()) {
      throw new Error('Missing required fields for sending message');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          sender_id: senderId,
          recipient_id: recipientId,
          message: messageText,
          message_type: 'user_message',
          read: false,
        },
      ])
      .select();

    if (error) {
      console.error('❌ Error sending message:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw error;
    }

    console.log('✅ Message sent successfully');
    return data[0];
  } catch (error) {
    console.error('❌ Error sending message:', error);
    throw error;
  }
};

// Mark messages as read
export const markMessagesAsRead = async (userId, senderId) => {
  try {
    console.log(`✓ Marking messages as read for user ${userId} from sender ${senderId}`);
    
    const { error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('recipient_id', userId)
      .eq('sender_id', senderId);

    if (error) {
      console.error('❌ Error marking messages as read:', error);
      throw error;
    }

    console.log('✅ Messages marked as read');
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    // Don't throw - this is non-critical
  }
};

// Delete a message
export const deleteMessage = async (messageId) => {
  try {
    console.log(`🗑️ Deleting message: ${messageId}`);
    
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('❌ Error deleting message:', error);
      throw error;
    }

    console.log('✅ Message deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    throw error;
  }
};

// Get eligible recipients based on user role
export const getEligibleRecipients = async (userId, userRole) => {
  try {
    console.log(`👥 Fetching eligible recipients for ${userRole} user ${userId}`);

    let query = supabase.from('users').select('id, full_name, email, role');

    // Filter based on sender's role
    if (userRole === 'admin' || userRole === 'staff') {
      // Can message other admin/staff and clients
      query = query.or(`role.eq.admin,role.eq.staff,role.eq.client`);
    } else if (userRole === 'client') {
      // Can only message staff
      query = query.eq('role', 'staff');
    } else {
      // Guests cannot message anyone
      console.log('ℹ️ Guests cannot message anyone');
      return [];
    }

    // Exclude the user themselves
    const { data, error } = await query.neq('id', userId);

    if (error) {
      console.error('❌ Error fetching eligible recipients:', error);
      throw error;
    }

    console.log(`✅ Loaded ${data?.length || 0} eligible recipients`);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching eligible recipients:', error);
    return [];
  }
};

// Subscribe to new messages in real-time
export const subscribeToMessages = (userId, recipientId, callback) => {
  const channel = supabase
    .channel(`messages_${userId}_${recipientId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `or(and(sender_id=eq.${userId},recipient_id=eq.${recipientId}),and(sender_id=eq.${recipientId},recipient_id=eq.${userId}))`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return channel;
};

// Subscribe to conversation updates in real-time
export const subscribeToConversations = (userId, callback) => {
  const channel = supabase
    .channel(`conversations_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `or(sender_id=eq.${userId},recipient_id=eq.${userId})`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return channel;
};

// Unsubscribe from a channel
export const unsubscribeFromChannel = (channel) => {
  return supabase.removeChannel(channel);
};

// Get count of unread messages for a user
export const getUnreadMessageCount = async (userId) => {
  try {
    if (!userId) return 0;
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: false })
      .eq('recipient_id', userId)
      .eq('read', false);

    if (error) {
      console.error('❌ Error fetching unread message count:', error);
      return 0;
    }

    // PostgREST returns length in data when not using head; use count if provided
    if (typeof count === 'number') return count;
    // Fallback: use returned array length
    return Array.isArray(count) ? count.length : 0;
  } catch (err) {
    console.error('❌ getUnreadMessageCount exception:', err);
    return 0;
  }
};
