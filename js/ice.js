/* Reporte ICE (ice.html): acceso con usuario + contraseña y las secciones de
 * la unidad (resumen con el Excel de la clasificación, mapa, semanas del mes y
 * rutas con sus impresiones en PDF).
 *
 * "Lo que le faltó" a un cliente = la submétrica que más puntos le quitó en su
 * última evaluación ICE (la del mes si ya se evaluó; elemento 17 de cada
 * cliente, ver _datos_ultima en Programas/publica_ice.py).
 *
 * El usuario se normaliza (sin acentos, símbolos ni mayúsculas) y su hash dice
 * qué archivo pedir: datos/ice/u-<hash>.js trae, cifrados con la contraseña,
 * el nombre del archivo de datos de la unidad y su llave. Los datos
 * descifrados viven solo en memoria: "Salir" recarga la página. Ver
 * Programas/publica_ice.py. */
const Ice = (function () {
  'use strict';
  const { esc, num } = Util;
  const A = Graficas.aux;

  // ── Colores del manual de marca ──────────────────────────────────────
  const ROJO = '#F40000', NEGRO = '#000000', GRIS = '#8C8C8C', GRIS_OSC = '#4D4D4D', GRIS_TINTA = '#6E6E6E',
        BLANCO = '#FFFFFF';
  const COLOR_CANAL = { 'Traditional': ROJO, 'On Premise': NEGRO, 'Todas': GRIS };
  const PRIO = {
    0: { nombre: 'No ICE', corto: '—', clase: 'p0' },
    1: { nombre: 'Prioridad 1', corto: 'P1', clase: 'p1', relleno: ROJO, borde: BLANCO, radio: 7.5, grosor: 2 },
    2: { nombre: 'Prioridad 2', corto: 'P2', clase: 'p2', relleno: NEGRO, borde: BLANCO, radio: 6.5, grosor: 2 },
    3: { nombre: 'Aleatorio', corto: 'A', clase: 'p3', relleno: BLANCO, borde: GRIS_OSC, radio: 6, grosor: 2.5 },
  };
  const SAL = 'ICE-VDM:';        // igual que SAL_USUARIO de Programas/publica_ice.py
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
                 'octubre', 'noviembre', 'diciembre'];
  const TACTIL = window.matchMedia('(pointer: coarse)').matches;
  const RADIO_TOQUE = TACTIL ? 26 : 14;

  // Símbolos de las submétricas (trazos de 24×24)
  const ICONOS = {
    enfriador:   '<rect x="6" y="2.5" width="12" height="19" rx="1.5"/><path d="M6 9.5h12M9 5.5v2M9 12.5v4"/>',
    portafolio:  '<path d="M7.5 3h3v3.2l1 2V21h-5V8.2l1-2zM14.5 3h3v3.2l1 2V21h-5V8.2l1-2z"/>',
    precio:      '<path d="M3.5 12.5l9-9h8v8l-9 9z"/><circle cx="16.3" cy="7.7" r="1.4"/>',
    activacion:  '<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/>',
    plataformas: '<path d="M12 3.5l9 4.2-9 4.2-9-4.2zM3 12l9 4.2 9-4.2M3 16.3l9 4.2 9-4.2"/>',
    sovi:        '<path d="M3.5 20.5h17M6.5 20.5v-9M10.5 20.5V5.5M14.5 20.5v-6M18.5 20.5v-12"/>',
    local:       '<path d="M12 21.5s-6.5-6-6.5-11.5a6.5 6.5 0 0113 0c0 5.5-6.5 11.5-6.5 11.5z"/><circle cx="12" cy="10" r="2.3"/>',
    bono:        '<rect x="3.5" y="9" width="17" height="12"/><path d="M12 9v12M3.5 13.5h17M12 9C10 4.5 6 4.5 6 7s4 2 6 2 6 .5 6-2-4-2.5-6 2z"/>',
    ok:          '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    imprimir:    '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
    excel:       '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    gps:         '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
    lista:       '<path d="M9 3.5h6v3H9zM7.5 5H5v16h14V5h-2.5M8.5 11.5h7M8.5 15.5h5"/>',
  };
  // Nombres cortos de las submétricas para los PDF
  const CORTO = { precio: 'Com. de precios', plataformas: 'Act. plataformas' };
  const svgIcono = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[id] || ICONOS.ok}</svg>`;

  const $ = id => document.getElementById(id);
  const dec1 = v => v == null ? '—' : num(v, 1);
  const plural = (n, s, p) => `${num(n)} ${n === 1 ? s : (p || s + 's')}`;
  function partes(iso) { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return { a, m, d }; }
  function fechaCorta(iso) { if (!iso) return '—'; const { m, d } = partes(iso); return `${d} ${MESES[m - 1].slice(0, 3)}`; }
  function fechaLarga(iso) { if (!iso) return '—'; const { a, m, d } = partes(iso); return `${d} de ${MESES[m - 1]} de ${a}`; }
  function ddmm(iso) { if (!iso) return '—'; const { m, d } = partes(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`; }
  function diaSemana(iso) { const { a, m, d } = partes(iso); return DIAS[new Date(a, m - 1, d).getDay()]; }

  // ── Acceso ────────────────────────────────────────────────────────────
  let indice = null;

  function normalizar(texto) {
    return String(texto || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async function hashUsuario(usuario) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAL + normalizar(usuario)));
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => { s.remove(); mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function entrar(usuario, pass) {
    const h = await hashUsuario(usuario);
    const v = encodeURIComponent(indice.version);
    window.ICE_ACCESO = window.ICE_ACCESO || {};
    if (!window.ICE_ACCESO[h]) {
      try {
        await cargarScript(`datos/ice/u-${h}.js?v=${v}`);
      } catch (e) {
        if (!navigator.onLine) throw e;
        return false;                       // ese usuario no existe
      }
    }
    const acceso = window.ICE_ACCESO[h];
    if (!acceso) return false;
    const llave = await Cripto.descifrar(acceso, pass);
    if (!llave) return false;
    if (!/^[0-9a-f]{16}$/.test(String(llave.archivo))) throw new Error('Archivo de datos no válido');
    window.ICE_DATOS = window.ICE_DATOS || {};
    if (!window.ICE_DATOS[llave.archivo]) await cargarScript(`datos/ice/d-${llave.archivo}.js?v=${v}`);
    const datos = await Cripto.descifrarConLlave(window.ICE_DATOS[llave.archivo], llave.llave);
    render(datos);
    return true;
  }

  function aviso(texto, error) {
    const e = $('iceEstado');
    e.textContent = texto;
    e.className = 'ia-estado' + (error ? ' error' : '');
  }

  async function enviar(ev) {
    ev.preventDefault();
    const usuario = $('iceUsuario').value, pass = $('icePass').value;
    if (!normalizar(usuario)) { aviso('Escribe tu usuario.', true); $('iceUsuario').focus(); return; }
    if (!pass) { aviso('Escribe la contraseña.', true); $('icePass').focus(); return; }
    const btn = $('iceEntrar');
    btn.disabled = true;
    aviso('Descifrando datos...');
    try {
      if (await entrar(usuario, pass)) {
        $('icePass').value = '';
      } else {
        aviso('Usuario o contraseña incorrectos.', true);
        $('icePass').select();
      }
    } catch (err) {
      console.error(err);
      aviso('No se pudieron cargar los datos; revisa tu conexión y recarga la página.', true);
    } finally {
      btn.disabled = false;
    }
  }

  async function iniciar() {
    // No se muestra dentro de un marco de otro sitio (clickjacking)
    if (window.top !== window.self) {
      try { void window.top.location.href; } catch (e) { document.documentElement.style.display = 'none'; return; }
    }
    const estado = $('iceDatos');
    try {
      await cargarScript('datos/ice/indice.js?t=' + Date.now());
      indice = window.ICE_INDICE && window.ICE_INDICE.datos;
    } catch (e) {
      indice = null;
    }
    if (!indice) { estado.textContent = 'Aún no hay datos ICE publicados.'; return; }
    if (!indice.hay_datos) { estado.textContent = indice.aviso || 'El reporte ICE no está disponible por ahora.'; return; }
    estado.innerHTML = (indice.corte ? `Corte ICE al <b>${esc(indice.corte)}</b>` : 'Aún sin evaluaciones ICE del mes') +
                       ` · actualizado el ${esc(indice.actualizado)}`;
    if (!Cripto.disponible()) {
      estado.textContent = 'Este navegador no puede descifrar los datos; abre la página en Chrome, Edge, Firefox o Safari actualizados.';
      return;
    }
    $('iceEntrar').disabled = false;
    $('iceForm').addEventListener('submit', enviar);
  }

  // ── Reporte ───────────────────────────────────────────────────────────
  let D = null, mapaM = null, mapaR = null, porSapCliente = {}, porSapEval = {};

  function render(datos) {
    D = datos;
    porSapCliente = Object.fromEntries(D.clientes.map(c => [c[0], c]));
    porSapEval = {};
    for (const e of D.evaluados) (porSapEval[e[0]] = porSapEval[e[0]] || []).push(e);
    document.body.className = 'ice-modo-reporte';
    $('iceAcceso').hidden = true;
    const v = $('iceVista');
    v.hidden = false;
    const c = D.corte;
    const pestanas = [['resumen', 'Resumen'], ['mapa', 'Mapa'], ['semanas', 'Semanas'], ['rutas', 'Rutas']];
    v.innerHTML = `
      <header class="ice-cab">
        <div>
          <p class="ice-kicker">Reporte ICE · ${esc(D.mes)} ${D.anio}</p>
          <h1>Unidad ${esc(D.unidad)}.</h1>
          <p class="ice-cab-sub">${c ? `Corte al <b>${esc(c.texto)}</b> · encuestas hasta el ${esc(fechaLarga(c.encuestas_hasta))}`
            : `Sin evaluaciones ICE de ${esc(D.mes)} todavía`} · publicado ${esc(D.generado)}${D.comparado_con
            ? `<br>Flechas ▲▼: cambio contra el corte del ${esc(D.comparado_con.texto)}` : ''}</p>
        </div>
        <div class="ice-cab-acciones">
          <a class="ice-btn sec" href="index.html">Inicio</a>
          <button type="button" class="ice-btn" data-accion="salir">Salir</button>
        </div>
      </header>
      <nav class="ice-pestanas" role="tablist" aria-label="Secciones del reporte">
        ${pestanas.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="p-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''} data-pestana="${id}">${t}</button>`).join('')}
      </nav>
      <div class="ice-panel" id="p-resumen" role="tabpanel" aria-labelledby="tab-resumen"></div>
      <div class="ice-panel ice-panel-mapa" id="p-mapa" role="tabpanel" aria-labelledby="tab-mapa" hidden></div>
      <div class="ice-panel ice-panel-mapa" id="p-semanas" role="tabpanel" aria-labelledby="tab-semanas" hidden></div>
      <div class="ice-panel ice-panel-mapa" id="p-rutas" role="tabpanel" aria-labelledby="tab-rutas" hidden></div>
      <footer class="ice-pie"><span>Brigadas VDM · ICE</span><span>Uso interno</span></footer>`;
    v.querySelector('[data-accion="salir"]').addEventListener('click', () => location.reload());
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
    resumen();
    window.scrollTo(0, 0);
  }

  function pestana(cual) {
    for (const t of document.querySelectorAll('.ice-pestanas [role="tab"]')) {
      const activa = t.dataset.pestana === cual;
      t.setAttribute('aria-selected', activa);
      t.tabIndex = activa ? 0 : -1;
    }
    for (const p of ['resumen', 'mapa', 'semanas', 'rutas']) $('p-' + p).hidden = p !== cual;
    Graficas.Tip.hide();
    if (cual === 'mapa') mapa();
    if (cual === 'semanas') semanas();
    if (cual === 'rutas') rutas();
  }

  // Cambio contra el corte anterior: ▲ sube, ▼ baja (negro si mejora, rojo si
  // empeora), = sin cambio; sin corte anterior no hay flecha
  function flecha(delta, dec = 1, subirEsBueno = true) {
    if (delta == null) return '';
    const r = Number(Number(delta).toFixed(dec));
    const ref = D.comparado_con ? `contra el corte del ${D.comparado_con.texto}` : 'contra el corte anterior';
    if (r === 0) return `<span class="delta igual" title="Sin cambio ${esc(ref)}">=</span>`;
    const sube = r > 0, mejor = sube === subirEsBueno;
    const txt = `${sube ? 'Subió' : 'Bajó'} ${num(Math.abs(r), dec)} ${ref}`;
    return `<span class="delta ${mejor ? 'mejor' : 'peor'}" title="${esc(txt)}" aria-label="${esc(txt)}">${sube ? '▲' : '▼'} ${num(Math.abs(r), dec)}</span>`;
  }

  function seccion(titulo, sub, cuerpo, id = '') {
    return `<section class="ice-seccion"${id ? ` id="${id}"` : ''}>
      <header class="ice-sec-cab"><div><h2>${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>
      ${cuerpo}
    </section>`;
  }

  function kpi(etiqueta, valor, sub, destacado) {
    return `<div class="ice-kpi${destacado ? ' destacado' : ''}">
      <p class="kpi-etiqueta">${esc(etiqueta)}</p>
      <p class="kpi-valor">${valor}</p>
      <p class="kpi-sub">${sub}</p>
    </div>`;
  }

  // ── Resumen ───────────────────────────────────────────────────────────
  function resumen() {
    const R = D.resumen, E = R.estimacion, P = R.prioridad, MA = R.mes_anterior;
    const panel = $('p-resumen');
    const difMes = R.promedio != null && MA.promedio != null ? Math.round((R.promedio - MA.promedio) * 10) / 10 : null;
    panel.innerHTML = `
      <div class="ice-kpis">
        ${kpi(`Promedio ICE · ${D.mes}`, dec1(R.promedio) + flecha(R.d_promedio),
              `${plural(R.n, 'cliente evaluado', 'clientes evaluados')} · mediana ${dec1(R.mediana)}`, true)}
        ${kpi('Estimación de cierre', E ? dec1(E.valor) + flecha(E.d_valor) : '—',
              E ? `rango probable <b>${dec1(E.bajo)} – ${dec1(E.alto)}</b>` : 'sin datos suficientes')}
        ${kpi('Clientes evaluados', num(R.n) + flecha(R.d_n, 0),
              E ? `de ~<b>${num(E.n_actual + E.n_restante)}</b> esperados en ${esc(D.mes)}` : 'en el mes')}
        ${kpi('Prioridad 1 evaluados', `${num(P.p1_eval)}<small>/ ${num(P.p1)}</small>`,
              `Prioridad 2: <b>${num(P.p2_eval)}/${num(P.p2)}</b> · aleatorios: <b>${num(P.aleatorio_eval)}/${num(P.aleatorio)}</b> · fuera del universo: <b>${num(P.fuera_universo)}</b>`)}
        ${kpi(`Cierre de ${MA.mes}`, dec1(MA.promedio),
              `${plural(MA.n, 'evaluación', 'evaluaciones')}${difMes == null ? '' : difMes === 0 ? ` · ${esc(D.mes)} va igual` : ` · ${esc(D.mes)} va ${difMes > 0 ? '+' : '−'}${num(Math.abs(difMes), 1)}`}`)}
      </div>
      <div class="ice-canales">
        ${R.por_canal.map(c => `<span class="ice-canal"><i style="background:${COLOR_CANAL[c.canal]}"></i>${esc(c.canal)}
          <b>${dec1(c.promedio)}</b>${flecha(c.d_promedio)} <span class="muted">· ${plural(c.n, 'evaluado')} · ${esc(MA.mes)}: ${dec1(c.mes_anterior)}</span></span>`).join('')}
      </div>
      ${D.excel ? `<div class="ice-descargas">
        <button type="button" class="ice-btn rojo" id="btnExcel">${svgIcono('excel')}Descargar Excel de clasificación</button>
        <span>Los <b>${num(D.clientes.length)}</b> clientes del universo ICE de ${esc(D.unidad)}: prioridad, semana del mes en que suelen evaluarse, visitas, datos del cliente, ICE y ÉPICA de ${esc(D.mes)} y la submétrica que más le quitó a cada uno en su última evaluación.</span>
      </div>` : ''}
      ${seccion('Distribución de calificaciones', `Calificación ICE de cada cliente evaluado en ${esc(D.mes)}. El histograma junta los dos canales; el violín los separa (la caja va del cuartil 1 al 3, el círculo es la mediana y la raya horizontal, el promedio).`,
        `<div class="ice-dos">
          <figure><figcaption>Histograma · todas las evaluaciones</figcaption><div class="grafica" id="gHist"></div></figure>
          <figure><figcaption>Violín por canal</figcaption><div class="grafica" id="gViolin"></div></figure>
        </div>`)}
      ${seccion('Promedio y clientes evaluados por día', `Arriba, el promedio ICE de las encuestas de cada día; abajo, cuántos clientes se evaluaron ese día. La línea punteada es el promedio del mes.`,
        '<div class="grafica" id="gDia"></div>')}
      ${seccionEstimacion()}
      ${seccionZonas()}
      ${seccionDesglose()}
      <p class="ice-nota">Universo ICE: clientes de BaseDeDatos/UniversoICE.db. <b>Prioridad 1</b>: evaluados en ${esc(D.prioridad.mes_anterior)} y con ${num(D.prioridad.min_visitas)} o más visitas en los meses anteriores; <b>prioridad 2</b>: evaluados en ${esc(D.prioridad.mes_anterior)} sin esa recurrencia; <b>aleatorios</b>: el resto del universo. La clasificación es del mes y se rehace al cambiar de mes.</p>`;

    const todas = [...(D.distribucion['Traditional'] || []), ...(D.distribucion['On Premise'] || [])];
    if (todas.length) {
      Graficas.histograma($('gHist'), {
        valores: todas, dominio: [0, 110], paso: 5, color: ROJO, colorLinea: NEGRO, alto: 300,
        titulo: 'Histograma de calificaciones ICE',
        lineas: [{ valor: R.promedio, etiqueta: `Promedio ${dec1(R.promedio)}`, color: NEGRO, punteada: true },
                 E && { valor: E.valor, etiqueta: `Estimación ${dec1(E.valor)}`, color: GRIS }].filter(Boolean),
      });
      Graficas.violin($('gViolin'), {
        dominio: [0, 110], alto: 340, titulo: 'Distribución de calificaciones por canal',
        series: [...D.canales.map(c => ({ nombre: c, valores: D.distribucion[c] || [], color: COLOR_CANAL[c] })),
                 { nombre: 'Todas', valores: todas, color: GRIS }],
      });
    } else {
      $('gHist').innerHTML = $('gViolin').innerHTML = `<p class="muted">Sin evaluaciones en ${esc(D.mes)}.</p>`;
    }
    graficaDiaria($('gDia'));
    if ($('gMeses')) graficaMeses($('gMeses'));
    if ($('btnExcel')) $('btnExcel').addEventListener('click', descargarExcel);
    graficasPerdidos();
  }

  // Dos paneles con el mismo eje de días: promedio (línea) y clientes (barras)
  function graficaDiaria(cont) {
    const filas = D.por_dia;
    if (!filas.length) { cont.innerHTML = `<p class="muted">Sin evaluaciones en ${esc(D.mes)}.</p>`; return; }
    const porDia = Object.fromEntries(filas.map(f => [partes(f[0]).d, f]));
    const ultimo = Math.max(...Object.keys(porDia).map(Number));
    const dias = Array.from({ length: ultimo }, (_, i) => i + 1);
    const promMes = D.resumen.promedio;
    A.montar(cont, (c, W, T) => {
      const m = { l: 42, r: 14, t: 26 }, H1 = 190, sep = 44, H2 = 120;
      const H = m.t + H1 + sep + H2 + 28;
      const svg = A.svgBase(c, W, H, `Promedio ICE y clientes evaluados por día de ${D.mes}`);
      const banda = (W - m.l - m.r) / dias.length;
      const xc = i => m.l + banda * (i + 0.5);
      const proms = dias.map(d => porDia[d] ? porDia[d][2] : null);
      const vals = proms.filter(v => v != null).concat(promMes != null ? [promMes] : []);
      const lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5);
      const hi = Math.min(115, Math.ceil((Math.max(...vals) + 4) / 5) * 5);
      const y1 = A.escala(lo, hi, m.t + H1, m.t);
      const titulo = (y, t) => A.texto(svg, m.l - 34, y, t, { fill: T.tinta2, 'font-size': 11, 'font-weight': 700, 'letter-spacing': '0.08em' });
      titulo(m.t - 12, 'PROMEDIO ICE DEL DÍA');
      A.ejeY(svg, y1, A.ticks(lo, hi, 4), m.l, W - m.r, T);
      if (promMes != null) A.lineaObjetivo(svg, y1, promMes, m.l, W - m.r, `Mes ${dec1(promMes)}`, T);
      let d = '';
      proms.forEach((v, i) => { if (v != null) d += (d ? 'L' : 'M') + xc(i).toFixed(1) + ',' + y1(v).toFixed(1); });
      A.el('path', { d, fill: 'none', stroke: ROJO, 'stroke-width': 2, 'stroke-linejoin': 'round', 'pointer-events': 'none' }, svg);
      proms.forEach((v, i) => {
        if (v != null) A.el('circle', { cx: xc(i), cy: y1(v), r: 4, fill: ROJO, stroke: T.sup, 'stroke-width': 2, 'pointer-events': 'none' }, svg);
      });
      const top2 = m.t + H1 + sep;
      titulo(top2 - 12, 'CLIENTES EVALUADOS');
      const maxN = Math.max(1, ...filas.map(f => f[1]));
      const tk = A.ticks(0, maxN, 3), hi2 = Math.max(maxN, tk[tk.length - 1]);
      const y2 = A.escala(0, hi2, top2 + H2, top2);
      A.ejeY(svg, y2, tk, m.l, W - m.r, T);
      const bw = Math.max(2, Math.min(22, banda - 3));
      dias.forEach((dd, i) => {
        const f = porDia[dd];
        if (f && f[1]) A.el('path', { d: A.barraV(xc(i) - bw / 2, y2(0), y2(f[1]), bw, 3), fill: GRIS_OSC, 'pointer-events': 'none' }, svg);
      });
      A.el('line', { x1: m.l, x2: W - m.r, y1: top2 + H2, y2: top2 + H2, stroke: T.eje, 'stroke-width': 1 }, svg);
      const cada = Math.max(1, Math.ceil(dias.length / Math.max(2, Math.floor((W - m.l - m.r) / 30))));
      dias.forEach((dd, i) => {
        if (i % cada && i !== dias.length - 1) return;
        A.texto(svg, xc(i), top2 + H2 + 18, dd, { 'text-anchor': 'middle', fill: T.muted, 'font-size': 11, class: 'g-num' });
      });
      const marca = A.el('rect', { x: 0, y: m.t, width: banda, height: top2 + H2 - m.t, fill: NEGRO, 'fill-opacity': 0.06,
                                  visibility: 'hidden', 'pointer-events': 'none' }, svg);
      dias.forEach((dd, i) => {
        const f = porDia[dd];
        const hit = A.el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: top2 + H2 - m.t, fill: 'transparent' }, svg);
        const iso = `${D.anio}-${String(D.mes_num).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        Graficas.conTip(hit, `<b>${diaSemana(iso)} ${dd} de ${esc(D.mes)}</b>` + (f
          ? `<table class="tip-tabla"><tr><td>Promedio ICE</td><td>${dec1(f[2])}</td></tr><tr><td>Clientes evaluados</td><td>${num(f[1])}</td></tr>
             <tr><td>Traditional</td><td>${num(f[3])}</td></tr><tr><td>On Premise</td><td>${num(f[4])}</td></tr></table>`
          : '<br>Sin evaluaciones'));
        hit.addEventListener('pointerenter', () => { marca.setAttribute('x', m.l + banda * i); marca.setAttribute('visibility', 'visible'); });
        hit.addEventListener('pointerleave', () => marca.setAttribute('visibility', 'hidden'));
      });
    });
  }

  // ── Estimación de cierre ──────────────────────────────────────────────
  function seccionEstimacion() {
    const R = D.resumen, E = R.estimacion;
    if (!E) return seccion('Estimación de cierre del mes', '', `<p class="muted">Todavía no hay datos suficientes para estimar el cierre de ${esc(D.mes)}.</p>`);
    const canales = R.por_canal.filter(c => c.estimacion);
    const pendientes = canales.reduce((a, c) => a + c.estimacion.n_pendientes, 0);
    const total = E.n_actual + E.n_restante;
    const paso2 = E.n_restante
      ? `<li><b>¿Cómo saldrían?</b> Primero cuentan los <b>${num(pendientes)}</b> clientes prioridad 1 y 2 que aún no se evalúan (los que el auditor tiene más probabilidad de visitar), cada uno con su promedio ICE de los últimos meses; si no alcanzan, el resto se califica con el promedio que lleva ${esc(D.mes)}. Así, las que faltan saldrían en <b>${dec1(E.prom_restante)}</b> en promedio.</li>`
      : `<li><b>Ya se alcanzó el volumen habitual del mes</b>, así que la estimación es el promedio que lleva ${esc(D.mes)}.</li>`;
    const pasos = `<ol class="est-pasos">
      <li><b>¿Cuántas evaluaciones faltan?</b> En ${esc(E.meses_base.join(', ').replace(/, ([^,]*)$/, ' y $1'))} la unidad tuvo en promedio <b>${num(E.n_esperado)}</b> evaluaciones al mes; van <b>${num(E.n_actual)}</b>, así que se esperan <b>${num(E.n_restante)}</b> más.</li>
      ${paso2}
      <li><b>Cierre estimado</b> = (suma de las calificaciones del mes + las que faltan) ÷ ${num(total)} = <b>${dec1(E.valor)}</b>${flecha(E.d_valor)}. El rango probable (<b>${dec1(E.bajo)} – ${dec1(E.alto)}</b>, 95%) refleja cuánto varían las calificaciones. Se calcula por canal y se junta.</li>
    </ol>`;
    const tabla = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th>Canal</th><th>Evaluadas</th><th>Promedio actual</th><th>Esperadas en el mes</th><th>Faltan</th><th>Promedio de las que faltan</th><th>Estimación</th><th>Rango probable</th></tr></thead>
      <tbody>${canales.map(c => { const e = c.estimacion; return `<tr>
        <th scope="row"><span class="ice-canal"><i style="background:${COLOR_CANAL[c.canal]}"></i>${esc(c.canal)}</span></th>
        <td>${num(e.n_actual)}</td><td>${dec1(e.prom_actual)}</td><td>${num(e.n_actual + e.n_restante)}</td><td>${num(e.n_restante)}</td>
        <td>${dec1(e.prom_restante)}</td><td><b>${dec1(e.valor)}</b> ${flecha(e.d_valor)}</td><td>${dec1(e.bajo)} – ${dec1(e.alto)}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><th scope="row">Unidad</th><td>${num(E.n_actual)}</td><td>${dec1(R.promedio)}</td><td>${num(total)}</td><td>${num(E.n_restante)}</td>
        <td>${dec1(E.prom_restante)}</td><td>${dec1(E.valor)} ${flecha(E.d_valor)}</td><td>${dec1(E.bajo)} – ${dec1(E.alto)}</td></tr></tfoot>
    </table></div>`;
    return seccion('Estimación de cierre del mes', `Cómo podría cerrar ${esc(D.mes)} la unidad ${esc(D.unidad)} si el resto del mes se comporta como los datos indican.`,
      `<div class="est-cuerpo"><div>${pasos}</div>
        <figure><figcaption>Promedio ICE por mes y estimación de ${esc(D.mes)}</figcaption><div class="grafica" id="gMeses"></div></figure></div>
       <div style="margin-top:18px">${tabla}</div>`);
  }

  function graficaMeses(cont) {
    const H_ = D.resumen.historico, E = D.resumen.estimacion;
    A.montar(cont, (c, W, T) => {
      const H = 250, m = { l: 36, r: 10, t: 22, b: 28 };
      const svg = A.svgBase(c, W, H, 'Promedio ICE por mes');
      const vals = H_.map(h => h.promedio).filter(v => v != null).concat(E ? [E.alto] : []);
      const hi = Math.min(115, Math.ceil((Math.max(100, ...vals) + 5) / 10) * 10);
      const y = A.escala(0, hi, H - m.b, m.t);
      A.ejeY(svg, y, A.ticks(0, hi, 4), m.l, W - m.r, T);
      const banda = (W - m.l - m.r) / H_.length, bw = Math.min(46, banda - 10);
      H_.forEach((h, i) => {
        const x = m.l + banda * (i + 0.5);
        if (h.promedio != null) {
          A.el('path', { d: A.barraV(x - bw / 2, y(0), y(h.promedio), bw, 4), fill: h.actual ? ROJO : GRIS, 'pointer-events': 'none' }, svg);
          A.texto(svg, x, y(h.promedio) - 6, dec1(h.promedio), { 'text-anchor': 'middle', fill: T.tinta, 'font-size': 11, 'font-weight': 700, class: 'g-num' });
        }
        A.texto(svg, x, H - m.b + 17, h.etiqueta, { 'text-anchor': 'middle', fill: h.actual ? T.tinta : T.muted, 'font-size': 11, 'font-weight': h.actual ? 700 : 500 });
        if (h.actual && E) {
          A.el('line', { x1: x - bw / 2 - 6, x2: x + bw / 2 + 6, y1: y(E.valor), y2: y(E.valor), stroke: NEGRO, 'stroke-width': 2.5, 'stroke-dasharray': '5 3', 'pointer-events': 'none' }, svg);
          A.el('rect', { x: x - 2, y: y(E.alto), width: 4, height: Math.max(1, y(E.bajo) - y(E.alto)), fill: NEGRO, 'pointer-events': 'none' }, svg);
          A.texto(svg, x, Math.min(y(E.alto), y(h.promedio == null ? E.valor : h.promedio)) - 20, `est. ${dec1(E.valor)}`,
                  { 'text-anchor': 'middle', fill: T.tinta, 'font-size': 11, 'font-weight': 800, class: 'g-num' });
        }
        const hit = A.el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: 'transparent' }, svg);
        Graficas.conTip(hit, `<b>${esc(MESES[+h.mes.slice(5, 7) - 1])} ${esc(h.mes.slice(0, 4))}</b><table class="tip-tabla">
          <tr><td>Promedio ICE</td><td>${dec1(h.promedio)}</td></tr><tr><td>Evaluaciones</td><td>${num(h.n)}</td></tr>
          ${h.actual && E ? `<tr><td>Estimación de cierre</td><td>${dec1(E.valor)}</td></tr><tr><td>Rango probable</td><td>${dec1(E.bajo)} – ${dec1(E.alto)}</td></tr>` : ''}</table>`);
      });
      A.el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: T.eje, 'stroke-width': 1 }, svg);
    });
    A.leyenda(cont.parentNode, [{ nombre: 'Meses cerrados', color: GRIS }, { nombre: `${D.mes} (va)`, color: ROJO },
                                { nombre: 'Estimación de cierre y su rango', color: NEGRO, forma: 'linea', punteada: true }]);
  }

  // ── Por zona ──────────────────────────────────────────────────────────
  function celdaBarra(v, delta, referencia) {
    if (v == null) return '<span class="muted">—</span>';
    const bajo = referencia != null && v < referencia;
    return `<div class="celda-barra"><span class="pista" title="Escala de 0 a 110"><span class="${bajo ? 'bajo' : ''}" style="width:${Math.min(100, v / 110 * 100).toFixed(1)}%"></span></span><b>${dec1(v)}</b>${flecha(delta)}</div>`;
  }

  function seccionZonas() {
    const R = D.resumen, Z = D.por_zona;
    if (!Z.length) return '';
    const canal = n => (R.por_canal.find(c => c.canal === n) || {}).promedio;
    return seccion('Calificación por zona', `Zona = jefatura de ventas del cliente. Barra roja: zona debajo del promedio de la unidad (${dec1(R.promedio)}). Prioridad 1 evaluados: cuántos de los clientes prioridad 1 de la zona ya tienen ICE en ${esc(D.mes)}.`,
      `<div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th>Zona</th><th>Evaluados</th><th>Promedio ICE</th><th>Traditional</th><th>On Premise</th><th>Prioridad 1 evaluados</th><th>Cierre de ${esc(R.mes_anterior.mes)}</th></tr></thead>
        <tbody>${Z.map(z => `<tr><th scope="row">${esc(z.zona)}</th><td>${num(z.n)} ${flecha(z.d_n, 0)}</td>
          <td>${celdaBarra(z.promedio, z.d_promedio, R.promedio)}</td><td>${dec1(z.trad)}</td><td>${dec1(z.op)}</td>
          <td>${num(z.p1_eval)} / ${num(z.p1)}</td><td>${dec1(z.mes_anterior)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Unidad</th><td>${num(R.n)} ${flecha(R.d_n, 0)}</td><td>${celdaBarra(R.promedio, R.d_promedio, null)}</td>
          <td>${dec1(canal('Traditional'))}</td><td>${dec1(canal('On Premise'))}</td><td>${num(R.prioridad.p1_eval)} / ${num(R.prioridad.p1)}</td><td>${dec1(R.mes_anterior.promedio)}</td></tr></tfoot>
      </table></div>`);
  }

  // ── Desglose por submétrica ───────────────────────────────────────────
  function colorCalor(v) {
    // 100% = blanco, 0% = rojo Coke (una sola tinta, de claro a intenso)
    const t = Math.max(0, Math.min(1, (100 - v) / 100)) ** 0.85;
    const mezcla = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mezcla(255, 244)},${mezcla(255, 0)},${mezcla(255, 0)})`;
  }

  function seccionDesglose() {
    const G = D.desglose, mets = D.metricas, canales = D.canales;
    const filas = mets.map((m, i) => ({ m, i })).filter(({ i }) => [...canales, 'Total'].some(c => G.canal[c] && G.canal[c].prom[i] != null));
    if (!filas.length) return '';
    const maxPerd = {};
    for (const c of canales) {
      const p = (G.canal[c] && G.canal[c].perdidos) || [];
      maxPerd[c] = p.reduce((a, v, i) => (v != null && (a == null || v > p[a]) ? i : a), null);
    }
    const pesos = canales.map(c => {
      const w = G.pesos[c] || [];
      const txt = mets.map((m, i) => w[i] != null ? `${m.nombre} ${num(w[i] * 100, 0)}` : null).filter(Boolean).join(', ');
      return txt ? `<b>${esc(c)}</b>: ${esc(txt)} (estimado con ${num(G.n_pesos[c])} evaluaciones)` : '';
    }).filter(Boolean).join('. ');
    const tabla = `<div class="tabla-scroll"><table class="ice-tabla">
      <thead><tr><th>Submétrica</th>
        ${canales.map(c => `<th>${esc(c)} · promedio</th><th>${esc(c)} · puntos que quita</th>`).join('')}<th>Todas · promedio</th></tr></thead>
      <tbody>${filas.map(({ m, i }) => `<tr>
        <th scope="row"><span class="metrica-nombre"><span class="icono-metrica">${svgIcono(m.id)}</span>${esc(m.nombre)}</span></th>
        ${canales.map(c => {
          const g = G.canal[c] || { prom: [], d: [], perdidos: [] };
          const v = g.prom[i], p = (g.perdidos || [])[i];
          return `<td>${v == null ? '<span class="muted">—</span>' : `${num(v, 1)}% ${flecha(g.d[i])}`}</td>
                  <td>${p == null ? '<span class="muted">—</span>' : `−${num(p, 1)}${maxPerd[c] === i ? '<span class="mas-impacto">más impacto</span>' : ''}`}</td>`;
        }).join('')}
        <td>${G.canal.Total.prom[i] == null ? '<span class="muted">—</span>' : `${num(G.canal.Total.prom[i], 1)}% ${flecha(G.canal.Total.d[i])}`}</td></tr>`).join('')}</tbody>
    </table></div>`;
    const usadas = filas.filter(({ i }) => G.zonas.some(z => z.prom[i] != null));
    const calor = G.zonas.length ? `<h3 class="ice-subtitulo" style="margin-top:26px">Promedio de cada submétrica por zona (%)</h3>
      <div class="tabla-scroll"><table class="ice-tabla tabla-calor">
        <thead><tr><th>Zona</th><th>Evaluados</th>${usadas.map(({ m }) => `<th>${esc(m.nombre)}</th>`).join('')}</tr></thead>
        <tbody>${G.zonas.map(z => `<tr><th scope="row">${esc(z.zona)}</th><td>${num(z.n)}</td>${usadas.map(({ i }) => {
          const v = z.prom[i];
          if (v == null) return '<td class="vacio">—</td>';
          const fondo = colorCalor(v);
          return `<td style="background:${fondo};color:${Graficas.tintaSobre(fondo)}">${num(v, 0)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="escala-calor"><span>0%</span><i aria-hidden="true"></i><span>100%</span></p>` : '';
    return seccion('Desglose de la calificación', `Submétricas del ICE en ${esc(D.mes)}: promedio de cumplimiento y cuántos puntos de la calificación se pierden en promedio por cada una (peso aproximado × lo que le falta para el 100%). La que más quita es donde más conviene trabajar.`,
      `${tabla}
       <div class="ice-dos" style="margin-top:22px">
         ${canales.map((c, k) => `<figure><figcaption>Puntos que quita cada submétrica · ${esc(c)}</figcaption><div class="grafica" id="gPerd${k}"></div></figure>`).join('')}
       </div>
       ${calor}
       <p class="ice-nota">Peso aproximado de cada submétrica (puntos que aporta al 100%; con el bono el máximo es 110): ${pesos}. El reporte no trae la fórmula: los pesos se estiman con las evaluaciones recientes y sirven para comparar, no son oficiales.</p>`);
  }

  function graficasPerdidos() {
    const G = D.desglose;
    const max = Math.max(1, ...D.canales.flatMap(c => ((G.canal[c] || {}).perdidos || []).filter(v => v != null)));
    D.canales.forEach((c, k) => {
      const cont = $('gPerd' + k);
      if (!cont) return;
      const g = G.canal[c] || {};
      const filas = D.metricas.map((m, i) => ({ m, i, p: (g.perdidos || [])[i], v: (g.prom || [])[i] }))
        .filter(x => x.p != null).sort((a, b) => b.p - a.p);
      if (!filas.length) { cont.innerHTML = '<p class="muted">Sin datos.</p>'; return; }
      Graficas.barras(cont, {
        titulo: `Puntos que quita cada submétrica en ${c}`, max, anchoEtiqueta: 170, margenDerecho: 70, altoFila: 32,
        filas: filas.map((x, j) => ({ etiqueta: x.m.nombre, valor: x.p, color: j === 0 ? ROJO : NEGRO, texto: `−${num(x.p, 1)} pts`,
                                      tip: `<b>${esc(x.m.nombre)} · ${esc(c)}</b><br>Promedio ${num(x.v, 1)}% · quita ${num(x.p, 1)} puntos en promedio` })),
      });
    });
  }

  // ── Mapa ──────────────────────────────────────────────────────────────
  function capaBase(mapa) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(mapa);
  }

  function limitesRobustos(puntos) {
    if (puntos.length < 20) return L.latLngBounds(puntos);
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
    const la = puntos.map(p => p[0]).sort((a, b) => a - b), lo = puntos.map(p => p[1]).sort((a, b) => a - b);
    return L.latLngBounds([q(la, 0.01), q(lo, 0.01)], [q(la, 0.99), q(lo, 0.99)]);
  }

  // En celular el dedo casi nunca cae exacto: se abre el cliente más cercano
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

  function etiqueta(m, nombre, sap) {
    if (!TACTIL) m.bindTooltip(`<b>${esc(nombre || 'Cliente sin nombre')}</b> · SAP ${esc(sap)}`, { direction: 'top', offset: [0, -6], opacity: 0.95 });
  }

  // Botón "Mi ubicación" (GPS del equipo); otro toque lo apaga
  function botonUbicacion(mapa) {
    let vigilancia = null, punto = null, circulo = null, centrado = false, boton = null, avisoEl = null, t = null;
    const avisar = texto => { avisoEl.textContent = texto; avisoEl.hidden = false; clearTimeout(t); t = setTimeout(() => { avisoEl.hidden = true; }, 6000); };
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
        punto = L.marker(ll, { keyboard: false, zIndexOffset: 2000, icon: L.divIcon({ className: 'yo-icono', html: '<span class="yo-punto"></span>', iconSize: [22, 22] }) }).addTo(mapa);
      }
      punto.setLatLng(ll); circulo.setLatLng(ll).setRadius(prec);
      estado('activo');
      if (!centrado) {
        centrado = true;
        mapa.setView(ll, Math.max(mapa.getZoom(), 16));
        if (prec > 500) avisar(`Ubicación aproximada (±${num(prec)} m): este equipo no tiene GPS o no tiene señal.`);
      }
    };
    const fallo = err => {
      apagar();
      avisar(err.code === 1 ? 'Sin permiso de ubicación: actívalo para esta página en tu navegador.'
           : err.code === 3 ? 'La ubicación tardó demasiado. Intenta de nuevo.' : 'No se pudo obtener tu ubicación.');
    };
    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const caja = L.DomUtil.create('div', 'leaflet-bar ctl-ubicacion');
        boton = L.DomUtil.create('button', '', caja);
        boton.type = 'button';
        boton.innerHTML = `<span style="display:block;width:18px;height:18px">${svgIcono('gps')}</span>`;
        boton.setAttribute('aria-label', 'Mi ubicación');
        estado('apagado');
        L.DomEvent.disableClickPropagation(caja);
        L.DomEvent.on(boton, 'click', () => {
          if (vigilancia != null) return apagar();
          if (!('geolocation' in navigator) || !window.isSecureContext) return avisar('Este navegador no puede dar tu ubicación.');
          estado('buscando');
          vigilancia = navigator.geolocation.watchPosition(encontrada, fallo, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
        });
        return caja;
      },
    });
    new Control().addTo(mapa);
    avisoEl = L.DomUtil.create('div', 'mapa-aviso', mapa.getContainer());
    avisoEl.setAttribute('role', 'status');
    avisoEl.hidden = true;
    mapa.on('unload', apagar);
  }

  function enlacesMapa(lat, lon) {
    if (lat == null) return '';
    return `<a class="pc-btn" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${+lat},${+lon}&travelmode=driving">Cómo llegar</a>
            <a class="pc-btn sec" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${+lat},${+lon}">Ver en Google Maps</a>`;
  }

  const fila = (k, v) => v == null || v === '' ? '' : `<dt>${esc(k)}</dt><dd>${v}</dd>`;

  function textoEpica(sap) {
    const e = D.epica[sap];
    if (!e) return `<span class="estado-epica pendiente">Pendiente</span>`;
    return `<span class="estado-epica">${dec1(e[1])}</span> · ${esc(fechaCorta(e[0]))}${e[2] ? '<span class="alerta">NoGeo</span>' : ''}${e[3] ? '<span class="alerta">Foto de foto</span>' : ''}`;
  }

  function perdidosDe(ci, mets) {
    const w = D.desglose.pesos[D.canales[ci]] || [];
    return mets.map((v, i) => v == null ? null : (w[i] != null ? w[i] : 0.01) * Math.max(0, 100 - v));
  }

  // Barras de las submétricas de una evaluación (canal, submétricas, la que más quita)
  function metricasPopup(ci, mets, peor) {
    const perd = perdidosDe(ci, mets);
    return `<div class="pc-mets">${D.metricas.map((m, i) => {
      const v = mets[i];
      if (v == null) return '';
      return `<div class="pc-met${peor === i ? ' peor' : ''}"><span class="icono-metrica">${svgIcono(m.id)}</span>
        <span class="barra"><i style="width:${Math.min(100, v)}%"></i><em>${esc(m.nombre)} ${num(v, 0)}%</em></span>
        <b>${perd[i] > 0.05 ? '−' + num(perd[i], 1) : '0'}</b></div>`;
    }).join('')}</div>`;
  }

  // Última evaluación del cliente: [fecha, canal, ICE, submétricas, la que más quitó, puntos]
  const idPeor = u => u[4] == null ? 'ok' : D.metricas[u[4]].id;
  const nombrePeor = u => u[4] != null ? D.metricas[u[4]].nombre : u[3].some(v => v != null) ? 'Todo al 100%' : 'Sin desglose';
  const cortoPeor = u => u[4] != null ? CORTO[idPeor(u)] || D.metricas[u[4]].nombre : nombrePeor(u);
  const contar = (lista, clave) => lista.reduce((a, x) => { const k = clave(x); a[k] = (a[k] || 0) + 1; return a; }, {});

  // Leyenda de los símbolos de las submétricas ({id de la submétrica u 'ok': cuántos})
  function leyendaSimbolos(cuenta) {
    return D.metricas.map(m => cuenta[m.id] ? `<span><span class="ev-mini">${svgIcono(m.id)}</span>${esc(m.nombre)} <b>${num(cuenta[m.id])}</b></span>` : '').join('') +
      (cuenta.ok ? `<span><span class="ev-mini">${svgIcono('ok')}</span>Todo al 100% <b>${num(cuenta.ok)}</b></span>` : '');
  }

  function popupCliente(c) {
    const [sap, nombre, lat, lon, prio, zi, ruta, zpv, vprev, vant, ultima, ultimoIce, promHist, dir, semana, enSemana, conFecha, ult] = c;
    const evs = porSapEval[sap] || [];
    // La del mes si ya se evaluó (misma forma que la última evaluación)
    const u = evs.length ? [evs[0][5], evs[0][4], evs[0][6], evs[0][7], evs[0][8], evs[0][9]] : ult;
    return `<div class="pc"><div class="pc-cab ${PRIO[prio].clase}"><b>${esc(nombre || 'Cliente sin nombre')}</b>
        <span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
        <span>${PRIO[prio].nombre} · ${evs.length ? `evaluado en ${esc(D.mes)}: ICE ${dec1(evs[0][6])}` : `sin evaluar en ${esc(D.mes)}`}</span></div>
      ${enlacesMapa(lat, lon)}
      <dl class="pc-cuerpo">${fila('Dirección', esc(dir))}${fila('Zona', esc(D.zonas[zi]))}${fila('Ruta', esc(ruta))}${fila('Frecuencia', esc(zpv))}
        ${fila(`Visitas en ${D.prioridad.mes_anterior}`, num(vant))}${fila('Visitas antes', num(vprev))}
        ${fila('Última visita ICE', ultima ? `${esc(fechaCorta(ultima))} · ${dec1(ultimoIce)}` : 'sin visitas')}
        ${fila('Promedio ICE', dec1(promHist))}${semana ? fila('Semana del mes', `${num(semana)} <span class="muted">(${num(enSemana)} de ${plural(conFecha, 'visita')})</span>`) : ''}
        ${fila(`ÉPICA de ${D.mes}`, textoEpica(sap))}
        ${u ? fila('Le faltó', `<b>${esc(nombrePeor(u))}</b> <span class="muted">(${evs.length ? `ICE de ${esc(D.mes)}` : `última evaluación, ${esc(fechaCorta(u[0]))}`})</span>`) : ''}</dl>
      ${u ? `${evs.length ? '' : `<p class="pc-sub">Última evaluación · ${esc(fechaCorta(u[0]))} · ICE ${dec1(u[2])} · ${esc(D.canales[u[1]])}</p>`}${metricasPopup(u[1], u[3], u[4])}` : ''}</div>`;
  }

  function popupEvaluado(e) {
    const [sap, nombre, lat, lon, ci, fecha, score, , , , zi, prio, ubic] = e;
    const peor = e[8] != null ? D.metricas[e[8]].nombre : null;
    return `<div class="pc"><div class="pc-cab ${prio === 1 ? 'p1' : prio === 3 ? 'p3' : ''}"><b>${esc(nombre || 'Cliente sin nombre')}</b>
        <span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
        <span>ICE <b style="display:inline;font-size:13px">${dec1(score)}</b> · ${esc(D.canales[ci])} · ${esc(fechaCorta(fecha))}</span></div>
      ${enlacesMapa(lat, lon)}
      <dl class="pc-cuerpo">${fila('Lo que más quita', peor ? `<b>${esc(peor)}</b>` : 'nada: todo al 100%')}${fila('Tipo', PRIO[prio].nombre)}
        ${fila('Zona', esc(D.zonas[zi]))}${fila('Encuesta', ubic === 'Far' ? 'lejos del cliente (Far)' : ubic === 'Near' ? 'cerca del cliente' : '')}
        ${prio ? fila(`ÉPICA de ${D.mes}`, textoEpica(sap)) : ''}</dl>
      ${metricasPopup(e[4], e[7], e[8])}</div>`;
  }

  function mapa() {
    const panel = $('p-mapa');
    if (mapaM) { setTimeout(() => mapaM.invalidateSize(), 50); return; }
    const P = D.resumen.prioridad, promU = D.resumen.promedio;
    const cuentaPeor = contar(D.evaluados, e => e[8] == null ? 'ok' : D.metricas[e[8]].id);
    const sinCoordEv = D.evaluados.filter(e => e[2] == null).length;
    const sinCoordU = D.clientes.filter(c => c[2] == null).length;
    const total = contar(D.clientes, c => c[4]), hechos = contar(D.clientes.filter(c => porSapEval[c[0]]), c => c[4]);
    const conEval = D.clientes.filter(c => c[17]).length;
    panel.innerHTML = `
      <div class="mapa-barra">
        <p class="mapa-resumen">Universo ICE de ${esc(D.unidad)}: <b>${num(D.clientes.length)}</b> clientes · <b>prioridad 1</b> ${num(P.p1)} (evaluados en ${esc(D.prioridad.mes_anterior)} y con ${num(D.prioridad.min_visitas)}+ visitas antes) · <b>prioridad 2</b> ${num(P.p2)} (evaluados en ${esc(D.prioridad.mes_anterior)}, sin esa recurrencia) · <b>aleatorios</b> ${num(P.aleatorio)}. Evaluados en ${esc(D.mes)}: <b>${num(D.evaluados.length)}</b>${sinCoordEv + sinCoordU ? ` (${num(sinCoordEv + sinCoordU)} sin coordenadas no aparecen en el mapa)` : ''}.</p>
        <div class="mapa-controles">
          <div class="chips">
            ${[1, 2, 3].map(p => `<button type="button" class="chip on" aria-pressed="true" data-p="${p}"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre} · ${num(hechos[p] || 0)}/${num(total[p] || 0)} evaluados</button>`).join('')}
            <button type="button" class="chip" aria-pressed="false" id="mapaPendientes">Solo sin ICE en ${esc(D.mes)}</button>
          </div>
          <div class="campo-busca"><input type="search" id="buscaMapa" placeholder="Buscar SAP o cliente" aria-label="Buscar SAP o cliente" autocomplete="off"><ul id="buscaMapaRes" class="busca-res" hidden></ul></div>
        </div>
        <div class="chips" role="group" aria-label="Símbolos en el mapa">
          <button type="button" class="chip grande" aria-pressed="false" data-modo="evaluados"><span class="icono-metrica" aria-hidden="true">${svgIcono('ok')}</span>Evaluados en ${esc(D.mes)}: lo que más les quita</button>
          <button type="button" class="chip grande" aria-pressed="false" data-modo="falto"><span class="icono-metrica" aria-hidden="true">${svgIcono('lista')}</span>Lo que les faltó en su última evaluación (${num(conEval)})</button>
        </div>
        <div class="leyenda-metricas" id="leyendaEval" hidden>
          <span>Símbolo = submétrica que más puntos le quita a cada cliente evaluado:</span>
          ${leyendaSimbolos(cuentaPeor)}
          <span><span class="ev-mini bajo">${svgIcono('ok')}</span>Fondo rojo: ICE debajo del promedio de la unidad (${dec1(promU)})</span>
        </div>
        <div class="leyenda-metricas" id="leyendaFalto" hidden></div>
        <p class="mapa-ayuda">${TACTIL ? 'Toca' : 'Haz clic en'} un cliente para ver su ficha, su ÉPICA del mes, lo que le faltó en su última evaluación y cómo llegar. <span class="visto-mini" aria-hidden="true">${svgIcono('ok')}</span> = ya evaluado en ${esc(D.mes)}.</p>
      </div>
      <div id="mapaIce" class="mapa"></div>`;

    mapaM = L.map('mapaIce', { preferCanvas: true });
    capaBase(mapaM);
    botonUbicacion(mapaM);
    const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
    const capa = L.layerGroup().addTo(mapaM);
    // modo: null = solo prioridad, 'evaluados' = capa de los evaluados del mes, 'falto' = lo que les faltó
    const estado = { prios: new Set([1, 2, 3]), pendientes: false, modo: null };
    const marcadores = [], marcadorDe = {}, indice = [], limites = [];
    const marcaDiv = (html, tam, z) => ({ keyboard: false, zIndexOffset: z, riseOnHover: true,
      icon: L.divIcon({ className: 'ev-icono', html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2] }) });
    const pintar = () => {
      capa.clearLayers();
      marcadores.length = 0;
      for (const k of Object.keys(marcadorDe)) delete marcadorDe[k];
      const falto = estado.modo === 'falto', lista = [];
      // Aleatorios abajo y prioridad 1 encima
      for (const c of [...D.clientes].sort((a, b) => b[4] - a[4])) {
        const [sap, nombre, lat, lon, prio, , , , , , , , , , , , , ult] = c;
        const hecho = !!porSapEval[sap];
        if (lat == null || !estado.prios.has(prio) || (estado.pendientes && hecho)) continue;
        const s = PRIO[prio], z = (4 - prio) * 100;
        let m;
        if (falto && ult) {
          lista.push(c);
          m = L.marker([lat, lon], marcaDiv(`<span class="falta-marca p${prio}">${svgIcono(idPeor(ult))}${hecho ? `<i>${svgIcono('ok')}</i>` : ''}</span>`, 26, z));
          if (!TACTIL) m.bindTooltip(`<b>${esc(nombre || 'Cliente sin nombre')}</b> · le faltó: ${esc(nombrePeor(ult))}${hecho ? ` · ya evaluado en ${esc(D.mes)}` : ''}`, { direction: 'top', offset: [0, -12], opacity: 0.95 });
        } else {
          m = hecho ? L.marker([lat, lon], marcaDiv(`<span class="visto-marca p${prio}">${svgIcono('ok')}</span>`, 18, z))
            : L.circleMarker([lat, lon], { renderer: rend, radius: s.radio, color: s.borde, weight: s.grosor, fillColor: s.relleno, fillOpacity: 1 });
          etiqueta(m, nombre, sap);
        }
        m.bindPopup(() => popupCliente(c), { maxWidth: 320 }).addTo(capa);
        marcadores.push(m);
        marcadorDe[sap] = m;
      }
      if (falto) {
        const pend = lista.filter(c => !porSapEval[c[0]]).length;
        $('leyendaFalto').innerHTML = `<p class="leyenda-texto">Símbolo = submétrica que más puntos le quitó a cada cliente en su última evaluación ICE (prioridad 1, 2 y aleatorios que alguna vez se evaluaron; color = prioridad). <b>${num(lista.length)}</b> en el mapa${lista.length > pend ? `, <b>${num(pend)}</b> aún sin ICE en ${esc(D.mes)}; <span class="visto-mini" aria-hidden="true">${svgIcono('ok')}</span> = ya evaluado (su evaluación de ${esc(D.mes)})` : `, todos aún sin ICE en ${esc(D.mes)}`}:</p>${leyendaSimbolos(contar(lista, c => idPeor(c[17])))}`;
      }
    };
    pintar();
    for (const c of D.clientes) {
      if (c[2] == null) continue;
      indice.push({ sap: c[0], nombre: c[1], lat: c[2], lon: c[3], get m() { return marcadorDe[c[0]]; }, popup: () => popupCliente(c) });
      limites.push([c[2], c[3]]);
    }
    const capaEval = L.layerGroup();
    for (const e of D.evaluados) {
      const [sap, nombre, lat, lon, , , score] = e;
      if (lat == null) continue;
      const id = e[8] == null ? 'ok' : D.metricas[e[8]].id;
      const bajo = promU != null && score != null && score < promU;
      const m = L.marker([lat, lon], marcaDiv(`<span class="ev-marca${bajo ? ' bajo' : ''}">${svgIcono(id)}</span>`, 26, 500))
        .bindPopup(() => popupEvaluado(e), { maxWidth: 320 });
      if (!TACTIL) m.bindTooltip(`<b>${esc(nombre)}</b> · ICE ${dec1(score)}`, { direction: 'top', offset: [0, -12], opacity: 0.95 });
      m.addTo(capaEval);
      indice.push({ sap, nombre, m, lat, lon, ev: true, popup: () => popupEvaluado(e) });
      limites.push([lat, lon]);
    }
    if (limites.length) mapaM.fitBounds(limitesRobustos(limites).pad(0.04));
    else mapaM.setView([19.38, -99.14], 11);
    toqueCercano(mapaM, marcadores);

    panel.querySelectorAll('.chip[data-p]').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      b.classList.toggle('on', on);
      if (on) estado.prios.add(+b.dataset.p); else estado.prios.delete(+b.dataset.p);
      pintar();
    }));
    $('mapaPendientes').addEventListener('click', e => {
      estado.pendientes = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', estado.pendientes);
      e.currentTarget.classList.toggle('on', estado.pendientes);
      pintar();
    });
    // Los dos botones de símbolos se excluyen: con los dos habría dos marcas por cliente evaluado
    const botonesModo = [...panel.querySelectorAll('[data-modo]')];
    const ponerModo = modo => {
      const cambiaFalto = (estado.modo === 'falto') !== (modo === 'falto');
      estado.modo = modo;
      botonesModo.forEach(x => x.setAttribute('aria-pressed', x.dataset.modo === modo));
      $('leyendaEval').hidden = modo !== 'evaluados';
      $('leyendaFalto').hidden = modo !== 'falto';
      if (modo === 'evaluados') capaEval.addTo(mapaM); else mapaM.removeLayer(capaEval);
      if (cambiaFalto) pintar();
      setTimeout(() => mapaM.invalidateSize(), 50);
    };
    botonesModo.forEach(b => b.addEventListener('click', () => ponerModo(estado.modo === b.dataset.modo ? null : b.dataset.modo)));
    buscador($('buscaMapa'), $('buscaMapaRes'), indice, mapaM, x => {
      if (x.ev && estado.modo !== 'evaluados') ponerModo('evaluados');
    });
  }

  // Si el cliente buscado está oculto por los filtros, su ficha se abre sola en el mapa
  function buscador(input, lista, indice, mapa, antes) {
    const cerrar = () => { lista.hidden = true; lista.innerHTML = ''; };
    input.addEventListener('input', () => {
      const q = normalizar(input.value);
      if (q.length < 3) return cerrar();
      const vistos = new Set();
      const res = indice.filter(x => (x.sap.startsWith(q) || normalizar(x.nombre).includes(q)) && !vistos.has(x.sap + (x.ev ? 'e' : '')) && vistos.add(x.sap + (x.ev ? 'e' : ''))).slice(0, 8);
      lista.innerHTML = res.length ? res.map((x, i) => `<li><button type="button" data-i="${i}"><b>${esc(x.sap)}</b> ${esc(x.nombre)}${x.ev ? ' · evaluado' : ''}</button></li>`).join('')
        : '<li class="muted">Sin coincidencias</li>';
      lista.hidden = false;
      lista.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const x = res[+b.dataset.i];
        cerrar(); input.value = x.sap;
        if (antes) antes(x);
        mapa.setView([x.lat, x.lon], 17);
        setTimeout(() => {
          const m = x.m;
          if (m && mapa.hasLayer(m)) m.openPopup();
          else if (x.popup) L.popup({ maxWidth: 320 }).setLatLng([x.lat, x.lon]).setContent(x.popup()).openOn(mapa);
        }, 300);
      }));
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    document.addEventListener('click', e => { if (!lista.contains(e.target) && e.target !== input) cerrar(); });
  }

  // ── Excel de la clasificación ─────────────────────────────────────────
  function descargarExcel() {
    const bin = atob(D.excel.datos), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    PDF.descargar(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), D.excel.nombre);
  }

  // ── Semanas del mes ───────────────────────────────────────────────────
  // Semana 1 = días 1–7, 2 = 8–14, 3 = 15–21, 4 = del 22 al fin de mes
  // (igual que Programas/prioridad_ice.py)
  const semanaDe = dia => Math.min(4, Math.floor((dia - 1) / 7) + 1);
  let mapaS = null;

  function semanas() {
    const panel = $('p-semanas');
    if (mapaS) { setTimeout(() => mapaS.invalidateSize(), 50); return; }
    const hoy = new Date(), sHoy = semanaDe(hoy.getDate()), sSig = sHoy === 4 ? 1 : sHoy + 1;
    const mesSig = MESES[(hoy.getMonth() + (sHoy === 4 ? 1 : 0)) % 12];
    const prior = D.clientes.filter(c => (c[4] === 1 || c[4] === 2) && c[14]);
    const cuenta = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const c of prior) cuenta[c[14]]++;
    const etiqueta = s => `Semana ${s}${s === sHoy ? ' · esta' : s === sSig ? ' · próxima' : ''} (${num(cuenta[s])})`;
    panel.innerHTML = `
      <div class="mapa-barra">
        <p class="mapa-resumen">Clientes <b>prioridad 1 y 2</b> según la semana del mes en que más veces los ha evaluado el auditor (todo su histórico ICE; si hay empate, la de su visita más reciente): <b>semana 1</b> = días 1–7, <b>2</b> = 8–14, <b>3</b> = 15–21 y <b>4</b> = del 22 al fin de mes. Hoy, ${hoy.getDate()} de ${MESES[hoy.getMonth()]}, es la <b>semana ${sHoy}</b>; la próxima es la <b>semana ${sSig}</b>${sHoy === 4 ? ` de ${esc(mesSig)}` : ''}.</p>
        <div class="mapa-controles">
          <div class="chips" role="group" aria-label="Semana del mes" id="botonesSemana">
            <button type="button" class="chip grande" data-s="${sHoy},${sSig}" aria-pressed="true">Esta semana y la próxima (${num(cuenta[sHoy] + cuenta[sSig])})</button>
            ${[1, 2, 3, 4].map(s => `<button type="button" class="chip grande" data-s="${s}" aria-pressed="false">${etiqueta(s)}</button>`).join('')}
            <button type="button" class="chip grande" data-s="1,2,3,4" aria-pressed="false">Todas (${num(prior.length)})</button>
          </div>
          <div class="chips">
            ${[1, 2].map(p => `<button type="button" class="chip on" aria-pressed="true" data-p="${p}"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre}</button>`).join('')}
            <button type="button" class="chip" aria-pressed="false" id="semPendientes">Solo sin ICE en ${esc(D.mes)}</button>
            <button type="button" class="chip grande" aria-pressed="false" id="semFalto"><span class="icono-metrica" aria-hidden="true">${svgIcono('lista')}</span>Lo que les faltó en su última evaluación</button>
          </div>
        </div>
        <div class="leyenda-metricas" id="leyendaFaltoS" hidden></div>
        <p class="mapa-ayuda">El número de cada punto es su semana. Relleno: aún sin ICE en ${esc(D.mes)}; solo borde: ya evaluado este mes. ${TACTIL ? 'Toca' : 'Haz clic en'} un cliente para ver su ficha; abajo del mapa está la lista.</p>
      </div>
      <div id="mapaSemanas" class="mapa"></div>
      <section class="ruta-detalle" id="semanaLista"></section>`;

    mapaS = L.map('mapaSemanas');
    capaBase(mapaS);
    botonUbicacion(mapaS);
    const capa = L.layerGroup().addTo(mapaS);
    // falto: solo los que se ven y aún no tienen ICE en el mes, con lo que les faltó en su última evaluación
    const estado = { semanas: [sHoy, sSig], prios: new Set([1, 2]), pendientes: false, falto: false };
    const visibles = () => prior.filter(c => estado.semanas.includes(c[14]) && estado.prios.has(c[4]) &&
                                             (!(estado.pendientes || estado.falto) || !porSapEval[c[0]]));
    const pintar = encuadrar => {
      capa.clearLayers();
      const lista = visibles(), limites = [];
      // Prioridad 2 abajo y prioridad 1 encima
      for (const c of [...lista].sort((a, b) => b[4] - a[4])) {
        if (c[2] == null) continue;
        const hecho = !!porSapEval[c[0]], ult = estado.falto && c[17];
        const html = ult ? `<span class="falta-marca p${c[4]}">${svgIcono(idPeor(ult))}<i>${num(c[14])}</i></span>`
          : `<span class="sem-marca p${c[4]}${hecho ? ' hecho' : ''}">${num(c[14])}</span>`;
        const tam = ult ? 26 : 24;
        const m = L.marker([c[2], c[3]], { keyboard: false, zIndexOffset: c[4] === 1 ? 200 : 0, riseOnHover: true,
          icon: L.divIcon({ className: 'ev-icono', html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2] }) })
          .bindPopup(() => popupCliente(c), { maxWidth: 320 });
        if (!TACTIL) m.bindTooltip(`<b>${esc(c[1])}</b> · semana ${num(c[14])}${hecho ? ` · ICE ${esc(D.mes)}: ${dec1(porSapEval[c[0]][0][6])}` : ''}${ult ? ` · le faltó: ${esc(nombrePeor(ult))}` : ''}`,
                                   { direction: 'top', offset: [0, -10], opacity: 0.95 });
        m.addTo(capa);
        limites.push([c[2], c[3]]);
      }
      if (encuadrar) {
        if (limites.length) mapaS.fitBounds(limitesRobustos(limites).pad(0.06), { maxZoom: 15 });
        else if (!mapaS._loaded) mapaS.setView([19.38, -99.14], 11);
      }
      if (estado.falto) {
        const con = lista.filter(c => c[17]);
        $('leyendaFaltoS').innerHTML = `<p class="leyenda-texto">Solo los clientes de las semanas y prioridades elegidas que aún no tienen ICE en ${esc(D.mes)} (<b>${num(lista.length)}</b>). Símbolo = submétrica que más puntos le quitó en su última evaluación ICE (es en la que conviene trabajar); el número chico es su semana:</p>${leyendaSimbolos(contar(con, c => idPeor(c[17])))}`;
      }
      listaSemana(lista);
    };
    pintar(true);
    panel.querySelectorAll('#botonesSemana [data-s]').forEach(b => b.addEventListener('click', () => {
      panel.querySelectorAll('#botonesSemana [data-s]').forEach(x => x.setAttribute('aria-pressed', x === b));
      estado.semanas = b.dataset.s.split(',').map(Number);
      pintar(true);
    }));
    panel.querySelectorAll('.chip[data-p]').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      b.classList.toggle('on', on);
      if (on) estado.prios.add(+b.dataset.p); else estado.prios.delete(+b.dataset.p);
      pintar(false);
    }));
    $('semPendientes').addEventListener('click', e => {
      estado.pendientes = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', estado.pendientes);
      e.currentTarget.classList.toggle('on', estado.pendientes);
      pintar(false);
    });
    // "Lo que les faltó" ya deja solo a los que no tienen ICE: el otro filtro queda fijo mientras tanto
    $('semFalto').addEventListener('click', e => {
      estado.falto = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', estado.falto);
      const pend = $('semPendientes');
      pend.disabled = estado.falto;
      pend.setAttribute('aria-pressed', estado.falto || estado.pendientes);
      pend.classList.toggle('on', estado.falto || estado.pendientes);
      $('leyendaFaltoS').hidden = !estado.falto;
      pintar(false);
      setTimeout(() => mapaS.invalidateSize(), 50);
    });
  }

  function listaSemana(lista) {
    const orden = [...lista].sort((a, b) => a[14] - b[14] || a[4] - b[4] || D.zonas[a[5]].localeCompare(D.zonas[b[5]]) || a[6].localeCompare(b[6]));
    const hechos = orden.filter(c => porSapEval[c[0]]).length;
    $('semanaLista').innerHTML = `<div class="ruta-detalle-cab"><div>
        <h3>${plural(orden.length, 'cliente')}</h3>
        <p>${num(hechos)} ya con ICE en ${esc(D.mes)} · ${num(orden.length - hechos)} sin ICE todavía · orden: semana, prioridad, zona y ruta</p></div></div>
      <div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th class="izq">Semana</th><th class="izq">Tipo</th><th class="izq">SAP</th><th class="izq">Cliente</th><th class="izq">Dirección</th>
          <th class="izq">Zona</th><th class="izq">Ruta</th><th class="izq">Frecuencia</th><th>Visitas en su semana</th><th>Último ICE</th><th>ICE ${esc(D.mes)}</th><th class="izq">Le faltó (última evaluación)</th><th class="izq">ÉPICA del mes</th></tr></thead>
        <tbody>${orden.length ? orden.map(c => {
          const ev = porSapEval[c[0]], u = c[17];
          return `<tr><td class="izq"><b>${num(c[14])}</b></td><td class="izq"><span class="prio ${PRIO[c[4]].clase}">${PRIO[c[4]].corto}</span></td>
            <td class="izq">${esc(c[0])}</td><td class="izq">${esc(c[1])}</td><td class="izq">${esc(c[13])}</td><td class="izq">${esc(D.zonas[c[5]])}</td>
            <td class="izq">${esc(c[6])}</td><td class="izq">${esc(c[7])}</td><td>${num(c[15])} de ${num(c[16])}</td>
            <td>${c[10] ? `${dec1(c[11])} <span class="muted">(${esc(fechaCorta(c[10]))})</span>` : '<span class="muted">—</span>'}</td>
            <td>${ev ? `<b>${dec1(ev[0][6])}</b>` : '<span class="muted">—</span>'}</td>
            <td class="izq">${u ? `<span class="metrica-nombre"><span class="icono-metrica">${svgIcono(idPeor(u))}</span>${esc(nombrePeor(u))}</span>` : '<span class="muted">—</span>'}</td>
            <td class="izq">${textoEpica(c[0])}</td></tr>`;
        }).join('') : '<tr><td class="izq muted" colspan="13">No hay clientes con estos filtros.</td></tr>'}</tbody>
      </table></div>`;
  }

  // ── Rutas ─────────────────────────────────────────────────────────────
  let capaRutas = null, grupos = [], diaSel = 'hoy', rutaSel = null;

  // Un color por ruta (ángulo dorado), sin rojos: el rojo es prioridad 1
  function colorRuta(i) {
    const h = 25 + (i * 137.508) % 310, s = 0.55, l = 0.42;
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
  }

  const cuentaTipos = puntos => puntos.reduce((a, p) => { a[p[4]] = (a[p[4]] || 0) + 1; return a; }, {});

  function rutas() {
    const panel = $('p-rutas');
    if (mapaR) { setTimeout(() => mapaR.invalidateSize(), 50); return; }
    const H = D.rutas.hoy, M = D.rutas.manana;
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <div class="rutas-acciones">
            <button type="button" class="ice-btn rojo" data-pdf="hoy">${svgIcono('imprimir')}Impresión Hoy Rutas</button>
            <button type="button" class="ice-btn" data-pdf="manana">${svgIcono('imprimir')}Impresión Mañana Rutas</button>
            <button type="button" class="ice-btn" data-pdf="epica">${svgIcono('imprimir')}Clientes ICE pendientes de EPICA</button>
          </div>
          <label class="ice-check"><input type="checkbox" id="pdfTodos"> Incluir a los clientes no ICE en las rutas impresas</label>
        </div>
        <p class="mapa-ayuda">Las impresiones de rutas de hoy y de mañana no traen a los clientes que ya tienen ICE en ${esc(D.mes)}, dicen qué submétrica le quitó más puntos a cada cliente en su última evaluación y van por jefatura: cada jefatura empieza en hoja nueva.</p>
        <div class="mapa-controles">
          <div class="segmento" role="group" aria-label="Día de las rutas">
            <button type="button" data-dia="hoy" aria-pressed="true">Hoy · ${esc(H.dia)} ${esc(fechaCorta(H.fecha))}</button>
            <button type="button" data-dia="manana" aria-pressed="false">Mañana · ${esc(M.dia)} ${esc(fechaCorta(M.fecha))}</button>
          </div>
          <div class="chips" aria-label="Simbología">
            ${[1, 2, 3].map(p => `<span class="chip" style="cursor:default"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre}</span>`).join('')}
            <span class="chip" style="cursor:default"><span class="punto-prio p0" aria-hidden="true"></span>No ICE (color de la ruta)</span>
          </div>
        </div>
        <p class="mapa-resumen" id="rutasResumen" role="status"></p>
        <p class="mapa-ayuda" id="pdfEstado" role="status" aria-live="polite"></p>
      </div>
      <div class="rutas-cuerpo">
        <div id="mapaRutas" class="mapa"></div>
        <aside class="rutas-lista" aria-label="Rutas del día">
          <input type="search" id="buscaRuta" placeholder="Buscar ruta o jefatura" aria-label="Buscar ruta o jefatura">
          <label class="ice-check"><input type="checkbox" id="soloIce"> Solo rutas con clientes ICE</label>
          <ul id="listaRutas"></ul>
        </aside>
      </div>
      <section class="ruta-detalle" id="rutaDetalle"></section>`;
    mapaR = L.map('mapaRutas', { preferCanvas: true });
    capaBase(mapaR);
    botonUbicacion(mapaR);
    capaRutas = L.layerGroup().addTo(mapaR);
    pintarDia('hoy');

    panel.querySelectorAll('.segmento button').forEach(b => b.addEventListener('click', () => {
      panel.querySelectorAll('.segmento button').forEach(x => x.setAttribute('aria-pressed', x === b));
      pintarDia(b.dataset.dia);
    }));
    $('buscaRuta').addEventListener('input', filtrarLista);
    $('soloIce').addEventListener('change', filtrarLista);
    panel.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => imprimir(b)));
  }

  function filtrarLista() {
    const q = normalizar($('buscaRuta').value), solo = $('soloIce').checked;
    const R = D.rutas[diaSel].rutas;
    document.querySelectorAll('#listaRutas li').forEach((li, i) => {
      const r = R[i];
      li.hidden = (!!q && !normalizar(`${r.codigo} ${r.jefatura}`).includes(q)) || (solo && !r.puntos.some(p => p[4]));
    });
  }

  function pintarDia(dia) {
    diaSel = dia; rutaSel = null;
    const R = D.rutas[dia];
    capaRutas.clearLayers();
    grupos = [];
    const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
    const limites = [], marcadores = [], ice = [];
    const total = R.rutas.reduce((a, r) => a + r.puntos.length, 0);
    const tipos = cuentaTipos(R.rutas.flatMap(r => r.puntos));
    R.rutas.forEach((r, i) => {
      const color = colorRuta(i), coords = r.puntos.filter(p => p[0] != null).map(p => [p[0], p[1]]);
      const g = { r, color, limites: coords.length ? L.latLngBounds(coords) : null, linea: null };
      if (coords.length > 1) {
        g.linea = L.polyline(coords, { renderer: rend, color, weight: 2, opacity: 0.6 }).bindTooltip(`Ruta ${esc(r.codigo)} · ${plural(r.puntos.length, 'cliente')}`, { sticky: true });
        g.linea.addTo(capaRutas);
      }
      for (const p of r.puntos) {
        if (p[0] == null) continue;
        limites.push([p[0], p[1]]);
        if (p[4]) { ice.push({ p, r }); continue; }
        const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: 3.5, color: BLANCO, weight: 1, fillColor: color, fillOpacity: 1 })
          .bindPopup(() => popupRuta(p, r), { maxWidth: 320 });
        etiqueta(m, p[3], p[2]);
        m.addTo(capaRutas);
        marcadores.push(m);
      }
      grupos.push(g);
    });
    // Los clientes ICE van encima de todo: aleatorios, prioridad 2 y prioridad 1
    ice.sort((a, b) => b.p[4] - a.p[4]).forEach(({ p, r }) => {
      const s = PRIO[p[4]];
      const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: s.radio, color: s.borde, weight: s.grosor, fillColor: s.relleno, fillOpacity: 1 })
        .bindPopup(() => popupRuta(p, r), { maxWidth: 320 });
      etiqueta(m, p[3], p[2]);
      m.addTo(capaRutas);
      marcadores.push(m);
    });
    if (limites.length) mapaR.fitBounds(limitesRobustos(limites).pad(0.04));
    else mapaR.setView([19.38, -99.14], 11);
    mapaR.off('click');
    toqueCercano(mapaR, marcadores);

    $('rutasResumen').innerHTML = `Rutas que visitan el <b>${esc(R.dia.toLowerCase())} ${esc(fechaLarga(R.fecha))}</b> (frecuencia ZPV <b>${esc(R.letra)}</b>): <b>${num(R.rutas.length)}</b> rutas · <b>${num(total)}</b> clientes · ICE: <b>${num(tipos[1] || 0)}</b> prioridad 1, <b>${num(tipos[2] || 0)}</b> prioridad 2 y <b>${num(tipos[3] || 0)}</b> aleatorios. Las líneas unen a los clientes de cada ruta.`;
    $('listaRutas').innerHTML = R.rutas.map((r, i) => {
      const t = cuentaTipos(r.puntos);
      return `<li><button type="button" class="ruta-item" data-i="${i}">
        <span class="ruta-sw" style="background:${grupos[i].color}" aria-hidden="true"></span>
        <span class="ruta-cod">${esc(r.codigo)}</span>
        <span class="ruta-conteo">${[1, 2, 3].map(p => t[p] ? `<span class="prio p${p}" title="${PRIO[p].nombre}">${PRIO[p].corto} ${t[p]}</span>` : '').join('')}</span>
        <span class="ruta-info">${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.puntos.length, 'cliente')}</span></button></li>`;
    }).join('');
    document.querySelectorAll('#listaRutas .ruta-item').forEach(b => b.addEventListener('click', () => elegirRuta(+b.dataset.i)));
    filtrarLista();
    $('rutaDetalle').innerHTML = `<p class="muted">Elige una ruta de la lista para ver sus clientes de ${dia === 'hoy' ? 'hoy' : 'mañana'}.</p>`;
  }

  function popupRuta(p, r) {
    const [lat, lon, sap, nombre, tipo] = p;
    const c = porSapCliente[sap];
    if (c) return popupCliente(c).replace('<span class="pc-sap">', `<span>Ruta ${esc(r.codigo)}</span><span class="pc-sap">`);
    return `<div class="pc"><div class="pc-cab p3"><b>${esc(nombre || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
      <span>Ruta ${esc(r.codigo)} · ${PRIO[tipo].nombre}</span></div>${enlacesMapa(lat, lon)}
      <dl class="pc-cuerpo">${fila('Jefatura', esc(r.jefatura))}</dl></div>`;
  }

  function elegirRuta(i) {
    rutaSel = i;
    document.querySelectorAll('#listaRutas .ruta-item').forEach(b => b.setAttribute('aria-current', +b.dataset.i === i ? 'true' : 'false'));
    const g = grupos[i];
    if (g.limites) mapaR.fitBounds(g.limites.pad(0.15));
    if (g.linea) {
      g.linea.setStyle({ weight: 6, opacity: 0.9 });
      setTimeout(() => g.linea && g.linea.setStyle({ weight: 2, opacity: 0.6 }), 1800);
    }
    detalleRuta(g.r);
  }

  function filaClienteRuta(p, k) {
    const [, , sap, nombre, tipo] = p;
    const c = porSapCliente[sap];
    const ev = porSapEval[sap];
    const ultimo = c && c[10] ? `${dec1(c[11])} <span class="muted">(${esc(fechaCorta(c[10]))})</span>` : '<span class="muted">—</span>';
    return `<tr><td class="izq">${k}</td><td class="izq"><span class="prio ${PRIO[tipo].clase}">${PRIO[tipo].corto}</span></td>
      <td class="izq">${esc(sap)}</td><td class="izq">${esc(nombre)}</td><td class="izq">${c ? esc(c[13]) : ''}</td>
      <td>${tipo ? ultimo : ''}</td><td>${ev ? dec1(ev[0][6]) : tipo ? '<span class="muted">—</span>' : ''}</td>
      <td class="izq">${tipo ? textoEpica(sap) : ''}</td></tr>`;
  }

  function detalleRuta(r) {
    const ice = r.puntos.filter(p => p[4]).sort((a, b) => a[4] - b[4]);
    const otros = r.puntos.filter(p => !p[4]);
    const t = cuentaTipos(r.puntos);
    const cont = $('rutaDetalle');
    cont.innerHTML = `<div class="ruta-detalle-cab"><div>
        <h3>Ruta ${esc(r.codigo)}</h3>
        <p>${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.puntos.length, 'cliente')} ${diaSel === 'hoy' ? 'hoy' : 'mañana'} · ICE: ${num(t[1] || 0)} P1, ${num(t[2] || 0)} P2, ${num(t[3] || 0)} aleatorios</p></div>
        ${otros.length ? `<button type="button" class="ice-btn sec" id="verOtros" aria-expanded="false">Ver los ${num(otros.length)} clientes no ICE</button>` : ''}</div>
      <div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th class="izq">#</th><th class="izq">Tipo</th><th class="izq">SAP</th><th class="izq">Cliente</th><th class="izq">Dirección</th><th>Último ICE</th><th>ICE ${esc(D.mes)}</th><th class="izq">ÉPICA del mes</th></tr></thead>
        <tbody id="filasRuta">${ice.length ? ice.map((p, k) => filaClienteRuta(p, k + 1)).join('') : '<tr><td class="izq muted" colspan="8">Esta ruta no tiene clientes ICE.</td></tr>'}</tbody>
      </table></div>`;
    const btn = $('verOtros');
    if (btn) btn.addEventListener('click', () => {
      const abierto = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !abierto);
      btn.textContent = abierto ? `Ver los ${num(otros.length)} clientes no ICE` : 'Ocultar clientes no ICE';
      $('filasRuta').innerHTML = (ice.length ? ice.map((p, k) => filaClienteRuta(p, k + 1)).join('') : '') +
        (abierto ? '' : otros.map((p, k) => filaClienteRuta(p, ice.length + k + 1)).join(''));
    });
  }

  // ── Impresiones (PDF) ─────────────────────────────────────────────────
  const PDF_M = 32;

  // ctx.jefPaginas: jefatura de cada hoja (para el pie) cuando el PDF va por jefatura
  function documento(titulo, subtitulo, resumenTexto) {
    const doc = new PDF.Documento({ titulo: `${titulo} · ${D.unidad}` });
    doc.pagina();
    doc.rect(0, 0, doc.W, 8, { relleno: ROJO });
    doc.texto(PDF_M, 32, `REPORTE ICE · UNIDAD ${D.unidad.toUpperCase()}`, { tam: 7.5, negrita: true, color: GRIS_OSC });
    doc.texto(PDF_M, 54, titulo, { tam: 18, negrita: true, color: ROJO });
    doc.texto(PDF_M, 70, subtitulo, { tam: 9, color: NEGRO });
    let y = 86;
    for (const linea of PDF.renglones(resumenTexto, doc.W - 2 * PDF_M, 8.5)) {
      doc.texto(PDF_M, y, linea, { tam: 8.5, color: GRIS_OSC });
      y += 11.5;
    }
    const ctx = { doc, y: y + 6, titulo, jefatura: null, jefPaginas: [] };
    doc.pie((n, total) => {
      const jef = ctx.jefPaginas[n - 1];
      let hoja = '';
      if (jef != null) {
        const suyas = ctx.jefPaginas.filter(j => j === jef).length;
        const k = ctx.jefPaginas.slice(0, n).filter(j => j === jef).length;
        hoja = ` · ${nombreJefatura(jef).toUpperCase()} (HOJA ${k} DE ${suyas})`;
      }
      doc.linea(PDF_M, doc.H - 30, doc.W - PDF_M, doc.H - 30, { color: GRIS, grosor: 0.5 });
      doc.texto(PDF_M, doc.H - 19, `BRIGADAS VDM · ${titulo.toUpperCase()} · UNIDAD ${D.unidad.toUpperCase()}${hoja}`, { tam: 6.5, color: GRIS_OSC, max: doc.W - 2 * PDF_M - 90 });
      doc.texto(doc.W - PDF_M, doc.H - 19, `Página ${n} de ${total}`, { tam: 6.5, color: GRIS_OSC, alinear: 'der' });
    });
    return ctx;
  }

  const SIN_JEFATURA = 'Sin jefatura';     // igual que SIN_ZONA de Programas/publica_ice.py
  const nombreJefatura = j => j === SIN_JEFATURA ? j : `Jefatura ${j}`;

  function continuar(ctx) {
    const { doc } = ctx;
    doc.pagina();
    doc.rect(0, 0, doc.W, 6, { relleno: ROJO });
    doc.texto(PDF_M, 26, `${ctx.titulo} · Unidad ${D.unidad}${ctx.jefatura != null ? ` · ${nombreJefatura(ctx.jefatura)}` : ''} (continuación)`, { tam: 8.5, negrita: true, color: NEGRO });
    if (ctx.jefatura != null) ctx.jefPaginas[doc.paginas.length - 1] = ctx.jefatura;
    ctx.y = 42;
  }

  // Cada jefatura empieza en hoja nueva (la primera, debajo del encabezado del documento)
  function seccionJefatura(ctx, jef, detalle, primera) {
    const { doc } = ctx;
    ctx.jefatura = jef;
    if (!primera) {
      doc.pagina();
      doc.rect(0, 0, doc.W, 6, { relleno: ROJO });
      doc.texto(PDF_M, 26, `${ctx.titulo} · Unidad ${D.unidad}`, { tam: 8.5, negrita: true, color: NEGRO });
      ctx.y = 42;
    }
    ctx.jefPaginas[doc.paginas.length - 1] = jef;
    doc.rect(PDF_M, ctx.y, doc.W - 2 * PDF_M, 24, { relleno: ROJO });
    const w = doc.texto(PDF_M + 8, ctx.y + 16.5, nombreJefatura(jef).toUpperCase(), { tam: 12, negrita: true, color: BLANCO });
    doc.texto(PDF_M + 20 + w, ctx.y + 16, detalle, { tam: 8.5, color: BLANCO, max: doc.W - 2 * PDF_M - w - 28 });
    ctx.y += 32;
  }

  // Banda negra con el nombre de la ruta
  function bandaRuta(ctx, texto, detalle) {
    const { doc } = ctx;
    doc.rect(PDF_M, ctx.y, doc.W - 2 * PDF_M, 18, { relleno: NEGRO });
    const w = doc.texto(PDF_M + 8, ctx.y + 12.5, texto, { tam: 9.5, negrita: true, color: BLANCO });
    doc.texto(PDF_M + 16 + w, ctx.y + 12.5, detalle, { tam: 8, color: '#E6E6E6', max: doc.W - 2 * PDF_M - w - 24 });
    ctx.y += 18;
  }

  function insigniaPdf(doc, x, y, tipo) {
    const s = PRIO[tipo];
    if (tipo) doc.circulo(x + 4, y - 3, 3.6, { relleno: s.relleno, borde: tipo === 3 ? GRIS_OSC : s.relleno, grosor: 1.2 });
    doc.texto(x + 11, y, s.corto, { tam: 7.5, negrita: true, color: NEGRO });
  }

  // Tabla con cortes de página: repite la banda de la ruta y los encabezados
  function tablaPdf(ctx, columnas, filas, banda) {
    const { doc } = ctx, limite = doc.H - 42, alto = 13;
    const cabecera = () => {
      let x = PDF_M;
      for (const c of columnas) {
        doc.texto(c.alinear === 'der' ? x + c.ancho - 4 : x + 4, ctx.y + 10, c.titulo.toUpperCase(), { tam: 6.3, negrita: true, color: GRIS_OSC, alinear: c.alinear === 'der' ? 'der' : 'izq', max: c.ancho - 6 });
        x += c.ancho;
      }
      doc.linea(PDF_M, ctx.y + 14, doc.W - PDF_M, ctx.y + 14, { color: NEGRO, grosor: 0.8 });
      ctx.y += 15;
    };
    if (ctx.y + 18 + 15 + alto * Math.min(2, filas.length) > limite) continuar(ctx);
    banda(false);
    cabecera();
    filas.forEach((f, k) => {
      if (ctx.y + alto > limite) { continuar(ctx); banda(true); cabecera(); }
      if (k % 2) doc.rect(PDF_M, ctx.y, doc.W - 2 * PDF_M, alto, { relleno: '#F4F4F4' });
      let x = PDF_M;
      columnas.forEach((c, j) => {
        const v = f[j];
        if (v && v.tipo != null) insigniaPdf(doc, x + 4, ctx.y + 9.3, v.tipo);
        else {
          const t = v && typeof v === 'object' ? v : { texto: v };
          doc.texto(c.alinear === 'der' ? x + c.ancho - 4 : x + 4, ctx.y + 9.3, t.texto == null ? '' : String(t.texto),
                    { tam: 7.6, negrita: !!t.negrita, color: t.color || NEGRO, alinear: c.alinear === 'der' ? 'der' : 'izq', max: c.ancho - 7 });
        }
        x += c.ancho;
      });
      ctx.y += alto;
    });
    doc.linea(PDF_M, ctx.y, doc.W - PDF_M, ctx.y, { color: GRIS, grosor: 0.5 });
    ctx.y += 12;
  }

  function epicaPdf(sap) {
    const e = D.epica[sap];
    if (!e) return { texto: 'Pendiente', negrita: true, color: ROJO };
    return { texto: `${dec1(e[1])} · ${ddmm(e[0])}${e[2] ? ' · NoGeo' : ''}${e[3] ? ' · FdF' : ''}`, negrita: !!(e[2] || e[3]), color: e[2] || e[3] ? ROJO : NEGRO };
  }

  // Rutas de preventa del día: sin los clientes que ya tienen ICE en el mes y una jefatura por hoja
  function pdfRutas(dia) {
    const R = D.rutas[dia], todos = $('pdfTodos').checked;
    const evaluado = p => !!porSapEval[p[2]];
    const quitados = R.rutas.reduce((a, r) => a + r.puntos.filter(evaluado).length, 0);
    const rutasPdf = R.rutas.map(r => ({ r, puntos: r.puntos.filter(p => !evaluado(p)) }))
      .filter(x => todos ? x.puntos.length : x.puntos.some(p => p[4]));
    const tipos = cuentaTipos(rutasPdf.flatMap(x => x.puntos));
    const porJefatura = {};
    for (const x of rutasPdf) (porJefatura[x.r.jefatura || SIN_JEFATURA] = porJefatura[x.r.jefatura || SIN_JEFATURA] || []).push(x);
    const jefaturas = Object.keys(porJefatura).sort((a, b) => (a === SIN_JEFATURA) - (b === SIN_JEFATURA) || a.localeCompare(b, 'es', { numeric: true }));
    const ctx = documento(`Rutas de ${dia === 'hoy' ? 'hoy' : 'mañana'}`, `${R.dia} ${fechaLarga(R.fecha)} · frecuencia ZPV ${R.letra}`,
      `${plural(rutasPdf.length, 'ruta')} ${todos ? '' : 'con clientes ICE por evaluar '}en ${plural(jefaturas.length, 'jefatura')} (cada jefatura empieza en hoja nueva) · ICE por evaluar: ${num(tipos[1] || 0)} prioridad 1 (P1), ${num(tipos[2] || 0)} prioridad 2 (P2) y ${num(tipos[3] || 0)} aleatorios (A)` +
      `${todos ? ` · se incluyen los ${num(tipos[0] || 0)} clientes no ICE` : ''}.${quitados ? ` No se imprimen ${plural(quitados, 'cliente que ya tiene', 'clientes que ya tienen')} ICE en ${D.mes}.` : ''} Orden: P1, P2, A${todos ? ' y después el resto en el orden de la ruta' : ''}. ` +
      `Más le quitó: la submétrica que más puntos le quitó en su última evaluación ICE (en la que conviene trabajar). ÉPICA del mes: calificación y fecha, o Pendiente.`);
    const columnas = [{ titulo: '#', ancho: 18 }, { titulo: 'Tipo', ancho: 28 }, { titulo: 'SAP', ancho: 52 }, { titulo: 'Cliente', ancho: 128 },
                      { titulo: 'Dirección', ancho: 122 }, { titulo: 'Últ. ICE', ancho: 36, alinear: 'der' }, { titulo: 'Más le quitó', ancho: 78 },
                      { titulo: 'ÉPICA del mes', ancho: 86 }];
    if (!rutasPdf.length) ctx.doc.texto(PDF_M, ctx.y + 10, `No hay rutas con clientes ICE por evaluar este día.`, { tam: 10, negrita: true });
    jefaturas.forEach((jef, g) => {
      const grupo = porJefatura[jef], tj = cuentaTipos(grupo.flatMap(x => x.puntos));
      seccionJefatura(ctx, jef, `${plural(grupo.length, 'ruta')} · ICE por evaluar: P1 ${tj[1] || 0} · P2 ${tj[2] || 0} · A ${tj[3] || 0}`, g === 0);
      for (const { r, puntos: pendientes } of grupo) {
        const t = cuentaTipos(pendientes), fuera = r.puntos.length - pendientes.length;
        const ice = pendientes.filter(p => p[4]).sort((a, b) => a[4] - b[4]);
        const puntos = todos ? ice.concat(pendientes.filter(p => !p[4])) : ice;
        const filas = puntos.map((p, k) => {
          const c = porSapCliente[p[2]], u = c && c[17];
          return [k + 1, { tipo: p[4] }, p[2], p[3], c ? c[13] : '', p[4] && c && c[11] != null ? dec1(c[11]) : '',
                  u ? { texto: cortoPeor(u), negrita: u[4] != null } : '', p[4] ? epicaPdf(p[2]) : ''];
        });
        tablaPdf(ctx, columnas, filas, cont => bandaRuta(ctx, `RUTA ${r.codigo}${cont ? ' (cont.)' : ''}`,
          `${plural(r.puntos.length, 'cliente')} en la ruta · por evaluar P1 ${t[1] || 0} · P2 ${t[2] || 0} · A ${t[3] || 0}${fuera ? ` · ${num(fuera)} ya con ICE en ${D.mes}` : ''}`));
      }
    });
    PDF.descargar(ctx.doc.blob(), `ICE_Rutas_${dia === 'hoy' ? 'Hoy' : 'Manana'}_${D.unidad}_${R.fecha}.pdf`);
  }

  function pdfPendientes() {
    const R = D.rutas.hoy;
    const conIce = R.rutas.filter(r => r.puntos.some(p => p[4]));
    const ice = conIce.flatMap(r => r.puntos.filter(p => p[4]));
    const hechas = ice.filter(p => D.epica[p[2]]);
    const nogeo = hechas.filter(p => D.epica[p[2]][2]).length, fdf = hechas.filter(p => D.epica[p[2]][3]).length;
    const ctx = documento('Clientes ICE pendientes de EPICA', `Rutas de hoy · ${R.dia} ${fechaLarga(R.fecha)} · ÉPICA de ${D.mes}${D.epica_corte ? ` al ${fechaLarga(D.epica_corte)}` : ''}`,
      `En las rutas de hoy hay ${plural(ice.length, 'cliente ICE', 'clientes ICE')}: ${num(ice.length - hechas.length)} pendientes de EPICA y ${num(hechas.length)} con EPICA en ${D.mes} ` +
      `(${num(nogeo)} con NoGeo y ${num(fdf)} con foto de foto). En cada ruta van primero los pendientes. P1 = prioridad 1, P2 = prioridad 2, A = aleatorio; ` +
      `NoGeo = cierre a más de ${D.no_geo_metros} m del cliente; FdF = foto de foto.`);
    const columnas = [{ titulo: 'Estado', ancho: 62 }, { titulo: 'Tipo', ancho: 30 }, { titulo: 'SAP', ancho: 56 }, { titulo: 'Cliente', ancho: 136 },
                      { titulo: 'Dirección', ancho: 122 }, { titulo: 'Calif.', ancho: 36, alinear: 'der' }, { titulo: 'NoGeo', ancho: 36 },
                      { titulo: 'FdF', ancho: 30 }, { titulo: 'Fecha', ancho: 40 }];
    if (!conIce.length) ctx.doc.texto(PDF_M, ctx.y + 10, 'Hoy no hay clientes ICE en las rutas.', { tam: 10, negrita: true });
    for (const r of conIce) {
      const lista = r.puntos.filter(p => p[4]).sort((a, b) => (!!D.epica[a[2]] - !!D.epica[b[2]]) || a[4] - b[4]);
      const pend = lista.filter(p => !D.epica[p[2]]).length;
      const filas = lista.map(p => {
        const e = D.epica[p[2]], c = porSapCliente[p[2]];
        return [e ? { texto: 'Hecha', negrita: true } : { texto: 'PENDIENTE', negrita: true, color: ROJO }, { tipo: p[4] }, p[2], p[3], c ? c[13] : '',
                e ? dec1(e[1]) : '', e ? (e[2] ? { texto: 'SÍ', negrita: true, color: ROJO } : 'no') : '',
                e ? (e[3] ? { texto: 'SÍ', negrita: true, color: ROJO } : 'no') : '', e ? ddmm(e[0]) : ''];
      });
      tablaPdf(ctx, columnas, filas, cont => bandaRuta(ctx, `RUTA ${r.codigo}${cont ? ' (cont.)' : ''}`,
        `${r.jefatura || 'Sin jefatura'} · ${plural(lista.length, 'cliente ICE', 'clientes ICE')} · ${num(pend)} pendientes de EPICA`));
    }
    PDF.descargar(ctx.doc.blob(), `ICE_Pendientes_EPICA_${D.unidad}_${R.fecha}.pdf`);
  }

  function imprimir(boton) {
    const estado = $('pdfEstado');
    boton.disabled = true;
    estado.textContent = 'Generando el PDF...';
    // Deja que el navegador pinte el aviso antes de armar el documento
    setTimeout(() => {
      try {
        if (boton.dataset.pdf === 'epica') pdfPendientes(); else pdfRutas(boton.dataset.pdf);
        estado.textContent = 'PDF listo: revisa tus descargas.';
      } catch (e) {
        console.error(e);
        estado.textContent = 'No se pudo generar el PDF.';
      } finally {
        boton.disabled = false;
      }
    }, 30);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  return {};
})();
