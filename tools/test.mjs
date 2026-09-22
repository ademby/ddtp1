import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

await rm('.test-dist', { recursive: true, force: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
    child.on('error', reject);
  });
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
await run(npm, ['run', 'build']);
await run(process.execPath, ['--test', 'tests/workflows.test.js']);
