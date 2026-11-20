/* Portada: iris de figuras en el panel rojo, con puntos luminosos que corren por
 * sus contornos.
 *
 * El iris se arma una sola vez al abrir la página, siempre igual (azar con
 * semilla fija), en dos pasos:
 *   1. Esqueleto: en una cuadrícula gruesa dentro de un anillo, trazos que salen
 *      de la pupila hacia afuera siguiendo su radio, con tramos rectos y vueltas
 *      de 45° o 90°; los huecos se llenan con trazos cortos y marcos pequeños.
 *      Entre dos trazos queda al menos una celda gruesa libre.
 *   2. Figuras: cada trazo se pinta en una cuadrícula fina y se engorda 1 a 3
 *      celdas (unos tramos más que otros: de ahí los hombros y escalones), sin
 *      llegar nunca a menos de una celda fina de otra figura. El contorno de
 *      cada figura es un bucle cerrado de una sola línea, con las esquinas y los
 *      escalones cortados a 45° (marching squares); un marco deja un hueco, que
 *      es otro bucle.
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
  const PX_FINA = 4;            // tamaño aproximado de una celda fina en pantalla
  const U = 3;                  // celdas finas por celda gruesa (la del esqueleto)
  const VELOCIDAD = 18;         // celdas finas por segundo de las chispas
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

  // ── Esqueleto ───────────────────────────────────────────────────────
  // Devuelve [{puntos: [[x, y]], cerrado, sale}] en celdas gruesas, con centro en (0, 0)
  function esqueleto(N) {
    const rnd = azar(SEMILLA + N), RIN = N * PUPILA, T = 2 * N + 1;
    const id = (x, y) => (y + N) * T + (x + N);
    // ocupado = número del trazo (1, 2, ...) dueño de cada punto; 0 = libre
    const ocupado = new Int32Array(T * T), diagonal = new Uint8Array(T * T);
    let numero = 0;
    const DIR = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const enAnillo = (x, y, rmax) => { const r = Math.hypot(x, y); return r >= RIN && r <= rmax; };
    const libre = (x, y) => Math.abs(x) <= N && Math.abs(y) <= N && !ocupado[id(x, y)];
    // ¿Se puede ir de (x, y) en la dirección d? El punto nuevo debe estar libre y sus 8
    // vecinos también, salvo el punto actual y el anterior del mismo trazo: así queda
    // siempre una celda libre entre bucles (y en las vueltas del mismo trazo)
    function puede(x, y, d, rmax, k, previo) {
      const nx = x + DIR[d][0], ny = y + DIR[d][1];
      if (!enAnillo(nx, ny, rmax) || !libre(nx, ny)) return false;
      if (d % 2 && diagonal[id(Math.min(x, nx), Math.min(y, ny))]) return false;
      const actual = id(x, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const vx = nx + dx, vy = ny + dy;
        if (Math.abs(vx) > N || Math.abs(vy) > N) continue;
        const q = id(vx, vy);
        if (ocupado[q] && !(ocupado[q] === k && (q === actual || q === previo))) return false;
      }
      return true;
    }
    function mover(x, y, d, k) {
      const nx = x + DIR[d][0], ny = y + DIR[d][1];
      if (d % 2) diagonal[id(Math.min(x, nx), Math.min(y, ny))] = 1;
      ocupado[id(nx, ny)] = k;
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
      const puntos = [[x, y]], k = ++numero;
      ocupado[id(x, y)] = k;
      let d = cercana(Math.atan2(y, x) + giro), deLado = 0, dLado = 0, previo = -1;
      for (let paso = 0; paso < largo; paso++) {
        const meta = Math.atan2(y, x) + giro, desvio = diferencia(angulo(d), meta), hacia = desvio > 0 ? -1 : 1;
        if (!deLado && paso > 1 && rnd() < lado) { deLado = 1 + Math.floor(rnd() * 3); dLado = (d + (rnd() < 0.5 ? 2 : 6)) % 8; }
        const orden = deLado ? [dLado - d, 0] : Math.abs(desvio) > umbral ? [hacia, 0, -hacia] : rnd() < 0.06 ? [-hacia, 0, hacia] : [0, hacia, -hacia];
        let siguiente = -1;
        for (const g of orden) {
          const nd = (d + g + 8) % 8;
          if (Math.cos(diferencia(angulo(nd), Math.atan2(y, x))) < (deLado ? -0.15 : 0.25) || !puede(x, y, nd, rmax, k, previo)) continue;
          siguiente = nd;
          break;
        }
        if (deLado) deLado = siguiente === dLado ? deLado - 1 : 0;
        if (siguiente < 0) break;
        previo = id(x, y);
        [x, y] = mover(x, y, siguiente, k);
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
      if (!vecinosLibres(x, y) || rnd() < 0.1) continue;
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
      const w = 2 + Math.floor(rnd() * 3), h = 2 + Math.floor(rnd() * 2);
      let cabe = true;
      for (let j = -1; j <= h + 1 && cabe; j++) for (let i = -1; i <= w + 1 && cabe; i++) {
        if (!libre(x + i, y + j) || !enAnillo(x + i, y + j, N * 0.95)) cabe = false;
      }
      if (!cabe) continue;
      numero++;
      for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) ocupado[id(x + i, y + j)] = numero;
      trazos.push({ puntos: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], cerrado: true, sale: false });
    }
    // 4) Fibras cortas para lo que quede
    for (const [x, y] of barajar(celdas.slice())) {
      if (!vecinosLibres(x, y)) continue;
      guardar(crecer(x, y, 1 + Math.floor(rnd() * 4), N * 0.97, giro(), umbral()), false);
    }
    return trazos;
  }

  // ── Figuras ─────────────────────────────────────────────────────────
  // Engorda el esqueleto en la cuadrícula fina (radio N = Nc·U celdas) y devuelve el
  // contorno de cada figura: [{puntos: [[x, y]]}], bucles cerrados en celdas finas
  function figuras(Nc) {
    const trazos = esqueleto(Nc), rnd = azar(SEMILLA * 7 + Nc);
    const N = Nc * U, T = 2 * N + 1, RIN = N * PUPILA;
    const id = (x, y) => (y + N) * T + (x + N);
    const dentro = (x, y) => Math.abs(x) <= N && Math.abs(y) <= N;
    const etiqueta = new Int32Array(T * T), resto = new Int8Array(T * T), celdas = [null];
    // ¿Hay una celda de otra figura en los 8 alrededores?
    const ajena = (x, y, k) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const vx = x + dx, vy = y + dy;
        if (dentro(vx, vy)) { const e = etiqueta[id(vx, vy)]; if (e && e !== k) return true; }
      }
      return false;
    };
    let frente = [];
    const poner = (x, y, k, b) => { const q = id(x, y); etiqueta[q] = k; resto[q] = b; celdas[k].push([x, y]); frente.push([x, y, k]); };
    // Cuánto se engorda un tramo: más cerca de la pupila, más ancho
    const engorde = r => { const p = rnd(); return r < N * 0.6 ? (p < 0.25 ? 1 : p < 0.65 ? 2 : 3) : (p < 0.5 ? 1 : p < 0.85 ? 2 : 3); };
    // 1) El esqueleto en la cuadrícula fina; cada tramo recto con su engorde
    trazos.forEach(tr => {
      const k = celdas.length;
      celdas.push([]);
      const pts = tr.cerrado ? tr.puntos.concat([tr.puntos[0]]) : tr.puntos;
      let dirAnterior = '', b = 1;
      for (let j = 1; j < pts.length; j++) {
        const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
        const sx = Math.sign(bx - ax), sy = Math.sign(by - ay), pasos = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * U;
        const dir = sx + ',' + sy;
        if (dir !== dirAnterior) { b = tr.cerrado ? 1 : engorde(Math.hypot(ax, ay) * U); dirAnterior = dir; }
        for (let s = 0; s <= pasos; s++) {
          const x = ax * U + sx * s, y = ay * U + sy * s, q = id(x, y);
          if (etiqueta[q] === k) resto[q] = Math.max(resto[q], b);
          else if (!etiqueta[q] && !ajena(x, y, k)) poner(x, y, k, b);
        }
      }
    });
    // 2) Engorde por rondas (la 1ª y la 3ª en 8 direcciones, la 2ª en 4: así los
    //    extremos y los cambios de ancho quedan cortados a 45°)
    const V8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], V4 = V8.slice(0, 4);
    for (let ronda = 1; ronda <= 3; ronda++) {
      const vec = ronda === 2 ? V4 : V8, nuevo = [];
      for (let i = frente.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [frente[i], frente[j]] = [frente[j], frente[i]]; }
      for (const [x, y, k] of frente) {
        const b = resto[id(x, y)];
        if (b <= 0) continue;
        for (const [dx, dy] of vec) {
          const nx = x + dx, ny = y + dy;
          if (!dentro(nx, ny) || etiqueta[id(nx, ny)]) continue;
          const r = Math.hypot(nx, ny);
          if (r < RIN - 1 || r > N || ajena(nx, ny, k)) continue;
          const q = id(nx, ny);
          etiqueta[q] = k; resto[q] = b - 1; celdas[k].push([nx, ny]); nuevo.push([nx, ny, k]);
        }
      }
      frente = nuevo;
    }
    // 2b) Limpieza (dos pasadas): se rellenan las muescas de una celda (celda vacía con 3
    //     o más vecinos de la misma figura, o entre dos lados de ella) y se quitan las
    //     salientes de una celda, para que los bordes queden lisos
    for (let pasada = 0; pasada < 2; pasada++) {
      for (let y = -N + 1; y < N; y++) for (let x = -N + 1; x < N; x++) {
        const q = id(x, y), e0 = etiqueta[q];
        const d = etiqueta[q + 1], i = etiqueta[q - 1], ab = etiqueta[q + T], ar = etiqueta[q - T];
        if (!e0) {
          const k = d || i || ab || ar;
          if (!k) continue;
          const iguales = (d === k) + (i === k) + (ab === k) + (ar === k);
          if ((iguales >= 3 || (d === k && i === k) || (ab === k && ar === k)) && !ajena(x, y, k)) etiqueta[q] = k;
        } else if ((d === e0) + (i === e0) + (ab === e0) + (ar === e0) <= 1) etiqueta[q] = 0;
      }
    }
    for (let k = 1; k < celdas.length; k++) celdas[k] = [];
    for (let y = -N; y <= N; y++) for (let x = -N; x <= N; x++) { const e = etiqueta[id(x, y)]; if (e) celdas[e].push([x, y]); }
    // 3) Contorno de cada figura: aristas de borde de sus celdas (en sentido de las
    //    manecillas, con la figura a la derecha), unidas en bucles; en un cruce en
    //    diagonal se da vuelta a la izquierda para que la figura quede en un solo bucle.
    //    Luego los puntos medios de cada arista: escalones y esquinas quedan a 45°
    const lazos = [], A = T + 3, clave = (x, y) => (x + N + 1) * A + (y + N + 1);
    for (let k = 1; k < celdas.length; k++) {
      if (!celdas[k].length) continue;
      const es = (x, y) => dentro(x, y) && etiqueta[id(x, y)] === k;
      const salen = new Map(), aristas = [];
      const arista = (x0, y0, x1, y1) => {
        const a = { x0, y0, x1, y1, usada: false }, c = clave(x0, y0);
        aristas.push(a);
        (salen.get(c) || salen.set(c, []).get(c)).push(a);
      };
      for (const [x, y] of celdas[k]) {
        if (!es(x, y - 1)) arista(x, y, x + 1, y);
        if (!es(x + 1, y)) arista(x + 1, y, x + 1, y + 1);
        if (!es(x, y + 1)) arista(x + 1, y + 1, x, y + 1);
        if (!es(x - 1, y)) arista(x, y + 1, x, y);
      }
      for (const inicio of aristas) {
        if (inicio.usada) continue;
        const v = [];
        let a = inicio;
        while (a && !a.usada) {
          a.usada = true;
          v.push([a.x0, a.y0]);
          const opciones = (salen.get(clave(a.x1, a.y1)) || []).filter(o => !o.usada);
          const dx = a.x1 - a.x0, dy = a.y1 - a.y0;
          a = opciones.length > 1 ? (opciones.find(o => o.x1 - o.x0 === dy && o.y1 - o.y0 === -dx) || opciones[0]) : opciones[0];
        }
        if (v.length < 4) continue;
        // Puntos medios (centrados en las celdas) y sin los que van en línea recta
        const m = v.map((p, i) => { const q = v[(i + 1) % v.length]; return [(p[0] + q[0]) / 2 - 0.5, (p[1] + q[1]) / 2 - 0.5]; });
        const puntos = m.filter((p, i) => {
          const a0 = m[(i - 1 + m.length) % m.length], a1 = m[(i + 1) % m.length];
          return (p[0] - a0[0]) !== (a1[0] - p[0]) || (p[1] - a0[1]) !== (a1[1] - p[1]);
        });
        if (puntos.length >= 3) lazos.push({ puntos });
      }
    }
    return lazos;
  }

  // ── Armado ──────────────────────────────────────────────────────────
  const r0 = panel.getBoundingClientRect();
  const Nc = Math.max(12, Math.min(60, Math.round(radioPantalla(r0.width, r0.height) / (PX_FINA * U))));
  const N = Nc * U;                                  // radio del iris en celdas finas
  const lazos = figuras(Nc);
  const d = lazos.map(l => 'M' + l.puntos.map(p => p.join(' ')).join('L') + 'Z').join('');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'iris');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('preserveAspectRatio', 'none');
  const trazo = document.createElementNS(NS, 'path');
  trazo.setAttribute('class', 'iris-borde');
  trazo.setAttribute('d', d);
  svg.appendChild(trazo);
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
  for (const l of lazos) l.largo = largo(l.puntos.concat([l.puntos[0]]));

  // Bucles que se ven en el panel (con el layout de ahora) y por los que vale la pena correr
  function candidatos() {
    const { W, H, s, cx, cy } = geo;
    return lazos.filter(t => t.largo >= 16 && t.puntos.some(([x, y]) => {
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
    // Un tramo del contorno: desde un punto al azar, de 40 a 130 celdas (o la vuelta completa)
    const { s, cx, cy } = geo, cerrado = t.puntos.concat([t.puntos[0]]), n = t.puntos.length;
    const tramo = Math.min(t.largo, 40 + Math.random() * 90), i0 = Math.floor(Math.random() * n), pts = [cerrado[i0]];
    for (let i = i0, hecho = 0; hecho < tramo; i = (i + 1) % n) {
      const a = cerrado[i], b = cerrado[i + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (hecho + seg >= tramo) { const k = (tramo - hecho) / seg; pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); break; }
      pts.push(b);
      hecho += seg;
    }
    const L = largo(pts);
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
