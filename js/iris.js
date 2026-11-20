/* Portada: iris de polígonos en el panel rojo, con chispas blancas que corren
 * por sus líneas.
 *
 * El iris se arma una sola vez al abrir la página, siempre igual (azar con
 * semilla fija): una cuadrícula dentro de un anillo y trazos que salen de la
 * pupila hacia afuera con tramos rectos y vueltas de 45° o 90°, como pistas,
 * sin encimarse (cada punto de la cuadrícula es de un solo trazo y dos
 * diagonales no se cruzan); los huecos se llenan con trazos cortos y marcos
 * pequeños. Cada trazo se ve como un polígono hueco: una línea blanca gruesa y,
 * encima, una del color del fondo más delgada.
 *
 * El centro del iris va en el borde izquierdo del rojo (donde empieza), a media
 * altura, y su radio es más o menos el 60 % de la altura del panel; en celular
 * igual, para que el aro se vea debajo de los botones.
 *
 * Para que cualquier equipo lo mueva sin esfuerzo, el dibujo (un SVG) no se
 * vuelve a pintar: las chispas son puntos aparte que solo cambian transform y
 * opacity (los mueve la tarjeta de video). Se detienen cuando la portada no se
 * ve y no aparecen si el equipo pide reducir el movimiento. */
(function () {
  'use strict';

  const panel = document.querySelector('.inicio-rojo');
  if (!panel || !document.createElementNS) return;

  const NS = 'http://www.w3.org/2000/svg';
  const SEMILLA = 20261119;
  const PUPILA = 0.32;          // radio de la pupila / radio del iris
  const PX_CELDA = 10;          // tamaño aproximado de una celda en pantalla
  const VELOCIDAD = 7;          // celdas por segundo de las chispas
  const movil = () => window.matchMedia('(max-width: 820px)').matches;

  // Azar con semilla (mulberry32): el iris sale igual en cada visita
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Radio del iris en pantalla (sin pasarse mucho del ancho del panel)
  function radioPantalla(ancho, alto) {
    return Math.max(180, Math.min(0.6 * alto, 0.95 * ancho));
  }

  // ── Dibujo ──────────────────────────────────────────────────────────
  // Devuelve [{puntos: [[x, y]], cerrado, sale}] en celdas, con centro en (0, 0);
  // sale = el trazo va de la pupila hacia afuera (por ahí corren las chispas)
  function generar(N) {
    const rnd = azar(SEMILLA + N), RIN = N * PUPILA, T = 2 * N + 1;
    const id = (x, y) => (y + N) * T + (x + N);
    const ocupado = new Uint8Array(T * T), diagonal = new Uint8Array(T * T);
    const DIR = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const enAnillo = (x, y, rmax) => { const r = Math.hypot(x, y); return r >= RIN && r <= rmax; };
    const libre = (x, y) => Math.abs(x) <= N && Math.abs(y) <= N && !ocupado[id(x, y)];
    // ¿Se puede ir de (x, y) en la dirección d sin tocar otro trazo ni cruzar una diagonal?
    function puede(x, y, d, rmax) {
      const nx = x + DIR[d][0], ny = y + DIR[d][1];
      if (!enAnillo(nx, ny, rmax) || !libre(nx, ny)) return false;
      return !(d % 2) || !diagonal[id(Math.min(x, nx), Math.min(y, ny))];
    }
    function mover(x, y, d) {
      const nx = x + DIR[d][0], ny = y + DIR[d][1];
      if (d % 2) diagonal[id(Math.min(x, nx), Math.min(y, ny))] = 1;
      ocupado[id(nx, ny)] = 1;
      return [nx, ny];
    }
    const angulo = d => Math.atan2(DIR[d][1], DIR[d][0]);
    const diferencia = (a, b) => { let v = a - b; while (v > Math.PI) v -= 2 * Math.PI; while (v < -Math.PI) v += 2 * Math.PI; return v; };
    // Dirección (de las 8) más cercana a un ángulo
    const cercana = a => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    // Un trazo que sale hacia afuera siguiendo su radio (más un giro propio, como las
    // fibras del iris): va derecho mientras no se desvíe más de `umbral` y entonces
    // dobla 45° hacia su radio; a veces se va de lado 1 a 3 celdas (vuelta de 90°) y
    // regresa, como las pistas. Nunca vuelve hacia la pupila.
    function crecer(x, y, largo, rmax, giro, umbral, lado = 0.1) {
      const puntos = [[x, y]];
      ocupado[id(x, y)] = 1;
      let d = cercana(Math.atan2(y, x) + giro), deLado = 0, dLado = 0;
      for (let paso = 0; paso < largo; paso++) {
        const meta = Math.atan2(y, x) + giro, desvio = diferencia(angulo(d), meta), hacia = desvio > 0 ? -1 : 1;
        if (!deLado && paso > 1 && rnd() < lado) { deLado = 1 + Math.floor(rnd() * 3); dLado = (d + (rnd() < 0.5 ? 2 : 6)) % 8; }
        const orden = deLado ? [dLado - d, 0] : Math.abs(desvio) > umbral ? [hacia, 0, -hacia] : rnd() < 0.06 ? [-hacia, 0, hacia] : [0, hacia, -hacia];
        let siguiente = -1;
        for (const g of orden) {
          const nd = (d + g + 8) % 8;
          if (Math.cos(diferencia(angulo(nd), Math.atan2(y, x))) < (deLado ? -0.15 : 0.25) || !puede(x, y, nd, rmax)) continue;
          siguiente = nd;
          break;
        }
        if (deLado) deLado = siguiente === dLado ? deLado - 1 : 0;
        if (siguiente < 0) break;
        [x, y] = mover(x, y, siguiente);
        d = siguiente;
        puntos.push([x, y]);
      }
      return puntos;
    }
    const celdas = [];
    for (let y = -N; y <= N; y++) for (let x = -N; x <= N; x++) if (enAnillo(x, y, N)) celdas.push([x, y]);
    const barajar = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const vecinosLibres = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!libre(x + dx, y + dy)) return false; return true; };
    const trazos = [];
    const guardar = (puntos, sale) => { if (puntos.length > 1) trazos.push({ puntos, cerrado: false, sale }); };

    const giro = () => (rnd() - 0.5) * 0.5;               // hasta ±14° de espiral
    const umbral = () => 0.16 + rnd() * 0.32;              // 9° a 27° antes de doblar
    const exterior = () => N * (0.9 + 0.1 * rnd());        // borde de afuera casi parejo
    // 1) Desde el borde de la pupila hacia afuera (las fibras del iris)
    for (const [x, y] of barajar(celdas.filter(([x, y]) => Math.hypot(x, y) < RIN + 1.3))) {
      if (!libre(x, y) || rnd() < 0.25) continue;
      guardar(crecer(x, y, 4 * N, exterior(), giro(), umbral()), true);
    }
    // 2) Fibras que nacen en los huecos del anillo (donde se abren las de la pupila)
    for (const [x, y] of barajar(celdas.filter(([x, y]) => Math.hypot(x, y) > RIN + 2 && Math.hypot(x, y) < N * 0.86))) {
      if (!vecinosLibres(x, y) || rnd() < 0.2) continue;
      guardar(crecer(x, y, 4 * N, exterior(), giro(), umbral()), true);
    }
    // 3) Marcos pequeños (rectángulos de 1 a 3 celdas) donde hay espacio con margen
    for (const [x, y] of barajar(celdas.filter(([x, y]) => Math.hypot(x, y) > RIN + 4))) {
      if (rnd() < 0.5) continue;
      const w = 1 + Math.floor(rnd() * 3), h = 1 + Math.floor(rnd() * 2);
      let cabe = true;
      for (let j = -1; j <= h + 1 && cabe; j++) for (let i = -1; i <= w + 1 && cabe; i++) {
        if (!libre(x + i, y + j) || !enAnillo(x + i, y + j, N * 0.95)) cabe = false;
      }
      if (!cabe) continue;
      for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) ocupado[id(x + i, y + j)] = 1;
      trazos.push({ puntos: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], cerrado: true, sale: false });
    }
    // 4) Fibras cortas para lo que quede
    for (const [x, y] of barajar(celdas.slice())) {
      if (!vecinosLibres(x, y)) continue;
      guardar(crecer(x, y, 1 + Math.floor(rnd() * 4), N * 0.97, giro(), umbral()), false);
    }
    return trazos;
  }

  // Solo las esquinas (los puntos donde cambia la dirección)
  function esquinas(puntos) {
    const s = [puntos[0]];
    for (let i = 1; i < puntos.length - 1; i++) {
      const [a, b, c] = [puntos[i - 1], puntos[i], puntos[i + 1]];
      if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) s.push(b);
    }
    if (puntos.length > 1) s.push(puntos[puntos.length - 1]);
    return s;
  }

  // ── Armado ──────────────────────────────────────────────────────────
  const r0 = panel.getBoundingClientRect();
  const N = Math.max(26, Math.min(70, Math.round(radioPantalla(r0.width, r0.height) / PX_CELDA)));
  const trazos = generar(N).map(t => ({ ...t, puntos: esquinas(t.puntos) }));
  const d = trazos.map(t => 'M' + t.puntos.map(p => p.join(' ')).join('L') + (t.cerrado ? 'Z' : '')).join('');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'iris');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const clase of ['iris-borde', 'iris-hueco']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', clase);
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  const capaChispas = document.createElement('div');
  capaChispas.className = 'iris-chispas';
  capaChispas.setAttribute('aria-hidden', 'true');
  panel.insertBefore(capaChispas, panel.firstChild);
  panel.insertBefore(svg, panel.firstChild);

  // Escala y posición según el tamaño del panel: centro del iris y px por celda
  let geo = null;
  function colocar() {
    const { width: W, height: H } = panel.getBoundingClientRect();
    if (!W || !H) return false;
    const m = movil(), s = radioPantalla(W, H) / N;
    const cx = 0, cy = H / 2;
    svg.setAttribute('viewBox', `${-cx / s} ${-cy / s} ${W / s} ${H / s}`);
    geo = { W, H, s, cx, cy, m };
    return true;
  }

  // ── Chispas ─────────────────────────────────────────────────────────
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animaciones = new Set();
  let visible = true, chispas = [];

  const largo = pts => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  for (const t of trazos) t.largo = largo(t.puntos);

  // Trazos que se ven en el panel (con el layout de ahora) y por los que vale la pena correr
  function candidatos() {
    const { W, H, s, cx, cy } = geo;
    return trazos.filter(t => t.sale && t.largo >= 6 && t.puntos.some(([x, y]) => {
      const px = cx + x * s, py = cy + y * s;
      return px > 8 && px < W - 8 && py > 8 && py < H - 8;
    }));
  }

  function correr(chispa, lista) {
    if (!lista.length || !geo) return;
    // Los trazos largos salen más seguido
    const total = lista.reduce((a, t) => a + t.largo, 0);
    let x = Math.random() * total, t = lista[0];
    for (const c of lista) { if ((x -= c.largo) <= 0) { t = c; break; } }
    const { s, cx, cy } = geo, L = t.largo, pts = t.puntos;
    // Posición a una fracción del recorrido (para que aparezca y se apague suave)
    const en = f => {
      let falta = f * L;
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (falta <= seg || i === pts.length - 1) {
          const k = seg ? Math.min(1, falta / seg) : 0;
          return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
        }
        falta -= seg;
      }
      return pts[pts.length - 1];
    };
    const marcas = [[0, pts[0]], [0.08, en(0.08)], [0.92, en(0.92)], [1, pts[pts.length - 1]]];
    let acum = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      acum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      marcas.push([acum / L, pts[i]]);
    }
    marcas.sort((a, b) => a[0] - b[0]);
    const cuadros = marcas.map(([f, [x, y]]) => ({
      offset: f, opacity: f < 0.08 ? f / 0.08 : f > 0.92 ? (1 - f) / 0.08 : 1,
      transform: `translate(${(cx + x * s).toFixed(1)}px, ${(cy + y * s).toFixed(1)}px)`,
    }));
    const anim = chispa.animate(cuadros, { duration: (L / VELOCIDAD) * 1000, delay: 300 + Math.random() * 2600, easing: 'linear', fill: 'backwards' });
    animaciones.add(anim);
    if (!visible) anim.pause();
    anim.onfinish = () => { animaciones.delete(anim); correr(chispa, lista); };
  }

  function iniciarChispas() {
    for (const a of animaciones) a.cancel();
    animaciones.clear();
    capaChispas.textContent = '';
    chispas = [];
    if (quieto.matches || !geo || typeof Element.prototype.animate !== 'function') return;
    const lista = candidatos();
    const cuantas = Math.max(5, Math.min(geo.m ? 9 : 16, Math.round(lista.length / 10)));
    for (let i = 0; i < cuantas; i++) {
      const c = document.createElement('span');
      c.className = 'iris-chispa';
      capaChispas.appendChild(c);
      chispas.push(c);
      correr(c, lista);
    }
  }

  // Al cambiar el tamaño (girar el celular, ventana) se reacomoda y las chispas vuelven a empezar
  let espera = null, ultimo = '';
  function reacomodar() {
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (!colocar()) return;
      const clave = `${Math.round(geo.W)}x${Math.round(geo.H)}`;
      if (clave !== ultimo) { ultimo = clave; iniciarChispas(); }
    }, 150);
  }
  if (colocar()) { ultimo = `${Math.round(geo.W)}x${Math.round(geo.H)}`; iniciarChispas(); }
  if ('ResizeObserver' in window) new ResizeObserver(reacomodar).observe(panel);
  else window.addEventListener('resize', reacomodar);
  if (quieto.addEventListener) quieto.addEventListener('change', iniciarChispas);

  // Sin gastar cuando la portada no se ve (otra vista abierta o fuera de pantalla)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entradas => {
      visible = entradas.some(e => e.isIntersecting);
      for (const a of animaciones) visible ? a.play() : a.pause();
    }).observe(panel);
  }
})();
