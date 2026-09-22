import { rm } from 'node:fs/promises';

await Promise.all([
  rm('.test-dist', { recursive: true, force: true }),
  rm('apps/frontend/dist', { recursive: true, force: true }),
  rm('apps/backend/dist', { recursive: true, force: true }),
  rm('apps/drone-mock/dist', { recursive: true, force: true }),
]);
