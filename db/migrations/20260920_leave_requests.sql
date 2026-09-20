-- =====================================================================
-- 迁移：请销假审批功能（2026-09-20）
-- 适用于已按 01_schema.sql 初始化的既有数据库，可重复执行。
-- 全新初始化的库已包含本文件全部内容，无需执行。
-- =====================================================================

BEGIN;

-- 请假单状态枚举
DO $$
BEGIN
    CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'returned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 请假单
CREATE TABLE IF NOT EXISTS leave_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id       UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    sessions      session_type[] NOT NULL DEFAULT '{morning,evening}',
    reason        TEXT NOT NULL,
    status        leave_status NOT NULL DEFAULT 'pending',
    requested_by  VARCHAR(64),
    reviewed_by   VARCHAR(64),
    reviewed_at   TIMESTAMPTZ,
    review_note   TEXT,
    return_date   DATE,
    returned_by   VARCHAR(64),
    returned_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leave_date_range_chk CHECK (end_date >= start_date),
    CONSTRAINT leave_sessions_chk CHECK (array_length(sessions, 1) >= 1)
);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_monk ON leave_requests(monk_id);

-- 考勤记录关联请假单（审批同步来源）
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS leave_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL;

-- updated_at 自动维护
DROP TRIGGER IF EXISTS trg_leave_updated ON leave_requests;
CREATE TRIGGER trg_leave_updated BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 缺勤提醒触发器：缺勤被更正为随众/请假后，不足 3 次自动办结待办
CREATE OR REPLACE FUNCTION check_absence_threshold() RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
    v_open  INTEGER;
BEGIN
    IF NEW.status = 'absent' THEN
        SELECT count(*) INTO v_count
        FROM attendance
        WHERE monk_id = NEW.monk_id
          AND status = 'absent'
          AND attend_date BETWEEN (NEW.attend_date - 29) AND NEW.attend_date;

        IF v_count >= 3 THEN
            SELECT count(*) INTO v_open
            FROM absence_alerts
            WHERE monk_id = NEW.monk_id AND status = 'open';

            IF v_open = 0 THEN
                INSERT INTO absence_alerts (monk_id, window_days, absence_count, last_absence)
                VALUES (NEW.monk_id, 30, v_count, NEW.attend_date);
            ELSE
                UPDATE absence_alerts
                   SET absence_count = v_count,
                       last_absence  = NEW.attend_date
                 WHERE monk_id = NEW.monk_id AND status = 'open';
            END IF;
        END IF;
    ELSE
        SELECT count(*) INTO v_count
        FROM attendance
        WHERE monk_id = NEW.monk_id
          AND status = 'absent'
          AND attend_date BETWEEN (CURRENT_DATE - 29) AND CURRENT_DATE;

        IF v_count < 3 THEN
            UPDATE absence_alerts
               SET status          = 'acknowledged',
                   acknowledged_by = '系统（缺勤已更正）',
                   acknowledged_at = now()
             WHERE monk_id = NEW.monk_id AND status = 'open';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
