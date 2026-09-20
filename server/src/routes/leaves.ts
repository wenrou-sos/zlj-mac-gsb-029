import type { FastifyPluginAsync } from 'fastify';
import { pool, many, one, ApiError, asEnum, LEAVE_STATUSES } from '../db.js';
import type { DTO } from '../db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface LeaveBody {
  monk_id?: string;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
  reason?: string | null;
}

interface LeaveRow {
  id: string;
  monk_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

interface DTOQuery {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: DTO[] }>;
}

// 批准后将请假期间早晚课考勤同步为「请假」；已登记「随众」的保留不覆盖
async function syncAttendanceToLeave(client: DTOQuery, leave: LeaveRow, approvedBy: string) {
  await client.query(
    `INSERT INTO attendance (monk_id, attend_date, session, status, note, recorded_by, leave_id)
     SELECT $1, d::date, s.sess::session_type, 'leave'::attendance_status, $4, $5, $6
     FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d
     CROSS JOIN (VALUES ('morning'), ('evening')) AS s(sess)
     ON CONFLICT (monk_id, attend_date, session)
     DO UPDATE SET status='leave', note=EXCLUDED.note,
                   recorded_by=EXCLUDED.recorded_by, leave_id=EXCLUDED.leave_id
     WHERE attendance.status <> 'present'`,
    [
      leave.monk_id,
      leave.start_date,
      leave.end_date,
      `请假单同步（${leave.leave_type}）`,
      approvedBy,
      leave.id,
    ],
  );
}

// 请假批准后缺勤次数可能降回阈值以下：重算近 30 日缺勤，自动关闭该僧人的缺勤提醒
async function closeAlertsIfBelowThreshold(client: DTOQuery, monkId: string) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM attendance
     WHERE monk_id=$1 AND status='absent'
       AND attend_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE`,
    [monkId],
  );
  if ((rows[0].n as number) < 3) {
    await client.query(
      `UPDATE absence_alerts
          SET status='acknowledged', acknowledged_by='系统（请假批准）', acknowledged_at=now()
        WHERE monk_id=$1 AND status='open'`,
      [monkId],
    );
  }
}

const routes: FastifyPluginAsync = async (app) => {
  // 请假单列表（默认待审批在前）
  app.get('/', async (req) => {
    const { status, q } = req.query as { status?: string; q?: string };
    const conds: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(asEnum(status, LEAVE_STATUSES, '请假单状态'));
      conds.push(`l.status = $${params.length}::leave_status`);
    }
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      conds.push(`m.dharma_name ILIKE $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return many(
      `
      SELECT l.*, m.dharma_name, m.status AS monk_status, m.current_post,
             (l.end_date - l.start_date + 1)::int AS days
      FROM leave_requests l
      JOIN monks m ON m.id = l.monk_id
      ${where}
      ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
               l.created_at DESC
    `,
      params,
    );
  });

  // 待审批数量（菜单角标用）
  app.get('/pending-count', async () =>
    one(`SELECT count(*)::int AS n FROM leave_requests WHERE status='pending'`),
  );

  // 提交请假申请（在寺众：常住/考察/挂单）
  app.post('/', async (req, reply) => {
    const body = req.body as LeaveBody;
    if (!body.monk_id) throw new ApiError(400, '请选择请假僧人');
    if (!body.start_date || !DATE_RE.test(body.start_date)) throw new ApiError(400, '请假开始日期无效');
    if (!body.end_date || !DATE_RE.test(body.end_date)) throw new ApiError(400, '请假结束日期无效');
    if (body.end_date < body.start_date) throw new ApiError(400, '结束日期不能早于开始日期');
    const leaveType = body.leave_type?.trim() || '事假';
    if (leaveType.length > 32) throw new ApiError(400, '请假类型过长');

    const monk = await one<{ id: string; status: string } | null>(
      'SELECT id, status FROM monks WHERE id=$1',
      [body.monk_id],
    );
    if (!monk) throw new ApiError(404, '僧人不存在');
    if (!['guadan', 'inspection', 'permanent'].includes(monk.status)) {
      throw new ApiError(400, '该僧人已离寺，不能请假');
    }

    // 同一僧人不允许日期重叠的待审批/已批准请假
    const overlap = await one(
      `SELECT id FROM leave_requests
       WHERE monk_id=$1 AND status IN ('pending','approved')
         AND start_date <= $3::date AND end_date >= $2::date
       LIMIT 1`,
      [body.monk_id, body.start_date, body.end_date],
    );
    if (overlap) throw new ApiError(409, '该僧人此时段已有请假单（待审批或已批准）');

    const row = await one(
      `INSERT INTO leave_requests (monk_id, leave_type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.monk_id, leaveType, body.start_date, body.end_date, body.reason ?? null],
    );
    return reply.code(201).send(row);
  });

  // 知客批准：同步考勤为请假，并按需自动关闭缺勤提醒
  app.post<{ Params: { id: string } }>('/:id/approve', async (req) => {
    const { approved_by } = req.body as { approved_by?: string };
    const approvedBy = approved_by?.trim() || '知客';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE leave_requests
            SET status='approved', approved_by=$2, approved_at=now()
          WHERE id=$1 AND status='pending'
          RETURNING *`,
        [req.params.id, approvedBy],
      );
      if (rows.length === 0) throw new ApiError(404, '待审批请假单不存在');
      const leave = rows[0] as unknown as LeaveRow;

      await syncAttendanceToLeave(client, leave, approvedBy);
      await closeAlertsIfBelowThreshold(client, leave.monk_id);

      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // 知客驳回
  app.post<{ Params: { id: string } }>('/:id/reject', async (req) => {
    const { reject_reason } = req.body as { reject_reason?: string };
    const row = await one(
      `UPDATE leave_requests
          SET status='rejected', reject_reason=NULLIF($2, ''), approved_at=now()
        WHERE id=$1 AND status='pending'
        RETURNING id`,
      [req.params.id, reject_reason?.trim() ?? ''],
    );
    if (!row) throw new ApiError(404, '待审批请假单不存在');
    return { ok: true };
  });

  // 撤销请假：待审批直接撤销；已批准的撤销（销假）时回滚同步的考勤
  app.post<{ Params: { id: string } }>('/:id/cancel', async (req) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE leave_requests
            SET status='cancelled', cancelled_at=now()
          WHERE id=$1 AND status IN ('pending','approved')
          RETURNING id`,
        [req.params.id],
      );
      if (rows.length === 0) throw new ApiError(404, '可撤销的请假单不存在（仅待审批/已批准可撤销）');

      // 回滚由该请假单同步生成的考勤（待审批的请假单无此记录，删除为空操作）
      await client.query('DELETE FROM attendance WHERE leave_id=$1', [req.params.id]);

      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
};

export default routes;
