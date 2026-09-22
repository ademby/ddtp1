import { AdminNode } from '../domain/AdminNode';

export interface NavigationState {
  selected: AdminNode | null;
  path: AdminNode[];
  active: AdminNode[];
  context: AdminNode[];
}
