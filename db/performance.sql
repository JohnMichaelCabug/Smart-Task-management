-- db/performance.sql
-- SQL functions to calculate user and overall performance scores

CREATE OR REPLACE FUNCTION calculate_user_performance(p_user_id uuid)
RETURNS TABLE(
  score integer,
  tasks_completed integer,
  tasks_total integer,
  reports_count integer,
  messages_sent integer,
  messages_read integer
) LANGUAGE plpgsql AS $$
DECLARE
  task_score numeric := 0;
  report_score numeric := 0;
  message_score numeric := 0;
BEGIN
  SELECT COALESCE(COUNT(*), 0) INTO tasks_total FROM public.tasks WHERE user_id = p_user_id;
  SELECT COALESCE(COUNT(*), 0) INTO tasks_completed FROM public.tasks WHERE user_id = p_user_id AND status = 'completed';

  SELECT COALESCE(COUNT(*), 0) INTO reports_count FROM public.reports WHERE user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO messages_sent FROM public.messages WHERE sender_id = p_user_id;
  SELECT COALESCE(COUNT(*), 0) INTO messages_read FROM public.messages WHERE sender_id = p_user_id AND read = true;

  -- Tasks: worth up to 50 points
  IF tasks_total = 0 THEN
    task_score := 25; -- neutral baseline if no tasks assigned
  ELSE
    task_score := (tasks_completed::numeric / tasks_total::numeric) * 50;
  END IF;

  -- Reports: up to 25 points (more reports => higher score, capped to 10 reports)
  IF reports_count = 0 THEN
    report_score := 0;
  ELSE
    report_score := (LEAST(reports_count, 10)::numeric / 10::numeric) * 25;
  END IF;

  -- Messages: up to 25 points (good read-rate = better score)
  IF messages_sent = 0 THEN
    message_score := 25; -- neutral baseline when no messages sent
  ELSE
    message_score := (messages_read::numeric / messages_sent::numeric) * 25;
  END IF;

  score := GREATEST(0, LEAST(100, ROUND(task_score + report_score + message_score)))::integer;

  RETURN NEXT;
END;
$$;

-- Overall performance: average of all users' scores
CREATE OR REPLACE FUNCTION calculate_overall_performance()
RETURNS TABLE(avg_score numeric, user_count integer) LANGUAGE sql AS $$
  SELECT AVG(sub.score) AS avg_score, COUNT(*) AS user_count
  FROM (
    SELECT (
      CASE
        WHEN t.total = 0 THEN 25
        ELSE (t.completed::numeric / t.total::numeric) * 50
      END
      + CASE WHEN COALESCE(r.count, 0) = 0 THEN 0 ELSE (LEAST(COALESCE(r.count, 0), 10)::numeric/10::numeric)*25 END
      + (CASE WHEN COALESCE(m.sent, 0) = 0 THEN 25 ELSE (COALESCE(m.read, 0)::numeric/COALESCE(m.sent, 1)::numeric)*25 END)
    )::numeric AS score
    FROM (
      SELECT u.id,
        COALESCE((SELECT COUNT(*) FROM public.tasks WHERE user_id = u.id),0) AS total,
        COALESCE((SELECT COUNT(*) FROM public.tasks WHERE user_id = u.id AND status = 'completed'),0) AS completed
      FROM public.users u
    ) t
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS count FROM public.reports GROUP BY user_id
    ) r ON r.user_id = t.id
    LEFT JOIN (
      SELECT sender_id, COUNT(*) AS sent, SUM(CASE WHEN read THEN 1 ELSE 0 END) AS read FROM public.messages GROUP BY sender_id
    ) m ON m.sender_id = t.id
  ) sub;
$$;

-- Wrapper that accepts text to make calling from SQL editors easier (auto-casts to uuid)
CREATE OR REPLACE FUNCTION calculate_user_performance_text(p_user_id_text text)
RETURNS TABLE(
  score integer,
  tasks_completed integer,
  tasks_total integer,
  reports_count integer,
  messages_sent integer,
  messages_read integer
) LANGUAGE sql AS $$
  SELECT * FROM calculate_user_performance(p_user_id_text::uuid);
$$;


-- Helpful index suggestions (if migrations applied separately)
-- CREATE INDEX IF NOT EXISTS idx_perf_tasks_user ON public.tasks (user_id);
-- CREATE INDEX IF NOT EXISTS idx_perf_reports_user ON public.reports (user_id);
-- CREATE INDEX IF NOT EXISTS idx_perf_messages_sender ON public.messages (sender_id);
