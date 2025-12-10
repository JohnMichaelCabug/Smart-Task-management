import { useEffect, useState } from 'react';
import { performanceService, authService } from '../services/supabaseClient';

export default function ScoreBoard({ userId = null, compact = false }) {
  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        let id = userId;
        if (!id) {
          const current = await authService.getCurrentUser();
          id = current?.id;
        }
        if (!id) {
          // fetch overall
          const overall = await performanceService.getOverallPerformance();
          if (mounted) setScoreData({ overall });
          return;
        }

        const data = await performanceService.getUserPerformance(id);
        if (mounted) setScoreData(data);
      } catch (err) {
        console.error('Error loading score:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [userId]);

  if (loading) return <div className="p-4 bg-white rounded-lg shadow">Loading score...</div>;
  if (!scoreData) return <div className="p-4 bg-white rounded-lg shadow">No score available</div>;

  // If overall
  if (scoreData.overall) {
    const avg = Math.round(scoreData.overall.avg_score || 0);
    const users = scoreData.overall.user_count || 0;
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-bold">Overall Performance</h3>
        <div className="flex items-center gap-4 mt-3">
          <div className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white w-20 h-20 flex items-center justify-center text-2xl font-bold">{avg}</div>
          <div>
            <p className="text-sm text-gray-600">Average score across users</p>
            <p className="text-xl font-semibold mt-1">{avg}/100</p>
            <p className="text-sm text-gray-500">{users} users evaluated</p>
          </div>
        </div>
      </div>
    );
  }

  const { score, tasks_completed, tasks_total, reports_count, messages_sent, messages_read } = scoreData;
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-bold">Overall Performance Score</h3>
      <div className="flex items-center gap-4 mt-3">
        <div className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white w-20 h-20 flex items-center justify-center text-2xl font-bold">{score}</div>
        <div>
          <p className="text-sm text-gray-600">Score breakdown</p>
          <div className="mt-2 text-sm text-gray-700">
            <div>Tasks: {tasks_completed}/{tasks_total}</div>
            <div>Reports: {reports_count}</div>
            <div>Messages: {messages_read}/{messages_sent}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
