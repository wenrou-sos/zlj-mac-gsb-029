-- =====================================================================
-- 演示数据（仅开发环境）
-- =====================================================================

-- 寮房
INSERT INTO rooms (id, room_no, capacity, note) VALUES
    ('11111111-1111-1111-1111-111111111101', '东单1号', 2, '云水寮'),
    ('11111111-1111-1111-1111-111111111102', '东单2号', 2, '云水寮'),
    ('11111111-1111-1111-1111-111111111103', '西单1号', 2, '云水寮'),
    ('11111111-1111-1111-1111-111111111104', '静修楼101', 1, '方丈寮'),
    ('11111111-1111-1111-1111-111111111105', '静修楼201', 1, '寮元安排'),
    ('11111111-1111-1111-1111-111111111106', '静修楼202', 1, '寮元安排'),
    ('11111111-1111-1111-1111-111111111107', '静修楼203', 1, '寮元安排'),
    ('11111111-1111-1111-1111-111111111108', '静修楼204', 1, '空闲');

-- 床位（每房按 capacity 生成 1..n）
INSERT INTO beds (room_id, bed_no)
SELECT r.id, g.bed_no
FROM rooms r
CROSS JOIN LATERAL generate_series(1, r.capacity) AS g(bed_no);

-- 常住僧人
INSERT INTO monks (id, dharma_name, home_monastery, ordination_no, generation, tonsure_master,
                   ordination_date, ordination_place, current_post, status, note)
VALUES
    ('22222222-2222-2222-2222-222222222201', '智明', '泉州承天寺', 'JD20120086', '智',
     '上圆下拙', '2012-10-15', '江西云居山真如寺', '方丈', 'permanent', NULL),
    ('22222222-2222-2222-2222-222222222202', '慧海', '苏州灵岩山寺', 'JD20150142', '慧',
     '上明下学', '2015-04-08', '江苏宝华山隆昌寺', '知客', 'permanent', '客堂日常接待'),
    ('22222222-2222-2222-2222-222222222203', '妙音', '天台国清寺', 'JD20170233', '妙',
     '上可下明', '2017-11-03', '浙江天台山国清寺', '维那', 'permanent', '领众唱念'),
    ('22222222-2222-2222-2222-222222222204', '庆云', '广东南华寺', 'JD20160077', '庆',
     '上传下正', '2016-09-20', '广东南华寺', '典座', 'permanent', '五观堂'),
    ('22222222-2222-2222-2222-222222222205', '常济', '镇江金山寺', 'JD20180319', '常',
     '上慈下舟', '2018-05-22', '江苏句容宝华山', '僧值', 'permanent', '考勤登记');

-- 挂单僧人（在寺）
INSERT INTO monks (id, dharma_name, home_monastery, ordination_no, status, note)
VALUES
    ('22222222-2222-2222-2222-222222222211', '法远', '河南嵩山少林寺', 'JD20210455', 'guadan', NULL),
    ('22222222-2222-2222-2222-222222222212', '善持', '四川峨眉山报国寺', 'JD20200661', 'guadan', NULL),
    ('22222222-2222-2222-2222-222222222213', '行简', '湖南南岳祝圣寺', 'JD20190208', 'inspection', '发心常住，考察中'),
    ('22222222-2222-2222-2222-222222222214', '定空', '福建广化寺', 'JD20220770', 'inspection', NULL),
    -- 有缺勤情况的挂单僧人（用于自动提醒演示）
    ('22222222-2222-2222-2222-222222222215', '演戒', '山西五台山塔院寺', 'JD20210899', 'guadan', '近日常往医院照看同参');

-- 安排床位
DO $$
DECLARE
    bed_gu1 UUID; bed_gu2 UUID; bed_gu3 UUID; bed_gu4 UUID; bed_gu5 UUID;
    bed_p1 UUID; bed_p2 UUID; bed_p3 UUID; bed_p4 UUID; bed_p5 UUID;
BEGIN
    SELECT b.id INTO bed_gu1 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='东单1号' AND b.bed_no='1';
    SELECT b.id INTO bed_gu2 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='东单2号' AND b.bed_no='1';
    SELECT b.id INTO bed_gu3 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='东单1号' AND b.bed_no='2';
    SELECT b.id INTO bed_gu4 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='西单1号' AND b.bed_no='1';
    SELECT b.id INTO bed_gu5 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='东单2号' AND b.bed_no='2';
    SELECT b.id INTO bed_p1 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='静修楼101' AND b.bed_no='1';
    SELECT b.id INTO bed_p2 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='静修楼201' AND b.bed_no='1';
    SELECT b.id INTO bed_p3 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='静修楼202' AND b.bed_no='1';
    SELECT b.id INTO bed_p4 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='静修楼203' AND b.bed_no='1';
    SELECT b.id INTO bed_p5 FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.room_no='西单1号' AND b.bed_no='2';

    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222211' WHERE id=bed_gu1;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222212' WHERE id=bed_gu2;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222213' WHERE id=bed_gu3;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222214' WHERE id=bed_gu4;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222215' WHERE id=bed_gu5;

    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222201' WHERE id=bed_p1;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222202' WHERE id=bed_p2;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222203' WHERE id=bed_p3;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222204' WHERE id=bed_p4;
    UPDATE beds SET monk_id='22222222-2222-2222-2222-222222222205' WHERE id=bed_p5;
END $$;

-- 挂单记录
INSERT INTO guadan (monk_id, arrive_date, expected_days, bed_id, status, note)
SELECT '22222222-2222-2222-2222-222222222211', CURRENT_DATE - 4,  15, b.id, 'active', NULL
FROM beds b WHERE b.monk_id='22222222-2222-2222-2222-222222222211';
INSERT INTO guadan (monk_id, arrive_date, expected_days, bed_id, status)
SELECT '22222222-2222-2222-2222-222222222212', CURRENT_DATE - 9, 30, b.id, 'active'
FROM beds b WHERE b.monk_id='22222222-2222-2222-2222-222222222212';
INSERT INTO guadan (monk_id, arrive_date, expected_days, bed_id, status, note)
SELECT '22222222-2222-2222-2222-222222222215', CURRENT_DATE - 12, 20, b.id, 'active', '住满预计日期后续单'
FROM beds b WHERE b.monk_id='22222222-2222-2222-2222-222222222215';

-- 考察期僧人：挂单记录仍 active（住众身份延续）
INSERT INTO guadan (id, monk_id, arrive_date, expected_days, bed_id, status)
SELECT '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222213',
       CURRENT_DATE - 70, 90, b.id, 'active'
FROM beds b WHERE b.monk_id='22222222-2222-2222-2222-222222222213';
INSERT INTO guadan (id, monk_id, arrive_date, expected_days, bed_id, status)
SELECT '33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222214',
       CURRENT_DATE - 40, 90, b.id, 'active'
FROM beds b WHERE b.monk_id='22222222-2222-2222-2222-222222222214';

INSERT INTO inspections (monk_id, guadan_id, start_date, expected_end, result, note)
VALUES
    ('22222222-2222-2222-2222-222222222213',
     '33333333-3333-3333-3333-333333333301',
     CURRENT_DATE - 70, CURRENT_DATE + 22, 'pending', '随众用功，行持稳重'),
    ('22222222-2222-2222-2222-222222222214',
     '33333333-3333-3333-3333-333333333302',
     CURRENT_DATE - 40, CURRENT_DATE + 80, 'pending', NULL);

-- 已完成的历史挂单（舍单）
INSERT INTO monks (id, dharma_name, home_monastery, ordination_no, status)
VALUES ('22222222-2222-2222-2222-222222222221', '净一', '庐山东林寺', 'JD20190510', 'left');
INSERT INTO guadan (monk_id, arrive_date, expected_days, status, leave_date, note)
VALUES ('22222222-2222-2222-2222-222222222221',
        CURRENT_DATE - 100, 7, 'closed', CURRENT_DATE - 94, '朝山完毕，继续参学');

-- ---------------------------------------------------------------------
-- 考勤：近 7 天，常住与挂单众默认随众；演戒近三日早晚课缺勤共 4 次
-- ---------------------------------------------------------------------
INSERT INTO attendance (monk_id, attend_date, session, status)
SELECT m.id, d.d::date, s.sess::session_type, 'present'::attendance_status
FROM monks m
CROSS JOIN generate_series(CURRENT_DATE - 6, CURRENT_DATE - 3, INTERVAL '1 day') AS d(d)
CROSS JOIN (VALUES ('morning'), ('evening')) AS s(sess)
WHERE m.status IN ('permanent','guadan','inspection');

INSERT INTO attendance (monk_id, attend_date, session, status)
SELECT m.id, d.d::date, s.sess::session_type,
       (CASE WHEN m.id = '22222222-2222-2222-2222-222222222215'
                 AND d.d::date >= CURRENT_DATE - 2 THEN 'absent'
            WHEN m.id = '22222222-2222-2222-2222-222222222212'
                 AND d.d::date = CURRENT_DATE - 1 AND s.sess = 'evening' THEN 'leave'
            ELSE 'present' END)::attendance_status
FROM monks m
CROSS JOIN generate_series(CURRENT_DATE - 2, CURRENT_DATE, INTERVAL '1 day') AS d(d)
CROSS JOIN (VALUES ('morning'), ('evening')) AS s(sess)
WHERE m.status IN ('permanent','guadan','inspection')
  AND NOT (m.id = '22222222-2222-2222-2222-222222222215' AND d.d::date = CURRENT_DATE);

-- 演戒近 30 日缺勤满 3 次，absence_alerts 由触发器自动生成
-- （见 01_schema.sql 中 trg_attendance_absence）

-- ---------------------------------------------------------------------
-- 请销假演示数据
-- ---------------------------------------------------------------------
-- 行简（考察期）：已批准的病假（昨日至明日），考勤已自动同步为请假
INSERT INTO leave_requests (id, monk_id, leave_type, start_date, end_date, reason,
                            status, approved_by, approved_at)
VALUES ('44444444-4444-4444-4444-444444444401',
        '22222222-2222-2222-2222-222222222213',
        '病假', CURRENT_DATE - 1, CURRENT_DATE + 1, '下山就医，遵医嘱静养',
        'approved', '慧海', now());

INSERT INTO attendance (monk_id, attend_date, session, status, note, recorded_by, leave_id)
SELECT '22222222-2222-2222-2222-222222222213', d.d::date, s.sess::session_type,
       'leave'::attendance_status, '请假单同步（病假）', '慧海',
       '44444444-4444-4444-4444-444444444401'
FROM generate_series(CURRENT_DATE - 1, CURRENT_DATE + 1, INTERVAL '1 day') AS d(d)
CROSS JOIN (VALUES ('morning'), ('evening')) AS s(sess)
ON CONFLICT (monk_id, attend_date, session)
DO UPDATE SET status='leave', note=EXCLUDED.note,
              recorded_by=EXCLUDED.recorded_by, leave_id=EXCLUDED.leave_id
WHERE attendance.status <> 'present';

-- 善持（挂单）：待审批的事假（明日起 3 天），等待知客审批
INSERT INTO leave_requests (monk_id, leave_type, start_date, end_date, reason)
VALUES ('22222222-2222-2222-2222-222222222212',
        '事假', CURRENT_DATE + 1, CURRENT_DATE + 3, '俗家母亲寿辰，回家探望');

-- 法远（挂单）：已撤销的请假（提交后行程取消）
INSERT INTO leave_requests (monk_id, leave_type, start_date, end_date, reason,
                            status, cancelled_at)
VALUES ('22222222-2222-2222-2222-222222222211',
        '参学', CURRENT_DATE - 5, CURRENT_DATE - 3, '赴邻县寺院听经',
        'cancelled', now());
