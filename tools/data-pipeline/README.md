# Data pipeline tools

Development-time generators and preprocessors. Not part of backend or frontend runtime.

| Path | Role |
|------|------|
| `admin-boundaries/input/` | Source GeoJSON (detailed + simplified) |
| `admin-boundaries/*.py` | Hierarchy preprocess + manual review |
| `admin-boundaries/reports/` | Preprocess reports (non-runtime) |
| `signal-quality/generate.py` | Synthetic signal-quality dataset generator |

**Runtime output** (only datasets the browser/API seed consume):

```text
apps/frontend/public/data/
  boundaries.geojson
  manifest.json
  signal-quality.json
```

Do not place reports or source inputs under `public/data/`.
