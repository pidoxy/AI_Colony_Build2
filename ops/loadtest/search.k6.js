import http from "k6/http";
import { check } from "k6";

// R19: search p95 < 1 s at A7 peak (~50 searches/s).
export const options = {
  scenarios: {
    search: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    "http_req_duration{expected_response:true}": ["p(95)<1000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.API_BASE ?? "http://localhost:3000";
// Dev token (A1): real deployments use a fresh SSO token per virtual user.
const TOKEN = JSON.stringify({ student: { sub: `loadtest-${__VU}` } });

export default function () {
  // Random valid ranges across the next few days, on the 30-min grid.
  const day = 16 + Math.floor(Math.random() * 5); // Nov 16..20
  const hour = 8 + Math.floor(Math.random() * 10) * 0.5;
  const hh = String(Math.floor(hour)).padStart(2, "0");
  const mm = hour % 1 === 0 ? "00" : "30";
  const start = `2026-11-${String(day).padStart(2, "0")}T0${Math.max(0, hh - 1)}:${mm}:00.000Z`;
  const end = `2026-11-${String(day).padStart(2, "0")}T0${Math.max(0, hh + 1)}:${mm}:00.000Z`;
  const res = http.get(`${BASE}/rooms/search?start=${start}&end=${end}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    tags: { name: "search" },
  });
  check(res, { "status 200": (r) => r.status === 200 });
}
