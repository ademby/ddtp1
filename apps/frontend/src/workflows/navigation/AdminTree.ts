import { AdminNode } from './AdminNode.js';

export class AdminTree {
  readonly root: AdminNode;

  constructor(root: AdminNode) {
    this.root = root;
  }

  pathTo(node: AdminNode): AdminNode[] {
    const path: AdminNode[] = [];
    for (let current: AdminNode | null = node; current; current = current.parent) {
      path.push(current);
    }
    return path.reverse();
  }

  siblingsOf(node: AdminNode): AdminNode[] {
    if (!node.parent) return [];
    return node.parent.children.filter((child) => child !== node);
  }

  allNodes(): AdminNode[] {
    const nodes: AdminNode[] = [];
    const visit = (node: AdminNode): void => {
      nodes.push(node);
      node.children.forEach(visit);
    };
    visit(this.root);
    return nodes;
  }
}
