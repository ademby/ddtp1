# Signal Quality dataset generator

Synthetic drive-test-like measurements for local development.

```bash
python3 tools/data-pipeline/signal-quality/generate.py
```

Default output: `apps/frontend/public/data/signal-quality.json` (runtime dataset).

Consumed by `npm run db:seed-signal-quality` (`tools/db/seed-signal-quality.mts`) and the frontend offline path.
