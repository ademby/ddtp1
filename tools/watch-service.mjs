import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = process.argv[2];
const services = {
  backend: { entry: 'dist/main.js' },
  drone: { entry: 'dist/server.js' },
};
if (!project || !services[project]) throw new Error(`Unknown service: ${project}`);

const root = resolve(fileURLToPath(new URL(`../apps/${project === 'drone' ? 'drone-mock' : 'backend'}/`, import.meta.url)));
const entry = services[project].entry;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();
let stopping = false;

function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env, detached: process.platform !== 'win32', ...options });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) killGroup(child.pid, 'SIGTERM');
  setTimeout(() => {
    for (const child of children) killGroup(child.pid, 'SIGKILL');
    process.exit(code);
  }, 1500);
}

const initial = run(npm, ['run', 'build']);
initial.on('exit', (code) => {
  if (stopping) return;
  if (code !== 0) return stop(code ?? 1);

  run(npm, ['exec', '--', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput']);
  run(process.execPath, ['--watch', entry]);
});
initial.on('error', () => stop(1));

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('exit', () => {
  for (const child of children) killGroup(child.pid, 'SIGKILL');
});
