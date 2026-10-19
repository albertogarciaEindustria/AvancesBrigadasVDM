/* Página LiderBrigadasVDM: tablero negro con las métricas de las 5 unidades
 * operativas (tabla de /avancegloballider y gráficas). */
const Lider = (function () {
  'use strict';
  const { esc, num, pct } = Util;

  // Paleta categórica (pasos para fondo oscuro) en orden fijo por unidad;
  // la dispersión agrega forma porque son más de 3 series a la vez.
  const COLORES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
  const FORMAS = ['circulo', 'cuadro', 'triangulo', 'rombo', 'cruz'];
  const COLOR_KOF = '#f0efec';
  const RIESGO = '#e66767';

  let D = null, opc = {}, colorDe = {}, formaDe = {};

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
          `<div class="chips ld-chips" role="group" aria-label="Tipo de promedio">
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

      ${bloque('Ranking VDM completo', `Clientes contables de ${esc(D.mes)} (sin foto de foto ni NoGeo), como /rankingvdm. ▲▼ = cambio de posición contra el corte anterior.`, tablaRanking())}
      <p class="ld-pie">Calificación EPICA = EPICA Total (máximo 110) por sesión única. Tendencia: ritmo diario sin domingos; los sábados restantes suman 3 clientes por lugar. NoGeo: cierre a más de ${D.no_geo_metros} m del cliente.</p>`;

    raiz.querySelector('[data-accion="salir"]').addEventListener('click', () => opc.salir && opc.salir());
    raiz.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; b.querySelector('.ld-abrir').textContent = 'Descifrando…';
      try { await opc.abrirUnidad(b.dataset.abrir); }
      catch (e) { console.error(e); b.querySelector('.ld-abrir').textContent = 'No se pudo abrir'; }
      finally { b.disabled = false; }
    }));
    window.scrollTo(0, 0);
    graficas();
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
    document.querySelectorAll('.ld-chips .chip').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.ld-chips .chip').forEach(x => x.classList.toggle('on', x === b));
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
