#!/usr/bin/env python3
"""One-pass interactive repair of unresolved administrative parents.

The script reads:
    tools/data-pipeline/admin-boundaries/input/detailed/
                                authoritative geometries for review
    apps/frontend/public/data/boundaries.geojson
                                generated runtime dataset
    tools/data-pipeline/admin-boundaries/reports/preprocess-report.json

For each MANUAL_REVIEW item it walks from ADM0 down to the child's direct
parent. At each level it shows the best geometric candidates. The operator
may choose one of them, or use `a` to search the whole level when the current
automatic branch is wrong.

Commands at a candidate prompt:
    1..N : choose a displayed candidate
    a    : search the complete level
    s    : skip this case
    q    : save and quit

Every accepted parent is written immediately to boundaries.geojson. The
manual-review report and manifest counters are updated as well.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from shapely.geometry import shape
from shapely.strtree import STRtree

LEVEL_RE = re.compile(r"ADM(\d+)", re.IGNORECASE)


@dataclass
class FeatureRecord:
    level: int
    feature_id: str
    name: str
    geometry: Any


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: Path, data: Any, pretty: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            if pretty :
                json.dump(data, f, ensure_ascii=False, indent=2)
            else :
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def discover_level_files(directory: Path) -> dict[int, Path]:
    files: dict[int, Path] = {}
    for path in directory.glob("*.geojson"):
        match = LEVEL_RE.search(path.name)
        if not match:
            continue
        level = int(match.group(1))
        if level in files:
            raise RuntimeError(
                f"Multiple GeoJSON files found for ADM{level}: "
                f"{files[level].name} and {path.name}"
            )
        files[level] = path
    if not files:
        raise RuntimeError(f"No ADM*.geojson files found in {directory}")
    max_level = max(files)
    missing = sorted(set(range(max_level + 1)) - set(files))
    if missing:
        raise RuntimeError(
            "Detailed input must contain every level from ADM0 through ADMn. "
            f"Missing: {', '.join(f'ADM{x}' for x in missing)}"
        )
    return dict(sorted(files.items()))


def load_detailed_records(
    directory: Path,
    id_property: str,
    name_property: str,
) -> dict[int, list[FeatureRecord]]:
    result: dict[int, list[FeatureRecord]] = {}

    for level, path in discover_level_files(directory).items():
        fc = load_json(path)
        if fc.get("type") != "FeatureCollection":
            raise RuntimeError(f"{path} is not a GeoJSON FeatureCollection")

        records: list[FeatureRecord] = []
        for feature in fc.get("features", []):
            props = feature.get("properties") or {}
            feature_id = str(props[id_property])
            name = str(props.get(name_property, "<unnamed>"))
            geometry = shape(feature["geometry"])
            records.append(
                FeatureRecord(
                    level=level,
                    feature_id=feature_id,
                    name=name,
                    geometry=geometry,
                )
            )
        result[level] = records

    return result


def coverage(child: FeatureRecord | Any, parent: FeatureRecord | Any) -> float:
    child_geometry = child.geometry if hasattr(child, "geometry") else child
    parent_geometry = parent.geometry if hasattr(parent, "geometry") else parent
    area = child_geometry.area
    if area <= 0:
        return 0.0
    return max(
        0.0,
        min(
            1.0,
            child_geometry.intersection(parent_geometry).area / area,
        ),
    )


def build_indexes(
    detailed: dict[int, list[FeatureRecord]],
) -> dict[int, tuple[STRtree, list[FeatureRecord]]]:
    indexes: dict[int, tuple[STRtree, list[FeatureRecord]]] = {}
    for level, records in detailed.items():
        indexes[level] = (STRtree([r.geometry for r in records]), records)
    return indexes


def candidate_children(
    parent: FeatureRecord,
    child_level: int,
    indexes: dict[int, tuple[STRtree, list[FeatureRecord]]],
) -> list[tuple[FeatureRecord, float]]:
    tree, records = indexes[child_level]
    indices = tree.query(parent.geometry, predicate="intersects")
    candidates: list[tuple[FeatureRecord, float]] = []
    for index in indices:
        child = records[int(index)]
        score = coverage(child, parent)
        if score > 0.0:
            candidates.append((child, score))
    candidates.sort(key=lambda item: item[1], reverse=True)
    return candidates


def search_level(
    records: list[FeatureRecord],
    query: str,
) -> list[FeatureRecord]:
    q = query.casefold().strip()
    if not q:
        return []
    exact: list[FeatureRecord] = []
    partial: list[FeatureRecord] = []
    for record in records:
        rid = record.feature_id.casefold()
        name = record.name.casefold()
        if q == rid or q == name:
            exact.append(record)
        elif q in rid or q in name:
            partial.append(record)
    return exact + partial


def path_names(node: FeatureRecord, parent_lookup: dict[tuple[int, str], str]) -> list[str]:
    # The reviewer chooses the path explicitly, so this helper is only used
    # for a compact display of the path already established in this pass.
    return [node.name] + [parent_lookup[(node.level, node.feature_id)]] if (node.level, node.feature_id) in parent_lookup else [node.name]


def choose_from_candidates(
    target: FeatureRecord,
    current: FeatureRecord,
    candidates: list[tuple[FeatureRecord, float]],
    all_level_records: list[FeatureRecord],
    max_display: int,
) -> FeatureRecord | None | str:
    shown = candidates[:max_display]

    print()
    print("Candidates:")
    if shown:
        for i, (candidate, score) in enumerate(shown, start=1):
            marker = " [exact]" if score >= 0.999999999 else ""
            print(
                f"  [{i}] {candidate.name} "
                f"(ADM{candidate.level}, {score * 100:.2f}%){marker}"
            )
    else:
        print("  (none)")

    print("  [a] Search all regions at this level")
    print("  [s] Skip this case")
    print("  [q] Save and quit")

    while True:
        answer = input("Choice: ").strip()
        if answer.lower() == "s":
            return None
        if answer.lower() == "q":
            return "QUIT"
        if answer.lower() == "a":
            query = input("Search name or ID: ").strip()
            matches = search_level(all_level_records, query)
            if not matches:
                print("No matches.")
                continue
            if len(matches) > 20:
                print(f"{len(matches)} matches; enter a more specific search.")
                continue
            for i, record in enumerate(matches, start=1):
                print(f"  [{i}] {record.name} (ID {record.feature_id})")
            while True:
                choice = input("Search result: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(matches):
                    return matches[int(choice) - 1]
                print("Enter one of the displayed numbers.")

        if answer.isdigit():
            index = int(answer) - 1
            if 0 <= index < len(shown):
                return shown[index][0]

        print("Enter a displayed number, a, s, or q.")


def review_case(
    child: FeatureRecord,
    detailed: dict[int, list[FeatureRecord]],
    indexes: dict[int, tuple[STRtree, list[FeatureRecord]]],
    max_display: int,
) -> str | None:
    root = detailed[0][0]
    current = root
    chosen_path = [root]

    print("\n" + "=" * 68)
    print(f"Manual review: ADM{child.level} {child.name}")
    print(f"ID: {child.feature_id}")
    print("=" * 68)

    for next_level in range(1, child.level):
        candidates = candidate_children(current, next_level, indexes)

        print()
        print(
            f"Target: ADM{child.level} {child.name}"
        )
        print(
            "Current path: "
            + " -> ".join(record.name for record in chosen_path)
        )
        print(
            f"Choose the ADM{next_level} parent under "
            f"{current.name}:"
        )

        selected = choose_from_candidates(
            target=child,
            current=current,
            candidates=candidates,
            all_level_records=detailed[next_level],
            max_display=max_display,
        )

        if selected == "QUIT":
            return "QUIT"
        if selected is None:
            return None

        current = selected
        chosen_path.append(current)

    # At this point current is the direct parent (ADM child.level - 1).
    parent = current
    print()
    print(
        "Selected parent: "
        f"ADM{parent.level} {parent.name}"
    )
    print(
        "Final path: "
        + " -> ".join(record.name for record in chosen_path)
        + f" -> {child.name}"
    )

    return parent.feature_id


def update_report(report: dict[str, Any], resolved_id: str) -> None:
    remaining = []
    resolved = []
    for item in report.get("manualReview", []):
        if item.get("child", {}).get("id") == resolved_id:
            resolved.append(item)
        else:
            remaining.append(item)
    report["manualReview"] = remaining
    report.setdefault("manualResolved", []).extend(resolved)


def update_manifest(manifest: dict[str, Any], report: dict[str, Any]) -> None:
    manifest["manualReviewCount"] = len(report.get("manualReview", []))
    manifest["manualResolvedCount"] = len(report.get("manualResolved", []))
    manifest["hasManualReview"] = bool(
        report.get("manualReview") or report.get("invalidOverrides")
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="One-pass interactive repair of manual administrative-parent reviews."
    )
    parser.add_argument(
        "--detailed",
        type=Path,
        default=Path("tools/data-pipeline/admin-boundaries/input/detailed"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("apps/frontend/public/data"),
    )
    parser.add_argument(
        "--max-display",
        type=int,
        default=5,
        help="Number of ranked candidates shown before using search.",
    )
    parser.add_argument(
        "--id-property",
        default="shapeID",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
    )
    args = parser.parse_args()

    if args.max_display < 1:
        print("ERROR: --max-display must be >= 1", file=sys.stderr)
        return 2

    boundaries_path = args.output / "boundaries.geojson"
    report_path = args.report or Path("tools/data-pipeline/admin-boundaries/reports/preprocess-report.json")
    manifest_path = args.output / "manifest.json"

    try:
        boundaries = load_json(boundaries_path)
        report = load_json(report_path)
        manifest = load_json(manifest_path)
        detailed = load_detailed_records(
            args.detailed,
            args.id_property,
            "shapeName",
        )

        manual_items = report.get("manualReview", [])
        if not manual_items:
            print("No manual-review cases remain.")
            return 0

        indexes = build_indexes(detailed)

        feature_by_key: dict[tuple[int, str], dict[str, Any]] = {}
        for feature in boundaries.get("features", []):
            props = feature.get("properties") or {}
            level = int(props["adminLevel"])
            fid = str(props[args.id_property])
            feature_by_key[(level, fid)] = feature

        for item in list(manual_items):
            child_info = item["child"]
            child_level = int(child_info["level"])
            child_id = str(child_info["id"])

            detailed_child = next(
                (
                    r
                    for r in detailed[child_level]
                    if r.feature_id == child_id
                ),
                None,
            )
            if detailed_child is None:
                print(
                    f"ERROR: detailed feature not found for ADM{child_level} {child_id}",
                    file=sys.stderr,
                )
                return 2

            result = review_case(
                detailed_child,
                detailed,
                indexes,
                args.max_display,
            )

            if result == "QUIT":
                print("\nSaved and quit.")
                return 0

            if result is None:
                print("Skipped.")
                continue

            runtime_feature = feature_by_key.get(
                (child_level, child_id)
            )
            if runtime_feature is None:
                print(
                    f"ERROR: runtime feature not found for ADM{child_level} {child_id}",
                    file=sys.stderr,
                )
                return 2

            runtime_feature.setdefault("properties", {})["parentId"] = result

            # Persist immediately after each decision. There is deliberately
            # no undo/history mechanism: this is a simple one-pass reviewer.
            atomic_write_json(boundaries_path, boundaries, False)

            update_report(report, child_id)
            update_manifest(manifest, report)
            atomic_write_json(report_path, report, True)
            atomic_write_json(manifest_path, manifest, True)

            print(
                f"✓ Saved parentId={result} for {child_info.get('name', child_id)}"
            )

        print("\nManual review pass complete.")
        print(
            f"Remaining manual reviews: "
            f"{len(report.get('manualReview', []))}"
        )
        return 0

    except (OSError, KeyError, ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
