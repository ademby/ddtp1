import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Mission, MissionState } from '@drone-drive/contracts/mission';
type DroneReportStatus = Extract<MissionState, 'RUNNING' | 'COMPLETED' | 'FAILED'>;

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';
const port = Number(process.env.PORT ?? 3001);
function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(value));
}
async function backendRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const result = await fetch(`${backend}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const value = await result.json();
  if (!result.ok) throw new Error((value as { error?: string }).error ?? `Backend returned ${result.status}`);
  return value;
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''; for await (const chunk of request) text += chunk;
  if (!text) return {};
  const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Body must be a JSON object.');
  return value as Record<string, unknown>;
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/health') { send(response, 200, { status: 'ok', backend }); return; }
    if (request.method === 'GET' && url.pathname === '/planned-missions') {
      send(response, 200, await backendRequest('/missions?state=PLANNED')); return;
    }
    const match = url.pathname.match(/^\/missions\/([^/]+)\/(claim|report)$/);
    if (request.method === 'POST' && match) {
      const id = decodeURIComponent(match[1]); const command = match[2]; const input = await readBody(request);
      const mission = await backendRequest(`/missions/${encodeURIComponent(id)}`) as Pick<Mission, 'id' | 'state' | 'droneId'>;
      const droneId = typeof input.droneId === 'string' && input.droneId ? input.droneId : mission.droneId;
      if (command === 'claim') {
        const dispatched = await backendRequest(`/missions/${encodeURIComponent(id)}/claim`, {
          method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ droneId }),
        });
        send(response, 200, dispatched); return;
      }
      const status = (typeof input.status === 'string' ? input.status : 'COMPLETED') as DroneReportStatus;
      const reported = await backendRequest(`/missions/${encodeURIComponent(id)}/status`, {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ droneId, status, failureReason: input.failureReason ?? undefined }),
      });
      send(response, 200, reported); return;
    }
    send(response, 404, { error: 'Not found.' });
  } catch (error) { send(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); }
});
server.listen(port, () => console.log(`Drone mock listening on http://localhost:${port}`));
export { server };
