// Покадровый рендер promo.html → MP4 (без звука).
//   node render.cjs preview 2.5,8,12.4      — PNG-кадры для проверки в out/preview
//   node render.cjs full [workers]           — весь ролик: out/video.mp4
// Нужен локальный сервер: python3 -m http.server 8123 (из корня репозитория)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const URL = 'http://localhost:8123/promo/promo.html';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });

async function openPage(browser){
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => window.promoReady);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

async function shot(cdp, format = 'png'){
  const r = await cdp.send('Page.captureScreenshot', format === 'png'
    ? { format: 'png', optimizeForSpeed: true }
    : { format: 'jpeg', quality: 96, optimizeForSpeed: true });
  return Buffer.from(r.data, 'base64');
}

async function renderFrame(page, t){
  await page.evaluate(t => window.renderAt(t), t);
}

async function preview(times){
  const browser = await chromium.launch();
  const { page, cdp } = await openPage(browser);
  for (const t of times) {
    const t0 = Date.now();
    await renderFrame(page, t);
    const buf = await shot(cdp);
    fs.writeFileSync(path.join(OUT, 'preview', `t${t.toFixed(2)}.png`), buf);
    console.log(`t=${t} ${Date.now() - t0}ms`);
  }
  await browser.close();
}

async function worker(id, from, to, fps){
  const browser = await chromium.launch();
  const { page, cdp } = await openPage(browser);
  const file = path.join(OUT, `seg${id}.mp4`);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-g', String(fps), '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = from; f < to; f++) {
    await renderFrame(page, f / fps);
    const buf = await shot(cdp);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - from) % 60 === 0) console.log(`[w${id}] frame ${f}/${to} ${((Date.now() - t0) / Math.max(1, f - from + 1)).toFixed(0)}ms/f`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  return file;
}

(async () => {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'preview') return preview(arg.split(',').map(Number));
  if (mode === 'full') {
    const W = parseInt(arg || '4', 10);
    const probe = await chromium.launch();
    const { page } = await openPage(probe);
    const { DUR, FPS } = await page.evaluate(() => window.PROMO);
    await probe.close();
    const N = Math.round(DUR * FPS);
    const per = Math.ceil(N / W);
    const t0 = Date.now();
    const files = await Promise.all([...Array(W)].map((_, i) => worker(i, i * per, Math.min(N, (i + 1) * per), FPS)));
    fs.writeFileSync(path.join(OUT, 'list.txt'), files.map(f => `file '${f}'`).join('\n'));
    await new Promise(r => spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', path.join(OUT, 'video.mp4')], { stdio: 'inherit' }).on('close', r));
    console.log(`done: ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s → out/video.mp4`);
  }
})();
