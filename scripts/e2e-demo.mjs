// 브라우저 리허설: 두 탭(엄마 / 아빠)으로 시나리오 1~6을 UI로 끝까지 돌리고 장면별 스크린샷을 남긴다.
// 사용: (npm run dev 실행 중) npm run e2e        — 설치된 Edge(또는 BROWSER=chrome)를 사용
//       VIDEO=1 npm run e2e                     — 두 탭을 녹화하고 타임라인(json)을 남김 → npm run video 로 mp4 합성
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'docs/screenshots';
const VIDEO = !!process.env.VIDEO;
const VIDEO_DIR = process.env.VIDEO_DIR ?? 'screenshots-tmp/video';
const HEADLESS = !process.env.HEADED;
mkdirSync(OUT, { recursive: true });
if (VIDEO) mkdirSync(VIDEO_DIR, { recursive: true });

const viewport = { width: 1920, height: 1080 };
const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: HEADLESS });
const ctxOpts = VIDEO ? { viewport, recordVideo: { dir: VIDEO_DIR, size: viewport } } : { viewport, deviceScaleFactor: 1 };
const momCtx = await browser.newContext(ctxOpts);
const dadCtx = await browser.newContext(ctxOpts);

await fetch(`${WEB}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

// ---- 녹화용 타임라인: 어느 탭을 언제 보여줄지 + 자막 ----
const t0 = {};
const timeline = [];
let current = null;
function scene(page, caption) {
  const now = Date.now();
  if (current) current.to = now;
  current = { page, caption, from: now, to: null };
  timeline.push(current);
}
const hold = (page, ms) => page.waitForTimeout(VIDEO ? ms * 1.8 : Math.min(ms, 300));

const step = (s) => console.log(`\n▶ ${s}`);
const shot = async (page, name, settle = 2700) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${OUT}/${name}.png`);
};
async function say(page, text) {
  await page.click('.composer input');
  if (VIDEO) await page.type('.composer input', text, { delay: 110 });
  else await page.fill('.composer input', text);
  await hold(page, 400);
  await page.click('.composer button');
}

// --- 탭 1: 엄마 로그인 ---
const mom = await momCtx.newPage();
t0.mom = Date.now();
scene('mom', '가족 단톡방 — 평소처럼 대화하면, 에이전트가 오른쪽 공동 계획을 유지합니다');
await mom.goto(WEB);
await hold(mom, 1200);
await mom.click('.login-choice:has-text("엄마")');
await mom.waitForSelector('.composer');
await shot(mom, '00-empty', 500);

step('1) 엄마: 다음 토요일에 가까운 데 놀러 갈까?');
scene('mom', '① 엄마의 한마디 → Room Agent가 plan 카드 생성 (시간·장소 미정, 전원 응답 대기)');
await say(mom, '다음 토요일에 가까운 데 놀러 갈까?');
await mom.waitForSelector('.plan-card');
await mom.waitForSelector('.msg.agent');
await shot(mom, '01-plan-created');

step('2) 시드 구성원 응답 대기');
scene('mom', '② 가족들이 "오후에는 돼", "아직 몰라"로 답함 → 응답 칩이 실시간으로 바뀜');
await mom.waitForSelector('.mchip.v-prefer:has-text("고모")', { timeout: 20000 });
console.log('  ✓ 서연·민준·삼촌·고모 응답 반영');

step('3) Personal Agent 추정 (할머니·할아버지·아빠)');
scene('mom', '③ 미접속 가족은 Personal Agent가 그룹 기억으로 추정 — "Agent 추정·확인 대기" 배지');
await mom.waitForSelector('.mchip.by-agent:has-text("아빠")', { timeout: 20000 });
await shot(mom, '03a-agent-estimates');
await hold(mom, 2500);

// --- 탭 2: 아빠 로그인 → 추정 응답 확인 ---
const dad = await dadCtx.newPage();
t0.dad = Date.now();
await dad.goto(WEB);
scene('dad', '③ 아빠가 접속 → 자리 비운 사이 추정된 응답을 한 번에 확인');
await hold(dad, 800);
await dad.click('.login-choice:has-text("아빠")');
await dad.waitForSelector('.estimate-banner');
await shot(dad, '03b-dad-estimate-banner', 1500);
await hold(dad, 1500);
await dad.click('.estimate-banner button:has-text("맞아요")');
await dad.waitForSelector('.mchip:has-text("아빠") .badge-human');
await hold(dad, 2000);
console.log('  ✓ 아빠 한 번에 확인 → 본인 응답 배지');

step('4) 아빠: 그날 차 정비 맡겨서 차 없이 가야 해');
scene('dad', '④ "차 없이 가야 해" → 조건 칩 추가, 후보 장소 필터링 + 제외 사유');
await say(dad, '그날 차 정비 맡겨서 차 없이 가야 해');
await dad.waitForSelector('.cond-chip:has-text("차 없이 이동")');
await mom.waitForSelector('.cond-chip:has-text("차 없이 이동")');
await shot(mom, '04-condition-filter');
await hold(dad, 1500);

step('5) 엄마: [확정] — 추정 응답 경고 확인 후');
scene('mom', '⑤ 확정 — 추정 응답(할머니·할아버지)은 확정되지 않고 "확인 대기"로 남음');
await mom.waitForSelector('.confirm-warn');
await shot(mom, '05a-confirm-warning', 800);
await hold(mom, 3000);
await mom.click('.confirm-bar button:has-text("확정")');
await mom.waitForSelector('.confirmed-banner');
await dad.waitForSelector('.confirmed-banner');
await shot(mom, '05-confirmed');
await hold(mom, 3000);

step('6) 아빠: 나 그날 오전에 일 생겼어');
scene('dad', '⑥ 확정 후 변경 → 영향 받는 시간·참석자 하이라이트 + 재확인 안내');
await say(dad, '나 그날 오전에 일 생겼어');
await mom.waitForSelector('.review-banner');
await dad.waitForSelector('.review-banner');
await shot(dad, '06a-change-detected', 1200);
await hold(dad, 2500);
scene('mom', '⑥ 엄마가 조정안 수락 → 하나의 최신 계획 v2로 모두에게 반영');
await hold(mom, 1500);
await mom.click('.review-banner button:has-text("조정")');
await dad.waitForSelector('.confirmed-banner:has-text("v2")');
await shot(mom, '06b-change-resolved');
await hold(mom, 2500);
current.to = Date.now();

const final = await (await fetch(`${WEB}/api/state`)).json();
console.log(`\n최종: ${final.plan.confirmed.time} · ${final.plan.confirmed.placeId} · v${final.plan.version} · 메시지 ${final.messages.length}건`);

const momVideo = VIDEO ? mom.video() : null;
const dadVideo = VIDEO ? dad.video() : null;
await momCtx.close();
await dadCtx.close();
if (VIDEO) {
  const videos = { mom: await momVideo.path(), dad: await dadVideo.path() };
  const segs = timeline.map((s) => ({ src: videos[s.page], start: (s.from - t0[s.page]) / 1000, end: (s.to - t0[s.page]) / 1000, caption: s.caption }));
  writeFileSync(`${VIDEO_DIR}/timeline.json`, JSON.stringify(segs, null, 2));
  console.log(`🎞️  ${VIDEO_DIR}/timeline.json (${segs.length}개 장면, ${Math.round((current.to - t0.mom) / 1000)}초)`);
}
await browser.close();
console.log('브라우저 시나리오 1~6 완료 ✅');
