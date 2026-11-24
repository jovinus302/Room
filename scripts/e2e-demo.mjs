// 브라우저 리허설: 두 탭(엄마 / 아빠)으로 시나리오 1~6을 UI로 끝까지 돌리고 장면별 스크린샷을 남긴다.
// 사용: (npm run dev 실행 중) npm run e2e   — 설치된 Edge(또는 Chrome)를 사용한다.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'docs/screenshots';
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: HEADLESS });
const viewport = { width: 1600, height: 960 };
const momCtx = await browser.newContext({ viewport, deviceScaleFactor: 1.5 });
const dadCtx = await browser.newContext({ viewport, deviceScaleFactor: 1.5 });

await fetch(`${WEB}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

const step = (s) => console.log(`\n▶ ${s}`);
const shot = async (page, name) => {
  await page.waitForTimeout(2700); // 하이라이트 애니메이션이 정점 지난 뒤가 아니라, 상태가 안정된 뒤 캡처
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${OUT}/${name}.png`);
};
const shotNow = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${OUT}/${name}.png`);
};
async function say(page, text) {
  await page.fill('.composer input', text);
  await page.click('.composer button');
}

// --- 탭 1: 엄마 로그인 ---
const mom = await momCtx.newPage();
await mom.goto(WEB);
await mom.click('.login-choice:has-text("엄마")');
await mom.waitForSelector('.composer');
await shotNow(mom, '00-empty');

step('1) 엄마: 다음 토요일에 가까운 데 놀러 갈까?');
await say(mom, '다음 토요일에 가까운 데 놀러 갈까?');
await mom.waitForSelector('.plan-card');
await mom.waitForSelector('.msg.agent');
await shot(mom, '01-plan-created');

step('2) 시드 구성원 응답 대기');
await mom.waitForSelector('.mchip.v-prefer:has-text("고모")', { timeout: 20000 });
console.log('  ✓ 서연·민준·삼촌·고모 응답 반영');

step('3) Personal Agent 추정 (할머니·할아버지·아빠)');
await mom.waitForSelector('.mchip.by-agent:has-text("아빠")', { timeout: 20000 });
await shot(mom, '03a-agent-estimates');

// --- 탭 2: 아빠 로그인 → 추정 응답 확인 ---
const dad = await dadCtx.newPage();
await dad.goto(WEB);
await dad.click('.login-choice:has-text("아빠")');
await dad.waitForSelector('.estimate-banner');
await shotNow(dad, '03b-dad-estimate-banner');
await dad.click('.estimate-banner button:has-text("맞아요")');
await dad.waitForSelector('.mchip:has-text("아빠") .badge-human');
console.log('  ✓ 아빠 한 번에 확인 → 본인 응답 배지');

step('4) 아빠: 그날 차 정비 맡겨서 차 없이 가야 해');
await say(dad, '그날 차 정비 맡겨서 차 없이 가야 해');
await mom.waitForSelector('.cond-chip:has-text("차 없이 이동")');
await shot(mom, '04-condition-filter');

step('5) 엄마: [확정]');
await mom.click('.confirm-bar button:has-text("확정")');
await mom.waitForSelector('.confirmed-banner');
await dad.waitForSelector('.confirmed-banner');
await shot(dad, '05-confirmed');

step('6) 아빠: 나 그날 오전에 일 생겼어');
await say(dad, '나 그날 오전에 일 생겼어');
await mom.waitForSelector('.review-banner');
await mom.waitForTimeout(1000);
await shotNow(mom, '06a-change-detected');
await mom.click('.review-banner button:has-text("조정")');
await dad.waitForSelector('.confirmed-banner:has-text("v2")');
await shot(dad, '06b-change-resolved');

const final = await (await fetch(`${WEB}/api/state`)).json();
console.log(`\n최종: ${final.plan.confirmed.time} · ${final.plan.confirmed.placeId} · v${final.plan.version} · 메시지 ${final.messages.length}건`);
await browser.close();
console.log('브라우저 시나리오 1~6 완료 ✅');
