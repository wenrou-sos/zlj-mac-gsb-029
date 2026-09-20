import type { FastifyPluginAsync } from 'fastify';
import { pool, many, one, ApiError, asEnum, LEAVE_STATUSES, SESSION_TYPES } from '../db.js';

interface LeaveRow {
  id: string;
  monk_id: string;
  start_date: string;
  end_date: string;
  sessions: string[];
  status: string;
  return_date: string | null;
}

// 校验请假课次参数：须为 morning/evening 的非空子集
function asSessions(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value == null ? [...SESSION_TYPES] : null;
  if (!arr || arr.length === 0) throw new ApiError(400, '请选择请假课次（早课/晚课）');
  const sessions = [...new Set(arr.map((s) => asEnum(s, SESSION_TYPES, '课次')))];
  return sessions;
}

// 审批通过 / 种子数据共用：请假区间内逐日逐课次把考勤同步为「请假」，
// 已登记为随众的不覆盖（僧值已确认到堂）；缺勤则更正为请假，
// 触发器会随之自动办结缺勤提醒
const SYNC_ATTENDANCE_SQL = `
  INSERT INTO attendance (monk_id, attend_date, session, status, note, recorded_by, leave_id)
  SELECT $1, d::date, s, 'leave', $4, $5, $6
  FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d
  CROSS JOIN unnest($7::session_type[]) AS s
  ON CONFLICT (monk_id, attend_date, session) DO UPDATE
     SET status = 'leave', leave_id = EXCLUDED.leave_id,
         note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by
   WHERE attendance.status IS DISTINCT FROM 'present'
`;

const LIST_SQL = `
  SELECT l.*, l.sessions::text[] AS sessions,
         m.dharma_name, m.status AS monk_status, m.current_post,
         r.room_no, b.bed_no,
         (l.end_date - l.start_date + 1)::int AS days
  FROM leave_requests l
  JOIN monks m ON m.id = l.monk_id
  LEFT JOIN beds b ON b.monk_id = m.id
  LEFT JOIN rooms r ON r.id = b.room_id
`;

const routes: FastifyPluginAsync = async (app) => {
  // 请假单列表（可按状态/僧人过滤）
  app.get('/', async (req) => {
    const { status, monk_id } = req.query as { status?: string; monk_id?: string };
    const conds: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(asEnum(status, LEAVE_STATUSES, '请假单状态'));
      conds.push(`l.status = $${params.length}::leave_status`);
    }
    if (monk_id) {
      params.push(monk_id);
      conds.push(`l.monk_id = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return many(`
      ${LIST_SQL} ${where}
      ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
               l.created_at DESC
    `, params);
  });

  // 待审批数量（菜单角标用）
  app.get('/pending-count', async () =>
    one(`SELECT count(*)::int AS n FROM leave_requests WHERE status='pending'`),
  );

  // 提交请假（本人或客堂代录）
  app.post('/', async (req, reply) => {
    const body = req.body as {
      monk_id?: string;
      start_date?: string;
      end_date?: string;
      sessions?: string[];
      reason?: string;
      requested_by?: string | null;
    };
    if (!body.monk_id) throw new ApiError(400, '请选择请假僧人');
    if (!body.start_date || !body.end_date) throw new ApiError(400, '请选择请假起讫日期');
    if (body.end_date < body.start_date) throw new ApiError(400, '请假讫日不能早于起日');
    if (!body.reason || body.reason.trim() === '') throw new ApiError(400, '请填写请假事由');
    const sessions = asSessions(body.sessions);

    // 仅限在寺众（常住/考察/挂单）请假
    const monk = await one<{ id: string }>(
      `SELECT id FROM monks WHERE id=$1 AND status IN ('permanent','guadan','inspection')`,
      [body.monk_id],
    );
    if (!monk) throw new ApiError(404, '在寺僧人不存在（已离寺者无需请假）');

    // 同一僧人不得有日期重叠的待审批/在假中请假单
    const overlap = await one<{ id: string }>(
      `SELECT id FROM leave_requests
       WHERE monk_id=$1 AND status IN ('pending','approved')
         AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')
       LIMIT 1`,
      [body.monk_id, body.start_date, body.end_date],
    );
    if (overlap) throw new ApiError(409, '该僧人在此期间已有请假单（待审批或在假中）');

    const row = await one(
      `INSERT INTO leave_requests (monk_id, start_date, end_date, sessions, reason, requested_by)
       VALUES ($1,$2,$3,$4::session_type[],$5,$6)
       RETURNING *, sessions::text[] AS sessions`,
      [body.monk_id, body.start_date, body.end_date, sessions, body.reason.trim(),
       body.requested_by ?? '本人'],
    );
    return reply.code(201).send(row);
  });

  // 知客批准：同步考勤为「请假」，缺勤提醒由触发器自动办结
  app.post<{ Params: { id: string } }>('/:id/approve', async (req) => {
    const { reviewed_by, review_note } = req.body as {
      reviewed_by?: string | null; review_note?: string | null;
    };
    const reviewer = reviewed_by ?? '知客';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<LeaveRow>(
        `UPDATE leave_requests
            SET status='approved', reviewed_by=$2, reviewed_at=now(), review_note=$3
          WHERE id=$1 AND status='pending'
          RETURNING *`,
        [req.params.id, reviewer, review_note ?? null],
      );
      if (rows.length === 0) throw new ApiError(404, '待审批请假单不存在');
      const leave = rows[0];

      await client.query(SYNC_ATTENDANCE_SQL, [
        leave.monk_id, leave.start_date, leave.end_date,
        '请假审批通过', reviewer, leave.id, leave.sessions,
      ]);
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
    const { reviewed_by, review_note } = req.body as {
      reviewed_by?: string | null; review_note?: string | null;
    };
    const row = await one(
      `UPDATE leave_requests
          SET status='rejected', reviewed_by=$2, reviewed_at=now(), review_note=$3
        WHERE id=$1 AND status='pending'
        RETURNING id`,
      [req.params.id, reviewed_by ?? '知客', review_note ?? null],
    );
    if (!row) throw new ApiError(404, '待审批请假单不存在');
    return { ok: true };
  });

  // 撤销请假（仅限待审批）
  app.post<{ Params: { id: string } }>('/:id/cancel', async (req) => {
    const row = await one(
      `UPDATE leave_requests SET status='cancelled'
        WHERE id=$1 AND status='pending'
        RETURNING id`,
      [req.params.id],
    );
    if (!row) throw new ApiError(404, '待审批请假单不存在（已审批的请办理销假）');
    return { ok: true };
  });

  // 销假：提前销假的，清除假期剩余日子里由审批同步生成的考勤
  app.post<{ Params: { id: string } }>('/:id/return', async (req) => {
    const { return_date, returned_by } = req.body as {
      return_date?: string; returned_by?: string | null;
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<LeaveRow>(
        `UPDATE leave_requests
            SET status='returned',
                return_date=COALESCE($2::date, CURRENT_DATE),
                returned_by=$3, returned_at=now()
          WHERE id=$1 AND status='approved'
          RETURNING *`,
        [req.params.id, return_date ?? null, returned_by ?? '知客'],
      );
      if (rows.length === 0) throw new ApiError(404, '在假中的请假单不存在');
      const leave = rows[0];

      if (leave.return_date && leave.return_date < leave.end_date) {
        await client.query(
          `DELETE FROM attendance WHERE leave_id=$1 AND attend_date > $2`,
          [leave.id, leave.return_date],
        );
      }
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
