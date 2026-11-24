import type { DomainEvent, LogEntry, Plan, RoomState, StoredEvent } from './types.ts';
import { initialState, memberName } from './seed.ts';

// 순수 reducer — 이벤트 로그를 처음부터 재생하면 언제나 같은 상태가 나온다.
export function apply(state: RoomState, stored: StoredEvent): RoomState {
  const next = reduce(state, stored.event, stored.at);
  return { ...next, seq: stored.seq };
}

export function replay(events: StoredEvent[]): RoomState {
  return events.reduce(apply, initialState());
}

function withLog(plan: Plan, entry: LogEntry): Plan {
  return { ...plan, log: [...plan.log, entry] };
}

function reduce(s: RoomState, e: DomainEvent, at: number): RoomState {
  switch (e.type) {
    case 'message_posted':
      return { ...s, messages: [...s.messages, e.message] };

    case 'presence_changed':
      return { ...s, presence: { ...s.presence, [e.userId]: e.online } };

    case 'plan_created': {
      const responses: Plan['responses'] = {};
      for (const m of s.members) responses[m.id] = { value: 'pending', window: null, by: 'human', at };
      const plan: Plan = {
        id: e.planId,
        title: e.title,
        dateLabel: e.dateLabel,
        createdBy: e.createdBy,
        status: 'draft',
        version: 0,
        responses,
        conditions: [],
        selectedCandId: null,
        confirmed: null,
        review: null,
        log: [{ at, actor: 'Room Agent', text: `${memberName(s, e.createdBy)}의 제안으로 계획 카드 생성` }],
      };
      return { ...s, plan };
    }

    case 'response_recorded': {
      if (!s.plan) return s;
      const label = describeResponse(e.response.value, e.response.window);
      const who = memberName(s, e.userId);
      const wasAwaiting = s.plan.status === 'confirmed' && s.plan.responses[e.userId]?.by === 'agent' && e.response.by === 'human';
      const text =
        e.response.by === 'agent'
          ? `${who} 응답 추정: ${label} (확인 대기)`
          : wasAwaiting
            ? `${who} 본인 확인: ${label} — 확인 대기 해소`
            : `${who} 응답: ${label}`;
      const plan = withLog(
        { ...s.plan, responses: { ...s.plan.responses, [e.userId]: e.response } },
        { at, actor: e.actor, text },
      );
      return { ...s, plan };
    }

    case 'condition_added': {
      if (!s.plan) return s;
      const plan = withLog(
        { ...s.plan, conditions: [...s.plan.conditions, e.condition] },
        { at, actor: e.actor, text: `조건 추가: ${e.condition.text} → 후보 ${e.condition.excludes.length}곳 제외` },
      );
      // 선택된 후보가 제외되면 선택 해제
      if (plan.selectedCandId && e.condition.excludes.some((x) => x.candId === plan.selectedCandId)) {
        plan.selectedCandId = null;
      }
      return { ...s, plan };
    }

    case 'candidate_selected': {
      if (!s.plan) return s;
      const cand = s.candidates.find((c) => c.id === e.candId);
      const plan = withLog(
        { ...s.plan, selectedCandId: e.candId },
        { at, actor: memberName(s, e.by), text: `장소 후보 선택: ${cand?.name ?? e.candId}` },
      );
      return { ...s, plan };
    }

    case 'plan_confirmed': {
      if (!s.plan) return s;
      const cand = s.candidates.find((c) => c.id === e.placeId);
      const plan = withLog(
        {
          ...s.plan,
          status: 'confirmed',
          version: 1,
          selectedCandId: e.placeId,
          confirmed: { time: e.time, placeId: e.placeId, attendees: e.attendees, awaitingAtConfirm: e.awaitingAtConfirm ?? [], by: e.by, at },
          review: null,
        },
        { at, actor: memberName(s, e.by), text: `계획 확정 v1: ${e.time} · ${cand?.name ?? e.placeId} · ${e.attendees.length}명${e.awaitingAtConfirm?.length ? ` (확인 대기 ${e.awaitingAtConfirm.length}명 유지)` : ''}` },
      );
      return { ...s, plan };
    }

    case 'change_detected': {
      if (!s.plan) return s;
      const plan = withLog({ ...s.plan, review: e.review }, { at, actor: 'Room Agent', text: `변경 감지: ${e.review.text}` });
      return { ...s, plan };
    }

    case 'review_resolved': {
      if (!s.plan || !s.plan.review || !s.plan.confirmed) return s;
      const review = s.plan.review;
      const confirmed =
        e.resolution === 'accept' && review.proposal
          ? { ...s.plan.confirmed, time: review.proposal.time }
          : s.plan.confirmed;
      const version = s.plan.version + 1;
      const text =
        e.resolution === 'accept' && review.proposal
          ? `조정 반영 v${version}: 출발 ${s.plan.confirmed.time} → ${review.proposal.time}`
          : `재확인 완료 v${version}: 기존 계획 유지`;
      const plan = withLog({ ...s.plan, confirmed, version, review: null }, { at, actor: memberName(s, e.by), text });
      return { ...s, plan };
    }
  }
}

export function describeResponse(value: string, window: string | null): string {
  const w = window === 'am' ? '오전' : window === 'pm' ? '오후' : window === 'all' ? '종일' : '';
  switch (value) {
    case 'prefer':
      return w ? `${w} 가능` : '가능';
    case 'maybe':
      return '미정';
    case 'no':
      return '불참';
    default:
      return '응답 대기';
  }
}
