#!/usr/bin/env python3
"""
Build the runtime administrative-boundary dataset.

Expected input layout:

    tools/data-pipeline/admin-boundaries/input/
    ├── detailed/
    │   ├── geoBoundaries-TUN-ADM0.geojson
    │   ├── geoBoundaries-TUN-ADM1.geojson
    │   └── ...
    └── simplified/
        ├── geoBoundaries-TUN-ADM0_simplified.geojson
        ├── geoBoundaries-TUN-ADM1_simplified.geojson
        └── ...

Detailed geometries are used to derive the administrative hierarchy.
Simplified geometries are used by the browser at runtime.

The hierarchy resolver is deliberately top-down:

    ADM3
      -> find containing ADM1 among ADM0's children
      -> find containing ADM2 among that ADM1's children
      -> stop at ADM2 (the direct parent)

More generally, an ADM(X) feature follows the already-built tree from
ADM0 downward and searches only the children of the node found at the
previous level.

Relationship classification:

    coverage >= --resolved-threshold
        RESOLVED
        No report entry.

    --sure-guess-threshold <= coverage < --resolved-threshold
        SURE_GUESS
        Parent is assigned and reported for review.

    coverage < --sure-guess-threshold
        MANUAL_REVIEW
        Parent is NOT assigned. The best candidates are reported.

Exact geometric containment (covered_by) is treated as 100% coverage.

The thresholds are configurable from the command line.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from shapely.geometry import shape


LEVEL_RE = re.compile(r"ADM(\d+)", re.IGNORECASE)


@dataclass
class Record:
    """Runtime node used while building the hierarchy offline."""

    level: int
    feature: dict[str, Any]
    geometry: Any
    feature_id: str
    parent: Optional["Record"] = None
    children: list["Record"] = field(default_factory=list)

    @property
    def name(self) -> Any:
        return (self.feature.get("properties") or {}).get("shapeName")


class PreprocessError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# JSON / input handling
# ---------------------------------------------------------------------------


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        raise PreprocessError(f"Cannot read {path}: {exc}") from exc


def discover_level_files(directory: Path) -> dict[int, Path]:
    if not directory.is_dir():
        raise PreprocessError(f"Input directory does not exist: {directory}")

    files: dict[int, Path] = {}

    for path in directory.glob("*.geojson"):
        match = LEVEL_RE.search(path.name)
        if not match:
            continue

        level = int(match.group(1))
        if level in files:
            raise PreprocessError(
                f"Multiple GeoJSON files found for ADM{level}: "
                f"{files[level].name} and {path.name}"
            )
        files[level] = path

    if not files:
        raise PreprocessError(f"No ADM*.geojson files found in {directory}")

    max_level = max(files)
    missing = sorted(set(range(max_level + 1)) - set(files))
    if missing:
        raise PreprocessError(
            "Input must contain every level from ADM0 through ADMn. "
            f"Missing: {', '.join(f'ADM{x}' for x in missing)}"
        )

    return dict(sorted(files.items()))


def get_features(fc: dict[str, Any], path: Path) -> list[dict[str, Any]]:
    if fc.get("type") != "FeatureCollection":
        raise PreprocessError(f"{path} is not a GeoJSON FeatureCollection")

    features = fc.get("features")
    if not isinstance(features, list):
        raise PreprocessError(f"{path} has no valid features array")

    return features


def feature_id(feature: dict[str, Any], id_property: str, level: int) -> str:
    properties = feature.get("properties") or {}
    value = properties.get(id_property)

    if value in (None, ""):
        raise PreprocessError(
            f"ADM{level} feature is missing required property {id_property!r}"
        )

    return str(value)


def normalize_record(
    feature: dict[str, Any],
    level: int,
    id_property: str,
    name_property: str,
) -> Record:
    fid = feature_id(feature, id_property, level)
    properties = dict(feature.get("properties") or {})

    if name_property and name_property not in properties:
        raise PreprocessError(
            f"ADM{level} feature {fid!r} is missing name property {name_property!r}"
        )

    geometry_data = feature.get("geometry")
    if geometry_data is None:
        raise PreprocessError(f"ADM{level} feature {fid!r} has no geometry")

    try:
        geometry = shape(geometry_data)
    except Exception as exc:
        raise PreprocessError(
            f"Cannot construct geometry for ADM{level} {fid!r}: {exc}"
        ) from exc

    if geometry.is_empty:
        raise PreprocessError(f"ADM{level} feature {fid!r} has empty geometry")

    if not geometry.is_valid:
        raise PreprocessError(
            f"ADM{level} feature {fid!r} has invalid geometry: "
            f"{geometry.is_valid_reason}"
        )

    properties["adminLevel"] = level
    properties["parentId"] = None

    normalized = {
        "type": "Feature",
        "properties": properties,
        "geometry": geometry_data,
    }

    return Record(
        level=level,
        feature=normalized,
        geometry=geometry,
        feature_id=fid,
    )


def load_records(
    directory: Path,
    id_property: str,
    name_property: str,
) -> dict[int, list[Record]]:
    files = discover_level_files(directory)
    result: dict[int, list[Record]] = {}

    for level, path in files.items():
        fc = load_json(path)
        records: list[Record] = []
        ids: set[str] = set()

        for feature in get_features(fc, path):
            record = normalize_record(
                feature,
                level,
                id_property,
                name_property,
            )

            if record.feature_id in ids:
                raise PreprocessError(
                    f"Duplicate shapeID {record.feature_id!r} "
                    f"in ADM{level} ({path.name})"
                )

            ids.add(record.feature_id)
            records.append(record)

        result[level] = records

    return result


def validate_matching_ids(
    detailed: dict[int, list[Record]],
    simplified: dict[int, list[Record]],
) -> None:
    if sorted(detailed) != sorted(simplified):
        raise PreprocessError(
            "Detailed and simplified inputs do not contain the same ADM levels"
        )

    for level in detailed:
        detailed_ids = {r.feature_id for r in detailed[level]}
        simplified_ids = {r.feature_id for r in simplified[level]}

        missing_from_simplified = detailed_ids - simplified_ids
        missing_from_detailed = simplified_ids - detailed_ids

        if missing_from_simplified or missing_from_detailed:
            parts = []

            if missing_from_simplified:
                parts.append(
                    "missing from simplified: "
                    + ", ".join(sorted(missing_from_simplified)[:10])
                )

            if missing_from_detailed:
                parts.append(
                    "missing from detailed: "
                    + ", ".join(sorted(missing_from_detailed)[:10])
                )

            raise PreprocessError(
                f"ADM{level} detailed/simplified feature sets differ; "
                + "; ".join(parts)
            )


def load_overrides(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}

    data = load_json(path)
    if not isinstance(data, dict):
        raise PreprocessError("Override file must contain a JSON object")

    result: dict[str, str] = {}

    for child_key, parent_id in data.items():
        if not isinstance(child_key, str) or not isinstance(parent_id, str):
            raise PreprocessError(
                "Override keys and parent IDs must be strings"
            )
        result[child_key] = parent_id

    return result

def load_geojson_metadata(directory: Path) -> dict[str, Any]:

    for level, path in discover_level_files(directory).items():
        fc = load_json(path)
        if level == 0:
            return {
                key: value
                for key, value in fc.items()
                if key not in ("features", "type")
            }

    return {}

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def coverage_ratio(child_geometry: Any, parent_geometry: Any) -> float:
    """Return the fraction of the child's area covered by the parent."""

    child_area = child_geometry.area
    if child_area <= 0:
        return 0.0

    intersection_area = child_geometry.intersection(parent_geometry).area
    return max(0.0, min(1.0, intersection_area / child_area))


def best_parent_candidate(
    child: Record,
    candidates: list[Record],
) -> tuple[Optional[Record], list[tuple[Record, float]], bool]:
    """
    Evaluate one child's possible parents.

    Returns:
        best parent,
        candidates sorted by coverage descending,
        whether one or more candidates were exact containment matches.
    """

    scored: list[tuple[Record, float]] = []

    for parent in candidates:
        # covered_by correctly handles Polygon and MultiPolygon geometry,
        # including holes, and allows coincident boundaries.
        if child.geometry.covered_by(parent.geometry):
            scored.append((parent, 1.0))
            continue

        if child.geometry.intersects(parent.geometry):
            score = coverage_ratio(child.geometry, parent.geometry)
            if score > 0.0:
                scored.append((parent, score))

    scored.sort(key=lambda item: item[1], reverse=True)

    if not scored:
        return None, [], False

    exact = [item for item in scored if item[1] >= 1.0]

    return scored[0][0], scored, bool(exact)


# ---------------------------------------------------------------------------
# Tree construction
# ---------------------------------------------------------------------------


def attach_child(parent: Record, child: Record) -> None:
    """Attach a child once and keep feature parentId synchronized."""

    if child.parent is parent:
        return

    if child.parent is not None:
        if child in child.parent.children:
            child.parent.children.remove(child)

    child.parent = parent
    parent.children.append(child)
    child.feature["properties"]["parentId"] = parent.feature_id


def build_id_index(
    records_by_level: dict[int, list[Record]],
) -> dict[tuple[int, str], Record]:
    return {
        (record.level, record.feature_id): record
        for records in records_by_level.values()
        for record in records
    }


# ---------------------------------------------------------------------------
# Relationship resolution
# ---------------------------------------------------------------------------


def classify_relationship(
    child: Record,
    scored: list[tuple[Record, float]],
    sure_guess_threshold: float,
    resolved_threshold: float,
    max_candidates: int,
    path: list[Record],
) -> dict[str, Any]:
    """
    Classify the best parent relationship.

    The top candidate is enough for the hierarchy decision:
        >= resolved threshold -> assign silently
        >= sure-guess threshold -> assign + report
        otherwise -> manual review, do not assign
    """

    top = scored[:max_candidates]

    if not scored:
        return {
            "status": "manual_review",
            "parent": None,
            "candidates": [],
            "path": path,
        }

    best_parent, best_score = scored[0]

    if best_score >= resolved_threshold:
        return {
            "status": "resolved",
            "parent": best_parent,
            "score": best_score,
            "candidates": top,
            "path": path,
        }

    if best_score >= sure_guess_threshold:
        return {
            "status": "sure_guess",
            "parent": best_parent,
            "score": best_score,
            "candidates": top,
            "path": path,
        }

    return {
        "status": "manual_review",
        "parent": None,
        "score": best_score,
        "candidates": top,
        "path": path,
    }


def resolve_parent_for_child(
    child: Record,
    root: Record,
    overrides: dict[str, str],
    nodes_by_level_id: dict[tuple[int, str], Record],
    sure_guess_threshold: float,
    resolved_threshold: float,
    max_candidates: int,
) -> dict[str, Any]:
    """
    Find the direct parent of a child by walking from ADM0 downward.

    Example for ADM4:

        root ADM0
          -> one of root.children (ADM1)
          -> one of selected ADM1.children (ADM2)
          -> one of selected ADM2.children (ADM3)
          -> selected ADM3 is the parent of the ADM4 child

    At each step we inspect ONLY the children of the node found at the
    previous step.
    """

    child_key = f"ADM{child.level}:{child.feature_id}"
    override_parent_id = overrides.get(child_key)

    if override_parent_id is not None:
        parent = nodes_by_level_id.get((child.level - 1, override_parent_id))

        if parent is None:
            return {
                "status": "invalid_override",
                "parent": None,
                "candidates": [],
                "path": [root],
                "message": (
                    f"Override references missing parent "
                    f"ADM{child.level - 1} {override_parent_id!r}."
                ),
            }

        return {
            "status": "manual",
            "parent": parent,
            "score": 1.0,
            "candidates": [(parent, 1.0)],
            "path": build_path_to(parent),
        }

    current = root
    path: list[Record] = [root]

    # ADM0 is the parent of every ADM1 by contract.
    if child.level == 1:
        return {
            "status": "resolved",
            "parent": root,
            "score": 1.0,
            "candidates": [(root, 1.0)],
            "path": path,
        }

    # To find an ADM(X) parent, walk through the hierarchy until the
    # candidate parent level X-1 is reached.
    for candidate_level in range(1, child.level):
        candidates = current.children

        # The tree should already contain all nodes at the previous
        # level because levels are resolved in ascending order.
        if not candidates:
            return {
                "status": "manual_review",
                "parent": None,
                "candidates": [],
                "path": path,
                "message": (
                    f"No ADM{candidate_level} children exist under "
                    f"the current ADM{current.level} node."
                ),
            }

        best_parent, scored, _ = best_parent_candidate(
            child,
            candidates,
        )

        classification = classify_relationship(
            child,
            scored,
            sure_guess_threshold,
            resolved_threshold,
            max_candidates,
            path,
        )

        status = classification["status"]

        if status == "manual_review":
            classification["failedLevel"] = candidate_level
            classification["candidateParentLevel"] = candidate_level
            return classification

        if status == "sure_guess":
            parent = classification["parent"]

            # If we just resolved the requested child's direct parent,
            # preserve the SURE_GUESS status so it is reported exactly once.
            if candidate_level == child.level - 1:
                return classification

            # Otherwise this is an intermediate ancestor. Its own
            # relationship was already classified when that ancestor was
            # processed at its own level, so we simply continue downward.
            current = parent
            path.append(current)
            continue

        # RESOLVED: descend to that node and continue.
        current = classification["parent"]
        path.append(current)

    # current is now the direct ADM(X-1) parent.
    return {
        "status": "resolved",
        "parent": current,
        "score": 1.0,
        "candidates": [(current, 1.0)],
        "path": path,
    }


def build_path_to(node: Record) -> list[Record]:
    path: list[Record] = []
    current: Optional[Record] = node

    while current is not None:
        path.append(current)
        current = current.parent

    path.reverse()
    return path


def resolve_hierarchy(
    detailed: dict[int, list[Record]],
    overrides: dict[str, str],
    sure_guess_threshold: float,
    resolved_threshold: float,
    max_candidates: int,
) -> tuple[dict[str, Any], dict[int, dict[str, int]], list[dict[str, Any]]]:
    """Build the detailed pointer tree and collect one report item per case."""

    root_records = detailed[0]
    if len(root_records) != 1:
        raise PreprocessError(
            f"Expected exactly one ADM0 root; found {len(root_records)}"
        )

    root = root_records[0]
    nodes_by_level_id = build_id_index(detailed)

    stats_by_level: dict[int, dict[str, int]] = {}
    sure_guesses: list[dict[str, Any]] = []
    manual_reviews: list[dict[str, Any]] = []
    invalid_overrides: list[dict[str, Any]] = []

    # ADM1 is directly under the single ADM0 root by input contract.
    for child in detailed[1]:
        attach_child(root, child)

    stats_by_level[1] = {
        "resolved": len(detailed[1]),
        "sureGuesses": 0,
        "manualReview": 0,
    }

    for level in range(2, max(detailed) + 1):
        stats = {
            "resolved": 0,
            "sureGuesses": 0,
            "manualReview": 0,
        }

        for child in detailed[level]:
            result = resolve_parent_for_child(
                child,
                root,
                overrides,
                nodes_by_level_id,
                sure_guess_threshold,
                resolved_threshold,
                max_candidates,
            )

            status = result["status"]

            if status in {"resolved", "manual"}:
                parent = result.get("parent")
                if parent is None:
                    manual_reviews.append(
                        make_report_entry(
                            child,
                            result,
                            max_candidates,
                        )
                    )
                    stats["manualReview"] += 1
                    continue

                attach_child(parent, child)
                stats["resolved"] += 1
                continue

            if status == "sure_guess":
                parent = result["parent"]
                attach_child(parent, child)

                sure_guesses.append(
                    make_report_entry(
                        child,
                        result,
                        max_candidates,
                    )
                )
                stats["sureGuesses"] += 1
                continue

            if status == "manual_review":
                manual_reviews.append(
                    make_report_entry(
                        child,
                        result,
                        max_candidates,
                    )
                )
                stats["manualReview"] += 1
                continue

            if status == "invalid_override":
                invalid_overrides.append(
                    make_report_entry(
                        child,
                        result,
                        max_candidates,
                    )
                )
                stats["manualReview"] += 1
                continue

            raise PreprocessError(
                f"Unknown resolution status: {status!r}"
            )

        stats_by_level[level] = stats

    report = {
        "sureGuesses": sure_guesses,
        "manualReview": manual_reviews,
        "invalidOverrides": invalid_overrides,
    }

    return report, stats_by_level, []


def make_report_entry(
    child: Record,
    result: dict[str, Any],
    max_candidates: int,
) -> dict[str, Any]:
    path = result.get("path", [])

    path_info = [
        {
            "level": node.level,
            "id": node.feature_id,
            "name": node.name,
        }
        for node in path
    ]

    candidates = [
        {
            "level": parent.level,
            "id": parent.feature_id,
            "name": parent.name,
            "coverageRatio": score,
        }
        for parent, score in result.get("candidates", [])[:max_candidates]
    ]

    return {
        "child": {
            "level": child.level,
            "id": child.feature_id,
            "name": child.name,
        },
        "status": result.get("status"),
        "failedLevel": result.get("failedLevel"),
        "candidateParentLevel": result.get("candidateParentLevel"),
        "bestCoverageRatio": result.get("score"),
        "candidates": candidates,
        "knownPath": path_info,
        "message": result.get("message"),
    }


# ---------------------------------------------------------------------------
# Output / transfer to simplified geometries
# ---------------------------------------------------------------------------


def transfer_parent_ids(
    detailed: dict[int, list[Record]],
    simplified: dict[int, list[Record]],
) -> None:
    detailed_by_key = {
        (record.level, record.feature_id): record
        for records in detailed.values()
        for record in records
    }

    for level, records in simplified.items():
        for simplified_record in records:
            detailed_record = detailed_by_key[
                (level, simplified_record.feature_id)
            ]
            parent = detailed_record.parent

            simplified_record.feature["properties"]["parentId"] = (
                parent.feature_id if parent is not None else None
            )
            simplified_record.feature["properties"]["adminLevel"] = level


def validate_runtime_parent_ids(
    simplified: dict[int, list[Record]],
) -> None:
    ids_by_level = {
        level: {record.feature_id for record in records}
        for level, records in simplified.items()
    }

    for level in range(1, max(simplified) + 1):
        for record in simplified[level]:
            parent_id = record.feature["properties"].get("parentId")

            if parent_id is None:
                continue

            if parent_id not in ids_by_level[level - 1]:
                raise PreprocessError(
                    f"ADM{level} {record.feature_id} has invalid parentId "
                    f"{parent_id!r}"
                )


def build_manifest(
    records_by_level: dict[int, list[Record]],
    id_property: str,
    name_property: str,
    report: dict[str, Any],
    stats_by_level: dict[int, dict[str, int]],
    sure_guess_threshold: float,
    resolved_threshold: float,
) -> dict[str, Any]:
    levels = sorted(records_by_level)

    return {
        "schemaVersion": 1,
        "levels": levels,
        "maxLevel": max(levels),
        "rootLevel": 0,
        "idProperty": id_property,
        "nameProperty": name_property,
        "levelProperty": "adminLevel",
        "parentProperty": "parentId",
        "geometrySource": "simplified",
        "relationshipSource": "detailed",
        "resolutionPolicy": {
            "resolvedThreshold": resolved_threshold,
            "sureGuessThreshold": sure_guess_threshold,
        },
        "hasManualReview": bool(
            report["manualReview"] or report["invalidOverrides"]
        ),
        "sureGuessCount": len(report["sureGuesses"]),
        "manualReviewCount": len(report["manualReview"]),
        "invalidOverrideCount": len(report["invalidOverrides"]),
        "resolution": {
            f"ADM{level}": stats
            for level, stats in stats_by_level.items()
        },
    }


def write_outputs(
    simplified_records: dict[int, list[Record]],
    manifest: dict[str, Any],
    report: dict[str, Any],
    output_dir: Path,
    geojson_metadata: Any
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    boundaries = {
        "type": "FeatureCollection",
        **geojson_metadata,
        "features": [
            record.feature
            for level in sorted(simplified_records)
            for record in simplified_records[level]
        ],
    }

    (output_dir / "boundaries.geojson").write_text(
        json.dumps(boundaries, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report_json = {
        "status": (
            "manual-review-required"
            if report["manualReview"] or report["invalidOverrides"]
            else "ok"
        ),
        "summary": {
            "sureGuesses": len(report["sureGuesses"]),
            "manualReview": len(report["manualReview"]),
            "invalidOverrides": len(report["invalidOverrides"]),
        },
        **report,
    }

    (output_dir / "preprocess-report.json").write_text(
        json.dumps(report_json, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines: list[str] = []

    lines.append("ADMINISTRATIVE HIERARCHY PREPROCESSING")
    lines.append("=" * 42)
    lines.append("")

    lines.append("Summary")
    lines.append("-------")
    lines.append(f"Sure guesses:     {len(report['sureGuesses'])}")
    lines.append(f"Manual review:    {len(report['manualReview'])}")
    lines.append(f"Invalid overrides: {len(report['invalidOverrides'])}")
    lines.append("")

    if report["sureGuesses"]:
        lines.append("SURE GUESSES (80% <= coverage < 90%)")
        lines.append("-----------------------------------")

        for item in report["sureGuesses"]:
            child = item["child"]
            lines.append(
                f"ADM{child['level']} {child['id']} ({child.get('name')})"
            )
            if item.get("bestCoverageRatio") is not None:
                lines.append(
                    f"    selected parent coverage="
                    f"{item['bestCoverageRatio'] * 100:.4f}%"
                )
            for candidate in item.get("candidates", []):
                lines.append(
                    f"    candidate: ADM{candidate['level']} "
                    f"{candidate['id']} ({candidate.get('name')}) "
                    f"coverage={candidate['coverageRatio'] * 100:.4f}%"
                )
            lines.append("")

    if report["manualReview"]:
        lines.append("MANUAL REVIEW (< 80%)")
        lines.append("---------------------")

        for item in report["manualReview"]:
            child = item["child"]
            lines.append(
                f"ADM{child['level']} {child['id']} ({child.get('name')})"
            )

            if item.get("failedLevel") is not None:
                lines.append(
                    f"    Failed while resolving ADM{item['failedLevel']} parent."
                )

            if item.get("message"):
                lines.append(f"    {item['message']}")

            if item.get("knownPath"):
                path = " -> ".join(
                    f"ADM{node['level']}:{node['name']}"
                    for node in item["knownPath"]
                )
                lines.append(f"    Known path: {path}")

            if item.get("candidates"):
                lines.append("    Best candidates:")
                for index, candidate in enumerate(
                    item["candidates"],
                    start=1,
                ):
                    lines.append(
                        f"      {index}. ADM{candidate['level']} "
                        f"{candidate['id']} ({candidate.get('name')}) "
                        f"coverage={candidate['coverageRatio'] * 100:.4f}%"
                    )
            else:
                lines.append("    No candidate parent found at this level.")

            lines.append("")

    if report["invalidOverrides"]:
        lines.append("INVALID OVERRIDES")
        lines.append("-----------------")

        for item in report["invalidOverrides"]:
            child = item["child"]
            lines.append(
                f"ADM{child['level']} {child['id']} ({child.get('name')})"
            )
            lines.append(f"    {item.get('message')}")
            lines.append("")

    if not report["sureGuesses"] and not report["manualReview"] and not report["invalidOverrides"]:
        lines.append("No hierarchy issues require review.")

    (output_dir / "preprocess-report.txt").write_text(
        "\n".join(lines),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the normalized administrative-map dataset."
    )

    parser.add_argument(
        "--detailed",
        type=Path,
        default=Path("tools/data-pipeline/admin-boundaries/input/detailed"),
        help="Detailed GeoJSON directory used for hierarchy resolution.",
    )

    parser.add_argument(
        "--simplified",
        type=Path,
        default=Path("tools/data-pipeline/admin-boundaries/input/simplified"),
        help="Simplified GeoJSON directory used for runtime geometry.",
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=Path("apps/frontend/public/data"),
        help="Runtime output directory.",
    )

    parser.add_argument(
        "--overrides",
        type=Path,
        default=None,
        help="Optional JSON file containing manual parent overrides.",
    )

    parser.add_argument(
        "--id-property",
        default="shapeID",
        help="Stable feature ID property.",
    )

    parser.add_argument(
        "--name-property",
        default="shapeName",
        help="Feature name property.",
    )

    parser.add_argument(
        "--resolved-threshold",
        type=float,
        default=0.90,
        help=(
            "Coverage ratio >= this value is silently resolved. "
            "Default: 0.90."
        ),
    )

    parser.add_argument(
        "--sure-guess-threshold",
        type=float,
        default=0.80,
        help=(
            "Coverage ratio >= this value but below the resolved threshold "
            "is assigned and reported as a sure guess. Default: 0.80."
        ),
    )

    parser.add_argument(
        "--max-candidates",
        type=int,
        default=3,
        help=(
            "Maximum number of candidate parents written to the report. "
            "Default: 3."
        ),
    )

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    simplified_metadata = {}

    if not 0.0 < args.sure_guess_threshold < args.resolved_threshold <= 1.0:
        print(
            "ERROR: thresholds must satisfy "
            "0 < sure-guess-threshold < resolved-threshold <= 1",
            file=sys.stderr,
        )
        return 2

    if args.max_candidates < 1:
        print("ERROR: --max-candidates must be >= 1", file=sys.stderr)
        return 2

    try:
        detailed = load_records(
            args.detailed,
            args.id_property,
            args.name_property,
        )

        simplified = load_records(
            args.simplified,
            args.id_property,
            args.name_property,
        )

        simplified_metadata = load_geojson_metadata(args.simplified)

        validate_matching_ids(detailed, simplified)

        overrides = load_overrides(args.overrides)

        report, stats_by_level, _ = resolve_hierarchy(
            detailed=detailed,
            overrides=overrides,
            sure_guess_threshold=args.sure_guess_threshold,
            resolved_threshold=args.resolved_threshold,
            max_candidates=args.max_candidates,
        )

        # Transfer only the derived parentId relationship to the simplified
        # runtime geometry. The original detailed geometry is never emitted.
        transfer_parent_ids(detailed, simplified)
        validate_runtime_parent_ids(simplified)

        manifest = build_manifest(
            simplified,
            args.id_property,
            args.name_property,
            report,
            stats_by_level,
            args.sure_guess_threshold,
            args.resolved_threshold,
        )

        write_outputs(
            simplified_records=simplified,
            manifest=manifest,
            report=report,
            output_dir=args.output,
            geojson_metadata=simplified_metadata,
        )

        total_features = sum(
            len(records)
            for records in simplified.values()
        )

        print(
            f"Processed {total_features} features across "
            f"ADM0..ADM{max(simplified)}."
        )

        for level, stats in stats_by_level.items():
            print(
                f"ADM{level}: "
                f"resolved={stats['resolved']}, "
                f"sureGuess={stats['sureGuesses']}, "
                f"manualReview={stats['manualReview']}"
            )

        print(
            f"\nSure guesses: "
            f"{len(report['sureGuesses'])}"
        )
        print(
            f"Manual review: "
            f"{len(report['manualReview'])}"
        )

        print(
            f"\nReport: {args.output / 'preprocess-report.txt'}"
        )
        print(
            f"Runtime data: {args.output / 'boundaries.geojson'}"
        )

        # Relationship problems are deliberately non-fatal. The generated
        # report tells the developer exactly what still needs attention.
        return 0

    except PreprocessError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
