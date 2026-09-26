# Data pipeline tools

Development-time generators and preprocessors. Not part of backend or frontend runtime.

| Path | Role |
|------|------|
| `admin-boundaries/input/` | Source GeoJSON (detailed + simplified) |
| `admin-boundaries/*.py` | Hierarchy preprocess + manual review |
| `admin-boundaries/reports/` | Preprocess reports (non-runtime) |
| `signal-quality/generate.py` | Synthetic signal-quality dataset generator |

**Outputs under `apps/frontend/public/data/`:**

```text
boundaries.geojson   # browser admin navigation (runtime)
manifest.json        # browser admin navigation (runtime)
signal-quality.json  # DB seed input only (`npm run db:seed-signal-quality`); not loaded by the frontend
```

Do not place reports or source inputs under `public/data/`.
