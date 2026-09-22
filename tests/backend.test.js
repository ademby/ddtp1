import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('backend serves health, validates missions, and honors idempotency', {
  skip: process.env.DATABASE_URL ? false : 'DATABASE_URL is required for the PostgreSQL integration test',
}, async () => {
  const port = 3217;
  const serverPath = fileURLToPath(new URL('../apps/backend/dist/server.js', import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const base = `http://localhost:${port}`;
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); }
    }
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
    const command = { name: 'smoke', droneId: 'drone-a', earliestStart: '2026-01-01T00:00:00Z', dispatchDeadline: null, geometry: { type: 'LineString', coordinates: [[1, 2], [2, 3]] } };
    const created = await (await fetch(`${base}/missions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) })).json();
    const headers = { 'Idempotency-Key': 'smoke-plan' };
    const first = await (await fetch(`${base}/missions/${created.id}/plan`, { method: 'POST', headers })).json();
    const second = await (await fetch(`${base}/missions/${created.id}/plan`, { method: 'POST', headers })).json();
    assert.equal(first.state, 'PLANNED');
    assert.deepEqual(second, first);

    const wrongDroneClaim = await fetch(`${base}/missions/${created.id}/claim`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-claim-wrong' },
      body: JSON.stringify({ droneId: 'someone-else' }),
    });
    assert.equal(wrongDroneClaim.status, 403);

    const dispatched = await (await fetch(`${base}/missions/${created.id}/claim`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-claim' },
      body: JSON.stringify({ droneId: 'drone-a' }),
    })).json();
    assert.equal(dispatched.state, 'DISPATCHED');

    const running = await (await fetch(`${base}/missions/${created.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-running' },
      body: JSON.stringify({ droneId: 'drone-a', status: 'RUNNING' }),
    })).json();
    assert.equal(running.state, 'RUNNING');

    const completed = await (await fetch(`${base}/missions/${created.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-completed' },
      body: JSON.stringify({ droneId: 'drone-a', status: 'COMPLETED' }),
    })).json();
    assert.equal(completed.state, 'COMPLETED');

    const uploaded = await (await fetch(`${base}/missions/${created.id}/result`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-upload' },
      body: JSON.stringify({
        deviceId: 'sensor-1',
        measurements: [
          { capturedAt: '2026-01-01T00:00:01Z', longitude: 1, latitude: 2, source: 'sensor-1', kpis: { signalQuality: -80 } },
          { capturedAt: '2026-01-01T00:00:02Z', longitude: 1.1, latitude: 2.1, source: 'sensor-1', kpis: { signalQuality: -60 } },
        ],
      }),
    })).json();
    assert.equal(uploaded.measurements.length, 2);
    assert.equal(uploaded.activeRevision, null);

    const [rejectedMeasurement] = uploaded.measurements;
    const reviewed = await (await fetch(`${base}/missions/${created.id}/result/revisions`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-review' },
      body: JSON.stringify({ rejectedMeasurementIds: [rejectedMeasurement.id], finalize: true }),
    })).json();
    assert.equal(reviewed.activeRevision.finalizedAt !== null, true);

    const approved = await (await fetch(`${base}/missions/${created.id}/result/approved-measurements`)).json();
    assert.equal(approved.length, 1);
    assert.notEqual(approved[0].id, rejectedMeasurement.id);

    const range = await (await fetch(`${base}/signal-quality/range`)).json();
    assert.equal(range.min, range.max); // exactly one approved measurement in this run
    assert.equal(typeof range.version, 'string');

    const tileResponse = await fetch(`${base}/signal-quality/tiles/12/0/0?v=${range.version}`);
    assert.equal(tileResponse.status, 200);
    assert.equal(tileResponse.headers.get('content-type'), 'application/octet-stream');
    const grid = new Float32Array(await tileResponse.arrayBuffer());
    assert.equal(grid.length, 64 * 64);
  } finally { child.kill(); }
});
