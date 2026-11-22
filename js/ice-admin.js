/* Administrador del sitio ICE (ice.html): análisis de todas las unidades
 * operativas a la vez. Entra un usuario con "admin": true de
 * BaseDeDatos/ICEaccesoWeb.JSON; su sobre trae la llave de estos datos y la de
 * cada unidad, así que también puede abrir cualquier unidad.
 *
 *   · Traditional y On Premise: una pestaña por canal con el comparativo de
 *     las unidades del mes, diagramas de violín (de la calificación ICE o de
 *     una submétrica), barras con el promedio de cada unidad, el ranking de
 *     unidades por trabajo ICE (WIce, el método de la integral de los rankings
 *     de jefaturas y rutas) y, abajo, el ANOVA de un factor (grupos =
 *     unidades) con sus pruebas de respaldo y las comparaciones por pares
 *     (t de Welch y Dunn, con Holm) para describir en qué difieren.
 *   · Submétricas: por canal, la lista de la calificación ICE y sus
 *     submétricas (con su símbolo); al elegir una, la gráfica de líneas de cómo
 *     fue cambiando cada unidad en el periodo y cómo va cada una en sus
 *     tiendas; abajo, el mapa de calor de ventaja contra las demás unidades.
 *   · Polígonos: temas (jefaturas, zonas ICE recurrentes de los últimos meses,
 *     zonas que más restan y pérdida por submétrica) con su KMZ cada uno.
 *   · Prioridad 1: mapa de los clientes prioridad 1 de todas las unidades.
 *
 * Los cálculos vienen hechos de Programas/admin_ice.py y publica_ice.py. */
const IceAdmin = (function () {
  'use strict';
  const { esc, num } = Util;
  const A = Graficas.aux;
  const $ = id => document.getElementById(id);
  const ROJO = '#F40000', NEGRO = '#000000', BLANCO = '#FFFFFF', GRIS = '#8C8C8C';
  // Un color por unidad (el rojo queda para los polígonos ICE)
  const COLOR_UNIDAD = ['#111111', '#2F5BD0', '#4E9A2A', '#E8B500', '#9B30C9', '#8B5A3C', '#0FA3A3', '#D6408E'];
  const NIVELES = { 50: 'Núcleo', 75: 'Zona alta', 90: 'Zona amplia' };
  const NIVELES_PERDIDA = { 50: 'Foco', 75: 'Zona de pérdida', 90: 'Zona amplia' };
  const RELLENO = { 50: 0.42, 75: 0.24, 90: 0.12 }, GROSOR = { 50: 2.4, 75: 1.6, 90: 1.2 };
  const TACTIL = window.matchMedia('(pointer: coarse)').matches;

  let D = null, OP = null, mapaPol = null, mapaP = null, PESTANAS = [];
  const estado = { periodo: 'mes', ver: {}, canal: null, metrica: {}, serie: 'acumulado' };
  const color = u => COLOR_UNIDAD[D.unidades.indexOf(u) % COLOR_UNIDAD.length];
  const plural = (n, s, p) => `${num(n)} ${n === 1 ? s : (p || s + 's')}`;
  const signo = (v, dec = 1) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), dec)}`;
  const valorP = p => p == null ? '—' : p < 0.0001 ? `< 0.0001 <span class="muted">(${p.toExponential(1).replace(/e-?(\d+)/, ' × 10<sup>−$1</sup>')})</span>` : num(p, 4);
  const periodo = () => D.periodos.find(p => p.id === estado.periodo) || D.periodos[0];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fecha = iso => { const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return d ? `${d} ${MESES[m - 1]} ${a}` : '—'; };
  const fechaCorta = iso => { const [, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return d ? `${d} ${MESES[m - 1]}` : '—'; };
  const fila = (k, v) => v == null || v === '' ? '' : `<dt>${esc(k)}</dt><dd>${v}</dd>`;
  const icono = id => Ice.util.svgIcono(id);
  const colorMetrica = i => Ice.util.COLOR_METRICA[D.metricas[i].id] || NEGRO;
  const partePct = (n, total) => total ? `${num(n / total * 100, 0)} %` : '—';
  const dec1 = v => v == null ? '—' : num(v, 1);
  // Promedio a 1 decimal (tal como se ve) debajo del umbral del canal (85 Traditional, 90 On Premise)
  const esBajo = (v, umbral) => umbral != null && v != null && Number(num(v, 1).replace(/,/g, '')) < umbral;
  const umbralDe = canal => (D.umbral || {})[canal];
  const nombreCanal = canal => canal === 'Traditional' ? 'Traditional (Home Market)' : canal;

  function seccion(titulo, sub, cuerpo) {
    return `<section class="ice-seccion">
      <header class="ice-sec-cab"><div><h2>${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>
      ${cuerpo}
    </section>`;
  }

  function kpi(etiqueta, valor, sub, destacado) {
    return `<div class="ice-kpi${destacado ? ' destacado' : ''}"><p class="kpi-etiqueta">${esc(etiqueta)}</p>
      <p class="kpi-valor">${valor}</p><p class="kpi-sub">${sub}</p></div>`;
  }

  function flecha(delta) {
    if (delta == null) return '';
    const r = Number(Number(delta).toFixed(1));
    if (r === 0) return '<span class="delta igual" title="Sin cambio contra el corte anterior">=</span>';
    return `<span class="delta ${r > 0 ? 'mejor' : 'peor'}" title="${r > 0 ? 'Subió' : 'Bajó'} ${num(Math.abs(r), 1)} contra el corte anterior">${r > 0 ? '▲' : '▼'} ${num(Math.abs(r), 1)}</span>`;
  }

  function segmento(id, opciones, actual, etiqueta, clase = '') {
    return `<div class="segmento${clase ? ' ' + clase : ''}" id="${id}" role="group" aria-label="${esc(etiqueta)}">${opciones.map(([v, t]) =>
      `<button type="button" data-valor="${esc(v)}" aria-pressed="${String(v) === String(actual)}">${t}</button>`).join('')}</div>`;
  }

  function alElegir(id, hacer) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      hacer(b.dataset.valor);
    });
  }

  const opcionesPeriodo = () => D.periodos.map(p => [p.id, esc(p.nombre)]);
  // Submétricas que trae un canal (en Traditional no hay Activación)
  const metricasDe = canal => {
    const G = (periodo().analisis[canal] || {}).grupos || [];
    return D.metricas.map((m, i) => ({ ...m, i })).filter(m => G.some(g => (g.metricas || [])[m.i] && g.metricas[m.i].some(v => v != null)));
  };
  const nombreVer = v => v === 'ice' ? 'calificación ICE' : D.metricas[+v].nombre;
  const valoresDe = (g, v) => v === 'ice' ? g.puntos.map(p => p[2]) : ((g.metricas || [])[+v] || []).filter(x => x != null);
  const media = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  // ── Página ────────────────────────────────────────────────────────────
  function render(datos, opciones) {
    D = datos;
    OP = opciones;
    estado.canal = D.canales[0];
    PESTANAS = [['info', 'Información del sistema'], ...D.canales.map((c, k) => [`canal${k}`, c]), ['submetricas', 'Submétricas'],
                ['poligonos', 'Polígonos'], ['p1', 'Mapa prioridad 1']];
    mostrar();
  }

  function mostrar() {
    for (const m of [mapaPol, mapaP]) if (m) m.remove();
    mapaPol = mapaP = null;
    document.body.className = 'ice-modo-reporte';
    $('iceAcceso').hidden = true;
    const v = $('iceVista'), c = D.corte;
    v.hidden = false;
    v.innerHTML = `
      <header class="ice-cab">
        <div>
          <p class="ice-kicker">Reporte ICE · Administrador · ${esc(D.mes)} ${D.anio}</p>
          <h1>Todas las unidades.</h1>
          <p class="ice-cab-sub">${c ? `Corte al <b>${esc(c.texto)}</b> · encuestas hasta el ${esc(fecha(c.encuestas_hasta))}` : `Sin evaluaciones ICE de ${esc(D.mes)} todavía`} · publicado ${esc(D.generado)}</p>
        </div>
        <div class="ice-cab-acciones">
          <a class="ice-btn sec" href="index.html">Inicio</a>
          <button type="button" class="ice-btn" data-accion="salir">Salir</button>
        </div>
      </header>
      <div class="adm-unidades" id="admUnidades" role="group" aria-label="Abrir el reporte de una unidad">
        <span class="poli-rutas-tit">Abrir unidad:</span>
        ${OP.unidades.map(u => `<button type="button" class="chip" data-unidad="${esc(u)}"><span class="adm-sw" style="background:${color(u)}" aria-hidden="true"></span>${esc(u)}</button>`).join('')}
        <span class="adm-estado" id="admEstado" role="status" aria-live="polite"></span>
      </div>
      <nav class="ice-pestanas" role="tablist" aria-label="Secciones del administrador">
        ${PESTANAS.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="p-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''} data-pestana="${id}">${esc(t)}</button>`).join('')}
      </nav>
      ${PESTANAS.map(([id], i) => `<div class="ice-panel${id === 'poligonos' || id === 'p1' ? ' ice-panel-mapa' : ''}" id="p-${id}" role="tabpanel" aria-labelledby="tab-${id}"${i ? ' hidden' : ''}></div>`).join('')}
      <footer class="ice-pie"><span>Brigadas VDM · ICE · Administrador</span><span>Uso interno</span></footer>`;
    v.querySelector('[data-accion="salir"]').addEventListener('click', () => location.reload());
    $('admUnidades').addEventListener('click', async e => {
      const b = e.target.closest('[data-unidad]');
      if (!b) return;
      const aviso = $('admEstado');
      aviso.textContent = `Descifrando ${b.dataset.unidad}...`;
      try {
        await OP.abrir(b.dataset.unidad);
      } catch (err) {
        console.error(err);
        aviso.textContent = `No se pudo abrir ${b.dataset.unidad}; revisa tu conexión.`;
      }
    });
    const tabs = [...v.querySelectorAll('[role="tab"]')];
    tabs.forEach(t => {
      t.addEventListener('click', () => pestana(t.dataset.pestana));
      t.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const j = (tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        tabs[j].focus();
        pestana(tabs[j].dataset.pestana);
      });
    });
    $('p-info').innerHTML = IceExtra.htmlInfo(D);
    window.scrollTo(0, 0);
  }

  function pestana(cual) {
    for (const t of document.querySelectorAll('.ice-pestanas [role="tab"]')) {
      const activa = t.dataset.pestana === cual;
      t.setAttribute('aria-selected', activa);
      t.tabIndex = activa ? 0 : -1;
    }
    for (const [p] of PESTANAS) $('p-' + p).hidden = p !== cual;
    Graficas.Tip.hide();
    if (cual.startsWith('canal')) panelCanal(+cual.slice(5));
    if (cual === 'submetricas') submetricas();
    if (cual === 'poligonos') poligonos();
    if (cual === 'p1') prioridad1();
  }

  // ── Pestañas Traditional y On Premise ─────────────────────────────────
  function panelCanal(k) {
    const canal = D.canales[k], panel = $(`p-canal${k}`);
    const filas = D.resumen.map(r => ({ r, c: r.por_canal.find(x => x.canal === canal) || {}, p1: (r.p1_canal || {})[canal] || [0, 0] }));
    const orden = [...filas].sort((a, b) => (b.c.promedio == null ? -1 : b.c.promedio) - (a.c.promedio == null ? -1 : a.c.promedio));
    const con = orden.filter(x => x.c.promedio != null);
    const G = ((D.periodos[0].analisis[canal] || {}).global) || {};
    const ant = D.resumen[0].mes_anterior.mes;
    const tabla = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th>#</th><th class="izq">Unidad</th><th>ICE de ${esc(D.mes)}</th><th>Evaluaciones</th><th>Mediana</th>
        <th>Estimación de cierre</th><th>${esc(ant)}</th><th>P1 evaluados</th></tr></thead>
      <tbody>${orden.map(({ r, c, p1 }, i) => `<tr>
        <td>${c.promedio == null ? '—' : i + 1}</td>
        <th class="izq"><span class="adm-sw" style="background:${color(r.unidad)}" aria-hidden="true"></span>${esc(r.unidad)}</th>
        <td><b>${num(c.promedio, 1)}</b> ${flecha(c.d_promedio)}</td><td>${num(c.n || 0)}</td><td>${num(c.mediana, 1)}</td>
        <td>${c.estimacion ? `<b>${num(c.estimacion.valor, 1)}</b> <span class="muted">(${num(c.estimacion.bajo, 1)}–${num(c.estimacion.alto, 1)})</span>` : '—'}</td>
        <td>${num(c.mes_anterior, 1)} <span class="muted">(${num(c.n_mes_anterior || 0)})</span></td>
        <td>${num(p1[0])} / ${num(p1[1])}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><th class="izq">Todas las unidades</th><td>${num(G.media, 1)}</td><td>${num(G.n || 0)}</td><td>${num(G.mediana, 1)}</td>
        <td></td><td></td><td>${num(filas.reduce((a, x) => a + x.p1[0], 0))} / ${num(filas.reduce((a, x) => a + x.p1[1], 0))}</td></tr></tfoot>
    </table></div>`;
    panel.innerHTML = `
      <div class="ice-kpis">
        ${kpi(`ICE de ${D.mes} · ${canal}`, num(G.media, 1), `${plural(G.n || 0, 'evaluación', 'evaluaciones')} de todas las unidades · mediana ${num(G.mediana, 1)}`, true)}
        ${con.length ? kpi('Unidad más alta', esc(con[0].r.unidad), `ICE ${num(con[0].c.promedio, 1)} · ${plural(con[0].c.n, 'evaluación', 'evaluaciones')}`) : ''}
        ${con.length > 1 ? kpi('Unidad más baja', esc(con[con.length - 1].r.unidad), `ICE ${num(con[con.length - 1].c.promedio, 1)} · ${plural(con[con.length - 1].c.n, 'evaluación', 'evaluaciones')}`) : ''}
        ${con.length > 1 ? kpi('Brecha entre unidades', num(con[0].c.promedio - con[con.length - 1].c.promedio, 1), 'puntos entre la más alta y la más baja') : ''}
      </div>
      ${seccion(`Comparativo de unidades · ${nombreCanal(canal)}`, `Calificación ICE de ${esc(D.mes)} al corte, solo evaluaciones de ${esc(canal)}, de mayor a menor. Entre paréntesis, las evaluaciones del mes anterior; la estimación de cierre trae su rango probable y P1 evaluados son los clientes prioridad 1 de ${esc(canal)} ya evaluados en el mes.`, tabla)}
      ${seccion('Distribución, promedios y ranking', `Elige el periodo: el violín, las barras, el ranking y el ANOVA de abajo se calculan con las evaluaciones de ${esc(canal)} de ese periodo.`,
        `<div class="adm-controles">${segmento(`admPeriodo${k}`, opcionesPeriodo(), estado.periodo, 'Periodo')}</div>
         <div id="admCanal${k}"></div>`)}`;
    alElegir(`admPeriodo${k}`, v => { estado.periodo = v; cuerpoCanal(k); });
    cuerpoCanal(k);
  }

  function cuerpoCanal(k) {
    const canal = D.canales[k], P = periodo(), An = P.analisis[canal], cont = $(`admCanal${k}`);
    if (!An || !An.grupos.length) { cont.innerHTML = `<p class="adm-nota">No hay evaluaciones de ${esc(canal)} en ${esc(P.nombre)}.</p>`; return; }
    const mets = metricasDe(canal);
    if (estado.ver[canal] == null || (estado.ver[canal] !== 'ice' && !mets.some(m => String(m.i) === String(estado.ver[canal])))) estado.ver[canal] = 'ice';
    const opciones = [['ice', 'Calificación ICE'], ...mets.map(m => [m.i, `<span class="icono-metrica" aria-hidden="true">${icono(m.id)}</span>${esc(m.nombre)}`])];
    const u = umbralDe(canal);
    cont.innerHTML = `
      <h3 class="adm-sub">Qué se compara en el violín y las barras</h3>
      ${segmento(`admVer${k}`, opciones, estado.ver[canal], 'Calificación que se compara', 'adm-ver')}
      <div id="admVerCuerpo${k}"></div>
      <h3 class="adm-sub">Ranking de unidades por trabajo ICE (WIce) · ${esc(P.nombre)}</h3>
      <p class="adm-nota">El mismo método de la integral de los rankings de jefaturas y rutas: el trabajo de cada unidad es el <b>área bajo el polígono que une las calificaciones ICE de sus evaluaciones de ${esc(canal)}</b>, una tras otra por fecha; cada evaluación ocupa un ancho de 1, así que el área es la suma de sus calificaciones. Suma más la unidad que evalúa más clientes y mejor calificados. Al lado, su promedio${u != null ? ` (en rojo si está debajo de ${num(u)})` : ''}. ${TACTIL ? 'Toca' : 'Haz clic en'} una unidad para ver su gráfica.</p>
      <p class="rk-leyenda"><span>Menos trabajo</span><i aria-hidden="true"></i><span>Más trabajo</span></p>
      ${tablaRanking(An.ranking, canal, k)}
      <div class="rk-grafica" id="admIntegral${k}" aria-live="polite"><p class="muted">${TACTIL ? 'Toca' : 'Haz clic en'} una unidad del ranking para ver la gráfica de su trabajo.</p></div>
      <h3 class="adm-sub">ANOVA de un factor · grupos = unidades operativas · ${esc(canal)}, ${esc(P.nombre)}</h3>
      ${htmlAnova(An, canal)}`;
    alElegir(`admVer${k}`, v => { estado.ver[canal] = v; graficasVer(k); });
    graficasVer(k);
    cont.querySelectorAll('tr[data-rk]').forEach(tr => {
      const elegir = () => {
        cont.querySelectorAll('tr[data-rk]').forEach(x => x.classList.toggle('rk-sel', x === tr));
        const f = An.ranking[+tr.dataset.rk], g = An.grupos.find(x => x.unidad === f.unidad);
        graficaIntegral($(`admIntegral${k}`), f, g.puntos, `${f.unidad} · ${canal}`, u, P.nombre);
      };
      tr.addEventListener('click', elegir);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
    });
  }

  // Violín y barras de lo elegido (calificación ICE o una submétrica)
  function graficasVer(k) {
    const canal = D.canales[k], P = periodo(), An = P.analisis[canal], v = estado.ver[canal], esIce = v === 'ice';
    const nombre = nombreVer(v), sufijo = esIce ? '' : ' %';
    const series = An.grupos.map(g => ({ nombre: g.unidad, valores: valoresDe(g, v), color: color(g.unidad) })).filter(s => s.valores.length);
    const todos = series.flatMap(s => s.valores), global = media(todos);
    const cont = $(`admVerCuerpo${k}`);
    cont.innerHTML = `
      <h3 class="adm-sub">Diagrama de violín · ${esc(nombre)}</h3>
      <p class="adm-nota">Cada violín es la densidad de ${esIce ? 'las calificaciones ICE' : `el cumplimiento de ${esc(nombre.toLowerCase())} (%)`} de una unidad en ${esc(canal)} (kernel gaussiano) y cada punto una evaluación. Caja = Q1–Q3, círculo = mediana, línea = media, bigotes = 1.5 × RIC. La línea punteada es la media de todas las unidades.</p>
      <div class="g-scroll"><div class="grafica" id="admViolin${k}"></div></div>
      <h3 class="adm-sub">Promedio de cada unidad · ${esc(nombre)}</h3>
      <div class="grafica" id="admBarras${k}"></div>
      <p class="adm-nota">Barra = promedio de ${esIce ? 'la calificación ICE' : `${esc(nombre.toLowerCase())} (%)`}; la raya negra, su mediana; la línea punteada, el promedio de todas las unidades. ${TACTIL ? 'Toca' : 'Pasa el cursor sobre'} una barra para ver su intervalo de confianza.</p>`;
    if (!todos.length) { $(`admViolin${k}`).innerHTML = '<p class="muted">Sin datos.</p>'; return; }
    const lo = esIce ? Math.floor(Math.min(...todos) / 10) * 10 : 0, hi = esIce ? Math.max(Math.ceil((Math.max(...todos) + 2) / 10) * 10, lo + 10) : 100;
    Graficas.violin($(`admViolin${k}`), {
      titulo: `Distribución de ${nombre} por unidad, ${canal}, ${P.nombre}`, dominio: [lo, hi], alto: 440,
      minAncho: Math.max(560, series.length * 130), series,
      objetivo: { valor: global, etiqueta: `Media de todas ${num(global, 1)}${sufijo}` },
    });
    const est = series.map(s => ({ s, st: Util.estadisticas(s.valores) })).sort((a, b) => b.st.media - a.st.media);
    Graficas.barras($(`admBarras${k}`), {
      titulo: `Promedio de ${nombre} por unidad, ${canal}`, max: esIce ? Math.max(110, ...est.map(x => x.st.media)) : 100,
      anchoEtiqueta: 140, margenDerecho: 130, altoFila: 38,
      referencia: { valor: global, etiqueta: `Todas ${num(global, 1)}${sufijo}` },
      filas: est.map(({ s, st }) => ({
        etiqueta: s.nombre, valor: st.media, color: s.color, marca: st.mediana, texto: `${num(st.media, 1)}${sufijo} · n ${num(st.n)}`,
        tip: `<b>${esc(s.nombre)} · ${esc(nombre)}</b><table class="tip-tabla"><tr><td>Promedio</td><td>${num(st.media, 2)}${sufijo}</td></tr>
          <tr><td>IC 95 %</td><td>${st.ic ? `${num(st.ic[0], 1)} a ${num(st.ic[1], 1)}` : '—'}</td></tr><tr><td>Mediana</td><td>${num(st.mediana, 1)}</td></tr>
          <tr><td>Evaluaciones</td><td>${num(st.n)}</td></tr><tr><td>Contra todas</td><td>${signo(st.media - global, 1)}</td></tr></table>` })),
    });
  }

  function tablaRanking(filas, canal, k) {
    if (!filas.length) return '<p class="muted">Sin evaluaciones.</p>';
    const calor = Ice.util.calorRanking(filas, 'wice'), u = umbralDe(canal);
    return `<div class="tabla-scroll ranking-scroll adm-ranking"><table class="ice-tabla tabla-ranking">
      <thead><tr><th class="rk-pos">#</th><th class="izq">Unidad</th>
        <th class="rk-wice" title="Área bajo el polígono de las calificaciones de sus evaluaciones"><span class="rk-integral" aria-hidden="true">∫</span><span class="rk-fx">f(x)</span> Trabajo (<span class="rk-fx">WIce</span>)</th>
        <th>Promedio ICE</th><th>Evaluaciones</th><th>Clientes evaluados</th></tr></thead>
      <tbody>${filas.map((f, i) => `<tr class="rk-fila" data-rk="${i}" tabindex="0" aria-label="Ver la gráfica de ${esc(f.unidad)}">
        <td class="rk-pos">${num(f.pos)}</td><th scope="row" class="izq"><span class="adm-sw" style="background:${color(f.unidad)}" aria-hidden="true"></span>${esc(f.unidad)}</th>
        <td class="rk-valor" style="background:${calor[i].fondo};color:${calor[i].tinta}">${dec1(f.wice)}</td>
        <td${esBajo(f.promedio, u) ? ' class="rk-bajo"' : ''}>${dec1(f.promedio)}</td><td>${num(f.n)}</td><td>${num(f.clientes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  // Gráfica del trabajo de una unidad: sus evaluaciones una tras otra (por fecha), el
  // polígono que une sus calificaciones y una barra por evaluación (su franja del área)
  function graficaIntegral(cont, f, P, titulo, umbral, nombrePeriodo) {
    const n = P.length;
    cont.innerHTML = `<div class="rk-graf-cab"><h3 class="ice-subtitulo">${esc(titulo)}</h3>
        <p><span class="rk-integral" aria-hidden="true">∫</span>f(x) Trabajo (WIce) <b>${dec1(f.wice)}</b> · promedio ICE <b${esBajo(f.promedio, umbral) ? ' class="rk-bajo"' : ''}>${dec1(f.promedio)}</b> · ${plural(n, 'evaluación', 'evaluaciones')} de ${plural(f.clientes, 'cliente', 'clientes')} · ${esc(nombrePeriodo)} · lugar ${num(f.pos)}</p></div>
      <div class="grafica"></div>
      <p class="mapa-ayuda">Cada punto es una evaluación (en orden de fecha) con su calificación ICE; el polígono rojo los une. Cada barra es la franja del área de una evaluación; todas juntas suman el trabajo (WIce), igual a la suma de las calificaciones.${umbral != null ? ` Puntos en rojo: debajo de ${num(umbral)}.` : ''}</p>`;
    const g = cont.querySelector('.grafica');
    if (!n) { g.innerHTML = '<p class="muted">Sin evaluaciones.</p>'; return; }
    const ys = P.map(p => p[2] == null ? 0 : p[2]);
    A.montar(g, (c, W, T) => {
      const H = 320, m = { l: 40, r: 14, t: 20, b: 40 };
      const svg = A.svgBase(c, W, H, `Trabajo ICE de ${titulo}`);
      const hi = Math.max(110, Math.ceil(Math.max(...ys) / 10) * 10);
      const y = A.escala(0, hi, H - m.b, m.t), x = A.escala(0, n, m.l, W - m.r);
      A.ejeY(svg, y, A.ticks(0, hi, 5), m.l, W - m.r, T);
      const h = i => i <= 0 ? ys[0] : i >= n ? ys[n - 1] : (ys[i - 1] + ys[i]) / 2;
      const fino = (W - m.l - m.r) / n < 6;
      ys.forEach((v, i) => {
        const d = `M${x(i)},${y(0)}L${x(i)},${y(h(i))}L${x(i + 0.5)},${y(v)}L${x(i + 1)},${y(h(i + 1))}L${x(i + 1)},${y(0)}Z`;
        const barra = A.el('path', { d, fill: i % 2 ? '#F6AFAF' : '#FBD0D0', stroke: BLANCO, 'stroke-width': fino ? 0 : 1 }, svg);
        Graficas.conTip(barra, () => `<b>Evaluación ${num(i + 1)} de ${num(n)}</b><table class="tip-tabla">
          <tr><td>SAP</td><td>${esc(P[i][0])}</td></tr><tr><td>Evaluado</td><td>${esc(fecha(P[i][1]))}</td></tr><tr><td>ICE</td><td>${dec1(P[i][2])}</td></tr>
          <tr><td>Su franja del área</td><td>${dec1((h(i) + 2 * v + h(i + 1)) / 4)}</td></tr></table>`);
      });
      let linea = `M${x(0)},${y(ys[0])}`;
      ys.forEach((v, i) => { linea += `L${x(i + 0.5)},${y(v)}`; });
      linea += `L${x(n)},${y(ys[n - 1])}`;
      A.el('path', { d: linea, fill: 'none', stroke: ROJO, 'stroke-width': n > 300 ? 1.2 : 2, 'stroke-linejoin': 'round', 'pointer-events': 'none' }, svg);
      if (umbral != null) A.lineaObjetivo(svg, y, umbral, m.l, W - m.r, `Debajo de ${umbral}`, T);
      const r = n > 300 ? 1.4 : n > 80 ? 2 : n > 30 ? 3 : 4;
      ys.forEach((v, i) => A.el('circle', { cx: x(i + 0.5), cy: y(v), r, fill: esBajo(v, umbral) ? ROJO : NEGRO, stroke: BLANCO, 'stroke-width': r > 2 ? 1.5 : 0, 'pointer-events': 'none' }, svg));
      A.el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: T.eje, 'stroke-width': 1 }, svg);
      const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 34))));
      for (let i = 0; i < n; i += cada) A.texto(svg, x(i + 0.5), H - m.b + 16, num(i + 1), { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
      A.texto(svg, (m.l + W - m.r) / 2, H - 6, 'Evaluaciones, en orden de fecha', { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 11, 'font-weight': 600 });
      const cx = (m.l + W - m.r) / 2, cy = y(Math.min(...ys) / 2) + 4;
      const fondo = A.el('rect', { x: cx - 92, y: cy - 30, width: 184, height: 46, fill: BLANCO, 'fill-opacity': 0.92, stroke: NEGRO, 'stroke-width': 1.5, 'pointer-events': 'none' }, svg);
      const total = A.texto(svg, cx, cy - 2, `∫ = ${dec1(f.wice)}`, { 'text-anchor': 'middle', fill: NEGRO, 'font-size': 22, 'font-weight': 800, class: 'g-num' });
      A.texto(svg, cx, cy + 12, 'ÁREA TOTAL · TRABAJO (WIce)', { 'text-anchor': 'middle', fill: T.tinta2, 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': '0.08em' });
      const b = total.getBBox();
      if (b.width + 24 > 184) { fondo.setAttribute('x', cx - b.width / 2 - 12); fondo.setAttribute('width', b.width + 24); }
    });
    const rr = cont.getBoundingClientRect();
    if (rr.top > window.innerHeight - 120 || rr.bottom < 0) cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ANOVA con sus pruebas de respaldo y lo que distingue a cada par de unidades
  function htmlAnova(An, canal) {
    const R = An.anova, alfa = D.alfa;
    const grupos = [...An.grupos].sort((a, b) => b.media - a.media);
    const tablaDesc = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th class="izq">Unidad</th><th>n</th><th>Media</th><th>IC 95 % de la media</th><th>Desv. est.</th><th>Mediana</th><th>Q1–Q3</th><th>Mín–Máx</th></tr></thead>
      <tbody>${grupos.map(g => `<tr><th class="izq"><span class="adm-sw" style="background:${color(g.unidad)}" aria-hidden="true"></span>${esc(g.unidad)}</th>
        <td>${num(g.n)}</td><td><b>${num(g.media, 2)}</b></td><td>${g.ic_bajo == null ? '—' : `${num(g.ic_bajo, 1)} a ${num(g.ic_alto, 1)}`}</td>
        <td>${num(g.de, 2)}</td><td>${num(g.mediana, 1)}</td><td>${num(g.q1, 1)}–${num(g.q3, 1)}</td><td>${num(g.min, 1)}–${num(g.max, 1)}</td></tr>`).join('')}</tbody>
    </table></div>`;
    if (!R || R.F == null) return tablaDesc + '<p class="adm-nota">No hay suficientes evaluaciones para el ANOVA: se necesitan al menos dos unidades con dos evaluaciones cada una.</p>';
    const rechaza = R.p < alfa;
    const tam = R.eta2 < 0.01 ? 'despreciable' : R.eta2 < 0.06 ? 'pequeño' : R.eta2 < 0.14 ? 'mediano' : 'grande';
    const W = R.welch, K = R.kruskal, L = R.levene;
    const coincide = [W && W.p != null ? W.p < alfa : null, K && K.p != null ? K.p < alfa : null].filter(x => x != null);
    const pares = [...R.pares].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
    const sig = pares.filter(x => x.p_holm < alfa), sigDunn = pares.filter(x => x.p_dunn_holm != null && x.p_dunn_holm < alfa);
    const par = (a, b) => R.pares.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const difDe = (a, b) => { const x = par(a, b); return x ? (x.a === a ? x.dif : -x.dif) : null; };
    // Matriz: fila menos columna; color si las dos pruebas (Welch y Dunn, con Holm) la ven distinta
    const us = grupos.map(g => g.unidad);
    const maxDif = Math.max(1, ...R.pares.map(x => Math.abs(x.dif)));
    const celda = (a, b) => {
      if (a === b) return '<td class="adm-diag">—</td>';
      const x = par(a, b), d = difDe(a, b);
      if (!x) return '<td>—</td>';
      const w = x.p_holm < alfa, dn = x.p_dunn_holm != null && x.p_dunn_holm < alfa;
      const fuerza = (w && dn ? 0.85 : w || dn ? 0.4 : 0) * Math.min(1, 0.35 + Math.abs(d) / maxDif);
      const fondo = d >= 0 ? `rgba(0,0,0,${fuerza.toFixed(2)})` : `rgba(244,0,0,${fuerza.toFixed(2)})`;
      const tinta = fuerza > 0.45 ? BLANCO : NEGRO;
      const lectura = w && dn ? 'distintas en las dos pruebas' : w ? 'distintas solo con Welch' : dn ? 'distintas solo con Dunn' : 'no se distinguen';
      return `<td class="adm-celda" style="background:${fondo};color:${tinta}" title="${esc(`${a} − ${b}: ${signo(d, 2)} puntos; ${lectura}`)}"><b>${signo(d, 1)}</b><span>${w && dn ? 'sí' : w || dn ? '1 de 2' : 'ns'}</span></td>`;
    };
    const matriz = `<div class="tabla-scroll"><table class="ice-tabla adm-calor adm-matriz">
      <thead><tr><th class="izq">Fila − columna</th>${us.map(u => `<th><span class="adm-sw" style="background:${color(u)}" aria-hidden="true"></span>${esc(u)}</th>`).join('')}</tr></thead>
      <tbody>${us.map(a => `<tr><th class="izq"><span class="adm-sw" style="background:${color(a)}" aria-hidden="true"></span>${esc(a)}</th>${us.map(b => celda(a, b)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    // En palabras: con quién se distingue cada unidad (Welch con Holm; se avisa si Dunn no coincide)
    const frases = grupos.map(g => {
      const arriba = [], abajo = [], igual = [];
      for (const o of us) {
        if (o === g.unidad) continue;
        const x = par(g.unidad, o), d = difDe(g.unidad, o);
        if (!x) continue;
        const txt = `${esc(o)} (${signo(d, 1)}${(x.p_dunn_holm != null && x.p_dunn_holm < alfa) !== (x.p_holm < alfa) ? '<sup title="Dunn no coincide con Welch">†</sup>' : ''})`;
        if (x.p_holm < alfa) (d > 0 ? arriba : abajo).push(txt); else igual.push(txt);
      }
      return `<li><span class="adm-sw" style="background:${color(g.unidad)}" aria-hidden="true"></span><div><b>${esc(g.unidad)}</b> · media ${num(g.media, 1)} · ${plural(g.n, 'evaluación', 'evaluaciones')}
        <p>${arriba.length ? `<span class="adm-favor">Califica más alto que:</span> ${arriba.join(', ')}` : ''}${arriba.length && (abajo.length || igual.length) ? '<br>' : ''}${abajo.length ? `<span class="adm-contra">Califica más bajo que:</span> ${abajo.join(', ')}` : ''}${abajo.length && igual.length ? '<br>' : ''}${igual.length ? `<span class="adm-igual">No se distingue de:</span> ${igual.join(', ')}` : ''}</p></div></li>`;
    }).join('');
    return `${tablaDesc}
      <div class="adm-hipotesis">
        <p><b>H₀</b> (hipótesis nula): la calificación ICE media de ${esc(canal)} es la misma en todas las unidades operativas; es decir, la forma de trabajar de cada unidad, que es distinta, <b>no afecta</b> la calificación.</p>
        <p><b>H₁</b> (alternativa): al menos una unidad tiene una calificación media distinta: la unidad (y su forma de trabajar) <b>sí afecta</b> la calificación.</p>
        <p class="muted">Nivel de significancia α = ${num(alfa, 2)}. Grupos: ${num(R.k)} unidades, ${num(R.n)} evaluaciones.</p>
      </div>
      <div class="tabla-scroll"><table class="ice-tabla adm-anova">
        <thead><tr><th class="izq">Fuente de variación</th><th>Suma de cuadrados</th><th>gl</th><th>Cuadrado medio</th><th>F</th><th>Valor p</th></tr></thead>
        <tbody>
          <tr><th class="izq">Entre unidades</th><td>${num(R.sc_entre, 1)}</td><td>${num(R.gl1)}</td><td>${num(R.cm_entre, 2)}</td><td><b>${num(R.F, 3)}</b></td><td><b>${valorP(R.p)}</b></td></tr>
          <tr><th class="izq">Dentro de las unidades (error)</th><td>${num(R.sc_dentro, 1)}</td><td>${num(R.gl2)}</td><td>${num(R.cm_dentro, 2)}</td><td></td><td></td></tr>
        </tbody>
        <tfoot><tr><th class="izq">Total</th><td>${num(R.sc_total, 1)}</td><td>${num(R.gl1 + R.gl2)}</td><td></td><td></td><td></td></tr></tfoot>
      </table></div>
      <div class="adm-decision ${rechaza ? 'rechaza' : ''}">
        <p class="adm-decision-tit">${rechaza ? 'Se rechaza H₀' : 'No se rechaza H₀'}</p>
        <p>${rechaza
          ? `Con F(${num(R.gl1)}, ${num(R.gl2)}) = ${num(R.F, 2)} y p ${R.p < 0.0001 ? '< 0.0001' : '= ' + num(R.p, 4)} (menor que ${num(alfa, 2)}), las diferencias entre las medias de las unidades son mayores de lo que explicaría el azar: <b>la unidad operativa sí influye en la calificación ICE de ${esc(canal)}</b>.`
          : `Con F(${num(R.gl1)}, ${num(R.gl2)}) = ${num(R.F, 2)} y p = ${num(R.p, 4)} (no menor que ${num(alfa, 2)}), las diferencias entre las medias caben dentro de lo que explica el azar: <b>no hay evidencia de que la unidad operativa cambie la calificación ICE de ${esc(canal)}</b>.`}
          Tamaño del efecto <b>${tam}</b>: η² = ${num(R.eta2, 3)} (ω² = ${num(R.omega2, 3)}), la unidad explica el <b>${num(R.eta2 * 100, 1)} %</b> de la variación de las calificaciones; el resto es variación entre clientes de la misma unidad.</p>
      </div>
      <h3 class="adm-sub">Pruebas de respaldo</h3>
      <div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th class="izq">Prueba</th><th class="izq">Para qué</th><th>Estadístico</th><th>Valor p</th><th class="izq">Lectura</th></tr></thead>
        <tbody>
          ${L && L.W != null ? `<tr><th class="izq">Levene (Brown-Forsythe)</th><td class="izq">¿Las unidades tienen la misma varianza? (supuesto del ANOVA)</td><td>W = ${num(L.W, 2)}</td><td>${valorP(L.p)}</td><td class="izq">${L.p < alfa ? 'Varianzas distintas: pesa más la prueba de Welch' : 'Varianzas parecidas: el ANOVA clásico aplica'}</td></tr>` : ''}
          ${W && W.F != null ? `<tr><th class="izq">ANOVA de Welch</th><td class="izq">Igual que el ANOVA, sin suponer varianzas iguales</td><td>F(${num(W.gl1)}, ${num(W.gl2, 1)}) = ${num(W.F, 2)}</td><td>${valorP(W.p)}</td><td class="izq">${W.p < alfa ? 'Se rechaza H₀' : 'No se rechaza H₀'}</td></tr>` : ''}
          ${K && K.H != null ? `<tr><th class="izq">Kruskal-Wallis</th><td class="izq">Compara por rangos, sin suponer normalidad (el ICE es asimétrico y tiene tope)</td><td>H(${num(K.gl)}) = ${num(K.H, 2)}</td><td>${valorP(K.p)}</td><td class="izq">${K.p < alfa ? 'Se rechaza H₀' : 'No se rechaza H₀'} · ε² = ${num(K.epsilon2, 3)}</td></tr>` : ''}
        </tbody>
      </table></div>
      <p class="adm-nota">${coincide.length && coincide.every(x => x === rechaza) ? 'Las pruebas de respaldo llegan a la misma conclusión que el ANOVA, así que no depende de sus supuestos.' : 'Las pruebas de respaldo no coinciden del todo con el ANOVA: toma la conclusión con cautela.'}</p>
      <h3 class="adm-sub">¿En qué difieren las unidades entre sí?</h3>
      <p class="adm-nota">Dos pruebas por cada par de unidades, las dos con corrección de Holm para las ${num(pares.length)} comparaciones: <b>t de Welch</b> (compara medias sin suponer varianzas iguales) y <b>Dunn</b> (compara rangos, la continuación de Kruskal-Wallis; no supone normalidad). ${sig.length ? `Con Welch, <b>${num(sig.length)}</b> de ${num(pares.length)} pares son distintos` : 'Con Welch ningún par es distinto'}; con Dunn, <b>${num(sigDunn.length)}</b>. d de Cohen = diferencia en desviaciones estándar (0.2 chica, 0.5 mediana, 0.8 grande).</p>
      <p class="adm-nota"><b>Matriz de diferencias.</b> Cada celda es la media de la fila menos la de la columna, en puntos de ICE: negro = la fila califica más alto, rojo = más bajo. Tono fuerte y «sí» = distintas en las dos pruebas; tenue y «1 de 2» = solo en una; sin color y «ns» = no se distinguen.</p>
      ${matriz}
      <h3 class="adm-sub">En palabras</h3>
      <ul class="adm-frases">${frases}</ul>
      <p class="adm-nota">Según la t de Welch con Holm. † = la prueba de Dunn no coincide en ese par.</p>
      <div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th class="izq">Par de unidades</th><th>Diferencia de medias</th><th>IC 95 %</th><th>d de Cohen</th><th>p Welch (Holm)</th><th>z Dunn</th><th>p Dunn (Holm)</th><th class="izq">¿Distintas?</th></tr></thead>
        <tbody>${pares.map(x => {
          const s = x.p_holm < alfa, sd = x.p_dunn_holm != null && x.p_dunn_holm < alfa;
          const arriba = x.dif >= 0 ? x.a : x.b, abajo = x.dif >= 0 ? x.b : x.a;
          return `<tr${s || sd ? '' : ' class="adm-ns"'}>
          <th class="izq">${esc(arriba)} − ${esc(abajo)}</th><td><b>${signo(Math.abs(x.dif), 2)}</b></td>
          <td>${x.dif >= 0 ? `${num(x.bajo, 1)} a ${num(x.alto, 1)}` : `${num(-x.alto, 1)} a ${num(-x.bajo, 1)}`}</td><td>${num(Math.abs(x.d), 2)}</td><td>${valorP(x.p_holm)}</td>
          <td>${x.z_dunn == null ? '—' : num(Math.abs(x.z_dunn), 2)}</td><td>${valorP(x.p_dunn_holm)}</td>
          <td class="izq">${s && sd ? `Sí: <b>${esc(arriba)}</b> califica más alto` : s || sd ? `Solo con ${s ? 'Welch' : 'Dunn'}: posible ventaja de <b>${esc(arriba)}</b>` : 'No se distinguen'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="adm-nota"><b>Cómo leerlo.</b> El ANOVA dice si las unidades califican distinto, no por qué: además de la forma de trabajar de cada unidad influyen su mezcla de clientes, el territorio y el auditor que la evalúa. Por eso conviene verlo con varios periodos (botones de arriba): si la diferencia se mantiene, es más probable que venga de cómo trabaja la unidad. En la pestaña Submétricas se ve en qué parte de la calificación saca ventaja cada una.</p>`;
  }

  // ── Submétricas ───────────────────────────────────────────────────────
  function submetricas() {
    const P = periodo(), canal = estado.canal, S = P.submetricas[canal];
    const panel = $('p-submetricas');
    const controles = `<div class="adm-controles">${segmento('admCanal', D.canales.map(c => [c, esc(c)]), canal, 'Canal')}${segmento('admPeriodoS', opcionesPeriodo(), estado.periodo, 'Periodo')}</div>`;
    if (!S || !S.unidades.length) {
      panel.innerHTML = seccion('Submétricas por unidad', '', `${controles}<p class="adm-nota">No hay evaluaciones de este canal en el periodo.</p>`);
    } else {
      const mets = D.metricas.map((m, i) => ({ ...m, i })).filter(m => S.unidades.some(u => u.dif[m.i] != null));
      const G = P.analisis[canal].global;
      if (estado.metrica[canal] == null || (estado.metrica[canal] !== 'ice' && !mets.some(m => m.i === estado.metrica[canal]))) {
        const pg = S.perdido_global || [];
        estado.metrica[canal] = mets.length ? mets.reduce((a, m) => (pg[m.i] || 0) > (pg[a.i] || 0) ? m : a).i : 'ice';
      }
      const lista = `<div class="adm-metricas" id="admListaMet" role="group" aria-label="Calificación ICE y submétricas de ${esc(canal)}">
        <button type="button" class="adm-met" data-met="ice" aria-pressed="${estado.metrica[canal] === 'ice'}">
          <span class="icono-metrica adm-met-ice" aria-hidden="true">ICE</span><span class="adm-met-nombre">Calificación ICE</span>
          <span class="adm-met-dato">${num(G.media, 1)} <small>promedio de todas</small></span></button>
        ${[...mets].sort((a, b) => ((S.perdido_global || [])[b.i] || 0) - ((S.perdido_global || [])[a.i] || 0)).map(m => `<button type="button" class="adm-met" data-met="${m.i}" aria-pressed="${estado.metrica[canal] === m.i}">
          <span class="icono-metrica" style="background:${colorMetrica(m.i)}" aria-hidden="true">${icono(m.id)}</span><span class="adm-met-nombre">${esc(m.nombre)}</span>
          <span class="adm-met-dato">${num(S.global[m.i], 1)} % <small>${S.perdido_global && S.perdido_global[m.i] != null ? `quita ${num(S.perdido_global[m.i], 2)} pts por evaluación` : 'cumplimiento'}</small></span></button>`).join('')}
      </div>`;
      panel.innerHTML = seccion(`Submétricas · ${nombreCanal(canal)}`,
        `La calificación ICE y cada submétrica de ${esc(canal)}, de la que más puntos quita a la que menos (puntos del manual ICE para el tipo de cliente con que se calificó cada evaluación). ${TACTIL ? 'Toca' : 'Elige'} una para ver cómo fue cambiando cada unidad en ${esc(P.nombre.toLowerCase())} y cómo va en la calificación de sus tiendas.`,
        `${controles}${lista}<div id="admMetDet"></div>`)
        + seccion('Ventaja de cada unidad por submétrica', `En qué parte de la calificación ICE de ${esc(canal)} saca ventaja o pierde cada unidad frente a las demás · ${esc(P.nombre)}.`, calorSubmetricas(S, mets, canal));
      $('admListaMet').addEventListener('click', e => {
        const b = e.target.closest('[data-met]');
        if (!b) return;
        estado.metrica[canal] = b.dataset.met === 'ice' ? 'ice' : +b.dataset.met;
        $('admListaMet').querySelectorAll('[data-met]').forEach(x => x.setAttribute('aria-pressed', x === b));
        detalleMetrica(S);
      });
      detalleMetrica(S);
    }
    alElegir('admCanal', v => { estado.canal = v; submetricas(); });
    alElegir('admPeriodoS', v => { estado.periodo = v; submetricas(); });
  }

  // Línea de cada unidad (promedio acumulado o del día) y cómo va cada una en sus tiendas
  function detalleMetrica(S) {
    const P = periodo(), canal = estado.canal, sel = estado.metrica[canal], esIce = sel === 'ice';
    const m = esIce ? null : D.metricas[sel], nombre = esIce ? 'Calificación ICE' : m.nombre, suf = esIce ? '' : ' %';
    const cont = $('admMetDet');
    // Fechas del periodo con alguna evaluación; serie = [fecha, n, suma ICE, [sumas], [n por submétrica]]
    const fechas = [...new Set(S.unidades.flatMap(u => u.serie.map(d => d[0])))].sort();
    const series = S.unidades.map(u => {
      const por = Object.fromEntries(u.serie.map(d => [d[0], d]));
      let suma = 0, n = 0;
      const valores = fechas.map(f => {
        const d = por[f];
        const s = d ? (esIce ? d[2] : d[3][sel]) : 0, c = d ? (esIce ? d[1] : d[4][sel]) : 0;
        suma += s; n += c;
        if (estado.serie === 'dia') return c ? s / c : null;
        return n ? suma / n : null;
      });
      return { nombre: u.unidad, color: color(u.unidad), valores, ancho: 2.5 };
    }).filter(s => s.valores.some(v => v != null));
    const filas = [...S.unidades].map(u => esIce
      ? { u, prom: u.ice, dif: u.ice_demas != null ? u.ice - u.ice_demas : null, n: u.n }
      : { u, prom: u.prom[sel], dif: u.dif[sel], p: u.p[sel], completos: u.completos[sel], perdido: u.perdido[sel], puntos: u.puntos[sel], n: u.n_met[sel] })
      .filter(f => f.prom != null).sort((a, b) => b.prom - a.prom);
    const global = esIce ? P.analisis[canal].global.media : S.global[sel];
    cont.innerHTML = `
      <div class="adm-met-cab">
        <h3 class="ice-subtitulo">${esIce ? '<span class="icono-metrica adm-met-ice" aria-hidden="true">ICE</span>' : `<span class="icono-metrica" style="background:${colorMetrica(sel)}" aria-hidden="true">${icono(m.id)}</span>`}${esc(nombre)} · ${esc(canal)} · ${esc(P.nombre)}</h3>
        ${segmento('admSerie', [['acumulado', 'Promedio acumulado'], ['dia', 'Promedio de cada día']], estado.serie, 'Tipo de línea')}
      </div>
      <div class="grafica" id="admLineas"></div>
      <p class="adm-nota">${estado.serie === 'dia'
        ? `Cada punto es el promedio de ${esIce ? 'la calificación ICE' : `${esc(nombre.toLowerCase())} (%)`} de las evaluaciones de ese día en cada unidad (los días sin evaluaciones quedan en blanco).`
        : `Cada línea es el promedio acumulado de ${esIce ? 'la calificación ICE' : `${esc(nombre.toLowerCase())} (%)`} de la unidad desde el inicio del periodo hasta ese día: así se ve cómo fue cambiando sin el ruido de los días con pocas evaluaciones.`} La línea punteada es el promedio de todas las unidades en el periodo.</p>
      <h3 class="adm-sub">Cómo va cada unidad en ${esc(nombre.toLowerCase())}</h3>
      <div class="grafica" id="admMetBarras"></div>
      <div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th class="izq">Unidad</th><th>Evaluaciones</th><th>${esIce ? 'ICE promedio' : 'Cumplimiento promedio'}</th><th>Contra las demás</th>
          ${esIce ? '' : '<th>Tiendas al 100 %</th><th>Puntos que quita por evaluación</th><th>Puntos de ICE contra las demás</th>'}</tr></thead>
        <tbody>${filas.map(f => `<tr${f.p != null && f.p >= D.alfa ? ' class="adm-ns"' : ''}><th class="izq"><span class="adm-sw" style="background:${color(f.u.unidad)}" aria-hidden="true"></span>${esc(f.u.unidad)}</th>
          <td>${num(f.n)}</td><td><b>${num(f.prom, 1)}${suf}</b></td><td>${signo(f.dif, 1)}${f.p != null ? ` <span class="muted">${f.p < D.alfa ? '' : '(ns)'}</span>` : ''}</td>
          ${esIce ? '' : `<td>${num(f.completos, 0)} %</td><td>${f.perdido == null ? '—' : `−${num(f.perdido, 2)}`}</td><td>${signo(f.puntos, 2)}</td>`}</tr>`).join('')}</tbody>
        <tfoot><tr><th class="izq">Todas</th><td></td><td>${num(global, 1)}${suf}</td><td></td>${esIce ? '' : `<td></td><td>${S.perdido_global && S.perdido_global[sel] != null ? `−${num(S.perdido_global[sel], 2)}` : '—'}</td><td></td>`}</tr></tfoot>
      </table></div>
      <p class="adm-nota">${esIce ? 'Contra las demás = ICE de la unidad menos el de las otras unidades juntas.' : `Contra las demás = puntos de cumplimiento arriba o abajo de las otras unidades juntas («ns» = puede ser azar, t de Welch con p ≥ ${num(D.alfa, 2)}). Tiendas al 100 % = evaluaciones con la submétrica completa. Puntos que quita = promedio por evaluación de los puntos del manual ICE que perdió la tienda en ${esc(nombre.toLowerCase())}. Puntos de ICE contra las demás = diferencia de cumplimiento × peso estimado de la submétrica.`}</p>`;
    alElegir('admSerie', v => { estado.serie = v; detalleMetrica(S); });
    if (series.length) {
      Graficas.lineas($('admLineas'), {
        titulo: `${nombre} por unidad, ${canal}`, x: fechas, series, alto: 340,
        etiquetaX: f => fechaCorta(f), tituloTip: f => fecha(f),
        formatoTip: v => `${num(v, 1)}${suf}`,
        objetivo: global != null ? { valor: global, etiqueta: `Todas ${num(global, 1)}${suf}` } : null,
      });
    } else $('admLineas').innerHTML = '<p class="muted">Sin evaluaciones con fecha.</p>';
    Graficas.barras($('admMetBarras'), {
      titulo: `${nombre} promedio por unidad, ${canal}`, max: esIce ? Math.max(110, ...filas.map(f => f.prom)) : 100,
      anchoEtiqueta: 140, margenDerecho: 150, altoFila: 36,
      referencia: global != null ? { valor: global, etiqueta: `Todas ${num(global, 1)}${suf}` } : null,
      filas: filas.map(f => ({ etiqueta: f.u.unidad, valor: f.prom, color: color(f.u.unidad),
        texto: esIce ? `${num(f.prom, 1)} · n ${num(f.n)}` : `${num(f.prom, 1)} % · −${num(f.perdido || 0, 2)} pts`,
        tip: `<b>${esc(f.u.unidad)} · ${esc(nombre)}</b><table class="tip-tabla"><tr><td>Promedio</td><td>${num(f.prom, 2)}${suf}</td></tr>
          <tr><td>Contra las demás</td><td>${signo(f.dif, 2)}</td></tr><tr><td>Evaluaciones</td><td>${num(f.n)}</td></tr>
          ${esIce ? '' : `<tr><td>Tiendas al 100 %</td><td>${num(f.completos, 0)} %</td></tr><tr><td>Quita por evaluación</td><td>${num(f.perdido, 2)} pts</td></tr>`}</table>` })),
    });
  }

  // Mapa de calor: puntos de ICE de cada submétrica contra las demás unidades, con frases
  function calorSubmetricas(S, mets, canal) {
    const maxAbs = Math.max(0.5, ...S.unidades.flatMap(u => u.puntos.map(v => Math.abs(v || 0))));
    const celda = (u, i) => {
      const pts = u.puntos[i], dif = u.dif[i], p = u.p[i];
      if (dif == null) return '<td class="adm-celda">—</td>';
      const v = pts != null ? pts : dif, firme = p != null && p < D.alfa;
      const a = Math.min(1, Math.abs(v) / maxAbs) * (firme ? 0.85 : 0.3);
      const fondo = v >= 0 ? `rgba(0,0,0,${a.toFixed(2)})` : `rgba(244,0,0,${a.toFixed(2)})`;
      const tinta = a > 0.45 ? BLANCO : NEGRO;
      const titulo = `${u.unidad} · ${D.metricas[i].nombre}: ${num(u.prom[i], 1)} % contra ${num(u.prom[i] - dif, 1)} % de las demás (${signo(dif, 1)} puntos de cumplimiento${pts != null ? `, ${signo(pts, 2)} puntos de ICE` : ''}). ${firme ? 'Diferencia significativa.' : 'Diferencia que puede ser azar.'}`;
      return `<td class="adm-celda" style="background:${fondo};color:${tinta}" title="${esc(titulo)}"><b>${signo(v, pts != null ? 2 : 1)}</b><span>${num(u.prom[i], 0)} %${firme ? '' : ' · ns'}</span></td>`;
    };
    const frase = u => {
      const lista = mets.map(m => ({ m, v: u.puntos[m.i], firme: u.p[m.i] != null && u.p[m.i] < D.alfa }))
        .filter(x => x.v != null && x.firme && Math.abs(x.v) >= 0.05);
      const favor = lista.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
      const contra = lista.filter(x => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);
      const dif = u.ice_demas != null ? u.ice - u.ice_demas : null;
      const item = x => `<span class="adm-met-mini" style="color:${colorMetrica(x.m.i)}" aria-hidden="true">${icono(x.m.id)}</span>${esc(x.m.nombre)} <b>${signo(x.v, 2)}</b>`;
      return `<li><span class="adm-sw" style="background:${color(u.unidad)}" aria-hidden="true"></span><div><b>${esc(u.unidad)}</b> · ICE ${num(u.ice, 1)} en ${esc(canal)}${dif != null ? ` (<b>${signo(dif, 1)}</b> contra las demás)` : ''} · ${plural(u.n, 'evaluación', 'evaluaciones')}
        <p><span class="adm-favor">Le favorece:</span> ${favor.length ? favor.map(item).join(' · ') : 'ninguna submétrica con ventaja clara'}</p>
        <p><span class="adm-contra">Le resta:</span> ${contra.length ? contra.map(item).join(' · ') : 'ninguna submétrica con desventaja clara'}</p></div></li>`;
    };
    const orden = [...S.unidades].sort((a, b) => b.ice - a.ice);
    const pesos = mets.map(m => S.pesos[m.i] != null ? `${m.nombre} ${num(S.pesos[m.i] * 100, 0)}` : null).filter(Boolean).join(', ');
    return `<div class="tabla-scroll"><table class="ice-tabla adm-calor">
        <thead><tr><th class="izq">Unidad</th><th>ICE</th><th>Contra las demás</th>${mets.map(m => `<th><span class="adm-met-th"><span class="icono-metrica" style="background:${colorMetrica(m.i)}" aria-hidden="true">${icono(m.id)}</span>${esc(m.nombre)}</span></th>`).join('')}</tr></thead>
        <tbody>${orden.map(u => `<tr><th class="izq"><span class="adm-sw" style="background:${color(u.unidad)}" aria-hidden="true"></span>${esc(u.unidad)} <span class="muted">(${num(u.n)})</span></th>
          <td><b>${num(u.ice, 1)}</b></td><td>${u.ice_demas != null ? signo(u.ice - u.ice_demas, 1) : '—'}</td>${mets.map(m => celda(u, m.i)).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><th class="izq">Promedio de todas</th><td></td><td></td>${mets.map(m => `<td>${num(S.global[m.i], 0)} %</td>`).join('')}</tr></tfoot>
      </table></div>
      <p class="adm-nota">Cada celda: <b>puntos de ICE</b> que la submétrica le da (negro) o le quita (rojo) a la unidad contra el promedio de las demás unidades, y abajo su cumplimiento. Puntos = diferencia de cumplimiento × peso de la submétrica en el ICE de ${esc(canal)}. «ns» y el tono tenue = la diferencia puede ser azar (t de Welch, p ≥ ${num(D.alfa, 2)}). ${pesos ? `Pesos estimados con ${num(S.n_pesos)} evaluaciones recientes (el reporte no trae la fórmula): ${esc(pesos)}.` : 'Sin pesos estimados para este canal: se muestra la diferencia de cumplimiento.'}</p>
      <h3 class="adm-sub">Qué parte de la calificación favorece a cada unidad · ${esc(canal)}</h3>
      <ul class="adm-frases">${orden.map(frase).join('')}</ul>`;
  }

  // ── Polígonos: jefaturas, zonas recurrentes, zonas que más restan y pérdida por submétrica ──
  function etiqueta(texto, c) {
    return L.divIcon({ className: 'ruta-etiqueta jef-etiqueta', html: `<span style="background:${c};color:${Graficas.tintaSobre(c)}">${esc(texto)}</span>`, iconSize: null });
  }
  const centro = anillos => {
    const mayor = anillos.reduce((a, b) => b[0].length > a[0].length ? b : a)[0];
    return mayor.reduce((a, p) => [a[0] + p[0] / mayor.length, a[1] + p[1] / mayor.length], [0, 0]);
  };
  const muestra = (c, a) => { const [r, g, b] = [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)); return `background:rgba(${r},${g},${b},${a});border-color:${c}`; };

  function poligonos() {
    const panel = $('p-poligonos'), M = D.mapa, U = Ice.util;
    if (mapaPol) { setTimeout(() => mapaPol.invalidateSize(), 50); return; }
    const mr = M.meses_recurrentes || 3;
    const SUB = M.submetricas || {}, REC = M.recurrentes || {}, RES = M.restan || {};
    // Submétricas con zonas en alguna unidad, de la que más quita (todas las unidades) a la que menos
    const totalMet = {};
    for (const u of D.unidades) for (const m of ((SUB[u] || {}).metricas || [])) totalMet[m.i] = (totalMet[m.i] || 0) + m.total;
    const metsPol = Object.keys(totalMet).map(Number).sort((a, b) => totalMet[b] - totalMet[a]);
    const TEMAS = {
      jefaturas: { nombre: 'Jefaturas', hay: M.jefaturas.length > 0 },
      recurrentes: { nombre: `Zonas ICE recurrentes (${num(mr)} meses)`, corto: 'Zonas ICE recurrentes', hay: D.unidades.some(u => REC[u] && REC[u].resultado), color: ROJO, niveles: NIVELES },
      restan: { nombre: 'Zonas que más restan', hay: D.unidades.some(u => RES[u] && RES[u].resultado), color: NEGRO, niveles: NIVELES_PERDIDA },
      submetricas: { nombre: 'Pérdida por submétrica', hay: metsPol.length > 0, niveles: NIVELES_PERDIDA },
    };
    const est = { tema: 'jefaturas', unidades: new Set(D.unidades), niveles: new Set([50, 75]), limites: true, metrica: metsPol.length ? metsPol[0] : null };
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <div class="segmento adm-temas" id="admTema" role="group" aria-label="Tema del mapa">
            ${Object.entries(TEMAS).map(([t, T]) => `<button type="button" data-tema="${t}" aria-pressed="${t === est.tema}"${T.hay ? '' : ' disabled title="Aparece a partir de la siguiente publicación del sitio."'}>${esc(T.nombre)}</button>`).join('')}
          </div>
        </div>
        <div class="chips poli-metricas" id="admPolMet" role="group" aria-label="Submétrica" hidden>
          <span class="poli-rutas-tit">Submétrica:</span>
          ${metsPol.map(i => `<button type="button" class="chip" data-metrica="${i}" aria-pressed="${i === est.metrica}"><span class="icono-metrica" style="background:${colorMetrica(i)}" aria-hidden="true">${icono(D.metricas[i].id)}</span>${esc(D.metricas[i].nombre)} · −${num(totalMet[i], 0)} pts</button>`).join('')}
        </div>
        <p class="mapa-resumen" id="admPolResumen"></p>
        <div class="chips" id="admPolUnidades" role="group" aria-label="Unidades en el mapa">
          ${D.unidades.map(u => `<button type="button" class="chip" aria-pressed="true" data-unidad="${esc(u)}"><span class="adm-sw" style="background:${color(u)}" aria-hidden="true"></span>${esc(u)}</button>`).join('')}
        </div>
        <div class="chips poli-rutas" id="admPolNiveles" role="group" aria-label="Zonas"></div>
        <div class="poli-descargas" id="admKmz" role="group" aria-label="Descargas en KMZ">
          <span class="poli-rutas-tit">Descargar KMZ:</span>
          ${Object.entries(TEMAS).map(([t, T]) => `<button type="button" class="ice-btn ${t === 'jefaturas' ? 'rojo' : 'sec'}" data-kmz="${t}"${T.hay ? '' : ' disabled'}>${U.svgIcono('descarga')}${esc(T.nombre)}</button>`).join('')}
        </div>
        <p class="mapa-ayuda" id="admPolAyuda"></p>
        <p class="mapa-ayuda" id="admKmzEstado" role="status" aria-live="polite"></p>
      </div>
      <div id="mapaAdmPol" class="mapa mapa-admin"></div>`;
    mapaPol = L.map('mapaAdmPol');
    U.capaBase(mapaPol);
    mapaPol.createPane('zonasAdm').style.zIndex = 420;
    const capaJef = L.layerGroup().addTo(mapaPol), capaNombres = L.layerGroup().addTo(mapaPol), capaZonas = L.layerGroup().addTo(mapaPol);
    const todos = [];
    for (const j of M.jefaturas) for (const pol of j.anillos) for (const p of pol[0]) todos.push(p);
    if (!todos.length) for (const u of D.unidades) { const R = REC[u] && REC[u].resultado; if (R) for (const n of R.niveles) for (const q of n.poligonos) for (const p of q.anillos[0]) todos.push(p); }
    if (todos.length) mapaPol.fitBounds(U.limitesRobustos(todos).pad(0.03)); else mapaPol.setView([19.36, -99.14], 11);

    const AYUDA = {
      jefaturas: `Cada jefatura lleva el color de su unidad y su nombre; sus límites corren por las calles y encierran a sus clientes activos (Master Data). ${TACTIL ? 'Toca' : 'Haz clic en'} una jefatura para ver sus datos.`,
      recurrentes: `Zonas donde se concentran los clientes que el ICE evaluó en <b>${num(M.min_meses_recurrente || 2)} o más de los últimos ${num(mr)} meses</b> (los que el ICE vuelve a visitar): núcleo = 50 % de la densidad de sus evaluaciones, zona alta = 75 %, zona amplia = 90 %. El borde lleva el color de la unidad.`,
      restan: `Zonas donde se juntan los puntos que las evaluaciones ICE de cada unidad quedaron debajo del promedio de la unidad en su canal (últimos ${num(M.meses)} meses): ahí es donde más baja su calificación. El borde lleva el color de la unidad.`,
      submetricas: `Elige una submétrica: las zonas pintadas son donde se juntan los puntos de ICE que esa submétrica les quitó a los clientes evaluados de cada unidad (últimos ${num(M.meses)} meses; puntos del manual ICE para el tipo de cliente con que se calificó). Foco = 50 % de esos puntos, zona de pérdida = 75 %, amplia = 90 %. Las zonas van del color de la submétrica; los límites punteados de las jefaturas, del color de su unidad.`,
    };
    const ayudaKmz = ` Cada tema se descarga en su botón de KMZ (Google Earth, My Maps, QGIS) con las unidades y zonas que estén encendidas; el de pérdida por submétrica trae todas las submétricas, una carpeta por cada una.`;

    // Popups por tema
    const popupJef = (j, c) => `<div class="pc"><div class="pc-cab" style="background:${c};color:${Graficas.tintaSobre(c)}"><b>Jefatura ${esc(j.jefatura)}</b><span>Unidad ${esc(j.unidad)}</span></div>
      <dl class="pc-cuerpo">${fila('Clientes activos', `${num(j.clientes)} <span class="muted">(${num(j.dentro / j.clientes * 100, 0)} % dentro del polígono)</span>`)}${fila('Rutas', num(j.rutas))}${fila('Superficie', `${num(j.area_km2, 1)} km²`)}
        ${fila(`ICE de ${D.mes}`, j.ice == null ? 'sin evaluaciones' : `<b>${num(j.ice, 1)}</b> <span class="muted">(${plural(j.n, 'evaluación', 'evaluaciones')})</span>`)}${fila('Clientes prioridad 1', num(j.p1))}</dl></div>`;
    const popupZona = (tema, u, p, k, q, datos, m) => {
      const T = TEMAS[tema], nombre = `${T.niveles[p]} ${k + 1} · ${u}`;
      if (tema === 'recurrentes') return `<div class="pc"><div class="pc-cab p1"><b>${esc(nombre)}</b><span>Clientes evaluados en ${num(M.min_meses_recurrente || 2)}+ de los últimos ${num(mr)} meses: ${p} % de la densidad</span></div>
        <dl class="pc-cuerpo">${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${partePct(q.evaluaciones, datos.evaluaciones)} de las recurrentes de la unidad)</span>`)}${fila('Clientes', num(q.clientes))}${fila('Superficie', `${num(q.area_km2, 2)} km²`)}</dl></div>`;
      if (tema === 'restan') {
        const peor = (q.peor || []).map(([i, pts]) => `${esc(D.metricas[i].nombre)} <b>−${num(pts, 1)}</b>`).join(' · ');
        return `<div class="pc"><div class="pc-cab"><b>${esc(nombre)}</b><span>Zonas que juntan el ${p} % de los puntos debajo del promedio de la unidad</span></div>
          <dl class="pc-cuerpo">${fila('ICE promedio aquí', `<b>${num(q.ice, 1)}</b> <span class="muted">(unidad ${num(datos.promedio_total, 1)})</span>`)}
            ${q.impacto != null && q.impacto > 0 ? fila('Le resta a la unidad', `<b>${num(q.impacto, 2)}</b> puntos de promedio`) : ''}
            ${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${plural(q.clientes, 'cliente')})</span>`)}
            ${peor ? fila('Lo que más quita aquí', peor) : ''}${fila('Superficie', `${num(q.area_km2, 2)} km²`)}</dl></div>`;
      }
      const c = colorMetrica(m.i), nm = D.metricas[m.i].nombre;
      return `<div class="pc"><div class="pc-cab" style="background:${c};color:${Graficas.tintaSobre(c)}"><b>${esc(nombre)} · ${esc(nm)}</b><span>Zonas que juntan el ${p} % de los puntos que quitó ${esc(nm.toLowerCase())}</span></div>
        <dl class="pc-cuerpo">${fila('Puntos de ICE que quitó aquí', `<b>${num(q.puntos, 1)}</b> <span class="muted">(${partePct(q.puntos, m.total)} de la unidad)</span>`)}
          ${fila('Quita por evaluación', `<b>${num(q.perdido, 2)}</b> <span class="muted">(unidad ${num(m.perdido, 2)})</span>`)}
          ${fila(`Cumplimiento`, `${num(q.cumplimiento, 1)} % <span class="muted">(unidad ${num(m.cumplimiento, 1)} %)</span>`)}
          ${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${plural(q.clientes, 'cliente')})</span>`)}${fila('Superficie', `${num(q.area_km2, 2)} km²`)}</dl></div>`;
    };
    // Zonas del tema para una unidad: [{p, poligonos}] más los datos de la unidad
    const zonasDe = (tema, u) => {
      if (tema === 'recurrentes') return REC[u] && REC[u].resultado ? { datos: REC[u], R: REC[u].resultado } : null;
      if (tema === 'restan') return RES[u] && RES[u].resultado ? { datos: RES[u], R: RES[u].resultado } : null;
      if (tema === 'submetricas') { const m = ((SUB[u] || {}).metricas || []).find(x => x.i === est.metrica); return m && m.resultado ? { datos: SUB[u], R: m.resultado, m } : null; }
      return null;
    };
    const rellenoDe = (tema, m) => tema === 'submetricas' ? colorMetrica(m.i) : TEMAS[tema].color;

    const pintar = () => {
      const tema = est.tema, T = TEMAS[tema];
      capaJef.clearLayers(); capaNombres.clearLayers(); capaZonas.clearLayers();
      $('admPolMet').hidden = tema !== 'submetricas';
      $('admPolAyuda').innerHTML = AYUDA[tema] + ayudaKmz;
      // Jefaturas: llenas en su tema; en los demás, solo el contorno fino si «Límites de jefaturas» está encendido
      if (tema === 'jefaturas' || est.limites) for (const j of M.jefaturas) {
        if (!est.unidades.has(j.unidad)) continue;
        const c = color(j.unidad), llena = tema === 'jefaturas';
        L.polygon(j.anillos, llena ? { color: c, weight: 3.5, opacity: 0.95, fillColor: c, fillOpacity: 0.12, lineJoin: 'miter' }
          : { color: c, weight: 1.2, opacity: 0.7, fill: false, interactive: false, dashArray: '4 4' })
          .bindPopup(() => popupJef(j, c), { maxWidth: 300 }).addTo(capaJef);
        if (llena) L.marker(centro(j.anillos), { interactive: false, keyboard: false, icon: etiqueta(j.jefatura, c) }).addTo(capaNombres);
      }
      if (tema === 'jefaturas') {
        $('admPolNiveles').innerHTML = '';
        const js = M.jefaturas.filter(j => est.unidades.has(j.unidad));
        $('admPolResumen').innerHTML = M.jefaturas.length
          ? `<b>${num(js.length)}</b> jefaturas de <b>${num(est.unidades.size)}</b> unidades, con <b>${num(js.reduce((a, j) => a + j.clientes, 0))}</b> clientes activos de la Master Data.`
          : 'Las jefaturas se trazan con las calles de OpenStreetMap: aparecen en la siguiente publicación en que se puedan bajar.';
        return;
      }
      $('admPolNiveles').innerHTML = [50, 75, 90].map(p => `<button type="button" class="chip" aria-pressed="${est.niveles.has(p)}" data-nivel="${p}"><span class="poli-sw" style="${muestra(tema === 'submetricas' ? colorMetrica(est.metrica) : T.color, RELLENO[p])}" aria-hidden="true"></span>${esc(T.niveles[p])} (${p} %)</button>`).join('')
        + `<button type="button" class="chip" aria-pressed="${est.limites}" data-limites="1"><span class="poli-sw" style="background:none;border-style:dashed;border-color:${GRIS}" aria-hidden="true"></span>Límites de jefaturas</button>`;
      const partes = [];
      for (const u of D.unidades) {
        const z = zonasDe(tema, u);
        if (!z) continue;
        if (est.unidades.has(u)) {
          // En pérdida por submétrica todo va del color de la submétrica (algunas coinciden con el de
          // una unidad); la unidad se ve en los límites punteados de sus jefaturas
          const relleno = rellenoDe(tema, z.m), borde = tema === 'submetricas' ? relleno : color(u);
          for (const n of [...z.R.niveles].sort((a, b) => b.p - a.p)) {
            if (!est.niveles.has(n.p)) continue;
            n.poligonos.forEach((q, k) => L.polygon(q.anillos, { pane: 'zonasAdm', color: borde, weight: GROSOR[n.p], opacity: 0.95, fillColor: relleno, fillOpacity: RELLENO[n.p], lineJoin: 'miter' })
              .bindPopup(() => popupZona(tema, u, n.p, k, q, z.datos, z.m), { maxWidth: 320 }).addTo(capaZonas));
          }
        }
        if (tema === 'recurrentes') partes.push(`${esc(u)} <b>${num(z.datos.clientes)}</b> de ${num(z.datos.clientes_periodo)}`);
        if (tema === 'restan') partes.push(`${esc(u)} <b>${num(z.datos.debajo)}</b> de ${num(z.datos.clientes)} clientes`);
        if (tema === 'submetricas') partes.push(`${esc(u)} <b>−${num(z.m.total, 0)}</b> (${num(z.m.perdido, 2)} por evaluación)`);
      }
      const R0 = D.unidades.map(u => REC[u]).find(Boolean);
      $('admPolResumen').innerHTML = tema === 'recurrentes'
        ? `<b>Zonas ICE recurrentes</b>${R0 ? ` del ${esc(fecha(R0.desde))} al ${esc(fecha(R0.hasta))}` : ''}: clientes evaluados en ${num(M.min_meses_recurrente || 2)} o más de los últimos ${num(mr)} meses, de los evaluados en ese tiempo · ${partes.join(' · ')}.`
        : tema === 'restan'
          ? `<b>Zonas que más restan</b>${M.desde ? ` del ${esc(fecha(M.desde))} al ${esc(fecha(M.hasta))}` : ''}: clientes evaluados debajo del promedio de su unidad · ${partes.join(' · ')}.`
          : `<b>Pérdida por submétrica · ${esc(D.metricas[est.metrica].nombre)}</b>${M.desde ? ` del ${esc(fecha(M.desde))} al ${esc(fecha(M.hasta))}` : ''}: puntos de ICE que quitó en cada unidad · ${partes.join(' · ')}.`;
    };
    pintar();

    $('admTema').addEventListener('click', e => {
      const b = e.target.closest('[data-tema]');
      if (!b || b.disabled || b.dataset.tema === est.tema) return;
      $('admTema').querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', x === b));
      est.tema = b.dataset.tema;
      $('admKmzEstado').textContent = '';
      mapaPol.closePopup();
      pintar();
    });
    $('admPolMet').addEventListener('click', e => {
      const b = e.target.closest('[data-metrica]');
      if (!b || +b.dataset.metrica === est.metrica) return;
      $('admPolMet').querySelectorAll('[data-metrica]').forEach(x => x.setAttribute('aria-pressed', x === b));
      est.metrica = +b.dataset.metrica;
      mapaPol.closePopup();
      pintar();
    });
    $('admPolUnidades').addEventListener('click', e => {
      const b = e.target.closest('[data-unidad]');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      if (on) est.unidades.add(b.dataset.unidad); else est.unidades.delete(b.dataset.unidad);
      pintar();
    });
    $('admPolNiveles').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (b.dataset.limites) est.limites = on;
      else if (on) est.niveles.add(+b.dataset.nivel); else est.niveles.delete(+b.dataset.nivel);
      pintar();
    });

    // KMZ de un tema con las unidades y niveles encendidos
    const fuente = M.calles ? ' Límites trazados sobre las calles de OpenStreetMap (© colaboradores de OpenStreetMap).' : '';
    const carpetasNiveles = (tema, u, z, prefijo) => [...z.R.niveles].sort((a, b) => b.p - a.p).filter(n => est.niveles.has(n.p) && n.poligonos.length).map(n => {
      const T = TEMAS[tema], relleno = rellenoDe(tema, z.m);
      return {
        nombre: `${prefijo}${T.niveles[n.p]} (${n.p} %)`,
        marcas: n.poligonos.map((q, k) => ({
          nombre: `${prefijo}${T.niveles[n.p]} ${k + 1}`, color: relleno, relleno: RELLENO[n.p], ancho: GROSOR[n.p], poligonos: [q.anillos],
          descripcion: tema === 'recurrentes' ? `${num(q.evaluaciones)} evaluaciones de ${num(q.clientes)} clientes recurrentes · ${num(q.area_km2, 2)} km²`
            : tema === 'restan' ? `ICE promedio ${num(q.ice, 1)} en ${num(q.evaluaciones)} evaluaciones de ${num(q.clientes)} clientes${q.impacto > 0 ? ` · le resta ${num(q.impacto, 2)} puntos al promedio de la unidad` : ''} · ${num(q.area_km2, 2)} km²${(q.peor || []).length ? ` · lo que más quita: ${q.peor.map(([i, pts]) => `${D.metricas[i].nombre} −${num(pts, 1)}`).join(', ')}` : ''}`
            : `${D.metricas[z.m.i].nombre} quitó ${num(q.puntos, 1)} puntos de ICE aquí (${partePct(q.puntos, z.m.total)} de la unidad), ${num(q.perdido, 2)} por evaluación (unidad ${num(z.m.perdido, 2)}); cumplimiento ${num(q.cumplimiento, 1)} % · ${num(q.evaluaciones)} evaluaciones de ${num(q.clientes)} clientes · ${num(q.area_km2, 2)} km²`,
          datos: { unidad: u, nivel_pct: n.p, evaluaciones: q.evaluaciones, clientes: q.clientes, area_km2: q.area_km2,
                   ...(tema === 'restan' ? { ice_promedio: q.ice, resta_al_promedio: q.impacto == null ? '' : q.impacto } : {}),
                   ...(tema === 'submetricas' ? { submetrica: D.metricas[z.m.i].nombre, puntos_perdidos: q.puntos, perdido_por_evaluacion: q.perdido == null ? '' : q.perdido, cumplimiento_pct: q.cumplimiento == null ? '' : q.cumplimiento } : {}) } })),
      };
    });
    const kmzDe = tema => {
      const us = D.unidades.filter(u => est.unidades.has(u));
      if (tema === 'jefaturas') return [`Jefaturas · Valle de México`, `Jefaturas de las unidades operativas: cada una encierra a sus clientes activos de la Master Data.${fuente} Publicado ${D.generado}.`,
        us.map(u => ({ nombre: `Jefaturas · ${u}`, marcas: M.jefaturas.filter(j => j.unidad === u).map(j => ({
          nombre: `Jefatura ${j.jefatura}`, color: color(u), relleno: 0.2, ancho: 3, poligonos: j.anillos,
          descripcion: `Unidad ${u} · ${num(j.clientes)} clientes activos · ${num(j.rutas)} rutas · ${num(j.area_km2, 1)} km²${j.ice != null ? ` · ICE de ${D.mes}: ${num(j.ice, 1)}` : ''}`,
          datos: { unidad: u, jefatura: j.jefatura, clientes: j.clientes, rutas: j.rutas, area_km2: j.area_km2, ice_del_mes: j.ice == null ? '' : j.ice, prioridad_1: j.p1 } })) })).filter(c => c.marcas.length),
        `Jefaturas_VDM_${D.hoy}.kmz`];
      if (tema === 'submetricas') {
        const carpetas = metsPol.map(i => {
          const nm = D.metricas[i].nombre;
          return { nombre: `${nm}: quitó ${num(totalMet[i], 0)} puntos de ICE en todas las unidades`, carpetas: us.map(u => {
            const m = ((SUB[u] || {}).metricas || []).find(x => x.i === i);
            if (!m || !m.resultado) return null;
            return { nombre: `${nm} · ${u}: −${num(m.total, 0)} puntos (${num(m.perdido, 2)} por evaluación)`, carpetas: carpetasNiveles('submetricas', u, { R: m.resultado, m }, `${nm} · ${u} · `) };
          }).filter(Boolean) };
        }).filter(c => c.carpetas.length);
        return [`Pérdida por submétrica · Valle de México`, `Dónde quita más puntos de ICE cada submétrica en cada unidad (últimos ${M.meses} meses): cada evaluación pesa los puntos que le quitó la submétrica (puntos del manual ICE). Cada nivel es la superficie más chica que reúne el 50, 75 o 90 % de esos puntos.${fuente} Publicado ${D.generado}.`,
          carpetas, `PerdidaPorSubmetrica_VDM_${D.hoy}.kmz`];
      }
      const T = TEMAS[tema];
      const carpetas = us.map(u => { const z = zonasDe(tema, u); return z ? { nombre: `${T.corto || T.nombre} · ${u}`, carpetas: carpetasNiveles(tema, u, z, `${u} · `) } : null; }).filter(Boolean);
      return tema === 'recurrentes'
        ? [`Zonas ICE recurrentes · Valle de México`, `Zonas donde se concentran los clientes evaluados en ICE en ${M.min_meses_recurrente || 2} o más de los últimos ${mr} meses, por unidad (densidad de sus evaluaciones; niveles de 50, 75 y 90 %).${fuente} Publicado ${D.generado}.`, carpetas, `ZonasICERecurrentes_${mr}_meses_VDM_${D.hoy}.kmz`]
        : [`Zonas que más restan · Valle de México`, `Zonas donde se juntan los puntos que las evaluaciones ICE de cada unidad quedaron debajo de su promedio (últimos ${M.meses} meses; niveles de 50, 75 y 90 % de esos puntos).${fuente} Publicado ${D.generado}.`, carpetas, `ZonasQueRestan_VDM_${D.hoy}.kmz`];
    };
    $('admKmz').addEventListener('click', async e => {
      const boton = e.target.closest('[data-kmz]'), aviso = $('admKmzEstado');
      if (!boton || boton.disabled) return;
      const tema = boton.dataset.kmz;
      if (!est.unidades.size) { aviso.textContent = 'Enciende al menos una unidad.'; return; }
      if (tema !== 'jefaturas' && !est.niveles.size) { aviso.textContent = 'Enciende al menos un nivel de zonas (núcleo, zona alta o amplia).'; return; }
      boton.disabled = true;
      aviso.textContent = 'Generando el KMZ...';
      try {
        const [titulo, descripcion, carpetas, nombre] = kmzDe(tema);
        if (!carpetas.length) { aviso.textContent = 'No hay zonas que descargar con las unidades encendidas.'; return; }
        Archivos.descargar(await Archivos.kmzCarpetas(titulo, descripcion, carpetas), nombre);
        aviso.textContent = `KMZ de ${TEMAS[tema].nombre.toLowerCase()} listo: revisa tus descargas.`;
      } catch (err) {
        console.error(err);
        aviso.textContent = 'No se pudo generar el KMZ.';
      } finally {
        boton.disabled = false;
      }
    });
  }

  // ── Mapa de clientes prioridad 1 ──────────────────────────────────────
  // p = [lat, lon, sap, nombre, unidad (índice), jefatura, semana, evaluado, último ICE, ruta]
  function prioridad1() {
    const panel = $('p-p1'), M = D.mapa, U = Ice.util;
    if (mapaP) { setTimeout(() => mapaP.invalidateSize(), 50); return; }
    const P = M.p1, conCoord = P.filter(p => p[0] != null);
    const evaluados = P.filter(p => p[7]).length;
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <p class="mapa-resumen"><b>${num(P.length)}</b> clientes prioridad 1 en ${num(D.unidades.length)} unidades · <b>${num(evaluados)}</b> ya evaluados en ${esc(D.mes)} (${P.length ? num(evaluados / P.length * 100, 0) : 0} %) y <b>${num(P.length - evaluados)}</b> por evaluar${P.length - conCoord.length ? ` · ${num(P.length - conCoord.length)} sin coordenadas` : ''}.</p>
          ${segmento('admP1Filtro', [['todos', 'Todos'], ['pendientes', 'Por evaluar'], ['evaluados', 'Evaluados']], 'todos', 'Clientes en el mapa')}
        </div>
        <div class="chips" id="admP1Unidades" role="group" aria-label="Unidades en el mapa">
          ${D.unidades.map((u, i) => { const de = P.filter(p => p[4] === i); return `<button type="button" class="chip" aria-pressed="true" data-unidad="${i}"><span class="adm-sw redondo" style="background:${color(u)}" aria-hidden="true"></span>${esc(u)} · ${num(de.filter(p => p[7]).length)}/${num(de.length)}</button>`; }).join('')}
        </div>
        <p class="mapa-ayuda">Prioridad 1 = clientes evaluados el mes anterior y con visitas ICE recurrentes antes: los más probables de volver a evaluarse. Punto lleno = por evaluar; punto hueco = ya evaluado en ${esc(D.mes)}. El color es la unidad y las líneas finas son los límites de las jefaturas. ${TACTIL ? 'Toca' : 'Haz clic en'} un cliente para ver sus datos.</p>
      </div>
      <div id="mapaAdmP1" class="mapa mapa-admin"></div>`;
    mapaP = L.map('mapaAdmP1', { preferCanvas: true });
    U.capaBase(mapaP);
    const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 10 : 4 });
    for (const j of M.jefaturas) L.polygon(j.anillos, { color: color(j.unidad), weight: 1.5, opacity: 0.8, fill: false, interactive: false }).addTo(mapaP);
    const capa = L.layerGroup().addTo(mapaP), marcas = [];
    for (const p of conCoord) {
      const u = D.unidades[p[4]], c = color(u);
      const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: 5.5, color: p[7] ? c : BLANCO, weight: p[7] ? 2 : 1.2, fillColor: p[7] ? BLANCO : c, fillOpacity: 0.95 })
        .bindPopup(() => `<div class="pc"><div class="pc-cab p1"><b>${esc(p[3] || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(p[2])}</strong></span><span>Prioridad 1 · ${esc(u)}</span></div>
          <dl class="pc-cuerpo">${fila('Jefatura', esc(p[5] || 'Sin jefatura'))}${fila('Ruta', esc(p[9]))}${fila('Semana habitual', p[6] ? `Semana ${p[6]} del mes` : '')}
            ${fila('Último ICE', p[8] == null ? '' : num(p[8], 1))}${fila(`Evaluado en ${D.mes}`, p[7] ? '<b>Sí</b>' : 'Todavía no')}</dl>
          <div class="pc-acciones"><a class="pc-btn" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${p[0]},${p[1]}">Ver en Google Maps</a></div></div>`, { maxWidth: 300 });
      if (!TACTIL) m.bindTooltip(`<b>${esc(p[3] || 'Cliente sin nombre')}</b> · ${esc(u)} · ${esc(p[5])}`, { direction: 'top', offset: [0, -4], opacity: 0.95 });
      m.dato = p;
      marcas.push(m);
    }
    const unidades = new Set(D.unidades.map((_, i) => i));
    let filtro = 'todos';
    const pintar = () => {
      capa.clearLayers();
      for (const m of marcas) {
        const p = m.dato;
        if (unidades.has(p[4]) && (filtro === 'todos' || (filtro === 'evaluados') === !!p[7])) capa.addLayer(m);
      }
    };
    pintar();
    if (conCoord.length) mapaP.fitBounds(U.limitesRobustos(conCoord.map(p => [p[0], p[1]])).pad(0.04)); else mapaP.setView([19.36, -99.14], 11);
    alElegir('admP1Filtro', v => { filtro = v; pintar(); });
    $('admP1Unidades').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true', i = +b.dataset.unidad;
      b.setAttribute('aria-pressed', on);
      if (on) unidades.add(i); else unidades.delete(i);
      pintar();
    });
  }

  return { render, mostrar };
})();
