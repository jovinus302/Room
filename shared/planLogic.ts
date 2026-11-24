import type { Candidate, MemberId, Plan, RoomState } from './types.ts';

// 상태에서 파생되는 값들 — 서버(확정 계산)와 웹(카드 렌더)이 같은 규칙을 쓴다.

export function exclusionReasons(plan: Plan | null, candId: string): string[] {
  if (!plan) return [];
  const out: string[] = [];
  for (const c of plan.conditions) for (const x of c.excludes) if (x.candId === candId) out.push(x.reason);
  return out;
}

export function availableCandidates(state: RoomState): Candidate[] {
  return state.candidates.filter((c) => exclusionReasons(state.plan, c.id).length === 0);
}

export function effectivePlaceId(state: RoomState): string | null {
  const plan = state.plan;
  if (!plan) return null;
  if (plan.confirmed) return plan.confirmed.placeId;
  if (plan.selectedCandId && exclusionReasons(plan, plan.selectedCandId).length === 0) return plan.selectedCandId;
  return availableCandidates(state)[0]?.id ?? null;
}

export function suggestTime(plan: Plan): string {
  const rs = Object.values(plan.responses).filter((r) => r.value === 'prefer' || r.value === 'maybe');
  if (rs.some((r) => r.window === 'pm')) return '오후 1시 출발';
  if (rs.some((r) => r.window === 'am')) return '오전 10시 출발';
  return '오전 11시 출발';
}

export function attendees(plan: Plan): MemberId[] {
  return Object.entries(plan.responses)
    .filter(([, r]) => r.value === 'prefer' || r.value === 'maybe')
    .map(([id]) => id);
}

export function responseCounts(plan: Plan) {
  const rs = Object.values(plan.responses);
  return {
    prefer: rs.filter((r) => r.value === 'prefer').length,
    maybe: rs.filter((r) => r.value === 'maybe').length,
    no: rs.filter((r) => r.value === 'no').length,
    pending: rs.filter((r) => r.value === 'pending').length,
    agentEstimated: rs.filter((r) => r.by === 'agent').length,
  };
}

// "다음 토요일" → 다가오는 토요일 (3일 이내면 그다음 주 토요일)
export function nextSaturdayLabel(now = new Date()): string {
  const d = new Date(now);
  let add = (6 - d.getDay() + 7) % 7;
  if (add <= 3) add += 7;
  d.setDate(d.getDate() + add);
  return `다음 토요일 · ${d.getMonth() + 1}/${d.getDate()}(토)`;
}
