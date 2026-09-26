# Administrative boundary preprocessor

Preprocesses a complete ADM0..ADMn collection of simplified GeoJSON files once during development/build time.

Adds only:

- `adminLevel`
- `parentId`

Produces runtime `boundaries.geojson` + `manifest.json`, and separate preprocess reports.

## Layout

```text
admin-boundaries/
├── input/
│   ├── detailed/      # source: hierarchy resolution
│   └── simplified/    # source: runtime geometry
├── reports/           # preprocess-report.json / .txt
├── preprocess.py
├── manual_review.py
└── requirements.txt
```

## Source data

If `input/detailed` or `input/simplified` is missing a complete ADM0..ADMn set, `preprocess.py` downloads Tunisia (default) from the [geoBoundaries API](https://www.geoboundaries.org/api.html) (`gbOpen`) into those directories. Override with `--iso` / `--release`.

Attribution (CC BY / ODbL as per boundary metadata): Runfola et al. (2020) geoBoundaries, PLoS ONE.

## Contract

The input directory must contain exactly one GeoJSON file for every level from `ADM0` through the maximum level. There must be exactly one ADM0 feature.

## Run

```bash
python3 -m pip install -r tools/data-pipeline/admin-boundaries/requirements.txt
python3 tools/data-pipeline/admin-boundaries/preprocess.py
```

Defaults:

- `--iso` → `TUN`
- `--release` → `gbOpen`
- `--detailed` → `tools/data-pipeline/admin-boundaries/input/detailed`
- `--simplified` → `tools/data-pipeline/admin-boundaries/input/simplified`
- `--output` → `apps/frontend/public/data` (runtime only)
- `--reports` → `tools/data-pipeline/admin-boundaries/reports`

Parent relationships use Shapely/GEOS (bbox candidates + exact `covered_by`). Ambiguous or missing parents are errors or reported for review, not guessed silently.
