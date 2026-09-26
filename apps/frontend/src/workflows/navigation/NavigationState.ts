import { AdminNode } from './AdminNode';

export interface NavigationState {
  selected: AdminNode | null;
  path: AdminNode[];
  active: AdminNode[];
  context: AdminNode[];
}
