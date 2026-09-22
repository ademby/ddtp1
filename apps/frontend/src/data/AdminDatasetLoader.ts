import GeoJSON from 'ol/format/GeoJSON.js';
import type Feature from 'ol/Feature.js';
import type { ProjectionLike } from 'ol/proj.js';
import { AdminNode } from '../domain/AdminNode.js';
import { AdminTree } from '../domain/AdminTree.js';

export interface AdminDataset {
  features: Feature[];
  tree: AdminTree;
  getNodeByFeature(feature: Feature): AdminNode | undefined;
  getNodeById(id: string): AdminNode | undefined;
}

export interface AdminDatasetOptions {
  url?: string;
  featureProjection?: ProjectionLike;
}
export default class AdminDatasetLoader {

  static async loadDataset({
    featureProjection,
    url = '/data/boundaries.geojson',
  }: AdminDatasetOptions = {}): Promise<AdminDataset> {

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);

    // Loading Features
    const data = await response.json();
    const format = new GeoJSON();
    const features = format.readFeatures(data, { featureProjection });
    if (!features.length) throw new Error('Dataset contains no features');

    const featureToNode = new WeakMap<Feature, AdminNode>();
    const idToNode = new Map<string, AdminNode>();
    const roots: AdminNode[] = [];
    
    // Regisetering Nodes
    for (const feature of features) {
      const level = Number(feature.get('adminLevel'));
      const id = String(feature.get('shapeID'));
      if (!Number.isInteger(level)) throw new Error(`Invalid admin level for ${id}`);
      if (idToNode.has(id)) throw new Error(`Duplicate runtime node: ${id}`);

      const node = new AdminNode({ id, level, feature });
      idToNode.set(id, node);
      featureToNode.set(feature, node);
      if (level === 0) roots.push(node);
    }

    if (roots.length !== 1) {
      throw new Error(`Runtime dataset must contain exactly one ADM0 root; found ${roots.length}`);
    }
    
    // Biulding the tree
    for (const node of idToNode.values()) {
      if (node.level === 0) continue;
      const parentId = node.feature.get('parentId');
      if (!parentId) throw new Error(`Missing parentId for ${node.id}`);
      const parent = idToNode.get(String(parentId));
      if (!parent) throw new Error(`Parent not found for ${node.id}: ${parentId}`);
      node.parent = parent;
      parent.children.push(node);
    }

    return {
      features,
      tree: new AdminTree(roots[0]),
      getNodeByFeature: (feature) => featureToNode.get(feature),
      getNodeById: (id) => idToNode.get(id),
    };
  }

}