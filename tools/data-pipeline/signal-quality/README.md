# Signal Quality dataset generator

Synthetic drive-test-like measurements for local development.

```bash
python3 tools/data-pipeline/signal-quality/generate.py
```

Default output: `apps/frontend/public/data/signal-quality.json`.

Consumed by `npm run db:seed-signal-quality` (`tools/db/seed-signal-quality.mts`) to load approved measurements into PostgreSQL for the backend Signal Quality projection. The frontend loads numeric tiles from the API only (no offline JSON path).
