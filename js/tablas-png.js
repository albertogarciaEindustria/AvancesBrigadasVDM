/* Tablas de las rutas de Preventa y de Farmers en PNG (ZIP de js/ice.js: carpeta
 * Tablas_PNG de cada jefatura), con el estilo de las tablas de ÉPICAS.
 *
 * Cada imagen sale de un «modelo» con puros datos (textos, colores y filas), así
 * se puede dibujar en la página o en un Web Worker (js/tablas-trabajador.js), que
 * carga este mismo archivo: aquí no se usa el DOM salvo en hacer().
 *
 * Cómo se hacen (medido el 2026-11-23): lo que más tarda es comprimir el PNG, no
 * dibujar. Con datos reales (Tlalpan, Preventa de hoy, 56 rutas) el ZIP completo
 * tarda ~0.8–0.9 s con Web Workers (dibujo y compresión en otros hilos) y ~1.8–2.2 s
 * dibujando en la página; con «Incluir no ICE» (71 tablas largas) ~2.1–2.4 s contra
 * ~6.1–7.0 s. La GPU casi no cambia nada (5–10 %): dibuja más rápido, pero hay que
 * bajar la imagen a la memoria para comprimirla, y la compresión es de CPU. Un
 * codificador propio en C++ (g++ con zlib) tarda 54–190 ms por imagen en un hilo,
 * más que el del navegador (~25 ms, que también es C++), y en WebAssembly sería aún
 * más lento: por eso van workers con el codificador del navegador y lienzo por
 * software. Las imágenes salen idénticas byte por byte en workers, en la página, con
 * GPU o sin ella. Si el navegador no tiene workers con OffscreenCanvas, si un worker
 * falla o no puede cargar Montserrat, esas tablas se dibujan en la página.
 *
 * Modelo: {marca, titulo, derecha1, derecha2, pie, tipos, leyenda, notas, secciones}. Secciones:
 *   tabla:   {titulo, sub, columnas: [{titulo, ancho, alinear}], filas, vacio}
 *   qr:      {tipo: 'qr', titulo, sub, tarjetas: [{tipo, cercano, nombre, sap, qr: {n, filas: ['0101…']} | null}]}
 *   semanas: {tipo: 'semanas', titulo, sub, filas: [{sap, nombre, semana, negrita, gris}]} (dos bloques)
 * Celda: texto o número, {texto, negrita, color, fondo} o {tipo} (insignia P1, P2...). */
const TablasPng = (function () {
  'use strict';
  const FUENTE = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
  // Montserrat (fuente variable: un archivo para todos los pesos) para los workers, que no
  // ven las fuentes de la página; son las mismas URL que da fonts.googleapis.com
  const FUENTES = [
    ['https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
     'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
    ['https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2',
     'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'],
  ];
  const E = 2;                         // píxeles por punto: nítidas en el celular
  const AREA_MAX = 16777216;           // tope de lienzo de Safari en iPhone: si no cabe, baja la escala
  const ROJO = '#F40000', NEGRO = '#000000', BLANCO = '#FFFFFF', GRIS = '#8C8C8C', GRIS_1 = '#F4F4F4', GRIS_2 = '#E6E6E6',
        GRIS_MARCA = '#C8C8C8', TINTA2 = '#4D4D4D', TINTA3 = '#6E6E6E';
  const MARGEN = 28, CAB = 84, PIE = 50, FILA = 30, CAB_TABLA = 38, RENGLON = 17;
  const QR_COLUMNAS = 3, QR_ALTO = 150, QR_SEP = 12;               // tarjetas de ubicación
  const SEM_SEP = 24, SEM_SAP = 112, SEM_SEMANA = 200;              // semanas de P3: dos bloques

  const nuevoLienzo = (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  // Lienzo por software: medido más rápido que el de GPU para dibujar y luego comprimir
  const contexto = c => c.getContext('2d', { willReadFrequently: true });
  let medidor = null;

  function fuente(g, tam, peso) { g.font = `${peso} ${tam}px ${FUENTE}`; }

  // Recorta con «…» para que quepa en max (búsqueda binaria: pocas mediciones)
  function recortar(g, s, max) {
    if (max == null || g.measureText(s).width <= max) return s;
    let a = 0, b = s.length;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (g.measureText(s.slice(0, m).trimEnd() + '…').width <= max) a = m; else b = m - 1;
    }
    return s.slice(0, a).trimEnd() + '…';
  }

  function texto(g, x, y, t, { tam = 13, peso = 500, color = NEGRO, alinear = 'left', espaciado = 0, max = null } = {}) {
    fuente(g, tam, peso);
    g.fillStyle = color;
    g.textAlign = alinear;
    if (espaciado && 'letterSpacing' in g) g.letterSpacing = `${espaciado}px`;
    g.fillText(recortar(g, String(t == null ? '' : t), max), x, y);
    if (espaciado && 'letterSpacing' in g) g.letterSpacing = '0px';
  }

  function renglones(g, largo, max, tam, peso = 500) {
    fuente(g, tam, peso);
    const salida = [];
    let linea = '';
    for (const p of String(largo || '').split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (linea && g.measureText(prueba).width > max) { salida.push(linea); linea = p; } else linea = prueba;
    }
    if (linea) salida.push(linea);
    return salida;
  }

  function insignia(g, x, y, tipo, tipos) {
    const s = tipos[tipo] || {};
    if (s.relleno) {
      g.beginPath();
      g.arc(x + 7, y - 4.5, 6.2, 0, 2 * Math.PI);
      g.fillStyle = s.relleno;
      g.fill();
      g.lineWidth = tipo >= 3 ? 1.6 : 1;
      g.strokeStyle = s.borde || s.relleno;
      g.stroke();
    }
    texto(g, x + (s.relleno ? 19 : 0), y, s.corto || '', { tam: 12, peso: 700 });
  }

  // Alto y renglones de todo (se mide antes de crear el lienzo)
  function plano(M) {
    if (!medidor) medidor = contexto(nuevoLienzo(1, 1));
    const g = medidor;
    const anchoTabla = Math.max(...M.secciones.filter(s => !s.tipo).map(s => s.columnas.reduce((a, c) => a + c.ancho, 0)));
    const ancho = anchoTabla + 2 * MARGEN, util = ancho - 2 * MARGEN;
    let alto = CAB + 26;
    const secciones = M.secciones.map(s => {
      const sub = renglones(g, s.sub, util - 24, 13);
      const cuerpo = s.tipo === 'qr' ? Math.ceil(s.tarjetas.length / QR_COLUMNAS) * (QR_ALTO + QR_SEP) - QR_SEP
        : s.tipo === 'semanas' ? CAB_TABLA + Math.ceil(s.filas.length / 2) * FILA
        : s.filas.length ? CAB_TABLA + s.filas.length * FILA : 40;
      const h = 34 + sub.length * 18 + 12 + cuerpo + 26;
      alto += h;
      return { ...s, subRenglones: sub, alto: h };
    });
    const leyenda = (M.leyenda || []).map(l => ({ ...l, renglones: renglones(g, l.texto, util - 50, 11.5) }));
    const notas = (M.notas || []).flatMap(n => renglones(g, n, util, 11.5));
    alto += leyenda.reduce((a, l) => a + l.renglones.length * RENGLON + 6, leyenda.length ? 24 : 0);
    alto += notas.length ? 8 + notas.length * RENGLON : 0;
    alto += 16 + PIE;
    return { ancho, alto: Math.ceil(alto), secciones, leyenda, notas };
  }

  function tabla(g, x0, y, columnas, filas, tipos) {
    const ancho = columnas.reduce((a, c) => a + c.ancho, 0);
    let x = x0;
    for (const c of columnas) {
      const der = c.alinear === 'der';
      texto(g, der ? x + c.ancho - 10 : x + 10, y + 24, c.titulo.toUpperCase(),
        { tam: 10, peso: 700, color: TINTA2, alinear: der ? 'right' : 'left', espaciado: 1, max: c.ancho - 14 });
      x += c.ancho;
    }
    g.fillStyle = NEGRO;
    g.fillRect(x0, y + CAB_TABLA - 2, ancho, 2);
    let yy = y + CAB_TABLA;
    filas.forEach((f, i) => {
      if (i % 2) { g.fillStyle = GRIS_1; g.fillRect(x0, yy, ancho, FILA); }
      let xx = x0;
      columnas.forEach((c, j) => {
        const v = f[j], der = c.alinear === 'der';
        if (v && v.tipo != null) insignia(g, xx + 10, yy + 20, v.tipo, tipos);
        else {
          const t = v && typeof v === 'object' ? v : { texto: v };
          if (t.fondo) { g.fillStyle = t.fondo; g.fillRect(xx, yy, c.ancho, FILA); }
          texto(g, der ? xx + c.ancho - 10 : xx + 10, yy + 20, t.texto, { tam: 13, peso: t.negrita ? 700 : 500, color: t.color || NEGRO,
            alinear: der ? 'right' : 'left', max: c.ancho - 16 });
        }
        xx += c.ancho;
      });
      g.fillStyle = GRIS_2;
      g.fillRect(x0, yy + FILA - 1, ancho, 1);
      yy += FILA;
    });
    return yy;
  }

  // QR en píxeles reales del lienzo (módulos enteros, sin rayas entre ellos) con su zona blanca
  // de 4 módulos, centrado en un cuadro de `lado` puntos
  function dibujarQr(g, x, y, lado, qr, escala) {
    const n = qr.n, total = n + 8, px = Math.max(1, Math.floor(lado * escala / total));
    const ox = Math.round((x + (lado - px * total / escala) / 2) * escala), oy = Math.round((y + (lado - px * total / escala) / 2) * escala);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BLANCO;
    g.fillRect(ox, oy, px * total, px * total);
    g.fillStyle = NEGRO;
    qr.filas.forEach((f, r) => {
      for (let c = 0; c < n;) {
        if (f[c] !== '1') { c++; continue; }
        let k = c;
        while (k < n && f[k] === '1') k++;
        g.fillRect(ox + (c + 4) * px, oy + (r + 4) * px, (k - c) * px, px);
        c = k;
      }
    });
    g.restore();
  }

  // Ubicación: una tarjeta por cliente con su QR (abre su ubicación en Google Maps), tipo, nombre y SAP
  function tarjetasQr(g, x0, y, util, tarjetas, tipos, escala) {
    const w = (util - (QR_COLUMNAS - 1) * QR_SEP) / QR_COLUMNAS, lado = QR_ALTO - 16;
    tarjetas.forEach((t, k) => {
      const x = x0 + (k % QR_COLUMNAS) * (w + QR_SEP), yy = y + Math.floor(k / QR_COLUMNAS) * (QR_ALTO + QR_SEP);
      g.strokeStyle = GRIS_MARCA;
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, yy + 0.5, w - 1, QR_ALTO - 1);
      if (t.qr) dibujarQr(g, x + 8, yy + 8, lado, t.qr, escala);
      else {
        g.fillStyle = GRIS_1;
        g.fillRect(x + 8, yy + 8, lado, lado);
        texto(g, x + 8 + lado / 2, yy + 8 + lado / 2 - 4, 'Sin', { tam: 12, color: TINTA2, alinear: 'center' });
        texto(g, x + 8 + lado / 2, yy + 8 + lado / 2 + 12, 'coordenadas', { tam: 12, color: TINTA2, alinear: 'center' });
      }
      const tx = x + lado + 20, tw = w - lado - 28;
      insignia(g, tx, yy + 28, t.tipo, tipos);
      if (t.cercano) texto(g, tx + 50, yy + 28, 'CERCANO', { tam: 11, peso: 800, color: ROJO, espaciado: 0.5 });
      const nombre = renglones(g, t.nombre, tw, 14, 700);
      nombre.slice(0, 3).forEach((r, i) => {
        const resto = i === 2 && nombre.length > 3 ? nombre.slice(2).join(' ') : r;
        texto(g, tx, yy + 56 + i * 19, resto, { tam: 14, peso: 700, max: tw });
      });
      texto(g, tx, yy + QR_ALTO - 16, `SAP ${t.sap}`, { tam: 13, color: NEGRO, max: tw });
    });
  }

  // Semanas de P3: dos bloques lado a lado (primero se llena el izquierdo); en negritas los de la
  // semana de la fecha de la hoja
  function semanas(g, x0, y, util, filas) {
    const w = (util - SEM_SEP) / 2, cols = [['SAP', SEM_SAP], ['Cliente', w - SEM_SAP - SEM_SEMANA], ['Semana más evaluada', SEM_SEMANA]];
    const mitad = Math.ceil(filas.length / 2);
    [filas.slice(0, mitad), filas.slice(mitad)].forEach((bloque, b) => {
      if (!bloque.length) return;
      const xb = x0 + b * (w + SEM_SEP);
      let x = xb;
      for (const [titulo, a] of cols) {
        texto(g, x + 10, y + 24, titulo.toUpperCase(), { tam: 10, peso: 700, color: TINTA2, espaciado: 1, max: a - 14 });
        x += a;
      }
      g.fillStyle = NEGRO;
      g.fillRect(xb, y + CAB_TABLA - 2, w, 2);
      let yy = y + CAB_TABLA;
      bloque.forEach((f, i) => {
        if (i % 2) { g.fillStyle = GRIS_1; g.fillRect(xb, yy, w, FILA); }
        let xc = xb;
        [f.sap, f.nombre, f.semana].forEach((v, j) => {
          texto(g, xc + 10, yy + 20, v, { tam: 13, peso: f.negrita ? 700 : 500, color: f.gris && j === 2 ? TINTA3 : NEGRO, max: cols[j][1] - 16 });
          xc += cols[j][1];
        });
        g.fillStyle = GRIS_2;
        g.fillRect(xb, yy + FILA - 1, w, 1);
        yy += FILA;
      });
    });
  }

  /** Dibuja el modelo en un lienzo nuevo (OffscreenCanvas si hay) y lo devuelve. */
  function dibujar(M) {
    const P = plano(M);
    const escala = Math.max(1, Math.min(E, Math.sqrt(AREA_MAX / (P.ancho * P.alto))));
    const c = nuevoLienzo(Math.ceil(P.ancho * escala), Math.ceil(P.alto * escala));
    const g = contexto(c), { ancho, alto } = P;
    g.scale(escala, escala);
    g.fillStyle = BLANCO;
    g.fillRect(0, 0, ancho, alto);
    // Franja roja con el titular
    g.fillStyle = ROJO;
    g.fillRect(0, 0, ancho, CAB);
    texto(g, MARGEN, 26, M.marca, { tam: 10, peso: 600, color: BLANCO, espaciado: 3.2, max: ancho * 0.62 });
    texto(g, MARGEN, 64, M.titulo, { tam: 28, peso: 800, color: BLANCO, max: ancho * 0.5 });
    texto(g, ancho - MARGEN, 46, M.derecha1, { tam: 15, peso: 800, color: BLANCO, alinear: 'right', max: ancho * 0.45 });
    texto(g, ancho - MARGEN, 66, M.derecha2, { tam: 12, peso: 500, color: BLANCO, alinear: 'right', max: ancho * 0.45 });
    let y = CAB + 26;
    for (const s of P.secciones) {
      g.fillStyle = ROJO;
      g.fillRect(MARGEN, y, 6, 24);
      texto(g, MARGEN + 18, y + 19, s.titulo.toUpperCase(), { tam: 17, peso: 800, max: ancho - 2 * MARGEN - 20 });
      s.subRenglones.forEach((r, k) => texto(g, MARGEN + 18, y + 44 + k * 18, r, { tam: 13, color: TINTA2 }));
      let yy = y + 34 + s.subRenglones.length * 18 + 12;
      if (s.tipo === 'qr') tarjetasQr(g, MARGEN, yy, ancho - 2 * MARGEN, s.tarjetas, M.tipos, escala);
      else if (s.tipo === 'semanas') semanas(g, MARGEN, yy, ancho - 2 * MARGEN, s.filas);
      else if (s.filas.length) tabla(g, MARGEN, yy, s.columnas, s.filas, M.tipos);
      else {
        g.fillStyle = GRIS_1;
        g.fillRect(MARGEN, yy, ancho - 2 * MARGEN, 34);
        texto(g, MARGEN + 12, yy + 22, s.vacio || '', { tam: 13, peso: 700, max: ancho - 2 * MARGEN - 24 });
      }
      y += s.alto;
    }
    // Qué es cada tipo de cliente y notas
    if (P.leyenda.length) {
      g.fillStyle = GRIS_MARCA;
      g.fillRect(MARGEN, y - 6, ancho - 2 * MARGEN, 1);
      y += 18;
      for (const l of P.leyenda) {
        insignia(g, MARGEN, y, l.tipo, M.tipos);
        l.renglones.forEach((r, k) => texto(g, MARGEN + 50, y + k * RENGLON, r, { tam: 11.5, color: TINTA2 }));
        y += l.renglones.length * RENGLON + 6;
      }
    }
    if (P.notas.length) {
      y += 8;
      P.notas.forEach((r, k) => texto(g, MARGEN, y + k * RENGLON, r, { tam: 11.5, color: TINTA3 }));
    }
    // Pie con la línea fina del manual
    g.fillStyle = GRIS;
    g.fillRect(MARGEN, alto - PIE + 14, ancho - 2 * MARGEN, 1);
    const [izq, der] = M.pie || [];
    texto(g, MARGEN, alto - PIE + 34, izq, { tam: 10, color: TINTA2, espaciado: 2.4, max: ancho * 0.7 });
    texto(g, ancho - MARGEN, alto - PIE + 34, der, { tam: 10, color: TINTA2, alinear: 'right', espaciado: 2.4 });
    return c;
  }

  async function aBytes(c) {
    const b = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' })
      : await new Promise((ok, mal) => c.toBlob(x => x ? ok(x) : mal(new Error('No se pudo crear el PNG')), 'image/png'));
    return new Uint8Array(await b.arrayBuffer());
  }

  /** Bytes del PNG de un modelo. */
  const png = M => aBytes(dibujar(M));

  // ── En la página: reparte los modelos entre workers ────────────────────
  // Cada worker tiene un lienzo de hasta ~64 MB más lo de la compresión: con 15 en una máquina
  // con 1.8 GB libres las tablas largas tardaron más de 2 minutos (memoria llena); 4 a 8 dan casi
  // lo mismo. Tope 6 y, si el navegador dice su memoria (Chrome, Android), uno por GB.
  const MAX_TRABAJADORES = 6;
  const URL_TRABAJADOR = typeof document !== 'undefined' && document.currentScript
    ? document.currentScript.src.replace(/tablas-png\.js/, 'tablas-trabajador.js') : null;

  function puedeTrabajadores() {
    try {
      return !!(URL_TRABAJADOR && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' &&
                OffscreenCanvas.prototype.convertToBlob && new OffscreenCanvas(1, 1).getContext('2d'));
    } catch (e) { return false; }
  }

  /** PNG (Uint8Array) de cada modelo, en el mismo orden. alAvanzar(hechos, total).
   *  Devuelve {pngs, trabajadores, enPagina}. */
  async function hacer(modelos, alAvanzar = () => {}) {
    const pngs = new Array(modelos.length), sobran = [];
    let hechos = 0, trabajadores = 0;
    const listo = (i, datos) => { pngs[i] = datos; alAvanzar(++hechos, modelos.length); };
    if (modelos.length && puedeTrabajadores()) {
      let conFuente = false;
      try { conFuente = !!document.fonts && await document.fonts.load('700 16px Montserrat').then(l => l.length > 0); } catch (e) { /* sin la fuente */ }
      const n = Math.max(1, Math.min(modelos.length, MAX_TRABAJADORES, (navigator.hardwareConcurrency || 2) - 1,
                                     navigator.deviceMemory ? Math.floor(navigator.deviceMemory) : MAX_TRABAJADORES));
      let sig = 0;
      const uno = () => new Promise(fin => {
        let w;
        try { w = new Worker(URL_TRABAJADOR); } catch (e) { fin(); return; }
        trabajadores++;
        let actual = -1;
        const otro = () => {
          if (sig >= modelos.length) { w.terminate(); fin(); return; }
          actual = sig++;
          w.postMessage({ id: actual, modelo: modelos[actual] });
        };
        // Si el worker falla, lo suyo se dibuja en la página
        const falla = e => { if (e && e.preventDefault) e.preventDefault(); if (actual >= 0) sobran.push(actual); w.terminate(); fin(); };
        w.onmessage = e => {
          // Sin Montserrat en el worker (y la página sí la tiene): se dibuja en la página para que todas se vean igual
          if (e.data.error || e.data.id !== actual || (conFuente && !e.data.fuente)) { falla(); return; }
          listo(actual, e.data.datos);
          otro();
        };
        w.onerror = falla;
        otro();
      });
      await Promise.all(Array.from({ length: n }, uno));
      for (let i = sig; i < modelos.length; i++) sobran.push(i);     // si no arrancó ningún worker
    } else sobran.push(...modelos.keys());
    if (sobran.length) {
      if (typeof document !== 'undefined' && document.fonts) {
        try { await Promise.all([500, 600, 700, 800].map(p => document.fonts.load(`${p} 16px Montserrat`))); } catch (e) { /* la del sistema */ }
      }
      for (const i of sobran.sort((a, b) => a - b)) listo(i, await png(modelos[i]));
    }
    return { pngs, trabajadores, enPagina: sobran.length };
  }

  return { png, hacer, dibujar, FUENTES };
})();
