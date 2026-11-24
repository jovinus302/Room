// VIDEO=1 npm run e2e 가 남긴 두 탭 녹화(webm)와 타임라인으로 자막 달린 폴백 mp4를 만든다.
// 사용: npm run video   (ffmpeg 필요, 자막 폰트: 맑은 고딕)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = process.env.VIDEO_DIR ?? 'screenshots-tmp/video';
const OUT = process.env.VIDEO_OUT ?? 'docs/demo-fallback.mp4';
// ffmpeg 필터 문법에서 드라이브 콜론 이스케이프를 피하려고 폰트를 작업 폴더로 복사해 상대경로로 쓴다
const FONT = `${DIR}/caption-font.ttf`;
copyFileSync(process.env.CAPTION_FONT ?? 'C:/Windows/Fonts/malgunbd.ttf', FONT);
const segs = JSON.parse(readFileSync(`${DIR}/timeline.json`, 'utf8'));

const parts = [];
segs.forEach((s, i) => {
  const cap = `${DIR}/cap_${i}.txt`;
  writeFileSync(cap, s.caption, 'utf8');
  const part = `${DIR}/part_${i}.mp4`;
  const vf = [
    'fps=30',
    // 하단 입력창(타이핑 장면)을 가리지 않도록 상단 바 위에 자막
    'drawbox=x=0:y=0:w=iw:h=64:color=0x14182a@0.88:t=fill',
    `drawtext=fontfile=${FONT}:textfile=${cap}:fontcolor=white:fontsize=30:x=(w-tw)/2:y=17`,
  ].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', s.start.toFixed(2), '-to', s.end.toFixed(2), '-i', s.src, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', part]);
  parts.push(part);
  console.log(`  장면 ${i + 1}: ${(s.end - s.start).toFixed(1)}초 — ${s.caption}`);
});
const list = `${DIR}/concat.txt`;
writeFileSync(list, parts.map((p) => `file '${p.split('/').pop()}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT]);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim();
console.log(`🎬 ${OUT} (${Number(dur).toFixed(1)}초)`);
if (!existsSync(OUT)) process.exit(1);
