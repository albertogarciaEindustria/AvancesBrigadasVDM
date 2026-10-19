/* Buscador de clientes de la página de unidad (como /generatehtml de
 * ejemplo.py): por SAP, nombre o coordenadas, o los más cercanos a tu
 * ubicación (GPS del celular o la computadora). La ficha de cada cliente dice
 * si ya tiene ÉPICA y/o ICE este mes, sus datos de la Master Data, su
 * ubicación y cómo llegar. Ver _buscador_unidad en Programas/publica_avance.py. */
const Buscador = (function () {
  'use strict';
  const { esc, num } = Util;

  // Campos de cada cliente y banderas (mismo orden que _buscador_unidad)
  const SAP = 0, NOM = 1, CALLE = 2, COL = 3, CIU = 4, CP = 5, LAT = 6, LON = 7, RUTA = 8,
        CAN = 9, SUB = 10, SEG = 11, NIV = 12, JEF = 13, ZPV = 14, BAN = 15;
  const B_BRIG = 1, B_UNI = 2, B_EPICA = 4, B_ICE = 8, B_INACT = 16;
  const MAX_RESULTADOS = 30, MAX_TEXTO = 120;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  let D = null, B = null, porSap = null, normal = null, yo = null, mapaF = null, panelB = null;

  const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const txt = (k, i) => (B.dic[k] && B.dic[k][i]) || '';

  function metros(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }
  const distTxt = m => m == null ? '' : m < 1000 ? `${num(m)} m` : `${num(m / 1000, m < 10000 ? 2 : 1)} km`;

  // "19.342763, -99.167057" o el bloque de la app de GPS
  // ("Latitud : 19.456742°  Longitud : -99.159972°")
  function coordenadas(t) {
    const m = t.match(/(-?\d{1,2}\.\d{3,})\s*°?[^\d.-]+(-?\d{1,3}\.\d{3,})/);
    if (!m) return null;
    const lat = +m[1], lon = +m[2];
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }

  function mesIce() {
    const m = B.ice_mes && B.ice_mes.mes;
    if (!m) return '';
    const [a, n] = m.split('-');
    return `${MESES[+n - 1] || m} ${a}`;
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  function render(panel, datos) {
    D = datos; B = D.buscador; panelB = panel;
    porSap = new Map(B.clientes.map(c => [c[SAP], c]));
    normal = null;
    const conGps = 'geolocation' in navigator && window.isSecureContext;
    panel.innerHTML = `
      <section class="kof-seccion bus-cabeza">
        <header class="kof-sec-cab"><span class="cuadritos" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div><h2>Buscador de clientes</h2>
          <p>Los ${num(B.clientes.length)} clientes de ${esc(D.unidad)} en la Master Data. Escribe el <b>SAP</b> o el <b>nombre</b>, pega unas <b>coordenadas</b> o usa tu ubicación para ver los <b>${B.cercanos}</b> más cercanos. Toca uno para ver si ya tiene ÉPICA o ICE, sus datos y cómo llegar.</p></div>
        </header>
        <div class="bus-barra">
          <div class="bus-campo">
            <span class="bus-lupa" aria-hidden="true">⌕</span>
            <input type="search" id="busTexto" maxlength="${MAX_TEXTO}" autocomplete="off" spellcheck="false"
              placeholder="SAP, nombre del cliente o coordenadas" aria-label="Buscar cliente por SAP, nombre o coordenadas">
          </div>
          ${conGps ? '<button type="button" class="bus-gps" id="busGps">📍 Clientes cerca de mí</button>' : ''}
        </div>
        <p class="bus-estado" id="busEstado" role="status" aria-live="polite"></p>
      </section>
      <ul class="bus-lista" id="busLista" aria-label="Resultados"></ul>`;

    const entrada = panel.querySelector('#busTexto');
    let espera = null;
    entrada.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => buscar(entrada.value), 160); });
    entrada.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(espera); buscar(entrada.value); } });
    const gps = panel.querySelector('#busGps');
    if (gps) gps.addEventListener('click', ubicarme);
    panel.querySelector('#busLista').addEventListener('click', e => {
      const b = e.target.closest('button[data-sap]');
      if (b) abrir(b.dataset.sap);
    });
    inicio();
  }

  function estado(html, clase = '') {
    const p = panelB.querySelector('#busEstado');
    p.className = 'bus-estado ' + clase;
    p.innerHTML = html;
  }

  function inicio() {
    estado(conIce() ? `ICE de ${esc(mesIce())}: ${num(B.clientes.filter(c => c[BAN] & B_ICE).length)} clientes evaluados · ÉPICA de ${esc(D.mes)}: ${num(B.clientes.filter(c => c[BAN] & B_EPICA).length)}` : '');
    panelB.querySelector('#busLista').innerHTML = '';
  }
  const conIce = () => !!(B.ice_mes && B.ice_mes.mes);

  function buscar(texto) {
    const q = String(texto || '').trim().slice(0, MAX_TEXTO);
    if (!q) return inicio();
    const c = coordenadas(q);
    if (c) return cercanos(c, `las coordenadas ${num(c.lat, 6)}, ${num(c.lon, 6)}`);
    let res;
    if (/^[\d\s]+$/.test(q)) {
      const s = q.replace(/\D/g, '').replace(/^0+/, '');
      res = B.clientes.filter(x => x[SAP].startsWith(s));
      if (!res.length) res = B.clientes.filter(x => x[SAP].includes(s));
    } else {
      if (!normal) normal = B.clientes.map(x => sinAcentos(`${x[NOM]} ${x[CALLE]} ${txt('col', x[COL])} ${x[SAP]}`));
      const palabras = sinAcentos(q).split(/\s+/).filter(Boolean);
      res = B.clientes.filter((x, i) => palabras.every(p => normal[i].includes(p)));
    }
    estado(res.length ? `${num(res.length)} ${res.length === 1 ? 'cliente' : 'clientes'}${res.length > MAX_RESULTADOS ? ` · se muestran los primeros ${MAX_RESULTADOS}` : ''}`
                      : 'Sin clientes con esa búsqueda en esta unidad.', res.length ? '' : 'vacio');
    pintar(res.slice(0, MAX_RESULTADOS).map(x => ({ x, d: yo && x[LAT] != null ? metros(yo.lat, yo.lon, x[LAT], x[LON]) : null })));
  }

  function cercanos(pos, origen) {
    const lista = [];
    for (const x of B.clientes) {
      if (x[LAT] == null) continue;
      lista.push({ x, d: metros(pos.lat, pos.lon, x[LAT], x[LON]) });
    }
    lista.sort((a, b) => a.d - b.d);
    const top = lista.slice(0, B.cercanos);
    estado(`Los ${top.length} clientes más cercanos a ${origen}${pos.acc ? ` (precisión ±${num(pos.acc)} m)` : ''}.`);
    pintar(top);
  }

  function ubicarme() {
    const b = panelB.querySelector('#busGps');
    b.disabled = true; b.classList.add('buscando');
    estado('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(p => {
      yo = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
      b.disabled = false; b.classList.remove('buscando');
      panelB.querySelector('#busTexto').value = '';
      cercanos(yo, 'tu ubicación');
    }, err => {
      b.disabled = false; b.classList.remove('buscando');
      estado(err.code === 1 ? 'Sin permiso de ubicación: actívalo para esta página en tu navegador y vuelve a intentar.'
           : err.code === 3 ? 'La ubicación tardó demasiado; intenta de nuevo (en exteriores el GPS responde mejor).'
           : 'No se pudo obtener tu ubicación: este equipo no tiene GPS o la ubicación está apagada.', 'vacio');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
  }

  const marca = (si, texto) => `<span class="bchip ${si ? 'si' : 'no'}">${si ? '✓' : '✕'} ${texto}</span>`;

  function pintar(items) {
    panelB.querySelector('#busLista').innerHTML = items.map(({ x, d }) => {
      const b = x[BAN], col = txt('col', x[COL]);
      return `<li><button type="button" class="bus-item" data-sap="${esc(x[SAP])}">
        <span class="bus-txt">
          <b class="bus-nombre">${esc(x[NOM] || 'Cliente sin nombre')}</b>
          <span class="bus-sub">SAP <strong>${esc(x[SAP])}</strong> · ${esc(txt('ruta', x[RUTA]) || 'sin ruta')}${col ? ' · ' + esc(col) : ''}</span>
          <span class="bus-chips">${marca(b & B_EPICA, 'ÉPICA')}${conIce() ? marca(b & B_ICE, 'ICE') : ''}${b & B_UNI ? '<span class="bchip uni">Universo ICE</span>' : ''}${b & B_BRIG ? '<span class="bchip brig">Brigadista</span>' : ''}${b & B_INACT ? '<span class="bchip inact">Inactivo</span>' : ''}</span>
        </span>
        ${d != null ? `<span class="bus-dist">${distTxt(d)}</span>` : '<span class="bus-flecha" aria-hidden="true">›</span>'}
      </button></li>`;
    }).join('');
  }

  // ── Ficha del cliente ─────────────────────────────────────────────────
  function abrir(sap) {
    const x = porSap.get(sap);
    if (!x) return;
    cerrar();
    const ep = B.epica[sap] || [], ic = B.ice[sap] || [], hist = B.hist_ice[sap] || [];
    const b = x[BAN], tieneCoord = x[LAT] != null;
    const dist = yo && tieneCoord ? metros(yo.lat, yo.lon, x[LAT], x[LON]) : null;
    const direccion = [x[CALLE], txt('col', x[COL]), txt('ciu', x[CIU]), x[CP] ? 'CP ' + x[CP] : ''].filter(Boolean).join(', ');
    const brig = clave => { const s = D.brigadistas.find(v => v.clave === clave); return s && !s.vacante ? s.nombre : ''; };
    const dato = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '';

    const bloqueEpica = `<section class="bus-bloque ${ep.length ? 'si' : 'no'}">
        <h3><span class="bus-icono" aria-hidden="true">${ep.length ? '✓' : '✕'}</span>ÉPICA de ${esc(D.mes)}</h3>
        <p class="bus-veredicto">${ep.length ? `Sí, evaluado${ep.length > 1 ? ` ${ep.length} veces` : ''}` : 'No se ha evaluado este mes'}</p>
        ${ep.map(e => `<div class="bus-ev">
          <p><b>${esc(e[1])}</b> · ${esc(e[0])}${brig(e[0]) ? ` · ${esc(brig(e[0]))}` : ''}</p>
          <p>Calificación <b>${e[2] == null ? '—' : num(e[2], 1)}</b>${e[3] ? ` · <span class="bus-mal">NoGeo${e[5] != null ? ` (${distTxt(e[5])} del cliente)` : ''}</span>` : e[5] != null ? ` · cierre a ${distTxt(e[5])}` : ''}${e[4] ? ' · <span class="bus-mal">foto de foto</span>' : ''}${e[6] ? '' : ' · <span class="bus-gris">repetida (otro brigadista ya lo había evaluado)</span>'}</p>
        </div>`).join('')}
      </section>`;

    const met = B.metricas_ice || [];
    const bloqueIce = conIce() ? `<section class="bus-bloque ${ic.length ? 'si' : 'no'}">
        <h3><span class="bus-icono" aria-hidden="true">${ic.length ? '✓' : '✕'}</span>ICE de ${esc(mesIce())}</h3>
        <p class="bus-veredicto">${ic.length ? 'Sí, evaluado en ICE' : 'Sin evaluación ICE este mes'}</p>
        ${ic.map(e => `<div class="bus-ev">
          <p><b>${esc(e[1])}</b> · ${esc(e[0])}<span class="bus-score">${e[2] == null ? '—' : num(e[2], 1)}</span></p>
          <p>${e[3] ? `Auditor ${esc(e[3])}` : ''}${e[4] ? ` · ${e[4] === 'Far' ? '<span class="bus-mal">lejos del cliente (Far)</span>' : 'cerca del cliente (Near)'}` : ''}${e[5] ? ` · ${esc(e[5])}` : ''}</p>
          <div class="bus-met">${met.map((m, i) => e[6 + i] == null ? '' : `<span><i style="width:${Math.max(0, Math.min(100, +e[6 + i]))}%"></i><em>${esc(m)}</em><b>${num(+e[6 + i], 0)}%</b></span>`).join('')}</div>
        </div>`).join('')}
        <p class="bus-nota">${b & B_UNI ? '✓ Está en el universo ICE (evaluable).' : 'No está en el universo ICE.'}</p>
        ${hist.length ? `<p class="bus-nota">Historial ICE: ${hist.map(([m, v]) => `<span class="bus-hist">${esc(m)} · <b>${num(v, 1)}</b></span>`).join(' ')}</p>` : ''}
      </section>` : '';

    const ficha = document.getElementById('ficha');
    ficha.hidden = false;
    document.body.classList.add('sin-scroll');
    ficha.innerHTML = `
      <div class="ficha-caja bus-ficha" role="dialog" aria-modal="true" aria-labelledby="busTitulo">
        <header class="ficha-cab">
          <div>
            <p class="ficha-clave"><span class="cuadritos" aria-hidden="true"><i></i><i></i><i></i><i></i></span> SAP ${esc(sap)} · ${esc(txt('ruta', x[RUTA]) || 'sin ruta')}</p>
            <h2 id="busTitulo">${esc(x[NOM] || 'Cliente sin nombre')}</h2>
            ${direccion ? `<p class="bus-dir">${esc(direccion)}</p>` : ''}
          </div>
          <button type="button" class="ficha-cerrar" aria-label="Cerrar">✕</button>
        </header>
        <div class="ficha-cuerpo">
          <div class="bus-bloques">${bloqueEpica}${bloqueIce}</div>
          ${tieneCoord ? `<div class="bus-acciones">
            <a class="pc-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x[LAT]},${x[LON]}&travelmode=driving">🧭 Cómo llegar</a>
            <a class="pc-btn sec" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${x[LAT]},${x[LON]}">Ver en Google Maps</a></div>` : ''}
          <div class="bus-dos">
            <div><h3>Datos generales</h3>
              <dl class="bus-datos">
                ${dato('Canal', esc(txt('can', x[CAN])))}${dato('Subcanal', esc(txt('sub', x[SUB])))}
                ${dato('Segmento', esc(txt('seg', x[SEG])))}${dato('Nivel', esc(txt('niv', x[NIV])))}
                ${dato('Ruta', esc(txt('ruta', x[RUTA])))}${dato('Jefatura', esc(txt('jef', x[JEF])))}
                ${dato('Frecuencia ZPV', esc(txt('zpv', x[ZPV])))}
                ${dato('Cliente brigadista', b & B_BRIG ? 'Sí' : 'No')}
                ${dato('Universo ICE', b & B_UNI ? 'Sí' : 'No')}
                ${dato('Estado', b & B_INACT ? '<span class="bus-mal">Inactivo</span>' : 'Activo')}
              </dl></div>
            <div><h3>Ubicación</h3>
              <dl class="bus-datos">
                ${dato('Calle', esc(x[CALLE]))}${dato('Colonia', esc(txt('col', x[COL])))}
                ${dato('Ciudad', esc(txt('ciu', x[CIU])))}${dato('CP', esc(x[CP]))}
                ${dato('Coordenadas', tieneCoord ? `${num(x[LAT], 6)}, ${num(x[LON], 6)}` : '<span class="bus-gris">Sin coordenadas en la Master Data</span>')}
                ${dato('Distancia', dist != null ? `${distTxt(dist)} de tu ubicación` : '')}
              </dl></div>
          </div>
          ${tieneCoord ? '<div id="busMapa" class="bus-mapa" aria-label="Mapa del cliente"></div>' : ''}
        </div>
      </div>`;

    const cerrarF = () => {
      if (mapaF) { mapaF.remove(); mapaF = null; }
      ficha.hidden = true; ficha.innerHTML = '';
      document.body.classList.remove('sin-scroll');
      document.removeEventListener('keydown', teclas);
    };
    const teclas = e => { if (e.key === 'Escape') cerrarF(); };
    document.addEventListener('keydown', teclas);
    ficha.querySelector('.ficha-cerrar').addEventListener('click', cerrarF);
    ficha.onclick = e => { if (e.target === ficha) cerrarF(); };
    ficha.querySelector('.ficha-cerrar').focus();

    if (tieneCoord) {
      mapaF = L.map('busMapa', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapaF);
      const cli = L.circleMarker([x[LAT], x[LON]], { radius: 9, color: '#fff', weight: 2.5, fillColor: '#e41e2b', fillOpacity: 1 })
        .bindTooltip(esc(x[NOM] || sap), { permanent: true, direction: 'top', offset: [0, -8] }).addTo(mapaF);
      if (yo) {
        L.circleMarker([yo.lat, yo.lon], { radius: 7, color: '#fff', weight: 2.5, fillColor: '#1a73e8', fillOpacity: 1 })
          .bindTooltip('Tú', { direction: 'top' }).addTo(mapaF);
        L.polyline([[yo.lat, yo.lon], [x[LAT], x[LON]]], { color: '#1a73e8', weight: 3, dashArray: '1 7', lineCap: 'round' }).addTo(mapaF);
        mapaF.fitBounds(L.latLngBounds([[yo.lat, yo.lon], [x[LAT], x[LON]]]).pad(0.3), { maxZoom: 17 });
      } else {
        mapaF.setView(cli.getLatLng(), 17);
      }
      if (typeof Unidad !== 'undefined' && Unidad.botonUbicacion) Unidad.botonUbicacion(mapaF);
    }
  }

  function cerrar() {
    if (mapaF) { mapaF.remove(); mapaF = null; }
  }

  return { render, cerrar };
})();
