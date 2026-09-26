# Numeric tiles with client-side presentation

Broad geographic projections are served as immutable versioned numeric data tiles. The frontend renders them with a Canvas/worker path by default, with an OpenLayers WebGL adapter retained as an alternate path (ADR-0006). Presentation choices such as color ramps, thresholds, and opacity remain client-side. This separates expensive server-side interpolation from operator-controlled visual styling.

**Consequences:** Tiles can be cached by version, palettes can change without refetching data, and the dual renderer seam keeps Canvas and WebGL behind one `SignalQualityRenderer` interface.
