import { spawnSync } from 'node:child_process';

const pod = 'drone-drive-pod';
const container = 'drone-drive-postgres';
const volume = 'drone-drive-db-data';
const image = 'docker.io/library/postgres:16-alpine';

function run(args, options = {}) {
  const result = spawnSync('podman', args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function exists(type, name) {
  const result = spawnSync('podman', [type, 'exists', name]);
  return result.status === 0;
}

function ensureVolume() {
  if (!exists('volume', volume)) {
    run(['volume', 'create', volume]);
  }
}

function up() {
  ensureVolume();

  if (!exists('pod', pod)) {
    run([
      'pod',
      'create',
      '--name',
      pod,
      '-p',
      '127.0.0.1:5432:5432',
    ]);
  }

  if (!exists('container', container)) {
    run([
      'run',
      '-d',
      '--name',
      container,
      '--pod',
      pod,
      '--restart',
      'unless-stopped',

      '--health-cmd',
      'pg_isready -U postgres -d drone_drive',
      '--health-interval',
      '5s',
      '--health-timeout',
      '3s',
      '--health-retries',
      '10',

      '-e',
      'POSTGRES_USER=postgres',

      '-e',
      'POSTGRES_PASSWORD=postgres',

      '-e',
      'POSTGRES_DB=drone_drive',

      '-v',
      `${volume}:/var/lib/postgresql/data`,

      image,
    ]);
  }

  const inspect = spawnSync(
    'podman',
    ['pod', 'inspect', '--format', '{{.State}}', pod],
    { encoding: 'utf8' },
  );

  if ((inspect.stdout ?? '').trim() !== 'Running') {
    run(['pod', 'start', pod]);
  }

  console.log(`[db] Pod ${pod} is running.`);
  console.log(
    '[db] PostgreSQL: postgresql://postgres:postgres@localhost:5432/drone_drive',
  );
}

function down() {
  if (!exists('pod', pod)) {
    console.log(`[db] Pod ${pod} does not exist.`);
    return;
  }

  run(['pod', 'stop', pod], {
    allowFailure: true,
  });

  run(['pod', 'rm', pod]);
}

function reset() {
  down();

  if (exists('volume', volume)) {
    run(['volume', 'rm', volume]);
  }

  up();
}

function logs() {
  if (!exists('container', container)) {
    console.error(
      `[db] Container ${container} does not exist. Run: npm run db:up`,
    );
    process.exit(1);
  }

  run(['logs', '-f', container]);
}

function status() {
  if (!exists('pod', pod)) {
    console.log(`[db] Pod ${pod} does not exist.`);
    return;
  }

  run(['pod', 'ps']);
  run(['ps', '--filter', `name=${container}`]);
}

const command = process.argv[2] ?? 'status';

if (command === 'up') {
  up();
} else if (command === 'down') {
  down();
} else if (command === 'reset') {
  reset();
} else if (command === 'logs') {
  logs();
} else if (command === 'status') {
  status();
} else {
  console.error(`Unknown command: ${command}`);
  console.error(
    'Usage: node tools/podman-db.mjs <up|down|reset|logs|status>',
  );
  process.exit(1);
}