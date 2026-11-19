/* Reporte ICE: información del sistema, pestaña Cinética y hoja descargable
 * "Mis clientes ICE".
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
 * tiene lo ve) con los clientes ICE de las rutas de hoy y de mañana; se elige
 * jefatura y ruta y lista prioridad 1, 2 y 3 con lo que les faltó en su última
 * evaluación; los no prioritarios (nunca evaluados) van en otra pestaña. Se arma
 * en el navegador con los datos ya descifrados. */
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
    ];
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
        </table></div></section>`;
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
  // Estilos y programa de la hoja (van dentro del archivo: no carga nada de este sitio)
  const CSS_HOJA = `
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;font-family:"Montserrat","Gotham","Helvetica Neue",Arial,sans-serif;background:#fff;color:#000;-webkit-text-size-adjust:100%}
h1,h2,p{margin:0}
button,select{font:inherit}
:focus-visible{outline:3px solid #000;outline-offset:2px}
.cab{background:#F40000;color:#fff;padding:22px clamp(16px,4vw,48px) 26px}
.kicker{font-size:11px;font-weight:600;letter-spacing:.3em;text-transform:uppercase}
.cab h1{margin-top:10px;font-size:clamp(26px,6vw,44px);font-weight:800;line-height:1.02;text-transform:uppercase;letter-spacing:-.01em}
.cab p.sub{margin-top:10px;font-size:13.5px;line-height:1.5}
.cuerpo{padding:18px clamp(16px,4vw,48px) 30px;max-width:1100px}
.elige{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px 16px;align-items:end}
.elige label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.elige select{min-height:50px;padding:10px 12px;font-size:16px;font-weight:700;border:2px solid #000;border-radius:0;background:#fff;color:#000}
.elige select:focus{border-color:#F40000}
.seg{display:inline-flex;border:2px solid #000}
.seg button{min-height:46px;padding:8px 16px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#fff;color:#000;border:0;border-radius:0;cursor:pointer}
.seg button+button{border-left:2px solid #000}
.seg button[aria-pressed="true"],.seg button[aria-selected="true"]{background:#000;color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}
.kpi{background:#F4F4F4;border-top:4px solid #000;padding:12px 14px}
.kpi.rojo{border-top-color:#F40000}
.kpi p{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#4D4D4D}
.kpi b{display:block;margin-top:4px;font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}
.tabs{display:flex;flex-wrap:wrap;margin-top:6px}
.tabs .seg button{min-height:48px}
.grupo{margin-top:22px}
.grupo h2{display:flex;align-items:center;gap:12px;padding-left:12px;border-left:6px solid #F40000;font-size:17px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
.grupo h2 small{font-size:12px;font-weight:600;color:#4D4D4D;text-transform:none;letter-spacing:0}
.lista{list-style:none;margin:10px 0 0;padding:0;border-top:2px solid #000}
.cli{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:12px 4px;border-bottom:1px solid #C8C8C8;break-inside:avoid}
.cli .nom{font-size:15.5px;font-weight:800;line-height:1.25}
.cli .dat{font-size:12.5px;color:#4D4D4D;margin-top:3px;line-height:1.5}
.cli .dat b{color:#000;font-variant-numeric:tabular-nums}
.falto{grid-column:1/-1;margin-top:6px;padding:8px 10px;background:#F4F4F4;border-left:4px solid #000;font-size:13.5px;line-height:1.45}
.falto.pierde{border-left-color:#F40000}
.falto b{font-weight:800}
.ice{align-self:start;min-width:64px;padding:6px 8px;text-align:center;border:2px solid #000;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.ice small{display:block;font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#4D4D4D}
.tag{display:inline-block;margin-left:8px;padding:1px 7px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:2px;background:#000;color:#fff}
.tag.r{background:#F40000}
.cli a{color:#000;font-weight:700}
.vacio{margin-top:16px;padding:16px;background:#F4F4F4;border-left:6px solid #000;font-size:14px;line-height:1.5}
.nota{margin-top:22px;font-size:12px;line-height:1.55;color:#4D4D4D}
.pie{display:flex;justify-content:space-between;gap:12px;margin:26px clamp(16px,4vw,48px) 20px;padding-top:12px;border-top:1px solid #8C8C8C;font-size:10.5px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#4D4D4D}
@media print{.elige,.tabs,.seg{display:none!important}.cab{-webkit-print-color-adjust:exact;print-color-adjust:exact}.cuerpo{max-width:none}}
`;

  // Programa de la hoja: se guarda como texto y corre dentro del archivo descargado
  function programaHoja() {
    var D = JSON.parse(document.getElementById('datos').textContent);
    var $ = function (id) { return document.getElementById(id); };
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
    var PRIO = { 1: 'Prioridad 1', 2: 'Prioridad 2', 3: 'Prioridad 3' };
    var estado = { dia: 'hoy', jef: '', ruta: '', tab: 'ice' };
    var ddmm = function (f) { return f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : ''; };

    function rutasDe() {
      return D.dias[estado.dia].rutas.filter(function (r) { return !estado.jef || r.jefatura === estado.jef; });
    }
    function llenar() {
      var dia = D.dias[estado.dia];
      var jefs = [];
      dia.rutas.forEach(function (r) { if (jefs.indexOf(r.jefatura) < 0) jefs.push(r.jefatura); });
      jefs.sort();
      if (jefs.indexOf(estado.jef) < 0) estado.jef = '';
      $('jef').innerHTML = '<option value="">Elige tu jefatura</option>' + jefs.map(function (j) {
        return '<option value="' + esc(j) + '"' + (j === estado.jef ? ' selected' : '') + '>' + esc(j || 'Sin jefatura') + '</option>';
      }).join('');
      var rutas = rutasDe();
      if (!(estado.ruta === '*' && estado.jef) && !rutas.some(function (r) { return r.codigo === estado.ruta; })) estado.ruta = '';
      $('ruta').disabled = !estado.jef;
      $('ruta').innerHTML = '<option value="">' + (estado.jef ? 'Elige tu ruta' : 'Primero elige tu jefatura') + '</option>'
        + (estado.jef ? '<option value="*"' + (estado.ruta === '*' ? ' selected' : '') + '>Todas las rutas de ' + esc(estado.jef) + '</option>' : '')
        + rutas.map(function (r) {
          return '<option value="' + esc(r.codigo) + '"' + (r.codigo === estado.ruta ? ' selected' : '') + '>' + esc(r.codigo) + ' · ' + r.clientes.length + ' ICE</option>';
        }).join('');
    }
    function tarjeta(c, conRuta) {
      // c = [sap, nombre, prioridad, lo que le faltó, puntos, ICE, fecha, canal, evaluado en el mes, lat, lon, ruta]
      var falto = c[6]
        ? (c[3] ? '<div class="falto pierde">Le faltó: <b>' + esc(c[3]) + '</b>' + (c[4] != null ? ' (le quitó ' + c[4].toFixed(1) + ' puntos)' : '') + '</div>'
                : '<div class="falto">En su última evaluación <b>no perdió puntos</b> en ninguna submétrica.</div>')
        : '<div class="falto">Nunca se ha evaluado en ICE: no hay datos de qué le falta.</div>';
      return '<li class="cli"><div><p class="nom">' + esc(c[1] || 'Cliente ' + c[0])
        + (c[8] ? '<span class="tag">Ya evaluado en ' + esc(D.mes) + '</span>' : '') + '</p>'
        + '<p class="dat">SAP <b>' + esc(c[0]) + '</b>' + (conRuta ? ' · Ruta <b>' + esc(c[11]) + '</b>' : '')
        + (c[6] ? ' · Última evaluación: ' + esc(ddmm(c[6])) + ' · ' + esc(c[7]) : '')
        + (c[9] != null ? ' · <a href="https://www.google.com/maps/search/?api=1&query=' + c[9] + ',' + c[10] + '" target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>' : '')
        + '</p></div>'
        + (c[5] != null ? '<div class="ice"><small>ICE</small>' + c[5].toFixed(1) + '</div>' : '<div></div>')
        + falto + '</li>';
    }
    function pintar() {
      llenar();
      var dia = D.dias[estado.dia];
      $('diaTexto').textContent = dia.texto;
      var cuerpo = $('lista');
      if (!estado.jef || !estado.ruta) {
        $('kpis').innerHTML = '';
        $('tabs').hidden = true;
        cuerpo.innerHTML = '<p class="vacio">' + (dia.rutas.length
          ? 'Elige tu <b>jefatura</b> y después tu <b>ruta</b> para ver los clientes ICE que te tocan ' + (estado.dia === 'hoy' ? 'hoy' : 'mañana') + '.'
          : 'No hay rutas con clientes ICE para ese día.') + '</p>';
        return;
      }
      var todas = estado.ruta === '*';
      var clientes = [];
      rutasDe().forEach(function (r) {
        if (todas || r.codigo === estado.ruta) r.clientes.forEach(function (c) { clientes.push(c.concat([r.codigo])); });
      });
      // Los no prioritarios (nunca evaluados antes de este mes) van en su propia pestaña
      var sinEval = clientes.filter(function (c) { return c[2] === 4; });
      var conIce = clientes.filter(function (c) { return c[2] !== 4; });
      var n = function (p) { return conIce.filter(function (c) { return c[2] === p; }).length; };
      $('kpis').innerHTML = [['Prioridad 1', n(1), 1], ['Prioridad 2', n(2), 0], ['Prioridad 3', n(3), 0], ['No prioritarios', sinEval.length, 0]]
        .map(function (k) { return '<div class="kpi' + (k[2] ? ' rojo' : '') + '"><p>' + k[0] + '</p><b>' + k[1] + '</b></div>'; }).join('');
      $('tabs').hidden = false;
      if (estado.tab === 'sin' && !sinEval.length) estado.tab = 'ice';
      $('tabIce').textContent = 'Prioridad 1, 2 y 3 (' + conIce.length + ')';
      $('tabSin').textContent = 'No prioritarios (' + sinEval.length + ')';
      $('tabSin').disabled = !sinEval.length;
      $('tabIce').setAttribute('aria-selected', estado.tab === 'ice');
      $('tabSin').setAttribute('aria-selected', estado.tab === 'sin');
      var orden = function (a, b) { return (a[8] - b[8]) || String(a[11]).localeCompare(String(b[11])) || String(a[1]).localeCompare(String(b[1])); };
      var html = '';
      if (estado.tab === 'ice') {
        [1, 2, 3].forEach(function (p) {
          var lista = conIce.filter(function (c) { return c[2] === p; }).sort(orden);
          if (!lista.length) return;
          var ya = lista.filter(function (c) { return c[8]; }).length;
          html += '<section class="grupo"><h2>' + PRIO[p] + ' <small>' + lista.length + (lista.length === 1 ? ' cliente' : ' clientes')
            + (ya ? ' · ' + ya + ' ya con ICE en ' + esc(D.mes) : '') + '</small></h2><ul class="lista">'
            + lista.map(function (c) { return tarjeta(c, todas); }).join('') + '</ul></section>';
        });
        if (!html) html = '<p class="vacio">Esta ruta no tiene clientes prioridad 1, 2 o 3 para ese día.' + (sinEval.length ? ' Revisa la pestaña <b>No prioritarios</b>.' : '') + '</p>';
      } else {
        html = '<section class="grupo"><h2>No prioritarios <small>' + sinEval.length + (sinEval.length === 1 ? ' cliente' : ' clientes')
          + ' del universo ICE sin evaluaciones anteriores</small></h2><ul class="lista">'
          + sinEval.sort(orden).map(function (c) { return tarjeta(c, todas); }).join('') + '</ul></section>';
      }
      cuerpo.innerHTML = html;
    }
    $('jef').addEventListener('change', function (e) { estado.jef = e.target.value; estado.ruta = ''; pintar(); });
    $('ruta').addEventListener('change', function (e) { estado.ruta = e.target.value; pintar(); });
    ['hoy', 'manana'].forEach(function (d) {
      $('dia-' + d).addEventListener('click', function () {
        estado.dia = d;
        $('dia-hoy').setAttribute('aria-pressed', d === 'hoy');
        $('dia-manana').setAttribute('aria-pressed', d === 'manana');
        pintar();
      });
    });
    $('tabIce').addEventListener('click', function () { estado.tab = 'ice'; pintar(); });
    $('tabSin').addEventListener('click', function () { estado.tab = 'sin'; pintar(); });
    pintar();
  }

  // Datos de la hoja: por día, las rutas con sus clientes ICE
  function datosHoja(D) {
    const porSap = Object.fromEntries(D.clientes.map(c => [c[0], c]));
    const evaluados = new Set(D.evaluados.map(e => e[0]));
    const dia = R => ({
      texto: R.texto, fecha: R.fecha,
      rutas: R.rutas.map(r => ({
        codigo: r.codigo, jefatura: r.jefatura || 'Sin jefatura',
        clientes: r.puntos.filter(p => p[4]).map(p => {
          const u = (porSap[p[2]] || [])[17] || null;        // última evaluación ICE
          return [p[2], p[3], p[4], u && u[4] != null ? D.metricas[u[4]].nombre : '', u ? u[5] : null,
                  u ? u[2] : null, u ? u[0] : '', u ? D.canales[u[1]] : '', evaluados.has(p[2]) ? 1 : 0, p[0], p[1]];
        }),
      })).filter(r => r.clientes.length),
    });
    return { unidad: D.unidad, mes: D.mes, generado: D.generado, corte: D.corte ? D.corte.texto : '',
             dias: { hoy: dia(D.rutas.hoy), manana: dia(D.rutas.manana) } };
  }

  function htmlHoja(D) {
    const datos = datosHoja(D);
    // Dentro de <script> solo hay que cuidar "<" (cierre de etiqueta) y los separadores de línea de JS
    const json = JSON.stringify(datos).replace(/</g, '\\u003c')
      .split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
    const H = D.rutas.hoy, M = D.rutas.manana;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Mis clientes ICE · ${esc(D.unidad)} · ${esc(H.fecha)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap">
<style>${CSS_HOJA}</style>
</head>
<body>
<header class="cab">
  <p class="kicker">Brigadas VDM · ICE</p>
  <h1>Mis clientes ICE.<br>${esc(D.unidad)}</h1>
  <p class="sub"><b id="diaTexto">${esc(H.texto)}</b><br>Datos publicados el ${esc(D.generado)}${D.corte ? ` · corte ICE al ${esc(D.corte.texto)}` : ''}</p>
</header>
<main class="cuerpo">
  <div class="elige">
    <div><div class="seg" role="group" aria-label="Día">
      <button type="button" id="dia-hoy" aria-pressed="true">Hoy · ${esc(H.dia)}</button>
      <button type="button" id="dia-manana" aria-pressed="false">Mañana · ${esc(M.dia)}</button>
    </div></div>
    <label>Selecciona tu jefatura<select id="jef"></select></label>
    <label>Selecciona tu ruta<select id="ruta"></select></label>
  </div>
  <div class="kpis" id="kpis"></div>
  <div class="tabs" id="tabs" hidden><div class="seg" role="tablist" aria-label="Listas">
    <button type="button" role="tab" id="tabIce" aria-selected="true"></button>
    <button type="button" role="tab" id="tabSin" aria-selected="false"></button>
  </div></div>
  <div id="lista"></div>
  <p class="nota"><b>Prioridad 1</b>: clientes evaluados en ${esc(D.prioridad.mes_anterior)} y con ${esc(D.prioridad.min_visitas)} o más visitas en los meses anteriores. <b>Prioridad 2</b>: evaluados en ${esc(D.prioridad.mes_anterior)} sin esa recurrencia. <b>Prioridad 3</b>: clientes aleatorios que no se evaluaron en ${esc(D.prioridad.mes_anterior)}, pero sí alguna vez antes. <b>No prioritarios</b>: clientes del universo ICE que nunca se han evaluado. «Le faltó» es la submétrica que más puntos le quitó en su última evaluación ICE. Las rutas son las de la frecuencia de visita de ese día. Este archivo es una foto del ${esc(D.generado)}: descárgalo de nuevo cada día.</p>
</main>
<footer class="pie"><span>Brigadas VDM · ICE</span><span>Uso interno</span></footer>
<script type="application/json" id="datos">${json}</script>
<script>(${programaHoja.toString()})();</script>
</body>
</html>
`;
  }

  function descargarHoja(D) {
    const html = htmlHoja(D);
    Archivos.descargar(new Blob([html], { type: 'text/html;charset=utf-8' }), `MisClientesICE_${D.unidad}_${D.rutas.hoy.fecha}.html`);
    return html.length;
  }

  return { cinetica, descargarHoja, htmlHoja, htmlInfo };
})();
