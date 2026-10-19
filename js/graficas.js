/* Utilidades y gráficas SVG del sitio (sin librerías externas).
 * Los colores de tinta, rejilla y superficie salen de variables CSS del
 * contenedor (--g-*), así las mismas gráficas sirven en la página de unidad
 * (clara) y en la del líder (negra). */
const Util = (function () {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const num = (x, d = 0) => (x == null || Number.isNaN(+x)) ? '—'
    : Number(x).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => x == null ? '—' : num(x, d) + '%';

  function cuantil(ord, p) {
    if (!ord.length) return null;
    const i = (ord.length - 1) * p, a = Math.floor(i), b = Math.ceil(i);
    return ord[a] + (ord[b] - ord[a]) * (i - a);
  }

  // t de Student (dos colas, 95%) aproximada para el intervalo de la media
  function t95(gl) {
    if (gl <= 0) return NaN;
    const tabla = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23];
    return gl <= 10 ? tabla[gl - 1] : 1.96 + 2.4 / gl + 2.9 / (gl * gl);
  }

  function estadisticas(valores) {
    const v = valores.filter(x => x != null && !Number.isNaN(+x)).map(Number).sort((a, b) => a - b);
    const n = v.length;
    if (!n) return { n: 0 };
    const media = v.reduce((s, x) => s + x, 0) / n;
    const de = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : 0;
    const margen = n > 1 ? t95(n - 1) * de / Math.sqrt(n) : 0;
    return {
      n, media, de, mediana: cuantil(v, 0.5), q1: cuantil(v, 0.25), q3: cuantil(v, 0.75),
      min: v[0], max: v[n - 1], ic: [media - margen, media + margen], ordenados: v,
    };
  }

  // Estimación de densidad (kernel gaussiano, ancho de Silverman)
  function kde(valores, dominio, puntos = 100) {
    const st = estadisticas(valores);
    if (st.n < 2) return [];
    const iqr = st.q3 - st.q1;
    let h = 0.9 * Math.min(st.de, iqr > 0 ? iqr / 1.34 : st.de) * Math.pow(st.n, -0.2);
    if (!(h > 0)) h = 1;
    const lo = Math.max(dominio[0], st.min - 2 * h), hi = Math.min(dominio[1], st.max + 2 * h);
    const out = [], k = 1 / (st.n * h * Math.sqrt(2 * Math.PI));
    for (let i = 0; i <= puntos; i++) {
      const x = lo + (hi - lo) * i / puntos;
      let s = 0;
      for (const v of st.ordenados) { const z = (x - v) / h; s += Math.exp(-0.5 * z * z); }
      out.push([x, s * k]);
    }
    return out;
  }

  return { esc, num, pct, estadisticas, kde, cuantil };
})();


const Graficas = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const { esc, num } = Util;

  function el(tag, attrs, padre) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(e);
    return e;
  }

  function texto(padre, x, y, contenido, attrs = {}) {
    const t = el('text', Object.assign({ x, y, 'pointer-events': 'none' }, attrs), padre);
    t.textContent = contenido;
    return t;
  }

  function tema(cont) {
    const cs = getComputedStyle(cont);
    const v = n => cs.getPropertyValue(n).trim();
    return { tinta: v('--g-tinta'), tinta2: v('--g-tinta2'), muted: v('--g-muted'),
             grid: v('--g-grid'), eje: v('--g-eje'), sup: v('--g-superficie'),
             objetivo: v('--g-objetivo') || v('--g-tinta') };
  }

  function escala(d0, d1, r0, r1) {
    const k = (r1 - r0) / ((d1 - d0) || 1);
    const f = x => r0 + (x - d0) * k;
    f.inv = y => d0 + (y - r0) / k;
    return f;
  }

  function ticks(min, max, n = 5) {
    const span = (max - min) || 1;
    const bruto = span / n, mag = Math.pow(10, Math.floor(Math.log10(bruto))), e = bruto / mag;
    const paso = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let x = Math.ceil(min / paso - 1e-9) * paso; x <= max + paso * 1e-9; x += paso) {
      out.push(+x.toFixed(10));
    }
    return out;
  }

  function compacto(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return num(v / 1e6, 1) + 'M';
    if (a >= 1e3) return num(v / 1e3, a >= 1e4 ? 0 : 1) + 'K';
    return num(v, Number.isInteger(v) ? 0 : 1);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────
  const Tip = {
    show(html, e) {
      const t = document.getElementById('tooltip');
      t.innerHTML = html;
      t.hidden = false;
      const r = t.getBoundingClientRect();
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
      t.style.left = Math.max(8, x) + 'px';
      t.style.top = Math.max(8, y) + 'px';
    },
    hide() { document.getElementById('tooltip').hidden = true; },
  };
  window.addEventListener('scroll', () => Tip.hide(), { passive: true });

  function conTip(nodo, html) {
    const f = e => Tip.show(typeof html === 'function' ? html(e) : html, e);
    nodo.addEventListener('pointermove', f);
    nodo.addEventListener('pointerdown', f);
    nodo.addEventListener('pointerleave', () => Tip.hide());
  }

  // Dibuja con el ancho del contenedor y vuelve a dibujar si cambia
  function montar(cont, dibujar) {
    if (cont._ro) cont._ro.disconnect();
    let ancho = -1, espera;
    const f = () => {
      const w = Math.floor(cont.clientWidth);
      if (w <= 0 || w === ancho) return;
      ancho = w;
      cont.innerHTML = '';
      dibujar(cont, w, tema(cont));
    };
    f();
    cont._ro = new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(f, 120); });
    cont._ro.observe(cont);
  }

  function leyenda(cont, items) {
    const d = document.createElement('div');
    d.className = 'g-leyenda';
    d.innerHTML = items.map(it => {
      const forma = it.forma || 'cuadro';
      const muestra = forma === 'linea'
        ? `<svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="${it.color}" stroke-width="${it.ancho || 2}" ${it.punteada ? 'stroke-dasharray="4 3"' : ''} stroke-linecap="round"/></svg>`
        : `<svg width="12" height="12" aria-hidden="true">${marcaSvg(forma, 6, 6, 5, it.color)}</svg>`;
      return `<span class="g-ley-item">${muestra}${esc(it.nombre)}</span>`;
    }).join('');
    cont.appendChild(d);
    return d;
  }

  function marcaSvg(forma, x, y, r, color, ring) {
    const anillo = ring ? ` stroke="${ring}" stroke-width="2"` : '';
    switch (forma) {
      case 'cuadro':    return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1.5" fill="${color}"${anillo}/>`;
      case 'triangulo': return `<path d="M${x},${y - r * 1.15}L${x + r * 1.1},${y + r * 0.85}L${x - r * 1.1},${y + r * 0.85}Z" fill="${color}"${anillo}/>`;
      case 'rombo':     return `<path d="M${x},${y - r * 1.25}L${x + r * 1.1},${y}L${x},${y + r * 1.25}L${x - r * 1.1},${y}Z" fill="${color}"${anillo}/>`;
      case 'cruz': {
        const a = r * 0.42;
        return `<path d="M${x - a},${y - r}H${x + a}V${y - a}H${x + r}V${y + a}H${x + a}V${y + r}H${x - a}V${y + a}H${x - r}V${y - a}H${x - a}Z" fill="${color}"${anillo}/>`;
      }
      default:          return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"${anillo}/>`;
    }
  }

  function marca(padre, forma, x, y, r, color, ring) {
    const g = el('g', {}, padre);
    g.innerHTML = marcaSvg(forma, x, y, r, color, ring);
    return g;
  }

  function ejeY(svg, y, valores, x0, x1, T, formato = compacto) {
    for (const v of valores) {
      el('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), stroke: T.grid, 'stroke-width': 1,
                   'shape-rendering': 'crispEdges' }, svg);
      texto(svg, x0 - 8, y(v) + 4, formato(v), { 'text-anchor': 'end', fill: T.muted,
            'font-size': 11, class: 'g-num' });
    }
  }

  function lineaObjetivo(svg, y, valor, x0, x1, etiqueta, T, izquierda) {
    el('line', { x1: x0, x2: x1, y1: y(valor), y2: y(valor), stroke: T.objetivo,
                 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }, svg);
    texto(svg, izquierda ? x0 + 6 : x1 - 2, y(valor) - 6, etiqueta, { 'text-anchor': izquierda ? 'start' : 'end',
          fill: T.tinta2, 'font-size': 11, 'font-weight': 600 });
  }

  function svgBase(cont, W, H, titulo) {
    return el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
                       'aria-label': titulo || '', class: 'g-svg' }, cont);
  }

  function htmlEstadisticas(nombre, st, objetivo) {
    if (!st.n) return `<b>${esc(nombre)}</b><br>Sin calificaciones`;
    const sobre = objetivo != null ? st.ordenados.filter(v => v >= objetivo).length : null;
    return `<b>${esc(nombre)}</b>
      <table class="tip-tabla">
        <tr><td>n</td><td>${num(st.n)}</td></tr>
        <tr><td>Media</td><td>${num(st.media, 1)}</td></tr>
        <tr><td>IC 95%</td><td>${num(st.ic[0], 1)} – ${num(st.ic[1], 1)}</td></tr>
        <tr><td>Mediana</td><td>${num(st.mediana, 1)}</td></tr>
        <tr><td>DE</td><td>${num(st.de, 1)}</td></tr>
        <tr><td>Q1 – Q3</td><td>${num(st.q1, 1)} – ${num(st.q3, 1)}</td></tr>
        <tr><td>Mín – Máx</td><td>${num(st.min, 1)} – ${num(st.max, 1)}</td></tr>
        ${sobre != null ? `<tr><td>≥ ${objetivo}</td><td>${num(sobre / st.n * 100, 1)}%</td></tr>` : ''}
      </table>`;
  }

  // ── Violín ────────────────────────────────────────────────────────────
  function violin(cont, op) {
    montar(cont, (c, ancho, T) => {
      const W = Math.max(ancho, op.minAncho || 0), H = op.alto || 400;
      const m = { l: 40, r: 10, t: 16, b: 70 };
      const svg = svgBase(c, W, H, op.titulo);
      const y = escala(op.dominio[0], op.dominio[1], H - m.b, m.t);
      ejeY(svg, y, ticks(op.dominio[0], op.dominio[1], 6), m.l, W - m.r, T);
      const n = op.series.length, banda = (W - m.l - m.r) / n;
      const anchoMax = Math.min(banda * 0.44, 72);
      const kdes = op.series.map(s => Util.kde(s.valores, op.dominio, 90));
      const maxD = Math.max(1e-9, ...kdes.flatMap(k => k.map(p => p[1])));
      const pseudo = j => { const s = Math.sin(j * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

      op.series.forEach((s, i) => {
        const cx = m.l + banda * (i + 0.5), k = kdes[i], st = Util.estadisticas(s.valores);
        const w = dens => dens / maxD * anchoMax;
        const densEn = v => {
          if (!k.length) return 0;
          const j = Math.max(0, Math.min(k.length - 1, Math.round((v - k[0][0]) / ((k[k.length - 1][0] - k[0][0]) || 1) * (k.length - 1))));
          return k[j][1];
        };
        if (k.length) {
          const ida = k.map(([v, d]) => `${(cx + w(d)).toFixed(1)},${y(v).toFixed(1)}`);
          const vuelta = k.slice().reverse().map(([v, d]) => `${(cx - w(d)).toFixed(1)},${y(v).toFixed(1)}`);
          el('path', { d: `M${ida.join('L')}L${vuelta.join('L')}Z`, fill: s.color, 'fill-opacity': 0.2,
                       stroke: s.color, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
                       'pointer-events': 'none' }, svg);
          const g = el('g', { 'pointer-events': 'none' }, svg);
          st.ordenados.forEach((v, j) => {
            el('circle', { cx: (cx + (pseudo(j + i * 997) - 0.5) * 1.6 * w(densEn(v))).toFixed(1),
                           cy: y(v).toFixed(1), r: 1.6, fill: s.color, 'fill-opacity': 0.5 }, g);
          });
          const iqr = st.q3 - st.q1;
          const lo = st.ordenados.find(v => v >= st.q1 - 1.5 * iqr);
          const hi = [...st.ordenados].reverse().find(v => v <= st.q3 + 1.5 * iqr);
          el('line', { x1: cx, x2: cx, y1: y(lo), y2: y(hi), stroke: T.tinta, 'stroke-width': 1.5,
                       'pointer-events': 'none' }, svg);
          el('rect', { x: cx - 5, y: y(st.q3), width: 10, height: Math.max(1.5, y(st.q1) - y(st.q3)),
                       rx: 2, fill: T.tinta, 'pointer-events': 'none' }, svg);
          el('line', { x1: cx - w(densEn(st.media)) - 3, x2: cx + w(densEn(st.media)) + 3,
                       y1: y(st.media), y2: y(st.media), stroke: T.tinta2, 'stroke-width': 1.5,
                       'pointer-events': 'none' }, svg);
          el('circle', { cx, cy: y(st.mediana), r: 4, fill: T.sup, stroke: T.tinta, 'stroke-width': 2,
                         'pointer-events': 'none' }, svg);
        }
        const yb = H - m.b;
        texto(svg, cx, yb + 20, s.nombre, { 'text-anchor': 'middle', fill: T.tinta, 'font-size': 12, 'font-weight': 600 });
        texto(svg, cx, yb + 36, st.n ? `n = ${num(st.n)}` : 'sin datos', { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11 });
        if (st.n) texto(svg, cx, yb + 51, `x̄ ${num(st.media, 1)} · Md ${num(st.mediana, 1)}`,
                        { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 11, class: 'g-num' });
        const hit = el('rect', { x: cx - banda / 2, y: m.t, width: banda, height: H - m.t - m.b, fill: 'transparent' }, svg);
        conTip(hit, htmlEstadisticas(s.nombre, st, op.objetivo && op.objetivo.valor));
      });
      if (op.objetivo) lineaObjetivo(svg, y, op.objetivo.valor, m.l, W - m.r, op.objetivo.etiqueta, T);
    });
  }

  // ── Líneas con objetivo y cursor ──────────────────────────────────────
  function lineas(cont, op) {
    montar(cont, (c, W, T) => {
      leyenda(c, op.series.map(s => ({ nombre: s.nombre, color: s.color, forma: 'linea', ancho: s.ancho || 2 }))
        .concat(op.objetivo ? [{ nombre: op.objetivo.etiqueta, color: T.objetivo, forma: 'linea', punteada: true }] : []));
      const H = op.alto || 320;
      const m = { l: 40, r: op.etiquetaFinal ? 64 : 14, t: 14, b: 30 };
      const svg = svgBase(c, W, H, op.titulo);
      const todos = op.series.flatMap(s => s.valores.filter(v => v != null));
      if (op.objetivo) todos.push(op.objetivo.valor);
      let lo = op.dominio ? op.dominio[0] : Math.min(...todos), hi = op.dominio ? op.dominio[1] : Math.max(...todos);
      if (!op.dominio) { const pad = (hi - lo) * 0.12 || 2; lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad); }
      const y = escala(lo, hi, H - m.b, m.t);
      const nX = op.x.length, x = escala(0, Math.max(1, nX - 1), m.l + 6, W - m.r);
      ejeY(svg, y, ticks(lo, hi, 5), m.l, W - m.r, T, op.formatoY);
      const cada = Math.max(1, Math.ceil(nX / Math.max(2, Math.floor((W - m.l - m.r) / 36))));
      op.x.forEach((v, i) => {
        if (i % cada && i !== nX - 1) return;
        texto(svg, x(i), H - m.b + 18, op.etiquetaX ? op.etiquetaX(v, i) : v,
              { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
      });
      el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
      if (op.objetivo) lineaObjetivo(svg, y, op.objetivo.valor, m.l, W - m.r, op.objetivo.etiqueta, T, true);

      for (const s of op.series) {
        let d = '', abierto = false;
        s.valores.forEach((v, i) => {
          if (v == null) { abierto = false; return; }
          d += (abierto ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
          abierto = true;
        });
        el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.ancho || 2,
                     'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' }, svg);
        const ult = s.valores.reduce((a, v, i) => v != null ? i : a, -1);
        if (ult >= 0) {
          el('circle', { cx: x(ult), cy: y(s.valores[ult]), r: 4, fill: s.color, stroke: T.sup,
                         'stroke-width': 2, 'pointer-events': 'none' }, svg);
          if (op.etiquetaFinal && s.principal) {
            texto(svg, x(ult) + 9, y(s.valores[ult]) + 4, `${s.nombre} ${num(s.valores[ult], 1)}`,
                  { fill: T.tinta, 'font-size': 11, 'font-weight': 700 });
          }
        }
      }

      const cursor = el('line', { y1: m.t, y2: H - m.b, stroke: T.eje, 'stroke-width': 1, visibility: 'hidden',
                                  'pointer-events': 'none' }, svg);
      const puntos = op.series.map(s => el('circle', { r: 4, fill: s.color, stroke: T.sup, 'stroke-width': 2,
                                                        visibility: 'hidden', 'pointer-events': 'none' }, svg));
      const capa = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
      const mover = e => {
        const r = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(nX - 1, Math.round(x.inv(e.clientX - r.left))));
        cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i));
        cursor.setAttribute('visibility', 'visible');
        const filas = [];
        op.series.forEach((s, k) => {
          const v = s.valores[i];
          if (v == null) { puntos[k].setAttribute('visibility', 'hidden'); return; }
          puntos[k].setAttribute('cx', x(i)); puntos[k].setAttribute('cy', y(v));
          puntos[k].setAttribute('visibility', 'visible');
          filas.push({ s, v });
        });
        filas.sort((a, b) => b.v - a.v);
        Tip.show(`<b>${esc(op.tituloTip ? op.tituloTip(op.x[i], i) : op.x[i])}</b><table class="tip-tabla">` +
          filas.map(f => `<tr><td><i class="tip-sw" style="background:${f.s.color}"></i>${esc(f.s.nombre)}</td><td>${(op.formatoTip || (v => num(v, 1)))(f.v, f.s, i)}</td></tr>`).join('') +
          '</table>', e);
      };
      capa.addEventListener('pointermove', mover);
      capa.addEventListener('pointerdown', mover);
      capa.addEventListener('pointerleave', () => {
        Tip.hide(); cursor.setAttribute('visibility', 'hidden');
        puntos.forEach(p => p.setAttribute('visibility', 'hidden'));
      });
    });
  }

  // Rectángulo con extremo de datos redondeado (base cuadrada)
  function barraV(x, y0, y1, w, r) {
    const h = y0 - y1;
    if (h <= 0) return '';
    r = Math.min(r, h, w / 2);
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  function barraH(x0, x1, y, h, r) {
    const w = x1 - x0;
    if (w <= 0) return '';
    r = Math.min(r, w, h / 2);
    return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
  }

  // ── Columnas apiladas ─────────────────────────────────────────────────
  function columnasApiladas(cont, op) {
    montar(cont, (c, W, T) => {
      leyenda(c, op.series.map(s => ({ nombre: s.nombre, color: s.color })));
      const H = op.alto || 300, m = { l: 40, r: 10, t: 12, b: 30 };
      const svg = svgBase(c, W, H, op.titulo);
      const totales = op.x.map((_, i) => op.series.reduce((a, s) => a + (s.valores[i] || 0), 0));
      const hi = Math.max(1, ...totales);
      const tk = ticks(0, hi, 5), top = Math.max(hi, tk[tk.length - 1]);
      const y = escala(0, top, H - m.b, m.t);
      ejeY(svg, y, tk, m.l, W - m.r, T);
      const banda = (W - m.l - m.r) / op.x.length, bw = Math.max(3, Math.min(24, banda - 4));
      const cada = Math.max(1, Math.ceil(op.x.length / Math.max(2, Math.floor((W - m.l - m.r) / 32))));
      op.x.forEach((xv, i) => {
        const x0 = m.l + banda * i + (banda - bw) / 2;
        let acum = 0;
        const segs = op.series.map(s => ({ s, v: s.valores[i] || 0 })).filter(z => z.v > 0);
        segs.forEach((z, k) => {
          const yb = y(acum) - (k ? 2 : 0), yt = y(acum + z.v);
          acum += z.v;
          if (yb - yt <= 0.5) return;
          const d = k === segs.length - 1 ? barraV(x0, yb, yt, bw, 4) : `M${x0},${yb}V${yt}H${x0 + bw}V${yb}Z`;
          el('path', { d, fill: z.s.color, 'pointer-events': 'none' }, svg);
        });
        if (i % cada === 0 || i === op.x.length - 1) {
          texto(svg, m.l + banda * (i + 0.5), H - m.b + 18, op.etiquetaX ? op.etiquetaX(xv, i) : xv,
                { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
        }
        const hit = el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: 'transparent' }, svg);
        conTip(hit, () => `<b>${esc(op.tituloTip ? op.tituloTip(xv, i) : xv)}</b><table class="tip-tabla">` +
          op.series.map(s => `<tr><td><i class="tip-sw" style="background:${s.color}"></i>${esc(s.nombre)}</td><td>${num(s.valores[i] || 0)}</td></tr>`).join('') +
          `<tr class="tip-total"><td>Total</td><td>${num(totales[i])}</td></tr></table>`);
      });
      el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
    });
  }

  // ── Barras horizontales (con pista opcional y línea de referencia) ────
  function barras(cont, op) {
    montar(cont, (c, W, T) => {
      if (op.leyenda) leyenda(c, op.leyenda);
      const fila = op.altoFila || 34, eti = Math.min(op.anchoEtiqueta || 120, W * 0.32);
      const m = { l: eti + 10, r: op.margenDerecho || 92, t: 8, b: op.referencia ? 22 : 8 };
      const H = m.t + m.b + op.filas.length * fila;
      const svg = svgBase(c, W, H, op.titulo);
      const max = op.max || Math.max(1, ...op.filas.map(f => Math.max(f.valor || 0, f.pista || 0)));
      const x = escala(0, max, m.l, W - m.r);
      const bh = Math.min(16, fila - 12);
      op.filas.forEach((f, i) => {
        const yc = m.t + i * fila + fila / 2;
        texto(svg, m.l - 10, yc + 4, f.etiqueta, { 'text-anchor': 'end', fill: T.tinta, 'font-size': 12, 'font-weight': 600 });
        if (f.pista != null) {
          el('path', { d: barraH(m.l, x(Math.min(max, f.pista)), yc - bh / 2 - 3, bh + 6, 4),
                       fill: f.color, 'fill-opacity': 0.18, 'pointer-events': 'none' }, svg);
        }
        el('path', { d: barraH(m.l, x(Math.min(max, f.valor || 0)), yc - bh / 2, bh, 4), fill: f.color,
                     'pointer-events': 'none' }, svg);
        if (f.marca != null) {
          const xm = x(Math.min(max, f.marca));
          el('line', { x1: xm, x2: xm, y1: yc - bh / 2 - 6, y2: yc + bh / 2 + 6, stroke: T.tinta,
                       'stroke-width': 2, 'stroke-linecap': 'round', 'pointer-events': 'none' }, svg);
        }
        texto(svg, W - 2, yc + 4, f.texto, { 'text-anchor': 'end', fill: T.tinta2, 'font-size': 12, class: 'g-num' });
        const hit = el('rect', { x: 0, y: yc - fila / 2, width: W, height: fila, fill: 'transparent' }, svg);
        if (f.tip) conTip(hit, f.tip);
      });
      el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
      if (op.referencia) {
        const xr = x(op.referencia.valor);
        el('line', { x1: xr, x2: xr, y1: m.t - 2, y2: H - m.b + 2, stroke: T.objetivo, 'stroke-width': 1.5,
                     'stroke-dasharray': '6 4', 'pointer-events': 'none' }, svg);
        texto(svg, xr, H - 6, op.referencia.etiqueta, { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 11, 'font-weight': 600 });
      }
    });
  }

  // ── Barras 100% apiladas (ordinal) ────────────────────────────────────
  function barras100(cont, op) {
    montar(cont, (c, W, T) => {
      leyenda(c, op.segmentos.map(s => ({ nombre: s.nombre, color: s.color })));
      const fila = 36, eti = Math.min(120, W * 0.3), m = { l: eti + 10, r: 8, t: 6, b: 6 };
      const H = m.t + m.b + op.categorias.length * fila;
      const svg = svgBase(c, W, H, op.titulo);
      const ancho = W - m.l - m.r, bh = 20;
      op.categorias.forEach((cat, i) => {
        const vals = op.valores[i], total = vals.reduce((a, b) => a + b, 0) || 1;
        const yc = m.t + i * fila + fila / 2;
        texto(svg, m.l - 10, yc + 4, cat, { 'text-anchor': 'end', fill: T.tinta, 'font-size': 12, 'font-weight': 600 });
        let x0 = m.l;
        const visibles = vals.map((v, k) => ({ v, k })).filter(z => z.v > 0);
        visibles.forEach((z, j) => {
          const w = z.v / total * ancho - (j < visibles.length - 1 ? 2 : 0);
          const seg = op.segmentos[z.k];
          if (w > 0.5) {
            const r = j === visibles.length - 1 ? 4 : 0;
            el('path', { d: r ? barraH(x0, x0 + w, yc - bh / 2, bh, r) : `M${x0},${yc - bh / 2}h${w}v${bh}h${-w}Z`,
                         fill: seg.color }, svg);
            const etiqueta = Util.pct(z.v / total * 100, 0);
            if (w > etiqueta.length * 7 + 10) {
              texto(svg, x0 + w / 2, yc + 4, etiqueta, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700,
                    fill: seg.tinta || '#fff', class: 'g-num' });
            }
            const hit = el('rect', { x: x0, y: yc - fila / 2, width: Math.max(w, 1), height: fila, fill: 'transparent' }, svg);
            conTip(hit, `<b>${esc(cat)}</b><br><i class="tip-sw" style="background:${seg.color}"></i>${esc(seg.nombre)}: ${num(z.v)} (${Util.pct(z.v / total * 100)})`);
          }
          x0 += w + 2;
        });
      });
    });
  }

  // ── Dispersión ────────────────────────────────────────────────────────
  function dispersion(cont, op) {
    montar(cont, (c, W, T) => {
      leyenda(c, op.series.map(s => ({ nombre: s.nombre, color: s.color, forma: s.forma })));
      const H = op.alto || 360, m = { l: 46, r: 14, t: 14, b: 44 };
      const svg = svgBase(c, W, H, op.titulo);
      const xs = op.puntos.map(p => p.x), ys = op.puntos.map(p => p.y);
      if (op.refX) xs.push(op.refX.valor);
      if (op.refY) ys.push(op.refY.valor);
      const dx = op.dominioX || [0, Math.max(10, ...xs) * 1.08];
      const dy = op.dominioY || [Math.floor(Math.min(...ys) - 4), Math.ceil(Math.max(...ys) + 3)];
      const x = escala(dx[0], dx[1], m.l, W - m.r), y = escala(dy[0], dy[1], H - m.b, m.t);
      ejeY(svg, y, ticks(dy[0], dy[1], 5), m.l, W - m.r, T);
      for (const v of ticks(dx[0], dx[1], Math.max(3, Math.floor((W - m.l - m.r) / 70)))) {
        texto(svg, x(v), H - m.b + 18, compacto(v), { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
      }
      el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
      texto(svg, (m.l + W - m.r) / 2, H - 6, op.ejeX, { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 11 });
      texto(svg, 12, m.t + (H - m.t - m.b) / 2, op.ejeY, { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 11,
            transform: `rotate(-90 12 ${m.t + (H - m.t - m.b) / 2})` });
      if (op.refY) lineaObjetivo(svg, y, op.refY.valor, m.l, W - m.r, op.refY.etiqueta, T);
      if (op.refX) {
        const xr = x(op.refX.valor);
        el('line', { x1: xr, x2: xr, y1: m.t, y2: H - m.b, stroke: T.objetivo, 'stroke-width': 1.5,
                     'stroke-dasharray': '6 4', 'pointer-events': 'none' }, svg);
        texto(svg, xr + 4, m.t + 10, op.refX.etiqueta, { fill: T.tinta2, 'font-size': 11, 'font-weight': 600 });
      }
      const porSerie = Object.fromEntries(op.series.map(s => [s.nombre, s]));
      for (const p of op.puntos) {
        const s = porSerie[p.serie];
        const g = marca(svg, s.forma, x(p.x), y(p.y), 5, s.color, T.sup);
        if (p.hueco) g.firstChild.setAttribute('fill-opacity', '0.35');
        const hit = el('circle', { cx: x(p.x), cy: y(p.y), r: 11, fill: 'transparent' }, svg);
        conTip(hit, p.tip);
      }
    });
  }

  // ── Histograma con densidad y líneas de referencia ────────────────────
  function histograma(cont, op) {
    montar(cont, (c, W, T) => {
      const refs = (op.lineas || []).filter(l => l.valor != null);
      leyenda(c, [{ nombre: 'Evaluaciones', color: op.color }, { nombre: 'Densidad', color: op.colorLinea, forma: 'linea' }]
        .concat(refs.map(l => ({ nombre: l.etiqueta, color: l.color, forma: 'linea', punteada: l.punteada }))));
      const H = op.alto || 250, m = { l: 36, r: 12, t: 10, b: 30 };
      const svg = svgBase(c, W, H, op.titulo);
      const [d0, d1] = op.dominio, paso = op.paso || 5;
      const nb = Math.ceil((d1 - d0) / paso), cuentas = new Array(nb).fill(0);
      for (const v of op.valores) {
        const i = Math.min(nb - 1, Math.max(0, Math.floor((v - d0) / paso)));
        cuentas[i]++;
      }
      const tk = ticks(0, Math.max(1, ...cuentas), 4), top = Math.max(1, ...cuentas, tk[tk.length - 1]);
      const x = escala(d0, d1, m.l, W - m.r), y = escala(0, top, H - m.b, m.t);
      ejeY(svg, y, tk, m.l, W - m.r, T);
      const bw = x(d0 + paso) - x(d0);
      cuentas.forEach((n, i) => {
        if (n) el('path', { d: barraV(x(d0 + i * paso) + 1, y(0), y(n), Math.max(1, bw - 2), 3), fill: op.color, 'pointer-events': 'none' }, svg);
      });
      const k = Util.kde(op.valores, op.dominio, 120);
      if (k.length) {
        const escalaK = op.valores.length * paso;
        el('path', { d: 'M' + k.map(([v, d]) => `${x(v).toFixed(1)},${y(d * escalaK).toFixed(1)}`).join('L'),
                     fill: 'none', stroke: op.colorLinea, 'stroke-width': 2, 'stroke-linejoin': 'round',
                     'pointer-events': 'none' }, svg);
      }
      for (const l of refs) {
        el('line', { x1: x(l.valor), x2: x(l.valor), y1: m.t, y2: H - m.b, stroke: l.color, 'stroke-width': 1.5,
                     'stroke-dasharray': l.punteada ? '5 4' : null, 'pointer-events': 'none' }, svg);
      }
      for (const v of ticks(d0, d1, Math.max(4, Math.floor((W - m.l - m.r) / 60)))) {
        texto(svg, x(v), H - m.b + 18, num(v), { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
      }
      el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
      cuentas.forEach((n, i) => {
        const a = d0 + i * paso;
        const hit = el('rect', { x: x(a), y: m.t, width: bw, height: H - m.t - m.b, fill: 'transparent' }, svg);
        conTip(hit, `<b>${num(a)} – ${num(a + paso)}</b><br>${num(n)} evaluaciones (${Util.pct(op.valores.length ? n / op.valores.length * 100 : 0)})`);
      });
    });
  }

  // Escala divergente (rojo ← gris → azul) alrededor de un punto medio
  function colorDivergente(v, medio, lo, hi, oscuro) {
    if (v == null) return oscuro ? '#262624' : '#f0efec';
    const neutro = oscuro ? [56, 56, 53] : [240, 239, 236];
    const rojo = oscuro ? [230, 103, 103] : [208, 59, 59];
    const azul = oscuro ? [57, 135, 229] : [42, 120, 214];
    const t = v < medio ? Math.min(1, (medio - v) / ((medio - lo) || 1)) : Math.min(1, (v - medio) / ((hi - medio) || 1));
    const destino = v < medio ? rojo : azul;
    const mezcla = neutro.map((n, i) => Math.round(n + (destino[i] - n) * t));
    return `rgb(${mezcla.join(',')})`;
  }

  function tintaSobre(color) {
    const m = color.match(/\d+/g);
    if (!m) return '#111';
    const [r, g, b] = m.map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#111' : '#fff';
  }

  return { violin, lineas, columnasApiladas, barras, barras100, dispersion, histograma,
           colorDivergente, tintaSobre, Tip, conTip, marcaSvg, compacto };
})();
