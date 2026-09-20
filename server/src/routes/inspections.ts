import type { FastifyPluginAsync } from 'fastify';
import { pool, many, one, ApiError, asEnum, INSPECTION_RESULTS } from '../db.js';

const routes: FastifyPluginAsync = async (app) => {
  // 考察期列表
  app.get('/', async (req) => {
    const { result } = req.query as { result?: string };
    const conds: string[] = [];
    const params: unknown[] = [];
    if (result) {
      params.push(asEnum(result, INSPECTION_RESULTS, '考察结果'));
      conds.push(`i.result = $${params.length}::inspection_result`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return many(`
      SELECT i.*, m.dharma_name, m.ordination_no,
             (CURRENT_DATE - i.start_date)::int AS days_elapsed
      FROM inspections i
      JOIN monks m ON m.id = i.monk_id
      ${where}
      ORDER BY CASE i.result WHEN 'pending' THEN 0 ELSE 1 END, i.start_date DESC
    `, params);
  });

  // 发心常住：挂单转入考察期（3-6 个月）
  app.post('/', async (req, reply) => {
    const { guadan_id, start_date, duration_months, note } = req.body as {
      guadan_id?: string;
      start_date?: string;
      duration_months?: number;
      note?: string | null;
    };
    if (!guadan_id) throw new ApiError(400, '缺少挂单记录');
    if (!start_date) throw new ApiError(400, '缺少考察开始日期');
    if (!duration_months || duration_months < 3 || duration_months > 6) {
      throw new ApiError(400, '考察期须为 3-6 个月');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: gs } = await client.query(
        "SELECT monk_id FROM guadan WHERE id=$1 AND status='active'",
        [guadan_id],
      );
      if (gs.length === 0) throw new ApiError(404, '有效挂单记录不存在');
      const monkId = gs[0].monk_id as string;

      const { rows: exist } = await client.query(
        "SELECT 1 FROM inspections WHERE monk_id=$1 AND result='pending'",
        [monkId],
      );
      if (exist.length) throw new ApiError(409, '该僧人已在考察期中');

      const { rows } = await client.query(
        `INSERT INTO inspections (monk_id, guadan_id, start_date, expected_end, note)
         VALUES ($1, $2, $3, ($3::date + ($4 || ' months')::interval)::date, $5)
         RETURNING *`,
        [monkId, guadan_id, start_date, duration_months, note ?? null],
      );
      await client.query("UPDATE monks SET status='inspection' WHERE id=$1", [monkId]);
      await client.query('COMMIT');
      return reply.code(201).send(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // 考察通过：行羯磨，转为常住
  app.post<{ Params: { id: string } }>('/:id/pass', async (req) => {
    const { karma_date, current_post, note } = req.body as {
      karma_date?: string; current_post?: string | null; note?: string | null;
    };
    if (!karma_date) throw new ApiError(400, '请填写羯磨仪式日期');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE inspections SET result='passed', karma_date=$2, decided_at=now(),
                note=COALESCE($3, note)
         WHERE id=$1 AND result='pending' RETURNING monk_id`,
        [req.params.id, karma_date, note ?? null],
      );
      if (rows.length === 0) throw new ApiError(404, '待考察记录不存在');
      await client.query(
        'UPDATE monks SET status=\'permanent\', current_post=COALESCE($2, current_post) WHERE id=$1',
        [rows[0].monk_id, current_post ?? null],
      );
      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // 考察不通过：回到挂单身份
  app.post<{ Params: { id: string } }>('/:id/fail', async (req) => {
    const { note } = req.body as { note?: string | null };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE inspections SET result='failed', decided_at=now(), note=COALESCE($2, note)
         WHERE id=$1 AND result='pending' RETURNING monk_id`,
        [req.params.id, note ?? null],
      );
      if (rows.length === 0) throw new ApiError(404, '待考察记录不存在');
      await client.query("UPDATE monks SET status='guadan' WHERE id=$1", [rows[0].monk_id]);
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
