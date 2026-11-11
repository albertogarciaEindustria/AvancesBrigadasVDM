/* Administrador del sitio ICE (ice.html): análisis de todas las unidades
 * operativas a la vez. Entra un usuario con "admin": true de
 * BaseDeDatos/ICEaccesoWeb.JSON; su sobre trae la llave de estos datos y la de
 * cada unidad, así que también puede abrir cualquier unidad.
 *
 *   · Comparativo: calificaciones de las unidades, diagrama de violín y ANOVA
 *     de un factor (grupos = unidades) con sus pruebas de respaldo y las
 *     comparaciones por pares.
 *   · Submétricas: qué parte de la calificación favorece o le resta a cada
 *     unidad, en Traditional y en On Premise.
 *   · Jefaturas: mapa de todas las jefaturas con los polígonos ICE encima.
 *   · Prioridad 1: mapa de los clientes prioridad 1 de todas las unidades.
 *
 * Los cálculos vienen hechos de Programas/admin_ice.py. */
const IceAdmin = (function () {
  'use strict';
  const { esc, num } = Util;
  const $ = id => document.getElementById(id);
  const ROJO = '#F40000', NEGRO = '#000000', BLANCO = '#FFFFFF', GRIS = '#8C8C8C';
  // Un color por unidad (el rojo queda para los polígonos ICE)
  const COLOR_UNIDAD = ['#111111', '#2F5BD0', '#4E9A2A', '#E8B500', '#9B30C9', '#8B5A3C', '#0FA3A3', '#D6408E'];
  const NIVELES = { 50: 'Núcleo', 75: 'Zona alta', 90: 'Zona amplia' };
  const RELLENO = { 50: 0.42, 75: 0.24, 90: 0.12 };
  const TACTIL = window.matchMedia('(pointer: coarse)').matches;
  const PESTANAS = [['comparativo', 'Comparativo y ANOVA'], ['submetricas', 'Submétricas'],
                    ['jefaturas', 'Mapa de jefaturas'], ['p1', 'Mapa prioridad 1']];

  let D = null, OP = null, mapaJ = null, mapaP = null;
  const estado = { periodo: 'mes', vista: 'Todas', canal: null };
  const color = u => COLOR_UNIDAD[D.unidades.indexOf(u) % COLOR_UNIDAD.length];
  const plural = (n, s, p) => `${num(n)} ${n === 1 ? s : (p || s + 's')}`;
  const signo = (v, dec = 1) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), dec)}`;
  const valorP = p => p == null ? '—' : p < 0.0001 ? `< 0.0001 <span class="muted">(${p.toExponential(1).replace(/e-?(\d+)/, ' × 10<sup>−$1</sup>')})</span>` : num(p, 4);
  const periodo = () => D.periodos.find(p => p.id === estado.periodo) || D.periodos[0];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fecha = iso => { const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return d ? `${d} ${MESES[m - 1]} ${a}` : '—'; };
  const fila = (k, v) => v == null || v === '' ? '' : `<dt>${esc(k)}</dt><dd>${v}</dd>`;

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

  function segmento(id, opciones, actual, etiqueta) {
    return `<div class="segmento" id="${id}" role="group" aria-label="${esc(etiqueta)}">${opciones.map(([v, t]) =>
      `<button type="button" data-valor="${esc(v)}" aria-pressed="${v === actual}">${esc(t)}</button>`).join('')}</div>`;
  }

  function alElegir(id, hacer) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      hacer(b.dataset.valor);
    });
  }

  // ── Página ────────────────────────────────────────────────────────────
  function render(datos, opciones) {
    D = datos;
    OP = opciones;
    estado.canal = D.canales[0];
    mostrar();
  }

  function mostrar() {
    for (const m of [mapaJ, mapaP]) if (m) m.remove();
    mapaJ = mapaP = null;
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
        ${PESTANAS.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="p-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''} data-pestana="${id}">${t}</button>`).join('')}
      </nav>
      <div class="ice-panel" id="p-comparativo" role="tabpanel" aria-labelledby="tab-comparativo"></div>
      <div class="ice-panel" id="p-submetricas" role="tabpanel" aria-labelledby="tab-submetricas" hidden></div>
      <div class="ice-panel ice-panel-mapa" id="p-jefaturas" role="tabpanel" aria-labelledby="tab-jefaturas" hidden></div>
      <div class="ice-panel ice-panel-mapa" id="p-p1" role="tabpanel" aria-labelledby="tab-p1" hidden></div>
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
    comparativo();
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
    if (cual === 'comparativo') comparativo();
    if (cual === 'submetricas') submetricas();
    if (cual === 'jefaturas') jefaturas();
    if (cual === 'p1') prioridad1();
  }

  const opcionesPeriodo = () => D.periodos.map(p => [p.id, p.nombre]);

  // ── Comparativo, violín y ANOVA ───────────────────────────────────────
  function comparativo() {
    const P = periodo(), A = P.analisis[estado.vista] || P.analisis.Todas;
    const orden = [...D.resumen].sort((a, b) => (b.promedio == null ? -1 : b.promedio) - (a.promedio == null ? -1 : a.promedio));
    const mes = D.periodos[0].analisis.Todas, G = mes.global;
    const con = orden.filter(r => r.promedio != null);
    const canal = (r, nombre) => r.por_canal.find(c => c.canal === nombre) || {};
    const tabla = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th>#</th><th class="izq">Unidad</th><th>ICE de ${esc(D.mes)}</th><th>Evaluaciones</th><th>Mediana</th>
        ${D.canales.map(c => `<th>${esc(c)}</th>`).join('')}<th>Estimación de cierre</th><th>${esc(D.resumen[0].mes_anterior.mes)}</th><th>P1 evaluados</th></tr></thead>
      <tbody>${orden.map((r, i) => `<tr>
        <td>${r.promedio == null ? '—' : i + 1}</td>
        <th class="izq"><span class="adm-sw" style="background:${color(r.unidad)}" aria-hidden="true"></span>${esc(r.unidad)}</th>
        <td><b>${num(r.promedio, 1)}</b> ${flecha(r.d_promedio)}</td><td>${num(r.n)}</td><td>${num(r.mediana, 1)}</td>
        ${D.canales.map(c => { const x = canal(r, c); return `<td>${num(x.promedio, 1)} <span class="muted">(${num(x.n || 0)})</span></td>`; }).join('')}
        <td>${r.estimacion ? `<b>${num(r.estimacion.valor, 1)}</b> <span class="muted">(${num(r.estimacion.bajo, 1)}–${num(r.estimacion.alto, 1)})</span>` : '—'}</td>
        <td>${num(r.mes_anterior.promedio, 1)} <span class="muted">(${num(r.mes_anterior.n)})</span></td>
        <td>${num(r.prioridad.p1_eval)} / ${num(r.prioridad.p1)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><th class="izq">Todas las unidades</th><td>${num(G.media, 1)}</td><td>${num(G.n || 0)}</td><td>${num(G.mediana, 1)}</td>
        ${D.canales.map(c => { const g = (D.periodos[0].analisis[c] || {}).global || {}; return `<td>${num(g.media, 1)} <span class="muted">(${num(g.n || 0)})</span></td>`; }).join('')}
        <td></td><td></td><td>${num(D.resumen.reduce((a, r) => a + r.prioridad.p1_eval, 0))} / ${num(D.resumen.reduce((a, r) => a + r.prioridad.p1, 0))}</td></tr></tfoot>
    </table></div>`;

    $('p-comparativo').innerHTML = `
      <div class="ice-kpis">
        ${kpi(`ICE de ${D.mes} · todas`, num(G.media, 1), `${plural(G.n || 0, 'evaluación', 'evaluaciones')} · mediana ${num(G.mediana, 1)}`, true)}
        ${con.length ? kpi('Unidad más alta', esc(con[0].unidad), `ICE ${num(con[0].promedio, 1)} · ${plural(con[0].n, 'evaluación', 'evaluaciones')}`) : ''}
        ${con.length > 1 ? kpi('Unidad más baja', esc(con[con.length - 1].unidad), `ICE ${num(con[con.length - 1].promedio, 1)} · ${plural(con[con.length - 1].n, 'evaluación', 'evaluaciones')}`) : ''}
        ${con.length > 1 ? kpi('Brecha entre unidades', num(con[0].promedio - con[con.length - 1].promedio, 1), 'puntos entre la más alta y la más baja') : ''}
      </div>
      ${seccion('Comparativo de unidades', `Calificación ICE de ${esc(D.mes)} al corte, ordenada de mayor a menor. Entre paréntesis, las evaluaciones. La estimación de cierre trae su rango probable.`, tabla)}
      ${seccion('Distribución y ANOVA', 'Elige el periodo y el canal: el violín y el análisis de varianza se calculan con esas evaluaciones.',
        `<div class="adm-controles">${segmento('admPeriodo', opcionesPeriodo(), estado.periodo, 'Periodo')}${segmento('admVista', [['Todas', 'Todos los canales'], ...D.canales.map(c => [c, c])], estado.vista, 'Canal')}</div>
         <div id="admAnalisis"></div>`)}`;
    alElegir('admPeriodo', v => { estado.periodo = v; analisis(); });
    alElegir('admVista', v => { estado.vista = v; analisis(); });
    analisis();
  }

  function analisis() {
    const P = periodo(), A = P.analisis[estado.vista], R = A.anova, alfa = D.alfa;
    const grupos = [...A.grupos].sort((a, b) => b.media - a.media);
    const titulo = `${estado.vista === 'Todas' ? 'Todos los canales' : estado.vista} · ${P.nombre}`;
    const tablaDesc = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th class="izq">Unidad</th><th>n</th><th>Media</th><th>IC 95 % de la media</th><th>Desv. est.</th><th>Mediana</th><th>Q1–Q3</th><th>Mín–Máx</th></tr></thead>
      <tbody>${grupos.map(g => `<tr><th class="izq"><span class="adm-sw" style="background:${color(g.unidad)}" aria-hidden="true"></span>${esc(g.unidad)}</th>
        <td>${num(g.n)}</td><td><b>${num(g.media, 2)}</b></td><td>${g.ic_bajo == null ? '—' : `${num(g.ic_bajo, 1)} a ${num(g.ic_alto, 1)}`}</td>
        <td>${num(g.de, 2)}</td><td>${num(g.mediana, 1)}</td><td>${num(g.q1, 1)}–${num(g.q3, 1)}</td><td>${num(g.min, 1)}–${num(g.max, 1)}</td></tr>`).join('')}</tbody>
    </table></div>`;

    let anova = '<p class="adm-nota">No hay suficientes evaluaciones para el ANOVA: se necesitan al menos dos unidades con dos evaluaciones cada una.</p>';
    if (R && R.F != null) {
      const rechaza = R.p < alfa;
      const tam = R.eta2 < 0.01 ? 'despreciable' : R.eta2 < 0.06 ? 'pequeño' : R.eta2 < 0.14 ? 'mediano' : 'grande';
      const W = R.welch, K = R.kruskal, L = R.levene;
      const coincide = [W && W.p != null ? W.p < alfa : null, K && K.p != null ? K.p < alfa : null].filter(x => x != null);
      const pares = [...R.pares].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
      const sig = pares.filter(x => x.p_holm < alfa);
      anova = `
        <div class="adm-hipotesis">
          <p><b>H₀</b> (hipótesis nula): la calificación ICE media es la misma en todas las unidades operativas; es decir, la forma de trabajar de cada unidad, que es distinta, <b>no afecta</b> la calificación.</p>
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
            ? `Con F(${num(R.gl1)}, ${num(R.gl2)}) = ${num(R.F, 2)} y p ${R.p < 0.0001 ? '< 0.0001' : '= ' + num(R.p, 4)} (menor que ${num(alfa, 2)}), las diferencias entre las medias de las unidades son mayores de lo que explicaría el azar: <b>la unidad operativa sí influye en la calificación ICE</b>.`
            : `Con F(${num(R.gl1)}, ${num(R.gl2)}) = ${num(R.F, 2)} y p = ${num(R.p, 4)} (no menor que ${num(alfa, 2)}), las diferencias entre las medias caben dentro de lo que explica el azar: <b>no hay evidencia de que la unidad operativa cambie la calificación ICE</b>.`}
            Tamaño del efecto <b>${tam}</b>: η² = ${num(R.eta2, 3)} (ω² = ${num(R.omega2, 3)}), la unidad explica el <b>${num(R.eta2 * 100, 1)} %</b> de la variación de las calificaciones; el resto es variación entre clientes de la misma unidad.</p>
        </div>
        <h3 class="adm-sub">Pruebas de respaldo</h3>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th class="izq">Prueba</th><th class="izq">Para qué</th><th>Estadístico</th><th>Valor p</th><th class="izq">Lectura</th></tr></thead>
          <tbody>
            ${L && L.W != null ? `<tr><th class="izq">Levene (Brown-Forsythe)</th><td class="izq">¿Las unidades tienen la misma varianza? (supuesto del ANOVA)</td><td>W = ${num(L.W, 2)}</td><td>${valorP(L.p)}</td><td class="izq">${L.p < alfa ? 'Varianzas distintas: pesa más la prueba de Welch' : 'Varianzas parecidas: el ANOVA clásico aplica'}</td></tr>` : ''}
            ${W && W.F != null ? `<tr><th class="izq">ANOVA de Welch</th><td class="izq">Igual que el ANOVA, sin suponer varianzas iguales</td><td>F(${num(W.gl1)}, ${num(W.gl2, 1)}) = ${num(W.F, 2)}</td><td>${valorP(W.p)}</td><td class="izq">${W.p < alfa ? 'Se rechaza H₀' : 'No se rechaza H₀'}</td></tr>` : ''}
            ${K && K.H != null ? `<tr><th class="izq">Kruskal-Wallis</th><td class="izq">Compara por rangos, sin suponer normalidad (el ICE es asimétrico y tiene tope)</td><td>H(${num(K.gl)}) = ${num(K.H, 2)}</td><td>${valorP(K.p)}</td><td class="izq">${K.p < alfa ? 'Se rechaza H₀' : 'No se rechaza H₀'}</td></tr>` : ''}
          </tbody>
        </table></div>
        <p class="adm-nota">${coincide.length && coincide.every(x => x === rechaza) ? 'Las pruebas de respaldo llegan a la misma conclusión que el ANOVA, así que no depende de sus supuestos.' : 'Las pruebas de respaldo no coinciden del todo con el ANOVA: toma la conclusión con cautela.'}</p>
        <h3 class="adm-sub">¿Qué unidades difieren entre sí?</h3>
        <p class="adm-nota">Comparaciones por pares con t de Welch; el valor p va corregido por Holm para las ${num(pares.length)} comparaciones. ${sig.length ? `<b>${num(sig.length)}</b> de ${num(pares.length)} pares son distintos de forma significativa.` : 'Ningún par es distinto de forma significativa.'} d = diferencia en desviaciones estándar (0.2 chica, 0.5 mediana, 0.8 grande).</p>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th class="izq">Par de unidades</th><th>Diferencia de medias</th><th>IC 95 %</th><th>d de Cohen</th><th>p (Holm)</th><th class="izq">¿Distintas?</th></tr></thead>
          <tbody>${pares.map(x => { const s = x.p_holm < alfa, arriba = x.dif >= 0 ? x.a : x.b, abajo = x.dif >= 0 ? x.b : x.a; return `<tr${s ? '' : ' class="adm-ns"'}>
            <th class="izq">${esc(arriba)} − ${esc(abajo)}</th><td><b>${signo(Math.abs(x.dif), 2)}</b></td>
            <td>${x.dif >= 0 ? `${num(x.bajo, 1)} a ${num(x.alto, 1)}` : `${num(-x.alto, 1)} a ${num(-x.bajo, 1)}`}</td><td>${num(Math.abs(x.d), 2)}</td><td>${valorP(x.p_holm)}</td>
            <td class="izq">${s ? `Sí: <b>${esc(arriba)}</b> califica más alto` : 'No se distinguen'}</td></tr>`; }).join('')}</tbody>
        </table></div>
        <p class="adm-nota"><b>Cómo leerlo.</b> El ANOVA dice si las unidades califican distinto, no por qué: además de la forma de trabajar de cada unidad influyen su mezcla de clientes y de canales, el territorio y el auditor que la evalúa. Por eso conviene verlo también por canal (botones de arriba) y con varios meses: si la diferencia se mantiene en todos, es más probable que venga de cómo trabaja la unidad. En la pestaña Submétricas se ve en qué parte de la calificación saca ventaja cada una.</p>`;
    }
    $('admAnalisis').innerHTML = `
      <h3 class="adm-sub">Diagrama de violín · ${esc(titulo)}</h3>
      <p class="adm-nota">Cada violín es la densidad de las calificaciones ICE de una unidad (kernel gaussiano) y cada punto una evaluación. Caja = Q1–Q3, círculo = mediana, línea = media, bigotes = 1.5 × RIC. La línea punteada es la media de todas las unidades.</p>
      <div class="g-scroll"><div class="grafica" id="admViolin"></div></div>
      ${tablaDesc}
      <h3 class="adm-sub">ANOVA de un factor · grupos = unidades operativas</h3>
      ${anova}`;
    const todos = A.grupos.flatMap(g => g.valores);
    if (todos.length) {
      const lo = Math.floor(Math.min(...todos) / 10) * 10, hi = Math.ceil((Math.max(...todos) + 2) / 10) * 10;
      Graficas.violin($('admViolin'), {
        titulo: `Distribución de calificaciones ICE por unidad, ${titulo}`, dominio: [lo, Math.max(hi, lo + 10)], alto: 440,
        minAncho: Math.max(560, A.grupos.length * 130),
        series: A.grupos.map(g => ({ nombre: g.unidad, valores: g.valores, color: color(g.unidad) })),
        objetivo: A.global.media != null ? { valor: A.global.media, etiqueta: `Media global ${num(A.global.media, 1)}` } : null,
      });
    }
  }

  // ── Submétricas: qué favorece a cada unidad ───────────────────────────
  function submetricas() {
    const P = periodo(), S = P.submetricas[estado.canal];
    // Solo las submétricas que el canal trae (en Traditional no hay Activación)
    const mets = D.metricas.map((m, i) => ({ ...m, i })).filter(m => S && S.unidades.some(u => u.dif[m.i] != null));
    let cuerpo = '<p class="adm-nota">No hay evaluaciones de este canal en el periodo.</p>';
    if (S && S.unidades.length) {
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
        const lista = mets.map(m => ({ nombre: m.nombre, v: u.puntos[m.i], firme: u.p[m.i] != null && u.p[m.i] < D.alfa }))
          .filter(x => x.v != null && x.firme && Math.abs(x.v) >= 0.05);
        const favor = lista.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
        const contra = lista.filter(x => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);
        const dif = u.ice_demas != null ? u.ice - u.ice_demas : null;
        return `<li><span class="adm-sw" style="background:${color(u.unidad)}" aria-hidden="true"></span><div><b>${esc(u.unidad)}</b> · ICE ${num(u.ice, 1)} en ${esc(estado.canal)}${dif != null ? ` (<b>${signo(dif, 1)}</b> contra las demás)` : ''} · ${plural(u.n, 'evaluación', 'evaluaciones')}
          <p><span class="adm-favor">Le favorece:</span> ${favor.length ? favor.map(x => `${esc(x.nombre)} <b>${signo(x.v, 2)}</b>`).join(' · ') : 'ninguna submétrica con ventaja clara'}</p>
          <p><span class="adm-contra">Le resta:</span> ${contra.length ? contra.map(x => `${esc(x.nombre)} <b>${signo(x.v, 2)}</b>`).join(' · ') : 'ninguna submétrica con desventaja clara'}</p></div></li>`;
      };
      const orden = [...S.unidades].sort((a, b) => b.ice - a.ice);
      const pesos = mets.map(m => S.pesos[m.i] != null ? `${m.nombre} ${num(S.pesos[m.i] * 100, 0)}` : null).filter(Boolean).join(', ');
      cuerpo = `
        <div class="tabla-scroll"><table class="ice-tabla adm-calor">
          <thead><tr><th class="izq">Unidad</th><th>ICE</th><th>Contra las demás</th>${mets.map(m => `<th>${esc(m.nombre)}</th>`).join('')}</tr></thead>
          <tbody>${orden.map(u => `<tr><th class="izq"><span class="adm-sw" style="background:${color(u.unidad)}" aria-hidden="true"></span>${esc(u.unidad)} <span class="muted">(${num(u.n)})</span></th>
            <td><b>${num(u.ice, 1)}</b></td><td>${u.ice_demas != null ? signo(u.ice - u.ice_demas, 1) : '—'}</td>${mets.map(m => celda(u, m.i)).join('')}</tr>`).join('')}</tbody>
          <tfoot><tr><th class="izq">Promedio de todas</th><td></td><td></td>${mets.map(m => `<td>${num(S.global[m.i], 0)} %</td>`).join('')}</tr></tfoot>
        </table></div>
        <p class="adm-nota">Cada celda: <b>puntos de ICE</b> que la submétrica le da (negro) o le quita (rojo) a la unidad contra el promedio de las demás unidades, y abajo su cumplimiento. Puntos = diferencia de cumplimiento × peso de la submétrica en el ICE de ${esc(estado.canal)}. «ns» y el tono tenue = la diferencia puede ser azar (t de Welch, p ≥ ${num(D.alfa, 2)}). ${pesos ? `Pesos estimados con ${num(S.n_pesos)} evaluaciones recientes (el reporte no trae la fórmula): ${esc(pesos)}.` : 'Sin pesos estimados para este canal: se muestra la diferencia de cumplimiento.'}</p>
        <h3 class="adm-sub">Qué parte de la calificación favorece a cada unidad · ${esc(estado.canal)}</h3>
        <ul class="adm-frases">${orden.map(frase).join('')}</ul>`;
    }
    $('p-submetricas').innerHTML = seccion('Submétricas por unidad',
      'En qué parte de la calificación ICE saca ventaja o pierde cada unidad frente a las demás, por canal.',
      `<div class="adm-controles">${segmento('admCanal', D.canales.map(c => [c, c]), estado.canal, 'Canal')}${segmento('admPeriodoS', opcionesPeriodo(), estado.periodo, 'Periodo')}</div>${cuerpo}`);
    alElegir('admCanal', v => { estado.canal = v; submetricas(); });
    alElegir('admPeriodoS', v => { estado.periodo = v; submetricas(); });
  }

  // ── Mapa de jefaturas con los polígonos ICE ───────────────────────────
  function etiqueta(texto, c) {
    return L.divIcon({ className: 'ruta-etiqueta jef-etiqueta', html: `<span style="background:${c};color:${Graficas.tintaSobre(c)}">${esc(texto)}</span>`, iconSize: null });
  }
  const centro = anillos => {
    const mayor = anillos.reduce((a, b) => b[0].length > a[0].length ? b : a)[0];
    return mayor.reduce((a, p) => [a[0] + p[0] / mayor.length, a[1] + p[1] / mayor.length], [0, 0]);
  };

  function jefaturas() {
    const panel = $('p-jefaturas'), M = D.mapa, U = Ice.util;
    if (mapaJ) { setTimeout(() => mapaJ.invalidateSize(), 50); return; }
    const hayPol = D.unidades.some(u => M.poligonos[u]);
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <p class="mapa-resumen">${M.jefaturas.length
            ? `<b>${num(M.jefaturas.length)}</b> jefaturas de <b>${num(D.unidades.length)}</b> unidades, con <b>${num(M.jefaturas.reduce((a, j) => a + j.clientes, 0))}</b> clientes activos de la Master Data. Encima, los polígonos ICE de los últimos ${num(M.meses)} meses${M.desde ? ` (del ${esc(fecha(M.desde))} al ${esc(fecha(M.hasta))})` : ''}.`
            : 'Las jefaturas se trazan con las calles de OpenStreetMap: aparecen en la siguiente publicación en que se puedan bajar. Por ahora solo van los polígonos ICE.'}</p>
          <button type="button" class="ice-btn rojo" id="admKmz"${M.jefaturas.length || hayPol ? '' : ' disabled'}>${U.svgIcono('descarga')}Descargar el mapa en KMZ</button>
        </div>
        <div class="chips" id="admJefUnidades" role="group" aria-label="Unidades en el mapa">
          ${D.unidades.map(u => `<button type="button" class="chip" aria-pressed="true" data-unidad="${esc(u)}"><span class="adm-sw" style="background:${color(u)}" aria-hidden="true"></span>${esc(u)}</button>`).join('')}
        </div>
        <div class="chips poli-rutas" id="admJefNiveles" role="group" aria-label="Polígonos ICE">
          <span class="poli-rutas-tit">Polígonos ICE:</span>
          ${[50, 75, 90].map(p => `<button type="button" class="chip" aria-pressed="${p !== 90}" data-nivel="${p}"><span class="poli-sw" style="--a:${RELLENO[p]}" aria-hidden="true"></span>${NIVELES[p]} (${p} %)</button>`).join('')}
        </div>
        <p class="mapa-ayuda">Cada jefatura lleva el color de su unidad y su nombre; sus límites corren por las calles y encierran a sus clientes. En rojo, las zonas donde se concentran los clientes evaluados en ICE de cada unidad (núcleo = 50 % de la densidad, zona alta = 75 %, zona amplia = 90 %). ${TACTIL ? 'Toca' : 'Haz clic en'} una jefatura o una zona para ver sus datos. El KMZ trae lo que esté encendido.</p>
        <p class="mapa-ayuda" id="admKmzEstado" role="status" aria-live="polite"></p>
      </div>
      <div id="mapaAdmJef" class="mapa mapa-admin"></div>`;
    mapaJ = L.map('mapaAdmJef');
    U.capaBase(mapaJ);
    mapaJ.createPane('polIce').style.zIndex = 420;
    const capasU = {}, capasN = { 50: L.layerGroup(), 75: L.layerGroup(), 90: L.layerGroup() };
    const encendidas = new Set(D.unidades), niveles = new Set([50, 75]);
    const todos = [];
    for (const u of D.unidades) {
      const c = color(u), grupo = capasU[u] = L.layerGroup().addTo(mapaJ);
      for (const j of M.jefaturas.filter(x => x.unidad === u)) {
        L.polygon(j.anillos, { color: c, weight: 3.5, opacity: 0.95, fillColor: c, fillOpacity: 0.12, lineJoin: 'miter' })
          .bindPopup(`<div class="pc"><div class="pc-cab" style="background:${c};color:${Graficas.tintaSobre(c)}"><b>Jefatura ${esc(j.jefatura)}</b><span>Unidad ${esc(u)}</span></div>
            <dl class="pc-cuerpo">${fila('Clientes activos', `${num(j.clientes)} <span class="muted">(${num(j.dentro / j.clientes * 100, 0)} % dentro del polígono)</span>`)}${fila('Rutas', num(j.rutas))}${fila('Superficie', `${num(j.area_km2, 1)} km²`)}
              ${fila(`ICE de ${D.mes}`, j.ice == null ? 'sin evaluaciones' : `<b>${num(j.ice, 1)}</b> <span class="muted">(${plural(j.n, 'evaluación', 'evaluaciones')})</span>`)}${fila('Clientes prioridad 1', num(j.p1))}</dl></div>`, { maxWidth: 300 })
          .addTo(grupo);
        L.marker(centro(j.anillos), { interactive: false, keyboard: false, icon: etiqueta(j.jefatura, c) }).addTo(grupo);
        for (const pol of j.anillos) for (const p of pol[0]) todos.push(p);
      }
      const R = M.poligonos[u];
      if (R) for (const n of R.niveles) n.poligonos.forEach((q, k) => {
        const capa = L.polygon(q.anillos, { pane: 'polIce', color: n.p === 50 ? '#C40000' : ROJO, weight: n.p === 50 ? 2 : 1.2, fillColor: ROJO, fillOpacity: RELLENO[n.p], lineJoin: 'miter' })
          .bindPopup(`<div class="pc"><div class="pc-cab${n.p === 50 ? ' p1' : ''}"><b>${NIVELES[n.p]} ${k + 1} · ${esc(u)}</b><span>Zonas que reúnen el ${n.p} % de la densidad de las evaluaciones ICE</span></div>
            <dl class="pc-cuerpo">${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${num(q.evaluaciones / R.evaluaciones * 100, 0)} % de la unidad)</span>`)}${fila('Clientes', num(q.clientes))}${fila('Superficie', `${num(q.area_km2, 2)} km²`)}</dl></div>`, { maxWidth: 300 });
        capa.unidad = u;
        capa.nivel = n.p;
        capasN[n.p].addLayer(capa);
        if (!todos.length || !M.jefaturas.length) for (const p of q.anillos[0]) todos.push(p);
      });
    }
    // Los polígonos ICE van de la zona amplia al núcleo y solo los de las unidades encendidas
    const capaIce = L.layerGroup().addTo(mapaJ);
    const ponerIce = () => {
      capaIce.clearLayers();
      for (const p of [90, 75, 50]) if (niveles.has(p)) capasN[p].eachLayer(c => { if (encendidas.has(c.unidad)) capaIce.addLayer(c); });
    };
    ponerIce();
    if (todos.length) mapaJ.fitBounds(U.limitesRobustos(todos).pad(0.03)); else mapaJ.setView([19.36, -99.14], 11);

    $('admJefUnidades').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true', u = b.dataset.unidad;
      b.setAttribute('aria-pressed', on);
      if (on) { encendidas.add(u); capasU[u].addTo(mapaJ); } else { encendidas.delete(u); mapaJ.removeLayer(capasU[u]); }
      ponerIce();
    });
    $('admJefNiveles').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true', p = +b.dataset.nivel;
      b.setAttribute('aria-pressed', on);
      if (on) niveles.add(p); else niveles.delete(p);
      ponerIce();
    });
    $('admKmz').addEventListener('click', async () => {
      const boton = $('admKmz'), aviso = $('admKmzEstado');
      boton.disabled = true;
      aviso.textContent = 'Generando el KMZ...';
      try {
        const carpetas = [];
        for (const u of D.unidades) {
          if (!encendidas.has(u)) continue;
          const js = M.jefaturas.filter(x => x.unidad === u);
          if (js.length) carpetas.push({ nombre: `Jefaturas · ${u}`, marcas: js.map(j => ({
            nombre: `Jefatura ${j.jefatura}`, color: color(u), relleno: 0.2, ancho: 3, poligonos: j.anillos,
            descripcion: `Unidad ${u} · ${num(j.clientes)} clientes activos · ${num(j.rutas)} rutas · ${num(j.area_km2, 1)} km²${j.ice != null ? ` · ICE de ${D.mes}: ${num(j.ice, 1)}` : ''}`,
            datos: { unidad: u, jefatura: j.jefatura, clientes: j.clientes, rutas: j.rutas, area_km2: j.area_km2, ice_del_mes: j.ice == null ? '' : j.ice, prioridad_1: j.p1 } })) });
          const R = M.poligonos[u];
          if (R) for (const n of [...R.niveles].sort((a, b) => b.p - a.p)) {
            if (!niveles.has(n.p) || !n.poligonos.length) continue;
            carpetas.push({ nombre: `Polígonos ICE · ${u} · ${NIVELES[n.p]} (${n.p} %)`, marcas: n.poligonos.map((q, k) => ({
              nombre: `${NIVELES[n.p]} ${k + 1} · ${u}`, color: ROJO, relleno: RELLENO[n.p], ancho: n.p === 50 ? 2 : 1.2, poligonos: [q.anillos],
              descripcion: `${num(q.evaluaciones)} evaluaciones de ${num(q.clientes)} clientes · ${num(q.area_km2, 2)} km²`,
              datos: { unidad: u, nivel_pct: n.p, evaluaciones: q.evaluaciones, clientes: q.clientes, area_km2: q.area_km2 } })) });
          }
        }
        const blob = await Archivos.kmzCarpetas('Jefaturas y polígonos ICE · Valle de México',
          `Jefaturas de las unidades operativas (clientes activos de la Master Data) y zonas donde se concentran los clientes evaluados en ICE en los últimos ${M.meses} meses.${M.calles ? ' Límites trazados sobre las calles de OpenStreetMap (© colaboradores de OpenStreetMap).' : ''} Publicado ${D.generado}.`, carpetas);
        Archivos.descargar(blob, `Jefaturas_y_PoligonosICE_VDM_${D.hoy}.kmz`);
        aviso.textContent = 'KMZ listo: revisa tus descargas.';
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
