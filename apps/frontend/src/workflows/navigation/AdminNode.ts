import type Feature from 'ol/Feature.js';

export class AdminNode {
  readonly id: string;
  readonly level: number;
  readonly feature: Feature;
  parent: AdminNode | null = null;
  readonly children: AdminNode[] = [];

  constructor(args: { id: string; level: number; feature: Feature }) {
    this.id = args.id;
    this.level = args.level;
    this.feature = args.feature;
  }
}
