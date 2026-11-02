// 3D-iPhone, собранный из кода: титановая рамка, стекло, экран со скриншотами,
// блок камер и кнопки. Готовых моделей нет — только геометрия Three.js.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

// Размеры как у 6,3-дюймового iPhone, в условных единицах (высота ≈ 1,5).
const W = 0.715, H = 1.496, D = 0.0825, R = 0.112, B = 0.012;
const SW = 0.661, SH = 1.437, SR = 0.084;
const FOV = 28, CAM_Z = 6;

function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Плоскость по форме с UV на весь прямоугольник — чтобы скриншот лёг ровно.
function shapePlane(w, h, r, segs = 28) {
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), segs);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}

export function createPhone3D(canvas, { screens = [], mobile = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAM_Z);

  // Свет: белый ключевой и цветные контровые — оранжевый STRAIN и фиолетовый.
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2.5, 3.5, 5); scene.add(key);
  const rimA = new THREE.DirectionalLight(0xff6a2b, 3.2); rimA.position.set(-4, 1.5, -2.5); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x8e7dff, 2.6); rimB.position.set(4, -1.5, -2.5); scene.add(rimB);

  // ---------- Материалы ----------
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xa9a49c, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const titaniumDark = new THREE.MeshPhysicalMaterial({ color: 0x5c5955, metalness: 1, roughness: 0.25 });
  const frontGlass = new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
  const backGlass = new THREE.MeshPhysicalMaterial({ color: 0x55524d, roughness: 0.5, metalness: 0.15, clearcoat: 0.45, clearcoatRoughness: 0.45 });
  const bumpGlass = new THREE.MeshPhysicalMaterial({ color: 0x4b4944, roughness: 0.14, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const lensGlass = new THREE.MeshPhysicalMaterial({ color: 0x07080c, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
  const lensInner = new THREE.MeshPhysicalMaterial({ color: 0x1d2a52, roughness: 0.15, metalness: 0.9, clearcoat: 1 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const phone = new THREE.Group();
  scene.add(phone);

  // Корпус: скруглённый прямоугольник с фаской по кромке.
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(W - 2 * B, H - 2 * B, R - B), {
    depth: D - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 6, curveSegments: 32
  });
  bodyGeo.translate(0, 0, -(D - 2 * B) / 2);
  phone.add(new THREE.Mesh(bodyGeo, titanium));

  // Лицевое стекло и экран.
  const glassGeo = shapePlane(W - 0.012, H - 0.012, R - 0.006);
  const front = new THREE.Mesh(glassGeo, frontGlass);
  front.position.z = D / 2 + 0.0006;
  phone.add(front);

  const screenGeo = shapePlane(SW, SH, SR);
  const screenA = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ color: 0x050505, toneMapped: false }));
  screenA.position.z = D / 2 + 0.0012;
  const screenB = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  screenB.position.z = D / 2 + 0.0017;
  phone.add(screenA, screenB);

  const island = new THREE.Mesh(shapePlane(0.19, 0.056, 0.028, 16), black);
  island.position.set(0, SH / 2 - 0.05, D / 2 + 0.0022);
  phone.add(island);

  // Блик стекла: чёрный материал, сложение — видно только отражение.
  const sheen = new THREE.Mesh(screenGeo, new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sheen.position.z = D / 2 + 0.0026;
  phone.add(sheen);

  // Задняя крышка.
  const back = new THREE.Mesh(glassGeo, backGlass);
  back.rotation.y = Math.PI;
  back.position.z = -D / 2 - 0.0006;
  phone.add(back);

  // Блок камер: если смотреть на спину — слева вверху.
  const bs = 0.34, cx = W / 2 - 0.04 - bs / 2, cy = H / 2 - 0.04 - bs / 2;
  const bumpGeo = new THREE.ExtrudeGeometry(rrShape(bs - 0.016, bs - 0.016, 0.078), {
    depth: 0.006, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 5, curveSegments: 24
  });
  const bump = new THREE.Mesh(bumpGeo, bumpGlass);
  bump.rotation.y = Math.PI;
  bump.position.set(cx, cy, -D / 2 + 0.002);
  phone.add(bump);
  const bumpFace = -D / 2 + 0.002 - 0.006 - 0.008;

  const ringGeo = new THREE.CylinderGeometry(0.066, 0.068, 0.02, 48); ringGeo.rotateX(Math.PI / 2);
  const lensGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.022, 48); lensGeo.rotateX(Math.PI / 2);
  const innerGeo = new THREE.CircleGeometry(0.026, 32);
  // Координаты со стороны спины: x' = cx - x.
  [[-0.074, 0.074], [-0.074, -0.074], [0.08, 0]].forEach(([lx, ly]) => {
    const x = cx - lx, y = cy + ly;
    const ring = new THREE.Mesh(ringGeo, titaniumDark); ring.position.set(x, y, bumpFace - 0.008); phone.add(ring);
    const lens = new THREE.Mesh(lensGeo, lensGlass); lens.position.set(x, y, bumpFace - 0.01); phone.add(lens);
    const inner = new THREE.Mesh(innerGeo, lensInner); inner.rotation.y = Math.PI; inner.position.set(x, y, bumpFace - 0.0215); phone.add(inner);
  });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.021, 24), new THREE.MeshStandardMaterial({ color: 0xf2ecdc, emissive: 0x3a3426, roughness: 0.4 }));
  flash.rotation.y = Math.PI; flash.position.set(cx - 0.08, cy + 0.1, bumpFace - 0.0005); phone.add(flash);
  const lidar = new THREE.Mesh(new THREE.CircleGeometry(0.019, 24), lensGlass);
  lidar.rotation.y = Math.PI; lidar.position.set(cx - 0.08, cy - 0.1, bumpFace - 0.0005); phone.add(lidar);

  // Кнопки по бокам.
  const btnGeo = new THREE.BoxGeometry(0.012, 1, 0.026);
  [[-1, 0.43, 0.055], [-1, 0.31, 0.1], [-1, 0.18, 0.1], [1, 0.3, 0.16], [1, -0.12, 0.1]].forEach(([side, y, len]) => {
    const b = new THREE.Mesh(btnGeo, titanium);
    b.scale.y = len;
    b.position.set(side * (W / 2 + 0.003), y, 0);
    phone.add(b);
  });

  // ---------- Экраны ----------
  const loader = new THREE.TextureLoader();
  const textures = [];
  let shown = -1, wanted = 0, fade = 1, ready = false;
  const loads = screens.map((src, i) => new Promise(res => {
    loader.load(src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures[i] = tex; res(tex);
    }, undefined, () => res(null));
  }));
  const firstReady = loads[0] ? loads[0].then(() => { ready = true; }) : Promise.resolve();

  function applyScreen(i) {
    const tex = textures[i];
    if (!tex) return false;
    if (shown === -1) {
      screenA.material.map = tex; screenA.material.color.set(0xffffff); screenA.material.needsUpdate = true;
      shown = i; return true;
    }
    screenB.material.map = tex; screenB.material.needsUpdate = true;
    fade = 0; shown = i;
    return true;
  }

  // ---------- Состояние и кадр ----------
  const cur = { x: 0, y: -2.2, rx: 0.4, ry: -1, rz: 0, s: 0.6 };
  const tgt = { ...cur };
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let parallax = 0, float = 1, visible = true, w = 1, h = 1, last = performance.now(), rafId = 0, running = true;

  function resize() {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!running) return;
    if (wanted !== shown) applyScreen(wanted);
    const k = 1 - Math.pow(1 - 0.085, dt * 60);
    for (const key in cur) cur[key] += (tgt[key] - cur[key]) * k;
    ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
    if (fade < 1) {
      fade = Math.min(1, fade + dt / 0.45);
      screenB.material.opacity = fade;
      if (fade >= 1) { screenA.material.map = screenB.material.map; screenA.material.needsUpdate = true; screenB.material.opacity = 0; }
    }
    if (!visible) return;
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z, vw = vh * camera.aspect;
    const t = now / 1000;
    phone.position.set(cur.x * vw / 2, cur.y * vh / 2 + Math.sin(t * 0.9) * 0.018 * float, 0);
    phone.scale.setScalar(cur.s * vh / H);
    phone.rotation.set(cur.rx + ptr.y * 0.16 * parallax, cur.ry + ptr.x * 0.28 * parallax + Math.sin(t * 0.6) * 0.03 * float, cur.rz);
    renderer.render(scene, camera);
  }
  rafId = requestAnimationFrame(frame);

  return {
    ready: firstReady,
    setTarget(s) { for (const k in s) if (k in tgt) tgt[k] = s[k]; },
    jump(s) { for (const k in s) if (k in cur) { cur[k] = s[k]; tgt[k] = s[k]; } },
    setScreen(i) { wanted = Math.max(0, Math.min(screens.length - 1, i)); },
    setPointer(x, y) { ptr.tx = x; ptr.ty = y; },
    setParallax(v) { parallax = v; },
    setFloat(v) { float = v; },
    setVisible(v) { visible = v; },
    pause(p) { running = !p; },
    resize
  };
}
