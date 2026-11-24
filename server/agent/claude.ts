import type { Message, RoomState } from '../../shared/types.ts';
import type { AgentAction } from './tools.ts';

// claude provider — mock 완성 이후 단계. 현재는 비활성.
export function claudeAvailable(): boolean {
  return false;
}

export async function claudeTurn(_state: RoomState, _msg: Message): Promise<AgentAction[]> {
  throw new Error('claude provider not enabled');
}
