import type { FastifyPluginAsync } from 'fastify';
import { one, many } from '../db.js';

const routes: FastifyPluginAsync = async (app) => {
  // 总览：在寺人数、今日考勤、待办提醒、即将到期挂单、考察期进度
  app.get('/', async () => {
    const statusCounts = await many<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM monks
       WHERE status IN ('guadan','inspection','permanent') GROUP BY status`,
    );

    const today = new Date().toISOString().slice(0, 10);
    const attendanceToday = await one<{
      morning_present: number; morning_absent: number; morning_leave: number; morning_pending: number;
      evening_present: number; evening_absent: number; evening_leave: number; evening_pending: number;
    }>(`
      SELECT
        count(*) FILTER (WHERE s='morning' AND a.status='present')::int AS morning_present,
        count(*) FILTER (WHERE s='morning' AND a.status='absent')::int  AS morning_absent,
        count(*) FILTER (WHERE s='morning' AND a.status='leave')::int   AS morning_leave,
        count(*) FILTER (WHERE s='morning' AND a.status IS NULL)::int   AS morning_pending,
        count(*) FILTER (WHERE s='evening' AND a.status='present')::int AS evening_present,
        count(*) FILTER (WHERE s='evening' AND a.status='absent')::int  AS evening_absent,
        count(*) FILTER (WHERE s='evening' AND a.status='leave')::int   AS evening_leave,
        count(*) FILTER (WHERE s='evening' AND a.status IS NULL)::int   AS evening_pending
      FROM monks m
      CROSS JOIN (VALUES ('morning'),('evening')) AS v(s)
      LEFT JOIN attendance a ON a.monk_id=m.id AND a.attend_date=$1 AND a.session=v.s::session_type
      WHERE m.status IN ('permanent','guadan','inspection')
    `, [today]);

    const openAlerts = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM absence_alerts WHERE status='open'`,
    );

    // 待审批请假 / 今日在假
    const leaveStats = await one<{ pending: number; on_leave: number }>(`
      SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
             count(*) FILTER (WHERE status='approved'
                              AND CURRENT_DATE BETWEEN start_date AND end_date)::int AS on_leave
      FROM leave_requests
    `);

    // 预计 3 日内舍单
    const expiring = await many(`
      SELECT g.id, m.dharma_name,
             (g.arrive_date + g.expected_days * INTERVAL '1 day')::date AS expected_leave,
             ((g.arrive_date + g.expected_days * INTERVAL '1 day')::date - CURRENT_DATE)::int AS days_left
      FROM guadan g JOIN monks m ON m.id=g.monk_id
      WHERE g.status='active'
        AND (g.arrive_date + g.expected_days * INTERVAL '1 day')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      ORDER BY expected_leave
    `);

    const pendingInspections = await many(`
      SELECT i.id, m.dharma_name, i.start_date, i.expected_end,
             (CURRENT_DATE - i.start_date)::int AS days_elapsed,
             (i.expected_end - CURRENT_DATE)::int AS days_left
      FROM inspections i JOIN monks m ON m.id=i.monk_id
      WHERE i.result='pending'
      ORDER BY i.expected_end
    `);

    const bedUsage = await one<{ total: number; occupied: number }>(`
      SELECT count(*)::int AS total, count(monk_id)::int AS occupied FROM beds
    `);

    return {
      status_counts: statusCounts,
      attendance_today: attendanceToday,
      open_alerts: openAlerts.n,
      pending_leaves: leaveStats.pending,
      on_leave_today: leaveStats.on_leave,
      expiring_guadan: expiring,
      pending_inspections: pendingInspections,
      bed_usage: bedUsage,
      today,
    };
  });
};

export default routes;
