import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check has ok status': (r) => r.json('status') === 'ok',
  });

  // API endpoints
  const authRes = http.get(`${BASE_URL}/api/auth/status`);
  check(authRes, {
    'auth status check': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}

