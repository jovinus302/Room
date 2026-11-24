import type { Member, MemberId, Message, ResponseValue, RoomState, TimeWindow } from '../../shared/types.ts';
import { eunneun, memberName } from '../../shared/seed.ts';
import { nextSaturdayLabel, suggestTime } from '../../shared/planLogic.ts';
import type { AgentAction } from './tools.ts';

// 키워드 기반 결정적 에이전트 — 같은 입력이면 언제나 같은 도구 호출을 낸다.

export function parseResponse(text: string): { value: ResponseValue; window: TimeWindow } | null {
  const t = text.replace(/\s+/g, ' ');
  if (/아직 몰라|모르겠|글쎄|봐야|미정/.test(t)) return { value: 'maybe', window: null };
  if (/못 가|못가|안 돼|안돼|불참|어려울 것 같/.test(t)) return { value: 'no', window: null };
  const ok = /돼|되요|돼요|가능|괜찮|갈 수|갈게|좋아|좋지|콜|오케이|ㅇㅋ/.test(t);
  if (/오후/.test(t) && ok) return { value: 'prefer', window: 'pm' };
  if (/오전/.test(t) && ok) return { value: 'prefer', window: 'am' };
  if (ok) return { value: 'prefer', window: 'all' };
  return null;
}

export function mockTurn(state: RoomState, msg: Message): AgentAction[] {
  if (msg.author.kind !== 'member') return [];
  const userId = msg.author.id;
  const who = memberName(state, userId);
  const text = msg.text;
  const plan = state.plan;

  // 1) 계획 생성
  if (!plan && /놀러|나들이|소풍|여행/.test(text)) {
    const dateLabel = /토요일/.test(text) ? nextSaturdayLabel() : '날짜 미정';
    return [
      { tool: 'create_plan', title: '가족 나들이', dateLabel, createdBy: userId },
      { tool: 'record_response', userId, value: 'prefer', window: 'all', note: '제안자', by: 'human' },
      {
        tool: 'say',
        text: `${who}의 제안으로 「가족 나들이」 계획 카드를 만들었어요. 날짜는 ${dateLabel.split(' · ')[1] ?? '미정'} 제안, 시간·장소는 아직 미정이에요. 편하게 가능한 시간을 말씀해 주세요.`,
      },
    ];
  }
  if (!plan) return [];

  // 2) 확정 이후 변경 → 영향 하이라이트 + 재확인
  if (plan.status === 'confirmed' && /일 생겼|일이 생겼|일정 생겼|약속 생겼|급한 일/.test(text)) {
    const am = /오전/.test(text);
    const time = plan.confirmed?.time ?? suggestTime(plan);
    const actions: AgentAction[] = [
      { tool: 'record_response', userId, value: am ? 'prefer' : 'maybe', window: am ? 'pm' : null, note: am ? '오전 일정 생김 · 오후 합류' : '일정 변동', by: 'human' },
      {
        tool: 'flag_change',
        text: `${who} ${am ? '오전에 일정이 생김' : '일정 변동'} — ${time}에 합류 가능한지 확인 필요`,
        triggeredBy: userId,
        affected: ['time', `member:${userId}`],
        proposalTime: am ? '오후 3시 출발' : undefined,
      },
      {
        tool: 'say',
        text: `${who}의 일정 변경을 반영했어요. 확정 계획의 출발 시간(${time})과 ${who} 참석이 영향을 받아요. ${am ? '오후 3시 출발로 미루는 안을 카드에 올려뒀어요 — ' : ''}카드에서 재확인해 주세요.`,
      },
    ];
    return actions;
  }

  // 3) 조건
  if (/차 없이|차없이|차가 없|차 못 써|대중교통/.test(text)) {
    return [
      { tool: 'add_condition', text: '차 없이 이동', tag: 'car_only', by: { kind: 'human', userId } },
      { tool: 'say', text: `「차 없이 이동」 조건을 추가했어요. 자가용이 필요한 후보는 제외하고, 지하철로 갈 수 있는 곳 위주로 남겨둘게요.` },
    ];
  }
  if (/오래 걷|많이 걷|걷기 힘/.test(text)) {
    return [{ tool: 'add_condition', text: '오래 걷는 동선 제외', tag: 'long_walk', by: { kind: 'human', userId } }];
  }

  // 4) 응답
  const r = parseResponse(text);
  if (r) return [{ tool: 'record_response', userId, value: r.value, window: r.window, note: text.slice(0, 40), by: 'human' }];
  return [];
}

// Personal Agent — 미접속 구성원의 응답을 그룹 기억으로 추정
export function personalEstimate(state: RoomState, m: Member): AgentAction[] {
  const mem = m.memory;
  const basis: string[] = [];
  let window: TimeWindow = 'all';
  const extra: AgentAction[] = [];

  const follows = mem.find((x) => /할머니와 함께/.test(x));
  if (follows) {
    const g = state.plan?.responses['grandma'];
    window = g && g.value !== 'pending' ? g.window : 'pm';
    basis.push(follows);
  }
  const pm = mem.find((x) => /오후/.test(x));
  if (pm) {
    window = 'pm';
    basis.push(pm);
  }
  const weekend = mem.find((x) => /주말엔 대체로/.test(x));
  if (weekend && !pm) basis.push(weekend);
  const walk = mem.find((x) => /오래 걷기/.test(x));
  if (walk) {
    basis.unshift(walk);
    extra.push({ tool: 'add_condition', text: `오래 걷는 동선 제외 (${m.name})`, tag: 'long_walk', by: { kind: 'agent', forUserId: m.id, basis: walk } });
  }
  if (basis.length === 0) return [];

  const label = window === 'pm' ? '오후 가능' : '참석 가능';
  return [
    { tool: 'record_response', userId: m.id, value: 'prefer', window, note: `추정: ${label}`, by: 'agent', basis },
    ...extra,
    {
      tool: 'personal_say',
      forUserId: m.id,
      text: `${eunneun(m.name)} 아직 접속 전이에요. 그룹 기억(${basis.map((b) => `‘${b}’`).join(', ')})을 근거로 「${label}」으로 추정해 두었어요.${walk ? ' 오래 걷는 후보는 빼 둘게요.' : ''} 본인 확인을 기다릴게요.`,
    },
  ];
}

export function absentPending(state: RoomState): Member[] {
  const plan = state.plan;
  if (!plan) return [];
  // 탭 로그인 가능한 구성원(본인이 곧 들어와 확인할 사람)을 마지막에
  return state.members
    .filter((m) => !state.presence[m.id] && plan.responses[m.id]?.value === 'pending' && m.memory.length > 0 && m.id !== plan.createdBy)
    .sort((a, b) => Number(a.loginable) - Number(b.loginable));
}

// mock 모드에서 시드 구성원(탭 없는 가족)이 대화에 참여하는 대본
export const SEED_SCRIPT: { userId: MemberId; text: string; delayMs: number }[] = [
  { userId: 'seoyeon', text: '저 토요일 오후에는 돼요!', delayMs: 1800 },
  { userId: 'minjun', text: '난 아직 몰라 ㅠ 학원 보강 잡힐 수도 있어', delayMs: 1800 },
  { userId: 'uncle', text: '토요일 좋지~ 하루 종일 괜찮아', delayMs: 1800 },
  { userId: 'aunt', text: '나도 오후면 갈 수 있어', delayMs: 1800 },
];
