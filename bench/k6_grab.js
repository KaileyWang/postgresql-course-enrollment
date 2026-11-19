// ============================================================
// k6 抢课压测脚本（S1 场景）
// 用法：
//   k6 run -e TARGET_SECTION_ID=1 -e STUDENTS=500 -e BASE=http://api:8000 bench/k6_grab.js
// 假设：已通过 /api/v1/dev/students/login 预置/获取测试 token
//       简化方案：种子学生统一密码，脚本内登录拿 token 后压测
// 输出：--summary-export 到 bench/results/<date>/grab_<strategy>_<isolation>.json
// ============================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8000';
const SECTION_ID = Number(__ENV.TARGET_SECTION_ID || 1);
const STUDENTS = Number(__ENV.STUDENTS || 500);

export const enrolled201 = new Counter('enrolled_201');
export const waitlisted202 = new Counter('waitlisted_202');
export const failed409 = new Counter('failed_409');
export const serverError = new Counter('server_error_5xx');
export const conflict409 = new Rate('time_conflict_rate');
export const lockRetry = new Counter('optimistic_retry_exhausted');
export const grabLatency = new Trend('grab_latency_ms', true);

export const options = {
  scenarios: {
    grab: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.floor(STUDENTS * 0.2) },
        { duration: '60s', target: STUDENTS },
        { duration: '90s', target: STUDENTS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.05'],       // 失败率 < 5%（含预期的 409）
    'grab_latency_ms': ['p(99)<500'],        // P99 < 500ms
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// setup：为每个 VU 登录一次（用学号 S0001 ~ S(0001+STUDENTS-1)）
export function setup() {
  const tokens = [];
  const maxVU = Number(__ENV.STUDENTS || 500);
  for (let i = 1; i <= maxVU; i++) {
    const studentNo = 'S' + String(i).padStart(4, '0');
    const res = http.post(
      `${BASE}/api/v1/auth/login`,
      JSON.stringify({ student_no: studentNo, password: 'Passw0rd!' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status === 200) {
      tokens.push(res.json('access_token'));
    } else {
      console.error(`login failed for ${studentNo}: ${res.status}`);
    }
  }
  if (tokens.length === 0) throw new Error('no tokens obtained — check seed & BASE url');
  return { tokens, sectionId: SECTION_ID };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const payload = JSON.stringify({ section_id: data.sectionId, allow_waitlist: true });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'POST /enrollments' },
    timeout: '10s',
  };

  const res = http.post(`${BASE}/api/v1/enrollments`, payload, params);
  grabLatency.add(res.timings.duration);

  if (res.status === 201) {
    enrolled201.add(1);
    check(res, { 'enrolled 201': (r) => r.json('status') === 'ENROLLED' });
  } else if (res.status === 202) {
    waitlisted202.add(1);
    check(res, { 'waitlisted 202': (r) => r.json('status') === 'WAITLISTED' });
  } else if (res.status === 409) {
    failed409.add(1);
    const code = res.json('error.code');
    if (code === 'TIME_CONFLICT') conflict409.add(1);
    if (code === 'OPTIMISTIC_CONFLICT') lockRetry.add(1);
  } else if (res.status >= 500) {
    serverError.add(1);
    console.error(`5xx: ${res.status} body=${res.body}`);
  }

  sleep(0.5 + Math.random() * 1.5); // 模拟学生思考节奏
}

// teardown：打印对账提示（对账 SQL 单独由 bench/reconcile.sql 执行）
export function teardown(data) {
  console.log(`section ${data.sectionId} test ended. Run bench/reconcile.sql to verify no oversell.`);
}
