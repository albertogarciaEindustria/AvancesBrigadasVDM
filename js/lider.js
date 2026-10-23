/* Página LiderBrigadasVDM: tablero negro con las métricas de las 5 unidades
 * operativas (tabla de /avancegloballider y gráficas), mapa de NoGeo y mapa de
 * rutas activas con los Jóvenes Construyendo el Futuro. */
const Lider = (function () {
  'use strict';
  const { esc, num, pct } = Util;

  // Paleta categórica (pasos para fondo oscuro) en orden fijo por unidad;
  // la dispersión agrega forma porque son más de 3 series a la vez.
  const COLORES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
  const FORMAS = ['circulo', 'cuadro', 'triangulo', 'rombo', 'cruz'];
  const COLOR_KOF = '#f0efec';
  const RIESGO = '#e66767';

  let D = null, opc = {}, colorDe = {}, formaDe = {}, mapaN = null, mapaJ = null;
  // Jóvenes del Futuro: número de la última unidad pedida (descifrar tarda) y
  // el dibujo que espera a que la pestaña esté visible
  let pedidoJ = 0, pendienteJ = null;

  const semAvance = p => p >= 20 ? 'ok' : 'critico';
  const semTend = p => p >= 100 ? 'ok' : p >= 90 ? 'aviso' : 'critico';
  const semCal = (v, obj) => v == null ? 'nulo' : v >= obj ? 'ok' : v >= 90 ? 'aviso' : 'critico';
  const semMala = p => p > 5 ? 'serio' : 'ok';

  // Cambio contra el corte anterior (como ejemplo.py): verde si mejora, rojo si
  // empeora y — amarillo si quedó igual; sin corte anterior no se dibuja
  function flecha(delta, subirEsBueno = true, dec = 1, sufijo = '') {
    if (delta == null) return '';
    if (delta === 0) return '<span class="delta igual" title="igual que en el corte anterior">—</span>';
    const sube = delta > 0, bien = subirEsBueno === sube;
    return `<span class="delta ${bien ? 'bien' : 'mal'}" title="contra el corte anterior">${sube ? '▲' : '▼'} ${num(Math.abs(delta), dec)}${sufijo}</span>`;
  }

  function bloque(titulo, sub, cuerpo, clase = '') {
    return `<section class="ld-bloque ${clase}">
      <header><h2>${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</header>${cuerpo}</section>`;
  }

  function render(datos, opciones = {}) {
    D = datos; opc = opciones;
    if (mapaN) { mapaN.remove(); mapaN = null; }
    if (mapaJ) { mapaJ.remove(); mapaJ = null; }
    pedidoJ++; pendienteJ = null;
    document.body.className = 'modo-lider';
    document.getElementById('vistaUnidad').hidden = true;
    const raiz = document.getElementById('vistaLider');
    raiz.hidden = false;
    D.unidades.forEach((u, i) => { colorDe[u.nombre] = COLORES[i % COLORES.length]; formaDe[u.nombre] = FORMAS[i % FORMAS.length]; });
    const K = D.tabla.find(f => f.es_total);

    raiz.innerHTML = `
      <header class="ld-cab">
        <div>
          <p class="ld-kicker">${esc('LIDERBRIGADASVDM')} · TABLERO DE CONTROL</p>
          <h1>Brigadas Valle de México</h1>
          <p class="ld-sub">${D.unidades.length} unidades operativas · ${D.lugares} lugares de brigadista · corte al ${esc(D.corte)} · publicado ${esc(D.generado)}</p>
        </div>
        <button type="button" class="ld-btn" data-accion="salir">Salir</button>
      </header>
      <nav class="ld-pestanas" role="tablist" aria-label="Páginas del líder">
        <button role="tab" id="ldTabTablero" aria-controls="ldPanelTablero" aria-selected="true" data-pestana="tablero">Tablero</button>
        <button role="tab" id="ldTabNogeo" aria-controls="ldPanelNogeo" aria-selected="false" tabindex="-1" data-pestana="nogeo">Mapa NoGeo</button>
        <button role="tab" id="ldTabJcf" aria-controls="ldPanelJcf" aria-selected="false" tabindex="-1" data-pestana="jcf">Jóvenes del Futuro</button>
      </nav>

      <div id="ldPanelTablero" role="tabpanel" aria-labelledby="ldTabTablero">
      <section class="ld-hero">
        <div class="ld-hero-num">
          <p class="ld-etq">Avance global de clientes únicos</p>
          <p class="ld-grande">${pct(K.pct_avance)}</p>
          <p class="ld-hero-sub">${num(K.clientes)} de ${num(K.objetivo)} clientes · objetivo ${D.lugares} lugares × ${D.objetivo_mes} ${flecha(K.d_pct_avance, true, 1, ' pts')}</p>
          <div class="ld-medidor" aria-hidden="true"><span style="width:${Math.min(100, K.pct_avance)}%"></span><i style="left:${Math.min(100, K.pct_tendencia)}%" title="tendencia"></i></div>
          <p class="ld-hero-nota">La marca blanca es la tendencia a fin de ${esc(D.mes)} (${pct(K.pct_tendencia)}).</p>
        </div>
        <div class="ld-tiles">
          ${tile('Tendencia a fin de mes', num(K.tendencia), `${pct(K.pct_tendencia)} del objetivo ${flecha(K.d_tendencia, true, 0)}`, semTend(K.pct_tendencia))}
          ${tile('Calificación EPICA', K.calificacion == null ? '—' : num(K.calificacion, 1), `objetivo ${D.objetivo_calificacion} ${flecha(K.d_calificacion)}`, semCal(K.calificacion, D.objetivo_calificacion))}
          ${tile('Posible mala práctica', pct(K.pct_mala), `NoGeo o foto de foto ${flecha(K.d_pct_mala, false, 1, ' pts')}`, semMala(K.pct_mala))}
          ${tile('Brigadistas activos', `${K.activos}<small> / ${K.lugares}</small>`, `${K.vacantes} ${K.vacantes === 1 ? 'vacante' : 'vacantes'} fuera de las métricas sin vacantes`)}
          ${tile('Evaluaciones', num(K.evaluaciones), `${num(K.prom_figura, 1)} por figura (÷${K.lugares}) · ${num(K.prom_sin_vacantes, 1)} sin vacantes`)}
          ${tile('Avance sin vacantes', pct(K.pct_avance_sv), `${num(K.clientes_activos)} de ${num(K.objetivo_activos)} (${K.activos} activos × ${D.objetivo_mes})`, semAvance(K.pct_avance_sv))}
        </div>
      </section>

      ${bloque('Avance global por unidad', `Como /avancegloballider. "Por figura" divide las evaluaciones entre todos los lugares (KOF ÷ ${D.lugares}); "sin vacantes" quita los lugares marcados como Vacante en UsersBrigadas.JSON (ni sus evaluaciones ni su lugar cuentan).`, tablaGlobal())}

      <div class="ld-grid">
        ${bloque('Distribución de calificaciones EPICA por unidad', 'Violín con densidad (kernel gaussiano) y cada sesión como punto. Caja = Q1–Q3, círculo = mediana, línea = media, bigotes = 1.5 × RIC.', '<div class="g-scroll"><div class="grafica g-oscura" id="gViolin"></div></div>', 'ancho')}
        ${bloque('Comportamiento del promedio contra el objetivo', `Promedio de calificación EPICA por día de ${esc(D.mes)}; objetivo ${D.objetivo_calificacion}.`,
          `<div class="chips ld-chips" id="chipsLineas" role="group" aria-label="Tipo de promedio">
             <button type="button" class="chip on" data-modo="acum">Promedio acumulado</button>
             <button type="button" class="chip" data-modo="dia">Promedio del día</button></div>
           <div class="grafica g-oscura" id="gLineas"></div>`, 'ancho')}
        ${bloque('Avance y tendencia por unidad', 'Barra sólida: avance actual. Banda clara: tendencia proyectada a fin de mes. Línea: objetivo (100%).', '<div class="grafica g-oscura" id="gAvance"></div>')}
        ${bloque('Cobertura del universo brigadista', 'Clientes con "Cliente brigadista" en la Master Data de cada oficina que ya tienen al menos una épica.', '<div class="grafica g-oscura" id="gCobertura"></div>')}
        ${bloque('Evaluaciones por día', 'Registros de EPICA por día y unidad.', '<div class="grafica g-oscura" id="gDias"></div>', 'ancho')}
        ${bloque('Brigadistas: volumen contra calidad', 'Cada marca es una clave. Las vacantes con registros van en tono tenue.', '<div class="grafica g-oscura" id="gDisp"></div>')}
        ${bloque('Precisión GEO del cierre', 'Distancia entre el cierre de la encuesta y el cliente en la Master Data.', '<div class="grafica g-oscura" id="gGeo"></div>')}
        ${bloque('Cumplimiento por métrica (oportunidad)', 'Promedio del % de cumplimiento por sesión. Rojo debajo de 90%, gris en 90%, azul arriba.', mapaCalor(), 'ancho')}
        ${bloque('Señales de posible mala práctica', 'Conteos del mes; el porcentaje es sobre las evaluaciones de la unidad.', tablaMala())}
        ${bloque('Unidades operativas', 'Abre la página de cada unidad con tu contraseña de líder.', tarjetasUnidades())}
      </div>

      ${bloque('Entrada y salida por brigadista', `Como /entradasalida: en cada día, la mitad izquierda es la hora de la primera épica (entrada) y la derecha la de la última (salida), con la hora arriba y los minutos abajo. Incidencias = mitades en rojo del mes (también suman en la disciplina operativa).`, tablaEntradaSalida(), 'ancho')}

      ${bloque('Ranking VDM completo', `Clientes contables de ${esc(D.mes)} (sin foto de foto ni NoGeo), como /rankingvdm. ▲▼ = cambio de posición contra el corte anterior.`, tablaRanking())}
      <p class="ld-pie">Calificación EPICA = EPICA Total (máximo 110) por sesión única. Tendencia: ritmo diario sin domingos; los sábados restantes suman 3 clientes por lugar. NoGeo: cierre a más de ${D.no_geo_metros} m del cliente.</p>
      </div>
      <div id="ldPanelNogeo" class="ld-panel-nogeo" role="tabpanel" aria-labelledby="ldTabNogeo" hidden></div>
      <div id="ldPanelJcf" class="ld-panel-jcf" role="tabpanel" aria-labelledby="ldTabJcf" hidden></div>`;

    raiz.querySelector('[data-accion="salir"]').addEventListener('click', () => opc.salir && opc.salir());
    raiz.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; b.querySelector('.ld-abrir').textContent = 'Descifrando…';
      try { await opc.abrirUnidad(b.dataset.abrir); }
      catch (e) { console.error(e); b.querySelector('.ld-abrir').textContent = 'No se pudo abrir'; }
      finally { b.disabled = false; }
    }));
    const tabs = [...raiz.querySelectorAll('.ld-pestanas [role="tab"]')];
    tabs.forEach(t => {
      t.addEventListener('click', () => pestana(t.dataset.pestana));
      t.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const j = (tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        tabs[j].focus(); pestana(tabs[j].dataset.pestana);
      });
    });
    filtroEntradaSalida(raiz);
    window.scrollTo(0, 0);
    graficas();
  }

  function pestana(cual) {
    for (const t of document.querySelectorAll('.ld-pestanas [role="tab"]')) {
      const activa = t.dataset.pestana === cual;
      t.setAttribute('aria-selected', activa);
      t.tabIndex = activa ? 0 : -1;
    }
    document.getElementById('ldPanelTablero').hidden = cual !== 'tablero';
    document.getElementById('ldPanelNogeo').hidden = cual !== 'nogeo';
    document.getElementById('ldPanelJcf').hidden = cual !== 'jcf';
    Graficas.Tip.hide();
    if (cual === 'nogeo') paginaNogeo();
    if (cual === 'jcf') paginaJovenes();
  }

  function tile(etiqueta, valor, sub, estado) {
    return `<div class="ld-tile"><p class="ld-etq">${esc(etiqueta)}</p>
      <p class="ld-valor">${estado ? `<i class="punto ${estado}" aria-hidden="true"></i>` : ''}${valor}</p>
      <p class="ld-tile-sub">${sub}</p></div>`;
  }

  function swatch(nombre) {
    return nombre === 'KOF' ? '' : `<svg width="12" height="12" aria-hidden="true">${Graficas.marcaSvg(formaDe[nombre], 6, 6, 5, colorDe[nombre])}</svg>`;
  }

  function tablaGlobal() {
    const fila = f => `<tr class="${f.es_total ? 'total' : ''}">
      <th scope="row">${swatch(f.zona)}${esc(f.zona)}</th>
      <td class="num">${f.activos}<span class="muted"> / ${f.lugares}</span>${f.vacantes ? `<span class="vac">${f.vacantes} vac.</span>` : ''}</td>
      <td class="num">${num(f.evaluaciones)}</td>
      <td class="num">${num(f.prom_figura, 1)}</td>
      <td class="num">${f.prom_sin_vacantes == null ? '—' : num(f.prom_sin_vacantes, 1)}</td>
      <td class="num">${num(f.clientes)}<span class="muted"> / ${num(f.objetivo)}</span></td>
      <td><span class="celda"><i class="punto ${semAvance(f.pct_avance)}"></i>${pct(f.pct_avance)}${flecha(f.d_pct_avance)}</span></td>
      <td><span class="celda">${pct(f.pct_avance_sv)}</span></td>
      <td><span class="celda"><i class="punto ${semTend(f.pct_tendencia)}"></i>${num(f.tendencia)} <span class="muted">(${num(f.pct_tendencia, 0)}%)</span>${flecha(f.d_tendencia, true, 0)}</span></td>
      <td><span class="celda"><i class="punto ${semCal(f.calificacion, D.objetivo_calificacion)}"></i>${f.calificacion == null ? '—' : num(f.calificacion, 1)}${flecha(f.d_calificacion)}</span></td>
      <td><span class="celda"><i class="punto ${semMala(f.pct_mala)}"></i>${pct(f.pct_mala)}${flecha(f.d_pct_mala, false)}</span></td>
    </tr>`;
    return `<div class="tabla-scroll"><table class="ld-tabla">
      <thead><tr>
        <th scope="col">Zona</th><th scope="col">Brigadistas<br><small>activos / lugares</small></th>
        <th scope="col">Evaluaciones<br>realizadas</th><th scope="col">Prom. eval.<br>por figura</th>
        <th scope="col">Prom. eval.<br>sin vacantes</th><th scope="col">Clientes únicos<br><small>/ objetivo</small></th>
        <th scope="col">Avance vs<br>objetivo</th><th scope="col">Avance sin<br>vacantes</th>
        <th scope="col">Tendencia</th><th scope="col">Calificación<br>EPICA</th>
        <th scope="col">% posible<br>mala práctica</th>
      </tr></thead>
      <tbody>${D.tabla.filter(f => !f.es_total).map(fila).join('')}</tbody>
      <tfoot>${D.tabla.filter(f => f.es_total).map(fila).join('')}</tfoot>
    </table></div>`;
  }

  function mapaCalor() {
    const filas = [...D.unidades.map(u => u.nombre), 'KOF'];
    const celda = v => {
      const bg = Graficas.colorDivergente(v, 90, 60, 100, true);
      return `<td style="background:${bg};color:${v == null ? '#898781' : Graficas.tintaSobre(bg)}">${v == null ? '—' : num(v, 1)}</td>`;
    };
    return `<div class="tabla-scroll"><table class="ld-calor">
      <thead><tr><th scope="col">Unidad</th>${D.metricas.map(m => `<th scope="col"><span>${esc(m)}</span></th>`).join('')}</tr></thead>
      <tbody>${filas.map(u => `<tr class="${u === 'KOF' ? 'total' : ''}"><th scope="row">${swatch(u)}${esc(u)}</th>${(D.oportunidad[u] || []).map(celda).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="ld-escala" aria-hidden="true"><span>60%</span><i></i><span>90%</span><i class="der"></i><span>100%</span></div>`;
  }

  // Barra de porcentaje en escala fija de 0 a 100% (no se ajusta al mayor)
  function barra100(p, color) {
    const ancho = p > 0 ? `max(2px, ${Math.min(100, p)}%)` : '0';
    return `<span class="ld-mini-barra" title="Escala de 0 a 100%"><span style="width:${ancho};background:${color}"></span></span>`;
  }

  function tablaMala() {
    const us = D.unidades.map(u => u.nombre);
    const celda = (n, e, d) => {
      const p = e ? n / e * 100 : 0;
      return `<td><div class="ld-mini">${barra100(p, RIESGO)}<b>${num(n)}</b><span class="muted">${pct(p)}</span>${flecha(d, false, 0)}</div></td>`;
    };
    return `<div class="tabla-scroll"><table class="ld-tabla ld-mala">
      <thead><tr><th scope="col">Unidad</th><th scope="col">NoGeo</th><th scope="col">Foto de foto</th><th scope="col">Hacer base</th></tr></thead>
      <tbody>${us.map(u => { const m = D.mala[u]; return `<tr><th scope="row">${swatch(u)}${esc(u)}</th>${celda(m.no_geo, m.evaluaciones, m.d_no_geo)}${celda(m.fdf, m.evaluaciones, m.d_fdf)}${celda(m.hacer_base, m.evaluaciones, m.d_hacer_base)}</tr>`; }).join('')}</tbody>
    </table></div>`;
  }

  function tarjetasUnidades() {
    return `<div class="ld-unidades">${D.unidades.map(u => {
      const f = D.tabla.find(t => t.zona === u.nombre);
      return `<button type="button" class="ld-unidad" data-abrir="${esc(u.id)}" style="--c:${colorDe[u.nombre]}">
        <span class="ld-u-nombre">${swatch(u.nombre)}${esc(u.nombre)}</span>
        <span class="ld-u-dato">${pct(f.pct_avance)} avance · ${f.calificacion == null ? '—' : num(f.calificacion, 1)} EPICA</span>
        <span class="ld-abrir">Abrir página →</span></button>`;
    }).join('')}</div>`;
  }

  function tablaRanking() {
    const conteoNeutro = (n, d) => `${n ? num(n) : '<span class="muted">—</span>'}${d ? flecha(d, false, 0) : ''}`;
    const conteo = (n, d) => `${n ? `<b class="ld-rojo">${num(n)}</b>` : '<span class="muted">—</span>'}${d ? flecha(d, false, 0) : ''}`;
    return `<div class="tabla-scroll"><table class="ld-tabla ld-ranking">
      <thead><tr><th scope="col">Pos.</th><th scope="col">Clave</th><th scope="col">Nombre</th><th scope="col">Unidad</th>
        <th scope="col">Clientes<br>contables</th><th scope="col">Épicas<br>descartadas</th><th scope="col">% avance</th>
        <th scope="col">Promedio<br>total</th><th scope="col">Evalua-<br>ciones</th>
        <th scope="col">NoGeo</th><th scope="col">Foto de<br>foto</th><th scope="col">% posible<br>mala práctica</th></tr></thead>
      <tbody>${D.ranking.map(r => `<tr class="${r.vacante ? 'vacante' : ''}">
        <td class="num"><b>${r.pos}</b> ${flecha(r.d_pos, true, 0)}</td>
        <td>${esc(r.clave)}</td><td>${r.vacante ? '<span class="tag-vac">Vacante</span>' : esc(r.nombre)}</td>
        <td>${swatch(r.unidad)}${esc(r.unidad)}</td>
        <td class="num">${num(r.clientes)}${flecha(r.d_clientes, true, 0)}</td>
        <td class="num">${conteoNeutro(r.descartadas, r.d_descartadas)}</td>
        <td><div class="ld-mini"><span class="ld-mini-barra"><span style="width:${Math.min(100, r.pct_avance)}%;background:${colorDe[r.unidad]}"></span></span><b>${pct(r.pct_avance)}</b>${flecha(r.d_pct_avance)}</div></td>
        <td><span class="celda"><i class="punto ${semCal(r.promedio, D.objetivo_calificacion)}"></i>${r.promedio == null ? '—' : num(r.promedio, 1)}${flecha(r.d_promedio)}</span></td>
        <td class="num">${num(r.evaluaciones)}${flecha(r.d_evaluaciones, true, 0)}</td>
        <td class="num">${conteo(r.no_geo, r.d_no_geo)}</td>
        <td class="num">${conteo(r.fdf, r.d_fdf)}</td>
        <td><div class="ld-mini">${barra100(r.pct_mala, r.pct_mala > 10 ? RIESGO : '#3dbb3d')}<b>${pct(r.pct_mala)}</b>${flecha(r.d_pct_mala, false)}</div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // ── Entrada y salida (/entradasalida) ─────────────────────────────────
  // Mismo semáforo que ejemplo.py; las mitades en rojo son las incidencias
  const minutos = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  const colorEntrada = h => { const m = minutos(h); return m <= 10 * 60 + 30 ? 'verde' : m < 12 * 60 ? 'naranja' : 'rojo'; };
  const colorSalida = h => { const m = minutos(h); return m >= 17 * 60 ? 'verde' : m >= 15 * 60 ? 'naranja' : 'rojo'; };

  function tablaEntradaSalida() {
    const dias = Array.from({ length: D.dia_corte }, (_, i) => i + 1);
    const semana = d => new Date(D.anio, D.mes_num - 1, d).getDay();
    const clase = d => semana(d) === 0 ? 'es-dom' : '';
    const media = (h, color, que) => `<span class="es-media es-${color}" title="${que} ${h}"><b>${h.slice(0, 2)}</b><b>${h.slice(3, 5)}</b></span>`;
    const fila = b => {
      const H = D.horarios[b.clave] || {};
      let incidencias = 0;
      const celdas = dias.map(d => {
        const par = H[d];
        if (!par) return `<td class="${clase(d)}"></td>`;
        const ce = colorEntrada(par[0]), cs = colorSalida(par[1]);
        incidencias += (ce === 'rojo') + (cs === 'rojo');
        return `<td class="${clase(d)}"><div class="es-par">${media(par[0], ce, 'Entrada')}${media(par[1], cs, 'Salida')}</div></td>`;
      }).join('');
      return `<tr class="${b.vacante ? 'vacante' : ''}" data-unidad="${esc(b.unidad)}">
        <th scope="row"><span class="es-clave">${esc(b.clave)}</span>${esc(b.vacante ? 'Vacante' : b.corto)}</th>
        ${celdas}<td class="es-inc"><span class="${incidencias ? 'mal' : 'bien'}">${incidencias}</span></td></tr>`;
    };
    const cuerpo = D.unidades.map(u => `
      <tr class="es-grupo" data-unidad="${esc(u.nombre)}"><th scope="rowgroup" colspan="${dias.length + 2}">${swatch(u.nombre)}${esc(u.nombre)}</th></tr>
      ${D.brigadistas.filter(b => b.unidad === u.nombre).map(fila).join('')}`).join('');
    const muestra = (color, texto) => `<span><i class="es-${color}"></i>${texto}</span>`;
    return `<div class="chips ld-chips" id="chipsEntradaSalida" role="group" aria-label="Unidad">
        <button type="button" class="chip on" data-u="">Todas</button>
        ${D.unidades.map(u => `<button type="button" class="chip" data-u="${esc(u.nombre)}">${esc(u.nombre)}</button>`).join('')}
      </div>
      <div class="tabla-scroll"><table class="es-tabla">
        <thead><tr><th scope="col">Brigadista</th>
          ${dias.map(d => `<th scope="col" class="${clase(d)}"><span>${d}</span><small>${'DLMMJVS'[semana(d)]}</small></th>`).join('')}
          <th scope="col">Inciden-<br>cias</th></tr></thead>
        <tbody>${cuerpo}</tbody>
      </table></div>
      <div class="es-leyenda">
        <b>Entrada:</b>${muestra('verde', 'hasta 10:30')}${muestra('naranja', '10:31–11:59')}${muestra('rojo', '12:00 o después')}
        <b>Salida:</b>${muestra('verde', '5 pm o después')}${muestra('naranja', '3:00–4:59 pm')}${muestra('rojo', 'antes de 3 pm')}
        <span><i class="es-dom"></i>domingo</span>
      </div>`;
  }

  function filtroEntradaSalida(raiz) {
    const chips = [...raiz.querySelectorAll('#chipsEntradaSalida .chip')];
    chips.forEach(c => c.addEventListener('click', () => {
      chips.forEach(x => x.classList.toggle('on', x === c));
      raiz.querySelectorAll('.es-tabla tbody tr').forEach(tr => { tr.hidden = !!c.dataset.u && tr.dataset.unidad !== c.dataset.u; });
    }));
  }

  // ── Página "Mapa NoGeo" ───────────────────────────────────────────────
  // Cada NoGeo une, con línea punteada, al cliente según la Master Data con el
  // punto donde se cerró la encuesta; la etiqueta a mitad de la línea es la
  // distancia entre ambos (visible al acercar el mapa)
  const ZOOM_ETIQUETAS = 13;

  function distancia(m) {
    if (m == null) return '—';
    return m < 1000 ? `${num(m)} m` : `${num(m / 1000, m < 10000 ? 2 : 1)} km`;
  }

  function encuadre(puntos) {
    if (puntos.length < 20) return L.latLngBounds(puntos);
    const q = (arr, p) => arr[Math.round((arr.length - 1) * p)];
    const la = puntos.map(p => p[0]).sort((a, b) => a - b), lo = puntos.map(p => p[1]).sort((a, b) => a - b);
    return L.latLngBounds([q(la, 0.01), q(lo, 0.01)], [q(la, 0.99), q(lo, 0.99)]);
  }

  function paginaNogeo() {
    const panel = document.getElementById('ldPanelNogeo');
    if (mapaN) { setTimeout(() => mapaN.invalidateSize(), 50); return; }
    const P = D.nogeo.puntos, sinRef = D.nogeo.sin_ref || {};
    const unidadDe = {}, nombreDe = {};
    D.brigadistas.forEach(b => { unidadDe[b.clave] = b.unidad; nombreDe[b.clave] = b.vacante ? 'Vacante' : b.nombre; });
    const us = D.unidades.map(u => u.nombre);
    const resumen = us.map(u => {
      const ds = P.filter(p => unidadDe[p[0]] === u && p[8] != null).map(p => p[8]);
      return { u, n: ds.length, prom: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null, sin: sinRef[u] || 0 };
    });
    const totalSin = resumen.reduce((a, r) => a + r.sin, 0);

    panel.innerHTML = `
      <section class="ld-bloque">
        <header><h2>NoGeo por unidad</h2>
          <p>Cada línea punteada une al cliente según la Master Data (círculo relleno) con el punto donde se cerró la encuesta (círculo hueco); la etiqueta es la distancia entre ambos y aparece al acercar el mapa. NoGeo = cierre a más de ${D.no_geo_metros} m del cliente. ${esc(D.mes)}, corte al ${esc(D.corte)}.</p></header>
        <div class="chips ld-chips" id="chipsNogeo" role="group" aria-label="Unidades">
          ${resumen.map(r => `<button type="button" class="chip on" data-u="${esc(r.u)}" aria-pressed="true">${swatch(r.u)}${esc(r.u)} · <b>${num(r.n)}</b>${r.prom != null ? ` · prom. ${distancia(r.prom)}` : ''}</button>`).join('')}
          <button type="button" class="chip on" data-etiquetas aria-pressed="true">Distancias</button>
        </div>
        ${totalSin ? `<p class="ld-nota">${num(totalSin)} NoGeo de clientes sin coordenadas en la Master Data no se pueden dibujar (${resumen.filter(r => r.sin).map(r => `${esc(r.u)}: ${num(r.sin)}`).join(', ')}).</p>` : ''}
      </section>
      <div class="ld-nogeo-cuerpo">
        <div id="mapaNogeo" class="ld-mapa"></div>
        <aside class="ld-nogeo-lista" aria-label="NoGeo de mayor a menor distancia">
          <input type="search" id="buscaNogeo" placeholder="Buscar clave, SAP o cliente" aria-label="Buscar NoGeo">
          <p class="ld-nota" id="cuentaNogeo"></p>
          <ul id="listaNogeo"></ul>
        </aside>
      </div>`;

    mapaN = L.map('mapaNogeo', { preferCanvas: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapaN);
    Unidad.botonUbicacion(mapaN);
    const rend = L.canvas({ padding: 0.5, tolerance: 6 });
    const capas = {}, etiquetas = {}, items = [], limites = [];
    us.forEach(u => { capas[u] = L.layerGroup(); etiquetas[u] = L.layerGroup(); });

    P.forEach(p => {
      const [clave, sap, cliente, fecha, la, lo, lk, ok, dist, cal] = p;
      const u = unidadDe[clave], color = colorDe[u] || '#aaa';
      if (!capas[u]) return;
      const pop = () => `<div class="pc"><div class="pc-cab" style="background:${color}"><b>${esc(cliente || 'Cliente ' + sap)}</b><span>SAP ${esc(sap)} · NoGeo a ${distancia(dist)}</span></div>
        <dl class="pc-cuerpo"><dt>Brigadista</dt><dd>${esc(clave)} · ${esc(nombreDe[clave] || '')}</dd><dt>Unidad</dt><dd>${esc(u)}</dd>
        <dt>Fecha</dt><dd>${esc(fecha)}</dd><dt>Distancia</dt><dd>${distancia(dist)}</dd>${cal == null ? '' : `<dt>Calificación</dt><dd>${num(cal, 1)}</dd>`}</dl>
        <a class="pc-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${la},${lo}">Cliente en Google Maps</a>
        <a class="pc-btn sec" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lk},${ok}">Cierre en Google Maps</a></div>`;
      const linea = L.polyline([[la, lo], [lk, ok]], { renderer: rend, color, weight: 3, opacity: 0.95, dashArray: '1 7', lineCap: 'round' })
        .bindPopup(pop).bindTooltip(`${esc(clave)} · ${distancia(dist)}`, { sticky: true }).addTo(capas[u]);
      L.circleMarker([lk, ok], { renderer: rend, radius: 5, color, weight: 2.5, fillColor: '#0b0b0d', fillOpacity: 1 }).bindPopup(pop).addTo(capas[u]);
      L.circleMarker([la, lo], { renderer: rend, radius: 6, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1 }).bindPopup(pop).addTo(capas[u]);
      L.marker([(la + lk) / 2, (lo + ok) / 2], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'ng-etiqueta', html: `<span style="border-color:${color}">${distancia(dist)}</span>`, iconSize: null }) }).addTo(etiquetas[u]);
      items.push({ p, u, linea, medio: L.latLng((la + lk) / 2, (lo + ok) / 2), limites: L.latLngBounds([[la, lo], [lk, ok]]) });
      limites.push([la, lo], [lk, ok]);
    });

    const visibles = new Set(us);
    let conEtiquetas = true;
    const pintarEtiquetas = () => {
      const ver = conEtiquetas && mapaN.getZoom() >= ZOOM_ETIQUETAS;
      us.forEach(u => { if (ver && visibles.has(u)) etiquetas[u].addTo(mapaN); else mapaN.removeLayer(etiquetas[u]); });
    };
    us.forEach(u => capas[u].addTo(mapaN));
    if (limites.length) mapaN.fitBounds(encuadre(limites).pad(0.05));
    else mapaN.setView([19.38, -99.14], 11);
    pintarEtiquetas();
    mapaN.on('zoomend', pintarEtiquetas);

    // Lista de NoGeo (de mayor a menor distancia)
    const lista = panel.querySelector('#listaNogeo'), busca = panel.querySelector('#buscaNogeo');
    const pintarLista = () => {
      const q = busca.value.trim().toLowerCase();
      const ver = items.filter(it => visibles.has(it.u) && (!q || `${it.p[0]} ${it.p[1]} ${it.p[2]}`.toLowerCase().includes(q)));
      panel.querySelector('#cuentaNogeo').textContent = `${num(ver.length)} NoGeo · toca uno para verlo en el mapa`;
      lista.innerHTML = ver.map(it => `<li><button type="button" data-i="${items.indexOf(it)}">
          ${swatch(it.u)}<span class="ng-txt"><b>${esc(it.p[0])}</b> · ${esc(it.p[2] || it.p[1])}<small>${esc(it.p[3])}</small></span>
          <span class="ng-dist">${distancia(it.p[8])}</span></button></li>`).join('') || '<li class="ld-nota">Sin NoGeo con ese filtro.</li>';
    };
    pintarLista();
    busca.addEventListener('input', pintarLista);
    lista.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const it = items[+b.dataset.i];
      mapaN.fitBounds(it.limites.pad(0.5), { maxZoom: 17 });
      setTimeout(() => it.linea.openPopup(it.medio), 350);
      if (window.innerWidth < 900) document.getElementById('mapaNogeo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    panel.querySelectorAll('#chipsNogeo .chip').forEach(c => c.addEventListener('click', () => {
      const on = !c.classList.contains('on');
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
      if ('etiquetas' in c.dataset) conEtiquetas = on;
      else {
        if (on) { visibles.add(c.dataset.u); capas[c.dataset.u].addTo(mapaN); }
        else { visibles.delete(c.dataset.u); mapaN.removeLayer(capas[c.dataset.u]); }
        pintarLista();
      }
      pintarEtiquetas();
    }));
  }

  // ── Página "Jóvenes del Futuro" ───────────────────────────────────────
  // El mapa de rutas activas de la unidad, el mismo de su página (sus datos se
  // descifran con la llave del líder al elegirla), con los Jóvenes
  // Construyendo el Futuro de BaseDeDatos/JovenesDelFuturo.JSON (/jcfvdm)

  function paginaJovenes() {
    const panel = document.getElementById('ldPanelJcf');
    if (pendienteJ) { const dibujar = pendienteJ; pendienteJ = null; dibujar(); return; }
    if (panel.childElementCount) { if (mapaJ) setTimeout(() => mapaJ.invalidateSize(), 50); return; }
    const J = D.jovenes || [];
    const cuantos = u => J.filter(j => j.unidad === u).length;
    panel.innerHTML = `
      <section class="ld-bloque">
        <header><h2>Jóvenes Construyendo el Futuro en las rutas de hoy</h2>
          <p>El mapa de "Rutas activas hoy" de cada unidad, igual al de su página, con la ubicación de sus jóvenes (pin negro). Toca a un joven para llamarle, escribirle por WhatsApp o ver las rutas de hoy que le quedan más cerca. Se agregan, editan y dan de baja con /jcfvdm en el bot; los cambios se ven en la siguiente publicación.</p></header>
        <div class="chips ld-chips" id="chipsJcf" role="group" aria-label="Unidad">
          ${D.unidades.map(u => `<button type="button" class="chip" data-u="${esc(u.id)}" aria-pressed="false">${swatch(u.nombre)}${esc(u.nombre)} · <b>${num(cuantos(u.nombre))}</b></button>`).join('')}
        </div>
        <p class="ld-nota" id="estadoJcf" role="status"></p>
      </section>
      <div class="tema-kof ld-jcf-mapa" id="rutasJcf"></div>`;
    panel.querySelectorAll('#chipsJcf .chip').forEach(c => c.addEventListener('click', () => unidadJovenes(c.dataset.u)));
    const inicial = D.unidades.find(u => cuantos(u.nombre)) || D.unidades[0];
    if (inicial) unidadJovenes(inicial.id);
  }

  async function unidadJovenes(id) {
    const u = D.unidades.find(x => x.id === id);
    const panel = document.getElementById('ldPanelJcf');
    panel.querySelectorAll('#chipsJcf .chip').forEach(c => {
      const on = c.dataset.u === id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
    });
    const estado = panel.querySelector('#estadoJcf'), cont = panel.querySelector('#rutasJcf');
    const pedido = ++pedidoJ;
    pendienteJ = null;
    estado.textContent = `Descifrando las rutas de ${u.nombre}…`;
    let datos;
    try {
      datos = await opc.cargarUnidad(id);
    } catch (e) {
      console.error(e);
      if (pedido === pedidoJ) estado.textContent = `No se pudieron abrir las rutas de ${u.nombre}. Vuelve a tocar la unidad.`;
      return;
    }
    if (pedido !== pedidoJ || !cont.isConnected) return;     // ya eligieron otra unidad o salieron
    const J = (D.jovenes || []).filter(j => j.unidad === u.nombre);
    const dibujar = () => {
      if (mapaJ) { mapaJ.remove(); mapaJ = null; }
      estado.textContent = `${u.nombre}: ${J.length === 1 ? '1 joven' : `${num(J.length)} jóvenes`} · ${num(datos.rutas.rutas.length)} rutas activas hoy.`;
      mapaJ = Unidad.rutasEnPanel(cont, datos.rutas, { ice: !!datos.universo_ice, jovenes: J, unidad: u.nombre });
    };
    // Leaflet necesita el mapa visible para encuadrarlo
    if (panel.hidden) pendienteJ = dibujar; else dibujar();
  }

  // ── Gráficas ──────────────────────────────────────────────────────────
  function graficas() {
    const us = D.unidades.map(u => u.nombre);
    const obj = D.objetivo_calificacion;

    Graficas.violin(document.getElementById('gViolin'), {
      titulo: 'Distribución de calificaciones EPICA por unidad',
      series: us.map(u => ({ nombre: u, color: colorDe[u], valores: D.violin[u] || [] })),
      dominio: [Math.max(0, Math.floor(Math.min(...us.flatMap(u => D.violin[u] || [100])) / 10) * 10), 112],
      objetivo: { valor: obj, etiqueta: `Objetivo ${obj}` }, minAncho: 620,
    });

    const S = D.serie;
    const serieDe = (u, modo) => {
      const s = S.unidades[u];
      let sa = 0, na = 0;
      return S.dias.map((_, i) => {
        if (modo === 'dia') return s.n[i] ? s.suma[i] / s.n[i] : null;
        sa += s.suma[i]; na += s.n[i];
        return na ? sa / na : null;
      });
    };
    const dibujarLineas = modo => Graficas.lineas(document.getElementById('gLineas'), {
      titulo: 'Promedio de calificación contra el objetivo', x: S.dias, alto: 340,
      etiquetaX: d => d, tituloTip: d => `${d} de ${D.mes}`,
      series: us.map(u => ({ nombre: u, color: colorDe[u], valores: serieDe(u, modo) }))
        .concat([{ nombre: 'KOF', color: COLOR_KOF, ancho: 3, principal: true, valores: serieDe('KOF', modo) }]),
      objetivo: { valor: obj, etiqueta: `Objetivo ${obj}` }, etiquetaFinal: true,
    });
    dibujarLineas('acum');
    document.querySelectorAll('#chipsLineas .chip').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#chipsLineas .chip').forEach(x => x.classList.toggle('on', x === b));
      dibujarLineas(b.dataset.modo);
    }));

    const filasZona = D.tabla.filter(f => !f.es_total);
    Graficas.barras(document.getElementById('gAvance'), {
      titulo: 'Avance y tendencia por unidad', anchoEtiqueta: 112, margenDerecho: 84,
      max: Math.max(100, ...filasZona.map(f => f.pct_tendencia)) * 1.04,
      leyenda: [{ nombre: 'Avance actual', color: '#a3a29b' }, { nombre: 'Tendencia a fin de mes', color: 'rgba(163,162,155,.3)' }],
      filas: filasZona.map(f => ({
        etiqueta: f.zona, valor: f.pct_avance, pista: f.pct_tendencia, color: colorDe[f.zona],
        texto: `${num(f.pct_avance, 0)} → ${pct(f.pct_tendencia, 0)}`,
        tip: `<b>${esc(f.zona)}</b><br>Avance: ${pct(f.pct_avance)} (${num(f.clientes)} de ${num(f.objetivo)})<br>Tendencia: ${num(f.tendencia)} (${pct(f.pct_tendencia)})`,
      })),
      referencia: { valor: 100, etiqueta: 'Objetivo 100%' },
    });

    const cob = us.map(u => ({ u, ...D.cobertura[u] }));
    const maxCob = Math.max(1, ...cob.map(c => c.universo ? c.trabajados / c.universo * 100 : 0));
    Graficas.barras(document.getElementById('gCobertura'), {
      titulo: 'Cobertura del universo brigadista', anchoEtiqueta: 112, margenDerecho: 136, max: maxCob * 1.05,
      filas: cob.map(c => ({
        etiqueta: c.u, valor: c.universo ? c.trabajados / c.universo * 100 : 0, color: colorDe[c.u],
        texto: `${num(c.trabajados)} / ${num(c.universo)} (${pct(c.universo ? c.trabajados / c.universo * 100 : 0)})`,
        tip: `<b>${esc(c.u)}</b><br>${num(c.trabajados)} de ${num(c.universo)} clientes brigadistas trabajados`,
      })),
    });

    Graficas.columnasApiladas(document.getElementById('gDias'), {
      titulo: 'Evaluaciones por día', x: S.dias, etiquetaX: d => d, tituloTip: d => `${d} de ${D.mes}`,
      series: us.map(u => ({ nombre: u, color: colorDe[u], valores: D.evaluaciones_dia[u] || [] })),
    });

    // Ritmo esperado para llegar a 200 al cierre: días laborales (sin domingo) transcurridos
    const lab = (a, b) => { let n = 0; for (let d = a; d <= b; d++) if (new Date(D.anio, D.mes_num - 1, d).getDay() !== 0) n++; return n; };
    const ritmo = Math.round(D.objetivo_mes * lab(1, D.dia_corte) / Math.max(1, lab(1, D.dias_mes)));
    const conDatos = D.brigadistas.filter(b => b.evaluaciones > 0 && b.promedio != null);
    Graficas.dispersion(document.getElementById('gDisp'), {
      titulo: 'Clientes impactados contra calificación por brigadista',
      ejeX: 'Clientes impactados', ejeY: 'Promedio EPICA',
      series: us.map(u => ({ nombre: u, color: colorDe[u], forma: formaDe[u] })),
      refY: { valor: obj, etiqueta: `Objetivo ${obj}` },
      refX: { valor: ritmo, etiqueta: `Ritmo para ${D.objetivo_mes}: ${ritmo}` },
      puntos: conDatos.map(b => ({
        x: b.clientes, y: b.promedio, serie: b.unidad, hueco: b.vacante,
        tip: `<b>${esc(b.clave)}</b> · ${esc(b.vacante ? 'Vacante' : b.nombre)}<table class="tip-tabla">
          <tr><td>Unidad</td><td>${esc(b.unidad)}</td></tr><tr><td>Clientes</td><td>${num(b.clientes)}</td></tr>
          <tr><td>Promedio</td><td>${num(b.promedio, 1)}</td></tr><tr><td>Tendencia</td><td>${num(b.tendencia)}</td></tr>
          <tr><td>Mala práctica</td><td>${pct(b.pct_mala)}</td></tr></table>`,
      })),
    });

    const SEG = [
      { nombre: '≤ 30 m', color: '#184f95' }, { nombre: '30–100 m', color: '#2a78d6' },
      { nombre: '100–500 m', color: '#5598e7', tinta: '#0b0b0b' }, { nombre: '> 500 m', color: '#9ec5f4', tinta: '#0b0b0b' },
      { nombre: 'Sin referencia', color: '#5c5b57' },
    ];
    const claves = ['≤ 30 m', '30–100 m', '100–500 m', '> 500 m', 'Sin referencia'];
    Graficas.barras100(document.getElementById('gGeo'), {
      titulo: 'Precisión GEO del cierre', segmentos: SEG, categorias: us,
      valores: us.map(u => claves.map(k => (D.distancias[u] || {})[k] || 0)),
    });
  }

  return { render };
})();
