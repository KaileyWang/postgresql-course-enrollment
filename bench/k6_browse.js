// ============================================================
// k6 浏览压测脚本（S2 场景）
// 用法：
//   k6 run -e BASE=http://api:8000 -e VUS=1000 bench/k6_browse.js
// 目的：观察列表页吞吐；对照组 = 关掉 Redis 缓存时 QPS 下降
// ============================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8000';
const TERM = __ENV.TERM || '2026-FALL';

export const listQps = new Counter('list_requests');
export const cacheMiss = new Counter('cache_miss_hint'); // 基于响应时间粗略判断
export const listLatency = new Trend('list_latency_ms', true);

export const options = {
  scenarios: {
    browse: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 200),
      duration: __ENV.DURATION || '3m',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.02'],
    'list_latency_ms': ['p(95)<200'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ student_no: 'S0001', password: 'Passw0rd!' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { token: res.json('access_token') };
}

export default function (data) {
  const res = http.get(
    `${BASE}/api/v1/sections?term=${TERM}&page=1&size=20`,
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { name: 'GET /sections' },
    }
  );
  listQps.add(1);
  listLatency.add(res.timings.duration);
  if (res.timings.duration > 100) cacheMiss.add(1); // 粗判：>100ms 大概率没命中缓存
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items': (r) => r.json('items') !== undefined,
  });
  sleep(1 + Math.random() * 2);
}
