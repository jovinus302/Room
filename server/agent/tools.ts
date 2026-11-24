import type { CandidateTag, MemberId, ResponseValue, RoomState, TimeWindow } from '../../shared/types.ts';
import { store } from '../store.ts';
import { memberName } from '../../shared/seed.ts';

// 에이전트(mock / claude 공통)가 호출하는 도구. 모든 쓰기는 store.dispatch 한 곳으로 모인다.

export type AgentAction =
  | { tool: 'create_plan'; title: string; dateLabel: string; createdBy: MemberId }
  | { tool: 'record_response'; userId: MemberId; value: ResponseValue; window: TimeWindow; note?: string; by: 'human' | 'agent'; basis?: string[] }
  | { tool: 'add_condition'; text: string; tag: CandidateTag; by: { kind: 'human'; userId: MemberId } | { kind: 'agent'; forUserId: MemberId; basis: string } }
  | { tool: 'flag_change'; text: string; triggeredBy: MemberId; affected: string[]; proposalTime?: string }
  | { tool: 'say'; text: string }
  | { tool: 'personal_say'; forUserId: MemberId; text: string };

const TAG_REASON: Record<CandidateTag, string> = {
  car_only: '자가용 없이는 이동이 어려움',
  long_walk: '오래 걸어야 하는 동선',
  indoor: '',
  subway: '',
  flat: '',
};

let idc = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}_${(idc++).toString(36)}`;

export function executeAction(a: AgentAction): void {
  const s: RoomState = store.get();
  switch (a.tool) {
    case 'create_plan':
      if (s.plan) return; // 방당 진행 중인 계획 하나
      store.dispatch({ type: 'plan_created', planId: newId('plan'), title: a.title, dateLabel: a.dateLabel, createdBy: a.createdBy });
      return;

    case 'record_response':
      if (!s.plan || !s.members.some((m) => m.id === a.userId)) return;
      store.dispatch({
        type: 'response_recorded',
        userId: a.userId,
        actor: a.by === 'agent' ? `${memberName(s, a.userId)}의 Personal Agent` : 'Room Agent',
        response: { value: a.value, window: a.window, by: a.by, note: a.note, basis: a.basis, at: Date.now() },
      });
      return;

    case 'add_condition': {
      if (!s.plan) return;
      if (s.plan.conditions.some((c) => c.text === a.text)) return; // 중복 방지
      const excludes = s.candidates
        .filter((c) => c.tags.includes(a.tag))
        .map((c) => ({ candId: c.id, reason: `${TAG_REASON[a.tag]} (${a.text})` }));
      store.dispatch({
        type: 'condition_added',
        actor: a.by.kind === 'agent' ? `${memberName(s, a.by.forUserId)}의 Personal Agent` : 'Room Agent',
        condition: { id: newId('cond'), text: a.text, by: a.by, excludes, at: Date.now() },
      });
      return;
    }

    case 'flag_change':
      if (!s.plan?.confirmed) return;
      store.dispatch({
        type: 'change_detected',
        review: {
          id: newId('rev'),
          text: a.text,
          triggeredBy: a.triggeredBy,
          affected: a.affected,
          proposal: a.proposalTime ? { time: a.proposalTime } : undefined,
          at: Date.now(),
        },
      });
      return;

    case 'say':
      store.dispatch({ type: 'message_posted', message: { id: newId('msg'), author: { kind: 'room-agent' }, text: a.text, at: Date.now() } });
      return;

    case 'personal_say':
      store.dispatch({
        type: 'message_posted',
        message: { id: newId('msg'), author: { kind: 'personal-agent', forUserId: a.forUserId }, text: a.text, at: Date.now() },
      });
      return;
  }
}
