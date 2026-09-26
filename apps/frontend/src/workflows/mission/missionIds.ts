import type { DroneId, MissionId } from '@drone-drive/contracts/mission';

export function missionId(value: string): MissionId {
  return value as MissionId;
}

export function droneId(value: string): DroneId {
  return value as DroneId;
}
