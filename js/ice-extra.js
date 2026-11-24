/* Reporte ICE: información del sistema, pestaña Cinética y hojas descargables
 * "Mis clientes ICE" y "Buscador de clientes".
 *
 * Información del sistema: cuándo se actualizó la página y hasta qué fecha llegan
 * los datos ICE (la usan la unidad y el administrador).
 *
 * Cinética: botones con los evaluadores que pasaron por la unidad; al elegir uno
 * se ven los clientes que visitó, con flechas para recorrer sus días o todas las
 * zonas del mes a la vez. El reporte ICE solo trae la fecha de la encuesta (no la
 * hora): el orden del recorrido se estima por cercanía.
 *
 * Hoja "Mis clientes ICE": un archivo HTML suelto (sin contraseña: quien lo
 * tiene lo ve). Pantalla de inicio: jefatura y ruta de preventa (o Farmer y su
 * clave) y botón Entrar; luego tres pestañas en lista compacta (bolita del tipo,
 * SAP, nombre, último ICE y lo que le faltó): prioridad 1, 2 y 3 de hoy o de
 * mañana, no prioritarios, y «Mis clientes ya evaluados este mes» (de cualquier
 * día, con su ICE del mes en mapa de calor: verde 85+, naranja 70–84.9, rojo
 * menos de 70). Al tocar un cliente se abre su ficha: mapa, cómo llegar, datos y
 * desglose de su última evaluación con la submétrica que más le quitó en rojo.
 *
 * Hoja "Buscador de clientes": otro archivo suelto (sin contraseña) con todos
 * los clientes del universo ICE de la unidad y los evaluados en el mes que no
 * están en él. Se escribe el SAP (o parte del nombre), sale el nombre y con
 * Entrar se abre la misma ficha, con su tipo de cliente explicado, la sección
 * «¿Dónde está?» y el checklist de la submétrica que más le quitó ya abierto.
 * Las dos hojas se arman en el navegador con los datos ya descifrados. */
const IceExtra = (function () {
  'use strict';
  const { esc, num } = Util;
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
                 'octubre', 'noviembre', 'diciembre'];
  // Un color por auditor (los dos primeros, los de la marca)
  const COLORES = ['#F40000', '#000000', '#1565C0', '#2E7D32', '#EF6C00', '#6A1B9A', '#00838F', '#6D4C41',
                   '#C2185B', '#5D6D7E', '#9E9D24', '#283593'];
  const TACTIL = window.matchMedia('(pointer: coarse)').matches;
  const dec1 = v => v == null ? '—' : num(v, 1);
  const plural = (n, s, p) => `${num(n)} ${n === 1 ? s : (p || s + 's')}`;

  // ── Geometría ─────────────────────────────────────────────────────────
  const KM_LAT = 111.32;
  function km(a, b) {
    const dy = (a[0] - b[0]) * KM_LAT, dx = (a[1] - b[1]) * KM_LAT * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    return Math.hypot(dx, dy);
  }

  // Orden de visita estimado: se empieza por el punto más alejado del centro
  // y se sigue siempre con el más cercano que falte
  function ordenar(puntos) {
    if (puntos.length < 3) return puntos.slice();
    const c = [puntos.reduce((s, p) => s + p.ll[0], 0) / puntos.length, puntos.reduce((s, p) => s + p.ll[1], 0) / puntos.length];
    const faltan = puntos.slice();
    let k = 0;
    faltan.forEach((p, i) => { if (km(p.ll, c) > km(faltan[k].ll, c)) k = i; });
    const orden = [faltan.splice(k, 1)[0]];
    while (faltan.length) {
      const ult = orden[orden.length - 1].ll;
      let j = 0;
      for (let i = 1; i < faltan.length; i++) if (km(faltan[i].ll, ult) < km(faltan[j].ll, ult)) j = i;
      orden.push(faltan.splice(j, 1)[0]);
    }
    return orden;
  }

  // Envolvente convexa (cadena monótona de Andrew) de [[lat, lon]]
  function envolvente(lls) {
    const p = [...new Map(lls.map(q => [q.join(','), q])).values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    if (p.length < 3) return p;
    const giro = (o, a, b) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
    const mitad = lista => {
      const h = [];
      for (const q of lista) {
        while (h.length >= 2 && giro(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
        h.push(q);
      }
      h.pop();
      return h;
    };
    return mitad(p).concat(mitad(p.slice().reverse()));
  }

  function areaKm2(anillo) {
    if (anillo.length < 3) return 0;
    const lat0 = anillo.reduce((s, q) => s + q[0], 0) / anillo.length, kx = KM_LAT * Math.cos(lat0 * Math.PI / 180);
    let s = 0;
    for (let i = 0; i < anillo.length; i++) {
      const a = anillo[i], b = anillo[(i + 1) % anillo.length];
      s += a[1] * kx * b[0] * KM_LAT - b[1] * kx * a[0] * KM_LAT;
    }
    return Math.abs(s) / 2;
  }

  // ── Información del sistema (unidad y administrador) ──────────────────
  // Sirve para saber de un vistazo si la página y los datos ICE están al día
  function htmlInfo(D) {
    const aFecha = t => {
      const [f, h = '00:00'] = String(t || '').split(' '), [a, m, d] = f.split('-').map(Number), [hh, mm] = h.split(':').map(Number);
      return d ? new Date(a, m - 1, d, hh || 0, mm || 0) : null;
    };
    const largo = (t, conHora = true) => {
      const f = aFecha(t);
      if (!f) return '—';
      const hora = conHora && String(t).includes(' ') ? `, ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}` : '';
      return `${DIAS[f.getDay()].toLowerCase()} ${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}${hora}`;
    };
    const horasDesde = t => { const f = aFecha(t); return f ? (Date.now() - f) / 3600000 : null; };
    const hace = t => {
      const h = horasDesde(t);
      if (h == null) return '';
      if (h < 1) return 'hace menos de una hora';
      if (h < 36) return `hace ${plural(Math.round(h), 'hora')}`;
      return `hace ${plural(Math.round(h / 24), 'día')}`;
    };
    const estado = (ok, siOk, siNo) => `<span class="info-estado ${ok ? 'ok' : 'alerta'}">${esc(ok ? siOk : siNo)}</span>`;
    const C = D.corte, F = D.fuentes || {}, hPag = horasDesde(D.generado), hIce = C ? horasDesde(C.clave) : null;
    const detalle = D.detalle_canal || {};
    const filas = [
      ['Esta página', largo(D.generado), hace(D.generado)],
      ...(C ? C.cortes.map(t => { const [canal, ...r] = t.split(' · '); return [`Corte ICE cargado · ${canal === 'Traditional' ? 'Home Market (Traditional)' : canal}`, r.join(' · '), '']; }) : []),
      ...Object.entries(detalle).map(([, d]) => [`Última encuesta ICE · ${d.pestana}`, largo(d.encuestas_hasta), hace(d.encuestas_hasta)]),
      ...(!D.detalle_canal && C && C.encuestas_hasta ? [['Última encuesta ICE', largo(C.encuestas_hasta), hace(C.encuestas_hasta)]] : []),
      ...(F.epica ? [['ÉPICA', largo(F.epica), hace(F.epica)]] : []),
      ...(F.universo ? [['Universo ICE cargado', largo(F.universo), hace(F.universo)]] : []),
      ...(F.master ? [['Master Data cargada', largo(F.master), hace(F.master)]] : []),
      ...(F.jefaturas ? [['Jefaturas y frecuencias cargadas', largo(F.jefaturas), hace(F.jefaturas)]] : []),
      ...(D.checklist ? [['Metas SOCI/SOVI del checklist (/sovisoci)', D.checklist.metas_al ? largo(D.checklist.metas_al) : 'Sin cargar', D.checklist.metas_al ? hace(D.checklist.metas_al) : '']] : []),
    ];
    // Checklist ICE por cliente (js/ice-checklist.js): metas con que se calculan los frentes
    const CK = D.checklist;
    const metasCk = CK ? (CK.orden || Object.keys(CK.canales)).flatMap(c => {
      const x = CK.canales[c];
      return Object.keys(x.metas).map(k => [x.nombre, (x.nombres_metas || {})[k] || k, x.metas[k]]);
    }) : [];
    return `<div class="ice-kpis info-kpis">
        <div class="ice-kpi destacado"><p class="kpi-etiqueta">Página actualizada</p><p class="kpi-valor info-valor">${esc(largo(D.generado))}</p>
          <p class="kpi-sub">${esc(hace(D.generado))} ${estado(hPag != null && hPag <= 26, 'Al día', 'Sin actualizar')}</p></div>
        <div class="ice-kpi"><p class="kpi-etiqueta">Datos ICE hasta</p><p class="kpi-valor info-valor">${C && C.encuestas_hasta ? esc(largo(C.encuestas_hasta)) : 'Sin evaluaciones del mes'}</p>
          <p class="kpi-sub">última encuesta registrada${C && C.encuestas_hasta ? ` · ${esc(hace(C.encuestas_hasta))}` : ''}</p></div>
        <div class="ice-kpi"><p class="kpi-etiqueta">Último reporte ICE cargado</p><p class="kpi-valor info-valor">${C ? esc(C.texto) : '—'}</p>
          <p class="kpi-sub">${C ? esc(hace(C.clave)) : ''} ${C ? estado(hIce != null && hIce <= 72, 'Reciente', 'Revisar: más de 3 días') : ''}</p></div>
      </div>
      <section class="ice-seccion"><header class="ice-sec-cab"><div><h2>Fecha de cada dato</h2>
        <p>La página se publica sola todos los días a la 1:00 a. m. y cada vez que se manda /publicaavance. Los datos ICE llegan hasta el último reporte cargado con /addicedata; las encuestas suelen ir unos días atrás de la fecha del reporte.</p></div></header>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th>Dato</th><th class="izq">Fecha</th><th class="izq">Antigüedad</th></tr></thead>
          <tbody>${filas.map(([k, v, h]) => `<tr><th scope="row">${esc(k)}</th><td class="izq">${esc(v)}</td><td class="izq">${esc(h)}</td></tr>`).join('')}</tbody>
        </table></div></section>
      ${CK ? `<section class="ice-seccion"><header class="ice-sec-cab"><div><h2>Checklist ICE por cliente</h2>
        <p>En las fichas de cliente (Mapa, Semanas, Preventa, Farmers, Polígonos y las hojas «Mis clientes ICE» y «Buscador de clientes») cada barra dice el porcentaje de la submétrica, los puntos que sumó de su total y, a un lado, los que perdió, con los puntos del manual ICE 2026 para el tipo de cliente con que se calificó (tamaño, y Fonda o Puesto en On Premise, con o sin reja en Home Market). Al tocar una barra sale el checklist de esa submétrica para ese cliente: lo que vale cada paso y, en SOCI y SOVI, cuántos frentes de Coca-Cola le faltan para la meta. Las metas las pone el líder con /sovisoci en el bot:</p></div></header>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th>Canal</th><th class="izq">Meta</th><th>Valor</th></tr></thead>
          <tbody>${metasCk.map(([c, n, v]) => `<tr><th scope="row">${esc(c)}</th><td class="izq">${esc(n)}</td><td>${v != null ? `${esc(String(v))}%` : '<span class="muted">sin meta</span>'}</td></tr>`).join('')}</tbody>
        </table></div></section>` : ''}`;
  }

  // ── Cinética ──────────────────────────────────────────────────────────
  // Botones con los evaluadores que pasaron por la unidad: al elegir uno se
  // ven los clientes que visitó; las flechas recorren sus días y «Ver todas
  // las zonas» regresa a todo el mes. ctx = { capaBase, botonUbicacion,
  // limitesRobustos }; devuelve el mapa
  function cinetica(panel, D, ctx) {
    const SIN = 'Sin auditor';
    const evs = D.evaluados.filter(e => e[5]).map(e => ({
      sap: e[0], nombre: e[1], ll: e[2] != null && e[3] != null ? [e[2], e[3]] : null, canal: D.canales[e[4]] === 'Traditional' ? 'Home Market' : D.canales[e[4]],
      fecha: e[5], ice: e[6], zona: D.zonas[e[10]], auditor: e[13] || SIN,
    }));
    if (!evs.length) {
      panel.innerHTML = `<div class="mapa-barra"><p class="mapa-resumen">Aún no hay evaluaciones ICE de ${esc(D.mes)}: la cinética aparece con el primer corte del mes.</p></div>`;
      return null;
    }
    const cuenta = {};
    for (const e of evs) cuenta[e.auditor] = (cuenta[e.auditor] || 0) + 1;
    const auditores = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b));
    const color = Object.fromEntries(auditores.map((a, i) => [a, COLORES[i % COLORES.length]]));
    const textoDia = f => { const d = new Date(D.anio, D.mes_num - 1, Number(f.slice(8, 10))); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
    const promedio = l => { const v = l.map(e => e.ice).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const largoRuta = l => { let t = 0; for (let k = 1; k < l.length; k++) t += km(l[k - 1].ll, l[k].ll); return t; };
    const agrupar = (l, f) => { const g = {}; for (const e of l) (g[f(e)] = g[f(e)] || []).push(e); return g; };

    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="cin-fila"><span class="poli-rutas-tit">Evaluadores que pasaron:</span><div class="chips" id="cinAuditores" role="group" aria-label="Evaluadores"></div></div>
        <div class="cin-nav" role="group" aria-label="Días del mes">
          <button type="button" class="ice-btn sec cin-paso" id="cinAntes" aria-label="Día anterior" title="Día anterior">◀</button>
          <output class="cin-fecha" id="cinFecha" aria-live="polite"></output>
          <button type="button" class="ice-btn sec cin-paso" id="cinDespues" aria-label="Día siguiente" title="Día siguiente">▶</button>
          <button type="button" class="ice-btn" id="cinTodas">Ver todas las zonas</button>
        </div>
        <p class="mapa-resumen" id="cinResumen" role="status"></p>
        <p class="mapa-ayuda">Elige un evaluador para ver los clientes que visitó. Con las flechas pasas por sus días, uno por uno; <b>Ver todas las zonas</b> muestra a la vez las zonas de todo ${esc(D.mes)}. El reporte ICE trae la fecha de la encuesta pero no la hora, así que <b>el orden del recorrido de cada día es estimado</b> (del cliente más cercano al siguiente).</p>
      </div>
      <div class="rutas-cuerpo">
        <div id="mapaCinetica" class="mapa"></div>
        <aside class="rutas-lista" aria-label="Evaluadores y clientes"><ul id="cinLista"></ul></aside>
      </div>`;
    const $ = id => document.getElementById(id);

    const mapa = L.map('mapaCinetica');
    ctx.capaBase(mapa);
    ctx.botonUbicacion(mapa);
    mapa.createPane('cinZonas').style.zIndex = 410;
    mapa.createPane('cinPuntos').style.zIndex = 460;
    const rendZonas = L.canvas({ pane: 'cinZonas', padding: 0.4 });
    const rendPuntos = L.canvas({ pane: 'cinPuntos', padding: 0.4, tolerance: TACTIL ? 10 : 4 });
    const capa = L.layerGroup().addTo(mapa);
    const conCoord = evs.filter(e => e.ll);
    if (conCoord.length) mapa.fitBounds(ctx.limitesRobustos(conCoord.map(e => e.ll)).pad(0.08));
    else mapa.setView([19.36, -99.14], 11);

    const estado = { auditor: null, dia: null };     // null = todos los evaluadores / todos los días
    let marcas = new Map();

    const delEvaluador = () => estado.auditor ? evs.filter(e => e.auditor === estado.auditor) : evs;
    const diasDisponibles = () => [...new Set(delEvaluador().map(e => e.fecha))].sort();

    function zona(lls, c, opciones, tip) {
      if (!lls.length) return null;
      const h = envolvente(lls);
      const estilo = Object.assign({ renderer: rendZonas, color: c, weight: 2, fillColor: c, fillOpacity: 0.16, interactive: !!tip }, opciones);
      // Con 1 o 2 clientes no hay polígono: un círculo o una franja
      const z = h.length >= 3 ? L.polygon(h, estilo)
        : h.length === 2 ? L.polyline(h, Object.assign({}, estilo, { weight: 14, opacity: estilo.fillOpacity * 1.6, lineCap: 'round' }))
        : L.circle(h[0], Object.assign({ radius: 160 }, estilo));
      if (tip && !TACTIL) z.bindTooltip(tip, { sticky: true, opacity: 0.95 });
      return z.addTo(capa);
    }

    function punto(e, c, radio, parada) {
      const m = L.circleMarker(e.ll, { renderer: rendPuntos, radius: radio, color: '#FFFFFF', weight: radio > 4 ? 2 : 1, fillColor: c, fillOpacity: 1 }).addTo(capa);
      m.bindPopup(`<div class="pc"><div class="pc-cab"><b>${esc(e.nombre || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(e.sap)}</strong></span>
        <span>ICE <b style="display:inline;font-size:13px">${dec1(e.ice)}</b> · ${esc(e.canal)}</span></div>
        <dl class="pc-cuerpo"><dt>Evaluador</dt><dd>${esc(e.auditor)}</dd><dt>Fecha</dt><dd>${esc(textoDia(e.fecha))}</dd><dt>Jefatura</dt><dd>${esc(e.zona)}</dd>
        ${parada ? `<dt>Parada</dt><dd>${esc(parada)} (orden estimado)</dd>` : ''}</dl></div>`, { maxWidth: 280 });
      marcas.set(e, m);
    }

    function pintar(encuadrar) {
      const { auditor, dia } = estado;
      const visibles = delEvaluador().filter(e => !dia || e.fecha === dia);
      capa.clearLayers();
      marcas = new Map();
      const conLl = visibles.filter(e => e.ll);
      if (dia) {
        // Un día: zona, recorrido y clientes de cada evaluador
        for (const [a, lista] of Object.entries(agrupar(conLl, e => e.auditor))) {
          const orden = ordenar(lista), c = color[a];
          zona(orden.map(e => e.ll), c, {});
          if (orden.length > 1) L.polyline(orden.map(e => e.ll), { renderer: rendPuntos, color: c, weight: 3, opacity: 0.9, interactive: false }).addTo(capa);
          orden.forEach((e, k) => punto(e, c, k === 0 ? 8 : 6, `${k + 1} de ${orden.length}`));
        }
      } else if (auditor) {
        // Un evaluador, todo el mes: la zona de cada uno de sus días
        const c = color[auditor];
        for (const [f, lista] of Object.entries(agrupar(conLl, e => e.fecha)))
          zona(lista.map(e => e.ll), c, { weight: 1.5, fillOpacity: 0.12 }, `<b>${esc(textoDia(f))}</b> · ${plural(lista.length, 'cliente')}`);
        conLl.forEach(e => punto(e, c, 5.5));
      } else {
        // Todos, todo el mes: la zona que cubrió cada evaluador
        for (const [a, lista] of Object.entries(agrupar(conLl, e => e.auditor))) {
          zona(lista.map(e => e.ll), color[a], { weight: 2, fillOpacity: 0.1 }, `<b>${esc(a)}</b> · ${plural(lista.length, 'cliente')}`);
          lista.forEach(e => punto(e, color[a], 3.5));
        }
      }
      if (encuadrar && conLl.length) mapa.fitBounds(L.latLngBounds(conLl.map(e => e.ll)).pad(0.15), { maxZoom: 16 });

      // Controles
      $('cinAuditores').innerHTML = `<button type="button" class="chip" data-auditor="" aria-pressed="${!auditor}">Todos · ${num(evs.length)}</button>` +
        auditores.map(a => `<button type="button" class="chip" aria-pressed="${a === auditor}" data-auditor="${esc(a)}"><span class="adm-sw" style="background:${color[a]}"></span>${esc(a)} · ${num(cuenta[a])}</button>`).join('');
      const dias = diasDisponibles();
      $('cinFecha').innerHTML = dia ? `<b>${esc(textoDia(dia))}</b> <span class="muted">· día ${dias.indexOf(dia) + 1} de ${dias.length}</span>`
        : `<b>Todos los días</b> <span class="muted">· ${plural(dias.length, 'día')} con evaluaciones</span>`;
      $('cinTodas').disabled = !dia;
      const sinLl = visibles.length - conLl.length;
      $('cinResumen').innerHTML = `${auditor ? `<b>${esc(auditor)}</b>: ` : ''}<b>${plural(visibles.length, 'cliente evaluado', 'clientes evaluados')}</b>${auditor ? '' : ` por <b>${plural(new Set(visibles.map(e => e.auditor)).size, 'evaluador', 'evaluadores')}</b>`} · ICE promedio <b>${dec1(promedio(visibles))}</b>${sinLl ? ` · ${num(sinLl)} sin coordenadas no aparecen en el mapa` : ''}.`;

      // Lista lateral: evaluadores o, con uno elegido, sus clientes por día
      let html = '';
      if (auditor) {
        const porDia = agrupar(visibles, e => e.fecha);
        for (const f of Object.keys(porDia).sort()) {
          const lista = porDia[f], orden = ordenar(lista.filter(e => e.ll)).concat(lista.filter(e => !e.ll));
          html += `<li class="cin-dia"><b>${esc(textoDia(f))}</b><span>${plural(lista.length, 'cliente')} · ICE ${dec1(promedio(lista))} · ~${num(largoRuta(orden.filter(e => e.ll)), 1)} km</span></li>`;
          html += orden.map(e => `<li><button type="button" class="ruta-item cin-item" data-e="${evs.indexOf(e)}"${e.ll ? '' : ' disabled'}>
            <span class="adm-sw" style="background:${color[auditor]}"></span>
            <span><b>${esc(e.nombre || 'Cliente ' + e.sap)}</b><span class="ruta-info">SAP ${esc(e.sap)} · ${esc(e.zona)} · ${esc(e.canal)}${e.ll ? '' : ' · sin coordenadas'}</span></span>
            <span class="poli-pct">${dec1(e.ice)}</span></button></li>`).join('');
        }
      } else {
        const porAud = agrupar(visibles, e => e.auditor);
        html = auditores.filter(a => porAud[a]).map(a => {
          const l = porAud[a], zonas = [...new Set(l.map(e => e.zona))].sort();
          return `<li><button type="button" class="ruta-item cin-item" data-auditor="${esc(a)}"><span class="adm-sw" style="background:${color[a]}"></span>
            <span><b>${esc(a)}</b><span class="ruta-info">${plural(new Set(l.map(e => e.fecha)).size, 'día')} · ICE ${dec1(promedio(l))}<br>${esc(zonas.join(', '))}</span></span>
            <span class="poli-pct">${num(l.length)}</span></button></li>`;
        }).join('');
      }
      $('cinLista').innerHTML = html || '<li class="muted" style="padding:12px 6px;font-size:13px">Sin evaluaciones.</li>';
      $('cinLista').scrollTop = 0;
    }

    // Flechas: Todos los días → primer día → … → último día → Todos los días
    function paso(dir) {
      const dias = diasDisponibles();
      if (!estado.dia) estado.dia = dir > 0 ? dias[0] : dias[dias.length - 1];
      else estado.dia = dias[dias.indexOf(estado.dia) + dir] || null;
      pintar(true);
    }
    $('cinAntes').addEventListener('click', () => paso(-1));
    $('cinDespues').addEventListener('click', () => paso(1));
    $('cinTodas').addEventListener('click', () => { estado.dia = null; pintar(true); });
    const elegir = a => {
      estado.auditor = a && a !== estado.auditor ? a : null;
      if (estado.dia && !diasDisponibles().includes(estado.dia)) estado.dia = null;
      pintar(true);
    };
    $('cinAuditores').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-auditor]');
      if (b) elegir(b.dataset.auditor);
    });
    $('cinLista').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.auditor) return elegir(b.dataset.auditor);
      const e = evs[+b.dataset.e], m = marcas.get(e);
      if (m) { mapa.setView(e.ll, Math.max(mapa.getZoom(), 16)); m.openPopup(); }
    });
    pintar(false);
    return mapa;
  }

  // ── Hoja descargable "Mis clientes ICE" ───────────────────────────────
  // Tres pantallas: inicio (jefatura y ruta, o Farmer y su clave), listas
  // (prioridad 1, 2 y 3; no prioritarios; ya evaluados en el mes) y ficha del
  // cliente (mapa, cómo llegar, datos y desglose de su última evaluación ICE).
  // Estilos y programa van dentro del archivo: no carga nada de este sitio.
  const CSS_HOJA = `
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Montserrat","Gotham","Helvetica Neue",Arial,sans-serif;background:#fff;color:#000}
h1,h2,h3,p{margin:0}
button,select{font:inherit;color:inherit}
:focus-visible{outline:3px solid #000;outline-offset:2px}
.cab{background:#F40000;color:#fff;padding:18px clamp(14px,4vw,40px) 20px}
.kicker{font-size:11px;font-weight:600;letter-spacing:.3em;text-transform:uppercase}
.cab h1{margin-top:8px;font-size:clamp(24px,6vw,40px);font-weight:800;line-height:1.02;text-transform:uppercase;letter-spacing:-.01em}
.cab .sub{margin-top:8px;font-size:12.5px;line-height:1.45}
main{max-width:920px;padding:0 clamp(12px,3vw,40px) 24px}
.gris{color:#8C8C8C}
.inicio{max-width:460px;padding-top:22px}
.inicio h2{font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.inicio .ayuda{margin-top:8px;font-size:14px;line-height:1.5;color:#333}
.campo{display:flex;flex-direction:column;gap:6px;margin-top:18px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.campo select{min-height:52px;padding:10px 12px;font-size:16px;font-weight:700;letter-spacing:0;text-transform:none;border:2px solid #000;border-radius:0;background:#fff;color:#000}
.campo select:focus{border-color:#F40000}
.campo select:disabled{border-color:#BDBDBD;color:#8C8C8C}
.entrar{width:100%;min-height:56px;margin-top:22px;font-size:16px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;border:0;border-radius:0;background:#F40000;color:#fff;cursor:pointer}
.entrar:disabled{background:#D0D0D0;color:#fff;cursor:default}
.nav{padding:12px 0 10px}
.volver{display:inline-flex;align-items:center;min-height:40px;padding:6px 14px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:2px solid #000;border-radius:0;background:#fff;cursor:pointer}
.quien{font-size:22px;font-weight:800;line-height:1.1;text-transform:uppercase}
.quien small{display:block;margin-top:4px;font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#4D4D4D}
.tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px;border-bottom:2px solid #000}
.tabs button{min-height:52px;padding:6px 6px 4px;font-size:11.5px;font-weight:800;line-height:1.2;letter-spacing:.02em;text-transform:uppercase;border:0;border-bottom:5px solid transparent;border-radius:0;background:none;color:#6E6E6E;cursor:pointer}
.tabs button b{display:block;font-size:17px}
.tabs button[aria-selected="true"]{color:#000;border-bottom-color:#F40000}
.seg{display:flex;margin-top:12px;border:2px solid #000}
.seg button{flex:1;min-height:42px;padding:6px 8px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:0;border-radius:0;background:#fff;cursor:pointer}
.seg button+button{border-left:2px solid #000}
.seg button[aria-pressed="true"]{background:#000;color:#fff}
.resumen{margin-top:12px;font-size:13px;line-height:1.5;color:#333}
.leyenda{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px;font-size:11.5px;color:#4D4D4D}
.leyenda span{display:inline-flex;align-items:center;gap:5px}
.leyenda i{display:inline-block;width:14px;height:14px}
.tabla{margin-top:10px}
.fila{display:grid;grid-template-columns:14px 6em minmax(0,1fr) 2.6em 4.2em minmax(0,.8fr);align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid #E0E0E0;font-size:13px;line-height:1.25;color:#000;text-decoration:none}
.fila.enc{padding:6px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4D4D4D;border-bottom:2px solid #000}
.fila.enc .cal{text-align:right}
a.fila{cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,.08)}
a.fila:hover{background:#F6F6F6}
.fila .sap{font-size:12px;font-variant-numeric:tabular-nums;color:#333}
.fila .nom{font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.fila .cal{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
.fila .falto{font-size:12px}
.fila .can{font-size:11px;font-weight:800;text-align:center;color:#4D4D4D}
.bola{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid transparent}
.bola.p1{background:#F40000;border-color:#F40000}
.bola.p2{background:#000;border-color:#000}
.bola.p3{background:#fff;border-color:#000}
.bola.p4,.bola.p0{background:#BDBDBD;border-color:#BDBDBD}
.calor{display:inline-block;min-width:3.3em;padding:3px 5px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
.vacio{margin-top:14px;padding:14px 16px;background:#F4F4F4;border-left:6px solid #000;font-size:14px;line-height:1.5}
.tipos{margin-top:22px;font-size:12.5px;line-height:1.5;color:#333}
.tipos summary{font-weight:800;cursor:pointer}
.tipos dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;margin:10px 0 0}
.tipos dt{display:flex;align-items:center;gap:6px;font-weight:800;white-space:nowrap}
.tipos dd{margin:0}
.nota{margin-top:14px;font-size:12px;line-height:1.55;color:#4D4D4D}
.f-cab{padding:14px 16px 15px;background:#000;color:#fff}
.f-cab.p1{background:#F40000}
.f-cab.p3{background:#4D4D4D}
.f-cab.p4,.f-cab.p0{background:#6E6E6E}
.f-tipo{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.f-cab h2{margin-top:8px;font-size:21px;font-weight:800;line-height:1.15}
.f-cab .f-sap{margin-top:4px;font-size:13px}
.f-cab .f-sap b{font-size:15px;font-variant-numeric:tabular-nums;user-select:all}
.f-mapa{height:260px;margin-top:12px;background:#EEE;border:2px solid #000}
.f-mapa iframe{display:block;width:100%;height:100%;border:0}
.f-mapa.sin{display:flex;align-items:center;justify-content:center;height:auto;padding:18px;font-size:13.5px;text-align:center}
.f-botones{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.btn{display:flex;align-items:center;justify-content:center;min-height:50px;padding:8px;font-size:12.5px;font-weight:800;letter-spacing:.06em;text-align:center;text-transform:uppercase;text-decoration:none;border:2px solid #000;background:#fff;color:#000}
.btn.rojo{background:#F40000;border-color:#F40000;color:#fff}
.f-sec{margin-top:24px}
.f-sec h3{padding-left:10px;border-left:6px solid #F40000;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
.f-ice{display:flex;align-items:center;gap:12px;margin-top:12px}
.f-ice .calor{min-width:auto;padding:6px 12px;font-size:26px}
.f-ice p{font-size:12.5px;line-height:1.45;color:#333}
.f-peor{margin-top:12px;padding:9px 12px;background:#FFE5E5;border-left:5px solid #F40000;font-size:13.5px;line-height:1.45}
.f-peor.ok{background:#F4F4F4;border-left-color:#000}
.mets{display:grid;gap:5px;margin-top:12px}
.met{display:grid;grid-template-columns:26px minmax(0,1fr) 3.4em;align-items:center;gap:8px;font-size:12.5px}
.met .ico{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#000;color:#fff}
.met .ico svg{width:15px;height:15px}
.met .barra{position:relative;display:block;padding:6px 8px;background:#EFEFEF;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.met .barra i{position:absolute;top:0;bottom:0;left:0;background:rgba(0,0,0,.13)}
.met .barra em{position:relative;font-style:normal}
.met b{text-align:right;font-variant-numeric:tabular-nums}
.met.peor .ico{background:#F40000}
.met.peor .barra{background:#FFE5E5;font-weight:800;color:#B00000}
.met.peor .barra i{background:rgba(244,0,0,.28)}
.met.peor b{color:#F40000}
button.met{width:100%;padding:0;border:0;background:none;font:inherit;font-size:12.5px;color:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,.08)}
button.met:hover .barra,button.met:focus-visible .barra{box-shadow:inset 0 0 0 1.5px #000}
.met[aria-expanded="true"] .barra{box-shadow:inset 0 0 0 2px #000}
.met .barra{display:flex;justify-content:space-between;gap:8px}
.met .barra em{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.met .barra .pts{position:relative;flex:none;font-weight:700;font-variant-numeric:tabular-nums}
.ck-sitio{margin:2px 0 10px;padding:12px 12px 10px;border:2px solid #000;border-top:6px solid #F40000}
.datos{display:grid;grid-template-columns:minmax(104px,36%) minmax(0,1fr);margin:10px 0 0}
.datos dt,.datos dd{margin:0;padding:9px 0;border-bottom:1px solid #E6E6E6}
.datos dt{padding-right:10px;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4D4D4D}
.datos dd{font-size:13.5px;font-weight:600;line-height:1.4}
.ep{display:block}
.alerta{display:inline-block;margin-left:6px;padding:0 6px;font-size:10.5px;font-weight:800;text-transform:uppercase;background:#F40000;color:#fff}
.pie{display:flex;justify-content:space-between;gap:12px;margin:22px clamp(12px,3vw,40px) 18px;padding-top:12px;border-top:1px solid #8C8C8C;font-size:10.5px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#4D4D4D}
@media (max-width:440px){
.fila{grid-template-columns:12px 5.7em minmax(0,1fr) 2.7em 3.7em minmax(0,.8fr);gap:6px;padding:8px 2px;font-size:12.5px}
.fila .can{font-size:10.5px}
.fila.enc .can{letter-spacing:0;font-size:8px}
.fila.enc{padding:6px 2px;font-size:9px;letter-spacing:.04em}
.fila .sap{font-size:11px}.fila .falto{font-size:11.5px}.bola{width:12px;height:12px}
.calor{min-width:2.9em;padding:3px 2px}
.tabs button{font-size:10.5px}
}
@media print{.nav,.tabs,.seg,.f-mapa,.f-botones{display:none!important}.cab,.calor,.bola,.f-cab{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

  // ── Ficha del cliente (las dos hojas descargables) ────────────────────
  // La misma ficha en «Mis clientes ICE» y en el «Buscador de clientes»: tipo
  // de cliente, mapa y cómo llegar, desglose de su última evaluación ICE (cada
  // barra abre el checklist de esa submétrica) y sus datos. Se guarda como
  // texto y corre dentro del archivo descargado (ES5, para que abra también en
  // celulares viejos); usa IceChecklist, que va antes en el mismo archivo.
  function programaFicha() {
    // Cliente: [0 SAP, 1 nombre, 2 tipo (1–3 prioridad, 4 no prioritario, 0 fuera del universo),
    //  3 lat, 4 lon, 5 dirección, 6 jefatura, 7 ruta de preventa, 8 frecuencia de preventa,
    //  9 farmer, 10 frecuencia del farmer, 11 canal, 12 visitas ICE del mes anterior,
    //  13 visitas antes, 14 semana del mes, 15 visitas en esa semana, 16 visitas con fecha,
    //  17 promedio ICE, 18 última evaluación [fecha, canal, ICE, submétricas, la que más
    //  quitó, puntos, formato con que se calificó, formato de la Master Data] o 0, 19 evaluación del mes [fecha, ICE, auditor, ubicación] o 0,
    //  20 ÉPICA del mes [brigadistas, preventa, farmers]: [fecha, calificación, NoGeo, foto de foto] o 0,
    //  21 fecha y 22 ICE de su última evaluación antes del mes, 23 meses con ICE en la ventana de
    //  prioridad y 24 puntos de prioridad (null fuera del universo)]
    var D = null, fichaU = null;
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
    var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var TIPO = { 0: 'Fuera del universo ICE', 1: 'Prioridad 1', 2: 'Prioridad 2', 3: 'Prioridad 3', 4: 'No prioritario' };
    var LETRA = { L: 'lunes', M: 'martes', R: 'miércoles', J: 'jueves', V: 'viernes', F: 'viernes', S: 'sábado', D: 'domingo' };
    function preparar(datos) {
      D = datos;
      // Checklist ICE de cada submétrica (programaChecklist de js/ice-checklist.js, copiado en el archivo)
      IceChecklist.preparar(D.checklist);
    }

    // Un decimal, mitades hacia arriba sobre la forma decimal del número (como toLocaleString en el sitio)
    var r1 = function (v) { var r = Math.round(Number(v + 'e1')) / 10; return isNaN(r) ? Math.round(v * 10) / 10 : r; };
    var dec1 = function (v) { return v == null ? '—' : r1(v).toFixed(1); };
    function fecha(iso) {
      if (!iso) return '—';
      var t = String(iso), m = +t.slice(5, 7);
      return +t.slice(8, 10) + ' ' + MESES[m - 1] + (t.length > 10 ? ', ' + t.slice(11, 16) : '');
    }
    function plural(n, s, p) { return n + ' ' + (n === 1 ? s : (p || s + 's')); }
    function frecuencia(letras) {
      var dias = [];
      String(letras || '').split('').forEach(function (l) { if (LETRA[l] && dias.indexOf(LETRA[l]) < 0) dias.push(LETRA[l]); });
      if (!dias.length) return esc(letras || '—');
      var texto = dias.length > 1 ? dias.slice(0, -1).join(', ') + ' y ' + dias[dias.length - 1] : dias[0];
      return esc(letras) + ' <span class="gris">(' + esc(texto) + ')</span>';
    }

    // Mapa de calor de la calificación: verde desde 85, naranja de 70 a 84.9 y
    // rojo debajo de 70; dentro de cada color, más intenso mientras más se aleja del corte
    function mezcla(a, b, t) {
      t = Math.max(0, Math.min(1, t));
      return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * t); }).join(',') + ')';
    }
    function calor(v) {
      var r = r1(v);
      if (r >= 85) return { fondo: mezcla([40, 140, 60], [8, 84, 32], (r - 85) / 20), tinta: '#fff' };
      if (r >= 70) return { fondo: mezcla([239, 108, 0], [255, 183, 77], (r - 70) / 15), tinta: '#000' };
      return { fondo: mezcla([244, 0, 0], [122, 0, 0], (70 - r) / 30), tinta: '#fff' };
    }
    function celdaCalor(v) {
      if (v == null) return '<span class="gris">—</span>';
      var c = calor(v);
      return '<span class="calor" style="background:' + c.fondo + ';color:' + c.tinta + '">' + dec1(v) + '</span>';
    }

    // Lo que le faltó: la submétrica que más puntos le quitó en esa evaluación
    function falto(u, corto) {
      if (!u) return { t: 'Nunca evaluado', gris: true };
      if (u[4] != null) return { t: D.metricas[u[4]][corto ? 1 : 0] };
      var alguna = (u[3] || []).some(function (v) { return v != null; });
      return { t: alguna ? 'Todo al 100%' : 'Sin desglose', gris: true };
    }
    // Puntos aproximados que quitó cada submétrica con los pesos estimados (evaluaciones
    // de antes de las reglas del checklist); con ellas se usan los puntos oficiales
    function perdidos(u) {
      var w = D.pesos[u[1]] || [];
      return (u[3] || []).map(function (v, i) { return v == null ? null : (w[i] != null ? w[i] : 0.01) * Math.max(0, 100 - v); });
    }
    // Qué es su tipo de cliente (D.tipos: [puntos, descripción, ejemplo] por tipo)
    function textoTipo(p) {
      var t = D.tipos && D.tipos[p];
      if (t) return esc(t[0]) + (t[1] ? ': ' + esc(t[1]) : '') + ' (' + esc(t[2]) + ').';
      return p === 0 ? 'No está en el universo ICE de ' + esc(D.unidad) + ': no tiene tipo de cliente.' : '';
    }

    var fila = function (k, v) { return v == null || v === '' ? '' : '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'; };
    function textoEpica(e) {
      if (!e) return '<span class="gris">Pendiente</span>';
      return '<b>' + dec1(e[1]) + '</b> · ' + esc(fecha(e[0])) + (e[2] ? '<span class="alerta">NoGeo</span>' : '') + (e[3] ? '<span class="alerta">Foto de foto</span>' : '');
    }
    function desglose(c, op) {
      var u = c[18];
      if (!u) return '<p class="f-peor ok">Este cliente <b>nunca se ha evaluado en ICE</b>: todavía no hay calificaciones de submétricas.</p>';
      var perd = perdidos(u), f = falto(u, false), conPts = IceChecklist.conPuntos(u[0]), noCuentan = [];
      // Barra = botón: «Enfriador 80% 36/45» y a la derecha los puntos perdidos; al
      // tocarla se despliega debajo el checklist de esa submétrica
      var mets = D.metricas.map(function (m, i) {
        var v = (u[3] || [])[i];
        if (v == null) return '';
        if (conPts && IceChecklist.noAplica(u[1], u[6], i)) { noCuentan.push(m[0]); return ''; }
        var inf = IceChecklist.info(u[1], u[6], i, v, u[0]);
        var p = inf ? inf.perdidos : perd[i];
        return '<button type="button" class="met' + (u[4] === i ? ' peor' : '') + '" data-i="' + i + '" aria-expanded="false" aria-controls="ck-' + i + '"><span class="ico">' + m[2] + '</span>'
          + '<span class="barra"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i><em>' + esc(inf ? m[1] : m[0]) + '</em>'
          + '<span class="pts">' + Math.round(v) + '%' + (inf ? ' ' + IceChecklist.pts(inf.ganados) + '/' + IceChecklist.pts(inf.total) : '') + '</span></span>'
          + '<b>' + (p > 0.05 ? '−' + (inf ? IceChecklist.pts(p) : p.toFixed(1)) : '0') + '</b></button>'
          + '<div class="ck-sitio" id="ck-' + i + '" hidden></div>';
      }).join('');
      return '<div class="f-ice">' + celdaCalor(u[2]) + '<p><b>' + (c[19] ? 'Evaluación de ' + esc(D.mes) : 'Última evaluación ICE') + '</b><br>'
        + esc(fecha(u[0])) + ' · ' + esc(D.canales[u[1]] || '') + '</p></div>'
        + (u[4] != null
          ? '<p class="f-peor">Lo que más le quitó: <b>' + esc(f.t) + '</b>' + (u[5] != null ? ' (−' + u[5].toFixed(1) + ' puntos)' : '')
            + (op.abrirPeor ? '. Está en rojo abajo, con su checklist abierto: ahí ves qué corregir.</p>' : '. Está en rojo abajo.</p>')
          : '<p class="f-peor ok">' + (f.t === 'Todo al 100%' ? 'No perdió puntos en ninguna submétrica.' : 'El reporte no trae el desglose de esta evaluación.') + '</p>')
        + (mets ? '<div class="mets">' + mets + '</div>'
          + (noCuentan.length ? '<p class="nota">' + esc(noCuentan.join(' y ')) + ': no ' + (noCuentan.length > 1 ? 'cuentan' : 'cuenta') + ' para un cliente ' + esc((IceChecklist.formato(u[1], u[6]).split(' · ')[1] || '').toLowerCase()) + '.</p>' : '')
          + '<p class="nota">' + (conPts
            ? 'En cada barra: porcentaje de la submétrica y los puntos que sumó de su total (puntos del manual ICE 2026 para un cliente <b>' + esc(IceChecklist.formato(u[1], u[6])) + '</b>); a la derecha, los que perdió.'
            : 'Porcentaje de cada submétrica y, a la derecha, los puntos aproximados que le quitó: esta evaluación es de antes de las reglas de hoy.')
          + ' <b>Toca una barra para ver su checklist</b>: lo que vale cada paso y, en SOCI y SOVI, cuántos frentes faltan.</p>' : '');
    }

    // HTML de la ficha (sin la barra de navegación). op = { ubicacion: sección
    // «¿Dónde está?» con el mapa, la dirección, la jefatura, la ruta y el farmer;
    // tipos: qué es su tipo de cliente bajo el nombre; abrirPeor: avisa que el
    // checklist de la submétrica que más le quitó sale abierto (ver abrirPeor) }
    function ficha(c, op) {
      op = op || {};
      var m = c[19], ep = c[20] || [0, 0, 0];
      fichaU = c[18] || null;
      var conCoord = c[3] != null && c[4] != null;
      var ll = conCoord ? (+c[3]) + ',' + (+c[4]) : '';
      // Semana del mes en que más veces lo ha evaluado el auditor
      var semana = c[14] ? 'Semana ' + c[14] + ' <span class="gris">(días ' + ['1 a 7', '8 a 14', '15 a 21', '22 al fin de mes'][c[14] - 1] + ')</span>'
        + (c[16] ? '<br><span class="gris">Ahí cayeron ' + c[15] + ' de sus ' + plural(c[16], 'visita') + ' ICE</span>' : '') : '';
      var mapa = conCoord
        ? '<div class="f-mapa"><iframe title="Ubicación de ' + esc(c[1] || c[0]) + '" src="https://www.google.com/maps?q=' + ll + '&z=17&hl=es&output=embed" allowfullscreen></iframe></div>'
          + '<div class="f-botones"><a class="btn rojo" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' + ll + '&travelmode=driving">Cómo llegar</a>'
          + '<a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=' + ll + '">Ver en Google Maps</a></div>'
        : '<div class="f-mapa sin">Este cliente no tiene coordenadas en la Master Data: no se puede ubicar en el mapa.</div>';
      var donde = fila('Dirección', esc(c[5]))
        + fila('Jefatura', esc(c[6]))
        + fila('Ruta de preventa', c[7] ? esc(c[7]) + (c[8] ? ' · ' + frecuencia(c[8]) : '') : '')
        + fila('Farmer', c[9] ? esc(c[9]) + (c[10] ? ' · ' + frecuencia(c[10]) : '') : '<span class="gris">Sin farmer</span>');
      var tipo = op.tipos ? textoTipo(c[2]) : '';
      return '<div class="f-cab p' + c[2] + '"><p class="f-tipo">' + TIPO[c[2]]
        + (m ? ' · ya evaluado en ' + esc(D.mes) : ' · sin ICE en ' + esc(D.mes)) + '</p>'
        + '<h2>' + esc(c[1] || 'Cliente sin nombre') + '</h2><p class="f-sap">SAP <b>' + esc(c[0]) + '</b></p>'
        + (tipo ? '<p class="f-desc">' + tipo + '</p>' : '') + '</div>'
        + (op.ubicacion ? '<section class="f-sec"><h3>¿Dónde está?</h3>' + mapa + '<dl class="datos">' + donde + '</dl></section>' : mapa)
        + '<section class="f-sec"><h3>' + (c[19] ? 'Su evaluación ICE de ' + esc(D.mes) : 'Su última evaluación ICE') + '</h3>' + desglose(c, op) + '</section>'
        + '<section class="f-sec"><h3>Datos del cliente</h3><dl class="datos">'
        + fila('Tipo de cliente', '<span class="bola p' + c[2] + '" style="vertical-align:-2px;margin-right:6px"></span>' + TIPO[c[2]])
        + (op.ubicacion ? '' : donde)
        + fila('Canal', esc(D.canales[c[11]] || ''))
        + fila('ICE de ' + D.mes, m ? celdaCalor(m[1]) + ' <span class="gris">' + esc(fecha(m[0])) + (m[2] ? ' · auditor ' + esc(m[2]) : '') + (m[3] === 'Far' ? ' · encuesta lejos del cliente' : '') + '</span>' : '<span class="gris">Todavía no se evalúa</span>')
        + (m ? fila('Evaluación anterior', c[21] ? esc(fecha(c[21])) + ' · ICE ' + dec1(c[22]) : '<span class="gris">Ninguna: es su primera evaluación</span>')
             : fila('Última evaluación', c[18] ? esc(fecha(c[18][0])) + ' · ICE ' + dec1(c[18][2]) : '<span class="gris">Nunca</span>'))
        + fila('Promedio ICE antes de ' + D.mes, c[17] != null ? dec1(c[17]) : '')
        + fila('Puntos de prioridad', c[24] != null ? '<b>' + c[24] + '</b> <span class="gris">(' + c[23] + ' de ' + D.prioridad.meses_ventana
             + ' meses con ICE' + (c[12] ? ' + 1 por ' + esc(D.prioridad.mes_anterior) : '') + ')</span>' : '')
        + fila('Semana del mes', semana)
        + fila('ÉPICA de ' + D.mes, ['Brigadistas', 'Preventa', 'Farmers'].map(function (q, k) {
          return '<span class="ep">' + q + ': ' + textoEpica(ep[k]) + '</span>';
        }).join(''))
        + '</dl></section>';
    }

    // Abre o cierra, bajo su barra, el checklist de la submétrica de un botón .met
    function alternar(b) {
      var i = +b.getAttribute('data-i'), caja = document.getElementById('ck-' + i), abierto = b.getAttribute('aria-expanded') === 'true';
      if (!abierto && !caja.innerHTML) {
        caja.innerHTML = IceChecklist.html({ ci: fichaU[1], fmt: fichaU[6], fmtMaster: fichaU[7], i: i, pct: fichaU[3][i],
                                             fecha: fichaU[0], metrica: D.metricas[i][0] });
      }
      caja.hidden = abierto;
      b.setAttribute('aria-expanded', abierto ? 'false' : 'true');
    }
    // Una sola vez por contenedor de la ficha: barras y calculadoras SOCI/SOVI
    function enlazar(raiz) {
      raiz.addEventListener('click', function (ev) {
        var b = ev.target;
        while (b && b !== raiz && !(b.getAttribute && b.getAttribute('data-i') !== null)) b = b.parentNode;
        if (!b || b === raiz || !fichaU) return;
        alternar(b);
      });
      IceChecklist.enlazar(raiz);
    }
    // Con la ficha ya en la página: abre el checklist de la submétrica que más le quitó
    function abrirPeor(raiz) {
      if (!fichaU || fichaU[4] == null) return;
      var b = raiz.querySelector('button.met[data-i="' + fichaU[4] + '"]');
      if (b && b.getAttribute('aria-expanded') !== 'true') alternar(b);
    }

    return { preparar: preparar, esc: esc, r1: r1, dec1: dec1, plural: plural, celdaCalor: celdaCalor, falto: falto,
             TIPO: TIPO, ficha: ficha, enlazar: enlazar, abrirPeor: abrirPeor };
  }

  // Programa de la hoja «Mis clientes ICE»: se guarda como texto y corre
  // dentro del archivo descargado (ES5); la ficha es la de programaFicha
  function programaHoja() {
    var D = JSON.parse(document.getElementById('datos').textContent);
    // Campos de cada cliente: ver programaFicha
    var F = FichaICE;
    F.preparar(D);
    var $ = function (id) { return document.getElementById(id); };
    var esc = F.esc, r1 = F.r1, dec1 = F.dec1, plural = F.plural, celdaCalor = F.celdaCalor, falto = F.falto, TIPO = F.TIPO;
    var FARMER = '__farmer__';            // valor de la opción Farmer en la lista de jefaturas
    var CANAL_CORTO = { 'Home Market': 'HM', 'On Premise': 'OP' };   // columna Canal de las listas
    var CLAVE = 'MisClientesICE:' + D.unidad;
    var est = { g: '', j: '', r: '', dia: 'hoy', tab: 'p' };
    var vista = '', desdeLista = false, scrollLista = 0;
    var porSap = {};
    D.clientes.forEach(function (c, i) { porSap[c[0]] = i; });
    try {
      var g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (g && g.r) { est.g = g.g; est.j = g.j; est.r = g.r; }
    } catch (e) { /* sin almacenamiento local: se elige cada vez */ }

    function grupoDe(g) { return g === 'farmer' ? D.farmers : D.preventa; }
    function rutaSel() {
      var G = grupoDe(est.g);
      if (!G || !est.r) return null;
      for (var i = 0; i < G.rutas.length; i++) {
        var r = G.rutas[i];
        if (r.c === est.r && (est.g === 'farmer' || r.j === est.j)) return r;
      }
      return null;
    }
    function mostrar(id) {
      vista = id;
      ['vInicio', 'vLista', 'vFicha'].forEach(function (v) { $(v).hidden = v !== id; });
    }

    // ── Inicio: jefatura y ruta (o Farmer y su clave) ──
    function llenarRutas() {
      var jv = $('selJef').value, farmer = jv === FARMER;
      var lista = farmer ? D.farmers.rutas : jv ? D.preventa.rutas.filter(function (r) { return r.j === jv; }) : [];
      $('txtRuta').textContent = farmer ? '¿Cuál es tu clave de farmer?' : '¿Cuál es tu ruta?';
      $('selRuta').disabled = !jv;
      $('selRuta').innerHTML = '<option value="">' + (!jv ? 'Primero elige tu jefatura' : farmer ? 'Elige tu clave' : 'Elige tu ruta') + '</option>'
        + lista.map(function (r) { return '<option value="' + esc(r.c) + '">' + esc(r.c) + '</option>'; }).join('');
      if (est.r && lista.some(function (r) { return r.c === est.r; })) $('selRuta').value = est.r;
      $('btnEntrar').disabled = !$('selRuta').value;
    }
    function pintarInicio() {
      var jefs = D.preventa.jefaturas;
      $('selJef').innerHTML = '<option value="">Elige tu jefatura</option>'
        + jefs.map(function (j) { return '<option value="' + esc(j) + '">' + esc(j) + '</option>'; }).join('')
        + (D.farmers ? '<option value="' + FARMER + '">Farmer</option>' : '');
      var v = est.g === 'farmer' && D.farmers ? FARMER : jefs.indexOf(est.j) >= 0 ? est.j : '';
      $('selJef').value = v;
      llenarRutas();
    }
    $('selJef').addEventListener('change', llenarRutas);
    $('selRuta').addEventListener('change', function () { $('btnEntrar').disabled = !$('selRuta').value; });
    $('btnEntrar').addEventListener('click', function () {
      var jv = $('selJef').value;
      if (!jv || !$('selRuta').value) return;
      est.g = jv === FARMER ? 'farmer' : 'preventa';
      est.j = jv === FARMER ? '' : jv;
      est.r = $('selRuta').value;
      est.dia = 'hoy';
      est.tab = 'p';
      try { localStorage.setItem(CLAVE, JSON.stringify({ g: est.g, j: est.j, r: est.r })); } catch (e) { /* sin almacenamiento */ }
      if (location.hash === '#lista') navegar(); else location.hash = 'lista';
    });

    // ── Listas ──
    function filaCliente(i, ev) {
      var c = D.clientes[i], u = c[18], f = falto(u, true);
      var cal = ev ? celdaCalor(c[19][1]) : u ? dec1(u[2]) : '<span class="gris">—</span>';
      return '<a class="fila" href="#c-' + encodeURIComponent(c[0]) + '">'
        + '<span class="bola p' + c[2] + '" title="' + TIPO[c[2]] + '"></span>'
        + '<span class="sap">' + esc(c[0]) + '</span>'
        + '<span class="nom">' + esc(c[1] || 'Cliente sin nombre') + '</span>'
        + '<span class="can" title="' + esc(D.canales[c[11]] || 'Sin canal') + '">' + esc(CANAL_CORTO[D.canales[c[11]]] || '—') + '</span>'
        + '<span class="cal">' + cal + '</span>'
        + '<span class="falto' + (f.gris ? ' gris' : '') + '">' + esc(f.t) + '</span></a>';
    }
    function tabla(lista, ev) {
      return '<div class="tabla"><div class="fila enc" aria-hidden="true"><span></span><span>SAP</span><span>Cliente</span><span class="can">Canal</span>'
        + '<span class="cal">' + (ev ? 'ICE ' + esc(D.mes.slice(0, 3)) + '.' : 'Último ICE') + '</span><span>Le faltó</span></div>'
        + lista.map(function (i) { return filaCliente(i, ev); }).join('') + '</div>';
    }
    function pintarLista() {
      var R = rutaSel(), farmer = est.g === 'farmer', dia = D.dias[est.dia];
      if (!R) { location.hash = 'inicio'; return; }
      var cuando = est.dia === 'hoy' ? 'hoy' : 'mañana';
      var jefDia = farmer ? (R.jd[est.dia] || '') : R.j;
      $('quien').innerHTML = (farmer ? 'Farmer ' : 'Ruta ') + esc(R.c)
        + '<small>' + (farmer ? (jefDia ? 'Jefatura ' + esc(jefDia) + ' ' + cuando : 'Farmer') : 'Jefatura ' + esc(R.j)) + ' · ' + esc(D.unidad) + '</small>';
      var delDia = R[est.dia] || [];
      var orden = {};
      delDia.forEach(function (i, k) { orden[i] = k; });
      var pend = delDia.filter(function (i) { return !D.clientes[i][19]; });
      var ya = delDia.length - pend.length;
      var pri = pend.filter(function (i) { var p = D.clientes[i][2]; return p >= 1 && p <= 3; })
        .sort(function (a, b) { return (D.clientes[a][2] - D.clientes[b][2]) || (orden[a] - orden[b]); });
      var np = pend.filter(function (i) { return D.clientes[i][2] === 4; });
      var ev = R.ev.slice().sort(function (a, b) {
        var x = D.clientes[a][19][1], y = D.clientes[b][19][1];
        return ((x == null ? 999 : x) - (y == null ? 999 : y)) || String(D.clientes[a][1]).localeCompare(String(D.clientes[b][1]));
      });
      $('tab-p').innerHTML = '<b>' + pri.length + '</b>Prioridad 1, 2 y 3';
      $('tab-np').innerHTML = '<b>' + np.length + '</b>No prioritarios';
      $('tab-ev').innerHTML = '<b>' + ev.length + '</b>Ya evaluados este mes';
      ['p', 'np', 'ev'].forEach(function (t) { $('tab-' + t).setAttribute('aria-selected', t === est.tab ? 'true' : 'false'); });
      $('segDia').hidden = est.tab === 'ev';
      ['hoy', 'manana'].forEach(function (d) { $('dia-' + d).setAttribute('aria-pressed', d === est.dia ? 'true' : 'false'); });
      var nota = ya ? ' ' + (ya === 1 ? 'Otro cliente' : 'Otros ' + ya + ' clientes') + ' de ' + cuando + ' ya ' + (ya === 1 ? 'tiene' : 'tienen') + ' ICE en ' + esc(D.mes) + ': ' + (ya === 1 ? 'está' : 'están') + ' en «Ya evaluados este mes».' : '';
      var html = '', resumen = '';
      if (est.tab === 'p') {
        var n = [1, 2, 3].map(function (p) { return pri.filter(function (i) { return D.clientes[i][2] === p; }).length; });
        resumen = pri.length
          ? '<b>' + plural(pri.length, 'cliente') + '</b> prioridad 1, 2 y 3 que visitas ' + cuando + ' (' + esc(dia.dia.toLowerCase()) + ') y aún no ' + (pri.length === 1 ? 'tiene' : 'tienen') + ' ICE en ' + esc(D.mes) + ': ' + n[0] + ' P1 · ' + n[1] + ' P2 · ' + n[2] + ' P3.' + nota
          : '';
        html = pri.length ? tabla(pri, false)
          : '<p class="vacio">' + (delDia.length ? 'No te quedan clientes prioridad 1, 2 o 3 sin ICE ' + cuando + '.' + nota : 'Tu ' + (farmer ? 'recorrido' : 'ruta') + ' no tiene clientes ICE ' + cuando + ' (' + esc(dia.dia.toLowerCase()) + ').') + '</p>';
      } else if (est.tab === 'np') {
        resumen = np.length ? '<b>' + plural(np.length, 'cliente') + '</b> del universo ICE que ' + cuando + ' visitas y que no ' + (np.length === 1 ? 'tiene' : 'tienen') + ' ICE de ' + esc(D.prioridad.ventana) + ' (o nunca se ' + (np.length === 1 ? 'ha' : 'han') + ' evaluado).' : '';
        html = np.length ? tabla(np, false)
          : '<p class="vacio">' + (delDia.length ? 'No tienes clientes no prioritarios sin ICE ' + cuando + '.' : 'Tu ' + (farmer ? 'recorrido' : 'ruta') + ' no tiene clientes ICE ' + cuando + ' (' + esc(dia.dia.toLowerCase()) + ').') + '</p>';
      } else {
        var cals = ev.map(function (i) { return D.clientes[i][19][1]; }).filter(function (v) { return v != null; });
        var cuenta = [0, 0, 0];
        cals.forEach(function (v) { var r = r1(v); cuenta[r >= 85 ? 0 : r >= 70 ? 1 : 2]++; });
        var prom = cals.length ? cals.reduce(function (a, b) { return a + b; }, 0) / cals.length : null;
        resumen = ev.length
          ? '<b>Mis clientes ya evaluados este mes</b>: ' + plural(ev.length, 'cliente') + ' de tu ' + (farmer ? 'recorrido' : 'ruta') + ' (de cualquier día de visita) con ICE en ' + esc(D.mes) + (prom != null ? ', promedio <b>' + dec1(prom) + '</b>' : '') + '. De la calificación más baja a la más alta.'
            + '<span class="leyenda"><span><i style="background:rgb(40,140,60)"></i>85 o más · ' + cuenta[0] + '</span><span><i style="background:rgb(239,108,0)"></i>70 a 84.9 · ' + cuenta[1] + '</span><span><i style="background:#F40000"></i>Menos de 70 · ' + cuenta[2] + '</span></span>'
          : '';
        html = ev.length ? tabla(ev, true) : '<p class="vacio">Todavía no se evalúa en ICE ningún cliente de tu ' + (farmer ? 'recorrido' : 'ruta') + ' en ' + esc(D.mes) + '.</p>';
      }
      $('resumen').innerHTML = resumen;
      $('resumen').hidden = !resumen;
      $('tabla').innerHTML = html;
    }
    ['p', 'np', 'ev'].forEach(function (t) {
      $('tab-' + t).addEventListener('click', function () { est.tab = t; pintarLista(); });
    });
    ['hoy', 'manana'].forEach(function (d) {
      $('dia-' + d).addEventListener('click', function () { est.dia = d; pintarLista(); });
    });
    $('btnCambiar').addEventListener('click', function () { location.hash = 'inicio'; });

    // ── Ficha del cliente (programaFicha) ──
    function pintarFicha(sap) {
      $('vFicha').innerHTML = '<div class="nav"><button type="button" class="volver" id="btnVolver">‹ Volver a la lista</button></div>'
        + F.ficha(D.clientes[porSap[sap]]);
      $('btnVolver').addEventListener('click', function () {
        if (desdeLista) history.back();
        else location.hash = rutaSel() ? 'lista' : 'inicio';
      });
    }
    F.enlazar($('vFicha'));

    // ── Navegación con el # de la dirección (el botón Atrás del celular funciona) ──
    function navegar() {
      var h = decodeURIComponent(location.hash.replace(/^#/, ''));
      var antes = vista;
      if (h.indexOf('c-') === 0 && porSap.hasOwnProperty(h.slice(2))) {
        if (antes === 'vLista') scrollLista = window.pageYOffset || 0;
        desdeLista = antes === 'vLista';
        mostrar('vFicha');
        pintarFicha(h.slice(2));
        window.scrollTo(0, 0);
      } else if (h === 'lista' && rutaSel()) {
        mostrar('vLista');
        pintarLista();
        window.scrollTo(0, antes === 'vFicha' ? scrollLista : 0);
      } else {
        mostrar('vInicio');
        pintarInicio();
        window.scrollTo(0, 0);
      }
    }
    window.addEventListener('hashchange', navegar);
    navegar();
  }

  // Programa del «Buscador de clientes» (ES5, como la hoja): se escribe el SAP
  // (o parte del nombre), sale el nombre del cliente y con Entrar se abre su
  // ficha: tipo, dónde está, desglose ICE y el checklist de la submétrica que
  // más le quitó ya abierto
  function programaBuscador() {
    var D = JSON.parse(document.getElementById('datos').textContent);
    // Campos de cada cliente: ver programaFicha
    var F = FichaICE;
    F.preparar(D);
    var $ = function (id) { return document.getElementById(id); };
    var esc = F.esc;
    var CLAVE = 'BuscadorClientesICE:' + D.unidad;
    var MAX = 40, MAX_RECIENTES = 8;          // resultados a la vista y buscados hace poco
    var TACTIL = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var MODOS = {
      sap: { etiqueta: 'SAP del cliente', ayuda: 'Escribe el SAP', teclado: 'numeric' },
      nombre: { etiqueta: 'Nombre del cliente', ayuda: 'Escribe parte del nombre', teclado: 'text' }
    };
    var est = { modo: 'sap', sel: null };
    var vista = '', desdeBusqueda = false, scrollBusqueda = 0, ultimo = { q: '', lista: [], exacto: -1 };

    // Sin acentos, mayúsculas ni signos, para buscar por nombre
    function norm(s) {
      s = String(s == null ? '' : s).toLowerCase();
      if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return s.replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
    }
    // El SAP sin ceros a la izquierda (así da igual si se escriben)
    var sinCeros = function (s) { return String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, ''); };
    var porSap = {}, saps = [], nombres = [];
    D.clientes.forEach(function (c, i) { porSap[c[0]] = i; saps.push(sinCeros(c[0])); nombres.push(norm(c[1])); });
    var recientes = [];
    try {
      recientes = (JSON.parse(localStorage.getItem(CLAVE) || '[]') || []).filter(function (s) { return porSap.hasOwnProperty(s); });
    } catch (e) { /* sin almacenamiento local: no se recuerdan */ }
    function recordar(sap) {
      recientes = [sap].concat(recientes.filter(function (s) { return s !== sap; })).slice(0, MAX_RECIENTES);
      try { localStorage.setItem(CLAVE, JSON.stringify(recientes)); } catch (e) { /* sin almacenamiento */ }
    }

    // Resultados: primero el SAP exacto, luego los que empiezan con lo escrito y
    // (desde 3 cifras) los que lo traen en medio. Por nombre: todas las palabras
    // escritas, primero los que empiezan así
    function buscar(texto) {
      var r = { q: '', lista: [], exacto: -1 }, i;
      if (est.modo === 'sap') {
        var q = sinCeros(texto);
        r.q = q;
        if (!q) return r;
        var g = [[], [], []];
        for (i = 0; i < saps.length; i++) {
          var k = saps[i].indexOf(q);
          if (k < 0) continue;
          if (saps[i] === q) { if (r.exacto < 0) r.exacto = i; g[0].push(i); }
          else if (k === 0) g[1].push(i);
          else if (q.length >= 3) g[2].push(i);
        }
        var porNumero = function (a, b) { return (saps[a].length - saps[b].length) || (saps[a] < saps[b] ? -1 : saps[a] > saps[b] ? 1 : 0); };
        r.lista = g[0].concat(g[1].sort(porNumero), g[2].sort(porNumero));
      } else {
        var n = norm(texto);
        r.q = n;
        if (n.length < 2) return r;
        var pal = n.split(' '), h = [[], [], []];
        for (i = 0; i < nombres.length; i++) {
          var nom = nombres[i], ok = true;
          for (var p = 0; p < pal.length && ok; p++) ok = nom.indexOf(pal[p]) >= 0;
          if (!ok) continue;
          h[nom.indexOf(n) === 0 ? 0 : (' ' + nom).indexOf(' ' + pal[0]) >= 0 ? 1 : 2].push(i);
        }
        var alfabetico = function (a, b) { return nombres[a] < nombres[b] ? -1 : nombres[a] > nombres[b] ? 1 : 0; };
        r.lista = h[0].sort(alfabetico).concat(h[1].sort(alfabetico), h[2].sort(alfabetico));
      }
      return r;
    }

    // Marca en el SAP la parte que coincide con lo escrito
    function resaltar(sap, q) {
      var s = String(sap), k = q ? s.indexOf(q) : -1;
      if (k < 0) return esc(s);
      return esc(s.slice(0, k)) + '<mark>' + esc(s.slice(k, k + q.length)) + '</mark>' + esc(s.slice(k + q.length));
    }
    function detalle(c) {
      return [c[6], c[7] ? 'Ruta ' + c[7] : '', c[9] ? 'Farmer ' + c[9] : '', D.canales[c[11]] || '']
        .filter(function (x) { return x; }).map(esc).join(' · ');
    }
    function item(i, q) {
      var c = D.clientes[i];
      return '<li><a class="res-it" href="#c-' + encodeURIComponent(c[0]) + '" role="option" id="op-' + i + '" aria-selected="' + (i === est.sel ? 'true' : 'false') + '">'
        + '<span class="bola p' + c[2] + '" title="' + F.TIPO[c[2]] + '"></span>'
        + '<span class="res-sap">' + (q ? resaltar(c[0], q) : esc(c[0])) + '</span>'
        + '<span class="res-nom">' + esc(c[1] || 'Cliente sin nombre') + '<small>' + detalle(c) + '</small></span>'
        + '<span class="res-ir" aria-hidden="true">›</span></a></li>';
    }

    function pintarBusqueda() {
      var texto = $('q').value, r = buscar(texto), sap = est.modo === 'sap';
      ultimo = r;
      var vis = r.lista.slice(0, MAX);
      // El elegido: el que se marcó con las flechas, el SAP exacto o el único resultado
      if (est.sel == null || vis.indexOf(est.sel) < 0) est.sel = r.exacto >= 0 ? r.exacto : r.lista.length === 1 ? r.lista[0] : null;
      var el = $('elegido');
      if (est.sel != null) {
        var c = D.clientes[est.sel];
        el.className = 'elegido p' + c[2];
        el.innerHTML = '<span class="el-tipo"><span class="bola p' + c[2] + '"></span>' + esc(F.TIPO[c[2]]) + '</span>'
          + '<b>' + esc(c[1] || 'Cliente sin nombre') + '</b><small>SAP ' + esc(c[0]) + (detalle(c) ? ' · ' + detalle(c) : '') + '</small>';
      } else {
        el.className = 'elegido nada';
        el.innerHTML = '<span>' + (!r.q
          ? (sap ? 'Escribe el SAP: aquí sale el nombre del cliente.' : 'Escribe al menos 2 letras del nombre.')
          : !r.lista.length
            ? (sap ? 'No hay ningún cliente con el SAP <b>' + esc(r.q) + '</b>' : 'No hay ningún cliente que se llame así') + ' en ' + esc(D.unidad) + '.'
            : 'Hay <b>' + F.plural(r.lista.length, 'cliente') + '</b> ' + (sap ? (r.lista.length === 1 ? 'que tiene' : 'que tienen') + ' esas cifras' : 'con ese nombre')
              + ': toca el tuyo en la lista' + (sap ? ' o termina de escribir el SAP' : ' o escribe más') + '.') + '</span>';
      }
      $('btnEntrar').disabled = est.sel == null;
      $('btnLimpiar').hidden = !texto;

      // Lista: los resultados (si hay más de uno) o, sin nada escrito, los buscados hace poco
      var html = '';
      if (!r.q) {
        if (recientes.length) {
          html = '<h3 class="res-tit">Buscados hace poco</h3><ul class="res" role="listbox" aria-label="Buscados hace poco">'
            + recientes.map(function (s) { return item(porSap[s], ''); }).join('') + '</ul>'
            + '<button type="button" class="borrar" id="btnBorrar">Borrar esta lista</button>';
        }
      } else if (r.lista.length > 1) {
        html = '<ul class="res" role="listbox" aria-label="Clientes encontrados">' + vis.map(function (i) { return item(i, sap ? r.q : ''); }).join('') + '</ul>'
          + (r.lista.length > MAX ? '<p class="res-mas">Y ' + F.plural(r.lista.length - MAX, 'cliente') + ' más: escribe más para encontrarlo.</p>' : '');
      }
      $('resultados').innerHTML = html;
    }

    function entrar() {
      if (est.sel != null) location.hash = 'c-' + encodeURIComponent(D.clientes[est.sel][0]);
    }
    function ponerModo(m) {
      est.modo = m;
      est.sel = null;
      var M = MODOS[m];
      $('txtQ').textContent = M.etiqueta;
      $('q').setAttribute('inputmode', M.teclado);
      $('q').setAttribute('placeholder', M.ayuda);
      $('q').value = '';
      ['sap', 'nombre'].forEach(function (x) { $('modo-' + x).setAttribute('aria-pressed', x === m ? 'true' : 'false'); });
      pintarBusqueda();
    }
    $('fBuscar').addEventListener('submit', function (ev) { ev.preventDefault(); entrar(); });
    $('q').addEventListener('input', function () { est.sel = null; pintarBusqueda(); });
    $('q').addEventListener('keydown', function (ev) {
      var k = ev.key || ev.keyCode, abajo = k === 'ArrowDown' || k === 'Down' || k === 40, arriba = k === 'ArrowUp' || k === 'Up' || k === 38;
      var vis = ultimo.lista.slice(0, MAX);
      if (!(abajo || arriba) || vis.length < 2) return;
      ev.preventDefault();
      var p = vis.indexOf(est.sel);
      est.sel = vis[p < 0 ? (abajo ? 0 : vis.length - 1) : Math.max(0, Math.min(vis.length - 1, p + (abajo ? 1 : -1)))];
      pintarBusqueda();
      var op = $('op-' + est.sel);
      if (op && op.scrollIntoView) op.scrollIntoView({ block: 'nearest' });
    });
    $('btnLimpiar').addEventListener('click', function () { $('q').value = ''; est.sel = null; pintarBusqueda(); $('q').focus(); });
    $('modo-sap').addEventListener('click', function () { ponerModo('sap'); $('q').focus(); });
    $('modo-nombre').addEventListener('click', function () { ponerModo('nombre'); $('q').focus(); });
    $('resultados').addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'btnBorrar') {
        recientes = [];
        try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
        pintarBusqueda();
      }
    });

    // ── Ficha del cliente (programaFicha) ──
    function pintarFicha(sap) {
      $('vFicha').innerHTML = '<div class="nav"><button type="button" class="volver" id="btnVolver">‹ Buscar otro cliente</button></div>'
        + F.ficha(D.clientes[porSap[sap]], { ubicacion: true, tipos: true, abrirPeor: true });
      F.abrirPeor($('vFicha'));
      $('btnVolver').addEventListener('click', function () {
        if (desdeBusqueda) history.back();
        else location.hash = 'buscar';
      });
    }
    F.enlazar($('vFicha'));

    // ── Navegación con el # de la dirección (el botón Atrás del celular funciona) ──
    function mostrar(id) {
      vista = id;
      ['vBuscar', 'vFicha'].forEach(function (v) { $(v).hidden = v !== id; });
    }
    function navegar() {
      var h = decodeURIComponent(location.hash.replace(/^#/, ''));
      var antes = vista;
      if (h.indexOf('c-') === 0 && porSap.hasOwnProperty(h.slice(2))) {
        if (antes === 'vBuscar') scrollBusqueda = window.pageYOffset || 0;
        desdeBusqueda = antes === 'vBuscar';
        recordar(h.slice(2));
        mostrar('vFicha');
        pintarFicha(h.slice(2));
        window.scrollTo(0, 0);
      } else {
        mostrar('vBuscar');
        pintarBusqueda();
        window.scrollTo(0, antes === 'vFicha' ? scrollBusqueda : 0);
      }
    }
    window.addEventListener('hashchange', navegar);
    navegar();
    if (vista === 'vBuscar' && !TACTIL) $('q').focus();
  }

  // ── Datos de las hojas ────────────────────────────────────────────────
  // Lo que comparten las dos hojas y el armado de cada cliente (ver el orden
  // de los campos en programaFicha)
  const CORTO_HOJA = { precio: 'Com. de precios', plataformas: 'Act. plataformas' };
  function baseHoja(D) {
    const porSap = new Map(D.clientes.map(c => [c[0], c]));
    const delMes = new Map(D.evaluados.map(e => [e[0], e]));
    const indice = new Map(), clientes = [];
    const limpio = v => String(v == null ? '' : v).trim();
    const epica = (m, sap) => { const e = m && m[sap]; return e ? [e[0], e[1], e[2] ? 1 : 0, e[3] ? 1 : 0] : 0; };
    // lat y lon: coordenadas de la Master Data para quien no las tiene en el universo
    function cliente(sap, lat, lon) {
      if (indice.has(sap)) return indice.get(sap);
      const c = porSap.get(sap), e = delMes.get(sap);
      if (!c && !e) return -1;
      // La del mes si ya se evaluó (igual que la ficha del mapa)
      const ult = e ? [e[5], e[4], e[6], e[7], e[8], e[9], e[16] || '', e[17] || ''] : (c[17] || 0);
      const mes = e ? [e[5], e[6], e[13] || '', e[12] || ''] : 0;
      const ep = [epica(D.epica, sap), epica(D.epica_preventa, sap), epica(D.epica_farmers, sap)];
      const r = c
        ? [sap, c[1] || '', c[4], c[2], c[3], c[13] || '', D.zonas[c[5]] || '', limpio(c[6]), c[7] || '', c[19] || '', c[20] || '',
           c[18] != null ? c[18] : (ult ? ult[1] : null), c[9], c[8], c[14] || 0, c[15] || 0, c[16] || 0, c[12], ult, mes, ep,
           c[10] || '', c[11], c[21], c[22]]
        : [sap, e[1] || '', e[11] || 0, e[2], e[3], '', D.zonas[e[10]] || '', limpio(e[14]), '', e[15] || '', '',
           e[4], null, null, 0, 0, 0, null, ult, mes, ep, '', null, null, null];
      if (r[3] == null && lat != null) { r[3] = lat; r[4] = lon; }
      indice.set(sap, clientes.length);
      clientes.push(r);
      return clientes.length - 1;
    }
    const comunes = {
      unidad: D.unidad, mes: D.mes, generado: D.generado, corte: D.corte ? D.corte.texto : '',
      prioridad: { mes_anterior: D.prioridad.mes_anterior, meses_ventana: D.prioridad.meses_ventana, ventana: D.prioridad.ventana },
      metricas: D.metricas.map(m => [m.nombre, CORTO_HOJA[m.id] || m.nombre, Ice.util.svgIcono(m.id)]),
      canales: D.canales.map(n => n === 'Traditional' ? 'Home Market' : n),   // como las pestañas del sitio
      pesos: D.canales.map(n => (D.desglose && D.desglose.pesos && D.desglose.pesos[n]) || []),
    };
    return { cliente, clientes, comunes, porSap, limpio };
  }

  // «Mis clientes ICE»: los clientes ICE de las rutas de preventa y de los
  // farmers de hoy y de mañana, más los ya evaluados en el mes (de cualquier día)
  function datosHoja(D) {
    const { cliente, clientes, comunes, porSap, limpio } = baseHoja(D);
    // R = rutas de hoy y mañana (D.rutas o D.farmers), S = las de la semana
    // (para tener todas las rutas y la jefatura de cada una), rutaEv = ruta de
    // un cliente evaluado en el mes
    function grupo(R, S, rutaEv) {
      if (!R) return null;
      const rutas = new Map();
      const de = codigo => {
        if (!rutas.has(codigo)) rutas.set(codigo, { c: codigo, jd: {}, cuenta: {}, hoy: [], manana: [], ev: [] });
        return rutas.get(codigo);
      };
      for (const d of ['hoy', 'manana']) {
        for (const r of R[d].rutas) {
          const x = de(r.codigo);
          x.jd[d] = r.jefatura || '';
          x[d] = r.puntos.filter(p => p[4]).map(p => cliente(p[2], p[0], p[1])).filter(i => i >= 0);
        }
      }
      for (const dd of (S && S.dias) || []) {
        const filas = dd.rutas ? dd.rutas.map(f => [(S.rutas[f[0]] || {}).codigo, f[1]]) : (dd.ice || []);
        for (const [codigo, jef] of filas) {
          if (!codigo) continue;
          const x = de(codigo);
          if (jef) x.cuenta[jef] = (x.cuenta[jef] || 0) + 1;
        }
      }
      for (const e of D.evaluados) {
        const codigo = rutaEv(e);
        if (codigo && rutas.has(codigo)) rutas.get(codigo).ev.push(cliente(e[0]));
      }
      const lista = [...rutas.values()].map(x => {
        const comun = Object.keys(x.cuenta).sort((a, b) => x.cuenta[b] - x.cuenta[a] || a.localeCompare(b))[0];
        return { c: x.c, j: x.jd.hoy || x.jd.manana || comun || 'Sin jefatura', jd: x.jd, hoy: x.hoy, manana: x.manana, ev: x.ev };
      }).sort((a, b) => a.c.localeCompare(b.c, 'es', { numeric: true }));
      return { rutas: lista, jefaturas: [...new Set(lista.map(r => r.j))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })) };
    }
    // Ruta del cliente evaluado: la de la Master Data (elementos 14 y 15 de
    // cada evaluado); con datos de antes, la del universo ICE
    const preventa = grupo(D.rutas, D.rutas_semana, e => limpio(e[14] != null ? e[14] : (porSap.get(e[0]) || [])[6]));
    const farmers = grupo(D.farmers, D.farmers_semana, e => limpio(e[15] != null ? e[15] : (porSap.get(e[0]) || [])[19]));
    const dia = R => ({ dia: R.dia, fecha: R.fecha, texto: R.texto });
    return {
      ...comunes,
      dias: { hoy: dia(D.rutas.hoy), manana: dia(D.rutas.manana) },
      preventa, farmers, clientes,
      checklist: D.checklist || null,     // reglas del checklist ICE (Programas/checklist_ice.py)
    };
  }

  // «Buscador de clientes»: todos los clientes del universo ICE de la unidad
  // más los evaluados en el mes que no están en él
  function datosBuscador(D) {
    const { cliente, clientes, comunes } = baseHoja(D);
    // Primero los evaluados, con las coordenadas de la Master Data por si el universo no las trae
    for (const e of D.evaluados) cliente(e[0], e[2], e[3]);
    for (const c of D.clientes) cliente(c[0]);
    return {
      ...comunes,
      tipos: D.prioridad.tipos,           // qué es cada tipo de cliente (bajo el nombre en la ficha)
      clientes,
      checklist: D.checklist || null,
    };
  }

  // JSON dentro de <script>: solo hay que cuidar "<" (cierre de etiqueta) y los separadores de línea de JS
  const jsonEnScript = datos => JSON.stringify(datos).replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

  // «¿Qué es cada tipo de cliente?» de las dos hojas
  function tiposHoja(D) {
    const P = D.prioridad;
    return `<details class="tipos"><summary>¿Qué es cada tipo de cliente?</summary><p class="nota">${esc(P.formula)}</p><dl>
${[[1, 'Prioridad 1'], [2, 'Prioridad 2'], [3, 'Prioridad 3'], [4, 'No prioritario']].map(([p, nombre]) => {
      const t = P.tipos[p];
      return `      <dt><span class="bola p${p}"></span>${nombre}</dt><dd><b>${esc(t[0])}</b>${t[1] ? `: ${esc(t[1])}` : ''} (${esc(t[2])}).${p === 4 ? ` El tipo se fija al iniciar ${esc(D.mes)}: uno que se evalúa por primera vez este mes sigue como no prioritario.` : ''}</dd>`;
    }).join('\n')}
    </dl>`;
  }
  // Encabezado del archivo (hasta <body>) y pie con los programas
  const cabezaHoja = (titulo, css) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#F40000">
<title>${titulo}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap">
<style>${css}</style>
</head>
<body>`;
  const pieHoja = (datos, programa) => `<footer class="pie"><span>Brigadas VDM · ICE</span><span>Uso interno</span></footer>
<script type="application/json" id="datos">${jsonEnScript(datos)}</script>
<script>var IceChecklist = (${programaChecklist.toString()})();</script>
<script>var FichaICE = (${programaFicha.toString()})();</script>
<script>(${programa.toString()})();</script>
</body>
</html>
`;

  function htmlHoja(D) {
    const datos = datosHoja(D);
    const H = D.rutas.hoy, M = D.rutas.manana;
    const diaCorto = R => `${R.dia} ${Number(R.fecha.slice(8, 10))}`;
    return `${cabezaHoja(`Mis clientes ICE · ${esc(D.unidad)} · ${esc(H.fecha)}`, CSS_HOJA + IceChecklist.css)}
<header class="cab">
  <p class="kicker">Brigadas VDM · ICE</p>
  <h1>Mis clientes ICE.<br>${esc(D.unidad)}</h1>
  <p class="sub">Datos publicados el ${esc(D.generado)}${D.corte ? ` · corte ICE al ${esc(D.corte.texto)}` : ''}</p>
</header>
<main>
  <section id="vInicio" class="inicio" hidden>
    <h2>¿Quién eres?</h2>
    <p class="ayuda">Elige tu <b>jefatura</b> y tu <b>ruta</b> para ver tus clientes ICE de hoy y de mañana. Si eres farmer, en jefatura elige <b>Farmer</b> y luego tu clave.</p>
    <label class="campo">¿De qué jefatura eres?<select id="selJef"></select></label>
    <label class="campo"><span id="txtRuta">¿Cuál es tu ruta?</span><select id="selRuta"></select></label>
    <button type="button" class="entrar" id="btnEntrar" disabled>Entrar</button>
  </section>
  <section id="vLista" hidden>
    <div class="nav"><button type="button" class="volver" id="btnCambiar">‹ Cambiar ruta</button></div>
    <h2 class="quien" id="quien"></h2>
    <div class="tabs" role="tablist" aria-label="Listas">
      <button type="button" role="tab" id="tab-p" aria-controls="tabla"></button>
      <button type="button" role="tab" id="tab-np" aria-controls="tabla"></button>
      <button type="button" role="tab" id="tab-ev" aria-controls="tabla"></button>
    </div>
    <div class="seg" id="segDia" role="group" aria-label="Día">
      <button type="button" id="dia-hoy" aria-pressed="true">Hoy · ${esc(diaCorto(H))}</button>
      <button type="button" id="dia-manana" aria-pressed="false">Mañana · ${esc(diaCorto(M))}</button>
    </div>
    <p class="resumen" id="resumen"></p>
    <div id="tabla" role="tabpanel"></div>
    ${tiposHoja(D)}
    <p class="nota">Canal: <b>HM</b> = Home Market, <b>OP</b> = On Premise. «Le faltó» es la submétrica que más puntos le quitó en su última evaluación ICE. Las pestañas de prioridad y de no prioritarios solo traen a los clientes que todavía no tienen ICE en ${esc(D.mes)}, en el orden de tu ruta; los ya evaluados están en la tercera pestaña, con su calificación del mes: verde 85 o más, naranja de 70 a 84.9 y rojo menos de 70. Toca un cliente para ver su ficha.</p></details>
    <p class="nota">Este archivo es una foto del ${esc(D.generado)}: descárgalo de nuevo cada día.</p>
  </section>
  <section id="vFicha" hidden></section>
</main>
${pieHoja(datos, programaHoja)}`;
  }

  // Estilos propios del buscador (lo demás es CSS_HOJA)
  const CSS_BUSCADOR = `
.buscar{max-width:560px;padding-top:22px}
.buscar h2{font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.buscar .ayuda{margin-top:8px;font-size:14px;line-height:1.5;color:#333}
.buscar .seg{margin-top:16px}
.caja-q{position:relative;display:flex;border:2px solid #000;background:#fff}
.caja-q:focus-within{border-color:#F40000;box-shadow:0 0 0 1px #F40000}
.caja-q input{flex:1;min-width:0;min-height:60px;padding:10px 14px;font:inherit;font-size:24px;font-weight:800;letter-spacing:.03em;font-variant-numeric:tabular-nums;border:0;border-radius:0;background:transparent;color:#000;-webkit-appearance:none;appearance:none}
.caja-q input:focus{outline:none}
.caja-q input::placeholder{font-size:17px;font-weight:600;letter-spacing:0;color:#8C8C8C}
.limpiar{flex:none;width:56px;border:0;border-left:2px solid #E0E0E0;background:#fff;font-size:26px;line-height:1;color:#4D4D4D;cursor:pointer}
.elegido{min-height:64px;margin-top:12px;padding:11px 14px;background:#F4F4F4;border-left:6px solid #000;font-size:13.5px;line-height:1.45}
.elegido.p1{border-left-color:#F40000;background:#FFE5E5}
.elegido.p3{border-left-color:#4D4D4D}
.elegido.p4,.elegido.p0{border-left-color:#BDBDBD}
.elegido.nada{display:flex;align-items:center;color:#4D4D4D}
.elegido b{display:block;margin-top:4px;font-size:19px;font-weight:800;line-height:1.2;color:#000}
.elegido small{display:block;margin-top:3px;font-size:12.5px;color:#4D4D4D}
.elegido.nada b{display:inline;margin:0;font-size:inherit}
.el-tipo{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.buscar .entrar{margin-top:12px}
.res-tit{margin-top:22px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#4D4D4D}
.res{list-style:none;margin:10px 0 0;padding:0;border-top:2px solid #000}
.res-it{display:grid;grid-template-columns:14px 7.4em minmax(0,1fr) 12px;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid #E0E0E0;font-size:13.5px;line-height:1.3;color:#000;text-decoration:none;-webkit-tap-highlight-color:rgba(0,0,0,.08)}
.res-it:hover{background:#F6F6F6}
.res-it[aria-selected="true"]{background:#FFE5E5;box-shadow:inset 5px 0 0 #F40000}
.res-sap{font-weight:700;font-variant-numeric:tabular-nums}
.res-sap mark{background:#FFD54F;color:inherit}
.res-nom{font-weight:700;min-width:0;word-break:break-word}
.res-nom small{display:block;margin-top:2px;font-size:11.5px;font-weight:600;color:#6E6E6E}
.res-ir{font-size:20px;font-weight:800;color:#8C8C8C}
.res-mas{margin-top:10px;font-size:12.5px;color:#4D4D4D}
.borrar{margin-top:10px;padding:6px 0;border:0;background:none;font-size:12px;font-weight:700;text-decoration:underline;color:#4D4D4D;cursor:pointer}
.f-desc{margin-top:8px;font-size:12.5px;line-height:1.45}
@media (max-width:440px){
.res-it{grid-template-columns:12px 6.6em minmax(0,1fr) 10px;gap:8px;padding:10px 2px;font-size:13px}
.caja-q input{font-size:21px}
}
@media print{.buscar .seg,.caja-q,.buscar .entrar{display:none!important}}
`;

  function htmlBuscador(D) {
    const datos = datosBuscador(D);
    const fuera = datos.clientes.length - D.clientes.length;
    return `${cabezaHoja(`Buscador de clientes · ${esc(D.unidad)} · ${esc(D.rutas.hoy.fecha)}`, CSS_HOJA + CSS_BUSCADOR + IceChecklist.css)}
<header class="cab">
  <p class="kicker">Brigadas VDM · ICE</p>
  <h1>Buscador de clientes.<br>${esc(D.unidad)}</h1>
  <p class="sub">Datos publicados el ${esc(D.generado)}${D.corte ? ` · corte ICE al ${esc(D.corte.texto)}` : ''}</p>
</header>
<main>
  <section id="vBuscar" class="buscar" hidden>
    <h2>¿Qué cliente buscas?</h2>
    <p class="ayuda">Escribe el <b>SAP</b> del cliente: aparece su nombre y con <b>Entrar</b> ves su tipo de cliente, dónde está, cómo le fue en su evaluación ICE y el <b>checklist</b> de lo que hay que corregir.</p>
    <div class="seg" role="group" aria-label="Buscar por">
      <button type="button" id="modo-sap" aria-pressed="true">Por SAP</button>
      <button type="button" id="modo-nombre" aria-pressed="false">Por nombre</button>
    </div>
    <form id="fBuscar" role="search" autocomplete="off" novalidate>
      <label class="campo" for="q"><span id="txtQ">SAP del cliente</span></label>
      <div class="caja-q" style="margin-top:6px">
        <input id="q" type="text" inputmode="numeric" enterkeyhint="go" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Escribe el SAP" aria-describedby="elegido" aria-controls="resultados">
        <button type="button" class="limpiar" id="btnLimpiar" aria-label="Borrar lo escrito" hidden>×</button>
      </div>
      <div class="elegido nada" id="elegido" role="status" aria-live="polite"></div>
      <button type="submit" class="entrar" id="btnEntrar" disabled>Entrar</button>
    </form>
    <div id="resultados"></div>
    ${tiposHoja(D)}
    <p class="nota">Aquí están los <b>${num(D.clientes.length)}</b> clientes del universo ICE de ${esc(D.unidad)}${fuera > 0 ? ` y ${num(fuera)} ${fuera === 1 ? 'cliente evaluado' : 'clientes evaluados'} en ${esc(D.mes)} que no están en él` : ''}. En la ficha, el desglose es el de su evaluación ICE más reciente (la de ${esc(D.mes)} si ya se evaluó); toca cualquier barra para ver su checklist. La bolita es el tipo de cliente: roja prioridad 1, negra prioridad 2, blanca prioridad 3 y gris no prioritario o fuera del universo.</p></details>
    <p class="nota">Este archivo es una foto del ${esc(D.generado)}: descárgalo de nuevo cada día.</p>
  </section>
  <section id="vFicha" hidden></section>
</main>
${pieHoja(datos, programaBuscador)}`;
  }

  function descargarHoja(D) {
    const html = htmlHoja(D);
    Archivos.descargar(new Blob([html], { type: 'text/html;charset=utf-8' }), `MisClientesICE_${D.unidad}_${D.rutas.hoy.fecha}.html`);
    return html.length;
  }

  function descargarBuscador(D) {
    const html = htmlBuscador(D);
    Archivos.descargar(new Blob([html], { type: 'text/html;charset=utf-8' }), `BuscadorClientesICE_${D.unidad}_${D.rutas.hoy.fecha}.html`);
    return html.length;
  }

  return { cinetica, descargarHoja, descargarBuscador, htmlHoja, htmlBuscador, htmlInfo };
})();
