import { FeatureLike } from "ol/Feature";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";
import { StyleFunction } from "ol/style/Style";

export const contextStyle = new Style({
  stroke: new Stroke({ color: "#1746a2", width: 4 }),
  zIndex: 1,
});

export const activeStyle = new Style({
  fill: new Fill({ color: "rgba(255, 255, 255, 0.035)" }),
  stroke: new Stroke({ color: "rgba(0, 0, 0, 0.55)", width: 1.5 }),
  zIndex: 2,
});

export const selectedStyle = new Style({
  fill: new Fill({ color: "rgba(255, 255, 255, 0.03)" }),
  stroke: new Stroke({ color: "#a72c2c", width: 4 }),
  zIndex: 20,
});

export const hoverStyle = new Style({
  stroke: new Stroke({ color: "#ffffff", width: 3 }),
  zIndex: 30,
});

/** `#rrggbb` (or already-rgba) color plus an alpha, as a CSS `rgba(...)` string. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/**
 * Result-review measurement points. Fill color is precomputed per-feature (`color` property,
 * from `sampleSignalQualityPalette`) rather than recomputed here, so restyling on
 * selection/rejection change doesn't re-walk the palette. Fills carry alpha so densely
 * overlapping drive-test points blend into each other instead of one fully hiding the rest.
 * A selected point gets an amber halo ring underneath (chosen for contrast against both the
 * basemap and the red-to-blue Signal Quality colors); a rejected point is desaturated with a
 * red outline instead of its KPI color.
 */
export const measurementStyle: StyleFunction = function (feature: FeatureLike): Style[] {
  const color = (feature.get("color") as string | undefined) ?? "#888888";
  const rejected = feature.get("rejected") === true;
  const selected = feature.get("selected") === true;
  const styles: Style[] = [];

  if (selected) {
    styles.push(
      new Style({
        image: new CircleStyle({
          radius: 9,
          stroke: new Stroke({ color: "#ffb703", width: 3 }),
        }),
        // Above every point's own zIndex (2): OL sorts style instances by zIndex across the
        // WHOLE layer, not per feature, so at zIndex 1 this halo was routinely getting drawn
        // UNDER a neighboring unselected point's circle once measurements sit only ~10m apart
        // (see seed-demo-missions.mts) — selection was correct internally, the ring just
        // wasn't visible under a denser neighbor. zIndex 5 guarantees it always wins.
        zIndex: 5,
      }),
    );
  }

  styles.push(
    new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: rejected ? "rgba(130,130,130,0.35)" : withAlpha(color, 0.72) }),
        stroke: new Stroke({
          color: rejected ? "rgba(167,44,44,0.85)" : "rgba(0,0,0,0.35)",
          width: rejected ? 2 : 1,
        }),
      }),
      zIndex: 2,
    }),
  );

  return styles;
};

export const missionStyle: StyleFunction = function (
  feature: FeatureLike,
): Style {
  const accomplished = feature.get("status") === "ACCOMPLISHED";
  return new Style({
    stroke: new Stroke({
      color: accomplished ? "#1f9d55" : "#ef4444",
      width: 5,
      lineDash: accomplished ? undefined : [10, 7],
    }),
  });
};
