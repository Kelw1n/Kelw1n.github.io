// Kelw1n — сценарий страницы: язык, плавная прокрутка, 3D-телефон по прокрутке,
// появление заголовков, бегущая строка, раскрытие проектов и демо Butterfly.
import { I18N } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desk = matchMedia('(min-width: 834px)');
const fine = matchMedia('(pointer: fine)').matches;
const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const hasGsap = !!(gsap && ScrollTrigger);
if (hasGsap) gsap.registerPlugin(ScrollTrigger, ...(SplitText ? [SplitText] : []));

const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);

/* =========================================================
   Язык
   ========================================================= */
let lang = store.get('lang') || ((navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en');
const t = k => (I18N[lang][k] ?? k);
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'ru' ? ' ' : ',');
function translate(scope = document){ $$('[data-i18n]', scope).forEach(el => { el.innerHTML = t(el.dataset.i18n); }); }
function applyLang(l, first = false){
  lang = l; store.set('lang', l);
  root.lang = l;
  revertSplits();
  translate();
  $$('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
  $$('[data-count]').forEach(el => { if (el.dataset.done) el.textContent = fmt(+el.dataset.count); });
  splitLit();
  setupSplits(first);
  if (window.__bfRender) window.__bfRender(false);
  if (!first && hasGsap) ScrollTrigger.refresh();
  computeAnchors();
}
$$('.lang button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));

/* =========================================================
   Плавная прокрутка
   ========================================================= */
let lenis = null;
if (Lenis && hasGsap && !reduce) {
  lenis = new Lenis({ duration: 1.15, easing: x => Math.min(1, 1.001 - Math.pow(2, -10 * x)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
function scrollToTarget(target){
  const y = target === 0 ? 0 : target.getBoundingClientRect().top + scrollY - 48;
  if (lenis) lenis.scrollTo(y, { duration: 1.6 });
  else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const el = id === '#top' ? 0 : document.querySelector(id);
  if (el === null) return;
  e.preventDefault();
  closeMenu();
  scrollToTarget(el);
});

/* =========================================================
   Навигация
   ========================================================= */
const body = document.body, burger = $('#burger');
function closeMenu(){ body.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); lenis && !pvOpen && lenis.start(); }
burger.addEventListener('click', () => {
  if (body.classList.contains('menu-open')) return closeMenu();
  body.classList.add('menu-open'); burger.setAttribute('aria-expanded', 'true'); lenis && lenis.stop();
});
const navLinks = $$('.gnav-links a');
['strain', 'butterfly', 'skills', 'work', 'contact'].forEach(id => {
  new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
  }), { rootMargin: '-45% 0px -50% 0px' }).observe(document.getElementById(id));
});

/* =========================================================
   Появление блоков
   ========================================================= */
const rio = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); }
}), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
$$('.rv').forEach(el => rio.observe(el));

// Заголовки выезжают из-под маски: белые — по строкам, градиентные — целиком.
let splits = [];
function setupSplits(){
  if (!hasGsap || reduce) return;
  $$('[data-split]').forEach(el => {
    if (el.dataset.revealed) return;
    const gradient = /grad-/.test(el.className);
    if (gradient || !SplitText) {
      gsap.set(el, { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 18 });
      const st = ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => {
        el.dataset.revealed = 1;
        gsap.to(el, { clipPath: 'inset(0% 0% -10% 0%)', yPercent: 0, duration: 1.4, ease: 'expo.out', clearProps: 'clipPath,transform' });
      } });
      splits.push({ st, el });
      return;
    }
    const s = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    gsap.set(s.lines, { yPercent: 110 });
    const st = ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => {
      el.dataset.revealed = 1;
      gsap.to(s.lines, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: .1 });
    } });
    splits.push({ s, st, el });
  });
}
function revertSplits(){
  splits.forEach(({ s, st, el }) => {
    st && st.kill();
    if (s) s.revert();
    if (!el.dataset.revealed) gsap.set(el, { clearProps: 'clipPath,transform' });
  });
  splits = [];
}

/* =========================================================
   Слова, которые загораются по мере чтения
   ========================================================= */
const lit = $('#lit');
let litWords = [];
function splitLit(){
  const words = lit.textContent.trim().split(/\s+/);
  lit.innerHTML = words.map(w => `<span>${w}</span>`).join(' ');
  litWords = $$('span', lit); lit.dataset.n = -1;
}
function updateLit(){
  if (!litWords.length) return;
  const r = lit.getBoundingClientRect();
  const p = clamp((innerHeight * .78 - r.top) / (r.height + innerHeight * .2), 0, 1);
  const n = reduce ? litWords.length : Math.round(p * litWords.length);
  if (+lit.dataset.n === n) return;
  lit.dataset.n = n;
  litWords.forEach((w, i) => w.classList.toggle('on', i < n));
}

/* =========================================================
   3D-телефон и сценарий прокрутки
   ========================================================= */
const canvas = $('#gl');
let phone = null, anchors = [], phoneOp = 1;
const TAU = Math.PI * 2;
const S = {
  hero:  { x: 0,   y: -0.86, rx: 0.1,  ry: -0.32, rz: 0.05, s: 0.62, op: 1, screen: 0 },
  back:  { x: 0.5, y: 0.02, rx: 0.14, ry: Math.PI + 0.5, rz: -0.07, s: 0.64, op: 1, screen: 0 },
  front: { x: 0.5, y: 0,    rx: 0.04, ry: TAU - 0.34, rz: 0.03, s: 0.62, op: 1, screen: 0 },
  tour:  { x: 0.46, y: 0,   rx: 0,    ry: TAU - 0.14, rz: 0, s: 0.7, op: 1 },
  exit:  { x: 0.46, y: 1.7, rx: -0.3, ry: TAU + 0.9, rz: 0.25, s: 0.55, op: 0, screen: 4 },
  heroM: { x: 0, y: -0.68, rx: 0.1, ry: -0.3, rz: 0.05, s: 0.5, op: 1, screen: 0 },
  exitM: { x: 0, y: 0.95, rx: -0.25, ry: Math.PI * 0.85, rz: 0.2, s: 0.42, op: 0, screen: 0 }
};
function docY(el, elFrac, viewFrac){ const r = el.getBoundingClientRect(); return scrollY + r.top + r.height * elFrac - innerHeight * viewFrac; }
// Верх телефона в герое — сразу под кнопками, на любой высоте экрана.
function docTop(el){ let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }
function heroState(base){
  const ctas = $('#hero .ctas');
  const topPx = Math.min(docTop(ctas) + ctas.offsetHeight + (desk.matches ? 40 : 28), innerHeight * .8);
  return { ...base, y: 1 - 2 * topPx / innerHeight - base.s };
}
function computeAnchors(){
  if (!phone) return;
  if (desk.matches) {
    const steps = $$('#tourSteps .step');
    anchors = [
      { at: 0, s: heroState(S.hero) },
      { at: docY($('#strainIntro'), .5, .5), s: S.back },
      { at: docY(lit, .5, .5), s: S.front },
      ...steps.map((st, i) => ({ at: docY(st, .5, .5), s: { ...S.tour, ry: S.tour.ry + (i % 2 ? .12 : -.06), screen: i } })),
      { at: docY(steps[steps.length - 1], 1, .3), s: S.exit }
    ];
  } else {
    anchors = [{ at: 0, s: heroState(S.heroM) }, { at: docY($('#hero'), 1, .5), s: S.exitM }];
  }
}
function stateAt(y){
  if (!anchors.length) return null;
  if (y <= anchors[0].at) return anchors[0].s;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (y < b.at) {
      const k = smooth(clamp((y - a.at) / Math.max(1, b.at - a.at), 0, 1));
      const o = {};
      for (const key of ['x', 'y', 'rx', 'ry', 'rz', 's', 'op']) o[key] = a.s[key] + (b.s[key] - a.s[key]) * k;
      o.screen = k < .5 ? (a.s.screen ?? 0) : (b.s.screen ?? a.s.screen ?? 0);
      return o;
    }
  }
  return anchors[anchors.length - 1].s;
}
function updatePhone(){
  if (!phone) return;
  const st = stateAt(scrollY);
  if (!st) return;
  phone.setTarget(st);
  phone.setScreen(st.screen);
  phone.setParallax(clamp(1 - scrollY / (innerHeight * .6), 0, 1));
  const op = clamp(st.op, 0, 1);
  if (Math.abs(op - phoneOp) > .005) { phoneOp = op; canvas.style.opacity = op.toFixed(3); }
  phone.setVisible(op > .01 && !pvOpen);
}
async function init3D(){
  if (root.classList.contains('no3d')) return;
  const fail = () => { root.classList.remove('js3d-pending', 'has3d'); root.classList.add('no3d'); if (phone) phone.pause(true); };
  const timer = setTimeout(fail, 8000);
  try {
    const mod = await import('./phone3d.js');
    phone = mod.createPhone3D(canvas, { screens: [1, 2, 3, 4, 5].map(i => `assets/strain/${i}.jpg`), mobile: !desk.matches });
    phone.setFloat(reduce ? 0 : 1);
    await phone.ready;
    clearTimeout(timer);
    if (root.classList.contains('no3d')) { phone.pause(true); return; }
    computeAnchors();
    root.classList.remove('js3d-pending');
    root.classList.add('has3d');
    if (reduce) phone.jump(stateAt(scrollY));
  } catch (e) {
    clearTimeout(timer);
    console.warn('3D отключено:', e);
    fail();
  }
}
addEventListener('pointermove', e => {
  if (!phone || e.pointerType !== 'mouse') return;
  phone.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
}, { passive: true });

/* =========================================================
   Экраны STRAIN — шаги
   ========================================================= */
const steps = $$('#tourSteps .step'), pinShots = $$('#tourPin .screen img');
const stepIO = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting || !desk.matches) return;
  const i = +en.target.dataset.i;
  steps.forEach((s, k) => s.classList.toggle('on', k === i));
  pinShots.forEach((s, k) => s.classList.toggle('on', k === i));
}), { rootMargin: '-48% 0px -48% 0px' });
steps.forEach(s => stepIO.observe(s));

/* =========================================================
   Счётчики, линия процесса
   ========================================================= */
const cio = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting) return;
  const el = en.target, to = +el.dataset.count; cio.unobserve(el);
  if (reduce || !hasGsap) { el.textContent = fmt(to); el.dataset.done = 1; return; }
  const o = { v: 0 };
  gsap.to(o, { v: to, duration: 2, ease: 'expo.out', onUpdate: () => { el.textContent = fmt(o.v); }, onComplete: () => { el.dataset.done = 1; } });
}), { threshold: .6 });
$$('[data-count]').forEach(el => cio.observe(el));
const pline = $('#pline'), procEl = $('#processEl');
function updateProcess(){
  const r = procEl.getBoundingClientRect();
  if (r.top > innerHeight || r.bottom < 0) return;
  pline.style.transform = `scaleX(${clamp((innerHeight * .85 - r.top) / (innerHeight * .5), 0, 1)})`;
}

/* =========================================================
   Бегущая строка: скорость и наклон — от прокрутки
   ========================================================= */
const mq = $('#mq');
mq.innerHTML += mq.innerHTML;
let mqX = 0, mqSkew = 0, mqOn = false;
new IntersectionObserver(es => { mqOn = es[0].isIntersecting; }).observe(mq.parentElement);
function updateMarquee(){
  if (!mqOn) return;
  const v = lenis ? lenis.velocity : 0;
  mqX -= (reduce ? 0 : 1.2) + Math.abs(v) * .4;
  const half = mq.scrollWidth / 2;
  if (-mqX >= half) mqX += half;
  mqSkew += (clamp(v * .3, -16, 16) - mqSkew) * .12;
  mq.style.transform = `translate3d(${mqX.toFixed(1)}px,0,0) skewX(${(-mqSkew).toFixed(2)}deg)`;
}

/* =========================================================
   Кадр
   ========================================================= */
function tick(){ updatePhone(); updateLit(); updateProcess(); updateMarquee(); }
if (hasGsap) gsap.ticker.add(tick);
else { const loop = () => { tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
let rz = 0;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { phone && phone.resize(); computeAnchors(); updateGallery(); }, 120);
});
if (hasGsap) ScrollTrigger.addEventListener('refresh', computeAnchors);

/* =========================================================
   Подсветка карточек за курсором и магнитные кнопки
   ========================================================= */
if (fine) {
  $$('[data-glow]').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));
  if (hasGsap && !reduce) $$('[data-magnetic]').forEach(el => {
    const qx = gsap.quickTo(el, 'x', { duration: .6, ease: 'elastic.out(1,.4)' });
    const qy = gsap.quickTo(el, 'y', { duration: .6, ease: 'elastic.out(1,.4)' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      qx((e.clientX - r.left - r.width / 2) * .3); qy((e.clientY - r.top - r.height / 2) * .4);
    });
    el.addEventListener('pointerleave', () => { qx(0); qy(0); });
  });
}

/* =========================================================
   Проекты: карточка раскрывается в полноэкранную страницу
   ========================================================= */
const gt = $('#gtrack'), gPrev = $('#gPrev'), gNext = $('#gNext');
const gstep = () => $('.gcard', gt).offsetWidth + 20;
function updateGallery(){
  const max = gt.scrollWidth - gt.clientWidth - 2;
  gPrev.disabled = gt.scrollLeft <= 2;
  gNext.disabled = gt.scrollLeft >= max;
}
gPrev.addEventListener('click', () => gt.scrollBy({ left: -gstep(), behavior: 'smooth' }));
gNext.addEventListener('click', () => gt.scrollBy({ left: gstep(), behavior: 'smooth' }));
gt.addEventListener('scroll', updateGallery, { passive: true });

const pview = $('#pview'), pvIn = $('#pvIn'), pvClose = $('#pvClose');
let pvOpen = false, pvCard = null, pvPushed = false;
const insetOf = r => `inset(${r.top.toFixed(1)}px ${(innerWidth - r.right).toFixed(1)}px ${(innerHeight - r.bottom).toFixed(1)}px ${r.left.toFixed(1)}px round 30px)`;
function openProject(card, { push = true, animate = true } = {}){
  const id = card.dataset.project, tpl = $('#tpl-' + id);
  if (!tpl || pvOpen) return;
  pvOpen = true; pvCard = card;
  pvIn.innerHTML = ''; pvIn.append(tpl.content.cloneNode(true)); translate(pvIn);
  pview.className = 'pview open p-' + id; pview.scrollTop = 0;
  lenis && lenis.stop(); body.style.overflow = 'hidden';
  if (push) { history.pushState({ project: id }, '', '#p-' + id); pvPushed = true; }
  const anims = $$('.pv-anim', pvIn);
  if (!hasGsap || reduce || !animate) {
    anims.forEach(a => { a.style.opacity = 1; });
    pvClose.focus({ preventScroll: true });
    return;
  }
  gsap.fromTo(pview, { clipPath: insetOf(card.getBoundingClientRect()) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: 1, ease: 'expo.inOut', clearProps: 'clipPath' });
  gsap.fromTo(anims, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: .055, delay: .5 });
  gsap.fromTo(pvClose, { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: .9, ease: 'back.out(2)', delay: .65 });
  setTimeout(() => pvClose.focus({ preventScroll: true }), 700);
}
function finishClose(){
  pvOpen = false;
  pview.className = 'pview'; pview.style.clipPath = ''; pvIn.innerHTML = '';
  body.style.overflow = ''; lenis && lenis.start();
  pvCard && pvCard.focus({ preventScroll: true });
}
function closeProject(){
  if (!pvOpen) return;
  if (!hasGsap || reduce || !pvCard) return finishClose();
  gsap.to($$('.pv-anim', pvIn), { opacity: 0, y: 20, duration: .3, ease: 'power2.in' });
  gsap.to(pvClose, { scale: 0, duration: .3, ease: 'power2.in' });
  gsap.fromTo(pview, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetOf(pvCard.getBoundingClientRect()), duration: .9, delay: .15, ease: 'expo.inOut', onComplete: () => { gsap.set(pvClose, { clearProps: 'all' }); finishClose(); } });
}
function requestClose(){ if (pvPushed && history.state && history.state.project) history.back(); else closeProject(); }
$$('.gcard', gt).forEach(c => c.addEventListener('click', () => openProject(c)));
pvClose.addEventListener('click', requestClose);
addEventListener('keydown', e => { if (e.key === 'Escape') { if (pvOpen) requestClose(); else closeMenu(); } });
addEventListener('popstate', () => {
  if (pvOpen && !(history.state && history.state.project)) { pvPushed = false; closeProject(); }
  else if (!pvOpen && history.state && history.state.project) {
    const c = $(`.gcard[data-project="${history.state.project}"]`); if (c) openProject(c, { push: false });
  }
});

/* =========================================================
   Скопировать почту
   ========================================================= */
const toast = $('#toast');
$('#copyMail').addEventListener('click', () => {
  const show = () => { toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); };
  if (navigator.clipboard) navigator.clipboard.writeText('Kelw1nnnx1@gmail.com').then(show, () => location.href = 'mailto:Kelw1nnnx1@gmail.com');
  else location.href = 'mailto:Kelw1nnnx1@gmail.com';
});

/* =========================================================
   Демо Butterfly
   ========================================================= */
const GOALS = {
  bulk: { kcal: 2800, p: 165, f: 85, c: 360, end: 78, d: 'M0,98 C70,96 120,80 180,62 S260,34 300,24' },
  keep: { kcal: 2400, p: 150, f: 75, c: 290, end: 75, d: 'M0,60 C60,65 110,55 160,60 S250,64 300,59' },
  cut:  { kcal: 1950, p: 160, f: 60, c: 200, end: 71, d: 'M0,22 C60,28 120,52 180,70 S260,94 300,100' }
};
const BASE = { kcal: 850, p: 52, f: 30, c: 95 }, BRK = { kcal: 397, p: 22, f: 26, c: 20 };
let goal = 'keep', added = false;
const C = 289.03;
function animNum(el, to, dur = 900){
  if (!el) return;
  const from = parseFloat(el.dataset.v || 0);
  el.dataset.v = to;
  if (dur === 0 || reduce) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderPhone(anim){
  const g = GOALS[goal];
  const c = added ? { kcal: BASE.kcal + BRK.kcal, p: BASE.p + BRK.p, f: BASE.f + BRK.f, c: BASE.c + BRK.c } : BASE;
  const d = anim ? 900 : 0;
  $('#ringVal').style.strokeDashoffset = (C * (1 - Math.min(c.kcal / g.kcal, 1))).toFixed(2);
  animNum($('#eaten'), c.kcal, d); animNum($('#tgt'), g.kcal, d); animNum($('#left'), Math.max(g.kcal - c.kcal, 0), d);
  $('#mp').style.width = Math.min(100, c.p / g.p * 100) + '%';
  $('#mf').style.width = Math.min(100, c.f / g.f * 100) + '%';
  $('#mc').style.width = Math.min(100, c.c / g.c * 100) + '%';
  $('#mpv').textContent = `${c.p}/${g.p} ${t('bf.g')}`;
  $('#mfv').textContent = `${c.f}/${g.f} ${t('bf.g')}`;
  $('#mcv').textContent = `${c.c}/${g.c} ${t('bf.g')}`;
  $('#bVal').textContent = added ? fmt(BRK.kcal) : '—';
}
const line = $('#chartLine'), area = $('#chartArea');
function renderPlan(anim){
  const g = GOALS[goal];
  animNum($('#planKcal'), g.kcal, anim ? 800 : 0);
  $('#pP').textContent = `${t('bf.p')} ${g.p} ${t('bf.g')}`;
  $('#pF').textContent = `${t('bf.f')} ${g.f} ${t('bf.g')}`;
  $('#pC').textContent = `${t('bf.c')} ${g.c} ${t('bf.g')}`;
  $('#endW').textContent = g.end;
  line.setAttribute('d', g.d);
  area.setAttribute('d', g.d + ' L300,120 L0,120 Z');
  if (anim && !reduce) {
    const len = line.getTotalLength();
    line.style.transition = 'none';
    line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
    area.style.opacity = 0;
    void line.getBoundingClientRect();
    line.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)';
    line.style.strokeDashoffset = 0;
    area.style.opacity = 1;
  }
}
window.__bfRender = anim => { renderPhone(anim); renderPlan(anim); };
const goalSeg = $('#goalSeg');
function setGoal(gk, anim){
  goal = gk;
  $$('button', goalSeg).forEach((b, i) => { b.classList.toggle('on', b.dataset.goal === gk); if (b.dataset.goal === gk) goalSeg.style.setProperty('--i', i); });
  renderPlan(anim); renderPhone(anim);
}
$$('button', goalSeg).forEach(b => b.addEventListener('click', () => setGoal(b.dataset.goal, true)));
const scan = $('#scan'), boxes = $$('.box', scan), items = $$('.it', scan), stat = $('#scanStatus'), stot = $('#scanTotal'), mealB = $('#mealB');
let timers = [], running = false;
const T = (ms, fn) => timers.push(setTimeout(fn, ms));
const setStat = k => { stat.dataset.i18n = k; stat.innerHTML = t(k); };
function cycle(){
  timers.forEach(clearTimeout); timers = [];
  scan.classList.remove('found', 'done'); scan.classList.add('scanning');
  boxes.forEach(b => b.classList.remove('show')); items.forEach(i => i.classList.remove('show'));
  setStat('bf.scanning'); animNum(stot, 0, 300);
  added = false; renderPhone(true);
  T(2000, () => { scan.classList.remove('scanning'); scan.classList.add('found'); setStat('bf.found'); boxes.forEach((b, i) => T(i * 180, () => b.classList.add('show'))); });
  T(3000, () => { items.forEach((it, i) => T(i * 170, () => it.classList.add('show'))); animNum(stot, 397, 1000); });
  T(4600, () => { scan.classList.add('done'); setStat('bf.added'); added = true; renderPhone(true); mealB.classList.remove('flash'); void mealB.offsetWidth; mealB.classList.add('flash'); });
  T(9500, cycle);
}
new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting && !running) { running = true; cycle(); }
  else if (!en.isIntersecting && running) { running = false; timers.forEach(clearTimeout); timers = []; }
}), { threshold: .3 }).observe(scan);

/* =========================================================
   Старт: появление героя
   ========================================================= */
function intro(){
  root.classList.add('ready');
  root.classList.remove('intro');
  if (!hasGsap || reduce) return;
  gsap.timeline({ delay: .1 })
    .fromTo('#heroTitle', { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 24, filter: 'blur(14px)' },
      { clipPath: 'inset(0% 0% -10% 0%)', yPercent: 0, filter: 'blur(0px)', duration: 1.6, ease: 'expo.out', clearProps: 'clipPath,filter' })
    .fromTo('.intro-fade', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: .09 }, '-=1.25');
}

applyLang(lang, true);
setGoal('keep', false);
updateGallery();
intro();
init3D();
addEventListener('load', () => { hasGsap && ScrollTrigger.refresh(); computeAnchors(); });
if (/^#p-/.test(location.hash)) {
  const c = $(`.gcard[data-project="${location.hash.slice(3)}"]`);
  if (c) { history.replaceState({ project: c.dataset.project }, '', location.hash); pvPushed = true; openProject(c, { push: false, animate: false }); }
}
