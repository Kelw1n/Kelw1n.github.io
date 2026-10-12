// Снимает сайт целиком (без фона, с прозрачностью) в светлой и тёмной теме
// для сцены «Этот сайт» в ролике. Запуск: node promo/capture-site.cjs (нужен локальный сервер на :8123)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = 'http://localhost:8123';
const W = 1520, H = 856;
const fontsCss = fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8')
  .replace(/url\(fonts\//g, `url(${ROOT}/promo/fonts/`);

const FORCE = `
  .loader,.cursor-ring,.toast,.nav,.mnav,.progress,.bg{display:none!important}
  html,body{background:transparent!important}
  .reveal,.fade-up{opacity:1!important;transform:none!important;transition:none!important}
  .hscroll{height:auto!important}
  .hsticky{position:relative!important;height:${H}px!important}
`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ru-RU', colorScheme: theme });
    const page = await ctx.newPage();
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: fontsCss, contentType: 'text/css' }));
    await page.route('https://cdn.jsdelivr.net/**', r => r.abort());
    await page.addInitScript(th => { try { localStorage.setItem('lang', 'ru'); localStorage.setItem('theme', th); } catch (e) {} }, theme);
    await page.goto(ROOT + '/index.html', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3200);
    // запускаем демо сканирования и ждём состояния «Добавлено в завтрак»
    await page.evaluate(() => document.getElementById('scan').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(5200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addStyleTag({ content: FORCE });
    await page.evaluate(() => {
      const track = document.getElementById('htrack');
      track.style.transform = 'translate3d(-420px,0,0)';
      document.getElementById('hbar').style.transform = 'scaleX(.22)';
      const cx = innerWidth / 2;
      [...track.querySelectorAll('.slide')].forEach(s => {
        const b = s.getBoundingClientRect();
        const d = (b.left + b.width / 2 - cx) / innerWidth, a = Math.min(Math.abs(d), 1);
        s.querySelector('.phone').style.transform = `perspective(1200px) rotateY(${d * -30}deg) scale(${1 - a * .14})`;
        s.style.opacity = 1 - Math.min(a * .9, .65);
      });
      document.getElementById('pline').style.transform = 'scaleX(1)';
    });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const top = id => Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY);
      return { height: document.documentElement.scrollHeight, strain: top('strain'), butterfly: top('butterfly'), skills: top('skills'), work: top('work'), contact: top('contact') };
    });
    await page.screenshot({ path: path.join(__dirname, 'shots', `site-${theme}.png`), fullPage: true, omitBackground: true });
    fs.writeFileSync(path.join(__dirname, 'shots', 'site.json'), JSON.stringify(info, null, 2));
    console.log(theme, info);
    await ctx.close();
  }
  await browser.close();
})();
