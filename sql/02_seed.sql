-- ============================================================
-- 种子数据：1 名管理员 + 2000 名学生 + 20 门课 + 200 个教学班
-- 用法：psql -f 02_seed.sql（在空库、已执行 01_schema.sql 后）
-- ============================================================

BEGIN;

-- 管理员（密码明文 Passw0rd!，bcrypt 预生成哈希）
INSERT INTO users (student_no, name, password_hash, role, major) VALUES
('admin', '教务管理员',
 '$2b$12$KIXQ8jO0kI4Qm9zZt7mU2u8vRj2xY3wQ5nL6pA7sT9cE1hF2gB3Dj', 'admin', '教务处');

-- 学生：S0001 ~ S2000
INSERT INTO users (student_no, name, password_hash, major)
SELECT 'S' || LPAD(g::text, 4, '0'),
       '学生' || g,
       '$2b$12$KIXQ8jO0kI4Qm9zZt7mU2u8vRj2xY3wQ5nL6pA7sT9cE1hF2gB3Dj',
       (ARRAY['计算机','软件工程','数学','物理','电子'])[1 + (g % 5)]
FROM generate_series(1, 2000) AS g;

-- 20 门课程
INSERT INTO courses (code, name, credits, dept)
SELECT 'CS' || LPAD((100 + g)::text, 3, '0'),
       (ARRAY['数据结构','操作系统','计算机网络','编译原理','数据库系统',
              '机器学习','并发编程','算法设计','离散数学','线性代数',
              '概率论','大学物理','电路分析','软件工程','信息安全',
              '人工智能导论','数字逻辑','计算机图形学','分布式系统','程序语言'])[g],
       (ARRAY[4,4,4,3,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3])[g],
       (ARRAY['计算机','计算机','计算机','计算机','计算机','计算机','计算机','计算机','数学','数学','数学','物理','电子','软件工程','计算机','计算机','电子','计算机','计算机','计算机'])[g]
FROM generate_series(1, 20) AS g;

-- 200 个教学班：20 课程 × 10 个班，容量 30~120
INSERT INTO sections (course_id, term, teacher, capacity)
SELECT c.id,
       '2026-FALL',
       (ARRAY['李四','王五','赵六','陈七','周八'])[1 + ((c.id + b.g) % 5)],
       30 + 10 * ((c.id + b.g) % 10)
FROM courses c
CROSS JOIN generate_series(1, 10) AS b(g);

-- 每个教学班 1~2 段上课时间（周几与节次按 ID 伪随机，避免同班内重叠）
INSERT INTO section_meetings (section_id, weekday, start_period, end_period)
SELECT s.id,
       1 + (s.id % 5)::int,                    -- 周一~周五
       1 + (s.id % 3)::int * 2 - 1,            -- 1/3/5 节起
       1 + (s.id % 3)::int * 2                 -- 2/4/6 节止
FROM sections s;

INSERT INTO section_meetings (section_id, weekday, start_period, end_period)
SELECT s.id,
       1 + ((s.id + 2) % 5)::int,
       7 + (s.id % 2)::int * 2,
       8 + (s.id % 2)::int * 2
FROM sections s
WHERE s.id % 2 = 0;

COMMIT;
