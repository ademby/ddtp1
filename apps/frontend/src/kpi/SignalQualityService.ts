import type { SignalQualityDataset } from "./SignalQuality.js";
import type { SignalQualityRange } from "@drone-drive/contracts/signal-quality";

/**
 * Loads only the {min, max, version} range from the backend's numeric-tile API — no
 * measurements are downloaded client-side; interpolation happened server-side.
 */
export class SignalQualityService {
  constructor(private readonly apiBaseUrl: string) {}

  async load(): Promise<SignalQualityDataset> {
    const response = await fetch(`${this.apiBaseUrl}/signal-quality/range`);
    if (!response.ok)
      throw new Error(
        `Failed to load Signal Quality range: ${response.status}`,
      );
    const range = (await response.json()) as SignalQualityRange;
    return {
      metric: "Signal Quality",
      crs: "EPSG:4326",
      min: range.min,
      max: range.max,
      measurements: [],
      version: range.version,
    };
  }
}

export default SignalQualityService;
