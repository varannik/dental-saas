# Load Tests

Performance and load testing using k6.

## Structure

```
load/
├── scenarios/
│   ├── smoke.js
│   ├── load.js
│   ├── stress.js
│   └── spike.js
├── scripts/
│   ├── auth-flow.js
│   └── api-benchmark.js
└── thresholds.json
```

## Running Tests

```bash
# Install k6
brew install k6

# Smoke test (quick sanity check)
k6 run scenarios/smoke.js

# Load test (sustained load)
k6 run scenarios/load.js

# Stress test (find breaking point)
k6 run scenarios/stress.js

# With output to cloud
k6 run --out cloud scenarios/load.js
```

