import type { AdminNode } from './AdminNode.js';

export function shouldUseDefaultTransition(
  source: AdminNode | null,
  destination: AdminNode,
): boolean {
  return destination.parent === null
    || (source !== null && (isAncestor(source, destination) || isAncestor(destination, source)));
}

function isAncestor(ancestor: AdminNode, node: AdminNode): boolean {
  let current: AdminNode | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}
