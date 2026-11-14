/* Reporte ICE: pestaña Cinética y hoja descargable "Mis clientes ICE".
 *
 * Cinética: con una barra deslizable se recorren los días del mes y el mapa
 * muestra, por auditor, los clientes que evaluó ese día, su trayectoria y el
 * polígono de la zona que cubrió. El reporte ICE solo trae la fecha de la
 * encuesta (no la hora): el orden de la trayectoria se estima por cercanía.
 *
 * Hoja "Mis clientes ICE": un archivo HTML suelto (sin contraseña: quien lo
 * tiene lo ve) con los clientes ICE de las rutas de hoy y de mañana; se elige
 * jefatura y ruta y lista prioridad 1, prioridad 2 y aleatorios con lo que les
 * faltó en su última evaluación; los aleatorios que nunca se han evaluado van
 * en otra pestaña. Se arma en el navegador con los datos ya descifrados. */
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
  const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

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

  // ── Cinética ──────────────────────────────────────────────────────────
  // ctx = { capaBase, botonUbicacion, limitesRobustos }; devuelve el mapa
  function cinetica(panel, D, ctx) {
    const SIN = 'Sin auditor';
    const evs = D.evaluados.filter(e => e[5]).map(e => ({
      sap: e[0], nombre: e[1], ll: e[2] != null && e[3] != null ? [e[2], e[3]] : null, canal: D.canales[e[4]],
      fecha: e[5], ice: e[6], zona: D.zonas[e[10]], auditor: e[13] || SIN,
    }));
    if (!evs.length) {
      panel.innerHTML = `<div class="mapa-barra"><p class="mapa-resumen">Aún no hay evaluaciones ICE de ${esc(D.mes)}: la cinética aparece con el primer corte del mes.</p></div>`;
      return null;
    }
    // Días transcurridos: del 1 del mes a la última encuesta
    const ultimo = evs.reduce((m, e) => e.fecha > m ? e.fecha : m, '');
    const dias = [];
    for (let d = 1; d <= Number(ultimo.slice(8, 10)); d++) dias.push(iso(D.anio, D.mes_num, d));
    const porDia = {};
    for (const e of evs) (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
    // Auditores por número de evaluaciones (el color es fijo en todo el mes)
    const cuenta = {};
    for (const e of evs) cuenta[e.auditor] = (cuenta[e.auditor] || 0) + 1;
    const auditores = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b));
    const color = Object.fromEntries(auditores.map((a, i) => [a, COLORES[i % COLORES.length]]));
    const sinAuditor = auditores.length === 1 && auditores[0] === SIN;
    const textoDia = f => { const d = new Date(D.anio, D.mes_num - 1, Number(f.slice(8, 10))); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };

    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="cin-barra">
          <button type="button" class="ice-btn rojo" id="cinPlay" aria-pressed="false">▶ Reproducir</button>
          <button type="button" class="ice-btn sec cin-paso" id="cinAntes" aria-label="Día anterior">◀</button>
          <input type="range" id="cinDia" min="0" max="${dias.length - 1}" step="1" value="${dias.length - 1}" aria-label="Día del mes">
          <button type="button" class="ice-btn sec cin-paso" id="cinDespues" aria-label="Día siguiente">▶</button>
          <output class="cin-fecha" id="cinFecha" for="cinDia"></output>
        </div>
        <div class="cin-dias" id="cinDias" aria-hidden="true"></div>
        <div class="mapa-controles">
          <div class="segmento" id="cinModo" role="group" aria-label="Qué se dibuja">
            <button type="button" data-modo="dia" aria-pressed="true">Solo ese día</button>
            <button type="button" data-modo="estela" aria-pressed="false">Con la estela de los días anteriores</button>
            <button type="button" data-modo="acumulado" aria-pressed="false">Acumulado del mes</button>
          </div>
        </div>
        <div class="chips" id="cinAuditores" role="group" aria-label="Auditores en el mapa"></div>
        <p class="mapa-resumen" id="cinResumen" role="status"></p>
        <p class="mapa-ayuda">Mueve la barra para recorrer los días de ${esc(D.mes)} que ya pasaron. Cada color es un auditor: los puntos son los clientes que evaluó ese día, la línea su trayectoria y el polígono la zona que cubrió. El reporte ICE trae la fecha de la encuesta pero no la hora, así que <b>el orden de la trayectoria es estimado</b> (del cliente más cercano al siguiente). «Acumulado del mes» junta en un polígono por auditor todo lo que lleva hasta ese día.${sinAuditor ? ' Este corte no trae el usuario del auditor: se muestran todas las evaluaciones juntas.' : ''}</p>
      </div>
      <div class="rutas-cuerpo">
        <div id="mapaCinetica" class="mapa"></div>
        <aside class="rutas-lista" aria-label="Auditores del día"><ul id="cinLista"></ul></aside>
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

    const estado = { i: dias.length - 1, modo: 'dia', ocultos: new Set() };
    let limites = {}, reloj = null;

    // Rayitas debajo de la barra: cuántas evaluaciones tuvo cada día
    const maxDia = Math.max(1, ...dias.map(f => (porDia[f] || []).length));
    $('cinDias').innerHTML = dias.map(f => {
      const n = (porDia[f] || []).length;
      return `<span title="${esc(textoDia(f))}: ${num(n)}"><i style="height:${n ? Math.max(8, Math.round(n / maxDia * 100)) : 0}%"></i></span>`;
    }).join('');

    function zona(lls, c, opciones) {
      // Con 1 o 2 clientes no hay polígono: un círculo o una franja
      if (!lls.length) return null;
      const h = envolvente(lls);
      const estilo = Object.assign({ renderer: rendZonas, color: c, weight: 2, fillColor: c, fillOpacity: 0.16, interactive: false }, opciones);
      if (h.length >= 3) return L.polygon(h, estilo);
      if (h.length === 2) return L.polyline(h, Object.assign({}, estilo, { weight: 14, opacity: estilo.fillOpacity * 1.6, lineCap: 'round' }));
      return L.circle(h[0], Object.assign({ radius: 160 }, estilo));
    }

    function pintar() {
      const f = dias[estado.i], delDia = porDia[f] || [];
      capa.clearLayers();
      limites = {};
      const grupos = {};
      for (const e of delDia) (grupos[e.auditor] = grupos[e.auditor] || []).push(e);
      const visibles = a => !estado.ocultos.has(a);

      // Días anteriores: estela atenuada o acumulado del mes
      if (estado.modo === 'estela') {
        for (let k = Math.max(0, estado.i - 6); k < estado.i; k++) {
          const previos = {};
          for (const e of porDia[dias[k]] || []) if (e.ll && visibles(e.auditor)) (previos[e.auditor] = previos[e.auditor] || []).push(e.ll);
          const edad = estado.i - k;
          for (const [a, lls] of Object.entries(previos)) {
            const z = zona(lls, color[a], { weight: 1, opacity: Math.max(0.15, 0.55 - edad * 0.07), fillOpacity: Math.max(0.03, 0.1 - edad * 0.012), dashArray: '4 4' });
            if (z) z.addTo(capa);
          }
        }
      } else if (estado.modo === 'acumulado') {
        const previos = {};
        for (let k = 0; k <= estado.i; k++)
          for (const e of porDia[dias[k]] || []) if (e.ll && visibles(e.auditor)) (previos[e.auditor] = previos[e.auditor] || []).push(e);
        for (const [a, lista] of Object.entries(previos)) {
          const z = zona(lista.map(e => e.ll), color[a], { weight: 1.5, fillOpacity: 0.08, dashArray: '6 5' });
          if (z) z.addTo(capa);
          for (const e of lista) if (e.fecha !== f)
            L.circleMarker(e.ll, { renderer: rendPuntos, radius: 3, color: color[a], weight: 0, fillColor: color[a], fillOpacity: 0.35, interactive: false }).addTo(capa);
        }
      }

      // El día elegido: zona, trayectoria y clientes de cada auditor
      const filas = auditores.filter(a => grupos[a]).map(a => {
        const lista = grupos[a], con = ordenar(lista.filter(e => e.ll)), c = color[a];
        let largo = 0;
        for (let k = 1; k < con.length; k++) largo += km(con[k - 1].ll, con[k].ll);
        const anillo = envolvente(con.map(e => e.ll));
        const scores = lista.map(e => e.ice).filter(v => v != null);
        const zonas = [...new Set(lista.map(e => e.zona))].sort();
        if (visibles(a) && con.length) {
          const z = zona(con.map(e => e.ll), c, {});
          if (z) z.addTo(capa);
          if (con.length > 1) L.polyline(con.map(e => e.ll), { renderer: rendPuntos, color: c, weight: 3, opacity: 0.9, interactive: false }).addTo(capa);
          con.forEach((e, k) => {
            const m = L.circleMarker(e.ll, { renderer: rendPuntos, radius: k === 0 ? 8 : 6, color: '#FFFFFF', weight: 2, fillColor: c, fillOpacity: 1 }).addTo(capa);
            m.bindPopup(`<div class="pc"><p class="pc-nombre">${esc(e.nombre || 'Cliente ' + e.sap)}</p>
              <dl class="pc-datos"><dt>SAP</dt><dd>${esc(e.sap)}</dd><dt>ICE</dt><dd><b>${dec1(e.ice)}</b> · ${esc(e.canal)}</dd>
              <dt>Auditor</dt><dd>${esc(a)}</dd><dt>Jefatura</dt><dd>${esc(e.zona)}</dd>
              <dt>Parada</dt><dd>${k + 1} de ${con.length} (orden estimado)</dd></dl></div>`, { maxWidth: 280 });
          });
          limites[a] = L.latLngBounds(con.map(e => e.ll));
        }
        return { a, n: lista.length, sin: lista.length - con.length, largo, area: areaKm2(anillo), zonas,
                 prom: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null };
      });

      // Textos
      $('cinDia').value = estado.i;
      $('cinFecha').innerHTML = `<b>${esc(textoDia(f))}</b>${delDia.length ? '' : ' · sin evaluaciones'}`;
      [...$('cinDias').children].forEach((s, k) => s.classList.toggle('on', k === estado.i));
      const scoresDia = delDia.map(e => e.ice).filter(v => v != null);
      const acumulado = dias.slice(0, estado.i + 1).reduce((s, d) => s + (porDia[d] || []).length, 0);
      $('cinResumen').innerHTML = delDia.length
        ? `<b>${plural(delDia.length, 'evaluación', 'evaluaciones')}</b> de <b>${plural(filas.length, 'auditor', 'auditores')}</b> · ICE promedio del día <b>${dec1(scoresDia.length ? scoresDia.reduce((s, v) => s + v, 0) / scoresDia.length : null)}</b> · van <b>${num(acumulado)}</b> de ${num(evs.length)} evaluaciones del mes (día ${estado.i + 1} de ${dias.length}).`
        : `Ese día no hubo evaluaciones ICE en ${esc(D.unidad)} · van <b>${num(acumulado)}</b> de ${num(evs.length)} del mes.`;
      $('cinAuditores').innerHTML = auditores.map(a => `<button type="button" class="chip" aria-pressed="${visibles(a)}" data-auditor="${esc(a)}"><span class="adm-sw" style="background:${color[a]}"></span>${esc(a)} · ${num(cuenta[a])}</button>`).join('');
      $('cinLista').innerHTML = filas.length ? filas.map(r => `<li><button type="button" class="ruta-item cin-item" data-auditor="${esc(r.a)}"${visibles(r.a) ? '' : ' style="opacity:.45"'}>
          <span class="adm-sw" style="background:${color[r.a]}"></span>
          <span><b>${esc(r.a)}</b><span class="ruta-info">${plural(r.n, 'cliente')} · ICE ${dec1(r.prom)} · ~${num(r.largo, 1)} km${r.area >= 0.01 ? ` · ${num(r.area, 2)} km²` : ''}<br>${esc(r.zonas.join(', '))}${r.sin ? ` · ${num(r.sin)} sin coordenadas` : ''}</span></span>
          <span class="poli-pct">${num(r.n)}</span></button></li>`).join('')
        : '<li class="muted" style="padding:12px 6px;font-size:13px">Sin evaluaciones ese día.</li>';
    }

    function ir(i) {
      estado.i = Math.max(0, Math.min(dias.length - 1, i));
      pintar();
    }
    function parar() {
      clearInterval(reloj);
      reloj = null;
      $('cinPlay').textContent = '▶ Reproducir';
      $('cinPlay').setAttribute('aria-pressed', 'false');
    }
    $('cinDia').addEventListener('input', ev => { parar(); ir(Number(ev.target.value)); });
    $('cinAntes').addEventListener('click', () => { parar(); ir(estado.i - 1); });
    $('cinDespues').addEventListener('click', () => { parar(); ir(estado.i + 1); });
    $('cinPlay').addEventListener('click', () => {
      if (reloj) return parar();
      if (estado.i >= dias.length - 1) ir(0);
      $('cinPlay').textContent = '❚❚ Pausa';
      $('cinPlay').setAttribute('aria-pressed', 'true');
      reloj = setInterval(() => {
        // Si la pestaña ya no está a la vista, la animación se detiene
        if (estado.i >= dias.length - 1 || panel.hidden || !document.body.contains(panel)) return parar();
        ir(estado.i + 1);
      }, 1300);
    });
    $('cinModo').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-modo]');
      if (!b) return;
      estado.modo = b.dataset.modo;
      $('cinModo').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      pintar();
    });
    $('cinAuditores').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-auditor]');
      if (!b) return;
      const a = b.dataset.auditor;
      if (estado.ocultos.has(a)) estado.ocultos.delete(a); else estado.ocultos.add(a);
      pintar();
    });
    $('cinLista').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-auditor]');
      if (b && limites[b.dataset.auditor]) mapa.fitBounds(limites[b.dataset.auditor].pad(0.25), { maxZoom: 16 });
    });
    mapa.on('unload', parar);
    pintar();
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
    var PRIO = { 1: 'Prioridad 1', 2: 'Prioridad 2', 3: 'Aleatorios' };
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
      // Los aleatorios que nunca se han evaluado van en su propia pestaña
      var sinEval = clientes.filter(function (c) { return c[2] === 3 && !c[6]; });
      var conIce = clientes.filter(function (c) { return !(c[2] === 3 && !c[6]); });
      var n = function (p) { return conIce.filter(function (c) { return c[2] === p; }).length; };
      $('kpis').innerHTML = [['Prioridad 1', n(1), 1], ['Prioridad 2', n(2), 0], ['Aleatorios', n(3), 0], ['Aleatorios sin evaluación', sinEval.length, 0]]
        .map(function (k) { return '<div class="kpi' + (k[2] ? ' rojo' : '') + '"><p>' + k[0] + '</p><b>' + k[1] + '</b></div>'; }).join('');
      $('tabs').hidden = false;
      if (estado.tab === 'sin' && !sinEval.length) estado.tab = 'ice';
      $('tabIce').textContent = 'Mis clientes ICE (' + conIce.length + ')';
      $('tabSin').textContent = 'Aleatorios sin evaluación (' + sinEval.length + ')';
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
        if (!html) html = '<p class="vacio">Esta ruta no tiene clientes ICE con evaluación previa para ese día.' + (sinEval.length ? ' Revisa la pestaña <b>Aleatorios sin evaluación</b>.' : '') + '</p>';
      } else {
        html = '<section class="grupo"><h2>Aleatorios sin evaluación <small>' + sinEval.length + (sinEval.length === 1 ? ' cliente' : ' clientes')
          + ' del universo ICE que nunca se han evaluado</small></h2><ul class="lista">'
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
  <p class="nota"><b>Prioridad 1</b>: clientes evaluados en ${esc(D.prioridad.mes_anterior)} y con ${esc(D.prioridad.min_visitas)} o más visitas en los meses anteriores. <b>Prioridad 2</b>: evaluados en ${esc(D.prioridad.mes_anterior)} sin esa recurrencia. <b>Aleatorios</b>: el resto del universo ICE. «Le faltó» es la submétrica que más puntos le quitó en su última evaluación ICE. Las rutas son las de la frecuencia de visita de ese día. Este archivo es una foto del ${esc(D.generado)}: descárgalo de nuevo cada día.</p>
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

  return { cinetica, descargarHoja, htmlHoja };
})();
