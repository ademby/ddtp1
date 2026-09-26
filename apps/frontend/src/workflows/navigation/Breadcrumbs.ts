import type { AdminNode } from './AdminNode.js';
import LocationDisplay, { CLASS_SELECTED } from './LocationDisplay.js';

export const CLASS_BREADCRUMB = 'breadcrumb';

export default class Breadcrumbs extends LocationDisplay {
  private readonly requestNavigation: (id: string) => void;

  constructor(requestNavigation: (id: string) => void) {
    super('ol-breadcrumbs');
    this.requestNavigation = requestNavigation;
  }

  override nodeToElement(node: AdminNode, isLast: boolean): HTMLElement {
      const link = document.createElement('a');
      link.textContent = String(node.feature.get('shapeName'));
      link.dataset.id = node.id;
      link.title = isLast ? 'Selected' : 'Navigate here';
      link.className += CLASS_BREADCRUMB;
      link.className += isLast ? ` ${CLASS_SELECTED}`: '' ;
      link.addEventListener('click', () => this.requestNavigation(node.id));
      return link;
  }
}
