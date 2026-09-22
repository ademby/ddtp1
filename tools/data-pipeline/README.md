# Data pipeline tools

Development-time generators and preprocessors for datasets consumed by the
frontend.

- `admin-boundaries/` contains source GeoJSON, hierarchy preprocessing, and
  manual review tooling. Its generated output is written to
  `apps/frontend/public/data/`.
- `signal-quality/` generates the signal-quality dataset consumed by
  the frontend.

These tools are not part of the backend or frontend runtime.
