-- 压测后对账：任何返回行 = 违反正确性
-- 用法：psql -f bench/reconcile.sql

-- 1) 计数与 ACTIVE 记录不一致（计数多/少）
SELECT s.id, s.capacity, s.enrolled_count,
       COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE') AS actual,
       s.enrolled_count - COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE') AS drift
FROM sections s
LEFT JOIN enrollments e ON e.section_id = s.id
GROUP BY s.id, s.capacity, s.enrolled_count
HAVING s.enrolled_count <> COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE');

-- 2) 超卖
SELECT id, capacity, enrolled_count
FROM sections
WHERE enrolled_count > capacity;

-- 3) 重复 ACTIVE 记录（部分唯一索引保证不该出现，用于验证索引存在）
SELECT student_id, section_id, COUNT(*)
FROM enrollments
WHERE status = 'ACTIVE'
GROUP BY student_id, section_id
HAVING COUNT(*) > 1;

-- 4) 空坑但有等待者（应自动晋升却没晋升）
SELECT s.id, s.capacity, s.enrolled_count, COUNT(w.id) AS waiting
FROM sections s
JOIN waitlist_entries w ON w.section_id = s.id AND w.status = 'WAITING'
GROUP BY s.id, s.capacity, s.enrolled_count
HAVING s.enrolled_count < s.capacity;
