/* Reporte ICE: pestaña ÉPICAS (antes ÉPICAS Preventa).
 *
 * Dos vistas, Preventa y Farmers, de las mismas bases que las tablas de
 * brigadistas; cada una cuenta solo las ÉPICAs de su grupo (preventa: claves
 * de ruta como TA1001; farmers: claves como TAF101).
 *   · Preventa: una sección por jefatura con dos tablas.
 *   · Farmers: una sola sección con las mismas dos tablas.
 * Las dos tablas:
 *   · Promedios del mes: ÉPICAs, calificación promedio, clientes P1 y P2 que
 *     faltan, NoGeo, posible falsificación de foto y tiempo entre ÉPICAs.
 *   · ÉPICAs por día: cuántas hizo cada día, en verde, amarillo o rojo según
 *     cuántos de sus clientes P1 y P2 de la frecuencia de ese día atendió. Solo
 *     en farmers: morado si además atendió a todos sus clientes cercanos de ese
 *     día (los de la vista Zona y clientes cercanos): trabajo extraordinario.
 * Un botón baja un ZIP con una carpeta por jefatura de preventa y la carpeta
 * Farmers, cada una con sus dos tablas en PNG (dibujadas aquí, con el estilo
 * de /generaavancechatszip).
 * Datos: payloads epicas_preventa_tab y epicas_farmers_tab (Programas/publica_ice.py,
 * _epicas_preventa y _epicas_farmers). */
const IcePreventa = (function () {
  'use strict';
  const { esc, num } = Util;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
                 'octubre', 'noviembre', 'diciembre'];
  const LETRA_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];   // getDay(): 0 = domingo
  const ROJO = '#F40000', NEGRO = '#000000', BLANCO = '#FFFFFF', GRIS_1 = '#F4F4F4', GRIS_2 = '#E6E6E6',
        GRIS_MARCA = '#C8C8C8', TINTA2 = '#4D4D4D', TINTA3 = '#6E6E6E', ROJO_TEXTO = '#C40000';
  // Color de cada día según sus P1 y P2 de la frecuencia de ese día (y, en farmers, sus cercanos)
  const ESTADOS = {
    v: { fondo: '#A8DDB1', nombre: 'Hizo ÉPICA a todos sus P1 y P2 del día' },
    a: { fondo: '#FFE07A', nombre: 'A una parte' },
    r: { fondo: '#F4A3A3', nombre: 'A ninguno' },
    m: { fondo: '#B994F0', nombre: 'Todos sus P1 y P2 del día y todos sus cercanos: trabajo extraordinario' },
  };
  // Lo que cambia entre las tablas de preventa y las de farmers
  const GRUPOS = {
    preventa: { col: 'Preventa', quien: 'preventa', sin: 'sin brigadistas ni farmers', morado: false,
                titulo: J => nombreJef(J.jefatura), total: J => totalJef(J.jefatura) },
    farmers: { col: 'Farmer', quien: 'farmers', sin: 'sin brigadistas ni preventa', morado: true,
               titulo: () => 'Farmers', total: () => 'Total farmers' },
  };
  const dec1 = v => v == null ? '—' : num(v, 1);
  const plural = (n, s, p) => `${num(n)} ${n === 1 ? s : (p || s + 's')}`;
  const partes = iso => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return { a, m, d }; };
  const fechaLarga = iso => { const { a, m, d } = partes(iso); return `${d} de ${MESES[m - 1]} de ${a}`; };
  const nombreJef = j => j === 'Sin jefatura' ? j : `Jefatura ${j}`;
  const totalJef = j => j === 'Sin jefatura' ? 'Total sin jefatura' : `Total jefatura ${j}`;
  // Día = [ÉPICAs, P1 y P2 hechos, asignados] y, en farmers, además [cercanos hechos, cercanos asignados]
  function estado([, hechos, asignados, hechosC, asignadosC], morado) {
    if (morado && asignadosC && hechosC >= asignadosC && hechos >= asignados) return 'm';
    return !asignados ? null : hechos >= asignados ? 'v' : hechos > 0 ? 'a' : 'r';
  }
  const estadosDe = G => Object.entries(ESTADOS).filter(([k]) => G.morado || k !== 'm').map(([, s]) => s);
  // Secciones de un grupo: las jefaturas de preventa o la única de farmers
  const secciones = (G, X) => G === GRUPOS.farmers ? [{ jefatura: 'Farmers', filas: X.filas, total: X.total }] : X.jefaturas;

  function tiempo(minutos) {
    if (minutos == null) return '—';
    const t = Math.round(minutos);
    return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')} min`;
  }

  // Días del mes (todos; los que pasan del corte van vacíos) con su letra
  function diasMes(D, P) {
    const ultimo = P.dias.length;
    return Array.from({ length: D.dias_mes }, (_, i) => {
      const f = new Date(D.anio, D.mes_num - 1, i + 1);
      return { d: i + 1, letra: LETRA_DIA[f.getDay()], domingo: f.getDay() === 0, futuro: i >= ultimo };
    });
  }

  function textoDia(x, fila, G) {
    if (!x) return '';
    const [n, h, a, hc, ac] = x;
    if (G.morado) {
      if (!fila || !fila.ruta) return plural(n, 'ÉPICA', 'ÉPICAs');
      return `${plural(n, 'ÉPICA', 'ÉPICAs')} · ${a ? `P1 y P2 de su recorrido: ${num(h)} de ${num(a)} con ÉPICA` : 'sin P1 ni P2 pendientes en su recorrido'}${ac ? ` · cercanos: ${num(hc)} de ${num(ac)} con ÉPICA` : ''}`;
    }
    return `${plural(n, 'ÉPICA', 'ÉPICAs')}${a ? ` · P1 y P2 del día: ${num(h)} de ${num(a)} con ÉPICA` : fila && fila.ruta ? ' · sin P1 ni P2 pendientes ese día' : ''}`;
  }

  // ── Tablas en la página ───────────────────────────────────────────────
  function filaPromedios(f, total) {
    const etiqueta = total ? `<th scope="row" class="izq">${esc(total)}</th>`
      : `<th scope="row" class="izq">${esc(f.clave)}${f.nota ? `<small class="pv-nota">${esc(f.nota)}</small>` : ''}</th>`;
    const rojo = v => v ? `<span class="pv-alerta">${num(v)}</span>` : '0';
    return `<tr>${etiqueta}<td>${dec1(f.promedio)}</td><td>${num(f.epicas)}</td>
      <td>${f.faltan == null ? '<span class="muted">—</span>' : `<b>${num(f.faltan)}</b> <span class="muted">de ${num(f.p12)}</span>`}</td>
      <td>${rojo(f.nogeo)}</td><td>${rojo(f.fdf)}</td>
      <td>${tiempo(f.minutos)}${f.intervalos ? ` <span class="muted">(${plural(f.intervalos, 'intervalo')})</span>` : ''}</td></tr>`;
  }

  function tablaPromedios(J, P, G) {
    return `<div class="tabla-scroll"><table class="ice-tabla tabla-pv">
      <thead><tr><th class="izq">${G.col}</th><th>Promedio ÉPICA</th><th>ÉPICAs del mes</th><th>Faltan P1 y P2</th>
        <th>NoGeo (más de ${num(P.no_geo_metros)} m)</th><th>Posible falsificación de foto</th><th>Tiempo promedio entre ÉPICAs</th></tr></thead>
      <tbody>${J.filas.map(f => filaPromedios(f)).join('')}</tbody>
      <tfoot>${filaPromedios(J.total, G.total(J))}</tfoot>
    </table></div>`;
  }

  function tablaDias(J, D, P, G) {
    const dias = diasMes(D, P);
    const cab = dias.map(x => `<th class="pv-dia${x.domingo ? ' dom' : ''}${x.futuro ? ' fut' : ''}">${x.d}<small>${x.letra}</small></th>`).join('');
    const celdas = f => dias.map((x, i) => {
      const v = f.dias[i], e = v && estado(v, G.morado);
      const clase = `pv-c${x.domingo ? ' dom' : ''}${e ? ' ' + e : ''}`;
      const texto = v && (v[0] || e) ? num(v[0]) : '';
      return `<td class="${clase}"${v ? ` title="${esc(`${x.d} de ${MESES[D.mes_num - 1]}: ${textoDia(v, f, G)}`)}"` : ''}>${texto}</td>`;
    }).join('');
    return `<div class="tabla-scroll"><table class="ice-tabla tabla-pv-dias">
      <thead><tr><th class="izq">${G.col}</th>${cab}<th>Total</th></tr></thead>
      <tbody>${J.filas.map(f => `<tr><th scope="row" class="izq">${esc(f.clave)}</th>${celdas(f)}<td><b>${num(f.epicas)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row" class="izq">${esc(G.total(J))}</th>${dias.map((x, i) => `<td class="pv-c${x.domingo ? ' dom' : ''}">${i < J.total.dias.length && J.total.dias[i] ? num(J.total.dias[i]) : ''}</td>`).join('')}<td>${num(J.total.epicas)}</td></tr></tfoot>
    </table></div>
    <div class="pv-leyenda">${estadosDe(G).map(s => `<span><i style="background:${s.fondo}"></i>${esc(s.nombre)}</span>`).join('')}
      <span><i class="vacio"></i>Sin P1 ni P2 pendientes ese día</span><span><i class="dom"></i>Domingo</span></div>`;
  }

  const kpi = (etiqueta, valor, sub, destacado) => `<div class="ice-kpi${destacado ? ' destacado' : ''}">
      <p class="kpi-etiqueta">${esc(etiqueta)}</p><p class="kpi-valor">${valor}</p><p class="kpi-sub">${sub}</p></div>`;

  function vistaPreventa(D, P) {
    if (!P.total) return `<p class="muted">No hay rutas de preventa ni ÉPICAs de preventa en la unidad.</p>`;
    const T = P.total, G = GRUPOS.preventa;
    return `
      <div class="ice-kpis">
        ${kpi('ÉPICAs del mes', num(T.epicas), `${num(T.con_epicas)} de ${plural(T.preventas, 'preventa')} con al menos una`, true)}
        ${kpi('Promedio ÉPICA', dec1(T.promedio), 'calificación de las ÉPICAs de preventa')}
        ${kpi('Faltan P1 y P2', `${num(T.faltan)}<small>/ ${num(T.p12)}</small>`, 'clientes prioridad 1 y 2 de las rutas sin ÉPICA de preventa en el mes')}
        ${kpi(`NoGeo (más de ${num(P.no_geo_metros)} m)`, num(T.nogeo), 'ÉPICAs cerradas lejos del cliente')}
        ${kpi('Posible falsificación de foto', num(T.fdf), 'ÉPICAs con foto de foto')}
        ${kpi('Tiempo entre ÉPICAs', tiempo(T.minutos), 'promedio entre ÉPICAs seguidas del mismo día')}
      </div>
      <p class="ice-nota">Solo ÉPICAs hechas por preventa (sus claves de ruta), de las mismas bases que las tablas de brigadistas; no cuentan las de brigadistas ni las de farmers. <b>Promedio ÉPICA</b>: calificación promedio de sus ÉPICAs del mes (las de 0 no cuentan, como en brigadistas). <b>Faltan P1 y P2</b>: clientes prioridad 1 y 2 de su ruta (con frecuencia de visita) que aún no tienen ÉPICA de preventa en ${esc(D.mes)}, de cuántos tiene. <b>NoGeo</b>: ÉPICAs cerradas a más de ${num(P.no_geo_metros)} m del cliente según la Master Data. <b>Posible falsificación de foto</b>: ÉPICAs con foto de foto («Picture of Picture») en la base de errores. <b>Tiempo promedio entre ÉPICAs</b>: entre una ÉPICA y la siguiente del mismo día; los días con una sola ÉPICA no cuentan. <b>ÉPICAs por día</b>: el número es el total de ÉPICAs del día (todos sus clientes) y el color depende de sus clientes P1 y P2 con frecuencia ese día que aún no tenían ÉPICA de preventa en el mes: verde si se la hizo a todos, amarillo si a una parte, rojo si a ninguno.</p>
      ${P.jefaturas.map((J, k) => `<section class="ice-seccion" id="pvJef${k}">
        <header class="ice-sec-cab"><div><h2>${esc(nombreJef(J.jefatura))}</h2>
          <p>${plural(J.filas.length, 'preventa')} · ${num(J.total.con_epicas)} con ÉPICAs en ${esc(D.mes)} · ${plural(J.total.epicas, 'ÉPICA', 'ÉPICAs')} · faltan ${num(J.total.faltan)} de ${num(J.total.p12)} P1 y P2</p></div></header>
        <figure><figcaption>Promedios del mes</figcaption>${tablaPromedios(J, P, G)}</figure>
        <figure class="pv-fig"><figcaption>ÉPICAs por día</figcaption>${tablaDias(J, D, P, G)}</figure>
      </section>`).join('')}`;
  }

  function vistaFarmers(D, F) {
    if (F === undefined) return '<p class="muted">Las tablas de farmers aparecen a partir de la siguiente publicación del sitio.</p>';
    if (!F) return '<p class="muted">No hay datos de farmers: la base de jefaturas no trae las columnas Farmer (ClaveFarmer y FrecuenciaFarmer). Se arreglan volviendo a cargar el Excel de OBJETIVOS con /addjefaturas.</p>';
    if (!F.total) return '<p class="muted">No hay farmers con recorrido ni ÉPICAs de farmers en la unidad.</p>';
    const T = F.total, G = GRUPOS.farmers, J = secciones(G, F)[0];
    return `
      <div class="ice-kpis">
        ${kpi('ÉPICAs del mes', num(T.epicas), `${num(T.con_epicas)} de ${plural(T.farmers, 'farmer')} con al menos una`, true)}
        ${kpi('Promedio ÉPICA', dec1(T.promedio), 'calificación de las ÉPICAs de farmers')}
        ${kpi('Faltan P1 y P2', `${num(T.faltan)}<small>/ ${num(T.p12)}</small>`, 'clientes prioridad 1 y 2 de los recorridos sin ÉPICA de farmer en el mes')}
        ${kpi(`NoGeo (más de ${num(F.no_geo_metros)} m)`, num(T.nogeo), 'ÉPICAs cerradas lejos del cliente')}
        ${kpi('Posible falsificación de foto', num(T.fdf), 'ÉPICAs con foto de foto')}
        ${kpi('Tiempo entre ÉPICAs', tiempo(T.minutos), 'promedio entre ÉPICAs seguidas del mismo día')}
        ${kpi('Días en morado', num(T.morados), 'su recorrido y todos sus cercanos del día: trabajo extraordinario')}
      </div>
      <p class="ice-nota">Solo ÉPICAs hechas por farmers (claves como TAF101), de las mismas bases que las tablas de brigadistas; no cuentan las de brigadistas ni las de preventa. Las columnas son las mismas que en preventa; <b>Faltan P1 y P2</b>: clientes prioridad 1 y 2 de su recorrido (ClaveFarmer, con FrecuenciaFarmer) que aún no tienen ÉPICA de farmer en ${esc(D.mes)}, de cuántos tiene. <b>ÉPICAs por día</b>: el número es el total de ÉPICAs del día y el color depende de sus clientes P1 y P2 de su recorrido de ese día que aún no tenían ÉPICA de farmer en el mes: verde si se la hizo a todos, amarillo si a una parte, rojo si a ninguno; <b>morado</b> si además se la hizo a todos sus clientes cercanos de ese día (los de la vista «Zona y clientes cercanos» de la pestaña Farmers, hasta ${num(F.max_cercanos)} por día, que no son de ningún recorrido de farmer y aún no tenían ICE del mes ese día): trabajo extraordinario.</p>
      <section class="ice-seccion" id="pvFarm">
        <header class="ice-sec-cab"><div><h2>Farmers</h2>
          <p>${plural(J.filas.length, 'farmer')} · ${num(T.con_epicas)} con ÉPICAs en ${esc(D.mes)} · ${plural(T.epicas, 'ÉPICA', 'ÉPICAs')} · faltan ${num(T.faltan)} de ${num(T.p12)} P1 y P2 · ${plural(T.morados, 'día', 'días')} en morado</p></div></header>
        <figure><figcaption>Promedios del mes</figcaption>${tablaPromedios(J, F, G)}</figure>
        <figure class="pv-fig"><figcaption>ÉPICAs por día</figcaption>${tablaDias(J, D, F, G)}</figure>
      </section>`;
  }

  function panel(cont, D) {
    const P = D.epicas_preventa_tab, F = D.epicas_farmers_tab;
    if (!P) { cont.innerHTML = '<p class="muted">Esta sección aparece a partir de la siguiente publicación del sitio.</p>'; return; }
    const corte = P.corte || (F && F.corte);
    if (!corte) { cont.innerHTML = `<p class="muted">Todavía no hay ÉPICAs de ${esc(D.mes)} en la base.</p>`; return; }
    const conFarmers = !!(F && F.total);
    cont.innerHTML = `
      <p class="canal-titulo">ÉPICAS <span class="muted">· ${esc(D.mes)} ${D.anio} · ÉPICAs al ${esc(fechaLarga(corte))}, ${esc(corte.slice(11))}</span></p>
      <div class="ice-descargas">
        <button type="button" class="ice-btn rojo" id="pvZip">Descargar ZIP con las tablas en PNG</button>
        <span>Una carpeta por jefatura de preventa${conFarmers ? ' y la carpeta <b>Farmers</b>' : ''}, cada una con dos imágenes: <b>promedios del mes</b> y <b>ÉPICAs por día</b>.</span>
      </div>
      <p class="mapa-ayuda" id="pvEstado" role="status" aria-live="polite"></p>
      <div class="segmento pv-vistas" id="pvVistas" role="group" aria-label="Tablas de la pestaña ÉPICAS">
        <button type="button" data-vista="preventa" aria-pressed="true">Preventa</button>
        <button type="button" data-vista="farmers" aria-pressed="false">Farmers</button>
      </div>
      <div id="pvVista-preventa">${vistaPreventa(D, P)}</div>
      <div id="pvVista-farmers" hidden>${vistaFarmers(D, F)}</div>`;
    $btn(cont, 'pvZip').addEventListener('click', e => descargarZip(D, e.currentTarget, $btn(cont, 'pvEstado')));
    $btn(cont, 'pvVistas').addEventListener('click', e => {
      const b = e.target.closest('[data-vista]');
      if (!b) return;
      for (const x of cont.querySelectorAll('#pvVistas [data-vista]')) {
        x.setAttribute('aria-pressed', x === b);
        $btn(cont, 'pvVista-' + x.dataset.vista).hidden = x !== b;
      }
    });
  }
  const $btn = (cont, id) => cont.querySelector('#' + id);

  // ── Imágenes PNG (estilo de /generaavancechatszip) ────────────────────
  const E = 2;                      // píxeles por punto: imágenes nítidas en el celular
  const FUENTE = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
  const CAB = 84, PIE = 50, MARGEN = 28, FILA = 40;

  // Renglones de un texto para un ancho dado (se mide antes de crear el lienzo)
  const medidor = document.createElement('canvas').getContext('2d');
  function renglonesImg(textoLargo, max, tam, peso = 500) {
    medidor.font = `${peso} ${tam}px ${FUENTE}`;
    const salida = [];
    let linea = '';
    for (const p of String(textoLargo).split(/\s+/)) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (linea && medidor.measureText(prueba).width > max) { salida.push(linea); linea = p; } else linea = prueba;
    }
    if (linea) salida.push(linea);
    return salida;
  }

  function lienzo(ancho, alto) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(ancho * E);
    c.height = Math.ceil(alto * E);
    const g = c.getContext('2d');
    g.scale(E, E);
    g.fillStyle = BLANCO;
    g.fillRect(0, 0, ancho, alto);
    return { c, g, ancho, alto };
  }

  function texto(g, x, y, t, { tam = 13, peso = 500, color = NEGRO, alinear = 'left', espaciado = 0, max = null } = {}) {
    g.font = `${peso} ${tam}px ${FUENTE}`;
    g.fillStyle = color;
    g.textAlign = alinear;
    if ('letterSpacing' in g) g.letterSpacing = `${espaciado}px`;
    let s = String(t);
    if (max != null && g.measureText(s).width > max) {
      while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
      s += '…';
    }
    g.fillText(s, x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }

  // Franja roja con el titular y pie con la línea fina del manual
  function marco(L, titulo, derecha1, derecha2) {
    const { g, ancho, alto } = L;
    g.fillStyle = ROJO;
    g.fillRect(0, 0, ancho, CAB);
    texto(g, MARGEN, 26, 'BRIGADAS VDM · ÉPICA', { tam: 10, peso: 600, color: BLANCO, espaciado: 3.2 });
    texto(g, MARGEN, 62, titulo.toUpperCase(), { tam: 26, peso: 800, color: BLANCO, max: ancho * 0.58 });
    texto(g, ancho - MARGEN, 46, derecha1, { tam: 13, peso: 700, color: BLANCO, alinear: 'right', max: ancho * 0.4 });
    texto(g, ancho - MARGEN, 66, derecha2, { tam: 11, peso: 500, color: BLANCO, alinear: 'right', max: ancho * 0.4 });
    g.fillStyle = '#8C8C8C';
    g.fillRect(MARGEN, alto - PIE + 14, ancho - 2 * MARGEN, 1);
    texto(g, MARGEN, alto - PIE + 34, 'BRIGADAS VDM · ÉPICA', { tam: 10, peso: 500, color: TINTA2, espaciado: 3.2 });
    texto(g, ancho - MARGEN, alto - PIE + 34, 'USO INTERNO', { tam: 10, peso: 500, color: TINTA2, alinear: 'right', espaciado: 3.2 });
  }

  // Título de sección con la barra roja y su subtítulo; devuelve la y de abajo
  function seccionImg(L, y, titulo, sub) {
    const { g } = L;
    g.fillStyle = ROJO;
    g.fillRect(MARGEN + 4, y, 6, 26);
    texto(g, MARGEN + 24, y + 20, titulo.toUpperCase(), { tam: 18, peso: 800 });
    texto(g, MARGEN + 24, y + 46, sub, { tam: 13, peso: 500, color: TINTA2, max: L.ancho - 2 * MARGEN - 30 });
    g.fillStyle = GRIS_MARCA;
    g.fillRect(MARGEN, y + 58, L.ancho - 2 * MARGEN, 1);
    return y + 66;
  }

  function rayado(g, x, y, w, h) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = '#F2F0EC';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#D9D4CC';
    g.lineWidth = 1.2;
    for (let k = -h; k < w; k += 7) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
    g.restore();
  }

  // Tabla: columnas [{titulo (\n = dos renglones), ancho, alinear}]; filas
  // [{celdas: [{t, sub, peso, color, fondo, rayado}], total}]. Devuelve la y de abajo
  function tablaImg(L, x0, y, columnas, filas, { cabAlto = 50, cabezaCol = null } = {}) {
    const { g } = L, ancho = columnas.reduce((a, c) => a + c.ancho, 0);
    let x = x0;
    columnas.forEach((c, j) => {
      if (c.rayado) rayado(g, x, y, c.ancho, cabAlto);
      if (cabezaCol) cabezaCol(g, c, x, y, cabAlto, j);
      else {
        const lineas = c.titulo.split('\n'), cx = c.alinear === 'left' ? x + 12 : x + c.ancho / 2;
        lineas.forEach((t, k) => texto(g, cx, y + cabAlto / 2 + 4 + (k - (lineas.length - 1) / 2) * 13, t.toUpperCase(),
          { tam: 10.5, peso: 700, alinear: c.alinear === 'left' ? 'left' : 'center', espaciado: 1.2, max: c.ancho - 10 }));
      }
      x += c.ancho;
    });
    g.fillStyle = NEGRO;
    g.fillRect(x0, y + cabAlto - 2, ancho, 2);
    let yy = y + cabAlto;
    filas.forEach((f, i) => {
      if (f.total) { g.fillStyle = NEGRO; g.fillRect(x0, yy, ancho, 2); }
      else if (i % 2) { g.fillStyle = GRIS_1; g.fillRect(x0, yy, ancho, FILA); }
      let xx = x0;
      columnas.forEach((c, j) => {
        const v = f.celdas[j] || {};
        if (v.rayado) rayado(g, xx, yy + (f.total ? 2 : 0), c.ancho, FILA - (f.total ? 2 : 0));
        if (v.fondo) { g.fillStyle = v.fondo; g.fillRect(xx + 1, yy + 1, c.ancho - 2, FILA - 2); }
        const cx = c.alinear === 'left' ? xx + 12 : c.alinear === 'right' ? xx + c.ancho - 12 : xx + c.ancho / 2;
        if (v.sub) {
          texto(g, cx, yy + 17, v.t, { tam: 14, peso: v.peso || (f.total ? 800 : 700), color: v.color || NEGRO, alinear: c.alinear || 'center', max: c.ancho - 16 });
          texto(g, cx, yy + 32, v.sub, { tam: 10.5, peso: 600, color: TINTA3, alinear: c.alinear || 'center', max: c.ancho - 16 });
        } else {
          texto(g, cx, yy + 26, v.t == null ? '' : v.t, { tam: 14, peso: v.peso || (f.total ? 800 : 700), color: v.color || NEGRO, alinear: c.alinear || 'center', max: c.ancho - 16 });
        }
        xx += c.ancho;
      });
      g.fillStyle = GRIS_2;
      g.fillRect(x0, yy + FILA - 1, ancho, 1);
      yy += FILA;
    });
    // Líneas entre columnas
    g.fillStyle = GRIS_MARCA;
    x = x0;
    columnas.forEach((c, j) => { if (j) g.fillRect(x, y + 8, 1, yy - y - 8); x += c.ancho; });
    return yy;
  }

  function derecha(D, P, G) {
    return [`ÉPICAs al ${fechaLarga(P.corte)} · generado el ${D.generado.slice(8, 10)}/${D.generado.slice(5, 7)}/${D.generado.slice(0, 4)} ${D.generado.slice(11)}`,
            `Unidad ${D.unidad} · ÉPICAs de ${G.quien} (${G.sin})`];
  }

  function pngPromedios(J, D, P, G) {
    const columnas = [{ titulo: G.col, ancho: 190, alinear: 'left' }, { titulo: 'Promedio\nÉPICA', ancho: 120 },
                      { titulo: 'ÉPICAs\ndel mes', ancho: 110 }, { titulo: 'Faltan\nP1 y P2', ancho: 130 },
                      { titulo: `NoGeo\n(más de ${P.no_geo_metros} m)`, ancho: 130 }, { titulo: 'Posible falsificación\nde foto', ancho: 190 },
                      { titulo: 'Tiempo promedio\nentre ÉPICAs', ancho: 190 }];
    const fila = (f, total) => ({ total: !!total, celdas: [
      total ? { t: total, peso: 800 } : { t: f.clave, sub: f.nota || null },
      { t: dec1(f.promedio) }, { t: num(f.epicas) },
      f.faltan == null ? { t: '—', color: TINTA3 } : { t: num(f.faltan), sub: `de ${num(f.p12)}` },
      { t: num(f.nogeo), color: f.nogeo ? ROJO_TEXTO : NEGRO }, { t: num(f.fdf), color: f.fdf ? ROJO_TEXTO : NEGRO },
      { t: tiempo(f.minutos), sub: f.intervalos ? plural(f.intervalos, 'intervalo') : null }] });
    const filas = J.filas.map(f => fila(f)).concat([fila(J.total, G.total(J))]);
    const anchoTabla = columnas.reduce((a, c) => a + c.ancho, 0), ancho = anchoTabla + 2 * MARGEN;
    const notas = [G.morado
      ? 'Promedio ÉPICA: calificación promedio de sus ÉPICAs del mes (las de 0 no cuentan). Faltan P1 y P2: clientes prioridad 1 y 2 de su recorrido sin ÉPICA de farmer en el mes, de cuántos tiene.'
      : 'Promedio ÉPICA: calificación promedio de sus ÉPICAs del mes (las de 0 no cuentan). Faltan P1 y P2: clientes prioridad 1 y 2 de su ruta sin ÉPICA de preventa en el mes, de cuántos tiene.',
                   `NoGeo: cierre a más de ${P.no_geo_metros} m del cliente según la Master Data. Posible falsificación de foto: foto de foto en la base de errores. Tiempo: entre ÉPICAs seguidas del mismo día; los días con una sola no cuentan.`];
    const renglones = notas.flatMap(n => renglonesImg(n, ancho - 2 * MARGEN, 11.5));
    const alto = CAB + 40 + 66 + 50 + filas.length * FILA + 30 + renglones.length * 18 + PIE + 10;
    const L = lienzo(ancho, alto);
    const [d1, d2] = derecha(D, P, G);
    marco(L, `${G.titulo(J)} · ÉPICAs de ${G.quien}`, d1, d2);
    let y = seccionImg(L, CAB + 40, 'Promedios del mes', `${plural(J.filas.length, G.morado ? 'farmer' : 'preventa')} · ${num(J.total.con_epicas)} con ÉPICAs en ${D.mes} · faltan ${num(J.total.faltan)} de ${num(J.total.p12)} clientes P1 y P2`);
    y = tablaImg(L, MARGEN, y, columnas, filas);
    renglones.forEach((n, k) => texto(L.g, MARGEN, y + 30 + k * 18, n, { tam: 11.5, color: TINTA3 }));
    return L.c;
  }

  function pngDias(J, D, P, G) {
    const dias = diasMes(D, P), AN = 44;
    const columnas = [{ titulo: G.col, ancho: 170, alinear: 'left' },
                      ...dias.map(x => ({ titulo: String(x.d), ancho: AN, dia: x, rayado: x.domingo })),
                      { titulo: 'Total', ancho: 90 }];
    const celdasDe = (valores, totalFila) => [
      ...dias.map((x, i) => {
        const v = valores[i];
        if (x.domingo) return { rayado: true, t: v && (Array.isArray(v) ? v[0] : v) ? num(Array.isArray(v) ? v[0] : v) : '' };
        if (v == null) return { t: '' };
        if (!Array.isArray(v)) return { t: v ? num(v) : '' };
        const e = estado(v, G.morado);
        return { t: v[0] || e ? num(v[0]) : '', fondo: e ? ESTADOS[e].fondo : null };
      }), { t: num(totalFila), peso: 800 }];
    const filas = J.filas.map(f => ({ celdas: [{ t: f.clave, sub: f.nota || null }, ...celdasDe(f.dias, f.epicas)] }))
      .concat([{ total: true, celdas: [{ t: G.total(J), peso: 800 }, ...celdasDe(J.total.dias, J.total.epicas)] }]);
    const anchoTabla = columnas.reduce((a, c) => a + c.ancho, 0), ancho = anchoTabla + 2 * MARGEN;
    const nota = renglonesImg(G.morado
      ? 'El número es el total de ÉPICAs del día. Verde: hizo ÉPICA a todos sus P1 y P2 de su recorrido de ese día; amarillo: a una parte; rojo: a ninguno; morado: a todos ellos y también a todos sus clientes cercanos de ese día (vista Zona y clientes cercanos de la pestaña Farmers): trabajo extraordinario.'
      : 'El número es el total de ÉPICAs del día (todos sus clientes). Verde: hizo ÉPICA a todos sus P1 y P2 de ese día; amarillo: a una parte; rojo: a ninguno.', ancho - 2 * MARGEN, 11.5);
    // Leyenda en renglones que caben en el ancho de la imagen
    const items = [...estadosDe(G), { fondo: null, nombre: 'Sin P1 ni P2 pendientes ese día' }, { dom: true, nombre: 'Domingo' }];
    medidor.font = `500 12.5px ${FUENTE}`;
    const leyenda = [[]];
    let ocupado = 0;
    for (const s of items) {
      const w = 24 + medidor.measureText(s.nombre).width + 26;
      if (leyenda[leyenda.length - 1].length && MARGEN + ocupado + w - 26 > ancho - MARGEN) { leyenda.push([]); ocupado = 0; }
      leyenda[leyenda.length - 1].push(s);
      ocupado += w;
    }
    const extraLeyenda = (leyenda.length - 1) * 24;
    const alto = CAB + 40 + 66 + 50 + filas.length * FILA + 34 + extraLeyenda + 10 + nota.length * 18 + 18 + PIE + 10;
    const L = lienzo(ancho, alto);
    const [d1, d2] = derecha(D, P, G);
    marco(L, `${G.titulo(J)} · ÉPICAs por día`, d1, d2);
    let y = seccionImg(L, CAB + 40, 'ÉPICAs por día', G.morado
      ? `ÉPICAs de cada farmer por día de ${D.mes}. El color depende de sus clientes P1 y P2 de su recorrido de ese día y de sus clientes cercanos que aún no tenían ÉPICA de farmer en el mes.`
      : `ÉPICAs de cada preventa por día de ${D.mes}. El color depende de sus clientes P1 y P2 con frecuencia ese día que aún no tenían ÉPICA de preventa en el mes.`);
    y = tablaImg(L, MARGEN, y, columnas, filas, {
      cabezaCol: (g, c, x, yy, h) => {
        if (!c.dia) {
          texto(g, c.alinear === 'left' ? x + 12 : x + c.ancho / 2, yy + h / 2 + 4, c.titulo.toUpperCase(),
            { tam: 10.5, peso: 700, alinear: c.alinear === 'left' ? 'left' : 'center', espaciado: 1.2 });
          return;
        }
        const color = c.dia.futuro ? '#9A9A9A' : NEGRO;
        texto(g, x + c.ancho / 2, yy + 22, c.titulo, { tam: 14, peso: 700, color, alinear: 'center' });
        texto(g, x + c.ancho / 2, yy + 38, c.dia.letra, { tam: 10.5, peso: 600, color: c.dia.futuro ? '#B0B0B0' : TINTA3, alinear: 'center' });
      },
    });
    // Leyenda
    const { g } = L;
    y += 34;
    leyenda.forEach((renglon, k) => {
      let x = MARGEN;
      if (k) y += 24;
      for (const s of renglon) {
        if (s.dom) rayado(g, x, y - 12, 16, 16);
        else { g.fillStyle = s.fondo || BLANCO; g.fillRect(x, y - 12, 16, 16); g.strokeStyle = GRIS_MARCA; g.lineWidth = 1; g.strokeRect(x + 0.5, y - 11.5, 15, 15); }
        texto(g, x + 24, y + 1, s.nombre, { tam: 12.5, color: TINTA2 });
        g.font = `500 12.5px ${FUENTE}`;
        x += 24 + g.measureText(s.nombre).width + 26;
      }
    });
    nota.forEach((n, k) => texto(g, MARGEN, y + 28 + k * 18, n, { tam: 11.5, color: TINTA3 }));
    return L.c;
  }

  const aPng = lienzoPng => new Promise((ok, mal) => lienzoPng.toBlob(b => b ? b.arrayBuffer().then(a => ok(new Uint8Array(a)), mal) : mal(new Error('No se pudo crear el PNG')), 'image/png'));
  const limpio = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_');

  // [{nombre, datos}] de las imágenes: una carpeta por jefatura de preventa y la carpeta Farmers
  async function imagenes(D) {
    const P = D.epicas_preventa_tab, F = D.epicas_farmers_tab;
    try { await Promise.all([800, 700, 600, 500].map(p => document.fonts.load(`${p} 16px Montserrat`))); } catch (e) { /* sin la fuente: la del sistema */ }
    const corte = P.corte || F.corte;
    const raiz = `EPICAS_${limpio(D.unidad)}_${corte.slice(0, 10)}`, salida = [];
    let carpetas = 0;
    for (const [G, X] of [[GRUPOS.preventa, P], [GRUPOS.farmers, F]]) {
      if (!X || !X.total) continue;
      for (const J of secciones(G, X)) {
        const carpeta = `${raiz}/${limpio(G.titulo(J))}`, j = limpio(J.jefatura);
        salida.push({ nombre: `${carpeta}/1_Promedios_${j}.png`, datos: await aPng(pngPromedios(J, D, X, G)) });
        salida.push({ nombre: `${carpeta}/2_EPICAS_por_dia_${j}.png`, datos: await aPng(pngDias(J, D, X, G)) });
        carpetas++;
      }
    }
    return { raiz, salida, carpetas };
  }

  async function descargarZip(D, boton, aviso) {
    boton.disabled = true;
    aviso.textContent = 'Dibujando las tablas...';
    try {
      const { raiz, salida, carpetas } = await imagenes(D);
      Archivos.descargar(await Archivos.zip(salida), `${raiz}.zip`);
      aviso.textContent = `ZIP listo: ${plural(carpetas, 'carpeta')}, ${plural(salida.length, 'imagen', 'imágenes')}. Revisa tus descargas.`;
    } catch (err) {
      console.error(err);
      aviso.textContent = 'No se pudo armar el ZIP.';
    } finally {
      boton.disabled = false;
    }
  }

  return { panel, imagenes };
})();
