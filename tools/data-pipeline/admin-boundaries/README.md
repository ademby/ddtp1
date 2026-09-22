# Administrative boundary preprocessor

This tool preprocesses a complete ADM0..ADMn collection of simplified GeoJSON files once during development/build time.

It preserves the original feature properties and geometry and adds only:

- `adminLevel`
- `parentId`

It produces a single normalized `boundaries.geojson` and a `manifest.json`.

## Contract

The input directory must contain exactly one GeoJSON file for every level from `ADM0` through the maximum level. There must be exactly one ADM0 feature.

## Run

```bash
python3 -m pip install -r tools/data-pipeline/admin-boundaries/requirements.txt
python3 tools/data-pipeline/admin-boundaries/preprocess.py
```

The parent relationship is resolved with Shapely/GEOS using candidate bounding boxes followed by exact `covered_by` tests. Ambiguous or missing parents are treated as errors instead of guessed.

Source files live in `input/`. The generated runtime dataset is written to
`apps/frontend/public/data/`.
