-- =====================================================================
-- 寺院僧人挂单与常住管理平台 —— 数据库结构
-- PostgreSQL 16
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- 枚举
-- ---------------------------------------------------------------------
CREATE TYPE monk_status AS ENUM ('guadan', 'inspection', 'permanent', 'left');
-- guadan 挂单 / inspection 考察期 / permanent 常住 / left 已离寺

CREATE TYPE guadan_status AS ENUM ('active', 'closed');

CREATE TYPE inspection_result AS ENUM ('pending', 'passed', 'failed');

CREATE TYPE session_type AS ENUM ('morning', 'evening');
-- morning 早课 / evening 晚课

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'leave');
-- present 随众 / absent 缺勤 / leave 请假

CREATE TYPE alert_status AS ENUM ('open', 'acknowledged');

CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'returned');
-- pending 待审批 / approved 已准假(在假中) / rejected 已驳回 / cancelled 已撤销 / returned 已销假

-- ---------------------------------------------------------------------
-- 僧人总表（挂单/考察/常住共用身份记录）
-- ---------------------------------------------------------------------
CREATE TABLE monks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dharma_name     VARCHAR(64) NOT NULL,                 -- 法名
    home_monastery  VARCHAR(128),                         -- 出家寺庙
    ordination_no   VARCHAR(64),                          -- 戒牒编号
    generation      VARCHAR(64),                          -- 字辈
    tonsure_master  VARCHAR(64),                          -- 剃度师
    ordination_date DATE,                                 -- 受戒时间
    ordination_place VARCHAR(128),                        -- 戒场
    current_post    VARCHAR(64),                          -- 担任职务（知客/维那/典座等）
    note            TEXT,                                 -- 备注
    status          monk_status NOT NULL DEFAULT 'guadan',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 同一僧人可能多次来寺挂单，戒牒编号不做唯一约束
    CONSTRAINT ordination_no_chk CHECK (ordination_no IS NULL OR ordination_no <> '')
);

-- ---------------------------------------------------------------------
-- 寮房（房间）
-- ---------------------------------------------------------------------
CREATE TABLE rooms (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_no     VARCHAR(32) NOT NULL UNIQUE,              -- 房间号
    capacity    INTEGER NOT NULL CHECK (capacity > 0),    -- 床位数
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 床位
-- ---------------------------------------------------------------------
CREATE TABLE beds (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    bed_no      VARCHAR(32) NOT NULL,                      -- 床位号
    monk_id     UUID REFERENCES monks(id) ON DELETE SET NULL, -- 当前住众
    UNIQUE (room_id, bed_no)
);

-- ---------------------------------------------------------------------
-- 挂单记录（每次入寺一条；舍单/转常住后 closed）
-- ---------------------------------------------------------------------
CREATE TABLE guadan (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id         UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    arrive_date     DATE NOT NULL,                         -- 到寺日期
    expected_days   INTEGER NOT NULL CHECK (expected_days > 0), -- 预计住几天
    bed_id          UUID REFERENCES beds(id) ON DELETE SET NULL,-- 安排床位
    status          guadan_status NOT NULL DEFAULT 'active',
    leave_date      DATE,                                  -- 实际舍单日期
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guadan_status ON guadan(status);
CREATE INDEX idx_guadan_monk ON guadan(monk_id);

-- ---------------------------------------------------------------------
-- 考察期（3-6 个月），通过后行羯磨转常住
-- ---------------------------------------------------------------------
CREATE TABLE inspections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id         UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    guadan_id       UUID NOT NULL REFERENCES guadan(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    expected_end    DATE NOT NULL,                         -- 预计考察期满
    result          inspection_result NOT NULL DEFAULT 'pending',
    karma_date      DATE,                                  -- 羯磨仪式日期（通过时）
    decided_at      TIMESTAMPTZ,                           -- 结论时间
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 每位僧人同一时间只允许一条进行中的考察
CREATE UNIQUE INDEX one_pending_inspection_per_monk
    ON inspections(monk_id) WHERE result = 'pending';

-- ---------------------------------------------------------------------
-- 请销假（请假申请 → 知客审批 → 销假/撤销）
-- ---------------------------------------------------------------------
CREATE TABLE leave_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id       UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    start_date    DATE NOT NULL,                             -- 请假起
    end_date      DATE NOT NULL,                             -- 请假讫
    sessions      session_type[] NOT NULL DEFAULT '{morning,evening}', -- 请假课次
    reason        TEXT NOT NULL,                             -- 请假事由
    status        leave_status NOT NULL DEFAULT 'pending',
    requested_by  VARCHAR(64),                               -- 提交人（本人/客堂代录）
    reviewed_by   VARCHAR(64),                               -- 审批人（知客）
    reviewed_at   TIMESTAMPTZ,
    review_note   TEXT,                                      -- 审批意见
    return_date   DATE,                                      -- 实际销假日期
    returned_by   VARCHAR(64),                               -- 销假经办
    returned_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leave_date_range_chk CHECK (end_date >= start_date),
    CONSTRAINT leave_sessions_chk CHECK (array_length(sessions, 1) >= 1)
);
CREATE INDEX idx_leave_status ON leave_requests(status);
CREATE INDEX idx_leave_monk ON leave_requests(monk_id);

-- ---------------------------------------------------------------------
-- 早晚课考勤（按人 / 日期 / 课次唯一）
-- ---------------------------------------------------------------------
CREATE TABLE attendance (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id     UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    attend_date DATE NOT NULL,
    session     session_type NOT NULL,
    status      attendance_status NOT NULL DEFAULT 'present',
    recorded_by VARCHAR(64),                               -- 登记人（知客/僧值）
    note        TEXT,
    leave_id    UUID REFERENCES leave_requests(id) ON DELETE SET NULL, -- 请假审批同步来源
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (monk_id, attend_date, session)
);
CREATE INDEX idx_attendance_date ON attendance(attend_date);

-- ---------------------------------------------------------------------
-- 缺勤满三次自动提醒（客堂待办）
-- ---------------------------------------------------------------------
CREATE TABLE absence_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monk_id         UUID NOT NULL REFERENCES monks(id) ON DELETE CASCADE,
    window_days     INTEGER NOT NULL DEFAULT 30,           -- 统计窗口
    absence_count   INTEGER NOT NULL,                      -- 触发时缺勤次数
    last_absence    DATE NOT NULL,                         -- 最近一次缺勤日期
    status          alert_status NOT NULL DEFAULT 'open',
    acknowledged_by VARCHAR(64),
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_status ON absence_alerts(status);

-- ---------------------------------------------------------------------
-- updated_at 自动维护
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monks_updated   BEFORE UPDATE ON monks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_guadan_updated  BEFORE UPDATE ON guadan
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leave_updated   BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 缺勤累计满三次自动提醒：近 30 个自然日内缺勤 >= 3 次，
-- 自动在 absence_alerts 生成/更新一条客堂待办；
-- 反之缺勤被更正为随众/请假（如请假审批通过同步考勤）后，
-- 近 30 日缺勤不足 3 次时自动办结该僧人的待处理提醒
-- ---------------------------------------------------------------------
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
                -- 已有待处理提醒则刷新计数与最近缺勤日期
                UPDATE absence_alerts
                   SET absence_count = v_count,
                       last_absence  = NEW.attend_date
                 WHERE monk_id = NEW.monk_id AND status = 'open';
            END IF;
        END IF;
    ELSE
        -- 缺勤被更正（请假审批通过 / 登记修正）：缺勤不足 3 次则自动办结待办
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

CREATE TRIGGER trg_attendance_absence
    AFTER INSERT OR UPDATE OF status ON attendance
    FOR EACH ROW EXECUTE FUNCTION check_absence_threshold();
