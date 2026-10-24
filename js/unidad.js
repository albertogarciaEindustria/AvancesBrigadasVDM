/* Página de una unidad operativa (estilo KOF): información, mapa de clientes
 * y rutas activas del día. */
const Unidad = (function () {
  'use strict';
  const { esc, num, pct } = Util;

  let D = null, opc = {}, mapaC = null, mapaR = null, mosaicoVivo = false, buscadorListo = false;

  // Jefaturas: paleta categórica en orden fijo (sin el verde, que es "trabajado")
  const PALETA_JEF = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#e34948'];
  const GRIS_JEF = '#8a8985';
  const VERDE_TRAB = '#0a8f3c';
  // Evaluable ICE (/adduniversoice): anillo dorado; cliente brigadista en las
  // rutas: punto grande con borde oscuro
  const ORO_ICE = '#c28a00';
  const BORDE_BRIG = '#1d1d1b';
  // Los resaltados se achican al alejar el mapa para que no se encimen
  const escalaZoom = z => z >= 15 ? 1 : z >= 13 ? 0.8 : 0.6;

  // ── Semáforos (mismos cortes que ejemplo.py) ──────────────────────────
  const heatImpacto = v => v <= 170 ? 'critico' : v <= 190 ? 'serio' : 'ok';
  const tendColor = v => v >= 150 ? 'ok' : v >= 71 ? 'serio' : 'critico';
  const avanceEstilo = p => p >= 70 ? 'ok' : p >= 40 ? 'aviso' : 'critico';
  const promColor = v => v == null ? 'nulo' : v >= 95 ? 'ok' : v >= 90 ? 'aviso' : 'critico';
  const opColor = v => v == null ? 'nulo' : v >= 95 ? 'ok' : v >= 85 ? 'aviso' : 'critico';
  const diaColor = v => !v ? '' : v <= 5 ? 'd-rojo' : v < 8 ? 'd-amarillo' : v <= 10 ? 'd-verde' : 'd-morado';

  // Cambio contra el corte anterior, como ejemplo.py: ↑ / ↓ con la diferencia
  // (verde si mejora) y — amarillo si quedó igual; sin corte anterior no hay flecha
  function flecha(delta, subirEsBueno = true, dec = 1) {
    if (delta == null) return '';
    if (delta === 0) return '<span class="delta igual" title="igual que en el corte anterior">—</span>';
    const sube = delta > 0, bien = subirEsBueno === sube;
    return `<span class="delta ${bien ? 'bien' : 'mal'}" title="contra el corte anterior">${sube ? '↑' : '↓'}${num(Math.abs(delta), dec)}</span>`;
  }

  // Conteos (NoGeo, foto de foto...): como en ejemplo.py, sin marca si no cambió
  function conteo(v, delta) {
    return `<span class="conteo">${v > 0 ? `<b class="rojo">${num(v)}</b>` : '<span class="muted">—</span>'}${delta ? flecha(delta, false, 0) : ''}</span>`;
  }

  function repetidas(v, delta) {
    return `<span class="conteo">${v > 0 ? `<b class="rojo">-${num(v)}</b>` : '<span class="muted">—</span>'}${delta ? flecha(delta, false, 0) : ''}</span>`;
  }

  // % de posible mala práctica: la barra completa es 100% (no se escala al mayor)
  function barraMala(p, delta) {
    const ancho = p > 0 ? `max(2px, ${Math.min(100, p)}%)` : '0';
    return `<div class="celda mala"><span class="barra-mala" title="Escala de 0 a 100%"><span class="${p > 10 ? 'mal' : 'bien'}" style="width:${ancho}"></span></span><b>${pct(p)}</b>${flecha(delta, false)}</div>`;
  }

  const plural = (n, palabra) => `${num(n)} ${palabra}${n === 1 ? '' : 's'}`;

  // Encuadre que ignora el 1% de puntos más alejados en cada eje (clientes con
  // coordenadas atípicas alejarían todo el mapa)
  function limitesRobustos(puntos) {
    if (puntos.length < 20) return L.latLngBounds(puntos);
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
    const la = puntos.map(p => p[0]).sort((a, b) => a - b), lo = puntos.map(p => p[1]).sort((a, b) => a - b);
    return L.latLngBounds([q(la, 0.01), q(lo, 0.01)], [q(la, 0.99), q(lo, 0.99)]);
  }

  function cuadritos() {
    return '<span class="cuadritos" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  }

  function seccion(titulo, sub, cuerpo, extra = '') {
    return `<section class="kof-seccion ${extra}">
      <header class="kof-sec-cab">${cuadritos()}<div><h2>${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>
      ${cuerpo}
    </section>`;
  }

  // ── Render principal ──────────────────────────────────────────────────
  function render(datos, opciones = {}) {
    D = datos; opc = opciones;
    buscadorListo = false;
    Buscador.cerrar();
    if (mapaC) { mapaC.remove(); mapaC = null; }
    if (mapaR) { mapaR.remove(); mapaR = null; }
    document.body.className = 'modo-unidad';
    const raiz = document.getElementById('vistaUnidad');
    document.getElementById('vistaLider').hidden = true;
    raiz.hidden = false;
    raiz.innerHTML = `
      <header class="kof-cabecera">
        <canvas class="kof-mosaico" aria-hidden="true"></canvas>
        <div class="kof-cab-contenido">
          <p class="kof-marca">${cuadritos()} BRIGADAS VDM · EPICA</p>
          <h1>Unidad ${esc(D.unidad)}</h1>
          <p class="kof-cab-sub">Avance al ${esc(D.corte)} · publicado ${esc(D.generado)}</p>
        </div>
        <div class="kof-cab-acciones">
          ${opc.volver ? '<button type="button" class="kof-btn-cab" data-accion="volver">← Tablero líder</button>' : ''}
          <button type="button" class="kof-btn-cab" data-accion="salir">Salir</button>
        </div>
      </header>
      <nav class="kof-pestanas" role="tablist" aria-label="Secciones">
        <button role="tab" id="tab-info" aria-controls="panel-info" aria-selected="true" data-pestana="info">Información</button>
        <button role="tab" id="tab-buscador" aria-controls="panel-buscador" aria-selected="false" tabindex="-1" data-pestana="buscador">Buscador</button>
        <button role="tab" id="tab-mapa" aria-controls="panel-mapa" aria-selected="false" tabindex="-1" data-pestana="mapa">Mapa de clientes</button>
        <button role="tab" id="tab-rutas" aria-controls="panel-rutas" aria-selected="false" tabindex="-1" data-pestana="rutas">Rutas activas hoy</button>
      </nav>
      <div class="kof-panel" id="panel-info" role="tabpanel" aria-labelledby="tab-info"></div>
      <div class="kof-panel" id="panel-buscador" role="tabpanel" aria-labelledby="tab-buscador" hidden></div>
      <div class="kof-panel kof-panel-mapa" id="panel-mapa" role="tabpanel" aria-labelledby="tab-mapa" hidden></div>
      <div class="kof-panel kof-panel-mapa" id="panel-rutas" role="tabpanel" aria-labelledby="tab-rutas" hidden></div>
      <div class="ficha" id="ficha" hidden></div>`;

    raiz.querySelector('[data-accion="salir"]').addEventListener('click', () => opc.salir && opc.salir());
    const volver = raiz.querySelector('[data-accion="volver"]');
    if (volver) volver.addEventListener('click', () => { detener(); opc.volver(); });
    const tabs = [...raiz.querySelectorAll('.kof-pestanas [role="tab"]')];
    tabs.forEach(t => {
      t.addEventListener('click', () => pestana(t.dataset.pestana));
      t.addEventListener('keydown', e => {
        const i = tabs.indexOf(t);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
          tabs[j].focus(); pestana(tabs[j].dataset.pestana);
        }
      });
    });

    informacion();
    window.scrollTo(0, 0);
    iniciarMosaico(raiz.querySelector('.kof-mosaico'));
  }

  function detener() {
    mosaicoVivo = false;
    Graficas.Tip.hide();
  }

  function pestana(cual) {
    for (const t of document.querySelectorAll('.kof-pestanas [role="tab"]')) {
      const activa = t.dataset.pestana === cual;
      t.setAttribute('aria-selected', activa);
      t.tabIndex = activa ? 0 : -1;
    }
    for (const p of ['info', 'buscador', 'mapa', 'rutas']) document.getElementById('panel-' + p).hidden = p !== cual;
    Graficas.Tip.hide();
    if (cual === 'buscador' && !buscadorListo && D.buscador) {
      buscadorListo = true;
      Buscador.render(document.getElementById('panel-buscador'), D);
    }
    if (cual === 'mapa') mapaClientes();
    if (cual === 'rutas') mapaRutas();
  }

  // ── Información ───────────────────────────────────────────────────────
  function informacion() {
    const T = D.total;
    const panel = document.getElementById('panel-info');
    panel.innerHTML = `
      <div class="kof-kpis">
        ${kpi('Clientes impactados', num(T.clientes) + flecha(T.d_clientes, true, 0), `de ${num(T.objetivo)} · objetivo ${D.objetivo_mes} por lugar`, T.pct_avance, avanceEstilo(T.pct_avance))}
        ${kpi('Avance del mes', pct(T.pct_avance) + flecha(T.d_pct_avance), `${num(T.repetidas)} épicas repetidas no cuentan`)}
        ${kpi('Tendencia de cierre', num(T.tendencia) + flecha(T.d_tendencia, true, 0), `${num(T.pct_tendencia, 0)}% del objetivo de ${esc(D.mes)}`)}
        ${kpi('Promedio EPICA', (T.promedio == null ? '—' : num(T.promedio, 1)) + flecha(T.d_promedio), `objetivo ${D.objetivo_calificacion}`, null, promColor(T.promedio))}
        ${kpi('Posible mala práctica', pct(T.pct_mala) + flecha(T.d_pct_mala, false), `${num(T.mala)} de ${num(T.evaluaciones)} evaluaciones`, null, T.pct_mala > 10 ? 'critico' : 'ok')}
        ${kpi('Brigadistas', `${D.activos}<small> / ${D.lugares}</small>`, plural(D.lugares - D.activos, 'vacante'))}
      </div>
      ${seccion('Avance por brigadista', `Toca un nombre para ver su distribución de calificaciones y los clientes que visitó. Corte al ${esc(D.corte)}.`, tablaAvance())}
      ${seccion('Épicas por día', `Clientes distintos evaluados por día de ${esc(D.mes)}. Objetivo: 10 entre semana, 8 en sábado; domingo no laboral.`, tablaPorDia())}
      ${seccion('Oportunidades por ejecución', 'Promedio del % de cumplimiento (valor obtenido / target) por métrica en cada sesión. Verde ≥ 95%, ámbar 85–95%, rojo < 85%.', tablaOportunidad())}
      ${seccion('Ranking VDM', `Posición de las ${D.ranking.length} claves por clientes contables de ${esc(D.mes)} (sin foto de foto ni NoGeo). Resaltadas, las claves de ${esc(D.unidad)}. ↑ ↓ = cambio contra el corte anterior.`, ranking())}
      <p class="kof-nota">Épicas repetidas: visitas a clientes que otro brigadista ya había evaluado. NoGeo: cierre a más de ${D.no_geo_metros} m del cliente según la Master Data. Hacer base: varias épicas de clientes distintos cerradas desde un mismo punto. Disciplina operativa: entradas desde las 12:00, salidas antes de las 15:00 y días con más de 5 épicas por hora.</p>`;
    panel.querySelectorAll('.nombre-btn').forEach(b => b.addEventListener('click', () => abrirFicha(b.dataset.clave)));
  }

  function kpi(etiqueta, valor, sub, barra, estado) {
    return `<div class="kof-kpi">
      <p class="kpi-etiqueta">${esc(etiqueta)}</p>
      <p class="kpi-valor">${estado ? `<i class="punto ${estado}" aria-hidden="true"></i>` : ''}${valor}</p>
      ${barra != null ? `<div class="kpi-medidor"><span class="${avanceEstilo(barra)}" style="width:${Math.min(100, barra)}%"></span></div>` : ''}
      <p class="kpi-sub">${sub}</p>
    </div>`;
  }

  function tablaAvance() {
    const T = D.total;
    const filas = D.brigadistas.map(s => `
      <tr class="${s.vacante ? 'vacante' : ''}">
        <th scope="row"><button type="button" class="nombre-btn" data-clave="${esc(s.clave)}">
          <span class="clave">${esc(s.clave)}</span>${s.vacante ? '<span class="tag-vacante">Vacante</span>' : esc(s.nombre)}</button></th>
        <td class="num">${repetidas(s.repetidas, s.d_repetidas)}</td>
        <td><div class="celda"><i class="punto ${heatImpacto(s.clientes)}"></i><b>${num(s.clientes)}/${D.objetivo_mes}</b><span class="pill ${avanceEstilo(s.pct_avance)}">${pct(s.pct_avance)}</span>${flecha(s.d_clientes, true, 0)}</div></td>
        <td><div class="celda"><i class="punto ${tendColor(s.tendencia)}"></i><b>${num(s.tendencia)}</b><span class="muted">${num(s.pct_tendencia)}%</span>${flecha(s.d_tendencia, true, 0)}</div></td>
        <td class="num">${s.bono ? '<b class="verde">+ BONO</b>' : s.epicas_dia == null ? '<span class="muted">—</span>' : `<b>${num(s.epicas_dia)}</b>`}</td>
        <td>${s.promedio == null ? '<span class="muted">Sin EPICA</span>' : `<div class="celda"><i class="punto ${promColor(s.promedio)}"></i><b>${num(s.promedio, 1)}</b>${flecha(s.d_promedio)}</div>`}</td>
        <td class="num">${conteo(s.disciplina, s.d_disciplina)}</td>
        <td class="num">${conteo(s.hacer_base, s.d_hacer_base)}</td>
        <td class="num">${conteo(s.no_geo, s.d_no_geo)}</td>
        <td class="num">${conteo(s.fdf, s.d_fdf)}</td>
        <td>${barraMala(s.pct_mala, s.d_pct_mala)}</td>
      </tr>`).join('');
    return `<div class="tabla-scroll"><table class="kof-tabla tabla-avance">
      <thead><tr>
        <th scope="col">Nombre</th><th scope="col">Épicas<br>repetidas</th>
        <th scope="col">Clientes impactados<br>y % de avance</th>
        <th scope="col">Tendencia</th>
        <th scope="col">Épicas<br>por día</th><th scope="col">Promedio<br>épicas</th>
        <th scope="col">Disciplina<br>operativa</th><th scope="col">Hacer<br>base</th>
        <th scope="col">No<br>GEO</th><th scope="col">Error foto<br>de foto</th>
        <th scope="col">% posible<br>mala práctica</th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr>
        <th scope="row">TOTAL Y PROMEDIO</th>
        <td class="num">${repetidas(T.repetidas, T.d_repetidas)}</td>
        <td><div class="celda"><b>${num(T.clientes)}/${num(T.objetivo)}</b><span class="pill ${avanceEstilo(T.pct_avance)}">${pct(T.pct_avance)}</span>${flecha(T.d_clientes, true, 0)}</div></td>
        <td><div class="celda"><b>${num(T.tendencia)}</b><span class="muted">${num(T.pct_tendencia, 0)}%</span>${flecha(T.d_tendencia, true, 0)}</div></td>
        <td class="num"><b>${num(T.epicas_dia)}</b></td>
        <td><div class="celda"><i class="punto ${promColor(T.promedio)}"></i><b>${T.promedio == null ? '—' : num(T.promedio, 1)}</b>${flecha(T.d_promedio)}</div></td>
        <td class="num">${conteo(T.disciplina, T.d_disciplina)}</td><td class="num">${conteo(T.hacer_base, T.d_hacer_base)}</td>
        <td class="num">${conteo(T.no_geo, T.d_no_geo)}</td><td class="num">${conteo(T.fdf, T.d_fdf)}</td>
        <td>${barraMala(T.pct_mala, T.d_pct_mala)}</td>
      </tr></tfoot>
    </table></div>`;
  }

  function tablaPorDia() {
    const P = D.por_dia, dias = P.dias;
    const clase = d => [d.obj == null ? 'domingo' : '', d.d > D.dia_corte ? 'futuro' : ''].join(' ');
    const totDia = dias.map(d => P.filas.reduce((a, f) => a + (f.dias[d.d] || 0), 0));
    const cab = dias.map(d => `<th scope="col" class="${clase(d)}"><span>${d.d}</span><small>${d.sem}</small></th>`).join('');
    const filas = P.filas.map(f => `<tr class="${f.vacante ? 'vacante' : ''}">
        <th scope="row"><span class="clave">${esc(f.clave)}</span>${esc(f.vacante ? 'Vacante' : f.corto)}</th>
        ${dias.map(d => { const v = f.dias[d.d] || 0; return `<td class="${clase(d)} ${diaColor(v)}">${v || ''}</td>`; }).join('')}
        <td class="total">${num(f.total)}</td></tr>`).join('');
    return `<div class="tabla-scroll"><table class="kof-tabla tabla-dias">
      <thead><tr><th scope="col">Brigadista</th>${cab}<th scope="col" class="total">Total</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr><th scope="row">Objetivo por persona</th>${dias.map(d => `<td class="${clase(d)}">${d.obj ?? ''}</td>`).join('')}<td class="total"></td></tr>
        <tr><th scope="row">Total unidad</th>${totDia.map((v, i) => `<td class="${clase(dias[i])}">${v || ''}</td>`).join('')}<td class="total">${num(totDia.reduce((a, b) => a + b, 0))}</td></tr>
      </tfoot>
    </table></div>
    <div class="leyenda-dias">
      <span><i class="d-rojo"></i>1 a 5</span><span><i class="d-amarillo"></i>6 a 7</span>
      <span><i class="d-verde"></i>8 a 10</span><span><i class="d-morado"></i>más de 10</span>
      <span><i class="domingo"></i>domingo</span>
    </div>`;
  }

  function tablaOportunidad() {
    const O = D.oportunidad;
    const celda = (p, d) => p == null ? '<td class="op"><span class="muted">—</span></td>'
      : `<td class="op"><div class="op-celda"><span class="op-barra"><span class="${opColor(p)}" style="width:${Math.min(100, p)}%"></span></span><b>${num(p, 1)}%</b>${flecha(d)}</div></td>`;
    return `<div class="tabla-scroll"><table class="kof-tabla tabla-op">
      <thead><tr><th scope="col">Nombre</th>${D.metricas.map(m => `<th scope="col">${esc(m)}</th>`).join('')}</tr></thead>
      <tbody>${O.filas.map(f => `<tr class="${f.vacante ? 'vacante' : ''}"><th scope="row"><span class="clave">${esc(f.clave)}</span>${esc(f.vacante ? 'Vacante' : f.nombre)}</th>${f.pcts.map((p, i) => celda(p, f.deltas[i])).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">PROMEDIO ZONA</th>${O.promedio.map((p, i) => celda(p, (O.deltas || [])[i])).join('')}</tr></tfoot>
    </table></div>`;
  }

  // Ranking en lista: posición y clave (sin nombres de otras unidades), promedio,
  // % de avance con sus evaluaciones y las señales de posible mala práctica
  function ranking() {
    const mias = new Set(D.brigadistas.map(b => b.clave));
    const medalla = ['oro', 'plata', 'bronce'];
    const filas = D.ranking.map((r, i) => `
      <tr class="${mias.has(r.clave) ? 'mia' : ''} ${r.vacante ? 'vacante' : ''}">
        <th scope="row"><div class="rk-id"><span class="rk-pos ${medalla[i] || ''}">${r.pos}</span>
          <span class="rk-clave">${esc(r.clave)}${r.vacante ? ' <span class="tag-vacante">Vacante</span>' : ''}</span>${flecha(r.d_pos, true, 0)}</div></th>
        <td>${r.promedio == null ? '<span class="muted">Sin EPICA</span>' : `<div class="celda"><i class="punto ${promColor(r.promedio)}"></i><b>${num(r.promedio, 1)}</b>${flecha(r.d_promedio)}</div>`}</td>
        <td><div class="celda rk-avance" title="${num(r.clientes)} clientes contables de ${D.objetivo_mes}"><span class="op-barra"><span class="${avanceEstilo(r.pct_avance)}" style="width:${Math.min(100, r.pct_avance)}%"></span></span><b>${pct(r.pct_avance)}</b>${flecha(r.d_pct_avance)}</div></td>
        <td class="num"><b>${num(r.evaluaciones)}</b>${flecha(r.d_evaluaciones, true, 0)}</td>
        <td class="num">${conteo(r.no_geo, r.d_no_geo)}</td>
        <td class="num">${conteo(r.fdf, r.d_fdf)}</td>
        <td>${barraMala(r.pct_mala, r.d_pct_mala)}</td>
      </tr>`).join('');
    return `<div class="tabla-scroll"><table class="kof-tabla tabla-ranking">
      <thead><tr>
        <th scope="col">Posición</th><th scope="col">Promedio<br>total</th>
        <th scope="col">% de avance</th><th scope="col">Evaluaciones</th>
        <th scope="col">No<br>GEO</th><th scope="col">Foto<br>de foto</th>
        <th scope="col">% posible<br>mala práctica</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
  }

  // ── Ficha de brigadista ───────────────────────────────────────────────
  function abrirFicha(clave) {
    const s = D.brigadistas.find(b => b.clave === clave), f = D.fichas[clave];
    if (!s || !f) return;
    const st = Util.estadisticas(f.calificaciones);
    const sobre = st.n ? f.calificaciones.filter(v => v >= D.objetivo_calificacion).length : 0;
    const ficha = document.getElementById('ficha');
    ficha.hidden = false;
    document.body.classList.add('sin-scroll');
    ficha.innerHTML = `
      <div class="ficha-caja" role="dialog" aria-modal="true" aria-labelledby="fichaTitulo">
        <header class="ficha-cab">
          <div>
            <p class="ficha-clave">${cuadritos()} ${esc(s.clave)} · posición ${s.pos ?? '—'} del ranking</p>
            <h2 id="fichaTitulo">${esc(s.vacante ? 'Lugar vacante' : s.nombre)}</h2>
          </div>
          <button type="button" class="ficha-cerrar" aria-label="Cerrar">✕</button>
        </header>
        <div class="ficha-cuerpo">
          <div class="ficha-mini">
            ${mini('Evaluaciones', num(s.evaluaciones))}
            ${mini('Clientes impactados', `${num(s.clientes)} <small>(${pct(s.pct_avance)})</small>`)}
            ${mini('Promedio EPICA', s.promedio == null ? '—' : num(s.promedio, 1))}
            ${mini('NoGeo', num(s.no_geo))}
            ${mini('Foto de foto', num(s.fdf))}
            ${mini('Posible mala práctica', pct(s.pct_mala))}
          </div>
          <h3>Distribución de calificaciones EPICA Total</h3>
          <p class="ficha-nota">Calificación EPICA Total (máximo 110) de cada sesión única de ${esc(D.mes)}; barras cada 5 puntos y curva de densidad (kernel gaussiano).</p>
          ${st.n ? `<div class="ficha-dist">
            <div class="grafica g-clara" id="fichaHisto"></div>
            <table class="ficha-stats">
              <caption>Estadística descriptiva</caption>
              <tr><th scope="row">n</th><td>${num(st.n)}</td></tr>
              <tr><th scope="row">Media</th><td>${num(st.media, 2)}</td></tr>
              <tr><th scope="row">IC 95% de la media</th><td>${num(st.ic[0], 1)} – ${num(st.ic[1], 1)}</td></tr>
              <tr><th scope="row">Mediana</th><td>${num(st.mediana, 1)}</td></tr>
              <tr><th scope="row">Desviación estándar</th><td>${num(st.de, 2)}</td></tr>
              <tr><th scope="row">Q1 – Q3</th><td>${num(st.q1, 1)} – ${num(st.q3, 1)}</td></tr>
              <tr><th scope="row">Mínimo – máximo</th><td>${num(st.min, 1)} – ${num(st.max, 1)}</td></tr>
              <tr><th scope="row">Sesiones ≥ ${D.objetivo_calificacion}</th><td>${num(sobre)} (${pct(sobre / st.n * 100)})</td></tr>
            </table>
          </div>` : '<p class="muted">Sin calificaciones en el mes.</p>'}
          <h3>Clientes visitados <small>(${num(f.visitas.length)})</small></h3>
          <div class="visitas-filtros">
            <input type="search" id="visitasBuscar" placeholder="Buscar SAP, cliente o jefatura" aria-label="Buscar cliente">
            <div class="chips" role="group" aria-label="Filtro">
              <button type="button" class="chip on" data-f="todos">Todos</button>
              <button type="button" class="chip" data-f="nogeo">Con NoGeo</button>
              <button type="button" class="chip" data-f="fdf">Foto de foto</button>
              <button type="button" class="chip" data-f="lejos">Más de ${D.no_geo_metros} m</button>
            </div>
          </div>
          <div class="tabla-scroll"><table class="kof-tabla tabla-visitas">
            <thead><tr><th scope="col">Fecha</th><th scope="col">SAP</th><th scope="col">Cliente</th><th scope="col">Jefatura</th>
              <th scope="col">Ubicación GPS</th><th scope="col">Distancia</th><th scope="col">Foto de foto</th><th scope="col">NoGeo</th><th scope="col">Calif.</th></tr></thead>
            <tbody id="visitasCuerpo"></tbody>
          </table></div>
          <p class="ficha-nota">Ubicación GPS: coordenadas del cliente en la Master Data. Distancia: metros entre esas coordenadas y el punto donde se cerró la encuesta (EPICAgeoeficiencia).</p>
        </div>
      </div>`;

    let filtro = 'todos', busca = '';
    const pintar = () => {
      const q = busca.trim().toLowerCase();
      const filas = f.visitas.filter(v => {
        if (filtro === 'nogeo' && !v[10]) return false;
        if (filtro === 'fdf' && !v[9]) return false;
        if (filtro === 'lejos' && !(v[8] > D.no_geo_metros)) return false;
        return !q || `${v[1]} ${v[2]} ${v[3]}`.toLowerCase().includes(q);
      });
      document.getElementById('visitasCuerpo').innerHTML = filas.length ? filas.map(filaVisita).join('')
        : '<tr><td colspan="9" class="muted vacio">Sin clientes con ese filtro.</td></tr>';
    };
    pintar();
    ficha.querySelector('#visitasBuscar').addEventListener('input', e => { busca = e.target.value; pintar(); });
    ficha.querySelectorAll('.chips .chip').forEach(b => b.addEventListener('click', () => {
      ficha.querySelectorAll('.chips .chip').forEach(x => x.classList.toggle('on', x === b));
      filtro = b.dataset.f; pintar();
    }));
    const cerrar = () => { ficha.hidden = true; ficha.innerHTML = ''; document.body.classList.remove('sin-scroll'); Graficas.Tip.hide(); document.removeEventListener('keydown', esc_); };
    const esc_ = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', esc_);
    ficha.querySelector('.ficha-cerrar').addEventListener('click', cerrar);
    ficha.onclick = e => { if (e.target === ficha) cerrar(); };
    ficha.querySelector('.ficha-cerrar').focus();

    if (st.n) {
      const css = getComputedStyle(document.body);
      Graficas.histograma(document.getElementById('fichaHisto'), {
        titulo: 'Distribución de calificaciones', valores: f.calificaciones,
        dominio: [0, Math.max(110, Math.ceil(st.max))], paso: 5,
        color: css.getPropertyValue('--kof-rojo-suave').trim(), colorLinea: css.getPropertyValue('--kof-rojo').trim(),
        lineas: [
          { valor: st.media, etiqueta: `Media ${num(st.media, 1)}`, color: css.getPropertyValue('--tinta').trim() },
          { valor: st.mediana, etiqueta: `Mediana ${num(st.mediana, 1)}`, color: css.getPropertyValue('--tinta2').trim(), punteada: true },
          { valor: D.objetivo_calificacion, etiqueta: `Objetivo ${D.objetivo_calificacion}`, color: css.getPropertyValue('--ok').trim(), punteada: true },
        ],
      });
    }
  }

  function mini(etiqueta, valor) {
    return `<div class="mini"><p>${esc(etiqueta)}</p><b>${valor}</b></div>`;
  }

  function filaVisita(v) {
    const [fecha, sap, nombre, jef, lat, lon, latc, lonc, dist, fdf, nogeo, cal, propio] = v;
    const la = lat ?? latc, lo = lon ?? lonc;
    const gps = la != null
      ? `<div class="gps"><span class="g-num">${num(la, 5)}, ${num(lo, 5)}</span>
           <a class="btn-google" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${la},${lo}">Ver en Google</a>
           ${latc != null && lat != null ? `<a class="link-cierre" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${latc},${lonc}">cierre ↗</a>` : ''}</div>`
      : '<span class="muted">Sin coordenadas</span>';
    const d = dist == null ? '<span class="muted">—</span>'
      : `<span class="badge ${dist > D.no_geo_metros ? 'mal' : 'bien'}">${num(dist)} m</span>`;
    const sino = x => x ? '<span class="badge mal">Sí</span>' : '<span class="muted">No</span>';
    return `<tr>
      <td class="g-num nowrap">${esc(fecha)}</td>
      <td class="g-num">${esc(sap)}</td>
      <td>${esc(nombre)}${propio ? '' : ' <span class="tag-rep" title="Otro brigadista ya había evaluado este cliente">repetida</span>'}</td>
      <td>${esc(jef || '—')}</td>
      <td>${gps}</td><td>${d}</td><td>${sino(fdf)}</td><td>${sino(nogeo)}</td>
      <td class="nowrap">${cal == null ? '—' : `<i class="punto ${promColor(cal)}"></i>${num(cal, 1)}`}</td>
    </tr>`;
  }

  // ── Mapas ─────────────────────────────────────────────────────────────
  let trianguloListo = false;
  function prepararTriangulo() {
    if (trianguloListo) return;
    trianguloListo = true;
    L.Canvas.include({
      _updateTriangulo(layer) {
        if (!this._drawing || layer._empty()) return;
        const p = layer._point, ctx = this._ctx, r = Math.max(Math.round(layer._radius), 1);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 1.2);
        ctx.lineTo(p.x + r * 1.05, p.y + r * 0.8);
        ctx.lineTo(p.x - r * 1.05, p.y + r * 0.8);
        ctx.closePath();
        this._fillStroke(ctx, layer);
      },
    });
  }
  const Triangulo = () => L.CircleMarker.extend({ _updatePath() { this._renderer._updateTriangulo(this); } });

  function capaBase(mapa) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
  }

  // Botón "Mi ubicación": sigue la posición del celular o la computadora
  // (GPS, Wi-Fi o red, lo que tenga el equipo) con un punto azul y su círculo
  // de precisión. La primera lectura centra el mapa; otro toque lo apaga.
  const ICONO_GPS = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>`;

  function botonUbicacion(mapa) {
    let vigilancia = null, punto = null, circulo = null, centrado = false, boton = null, aviso = null, tAviso = null;

    const avisar = texto => {
      aviso.textContent = texto;
      aviso.hidden = false;
      clearTimeout(tAviso);
      tAviso = setTimeout(() => { aviso.hidden = true; }, 6000);
    };
    const estado = e => {
      boton.classList.toggle('activo', e === 'activo');
      boton.classList.toggle('buscando', e === 'buscando');
      boton.setAttribute('aria-pressed', e === 'apagado' ? 'false' : 'true');
      boton.title = e === 'apagado' ? 'Mostrar mi ubicación' : 'Dejar de mostrar mi ubicación';
    };
    const apagar = () => {
      if (vigilancia != null) navigator.geolocation.clearWatch(vigilancia);
      vigilancia = null; centrado = false;
      if (punto) { mapa.removeLayer(punto); mapa.removeLayer(circulo); punto = circulo = null; }
      estado('apagado');
    };
    const encontrada = pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude], prec = Math.round(pos.coords.accuracy);
      if (!punto) {
        circulo = L.circle(ll, { radius: prec, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }).addTo(mapa);
        punto = L.marker(ll, { keyboard: false, zIndexOffset: 1000,
          icon: L.divIcon({ className: 'yo-icono', html: '<span class="yo-punto"></span>', iconSize: [22, 22] }) }).addTo(mapa);
      }
      punto.setLatLng(ll);
      circulo.setLatLng(ll).setRadius(prec);
      punto.bindPopup(`<div class="pc"><div class="pc-cab yo"><b>Estás aquí</b><span>Precisión ±${num(prec)} m</span></div>
        <a class="pc-btn sec" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}">Ver en Google Maps</a></div>`);
      estado('activo');
      if (!centrado) {
        centrado = true;
        mapa.setView(ll, Math.max(mapa.getZoom(), 16));
        if (prec > 500) avisar(`Ubicación aproximada (±${num(prec)} m): este equipo no tiene GPS o no tiene señal.`);
      }
    };
    const fallo = err => {
      apagar();
      avisar(err.code === 1 ? 'Sin permiso de ubicación: actívalo para esta página en tu navegador y vuelve a intentar.'
           : err.code === 3 ? 'La ubicación tardó demasiado. Intenta de nuevo (en exteriores el GPS responde mejor).'
           : 'No se pudo obtener tu ubicación: este equipo no tiene GPS o la ubicación está apagada.');
    };
    const encender = () => {
      if (!('geolocation' in navigator) || !window.isSecureContext) {
        avisar('Este navegador no puede dar tu ubicación (se necesita una página https).');
        return;
      }
      estado('buscando');
      vigilancia = navigator.geolocation.watchPosition(encontrada, fallo,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    };

    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const caja = L.DomUtil.create('div', 'leaflet-bar ctl-ubicacion');
        boton = L.DomUtil.create('button', '', caja);
        boton.type = 'button';
        boton.innerHTML = ICONO_GPS;
        boton.setAttribute('aria-label', 'Mi ubicación');
        estado('apagado');
        L.DomEvent.disableClickPropagation(caja);
        L.DomEvent.on(boton, 'click', () => (vigilancia == null ? encender() : apagar()));
        return caja;
      },
    });
    new Control().addTo(mapa);
    aviso = L.DomUtil.create('div', 'mapa-aviso', mapa.getContainer());
    aviso.setAttribute('role', 'status');
    aviso.hidden = true;
    mapa.on('unload', apagar);
  }

  // ── Ficha de cliente al tocarlo ───────────────────────────────────────
  // En celular el dedo casi nunca cae exacto sobre el punto: si el toque no le
  // da a ningún cliente se abre la ficha del más cercano (hasta RADIO_TOQUE px).
  // En computadora, al pasar el mouse se ve el nombre y el SAP.
  const TACTIL = window.matchMedia('(pointer: coarse)').matches;
  const RADIO_TOQUE = TACTIL ? 26 : 14;
  const AYUDA_TOQUE = `<p class="mapa-ayuda">👆 ${TACTIL ? 'Toca' : 'Haz clic en'} un cliente para ver su nombre, su SAP y cómo llegar.</p>`;

  function toqueCercano(mapa, marcadores) {
    mapa.on('click', e => {
      let mejor = null, dMin = RADIO_TOQUE;
      for (const m of marcadores) {
        if (!mapa.hasLayer(m)) continue;
        const d = mapa.latLngToContainerPoint(m.getLatLng()).distanceTo(e.containerPoint);
        if (d < dMin) { dMin = d; mejor = m; }
      }
      if (mejor) mejor.openPopup();
    });
  }

  function etiquetaCliente(m, nombre, sap) {
    if (!TACTIL) m.bindTooltip(`<b>${esc(nombre || 'Cliente sin nombre')}</b> · SAP ${esc(sap)}`, { direction: 'top', offset: [0, -6], opacity: 0.95 });
  }

  // Ficha: nombre, SAP, estado, botones para llegar y después los detalles
  function fichaCliente({ nombre, sap, estado, clase = '', fondo = '', lat, lon, detalles }) {
    return `<div class="pc"><div class="pc-cab ${clase}"${fondo ? ` style="background:${fondo}"` : ''}>
        <b>${esc(nombre || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(sap)}</strong></span><span>${estado}</span></div>
      ${enlacesGoogle(lat, lon)}
      <dl class="pc-cuerpo">${detalles}</dl></div>`;
  }

  function enlacesGoogle(lat, lon) {
    return `<a class="pc-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving">🧭 Cómo llegar</a>
            <a class="pc-btn sec" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">Ver en Google Maps</a>`;
  }

  function filaPop(k, v) { return v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : ''; }

  function mapaClientes() {
    const panel = document.getElementById('panel-mapa');
    if (mapaC) { setTimeout(() => mapaC.invalidateSize(), 50); return; }
    prepararTriangulo();
    const M = D.mapa;
    const jefOrden = M.jefaturas.map((j, i) => ({ j, i }))
      .sort((a, b) => (a.j === 'Sin jefatura') - (b.j === 'Sin jefatura') || a.j.localeCompare(b.j, 'es', { numeric: true }));
    const colorJef = {};
    let slot = 0;
    for (const { j, i } of jefOrden) colorJef[i] = j === 'Sin jefatura' || slot >= PALETA_JEF.length ? GRIS_JEF : PALETA_JEF[slot++];
    const porJef = {};
    for (const p of M.faltantes) (porJef[p[4]] = porJef[p[4]] || []).push(p);
    const ICE = !!D.universo_ice;

    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-resumen">Universo de clientes brigadistas: <b>${num(M.universo)}</b> · trabajados <b>${num(M.trabajados_universo)}</b> (${pct(M.universo ? M.trabajados_universo / M.universo * 100 : 0)}) · faltan <b>${num(M.faltantes.length)}</b>${ICE
          ? `, de ellos <b>${num(M.faltantes_ice)}</b> también evaluables ICE (<span class="ice-anillo" aria-hidden="true"></span> anillo dorado)` : ''}</div>
        <div class="mapa-controles">
          <div class="chips" id="chipsMapa">
            <button type="button" class="chip on" data-capa="trab"><svg width="12" height="12" aria-hidden="true">${Graficas.marcaSvg('circulo', 6, 6, 5, VERDE_TRAB)}</svg>Trabajados (${num(M.trabajados.length)})</button>
            ${jefOrden.filter(({ i }) => porJef[i]).map(({ j, i }) => `<button type="button" class="chip on" data-capa="j${i}"><svg width="12" height="12" aria-hidden="true">${Graficas.marcaSvg('triangulo', 6, 6.5, 5, colorJef[i])}</svg>Faltan ${esc(j)} (${num(porJef[i].length)})</button>`).join('')}
            ${ICE ? `<button type="button" class="chip" data-solo-ice aria-pressed="false"><span class="ice-anillo" aria-hidden="true"></span>Solo faltantes ICE (${num(M.faltantes_ice)})</button>` : ''}
          </div>
          <div class="buscador">
            <input type="search" id="buscaCliente" placeholder="Buscar SAP o cliente" aria-label="Buscar SAP o cliente" autocomplete="off">
            <ul id="buscaResultados" class="busca-res" hidden></ul>
          </div>
        </div>
        ${AYUDA_TOQUE}
      </div>
      <div id="mapaClientes" class="mapa"></div>`;

    mapaC = L.map('mapaClientes', { preferCanvas: true });
    capaBase(mapaC);
    botonUbicacion(mapaC);
    const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
    const Tri = Triangulo();
    const capas = {}, indice = [];
    const limites = [];

    capas.trab = L.layerGroup();
    for (const p of M.trabajados) {
      const [lat, lon, sap, nombre, ji, zpv, ruta, ice, quien, fecha, cal] = p;
      const m = L.circleMarker([lat, lon], { renderer: rend, radius: 5.5, color: '#fff', weight: 1.5,
                                             fillColor: VERDE_TRAB, fillOpacity: 0.95 });
      m.bindPopup(() => fichaCliente({ nombre, sap, lat, lon, clase: 'ok', estado: '✅ Trabajado',
        detalles: `${filaPop('Trabajado por', quien)}${filaPop('Fecha', fecha)}${filaPop('Calificación', cal == null ? '' : num(cal, 1))}
          ${filaPop('Jefatura', M.jefaturas[ji])}${filaPop('Frecuencia', zpv)}${filaPop('Ruta', ruta)}${ICE ? filaPop('Evaluable ICE', ice ? 'Sí' : 'No') : ''}` }));
      etiquetaCliente(m, nombre, sap);
      m.addTo(capas.trab);
      indice.push({ sap, nombre, m, lat, lon });
      limites.push([lat, lon]);
    }
    // Cada jefatura tiene dos subcapas: faltantes evaluables ICE (con anillo
    // dorado, encima) y los demás, que "Solo faltantes ICE" oculta
    const otros = {}, conIce = {}, anillos = [];
    for (const [ji, lista] of Object.entries(porJef)) {
      const capa = capas['j' + ji] = L.layerGroup();
      otros[ji] = L.layerGroup().addTo(capa);
      conIce[ji] = L.layerGroup().addTo(capa);
      for (const p of lista) {
        const [lat, lon, sap, nombre, , zpv, ruta, ice] = p;
        if (ice) anillos.push(L.circleMarker([lat, lon], { renderer: rend, radius: 9.5, color: ORO_ICE, weight: 2.5, fill: false, interactive: false }).addTo(conIce[ji]));
        const m = new Tri([lat, lon], { renderer: rend, radius: ice ? 6 : 5, color: ice ? BORDE_BRIG : '#fff', weight: ice ? 1.4 : 1,
                                        fillColor: colorJef[ji], fillOpacity: 0.9 });
        m.bindPopup(() => fichaCliente({ nombre, sap, lat, lon, clase: 'falta', estado: `▲ Falta${ice ? ' · evaluable ICE' : ''}`,
          detalles: `${filaPop('Jefatura', M.jefaturas[ji])}${filaPop('Frecuencia', zpv)}${filaPop('Ruta', ruta)}${ICE ? filaPop('Evaluable ICE', ice ? 'Sí' : 'No') : ''}` }));
        etiquetaCliente(m, nombre, sap);
        m.addTo(ice ? conIce[ji] : otros[ji]);
        indice.push({ sap, nombre, m, lat, lon });
        limites.push([lat, lon]);
      }
    }
    // Faltantes abajo, trabajados encima
    Object.keys(capas).filter(k => k !== 'trab').forEach(k => capas[k].addTo(mapaC));
    capas.trab.addTo(mapaC);
    if (limites.length) mapaC.fitBounds(limitesRobustos(limites).pad(0.04));
    else mapaC.setView([19.38, -99.14], 11);
    let escalaC = null;
    const ajustarAnillos = () => {
      const e = escalaZoom(mapaC.getZoom());
      if (e === escalaC) return;
      escalaC = e;
      anillos.forEach(a => { a.setRadius(9.5 * e); a.setStyle({ weight: e < 1 ? 2 : 2.5 }); });
    };
    ajustarAnillos();
    mapaC.on('zoomend', ajustarAnillos);

    panel.querySelectorAll('#chipsMapa .chip[data-capa]').forEach(b => b.addEventListener('click', () => {
      const capa = capas[b.dataset.capa], on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      if (on) capa.addTo(mapaC); else mapaC.removeLayer(capa);
      if (on && b.dataset.capa !== 'trab') capas.trab.eachLayer(l => l.bringToFront());
    }));
    const soloIce = panel.querySelector('#chipsMapa [data-solo-ice]');
    if (soloIce) soloIce.addEventListener('click', () => {
      const on = !soloIce.classList.contains('on');
      soloIce.classList.toggle('on', on);
      soloIce.setAttribute('aria-pressed', on);
      for (const ji of Object.keys(otros)) {
        if (on) capas['j' + ji].removeLayer(otros[ji]);
        else {
          capas['j' + ji].addLayer(otros[ji]);
          if (mapaC.hasLayer(capas['j' + ji])) conIce[ji].eachLayer(l => l.bringToFront());
        }
      }
      if (mapaC.hasLayer(capas.trab)) capas.trab.eachLayer(l => l.bringToFront());
    });
    toqueCercano(mapaC, indice.map(x => x.m));
    buscador(document.getElementById('buscaCliente'), document.getElementById('buscaResultados'), indice, mapaC);
  }

  function buscador(input, lista, indice, mapa) {
    const cerrar = () => { lista.hidden = true; lista.innerHTML = ''; };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 3) return cerrar();
      const res = indice.filter(x => x.sap.startsWith(q) || x.nombre.toLowerCase().includes(q)).slice(0, 8);
      lista.innerHTML = res.length ? res.map((x, i) => `<li><button type="button" data-i="${i}"><b>${esc(x.sap)}</b> ${esc(x.nombre)}</button></li>`).join('')
        : '<li class="muted">Sin coincidencias</li>';
      lista.hidden = false;
      lista.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const x = res[+b.dataset.i];
        cerrar(); input.value = x.sap;
        mapa.setView([x.lat, x.lon], 17);
        setTimeout(() => x.m.openPopup(), 300);
      }));
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    document.addEventListener('click', e => { if (!lista.contains(e.target) && e.target !== input) cerrar(); });
  }

  // Colores de ruta: ángulo dorado sobre el círculo de matiz (uno distinto
  // por SalesTerritoryCode; la etiqueta con el código acompaña al color)
  function colorRuta(i) {
    const h = (i * 137.508) % 360, s = 0.68, l = 0.42;
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
  }

  function mapaRutas() {
    const panel = document.getElementById('panel-rutas');
    if (mapaR) { setTimeout(() => mapaR.invalidateSize(), 50); return; }
    mapaR = rutasEnPanel(panel, D.rutas, { ice: !!D.universo_ice });
  }

  // ── Jóvenes Construyendo el Futuro (página del líder) ─────────────────
  // Pin negro con una persona: va en HTML encima del lienzo de las rutas y no
  // se confunde con los puntos de color de los clientes
  const ICONO_JOVEN = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
    <circle cx="12" cy="7" r="4.2"/><path d="M3.8 21.5c.6-4.6 4-7.5 8.2-7.5s7.6 2.9 8.2 7.5z"/></svg>`;

  function metros(a, b, c, d) {
    const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
    return 6371000 * Math.hypot(x, y);
  }
  const distanciaTxt = m => m < 1000 ? `${num(m)} m` : `${num(m / 1000, m < 10000 ? 1 : 0)} km`;
  const telefonoTxt = t => t && t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : (t || '');

  // Las 3 rutas de hoy con un cliente más cerca del joven
  function rutasCercanas(j, rutas) {
    return rutas.map(r => {
      let d = Infinity;
      for (const p of r.puntos) d = Math.min(d, metros(j.lat, j.lon, p[0], p[1]));
      return { codigo: r.codigo, d };
    }).filter(x => x.d < Infinity).sort((a, b) => a.d - b.d).slice(0, 3);
  }

  function fichaJoven(j, cercanas, unidad, cuando) {
    const tel = telefonoTxt(j.telefono);
    return `<div class="pc"><div class="pc-cab jcf">
        <b>${esc(j.nombre)}</b><span>Joven Construyendo el Futuro · ${esc(unidad)}</span></div>
      ${j.telefono ? `<div class="pc-fila">
        <a class="pc-btn" href="tel:+52${esc(j.telefono)}">📞 Llamar</a>
        <a class="pc-btn sec" target="_blank" rel="noopener" href="https://wa.me/52${esc(j.telefono)}">WhatsApp</a></div>` : ''}
      ${enlacesGoogle(j.lat, j.lon)}
      <dl class="pc-cuerpo">${filaPop('Teléfono', tel || 'Sin teléfono')}${filaPop('Coordenadas', `${j.lat}, ${j.lon}`)}
        ${cercanas.length ? `<dt>Rutas cerca ${esc(cuando)}</dt><dd>${cercanas.map(c => `${esc(c.codigo)} · ${distanciaTxt(c.d)}`).join('<br>')}</dd>` : ''}</dl></div>`;
  }

  // Mapa de rutas activas en `panel` (la pestaña de la unidad y la página
  // Jóvenes del Futuro del líder, que manda `jovenes`, `unidad` y puede mandar
  // otro día de la semana con R.hoy = false). Devuelve el mapa.
  function rutasEnPanel(panel, R, { ice = false, jovenes = null, unidad = '' } = {}) {
    const rutas = R.rutas, ICE = ice, J = jovenes;
    const total = rutas.reduce((a, r) => a + r.puntos.length, 0);
    const cuenta = (r, k) => r.puntos.reduce((a, p) => a + (p[k] ? 1 : 0), 0);
    const totBrig = rutas.reduce((a, r) => a + cuenta(r, 6), 0), totIce = rutas.reduce((a, r) => a + cuenta(r, 7), 0);
    const fecha = R.fecha.split('-').reverse().join('/');
    const hoy = R.hoy !== false, dia = R.dia.toLowerCase(), cuando = hoy ? 'hoy' : `el ${dia}`;
    const cercanas = (J || []).map(j => rutasCercanas(j, rutas));
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-resumen">${hoy ? 'Rutas activas hoy' : 'Rutas que tocan'}${unidad ? ` en <b>${esc(unidad)}</b>` : ''} ${hoy ? `· <b>${esc(R.dia)} ${fecha}</b>` : `el <b>${esc(dia)} ${fecha}</b>`} (frecuencia <b>${esc(R.letra)}</b>) · <b>${num(rutas.length)}</b> rutas · <b>${num(total)}</b> clientes. Cada SalesTerritoryCode tiene su color y su etiqueta (visible al acercar el mapa); las líneas unen a los clientes de la misma ruta.</div>
        <div class="mapa-resumen rutas-resaltados">${J ? `<span class="jcf-sw" aria-hidden="true"></span> Jóvenes Construyendo el Futuro (<b>${num(J.length)}</b>) · ` : ''}Resaltados: <b>1º</b> <span class="brig-punto" aria-hidden="true"></span> cliente brigadista (<b>${num(totBrig)}</b>)${ICE
          ? ` · <b>2º</b> <span class="ice-anillo" aria-hidden="true"></span> evaluable ICE (<b>${num(totIce)}</b>)` : ''}</div>
        <div class="mapa-controles">
          <div class="chips">
            ${J ? '<button type="button" class="chip on" data-r="jovenes" aria-pressed="true"><span class="jcf-sw" aria-hidden="true"></span>Jóvenes</button>' : ''}
            <button type="button" class="chip on" data-r="brig" aria-pressed="true"><span class="brig-punto" aria-hidden="true"></span>Resaltar brigadistas</button>
            ${ICE ? '<button type="button" class="chip on" data-r="ice" aria-pressed="true"><span class="ice-anillo" aria-hidden="true"></span>Resaltar ICE</button>' : ''}
            <button type="button" class="chip" data-r="todas">Mostrar todas</button>
            <button type="button" class="chip" data-r="ninguna">Ocultar todas</button>
            <button type="button" class="chip on" data-r="etiquetas">Etiquetas</button>
          </div>
        </div>
        ${AYUDA_TOQUE}
      </div>
      <div class="rutas-cuerpo">
        <div class="mapa"></div>
        <aside class="rutas-lista" aria-label="${J ? 'Jóvenes y rutas' : 'Rutas'}">
          ${J ? `<h3 class="rutas-sub">Jóvenes Construyendo el Futuro (${num(J.length)})</h3>
          <ul class="jcf-lista">${J.length ? J.map((j, i) => `
            <li><span class="jcf-sw" aria-hidden="true"></span>
              <span class="jcf-txt"><b>${esc(j.nombre)}</b><small>${cercanas[i].length ? `Ruta más cerca: ${esc(cercanas[i][0].codigo)} a ${distanciaTxt(cercanas[i][0].d)}` : `Sin rutas ${esc(cuando)}`}</small></span>
              <button type="button" class="ruta-ir" data-j="${i}" aria-label="Ver a ${esc(j.nombre)} en el mapa">↗</button></li>`).join('')
            : `<li class="muted">Sin jóvenes en ${esc(unidad)}: agrégalos con /jcfvdm en el bot.</li>`}</ul>
          <h3 class="rutas-sub">${hoy ? 'Rutas activas' : `Rutas del ${esc(dia)}`} (${num(rutas.length)})</h3>` : ''}
          <input type="search" class="busca-ruta" placeholder="Buscar ruta o jefatura" aria-label="Buscar ruta">
          <ul class="lista-rutas">${rutas.map((r, i) => `
            <li><label><input type="checkbox" checked data-i="${i}">
              <span class="ruta-sw" style="background:${colorRuta(i)}"></span>
              <span class="ruta-cod">${esc(r.codigo)}</span>
              <span class="ruta-info">${esc(r.jefatura || '—')} · ${num(r.puntos.length)} · ${num(cuenta(r, 6))} brig.${ICE ? ` · ${num(cuenta(r, 7))} ICE` : ''}</span></label>
              <button type="button" class="ruta-ir" data-i="${i}" aria-label="Ver ruta ${esc(r.codigo)}">↗</button></li>`).join('')}
          </ul>
        </aside>
      </div>`;

    const mapaR = L.map(panel.querySelector('.mapa'), { preferCanvas: true });
    capaBase(mapaR);
    botonUbicacion(mapaR);
    const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
    // Resaltado: 1º cliente brigadista (punto grande con borde oscuro, encima
    // de todo) y 2º evaluable ICE (anillo dorado alrededor del punto)
    let resaltarBrig = true, resaltarIce = ICE, escalaR = 1;
    const estiloPunto = (brig, color) => resaltarBrig && brig
      ? { radius: 7 * escalaR, color: BORDE_BRIG, weight: escalaR < 1 ? 2 : 2.5, fillColor: color, fillOpacity: 1 }
      : { radius: Math.max(3, 4 * escalaR), color: '#fff', weight: 1.2, fillColor: color, fillOpacity: 1 };
    const radioHalo = brig => (resaltarBrig && brig ? 11 : 7.5) * escalaR;
    const reestilar = () => marcadores.forEach(x => {
      const e = estiloPunto(x.brig, x.color);
      x.m.setRadius(e.radius); x.m.setStyle(e);
      if (x.halo) { x.halo.setRadius(radioHalo(x.brig)); x.halo.setStyle({ weight: escalaR < 1 ? 2 : 2.5 }); }
    });
    const grupos = [], limites = [], marcadores = [];
    rutas.forEach((r, i) => {
      const color = colorRuta(i), coords = r.puntos.map(p => [p[0], p[1]]);
      const g = { linea: L.polyline(coords, { renderer: rend, color, weight: 2.5, opacity: 0.85 }), puntos: L.layerGroup(),
                  halos: L.layerGroup(), visible: true };
      g.linea.bindTooltip(`${r.codigo} · ${r.puntos.length} clientes`, { sticky: true });
      for (const p of r.puntos) {
        const [lat, lon, sap, nombre, zpv, trab, brig, ice] = p;
        const etiquetasPop = [brig ? 'cliente brigadista' : '', ice ? 'evaluable ICE' : ''].filter(Boolean).join(' · ');
        const m = L.circleMarker([lat, lon], { renderer: rend, ...estiloPunto(brig, color) })
          .bindPopup(() => fichaCliente({ nombre, sap, lat, lon, fondo: color, estado: `Ruta ${esc(r.codigo)}${etiquetasPop ? ' · ' + etiquetasPop : ''}`,
            detalles: `${filaPop('Jefatura', r.jefatura)}${filaPop('Frecuencia ZPV', zpv)}${filaPop('Cliente brigadista', brig ? 'Sí' : 'No')}${ICE ? filaPop('Evaluable ICE', ice ? 'Sí' : 'No') : ''}${filaPop('Trabajado por brigada', trab ? 'Sí' : 'No')}` }))
          .addTo(g.puntos);
        etiquetaCliente(m, nombre, sap);
        const halo = ice ? L.circleMarker([lat, lon], { renderer: rend, radius: radioHalo(brig), color: ORO_ICE, weight: 2.5, fill: false, interactive: false }).addTo(g.halos) : null;
        marcadores.push({ m, halo, brig, color, g });
        limites.push([lat, lon]);
      }
      const c = coords.reduce((a, p) => [a[0] + p[0] / coords.length, a[1] + p[1] / coords.length], [0, 0]);
      const tinta = Graficas.tintaSobre(color);
      g.etiqueta = L.marker(c, { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'ruta-etiqueta', html: `<span style="background:${color};color:${tinta}">${esc(r.codigo)}</span>`, iconSize: null }) });
      g.limites = L.latLngBounds(coords);
      grupos.push(g);
    });
    // Jóvenes: el nombre bajo el pin aparece con las etiquetas de las rutas
    const capaJ = L.layerGroup(), pinesJ = (J || []).map((j, i) => {
      limites.push([j.lat, j.lon]);
      return L.marker([j.lat, j.lon], { zIndexOffset: 1000, title: j.nombre,
        icon: L.divIcon({ className: 'jcf-icono', iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34],
          html: `<span class="jcf-pin">${ICONO_JOVEN}</span><span class="jcf-nombre">${esc(j.nombre)}</span>` }) })
        .bindPopup(() => fichaJoven(j, cercanas[i], unidad, cuando)).addTo(capaJ);
    });
    if (J) capaJ.addTo(mapaR);
    let etiquetas = true;
    const pintarEtiquetas = () => {
      const ver = etiquetas && mapaR.getZoom() >= 13;
      grupos.forEach(g => { if (ver && g.visible) g.etiqueta.addTo(mapaR); else mapaR.removeLayer(g.etiqueta); });
      mapaR.getContainer().classList.toggle('jcf-con-nombre', ver);
    };
    toqueCercano(mapaR, marcadores.map(x => x.m).concat(pinesJ));
    const alFrente = () => marcadores.forEach(x => { if (x.brig && resaltarBrig && x.g.visible) x.m.bringToFront(); });
    const mostrar = (g, on) => {
      g.visible = on;
      for (const capa of [g.linea, g.halos, g.puntos]) {
        if (on && (capa !== g.halos || resaltarIce)) capa.addTo(mapaR); else mapaR.removeLayer(capa);
      }
    };
    grupos.forEach(g => mostrar(g, true));
    alFrente();
    if (limites.length) mapaR.fitBounds(limitesRobustos(limites).pad(0.04), { maxZoom: 16 });
    else mapaR.setView([19.38, -99.14], 11);
    pintarEtiquetas();
    const ajustarEscala = () => {
      const e = escalaZoom(mapaR.getZoom());
      if (e !== escalaR) { escalaR = e; reestilar(); }
    };
    ajustarEscala();
    mapaR.on('zoomend', () => { pintarEtiquetas(); ajustarEscala(); });

    const chipJ = panel.querySelector('[data-r="jovenes"]');
    if (chipJ) chipJ.addEventListener('click', () => {
      const on = !chipJ.classList.contains('on');
      chipJ.classList.toggle('on', on);
      chipJ.setAttribute('aria-pressed', on);
      if (on) capaJ.addTo(mapaR); else mapaR.removeLayer(capaJ);
    });
    panel.querySelectorAll('.ruta-ir[data-j]').forEach(b => b.addEventListener('click', () => {
      const m = pinesJ[+b.dataset.j];
      if (chipJ && !chipJ.classList.contains('on')) chipJ.click();
      mapaR.setView(m.getLatLng(), Math.max(mapaR.getZoom(), 16));
      setTimeout(() => m.openPopup(), 300);
      if (window.innerWidth < 860) mapaR.getContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    const checks = [...panel.querySelectorAll('.lista-rutas input[type="checkbox"]')];
    checks.forEach(ch => ch.addEventListener('change', () => { mostrar(grupos[+ch.dataset.i], ch.checked); alFrente(); pintarEtiquetas(); }));
    panel.querySelectorAll('[data-r="brig"], [data-r="ice"]').forEach(b => b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      if (b.dataset.r === 'brig') {
        resaltarBrig = on;
        reestilar();
        alFrente();
      } else {
        resaltarIce = on;
        grupos.forEach(g => mostrar(g, g.visible));
        alFrente();
      }
    }));
    panel.querySelectorAll('.ruta-ir[data-i]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, g = grupos[i];
      if (!g.visible) { checks[i].checked = true; mostrar(g, true); alFrente(); }
      mapaR.fitBounds(g.limites.pad(0.15));
      g.linea.setStyle({ weight: 6 });
      setTimeout(() => g.linea.setStyle({ weight: 2.5 }), 1800);
      pintarEtiquetas();
    }));
    panel.querySelector('[data-r="todas"]').addEventListener('click', () => { grupos.forEach((g, i) => { checks[i].checked = true; mostrar(g, true); }); alFrente(); pintarEtiquetas(); });
    panel.querySelector('[data-r="ninguna"]').addEventListener('click', () => { grupos.forEach((g, i) => { checks[i].checked = false; mostrar(g, false); }); pintarEtiquetas(); });
    panel.querySelector('[data-r="etiquetas"]').addEventListener('click', e => { etiquetas = !etiquetas; e.currentTarget.classList.toggle('on', etiquetas); pintarEtiquetas(); });
    panel.querySelector('.busca-ruta').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      panel.querySelectorAll('.lista-rutas li').forEach((li, i) => {
        li.hidden = !!q && !`${rutas[i].codigo} ${rutas[i].jefatura}`.toLowerCase().includes(q);
      });
    });
    return mapaR;
  }

  // ── Mosaico de cuadros rojos de la cabecera ───────────────────────────
  function iniciarMosaico(lienzo) {
    const ctx = lienzo.getContext('2d');
    const TONOS = ['#ff5a5f', '#f7323a', '#e41e2b', '#c8102e', '#9e0b14', '#ffffff'];
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let celdas = [], cols = 0, filas = 0, lado = 14, hueco = 3, W = 0, H = 0, ultimo = 0;
    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = lienzo.clientWidth; H = lienzo.clientHeight;
      lienzo.width = W * dpr; lienzo.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lado = W < 640 ? 10 : 14;
      cols = Math.ceil(W / (lado + hueco)); filas = Math.ceil(H / (lado + hueco));
      celdas = Array.from({ length: cols * filas }, () => nueva());
    };
    const nueva = () => ({ c: TONOS[(Math.random() * (TONOS.length - 1)) | 0], a: 0, meta: Math.random() < 0.55 ? Math.random() * 0.9 : 0 });
    const dibujar = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < celdas.length; i++) {
        const x = (i % cols), y = (i / cols) | 0, z = celdas[i];
        z.a += (z.meta - z.a) * 0.18;
        const desvanecido = Math.max(0, (x / cols - 0.25) / 0.75);   // aparecen hacia la derecha
        const alfa = z.a * desvanecido * (z.c === '#ffffff' ? 0.5 : 1);
        if (alfa < 0.02) continue;
        ctx.globalAlpha = alfa;
        ctx.fillStyle = z.c;
        ctx.fillRect(x * (lado + hueco) + 2, y * (lado + hueco) + 2, lado, lado);
      }
      ctx.globalAlpha = 1;
    };
    const bucle = t => {
      if (!mosaicoVivo || !lienzo.isConnected) return;
      requestAnimationFrame(bucle);
      if (document.hidden || t - ultimo < (reducido ? 2000 : 90)) return;
      ultimo = t;
      const n = Math.max(1, celdas.length * 0.035 | 0);
      for (let k = 0; k < n; k++) {
        const z = celdas[(Math.random() * celdas.length) | 0];
        if (Math.random() < 0.5) z.c = TONOS[(Math.random() * TONOS.length) | 0];
        z.meta = Math.random() < 0.55 ? 0.25 + Math.random() * 0.75 : 0;
      }
      dibujar();
    };
    medir();
    for (const z of celdas) z.a = z.meta;
    dibujar();
    mosaicoVivo = true;
    requestAnimationFrame(bucle);
    window.addEventListener('resize', () => { if (lienzo.isConnected) { medir(); dibujar(); } });
  }

  return { render, detener, botonUbicacion, rutasEnPanel };
})();
