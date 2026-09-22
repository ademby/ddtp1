# Numeric tiles with client-side presentation

Broad geographic projections are served as immutable versioned numeric data tiles and rendered with OpenLayers WebGL; presentation choices such as color ramps, thresholds, and opacity remain client-side. This separates expensive server-side interpolation from operator-controlled visual styling.

**Consequences:** Tiles can be cached by version, palettes can change without refetching data, and a CPU/pre-colored fallback may be provided for browsers without usable WebGL.
