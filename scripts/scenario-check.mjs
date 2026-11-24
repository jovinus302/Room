// 리허설 점검: 서버 API만으로 시나리오 1~6을 끝까지 돌리고 상태를 검증한다.
// 사용: (npm run dev 실행 중) npm run check
const BASE = process.env.BASE ?? 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => {
  const r = await fetch(`${BASE}/api/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`);
};
const state = async () => (await fetch(`${BASE}/api/state`)).json();
async function waitFor(desc, pred, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state();
    if (pred(s)) return s;
    await sleep(250);
  }
  throw new Error(`timeout: ${desc}`);
}
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

// 엄마 탭만 접속한 상태를 흉내 (SSE 연결 유지)
const ctrl = new AbortController();
await post('reset', {});
fetch(`${BASE}/api/stream?userId=mom`, { signal: ctrl.signal }).catch(() => {});
await sleep(300);

console.log('1) 엄마 제안 → plan 카드 생성');
await post('message', { userId: 'mom', text: '다음 토요일에 가까운 데 놀러 갈까?' });
let s = await waitFor('plan', (s) => s.plan);
ok(s.plan.status === 'draft', 'draft 상태');
ok(Object.values(s.plan.responses).filter((r) => r.value === 'pending').length === 7, '엄마 외 7명 응답 대기');

console.log('2) 시드 구성원 응답');
s = await waitFor('seed replies', (s) => s.plan.responses.aunt.value !== 'pending');
ok(s.plan.responses.seoyeon.value === 'prefer' && s.plan.responses.seoyeon.window === 'pm', '서연 오후 가능');
ok(s.plan.responses.minjun.value === 'maybe', '민준 미정');

console.log('3) Personal Agent 추정');
s = await waitFor('estimates', (s) => s.plan.responses.dad.by === 'agent');
ok(s.plan.responses.grandma.by === 'agent' && s.plan.responses.grandpa.by === 'agent', '할머니·할아버지 추정 배지');
ok(s.plan.conditions.some((c) => c.by.kind === 'agent'), '할머니 그룹 기억 → 오래 걷기 조건');
fetch(`${BASE}/api/stream?userId=dad`, { signal: ctrl.signal }).catch(() => {});
await sleep(300);
await post('respond', { userId: 'dad', value: 'prefer', window: 'all' });
s = await waitFor('dad confirm', (s) => s.plan.responses.dad.by === 'human');
ok(true, '아빠 한 번에 확인');

console.log('4) 차 없이');
await post('message', { userId: 'dad', text: '그날 차 정비 맡겨서 차 없이 가야 해' });
s = await waitFor('cond', (s) => s.plan.conditions.some((c) => c.text === '차 없이 이동'));
const out = s.candidates.filter((c) => s.plan.conditions.some((k) => k.excludes.some((x) => x.candId === c.id)));
ok(out.length === 3, `후보 3곳 제외 (${out.map((c) => c.name).join(', ')})`);

console.log('5) 확정');
await sleep(1200);
await post('confirm', { userId: 'mom' });
s = await waitFor('confirmed', (s) => s.plan.status === 'confirmed');
ok(s.plan.confirmed.placeId === 'museum' && s.plan.confirmed.time === '오후 1시 출발', `확정: ${s.plan.confirmed.time} · ${s.plan.confirmed.placeId} · ${s.plan.confirmed.attendees.length}명`);

console.log('6) 변경 전파');
await post('message', { userId: 'dad', text: '나 그날 오전에 일 생겼어' });
s = await waitFor('review', (s) => s.plan.review);
ok(s.plan.review.affected.includes('time') && s.plan.review.affected.includes('member:dad'), '시간·아빠 하이라이트');
await post('resolve', { userId: 'mom', resolution: 'accept' });
s = await waitFor('resolved', (s) => !s.plan.review);
ok(s.plan.confirmed.time === '오후 3시 출발' && s.plan.version === 2, '오후 3시 출발 · v2');

ctrl.abort();
console.log('\n시나리오 1~6 통과 ✅');
process.exit(0);
