export interface SignalQualityMeasurement {
  id: string;
  coordinates: [number, number];
  value: number;
}

export interface SignalQualityDataset {
  metric: 'Signal Quality';
  crs: string;
  min: number;
  max: number;
  measurements: SignalQualityMeasurement[];
  /** Present in backend mode: identifies the approved-measurement set a tile was rendered from, for cache-busting. */
  version?: string;
}
