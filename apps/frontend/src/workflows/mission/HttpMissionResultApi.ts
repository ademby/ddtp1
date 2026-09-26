import type {
  Measurement, MissionResult, MissionResultApi, ReviewResultRevisionCommand, UploadMissionResultCommand,
} from '@drone-drive/contracts/mission-result';
import type { MissionId } from '@drone-drive/contracts/mission';

export class HttpMissionResultApi implements MissionResultApi {
  constructor(private readonly baseUrl: string) {}

  async get(missionId: MissionId): Promise<MissionResult> {
    return this.request('GET', `/missions/${encodeURIComponent(missionId)}/result`);
  }

  async upload(missionId: MissionId, command: UploadMissionResultCommand, key: string): Promise<MissionResult> {
    return this.request('POST', `/missions/${encodeURIComponent(missionId)}/result`, command, key);
  }

  async review(missionId: MissionId, command: ReviewResultRevisionCommand, key: string): Promise<MissionResult> {
    return this.request('POST', `/missions/${encodeURIComponent(missionId)}/result/revisions`, command, key);
  }

  async approvedMeasurements(missionId: MissionId): Promise<readonly Measurement[]> {
    return this.request('GET', `/missions/${encodeURIComponent(missionId)}/result/approved-measurements`);
  }

  private async request<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      cache: "no-store",
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? `Request failed: ${response.status}`);
    return payload as T;
  }
}

export default HttpMissionResultApi;
