import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { store } from './store.ts';
import { AGENT_MODE, agentSay, onMemberMessage, resetAgent } from './agent/index.ts';
import { newId } from './agent/tools.ts';
import { attendees, effectivePlaceId, exclusionReasons, suggestTime } from '../shared/planLogic.ts';
import { describeResponse } from '../shared/reducer.ts';
import { iga, memberName } from '../shared/seed.ts';
import type { ResponseValue, ServerPush, TimeWindow } from '../shared/types.ts';

const PORT = Number(process.env.API_PORT ?? 8787);

// ---- presence (탭별 SSE 연결 수) ----
const conns = new Map<string, number>();
const offlineTimers = new Map<string, NodeJS.Timeout>();

function setOnline(userId: string) {
  clearTimeout(offlineTimers.get(userId));
  conns.set(userId, (conns.get(userId) ?? 0) + 1);
  if (!store.get().presence[userId]) store.dispatch({ type: 'presence_changed', userId, online: true });
}
function setOfflineSoon(userId: string) {
  const n = (conns.get(userId) ?? 1) - 1;
  conns.set(userId, n);
  if (n > 0) return;
  offlineTimers.set(
    userId,
    setTimeout(() => {
      if ((conns.get(userId) ?? 0) === 0 && store.get().presence[userId]) {
        store.dispatch({ type: 'presence_changed', userId, online: false });
      }
    }, 2000),
  );
}

// ---- helpers ----
function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const isMember = (id: unknown): id is string => typeof id === 'string' && store.get().members.some((m) => m.id === id);
const VALUES: ResponseValue[] = ['prefer', 'maybe', 'no'];
const WINDOWS: TimeWindow[] = ['am', 'pm', 'all', null];

// ---- routes ----
async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, mode: AGENT_MODE, seq: store.get().seq });
  if (req.method === 'GET' && path === '/api/state') return json(res, 200, store.get());

  if (req.method === 'GET' && path === '/api/stream') {
    const userId = url.searchParams.get('userId');
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const send = (p: ServerPush) => res.write(`data: ${JSON.stringify(p)}\n\n`);
    send({ kind: 'snapshot', state: store.get() });
    const unsub = store.subscribe(send);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    if (isMember(userId)) setOnline(userId);
    req.on('close', () => {
      unsub();
      clearInterval(ping);
      if (isMember(userId)) setOfflineSoon(userId);
    });
    return;
  }

  if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
  const body = await readBody(req);
  const userId = body.userId;

  if (path === '/api/reset') {
    resetAgent();
    store.reset();
    return json(res, 200, { ok: true });
  }

  if (!isMember(userId)) return json(res, 400, { error: 'unknown userId' });
  const s = store.get();
  const who = memberName(s, userId);

  switch (path) {
    case '/api/message': {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
      if (!text) return json(res, 400, { error: 'empty' });
      const message = { id: newId('msg'), author: { kind: 'member' as const, id: userId }, text, at: Date.now() };
      store.dispatch({ type: 'message_posted', message });
      onMemberMessage(message);
      return json(res, 200, { ok: true });
    }

    case '/api/respond': {
      if (!s.plan) return json(res, 409, { error: 'no plan' });
      const value = body.value as ResponseValue;
      const window = (body.window ?? null) as TimeWindow;
      if (!VALUES.includes(value) || !WINDOWS.includes(window)) return json(res, 400, { error: 'bad response' });
      const prev = s.plan.responses[userId];
      store.dispatch({
        type: 'response_recorded',
        userId,
        actor: who,
        response: { value, window, by: 'human', note: prev?.by === 'agent' ? '본인 확인' : '카드에서 직접 응답', at: Date.now() },
      });
      if (prev?.by === 'agent') {
        const same = prev.value === value && prev.window === window;
        agentSay(
          same
            ? `${iga(who)} Personal Agent의 추정(${describeResponse(value, window)})을 직접 확인했어요.`
            : `${iga(who)} 추정 응답을 「${describeResponse(value, window)}」으로 직접 수정했어요.`,
        );
      }
      return json(res, 200, { ok: true });
    }

    case '/api/select': {
      const candId = body.candId;
      if (!s.plan || s.plan.status !== 'draft') return json(res, 409, { error: 'not draft' });
      if (typeof candId !== 'string' || !s.candidates.some((c) => c.id === candId)) return json(res, 400, { error: 'bad cand' });
      if (exclusionReasons(s.plan, candId).length) return json(res, 409, { error: 'excluded' });
      store.dispatch({ type: 'candidate_selected', candId, by: userId });
      return json(res, 200, { ok: true });
    }

    case '/api/confirm': {
      if (!s.plan || s.plan.status !== 'draft') return json(res, 409, { error: 'not draft' });
      const placeId = effectivePlaceId(s);
      if (!placeId) return json(res, 409, { error: 'no available place' });
      const time = suggestTime(s.plan);
      const att = attendees(s.plan);
      store.dispatch({ type: 'plan_confirmed', time, placeId, attendees: att, by: userId });
      const place = s.candidates.find((c) => c.id === placeId)!;
      agentSay(
        `✅ ${iga(who)} 계획을 확정했어요 — ${s.plan.dateLabel.split(' · ')[1] ?? s.plan.dateLabel} ${time}, ${place.name}, ${att.length}명 참석. 이제 이 카드가 우리 가족의 최신 계획이에요.`,
      );
      return json(res, 200, { ok: true });
    }

    case '/api/resolve': {
      const resolution = body.resolution;
      if (!s.plan?.review) return json(res, 409, { error: 'no review' });
      if (resolution !== 'accept' && resolution !== 'keep') return json(res, 400, { error: 'bad resolution' });
      const proposal = s.plan.review.proposal;
      store.dispatch({ type: 'review_resolved', resolution, by: userId });
      agentSay(
        resolution === 'accept' && proposal
          ? `출발 시간을 ${proposal.time}로 바꿨어요. 최신 계획 v${s.plan.version + 1}로 모두에게 반영됐어요.`
          : `기존 계획(${s.plan.confirmed?.time})을 그대로 유지하기로 했어요. 최신 계획 v${s.plan.version + 1}.`,
      );
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not found' });
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: String(err) });
  });
}).listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  AGENT_MODE=${AGENT_MODE}  events=${store.get().seq}`);
});
