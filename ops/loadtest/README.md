# Load test (R19)

Proves R19: search answers in under 1 s at p95 at expected peak load
(A7: ~50 searches/s, ~5 booking writes/s during exam weeks).

## Run

    pnpm db:up
    pnpm db:migrate && pnpm db:codegen && pnpm import:rooms
    pnpm --filter @crs/api dev &      # or build + start
    k6 run ops/loadtest/search.k6.js

The script seeds a token header, ramps VUs to the A7 peak, and asserts
`http_req_duration{expected_response:true}` p(95) < 1000 ms.
