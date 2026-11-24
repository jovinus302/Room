import type { Message } from '../../shared/types.ts';
import { store } from '../store.ts';
import { executeAction, newId, type AgentAction } from './tools.ts';
import { absentPending, mockTurn, personalEstimate, SEED_SCRIPT } from './mock.ts';
import { claudeTurn, claudeAvailable } from './claude.ts';

// 에이전트 파이프라인: 메시지 → (mock | claude) → 도구 호출 → dispatch.
// 모든 작업은 하나의 직렬 큐를 거치므로 순서가 결정적이다.

export const AGENT_MODE: 'mock' | 'claude' =
  process.env.AGENT_MODE === 'claude' && claudeAvailable() ? 'claude' : 'mock';

const AGENT_THINK_MS = Number(process.env.AGENT_THINK_MS ?? 700);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let queue: Promise<void> = Promise.resolve();
let epoch = 0; // reset 시 대기 중 작업 무효화

function enqueue(job: () => Promise<void>) {
  const my = epoch;
  queue = queue
    .then(async () => {
      if (my !== epoch) return;
      await job();
    })
    .catch((err) => console.error('[agent] job failed', err));
}

async function runActions(actions: AgentAction[], my: number) {
  if (actions.length === 0) return;
  store.broadcast({ kind: 'typing', who: 'Room Agent' });
  await sleep(AGENT_THINK_MS);
  if (my !== epoch) return;
  store.broadcast({ kind: 'typing', who: null });
  for (const a of actions) {
    executeAction(a);
    if (a.tool === 'say' || a.tool === 'personal_say') await sleep(150);
  }
}

export function onMemberMessage(msg: Message) {
  enqueue(async () => {
    const my = epoch;
    const hadPlan = !!store.get().plan;
    let actions: AgentAction[];
    if (AGENT_MODE === 'claude') {
      try {
        actions = await claudeTurn(store.get(), msg);
      } catch (err) {
        console.error('[agent] claude 실패 → mock으로 대체', err);
        actions = mockTurn(store.get(), msg);
      }
    } else {
      actions = mockTurn(store.get(), msg);
    }
    await runActions(actions, my);
    if (!hadPlan && store.get().plan) schedulePlanFollowups();
  });
}

// 계획이 생기면: 시드 구성원 대화(대본) → 미접속 구성원 Personal Agent 추정
function schedulePlanFollowups() {
  const my = epoch;
  if (process.env.SEED_SCRIPT !== 'off') {
    for (const line of SEED_SCRIPT) {
      enqueue(async () => {
        await sleep(line.delayMs);
        if (my !== epoch) return;
        const msg: Message = { id: newId('msg'), author: { kind: 'member', id: line.userId }, text: line.text, at: Date.now() };
        store.dispatch({ type: 'message_posted', message: msg });
        // 시드 구성원 발화도 같은 에이전트 경로로 해석 — 단, 큐 안이므로 직접 실행
        await runActions(AGENT_MODE === 'claude' ? await safeClaude(msg) : mockTurn(store.get(), msg), my);
      });
    }
  }
  enqueue(async () => {
    await sleep(1500);
    if (my !== epoch) return;
    for (const m of absentPending(store.get())) {
      store.broadcast({ kind: 'typing', who: `${m.name}의 Personal Agent` });
      await sleep(AGENT_THINK_MS);
      if (my !== epoch) return;
      store.broadcast({ kind: 'typing', who: null });
      for (const a of personalEstimate(store.get(), m)) executeAction(a);
      await sleep(400);
    }
  });
}

async function safeClaude(msg: Message): Promise<AgentAction[]> {
  try {
    return await claudeTurn(store.get(), msg);
  } catch (err) {
    console.error('[agent] claude 실패 → mock으로 대체', err);
    return mockTurn(store.get(), msg);
  }
}

export function agentSay(text: string) {
  enqueue(async () => executeAction({ tool: 'say', text }));
}

export function resetAgent() {
  epoch++;
  store.broadcast({ kind: 'typing', who: null });
}
