-- MESSAGING_FIX.sql
-- This script fixes the "Failed to load conversations" error by setting up proper RLS policies
-- and trigger functions for the messages table.
-- 
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. CREATE TRIGGER FUNCTION (if it doesn't exist)
-- ============================================
CREATE OR REPLACE FUNCTION validate_message_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that sender and recipient are different (should be caught by constraint but just in case)
  IF NEW.sender_id = NEW.recipient_id THEN
    RAISE EXCEPTION 'Cannot send messages to yourself';
  END IF;
  
  -- Validate that both users exist
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.sender_id) THEN
    RAISE EXCEPTION 'Sender user does not exist';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.recipient_id) THEN
    RAISE EXCEPTION 'Recipient user does not exist';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. CREATE PROTECT USER ROLE STATUS FUNCTION (if it doesn't exist)
-- ============================================
CREATE OR REPLACE FUNCTION protect_user_role_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent role changes
  IF OLD.role <> NEW.role THEN
    RAISE EXCEPTION 'User role cannot be changed after creation';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE RLS POLICIES FOR USERS TABLE
-- ============================================
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- Policy: Everyone can read all users (needed for conversation partner info)
CREATE POLICY "Users can read all users"
  ON public.users
  FOR SELECT
  USING (true);

-- Policy: Users can only update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 5. CREATE RLS POLICIES FOR MESSAGES TABLE
-- ============================================
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

-- Policy: Users can read messages they are part of
CREATE POLICY "Users can read their own messages"
  ON public.messages
  FOR SELECT
  USING (
    auth.uid() = sender_id 
    OR auth.uid() = recipient_id
  );

-- Policy: Authenticated users can insert messages
CREATE POLICY "Users can send messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> recipient_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = sender_id AND role <> 'guest')
  );

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete their own messages"
  ON public.messages
  FOR DELETE
  USING (auth.uid() = sender_id);

-- Policy: Users can update message read status
CREATE POLICY "Users can update message read status"
  ON public.messages
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- ============================================
-- 6. CREATE RLS POLICIES FOR NOTIFICATIONS TABLE
-- ============================================
DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Policy: Users can read their own notifications
CREATE POLICY "Users can read their own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service can insert notifications (or use service role)
CREATE POLICY "System can create notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 7. CREATE RLS POLICIES FOR TASKS TABLE
-- ============================================
DROP POLICY IF EXISTS "Users can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;

-- Policy: Users can read tasks assigned to them or created by them
CREATE POLICY "Users can read tasks"
  ON public.tasks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own tasks
CREATE POLICY "Users can create tasks"
  ON public.tasks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 8. CREATE RLS POLICIES FOR REPORTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Users can read their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;

-- Policy: Users can read their own reports
CREATE POLICY "Users can read their own reports"
  ON public.reports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own reports
CREATE POLICY "Users can create reports"
  ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 9. VERIFY TRIGGER ATTACHMENT
-- ============================================
-- Drop trigger if it exists
DROP TRIGGER IF EXISTS before_message_insert ON public.messages;
DROP TRIGGER IF EXISTS trg_protect_user_role_status ON public.users;

-- Create trigger for messages validation
CREATE TRIGGER before_message_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION validate_message_permissions();

-- Create trigger for user role protection
CREATE TRIGGER trg_protect_user_role_status
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION protect_user_role_status();

-- ============================================
-- 10. VERIFICATION QUERIES
-- ============================================
-- Run these to verify everything is set up correctly:

-- Check if RLS is enabled:
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('users', 'messages', 'notifications', 'tasks', 'reports');

-- Check if policies exist:
SELECT schemaname, tablename, policyname FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('users', 'messages', 'notifications', 'tasks', 'reports')
ORDER BY tablename, policyname;

-- Check if functions exist:
SELECT routinename FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name IN ('validate_message_permissions', 'protect_user_role_status');

-- Check if triggers exist:
SELECT trigger_name, event_object_table FROM information_schema.triggers 
WHERE trigger_schema = 'public' AND event_object_table IN ('messages', 'users')
ORDER BY event_object_table, trigger_name;

-- ============================================
-- 11. GRANT PERMISSIONS (if needed)
-- ============================================
-- If using service role for admin operations:
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
