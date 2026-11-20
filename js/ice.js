/* Reporte ICE (ice.html): acceso con usuario + contraseña y las secciones de
 * la unidad (información del sistema con las descargas, On Premise y Home
 * Market con sus rankings, mapa, semanas del mes, cinética de los auditores
 * (js/ice-extra.js), ÉPICAS de preventa y de farmers (js/ice-preventa.js), Mix de tipos de cliente,
 * rutas de preventa y de farmers (con la zona de cada farmer y sus clientes
 * cercanos) con sus impresiones en PDF y polígonos en KMZ: concentración ICE,
 * jefaturas y zonas que más restan). Un usuario administrador entra a
 * js/ice-admin.js (todas las unidades) y desde ahí abre cualquier unidad.
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
    3: { nombre: 'Prioridad 3', corto: 'P3', clase: 'p3', relleno: BLANCO, borde: GRIS_OSC, radio: 6, grosor: 2.5 },
    4: { nombre: 'No prioritario', corto: 'NP', clase: 'p4', relleno: '#BDBDBD', borde: BLANCO, radio: 4.5, grosor: 1 },
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
    descarga:    '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 16.5v4h16v-4"/>',
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
    const cargar = async (archivo, llaveB64) => {
      if (!/^[0-9a-f]{16}$/.test(String(archivo))) throw new Error('Archivo de datos no válido');
      window.ICE_DATOS = window.ICE_DATOS || {};
      if (!window.ICE_DATOS[archivo]) await cargarScript(`datos/ice/d-${archivo}.js?v=${v}`);
      return Cripto.descifrarConLlave(window.ICE_DATOS[archivo], llaveB64);
    };
    const datos = await cargar(llave.archivo, llave.llave);
    if (llave.admin && datos.tipo === 'admin') {
      // Administrador: análisis de todas las unidades; su sobre trae además
      // la llave de cada unidad, que se descifra al abrirla (una sola vez)
      const unidades = Array.isArray(llave.unidades) ? llave.unidades : [], abiertas = {};
      IceAdmin.render(datos, {
        unidades: unidades.map(u => u.unidad),
        abrir: async nombre => {
          const u = unidades.find(x => x.unidad === nombre);
          if (!u) throw new Error('Sin llave de ' + nombre);
          abiertas[nombre] = abiertas[nombre] || await cargar(u.archivo, u.llave);
          render(abiertas[nombre], () => IceAdmin.mostrar());
        },
      });
    } else {
      render(datos);
    }
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
  let D = null, mapaM = null, mapaP = null, mapaC = null, cineticaLista = false, canalesListos = {},
      porSapCliente = {}, porSapEval = {}, preventaLista = false;
  const PESTANAS = [['info', 'Información del sistema'], ['onpremise', 'On Premise'], ['homemarket', 'Home Market'], ['mapa', 'Mapa'],
                    ['semanas', 'Semanas'], ['rutas', 'Preventa'], ['farmers', 'Farmers'], ['preventa', 'ÉPICAS'], ['poligonos', 'Polígonos'], ['cinetica', 'Cinética'], ['mix', 'Mix']];
  const PANELES_MAPA = new Set(['mapa', 'semanas', 'rutas', 'farmers', 'poligonos', 'cinetica']);

  function render(datos, volver) {
    // Al cambiar de unidad (administrador) los mapas se vuelven a crear
    for (const m of [mapaM, mapaP, mapaS, mapaC]) if (m) m.remove();
    mapaM = mapaP = mapaS = mapaC = null;
    for (const v of Object.values(vistasRuta)) v.quitar();
    // Pestañas Preventa (id 'rutas', antes Rutas) y Farmers: la misma vista con otros datos
    vistasRuta = { rutas: crearVistaRuta('rutas'), farmers: crearVistaRuta('farmers'), cercanos: crearVistaCercanos() };
    farmersSub = 'recorridos';
    farmersCanal = null;
    cineticaLista = false;
    preventaLista = false;
    canalesListos = {};
    D = datos;
    porSapCliente = Object.fromEntries(D.clientes.map(c => [c[0], c]));
    porSapEval = {};
    for (const e of D.evaluados) (porSapEval[e[0]] = porSapEval[e[0]] || []).push(e);
    document.body.className = 'ice-modo-reporte';
    $('iceAcceso').hidden = true;
    const v = $('iceVista');
    v.hidden = false;
    const c = D.corte;
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
          ${volver ? '<button type="button" class="ice-btn rojo" data-accion="volver">← Todas las unidades</button>' : ''}
          <a class="ice-btn sec" href="index.html">Inicio</a>
          <button type="button" class="ice-btn" data-accion="salir">Salir</button>
        </div>
      </header>
      <nav class="ice-pestanas" role="tablist" aria-label="Secciones del reporte">
        ${PESTANAS.map(([id, t], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="p-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''} data-pestana="${id}">${t}</button>`).join('')}
      </nav>
      ${PESTANAS.map(([id], i) => `<div class="ice-panel${PANELES_MAPA.has(id) ? ' ice-panel-mapa' : ''}" id="p-${id}" role="tabpanel" aria-labelledby="tab-${id}"${i ? ' hidden' : ''}></div>`).join('')}
      <footer class="ice-pie"><span>Brigadas VDM · ICE</span><span>Uso interno</span></footer>`;
    v.querySelector('[data-accion="salir"]').addEventListener('click', () => location.reload());
    if (volver) v.querySelector('[data-accion="volver"]').addEventListener('click', () => { Graficas.Tip.hide(); volver(); });
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
    infoSistema();
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
    if (cual === 'mapa') mapa();
    if (cual === 'semanas') semanas();
    if (cual === 'rutas') vistasRuta.rutas.abrir();
    if (cual === 'farmers') farmersPestana();
    if (cual === 'poligonos') poligonos();
    if (cual === 'cinetica') cinetica();
    // ÉPICAS (js/ice-preventa.js, antes ÉPICAS Preventa): se arma la primera vez que se abre
    if (cual === 'preventa' && !preventaLista) { preventaLista = true; IcePreventa.panel($('p-preventa'), D); }
    if (PANELES_CANAL[cual]) panelCanal(cual);
    if (cual === 'mix') mixPanel();
  }

  // Cinética de los auditores (js/ice-extra.js): se arma la primera vez que se abre
  function cinetica() {
    if (cineticaLista) { if (mapaC) setTimeout(() => mapaC.invalidateSize(), 50); return; }
    cineticaLista = true;
    mapaC = IceExtra.cinetica($('p-cinetica'), D, { capaBase, botonUbicacion, limitesRobustos });
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

  // ── Tipos de cliente (la explicación se repite donde se mencionan) ─────
  function tiposCliente(abierto) {
    const ant = esc(D.prioridad.mes_anterior);
    const lista = [
      [1, `Evaluados en <b>${ant}</b> y con <b>${num(D.prioridad.min_visitas)} o más visitas</b> ICE en los meses anteriores.`],
      [2, `Evaluados en <b>${ant}</b>, sin esa recurrencia.`],
      [3, `Clientes aleatorios que no se evaluaron en ${ant}, pero <b>sí alguna vez antes</b>.`],
      [4, `Clientes del universo ICE (UniversoICE.db) que <b>nunca se han evaluado</b>.`],
    ].map(([p, t]) => `<div><dt><span class="prio ${PRIO[p].clase}">${PRIO[p].corto}</span>${esc(PRIO[p].nombre)}</dt><dd>${t}</dd></div>`).join('');
    const cuerpo = `<dl class="tipos-lista">${lista}</dl>
      <p class="tipos-nota">El tipo se fija al iniciar ${esc(D.mes)} con el histórico ICE anterior: un cliente que se evalúa por primera vez este mes sigue como No prioritario hasta el mes siguiente.</p>`;
    return abierto ? `<div class="tipos-cliente"><h3>Qué es cada tipo de cliente</h3>${cuerpo}</div>`
      : `<details class="tipos-cliente"><summary>¿Qué es cada tipo de cliente?</summary>${cuerpo}</details>`;
  }

  function bajarExcel(x) {
    const bin = atob(x.datos), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    PDF.descargar(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), x.nombre);
  }

  // ── Información del sistema ───────────────────────────────────────────
  function infoSistema() {
    const R = D.resumen, E = R.estimacion;
    $('p-info').innerHTML = `
      ${IceExtra.htmlInfo(D)}
      <p class="ice-nota">Total de ${esc(D.unidad)} con los dos canales: promedio ICE <b>${dec1(R.promedio)}</b> con ${plural(R.n, 'evaluación', 'evaluaciones')}${E ? ` · estimación de cierre <b>${dec1(E.valor)}</b>` : ''}. El detalle está en las pestañas On Premise y Home Market.</p>
      ${seccion('Descargas de la unidad', '', `
        <div class="ice-descargas">
          <button type="button" class="ice-btn rojo" id="btnHoja">${svgIcono('descarga')}Descargar «Mis clientes ICE» (HTML)</button>
          <span>Un archivo que se abre en el celular o la computadora, sin contraseña: <b>eliges tu jefatura y tu ruta</b> y te dice qué clientes ICE te tocan hoy (${esc(D.rutas.hoy.dia.toLowerCase())}) y mañana, por prioridad 1, 2 y 3, con su nombre, SAP y lo que les faltó en su última evaluación. Los no prioritarios van en otra pestaña. Es una foto de esta publicación: descárgalo cada día.</span>
        </div>
        ${D.excel ? `<div class="ice-descargas">
          <button type="button" class="ice-btn rojo" id="btnExcel">${svgIcono('excel')}Descargar Excel de clasificación</button>
          <span>Los <b>${num(D.clientes.length)}</b> clientes del universo ICE de ${esc(D.unidad)}: tipo de cliente, semana del mes en que suelen evaluarse, visitas, datos del cliente, si ya se evaluó en ICE en ${esc(D.mes)}, la submétrica que más le quitó en su última evaluación y su ÉPICA de ${esc(D.mes)} separada en brigadistas, preventa y farmers.</span>
        </div>` : ''}`)}
      ${tiposCliente(true)}`;
    if ($('btnExcel')) $('btnExcel').addEventListener('click', () => bajarExcel(D.excel));
    $('btnHoja').addEventListener('click', () => IceExtra.descargarHoja(D));
  }

  // ── Pestañas On Premise y Home Market ─────────────────────────────────
  // "Home Market" es el canal Traditional del reporte ICE
  const SIGUIENTE_PUBLICACION = '<p class="muted">Esta sección aparece a partir de la siguiente publicación del sitio.</p>';
  const PANELES_CANAL = { onpremise: { canal: 'On Premise', k: 'op' }, homemarket: { canal: 'Traditional', k: 'hm' } };

  function panelCanal(id) {
    if (canalesListos[id]) return;
    canalesListos[id] = true;
    if (!D.detalle_canal) { $('p-' + id).innerHTML = SIGUIENTE_PUBLICACION; return; }
    const { canal, k } = PANELES_CANAL[id], ci = D.canales.indexOf(canal);
    const C = D.detalle_canal[canal], F = D.resumen.por_canal.find(x => x.canal === canal), E = F.estimacion, MA = D.resumen.mes_anterior;
    const nombre = C.pestana, valores = D.distribucion[canal] || [], color = COLOR_CANAL[canal];
    const aclara = nombre !== canal ? ` <span class="muted">(canal ${esc(canal)} del reporte ICE)</span>` : '';
    $('p-' + id).innerHTML = `
      <p class="canal-titulo">${esc(nombre)}${aclara}</p>
      <div class="ice-kpis">
        ${kpi(`Promedio ICE · ${nombre}`, dec1(F.promedio) + flecha(F.d_promedio), `${plural(C.clientes, 'cliente evaluado', 'clientes evaluados')} · mediana ${dec1(F.mediana)}`, true)}
        ${kpi('Estimación de cierre', E ? dec1(E.valor) + flecha(E.d_valor) : '—', E ? `rango probable <b>${dec1(E.bajo)} – ${dec1(E.alto)}</b>` : 'sin datos suficientes')}
        ${kpi('Clientes evaluados', num(C.clientes) + flecha(F.d_n, 0), E ? `de ~<b>${num(E.n_actual + E.n_restante)}</b> esperados en ${esc(D.mes)}` : 'en el mes')}
        ${kpi('Prioridad 1 evaluados', `${num(C.p1_eval)}<small>/ ${num(C.p1)}</small>`, `clientes ${esc(nombre)} prioridad 1`)}
        ${kpi(`Cierre de ${MA.mes}`, dec1(F.mes_anterior), plural(F.n_mes_anterior, 'evaluación', 'evaluaciones'))}
      </div>
      ${seccion('Distribución de calificaciones', `Calificación ICE de cada cliente de ${esc(nombre)} evaluado en ${esc(D.mes)}. En el violín, la caja va del cuartil 1 al 3, el círculo es la mediana y la raya horizontal, el promedio.`,
        `<div class="ice-dos">
          <figure><figcaption>Histograma</figcaption><div class="grafica" id="gHist${k}"></div></figure>
          <figure><figcaption>Violín de la unidad</figcaption><div class="grafica" id="gViolin${k}"></div></figure>
        </div>
        <figure class="violin-zona"><figcaption>Violín por jefatura</figcaption>
          <div class="g-scroll"><div class="grafica" id="gViolinZona${k}"></div></div><p class="mapa-ayuda" id="gViolinNota${k}"></p></figure>`)}
      ${seccionEstimacion(F, nombre, k)}
      ${seccionZonas(C, F, nombre)}
      ${seccionRanking(C, nombre, k)}
      ${seccion('Promedio y clientes evaluados por día', 'Arriba, el promedio ICE de las encuestas de cada día; abajo, cuántas evaluaciones hubo ese día. La línea punteada es el promedio del mes.', `<div class="grafica" id="gDia${k}"></div>`)}
      ${seccionDesglose(canal, C, nombre, k)}
      ${tiposCliente(false)}`;

    if (valores.length) {
      Graficas.histograma($(`gHist${k}`), {
        valores, dominio: [0, 110], paso: 5, color, colorLinea: canal === 'On Premise' ? ROJO : NEGRO, alto: 300, titulo: `Histograma de calificaciones ICE de ${nombre}`,
        lineas: [{ valor: F.promedio, etiqueta: `Promedio ${dec1(F.promedio)}`, color: canal === 'On Premise' ? ROJO : NEGRO, punteada: true },
                 E && { valor: E.valor, etiqueta: `Estimación ${dec1(E.valor)}`, color: GRIS }].filter(Boolean),
      });
      Graficas.violin($(`gViolin${k}`), { dominio: [0, 110], alto: 340, titulo: `Distribución de calificaciones de ${nombre}`, series: [{ nombre, valores, color }] });
    } else {
      $(`gHist${k}`).innerHTML = $(`gViolin${k}`).innerHTML = `<p class="muted">Sin evaluaciones en ${esc(D.mes)}.</p>`;
    }
    graficaViolinZona($(`gViolinZona${k}`), $(`gViolinNota${k}`), ci, canal, nombre, F.promedio);
    graficaDiaria($(`gDia${k}`), C.por_dia, F.promedio, nombre);
    if ($(`gMeses${k}`)) graficaMeses($(`gMeses${k}`), C.historico, E);
    if ($(`gPerd${k}`)) graficaPerdidos($(`gPerd${k}`), canal, nombre);
    $(`btnRanking${k}`).addEventListener('click', () => bajarExcel(C.excel));
  }

  // Dos paneles con el mismo eje de días: promedio (línea) y evaluaciones (barras)
  function graficaDiaria(cont, filas, promMes, nombre) {
    if (!filas.length) { cont.innerHTML = `<p class="muted">Sin evaluaciones en ${esc(D.mes)}.</p>`; return; }
    const porDia = Object.fromEntries(filas.map(f => [partes(f[0]).d, f]));
    const ultimo = Math.max(...Object.keys(porDia).map(Number));
    const dias = Array.from({ length: ultimo }, (_, i) => i + 1);
    A.montar(cont, (c, W, T) => {
      const m = { l: 42, r: 14, t: 26 }, H1 = 190, sep = 44, H2 = 120;
      const H = m.t + H1 + sep + H2 + 28;
      const svg = A.svgBase(c, W, H, `Promedio ICE y evaluaciones por día de ${D.mes} en ${nombre}`);
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
      titulo(top2 - 12, 'EVALUACIONES');
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
      const marca = A.el('rect', { x: 0, y: m.t, width: banda, height: top2 + H2 - m.t, fill: NEGRO, 'fill-opacity': 0.06, visibility: 'hidden', 'pointer-events': 'none' }, svg);
      dias.forEach((dd, i) => {
        const f = porDia[dd];
        const hit = A.el('rect', { x: m.l + banda * i, y: m.t, width: banda, height: top2 + H2 - m.t, fill: 'transparent' }, svg);
        const iso = `${D.anio}-${String(D.mes_num).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        Graficas.conTip(hit, `<b>${diaSemana(iso)} ${dd} de ${esc(D.mes)}</b>` + (f
          ? `<table class="tip-tabla"><tr><td>Promedio ICE</td><td>${dec1(f[2])}</td></tr><tr><td>Evaluaciones</td><td>${num(f[1])}</td></tr></table>` : '<br>Sin evaluaciones'));
        hit.addEventListener('pointerenter', () => { marca.setAttribute('x', m.l + banda * i); marca.setAttribute('visibility', 'visible'); });
        hit.addEventListener('pointerleave', () => marca.setAttribute('visibility', 'hidden'));
      });
    });
  }

  // ── Estimación de cierre del canal ────────────────────────────────────
  function seccionEstimacion(F, nombre, k) {
    const E = F.estimacion, base = (D.resumen.estimacion || {}).meses_base || [];
    const titulo = `Estimación de cierre · ${nombre}`;
    if (!E) return seccion(titulo, '', `<p class="muted">Todavía no hay datos suficientes para estimar el cierre de ${esc(D.mes)}.</p>`);
    const total = E.n_actual + E.n_restante;
    const paso2 = E.n_restante
      ? `<li><b>¿Cómo saldrían?</b> Primero cuentan los <b>${num(E.n_pendientes)}</b> clientes prioridad 1 y 2 de ${esc(nombre)} que aún no se evalúan (los que el auditor tiene más probabilidad de visitar), cada uno con su promedio ICE de los últimos meses; si no alcanzan, el resto se califica con el promedio que lleva ${esc(D.mes)}. Así, las que faltan saldrían en <b>${dec1(E.prom_restante)}</b> en promedio.</li>`
      : `<li><b>Ya se alcanzó el volumen habitual del mes</b>, así que la estimación es el promedio que lleva ${esc(D.mes)}.</li>`;
    return seccion(titulo, `Cómo podría cerrar ${esc(D.mes)} ${esc(nombre)} en ${esc(D.unidad)} si el resto del mes se comporta como indican los datos.`,
      `<div class="est-cuerpo"><div><ol class="est-pasos">
        <li><b>¿Cuántas evaluaciones faltan?</b> ${base.length ? `En ${esc(base.join(', ').replace(/, ([^,]*)$/, ' y $1'))} hubo` : 'Se esperan'} en promedio <b>${num(E.n_esperado)}</b> evaluaciones al mes; van <b>${num(E.n_actual)}</b>, así que faltan <b>${num(E.n_restante)}</b>.</li>
        ${paso2}
        <li><b>Cierre estimado</b> = (suma de las calificaciones del mes + las que faltan) ÷ ${num(total)} = <b>${dec1(E.valor)}</b>${flecha(E.d_valor)}. El rango probable (<b>${dec1(E.bajo)} – ${dec1(E.alto)}</b>, 95%) refleja cuánto varían las calificaciones.</li>
      </ol></div>
      <figure><figcaption>Promedio ICE por mes y estimación de ${esc(D.mes)}</figcaption><div class="grafica" id="gMeses${k}"></div></figure></div>`);
  }

  function graficaMeses(cont, H_, E) {
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
          A.texto(svg, x, Math.max(12, Math.min(y(E.alto), y(h.promedio == null ? E.valor : h.promedio)) - 20), `est. ${dec1(E.valor)}`,
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

  // ── Jefaturas y rankings del canal ────────────────────────────────────
  function celdaBarra(v, delta, referencia) {
    if (v == null) return '<span class="muted">—</span>';
    const bajo = referencia != null && v < referencia;
    return `<div class="celda-barra"><span class="pista" title="Escala de 0 a 110"><span class="${bajo ? 'bajo' : ''}" style="width:${Math.min(100, v / 110 * 100).toFixed(1)}%"></span></span><b>${dec1(v)}</b>${flecha(delta)}</div>`;
  }

  function seccionZonas(C, F, nombre) {
    if (!C.zonas.length) return '';
    return seccion(`Calificación por jefatura · ${nombre}`, `Jefatura de ventas del cliente. Barra roja: jefatura debajo del promedio de ${esc(nombre)} en la unidad (${dec1(F.promedio)}). Prioridad 1 evaluados: cuántos de sus clientes prioridad 1 de este canal ya tienen ICE en ${esc(D.mes)}.`,
      `<div class="tabla-scroll"><table class="ice-tabla">
        <thead><tr><th>Jefatura</th><th>Clientes evaluados</th><th>Promedio ICE</th><th>Prioridad 1 evaluados</th><th>Cierre de ${esc(D.resumen.mes_anterior.mes)}</th></tr></thead>
        <tbody>${C.zonas.filter(z => z.n || z.p1 || z.mes_anterior != null).map(z => `<tr><th scope="row">${esc(z.zona)}</th><td>${num(z.clientes)} ${flecha(z.d_n, 0)}</td>
          <td>${celdaBarra(z.promedio, z.d_promedio, F.promedio)}</td><td>${num(z.p1_eval)} / ${num(z.p1)}</td><td>${dec1(z.mes_anterior)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Unidad</th><td>${num(C.clientes)} ${flecha(F.d_n, 0)}</td><td>${celdaBarra(F.promedio, F.d_promedio, null)}</td>
          <td>${num(C.p1_eval)} / ${num(C.p1)}</td><td>${dec1(F.mes_anterior)}</td></tr></tfoot>
      </table></div>`);
  }

  // Mapa de calor de los rankings: el color sale del lugar entre las calificaciones
  // distintas que se ven en la tabla (empates, mismo color), así un valor muy bajo
  // no deja a todos los demás del mismo verde
  const CALOR_RANKING = [[227, 0, 0], [255, 213, 74], [18, 161, 80]];   // rojo, amarillo, verde

  // t: 0 = la calificación más baja, 1 = la más alta
  function colorRanking(t) {
    const [a, b, u] = t < 0.5 ? [CALOR_RANKING[0], CALOR_RANKING[1], t * 2] : [CALOR_RANKING[1], CALOR_RANKING[2], t * 2 - 1];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * u));
    const [r, g, n] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return { fondo: `rgb(${c.join(',')})`, tinta: 0.2126 * r + 0.7152 * g + 0.0722 * n > 0.179 ? NEGRO : BLANCO };
  }

  function calorRanking(filas) {
    const valores = [...new Set([...filas].sort((a, b) => b.promedio - a.promedio).map(f => dec1(f.promedio)))];
    return filas.map(f => colorRanking(valores.length > 1 ? 1 - valores.indexOf(dec1(f.promedio)) / (valores.length - 1) : 0.5));
  }

  // conJefatura: la primera columna es la jefatura de la ruta (ranking de rutas de preventa)
  function tablaRanking(filas, clave, cabecera, conJefatura = false) {
    if (!filas.length) return `<p class="muted">Sin evaluaciones en ${esc(D.mes)}.</p>`;
    const calor = calorRanking(filas);
    return `<div class="tabla-scroll ranking-scroll"><table class="ice-tabla tabla-ranking">
      <thead><tr>${conJefatura ? '<th class="izq">Jefatura</th>' : ''}<th class="rk-pos">#</th><th class="izq">${esc(cabecera)}</th><th>Calificación ICE</th><th>Clientes evaluados</th></tr></thead>
      <tbody>${filas.map((f, i) => `<tr>${conJefatura ? `<td class="izq">${esc(f.jefatura || '')}</td>` : ''}<td class="rk-pos">${num(f.pos)}</td><th scope="row" class="izq">${esc(f[clave])}</th>
        <td class="rk-valor" style="background:${calor[i].fondo};color:${calor[i].tinta}">${dec1(f.promedio)}</td><td>${num(f.clientes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function seccionRanking(C, nombre, k) {
    return seccion(`Ranking · ${nombre}`, `De mayor a menor calificación ICE de ${esc(D.mes)}, como mapa de calor: entre más arriba en la tabla, más verde; entre más abajo, más roja. Clientes evaluados: los de ${esc(nombre)} con ICE este mes. Solo entran jefaturas y rutas con al menos una evaluación. La jefatura de cada ruta es la de la mayoría de sus clientes.`,
      `<div class="ice-descargas ranking-descarga">
        <button type="button" class="ice-btn rojo" id="btnRanking${k}">${svgIcono('excel')}Descargar ranking en Excel</button>
        <span>Jefaturas y rutas de preventa de ${esc(nombre)}, una por hoja.</span>
      </div>
      <p class="rk-leyenda"><span>Más baja</span><i aria-hidden="true"></i><span>Más alta</span></p>
      <div class="ranking-doble">
        <figure><figcaption>Jefaturas (${num(C.ranking_jefaturas.length)})</figcaption>${tablaRanking(C.ranking_jefaturas, 'jefatura', 'Jefatura')}</figure>
        <figure><figcaption>Rutas de preventa (${num(C.ranking_rutas.length)})</figcaption>${tablaRanking(C.ranking_rutas, 'ruta', 'Ruta', true)}</figure>
      </div>`);
  }

  // Violín por jefatura del canal
  const MIN_VIOLIN = 3;      // con menos evaluaciones no hay distribución que dibujar
  function graficaViolinZona(cont, nota, ci, canal, nombre, prom) {
    const porZona = {};
    for (const e of D.evaluados) if (e[4] === ci && e[6] != null) (porZona[D.zonas[e[10]]] = porZona[D.zonas[e[10]]] || []).push(e[6]);
    const zonas = D.zonas.filter(z => porZona[z]);
    const con = zonas.filter(z => porZona[z].length >= MIN_VIOLIN).map(z => ({ nombre: z, valores: porZona[z], color: COLOR_CANAL[canal] }));
    const pocas = zonas.filter(z => porZona[z].length < MIN_VIOLIN).map(z => `${z} (${porZona[z].length})`);
    if (con.length) {
      // El eje se ajusta a los datos: con todo arriba de 80 los violines no quedan aplastados
      const todos = con.flatMap(s => s.valores);
      const piso = Math.max(0, Math.floor((Math.min(...todos) - 5) / 10) * 10), techo = Math.max(110, Math.ceil(Math.max(...todos) / 5) * 5);
      Graficas.violin(cont, { dominio: [piso, techo], alto: 340, minAncho: con.length * 96 + 60, titulo: `Calificaciones ICE de ${nombre} por jefatura`,
                              series: con, objetivo: prom == null ? null : { valor: prom, etiqueta: `Unidad ${dec1(prom)}` } });
    } else {
      cont.innerHTML = `<p class="muted">Ninguna jefatura tiene ${MIN_VIOLIN} o más evaluaciones de ${esc(nombre)} en ${esc(D.mes)}.</p>`;
    }
    nota.textContent = pocas.length ? `Con menos de ${MIN_VIOLIN} evaluaciones (sin violín): ${pocas.join(', ')}.` : '';
  }

  // ── Desglose por submétrica del canal ─────────────────────────────────
  function colorCalor(v) {
    // 100% = blanco, 0% = rojo Coke (una sola tinta, de claro a intenso)
    const t = Math.max(0, Math.min(1, (100 - v) / 100)) ** 0.85;
    const mezcla = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mezcla(255, 244)},${mezcla(255, 0)},${mezcla(255, 0)})`;
  }

  function seccionDesglose(canal, C, nombre, k) {
    const G = D.desglose, g = G.canal[canal] || { prom: [], d: [], perdidos: [] }, mets = D.metricas;
    const filas = mets.map((m, i) => ({ m, i })).filter(({ i }) => g.prom[i] != null);
    if (!filas.length) return '';
    const p = g.perdidos || [];
    const mayor = p.reduce((a, v, i) => (v != null && (a == null || v > p[a]) ? i : a), null);
    const w = G.pesos[canal] || [];
    const pesos = mets.map((m, i) => w[i] != null ? `${m.nombre} ${num(w[i] * 100, 0)}` : null).filter(Boolean).join(', ');
    const usadas = filas.filter(({ i }) => C.metricas_zona.some(z => z.prom[i] != null));
    const calor = C.metricas_zona.length ? `<h3 class="ice-subtitulo" style="margin-top:26px">Promedio de cada submétrica por jefatura (%)</h3>
      <div class="tabla-scroll"><table class="ice-tabla tabla-calor">
        <thead><tr><th>Jefatura</th><th>Evaluados</th>${usadas.map(({ m }) => `<th>${esc(m.nombre)}</th>`).join('')}</tr></thead>
        <tbody>${C.metricas_zona.map(z => `<tr><th scope="row">${esc(z.zona)}</th><td>${num(z.n)}</td>${usadas.map(({ i }) => {
          const v = z.prom[i];
          if (v == null) return '<td class="vacio">—</td>';
          const fondo = colorCalor(v);
          return `<td style="background:${fondo};color:${Graficas.tintaSobre(fondo)}">${num(v, 0)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="escala-calor"><span>0%</span><i aria-hidden="true"></i><span>100%</span></p>` : '';
    return seccion(`Desglose de la calificación · ${nombre}`, `Submétricas del ICE en ${esc(D.mes)}: promedio de cumplimiento y cuántos puntos se pierden en promedio por cada una (peso aproximado × lo que le falta para el 100%). La que más quita es donde más conviene trabajar.`,
      `<div class="ice-dos">
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th>Submétrica</th><th>Promedio</th><th>Puntos que quita</th></tr></thead>
          <tbody>${filas.map(({ m, i }) => `<tr>
            <th scope="row"><span class="metrica-nombre"><span class="icono-metrica">${svgIcono(m.id)}</span>${esc(m.nombre)}</span></th>
            <td>${num(g.prom[i], 1)}% ${flecha(g.d[i])}</td>
            <td>${p[i] == null ? '<span class="muted">—</span>' : `−${num(p[i], 1)}${mayor === i ? '<span class="mas-impacto">más impacto</span>' : ''}`}</td></tr>`).join('')}</tbody>
        </table></div>
        <figure><figcaption>Puntos que quita cada submétrica</figcaption><div class="grafica" id="gPerd${k}"></div></figure>
      </div>
      ${calor}
      ${pesos ? `<p class="ice-nota">Peso aproximado de cada submétrica (puntos que aporta al 100%; con el bono el máximo es 110): ${esc(pesos)}, estimado con ${num(G.n_pesos[canal])} evaluaciones. El reporte no trae la fórmula: los pesos sirven para comparar, no son oficiales.</p>` : ''}`);
  }

  function graficaPerdidos(cont, canal, nombre) {
    const g = D.desglose.canal[canal] || {};
    const filas = D.metricas.map((m, i) => ({ m, p: (g.perdidos || [])[i], v: (g.prom || [])[i] })).filter(x => x.p != null).sort((a, b) => b.p - a.p);
    if (!filas.length) { cont.innerHTML = '<p class="muted">Sin datos.</p>'; return; }
    Graficas.barras(cont, {
      titulo: `Puntos que quita cada submétrica en ${nombre}`, max: Math.max(1, ...filas.map(x => x.p)), anchoEtiqueta: 170, margenDerecho: 70, altoFila: 32,
      filas: filas.map((x, j) => ({ etiqueta: x.m.nombre, valor: x.p, color: j === 0 ? ROJO : NEGRO, texto: `−${num(x.p, 1)} pts`,
                                    tip: `<b>${esc(x.m.nombre)} · ${esc(nombre)}</b><br>Promedio ${num(x.v, 1)}% · quita ${num(x.p, 1)} puntos en promedio` })),
    });
  }

  // ── Mix ───────────────────────────────────────────────────────────────
  function mixPanel() {
    const panel = $('p-mix');
    if (panel.dataset.listo === D.unidad) return;
    panel.dataset.listo = D.unidad;
    if (!D.mix) { panel.innerHTML = SIGUIENTE_PUBLICACION; return; }
    const M = D.mix, conFuera = M.total.fuera > 0;
    const pct = (n, t) => t ? `${num(n / t * 100, 1)}%` : '—';
    const cabTipos = M.tipos.map((t, i) => `<th colspan="2" class="centro mix-tipo"><span class="prio ${PRIO[i + 1].clase}">${PRIO[i + 1].corto}</span> ${esc(t)}</th>`).join('');
    const tabla = (clave, llave, fuera) => {
      const celdas = f => {
        const t = f[llave], par = n => `<td class="mix-n">${num(n)}</td><td class="mix-p">${pct(n, t)}</td>`;
        return f[clave].map(par).join('') + (fuera ? par(f.fuera) : '') + `<td class="mix-total">${num(t)}</td>`;
      };
      return `<div class="tabla-scroll"><table class="ice-tabla tabla-mix">
        <thead><tr><th rowspan="2">Jefatura</th>${cabTipos}${fuera ? '<th colspan="2" class="centro mix-tipo">Fuera del universo</th>' : ''}<th rowspan="2">Total</th></tr>
          <tr>${[...M.tipos, ...(fuera ? [''] : [])].map(() => '<th>Clientes</th><th>%</th>').join('')}</tr></thead>
        <tbody>${M.filas.filter(f => f[llave]).map(f => `<tr><th scope="row">${esc(f.zona)}</th>${celdas(f)}</tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Unidad</th>${celdas(M.total)}</tr></tfoot>
      </table></div>`;
    };
    panel.innerHTML = `
      <div class="ice-descargas">
        <button type="button" class="ice-btn rojo" id="btnMix">${svgIcono('excel')}Descargar Mix en Excel</button>
        <span>Las dos tablas de esta pestaña, una por hoja, con el estilo de marca.</span>
      </div>
      ${seccion('Mix de clientes evaluados', `Clientes evaluados en ${esc(D.mes)} por jefatura y tipo. El % es sobre el total de evaluados de cada jefatura.`, tabla('evaluados', 'total_evaluados', conFuera))}
      ${seccion('Clientes de cada tipo', `Cuántos clientes de cada tipo hay en el universo ICE de cada jefatura. El % es sobre el total de clientes de la jefatura.`, tabla('universo', 'total_universo', false))}
      ${tiposCliente(true)}`;
    $('btnMix').addEventListener('click', () => bajarExcel(M.excel));
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

  // extra: HTML debajo de los botones; destino: [lat, lon] de "Cómo llegar" si no son las del universo
  function popupCliente(c, extra = '', destino = null) {
    const [sap, nombre, lat, lon, prio, zi, ruta, zpv, vprev, vant, ultima, ultimoIce, promHist, dir, semana, enSemana, conFecha, ult] = c;
    const evs = porSapEval[sap] || [];
    // La del mes si ya se evaluó (misma forma que la última evaluación)
    const u = evs.length ? [evs[0][5], evs[0][4], evs[0][6], evs[0][7], evs[0][8], evs[0][9]] : ult;
    return `<div class="pc"><div class="pc-cab ${PRIO[prio].clase}"><b>${esc(nombre || 'Cliente sin nombre')}</b>
        <span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
        <span>${PRIO[prio].nombre} · ${evs.length ? `evaluado en ${esc(D.mes)}: ICE ${dec1(evs[0][6])}` : `sin evaluar en ${esc(D.mes)}`}</span></div>
      ${destino ? enlacesMapa(destino[0], destino[1]) : enlacesMapa(lat, lon)}${extra}
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
    return `<div class="pc"><div class="pc-cab ${prio === 1 ? 'p1' : prio >= 3 ? 'p3' : ''}"><b>${esc(nombre || 'Cliente sin nombre')}</b>
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
        <p class="mapa-resumen">Universo ICE de ${esc(D.unidad)}: <b>${num(D.clientes.length)}</b> clientes · <b>prioridad 1</b> ${num(P.p1)} · <b>prioridad 2</b> ${num(P.p2)} · <b>prioridad 3</b> ${num(P.p3)} · <b>no prioritarios</b> ${num(P.no_prioritario)}. Evaluados en ${esc(D.mes)}: <b>${num(D.evaluados.length)}</b>${sinCoordEv + sinCoordU ? ` (${num(sinCoordEv + sinCoordU)} sin coordenadas no aparecen en el mapa)` : ''}.</p>
        ${tiposCliente(false)}
        <div class="mapa-controles">
          <div class="chips">
            ${[1, 2, 3, 4].map(p => `<button type="button" class="chip on" aria-pressed="true" data-p="${p}"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre} · ${num(hechos[p] || 0)}/${num(total[p] || 0)} evaluados</button>`).join('')}
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
    const estado = { prios: new Set([1, 2, 3, 4]), pendientes: false, modo: null };
    const marcadores = [], marcadorDe = {}, indice = [], limites = [];
    const marcaDiv = (html, tam, z) => ({ keyboard: false, zIndexOffset: z, riseOnHover: true,
      icon: L.divIcon({ className: 'ev-icono', html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2] }) });
    const pintar = () => {
      capa.clearLayers();
      marcadores.length = 0;
      for (const k of Object.keys(marcadorDe)) delete marcadorDe[k];
      const falto = estado.modo === 'falto', lista = [];
      // No prioritarios abajo y prioridad 1 encima
      for (const c of [...D.clientes].sort((a, b) => b[4] - a[4])) {
        const [sap, nombre, lat, lon, prio, , , , , , , , , , , , , ult] = c;
        const hecho = !!porSapEval[sap];
        if (lat == null || !estado.prios.has(prio) || (estado.pendientes && hecho)) continue;
        const s = PRIO[prio], z = (5 - prio) * 100;
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
        $('leyendaFalto').innerHTML = `<p class="leyenda-texto">Símbolo = submétrica que más puntos le quitó a cada cliente en su última evaluación ICE (prioridad 1, 2 y 3; los no prioritarios nunca se han evaluado; color = tipo de cliente). <b>${num(lista.length)}</b> en el mapa${lista.length > pend ? `, <b>${num(pend)}</b> aún sin ICE en ${esc(D.mes)}; <span class="visto-mini" aria-hidden="true">${svgIcono('ok')}</span> = ya evaluado (su evaluación de ${esc(D.mes)})` : `, todos aún sin ICE en ${esc(D.mes)}`}:</p>${leyendaSimbolos(contar(lista, c => idPeor(c[17])))}`;
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

  // ── Polígonos ─────────────────────────────────────────────────────────
  // Tres tipos de polígonos, cada uno con su KMZ. Cuando la publicación trae
  // las manzanas de OpenStreetMap sus límites corren por las calles
  // (Programas/poligonos_calles.py); si no, salen las curvas de densidad.
  //   · ice: zonas donde se concentran los clientes evaluados en ICE (regiones
  //     de mayor densidad de probabilidad de las evaluaciones, kernel gaussiano
  //     adaptativo, ver Programas/poligonos_ice.py) de los últimos meses o de
  //     todo el histórico del universo ICE.
  //   · jefaturas: el terreno de la unidad dividido en jefaturas, según los
  //     clientes de la Master Data y su jefatura (JefaturasFrecuencia).
  //   · restan: zonas que más le restan a la unidad: la misma densidad, pero
  //     cada evaluación pesa los puntos que quedó debajo del promedio de la
  //     unidad en su canal. Al abrir una zona se ven las rutas que la cruzan.
  // En ice y restan cada nivel es la superficie más chica que reúne ese % del
  // peso, así que se enciman (el 50 % queda dentro del 75 % y este del 90 %);
  // se dibujan del más amplio al más chico para que el toque caiga en el de
  // encima.
  const TIPOS_POL = {
    ice: { nombre: 'Concentración ICE', color: ROJO, linea: { 50: '#C40000', 75: ROJO, 90: ROJO },
           niveles: { 50: 'Núcleo', 75: 'Zona alta', 90: 'Zona amplia' } },
    jefaturas: { nombre: 'Jefaturas' },
    restan: { nombre: 'Zonas que más restan', color: NEGRO, linea: { 50: NEGRO, 75: NEGRO, 90: GRIS_OSC },
              niveles: { 50: 'Foco', 75: 'Zona de pérdida', 90: 'Zona amplia' } },
  };
  const RELLENO_POL = { 50: 0.42, 75: 0.24, 90: 0.12 }, GROSOR_POL = { 50: 2, 75: 1.5, 90: 1.2 };
  // Colores de las jefaturas (los mapas de límites usan un color por zona)
  const COLORES_JEF = ['#E8B500', '#111111', '#2F5BD0', '#9B30C9', '#4E9A2A', '#F40000', '#8B5A3C', '#0FA3A3',
                       '#E87D0D', '#D6408E'];
  const colorJef = k => COLORES_JEF[k % COLORES_JEF.length];
  const diaMes = iso => { const { m, d } = partes(iso); return `${d} de ${MESES[m - 1]}`; };
  const periodoPol = M => !M.desde || !M.hasta ? 'sin evaluaciones'
    : `del ${diaMes(M.desde)}${M.desde.slice(0, 4) !== M.hasta.slice(0, 4) ? ` de ${M.desde.slice(0, 4)}` : ''} al ${fechaLarga(M.hasta)}`;
  const partePct = (n, total) => total ? `${num(n / total * 100, 0)} %` : '—';
  const nombreModoPol = modo => modo === 'historico' ? 'Todo el histórico ICE' : `Últimos ${D.poligonos.meses} meses`;

  // Punto dentro de un anillo [[lat, lon]] (regla par-impar)
  function dentroAnillo(a, lat, lon) {
    let dentro = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [yi, xi] = a[i], [yj, xj] = a[j];
      if ((yi > lat) !== (yj > lat) && lon < xi + (lat - yi) * (xj - xi) / (yj - yi)) dentro = !dentro;
    }
    return dentro;
  }

  // Un polígono [exterior, huecos...] con su caja
  function conCaja(anillos) {
    const la = anillos[0].map(c => c[0]), lo = anillos[0].map(c => c[1]);
    return { anillos, s: Math.min(...la), n: Math.max(...la), o: Math.min(...lo), e: Math.max(...lo) };
  }
  const enCaja = (q, lat, lon) => lat >= q.s && lat <= q.n && lon >= q.o && lon <= q.e
    && dentroAnillo(q.anillos[0], lat, lon) && !q.anillos.slice(1).some(h => dentroAnillo(h, lat, lon));

  // Polígonos de cada nivel con su caja, del 50 % al 90 %
  function cajasPoligonos(R) {
    return [...R.niveles].sort((a, b) => a.p - b.p).map(n => ({ p: n.p, poligonos: n.poligonos.map(q => conCaja(q.anillos)) }));
  }

  // Nivel más chico (50, 75 o 90) cuya zona contiene al punto, o null
  function nivelDe(cajas, lat, lon) {
    for (const { p, poligonos } of cajas) {
      for (const q of poligonos) if (enCaja(q, lat, lon)) return p;
    }
    return null;
  }

  // Rutas con clientes dentro de unos polígonos ([[exterior, huecos...]]), con
  // los días en que los visitan: [{i, codigo, jefatura, dentro, total, dias}]
  function rutasQueCruzan(poligonos) {
    const S = D.rutas_semana;
    if (!S) return [];
    const cajas = poligonos.map(conCaja), salida = [];
    S.rutas.forEach((r, i) => {
      const idx = new Set();
      r.puntos.forEach(([lat, lon], k) => { if (cajas.some(q => enCaja(q, lat, lon))) idx.add(k); });
      if (!idx.size) return;
      const dias = [];
      let jefatura = '';
      for (const d of S.dias) {
        const f = d.rutas.find(x => x[0] === i);
        if (!f) continue;
        jefatura = jefatura || f[1];
        if (f[2].some(k => idx.has(k))) dias.push(d.letra);
      }
      salida.push({ i, codigo: r.codigo, jefatura, dentro: idx.size, total: r.puntos.length, dias });
    });
    return salida.sort((a, b) => b.dentro - a.dentro || a.codigo.localeCompare(b.codigo));
  }

  function htmlRutasCruzan(poligonos) {
    if (!D.rutas_semana) return '';
    const rs = rutasQueCruzan(poligonos);
    if (!rs.length) return '<p class="pc-nota">Ninguna ruta tiene clientes aquí.</p>';
    return `<div class="pc-rutas"><p class="pc-rutas-tit">Rutas que cruzan aquí · ${num(rs.length)}</p>
      <ul>${rs.map(r => `<li><span class="ruta-sw" style="background:${colorRuta(r.i)}" aria-hidden="true"></span><b>${esc(r.codigo)}</b>
        <span>${plural(r.dentro, 'cliente')} aquí de ${num(r.total)}${r.jefatura ? ` · ${esc(r.jefatura)}` : ''}</span><span class="pc-dias" title="Días en que visita a esos clientes">${esc(r.dias.join(' '))}</span></li>`).join('')}</ul>
      <p class="pc-nota">Clientes activos de cada ruta (Master Data) dentro de la zona y días en que los visita (L M R J V S).</p></div>`;
  }

  // Ruta sobre los polígonos: x = {codigo, jefatura, n, cuenta: {50, 75, 90}}
  function popupRutaPol(x, dia, nombres) {
    const pct = c => `${partePct(c, x.n)} <span class="muted">(${num(c)})</span>`;
    return `<div class="pc"><div class="pc-cab"><b>Ruta ${esc(x.codigo)}</b>
        <span>${esc(dia)} · ${esc(x.jefatura || 'Sin jefatura')} · ${plural(x.n, 'cliente')}</span></div>
      ${nombres ? `<dl class="pc-cuerpo">${[50, 75, 90].map(p => fila(`En ${nombres[p].toLowerCase()}`, pct(x.cuenta[p]))).join('')}</dl>
      <p class="pc-nota">De sus clientes de ese día; cada zona incluye a las más chicas.</p>` : ''}</div>`;
  }

  function popupPoligono(tipo, p, k, q, R, M) {
    const T = TIPOS_POL[tipo], nombre = `${T.niveles[p]} ${k + 1}`;
    const huecos = q.anillos.length > 1 ? fila('Huecos', `${num(q.anillos.length - 1)} <span class="muted">(áreas fuera de la zona)</span>`) : '';
    if (tipo === 'restan') {
      const peor = (q.peor || []).map(([i, pts]) => `${esc(D.metricas[i].nombre)} <b>−${num(pts, 1)}</b>`).join(' · ');
      return `<div class="pc"><div class="pc-cab"><b>${esc(nombre)}</b>
          <span>Nivel ${p} %: las zonas que juntan el ${p} % de los puntos por debajo del promedio de la unidad</span></div>
        <dl class="pc-cuerpo">${fila('ICE promedio aquí', `<b>${num(q.ice, 1)}</b> <span class="muted">(unidad ${num(M.promedio_total, 1)})</span>`)}
          ${q.impacto != null && q.impacto > 0 ? fila('Le resta a la unidad', `<b>${num(q.impacto, 2)}</b> puntos de promedio`) : ''}
          ${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${plural(q.clientes, 'cliente')})</span>`)}
          ${fila('Puntos debajo del promedio', `${num(q.puntos)} <span class="muted">(${partePct(q.puntos, R.puntos)} del total)</span>`)}
          ${peor ? fila('Lo que más quita aquí', peor) : ''}
          ${fila('Superficie', `${num(q.area_km2, 2)} km²`)}${huecos}</dl>
        ${htmlRutasCruzan([q.anillos])}</div>`;
    }
    return `<div class="pc"><div class="pc-cab${p === 50 ? ' p1' : ''}"><b>${esc(nombre)}</b>
        <span>Nivel ${p} %: las zonas más densas, que juntas reúnen el ${p} % de la densidad de las evaluaciones</span></div>
      <dl class="pc-cuerpo">${fila('Evaluaciones', `${num(q.evaluaciones)} <span class="muted">(${partePct(q.evaluaciones, R.evaluaciones)} del periodo)</span>`)}
        ${fila('Clientes', num(q.clientes))}${fila('Superficie', `${num(q.area_km2, 2)} km²`)}${huecos}</dl>
      ${htmlRutasCruzan([q.anillos])}</div>`;
  }

  function popupJefatura(j, color) {
    const z = D.por_zona.find(x => x.zona === j.jefatura);
    return `<div class="pc"><div class="pc-cab" style="background:${color};color:${Graficas.tintaSobre(color)}"><b>Jefatura ${esc(j.jefatura)}</b>
        <span>${plural(j.clientes, 'cliente activo', 'clientes activos')} · ${plural(j.rutas, 'ruta')} · ${num(j.area_km2, 1)} km²</span></div>
      <dl class="pc-cuerpo">${fila('Clientes dentro del polígono', `${partePct(j.dentro, j.clientes)} <span class="muted">(${num(j.dentro)} de ${num(j.clientes)})</span>`)}
        ${z ? fila(`ICE de ${D.mes}`, z.promedio == null ? 'sin evaluaciones' : `<b>${num(z.promedio, 1)}</b> <span class="muted">(${plural(z.n, 'evaluación', 'evaluaciones')})</span>`) : ''}
        ${z ? fila('Universo ICE', `${num(z.universo)} clientes · P1 ${num(z.p1_eval)}/${num(z.p1)} evaluados`) : ''}
        ${j.anillos.length > 1 ? fila('Partes', `${num(j.anillos.length)} <span class="muted">(la jefatura tiene zonas separadas)</span>`) : ''}</dl>
      ${htmlRutasCruzan(j.anillos)}</div>`;
  }

  // Datos de los clientes de los puntos (Programas/publica_ice.py, _clientes_poligonos)
  const datosPuntos = () => (D.poligonos && D.poligonos.clientes) || {};
  const nombrePunto = sap => {
    const c = porSapCliente[sap], f = (datosPuntos().fuera || {})[sap];
    return (c ? c[1] : f && f[0]) || 'Cliente sin nombre';
  };

  // Calificaciones ICE del cliente de un punto. En gris, las que quedan fuera del
  // periodo que se ve; en "zonas que más restan", en rojo las debajo del promedio
  function htmlCalificaciones(pt, tipo, M) {
    const restan = tipo === 'restan', lista = (datosPuntos().calificaciones || {})[pt[3]] || [];
    const resumen = restan
      ? `${esc(periodoPol(M))}: ICE promedio <b>${num(pt[5], 1)}</b> en ${plural(pt[4], 'evaluación', 'evaluaciones')} · <b>${num(pt[2], 1)}</b> puntos debajo del promedio de la unidad`
      : `${esc(periodoPol(M))}: <b>${plural(pt[2], 'evaluación', 'evaluaciones')}</b>`;
    const filas = lista.map(([f, ci, v]) => {
      const canal = D.canales[ci], ref = restan ? M.promedio[canal] : null;
      const bajo = v != null && ref != null && v < ref;
      return `<tr${M.desde && f < M.desde ? ' class="fuera"' : ''}><td>${f ? `${esc(fechaCorta(f))} ${partes(f).a}` : '—'}</td><td>${esc(canal)}</td><td class="${bajo ? 'bajo' : ''}">${dec1(v)}</td></tr>`;
    }).join('');
    return `<div class="pc-cal"><p class="pc-rutas-tit">Calificaciones ICE${lista.length ? ` · ${num(lista.length)}` : ''}</p>
      <p class="pc-cal-res">${resumen}</p>
      ${filas ? `<table class="pc-cal-tabla"><thead><tr><th>Fecha</th><th>Canal</th><th>ICE</th></tr></thead><tbody>${filas}</tbody></table>` : ''}</div>`;
  }

  // Ficha de un punto de cliente: pt = [lat, lon, peso, sap, ...]
  function popupPuntoPol(pt, tipo, M) {
    const [lat, lon, , sap] = pt, c = porSapCliente[sap], cal = htmlCalificaciones(pt, tipo, M);
    if (c) return popupCliente(c, cal, [lat, lon]);
    const [, ruta, jefatura, dir, u] = (datosPuntos().fuera || {})[sap] || [];
    return `<div class="pc"><div class="pc-cab p3"><b>${esc(nombrePunto(sap))}</b>
        <span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
        <span>Fuera del universo ICE de ${esc(D.unidad)}</span></div>
      ${enlacesMapa(lat, lon)}${cal}
      <dl class="pc-cuerpo">${fila('Dirección', esc(dir || ''))}${fila('Jefatura', esc(jefatura || ''))}${fila('Ruta', esc(ruta || ''))}
        ${u ? fila('Le faltó', `<b>${esc(nombrePeor(u))}</b> <span class="muted">(última evaluación, ${esc(fechaCorta(u[0]))})</span>`) : ''}</dl>
      ${u ? metricasPopup(u[1], u[3], u[4]) : ''}</div>`;
  }

  function poligonos() {
    const panel = $('p-poligonos');
    if (mapaP) { setTimeout(() => mapaP.invalidateSize(), 50); return; }
    const PG = D.poligonos;
    if (!PG) {
      panel.innerHTML = '<div class="mapa-barra"><p class="mapa-resumen">Los polígonos aparecen a partir de la siguiente publicación del sitio.</p></div>';
      return;
    }
    const JEF = PG.jefaturas || [];
    const hay = { ice: true, jefaturas: JEF.length > 0, restan: !!PG.restan };
    const cuadrado = !!((PG.recientes.resultado || {}).calles);
    const falta = { jefaturas: 'Las jefaturas se trazan con las calles de OpenStreetMap; aparecen en la siguiente publicación en que se puedan bajar.',
                    restan: 'Aparece a partir de la siguiente publicación del sitio.' };
    panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <div class="segmento" id="poliTipo" role="group" aria-label="Tipo de polígonos">
            ${Object.entries(TIPOS_POL).map(([t, T]) => `<button type="button" data-tipo="${t}" aria-pressed="${t === 'ice'}"${hay[t] ? '' : ` disabled title="${esc(falta[t])}"`}>${esc(T.nombre)}</button>`).join('')}
          </div>
          <div class="segmento" id="poliPeriodo" role="group" aria-label="Evaluaciones de los polígonos">
            <button type="button" data-modo="recientes" aria-pressed="true">${esc(nombreModoPol('recientes'))}</button>
            <button type="button" data-modo="historico" aria-pressed="false">${esc(nombreModoPol('historico'))}</button>
          </div>
        </div>
        <div class="poli-descargas" id="poliDescargas" role="group" aria-label="Descargas en KMZ">
          <span class="poli-rutas-tit">Descargar KMZ:</span>
          <button type="button" class="ice-btn rojo" data-kmz="ice">${svgIcono('descarga')}Concentración ICE</button>
          <button type="button" class="ice-btn" data-kmz="jefaturas"${hay.jefaturas ? '' : ' disabled'}>${svgIcono('descarga')}Jefaturas</button>
          <button type="button" class="ice-btn sec" data-kmz="restan"${hay.restan ? '' : ' disabled'}>${svgIcono('descarga')}Zonas que más restan</button>
        </div>
        <p class="mapa-resumen" id="poliResumen"></p>
        <div class="chips" id="poliNiveles" role="group" aria-label="Zonas en el mapa"></div>
        <div class="chips poli-rutas" id="poliRutas" role="group" aria-label="Rutas del día de la semana"></div>
        <p class="mapa-ayuda" id="poliAyuda"></p>
        <p class="mapa-ayuda" id="kmzEstado" role="status" aria-live="polite"></p>
      </div>
      <div class="rutas-cuerpo">
        <div id="mapaPoli" class="mapa"></div>
        <aside class="rutas-lista" aria-label="Zonas y rutas"><ul id="listaPoli"></ul></aside>
      </div>`;

    mapaP = L.map('mapaPoli');
    capaBase(mapaP);
    botonUbicacion(mapaP);
    const capaPol = L.layerGroup().addTo(mapaP), capaPts = L.layerGroup(), capaNombres = L.layerGroup().addTo(mapaP);
    // Rutas y puntos de clientes en un solo lienzo, encima de los polígonos
    // (los puntos se agregan después y quedan sobre las rutas); etiquetas al acercar
    mapaP.createPane('rutasPoli').style.zIndex = 450;
    const rendRutas = L.canvas({ pane: 'rutasPoli', padding: 0.4, tolerance: TACTIL ? 10 : 5 });
    const capaRutas = L.layerGroup().addTo(mapaP), capaEtiq = L.layerGroup();
    const S = D.rutas_semana;
    // dia = índice en S.dias (null = sin rutas); jefs = jefaturas encendidas
    const estado = { tipo: 'ice', modo: 'recientes', niveles: new Set([50, 75, 90]), jefs: new Set(JEF.map((_, k) => k)),
                     puntos: false, dia: null };
    let capas = {}, lineas = {}, resaltada = null, encuadrado = false;
    const calles = cuadrado ? 'Los límites corren por las calles: cada zona es la unión de las manzanas (calles de OpenStreetMap) que cubre. ' : '';
    const AYUDA = {
      ice: `Cada zona sombreada es la superficie más chica que reúne el 50, 75 o 90 % de la densidad de probabilidad de las evaluaciones ICE (kernel gaussiano adaptativo: más fino donde hay muchos clientes evaluados y más amplio donde hay pocos; cada cliente pesa las veces que se evaluó). ${calles}Las zonas se enciman: el núcleo está dentro de la zona alta y esta dentro de la amplia. ${TACTIL ? 'Toca' : 'Haz clic en'} una zona para ver cuántas evaluaciones y clientes reúne y qué rutas la cruzan. Con <b>Clientes evaluados</b> encendido, ${TACTIL ? 'toca' : 'haz clic en'} un punto para ver sus calificaciones ICE, cómo llegar y sus datos.`,
      jefaturas: `Cada polígono encierra a los clientes activos de una jefatura (Master Data y JefaturasFrecuencia). Cada manzana es de la jefatura con más clientes dentro y los límites se emparejan por las calles (calles de OpenStreetMap), así que algún cliente puede quedar del otro lado: cada jefatura dice qué parte de sus clientes quedó dentro. ${TACTIL ? 'Toca' : 'Haz clic en'} una jefatura para ver sus clientes, su ICE del mes y sus rutas.`,
      restan: `Zonas donde se juntan los puntos que las evaluaciones ICE quedaron por debajo del promedio de la unidad en su canal: ahí es donde más baja la calificación de la unidad (una evaluación arriba del promedio no pesa). ${calles}El foco reúne el 50 % de esos puntos, la zona de pérdida el 75 % y la amplia el 90 %. ${TACTIL ? 'Toca' : 'Haz clic en'} una zona para ver su ICE, cuánto le resta al promedio de la unidad, las submétricas que más quitan ahí y <b>las rutas que la cruzan</b>. Con <b>Clientes debajo del promedio</b> encendido, ${TACTIL ? 'toca' : 'haz clic en'} un punto para ver sus calificaciones ICE, cómo llegar y sus datos.`,
    };
    const ayudaComun = ' Con <b>Rutas</b> se dibujan las del día elegido (solo líneas y su código, que aparece al acercar el mapa). Cada tipo de polígono se descarga en su botón de KMZ, sin clientes ni rutas, para abrirlo en Google Earth, Google My Maps o QGIS.';
    const ponerEtiquetas = () => {
      if (estado.dia != null && mapaP.getZoom() >= ZOOM_ETIQUETAS) capaEtiq.addTo(mapaP); else mapaP.removeLayer(capaEtiq);
    };
    mapaP.on('zoomend', ponerEtiquetas);
    if (S) $('poliRutas').innerHTML = '<span class="poli-rutas-tit">Rutas:</span><button type="button" class="chip" aria-pressed="true" data-dia="">Sin rutas</button>'
      + S.dias.map((d, i) => `<button type="button" class="chip" aria-pressed="false" data-dia="${i}">${esc(d.dia)}${d.hoy ? ' · hoy' : ''}</button>`).join('');
    const datosDe = tipo => tipo === 'ice' ? PG[estado.modo] : tipo === 'restan' ? PG.restan : null;

    // Rutas del día elegido sobre los polígonos: líneas, etiquetas y, por
    // ruta, cuántos de sus clientes caen en cada zona (R = niveles; null en
    // jefaturas). Devuelve [texto para el resumen, renglones de la lista]
    const pintarRutas = (R, nombres) => {
      capaRutas.clearLayers();
      capaEtiq.clearLayers();
      lineas = {};
      resaltada = null;
      if (!S || estado.dia == null) { ponerEtiquetas(); return ['', '']; }
      const d = S.dias[estado.dia], dia = d.dia.toLowerCase(), cajas = R ? cajasPoligonos(R) : null;
      const chico = nombres ? nombres[50].toLowerCase() : '';
      const infos = d.rutas.map(([i, jefatura, orden]) => {
        const ruta = S.rutas[i], coords = orden.map(k => ruta.puntos[k]), color = colorRuta(i);
        const unicos = [...new Set(orden)].map(k => ruta.puntos[k]);
        const cuenta = { 50: 0, 75: 0, 90: 0 };
        if (cajas) for (const [lat, lon] of unicos) {
          const p = nivelDe(cajas, lat, lon);
          if (p) for (const q of [50, 75, 90]) if (q >= p) cuenta[q]++;
        }
        const x = { i, codigo: ruta.codigo, jefatura, color, n: unicos.length, cuenta };
        if (coords.length > 1) {
          L.polyline(coords, { renderer: rendRutas, color: BLANCO, weight: 6, opacity: 0.8, interactive: false }).addTo(capaRutas);
          x.linea = L.polyline(coords, { renderer: rendRutas, color, weight: 3, opacity: 0.95 })
            .bindPopup(() => popupRutaPol(x, d.dia, cajas ? nombres : null), { maxWidth: 300 }).addTo(capaRutas);
          if (!TACTIL) x.linea.bindTooltip(`Ruta <b>${esc(ruta.codigo)}</b>${cajas ? ` · ${partePct(cuenta[50], x.n)} en ${esc(chico)}` : ''}`, { sticky: true, opacity: 0.95 });
        }
        const c = coords.reduce((a, p) => [a[0] + p[0] / coords.length, a[1] + p[1] / coords.length], [0, 0]);
        L.marker(c, { interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'ruta-etiqueta', html: `<span style="background:${color};color:${Graficas.tintaSobre(color)}">${esc(ruta.codigo)}</span>`, iconSize: null }) })
          .addTo(capaEtiq);
        lineas[i] = x;
        return x;
      });
      ponerEtiquetas();
      const parte = (x, q) => x.n ? x.cuenta[q] / x.n : 0;
      infos.sort((a, b) => parte(b, 50) - parte(a, 50) || parte(b, 75) - parte(a, 75) || b.n - a.n);
      const mitad = infos.filter(x => parte(x, 50) >= 0.5).length;
      const texto = ` · Rutas del <b>${esc(dia)}</b>${d.hoy ? ' (hoy)' : ''}: <b>${num(infos.length)}</b> rutas${cajas ? `, <b>${num(mitad)}</b> con la mitad o más de sus clientes en un ${esc(chico)}` : ''}.`;
      const lista = `<li class="poli-grupo">Rutas del ${esc(dia)} <span>${plural(infos.length, 'ruta')}${cajas ? ` · por % de clientes en ${esc(chico)}` : ''}</span></li>`
        + infos.map(x => `<li><button type="button" class="ruta-item" data-ruta="${x.i}">
          <span class="ruta-sw" style="background:${x.color}" aria-hidden="true"></span>
          <span class="ruta-cod">${esc(x.codigo)}</span>${cajas ? `<span class="poli-pct">${partePct(x.cuenta[50], x.n)} ${esc(chico)}</span>` : '<span></span>'}
          <span class="ruta-info">${cajas ? `${partePct(x.cuenta[75], x.n)} en ${esc(nombres[75].toLowerCase())} · ${partePct(x.cuenta[90], x.n)} en amplia · ` : ''}${esc(x.jefatura || 'Sin jefatura')} · ${plural(x.n, 'cliente')}</span></button></li>`).join('');
      return [texto, lista];
    };

    const encuadrar = () => {
      if (encuadrado) return;
      const pts = PG.recientes.puntos.map(p => [p[0], p[1]]);
      if (pts.length) mapaP.fitBounds(limitesRobustos(pts).pad(0.04)); else mapaP.setView([19.38, -99.14], 11);
      encuadrado = true;
    };

    // Jefaturas: un color por jefatura, borde grueso y su nombre encima
    const pintarJefaturas = () => {
      const [textoRutas, listaRutas] = pintarRutas(null, null);
      const total = JEF.reduce((a, j) => a + j.clientes, 0), dentro = JEF.reduce((a, j) => a + j.dentro, 0);
      $('poliResumen').innerHTML = `<b>Jefaturas</b>: <b>${num(JEF.length)}</b> jefaturas con <b>${num(total)}</b> clientes activos de la Master Data; el <b>${partePct(dentro, total)}</b> queda dentro del polígono de su jefatura.${textoRutas}`;
      $('poliNiveles').innerHTML = JEF.map((j, k) => `<button type="button" class="chip" aria-pressed="${estado.jefs.has(k)}" data-jef="${k}"><span class="poli-sw jef" style="--c:${colorJef(k)}" aria-hidden="true"></span>${esc(j.jefatura)} · ${num(j.clientes)} clientes</button>`).join('')
        + `<button type="button" class="chip" aria-pressed="${estado.puntos}" data-puntos="1"><span class="poli-pt" aria-hidden="true"></span>Clientes del universo ICE (${num(D.clientes.filter(c => c[2] != null).length)})</button>`;
      const indice = Object.fromEntries(JEF.map((j, k) => [j.jefatura, k]));
      JEF.forEach((j, k) => {
        const color = colorJef(k);
        const capa = L.polygon(j.anillos, { color, weight: 4, opacity: 0.95, fillColor: color, fillOpacity: 0.16, lineJoin: 'miter' })
          .bindPopup(() => popupJefatura(j, color), { maxWidth: 330 });
        capa.anillosPol = j.anillos;
        capa.orden = 0;
        if (!TACTIL) capa.bindTooltip(`<b>Jefatura ${esc(j.jefatura)}</b> · ${num(j.clientes)} clientes · ${num(j.area_km2, 1)} km²`, { sticky: true, opacity: 0.95 });
        // El nombre va en el centro de su parte más grande
        const mayor = j.anillos.reduce((a, b) => b[0].length > a[0].length ? b : a)[0];
        const c = mayor.reduce((a, p) => [a[0] + p[0] / mayor.length, a[1] + p[1] / mayor.length], [0, 0]);
        capa.nombre = L.marker(c, { interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'ruta-etiqueta jef-etiqueta', html: `<span style="background:${color};color:${Graficas.tintaSobre(color)}">${esc(j.jefatura)}</span>`, iconSize: null }) });
        capas[`j-${k}`] = capa;
        if (estado.jefs.has(k)) { capa.addTo(capaPol); capa.nombre.addTo(capaNombres); }
      });
      for (const c of D.clientes) {
        if (c[2] == null) continue;
        const k = indice[D.zonas[c[5]]];
        const m = L.circleMarker([c[2], c[3]], { renderer: rendRutas, radius: 3.5, color: BLANCO, weight: 0.8, fillColor: k == null ? GRIS : colorJef(k), fillOpacity: 0.95 });
        if (!TACTIL) m.bindTooltip(`<b>${esc(c[1] || 'Cliente sin nombre')}</b> · SAP ${esc(c[0])} · ${esc(D.zonas[c[5]])}`, { direction: 'top', offset: [0, -4], opacity: 0.95 });
        m.addTo(capaPts);
      }
      if (estado.puntos) capaPts.addTo(mapaP); else mapaP.removeLayer(capaPts);
      $('listaPoli').innerHTML = listaRutas + `<li class="poli-grupo">Jefaturas <span>${plural(JEF.length, 'jefatura')}</span></li>`
        + JEF.map((j, k) => {
          const z = D.por_zona.find(x => x.zona === j.jefatura);
          return `<li><button type="button" class="ruta-item" data-capa="j-${k}">
            <span class="poli-sw jef" style="--c:${colorJef(k)}" aria-hidden="true"></span>
            <span class="ruta-cod">${esc(j.jefatura)}</span><span>${num(j.area_km2, 1)} km²</span>
            <span class="ruta-info">${num(j.clientes)} clientes · ${plural(j.rutas, 'ruta')}${z && z.promedio != null ? ` · ICE ${num(z.promedio, 1)}` : ''}</span></button></li>`;
        }).join('');
    };

    const pintar = () => {
      const tipo = estado.tipo, T = TIPOS_POL[tipo];
      capaPol.clearLayers();
      capaPts.clearLayers();
      capaNombres.clearLayers();
      capas = {};
      $('poliPeriodo').hidden = tipo !== 'ice';
      $('poliAyuda').innerHTML = AYUDA[tipo] + ayudaComun;
      if (tipo === 'jefaturas') { pintarJefaturas(); encuadrar(); return; }
      const M = datosDe(tipo), R = M.resultado, total = R ? (tipo === 'restan' ? R.puntos : R.evaluaciones) : 0;
      const peso = q => tipo === 'restan' ? q.puntos : q.evaluaciones;
      const notas = [M.sin_coord ? `${plural(M.sin_coord, tipo === 'restan' ? 'cliente' : 'evaluación', tipo === 'restan' ? 'clientes' : 'evaluaciones')} sin coordenadas en la Master Data` : '',
                     R && R.fuera ? `${num(R.fuera)} con coordenadas lejos de la unidad` : '']
        .filter(Boolean).join(' y ');
      const [textoRutas, listaRutas] = pintarRutas(R, T.niveles);
      $('poliResumen').innerHTML = (tipo === 'restan'
        ? `<b>Zonas que más restan</b>: ${esc(periodoPol(M))} · <b>${num(M.debajo)}</b> de <b>${num(M.clientes)}</b> clientes evaluados quedaron debajo del promedio de la unidad (${Object.entries(M.promedio).filter(([, v]) => v != null).map(([c, v]) => `${esc(c)} ${num(v, 1)}`).join(', ')}) y juntan <b>${num(M.total_puntos)}</b> puntos por debajo`
        : `<b>${esc(nombreModoPol(estado.modo))}</b>${estado.modo === 'historico' ? ' (clientes del universo ICE)' : ''}: ${esc(periodoPol(M))} · <b>${num(M.evaluaciones)}</b> evaluaciones ICE de <b>${num(M.clientes)}</b> clientes`)
        + `${notas ? ` (${esc(notas)} no cuentan)` : ''}.${R ? ` Ancho de banda base ${num(R.ancho_m)} m.` : ''}${textoRutas}`;
      $('poliNiveles').innerHTML = (R ? R.niveles.map(n =>
        `<button type="button" class="chip" aria-pressed="${estado.niveles.has(n.p)}" data-nivel="${n.p}"><span class="poli-sw${tipo === 'restan' ? ' negro' : ''}" style="--a:${RELLENO_POL[n.p]}" aria-hidden="true"></span>${esc(T.niveles[n.p])} (${n.p} %) · ${partePct(peso(n), total)} de ${tipo === 'restan' ? 'los puntos' : 'las evaluaciones'} · ${num(n.area_km2, 1)} km²</button>`).join('') : '')
        + `<button type="button" class="chip" aria-pressed="${estado.puntos}" data-puntos="1"><span class="poli-pt" aria-hidden="true"></span>${tipo === 'restan' ? 'Clientes debajo del promedio' : 'Clientes evaluados'} (${num(M.puntos.length)})</button>`;

      // De la zona más amplia a la más chica: la chica queda encima
      if (R) for (const n of [...R.niveles].sort((a, b) => b.p - a.p)) {
        n.poligonos.forEach((q, k) => {
          const capa = L.polygon(q.anillos, { color: T.linea[n.p], weight: GROSOR_POL[n.p], fillColor: T.color, fillOpacity: RELLENO_POL[n.p], lineJoin: 'miter' })
            .bindPopup(() => popupPoligono(tipo, n.p, k, q, R, M), { maxWidth: 330 });
          capa.anillosPol = [q.anillos];
          capa.orden = n.p;
          if (!TACTIL) capa.bindTooltip(tipo === 'restan'
            ? `<b>${esc(T.niveles[n.p])} ${k + 1}</b> · ICE ${num(q.ice, 1)} · ${num(q.evaluaciones)} evaluaciones`
            : `<b>${esc(T.niveles[n.p])} ${k + 1}</b> · ${num(q.evaluaciones)} evaluaciones · ${num(q.area_km2, 2)} km²`, { sticky: true, opacity: 0.95 });
          capas[`${n.p}-${k}`] = capa;
          if (estado.niveles.has(n.p)) capa.addTo(capaPol);
        });
      }
      // Los puntos chicos van al final: quedan encima y se pueden tocar
      const altoFicha = Math.max(240, mapaP.getSize().y - 100);
      for (const pt of [...M.puntos].sort((a, b) => b[2] - a[2])) {
        const [lat, lon, n, sap] = pt;
        const nombre = `<b>${esc(nombrePunto(sap))}</b> · SAP ${esc(sap)}`;
        const m = L.circleMarker([lat, lon], { renderer: rendRutas, radius: Math.min(7, 2.5 + Math.sqrt(tipo === 'restan' ? n / 4 : n)), color: BLANCO, weight: 1,
                                               fillColor: tipo === 'restan' ? ROJO : NEGRO, fillOpacity: 0.85 })
          .bindPopup(() => popupPuntoPol(pt, tipo, M), { maxWidth: 330, maxHeight: altoFicha, className: 'ficha-punto' })
          .on('popupopen', e => e.target.closeTooltip());
        if (!TACTIL) m.bindTooltip(tipo === 'restan'
          ? `${nombre} · ICE ${num(pt[5], 1)} en ${plural(pt[4], 'evaluación', 'evaluaciones')} · ${num(n, 1)} puntos debajo del promedio`
          : `${nombre} · ${plural(n, 'evaluación', 'evaluaciones')}`, { direction: 'top', offset: [0, -4], opacity: 0.95 });
        m.addTo(capaPts);
      }
      if (estado.puntos) capaPts.addTo(mapaP); else mapaP.removeLayer(capaPts);

      $('listaPoli').innerHTML = listaRutas + (R ? R.niveles.map(n => `
        <li class="poli-grupo">${esc(T.niveles[n.p])} · ${n.p} % <span>${plural(n.poligonos.length, 'zona')}</span></li>
        ${n.poligonos.map((q, k) => `<li><button type="button" class="ruta-item" data-capa="${n.p}-${k}">
          <span class="poli-sw${tipo === 'restan' ? ' negro' : ''}" style="--a:${RELLENO_POL[n.p]}" aria-hidden="true"></span>
          <span class="ruta-cod">${esc(T.niveles[n.p])} ${k + 1}</span><span>${num(q.area_km2, 2)} km²</span>
          <span class="ruta-info">${tipo === 'restan'
            ? `ICE ${num(q.ice, 1)} · ${num(q.evaluaciones)} evaluaciones${q.impacto > 0 ? ` · resta ${num(q.impacto, 2)}` : ''}`
            : `${num(q.evaluaciones)} evaluaciones (${partePct(q.evaluaciones, total)}) · ${plural(q.clientes, 'cliente')}`}</span></button></li>`).join('')}`).join('')
        : `<li class="poli-grupo">Muy pocos clientes ${tipo === 'restan' ? 'debajo del promedio' : 'evaluados'} con coordenadas para calcular zonas.</li>`);
      encuadrar();
    };
    pintar();

    // El lienzo de rutas y puntos se queda con los clics que caen sobre los
    // polígonos: el que no dio en una ruta ni en un cliente abre la zona de abajo
    mapaP.on('click', e => {
      const { lat, lng } = e.latlng;
      const zona = Object.values(capas).filter(c => capaPol.hasLayer(c)).sort((a, b) => a.orden - b.orden)
        .find(c => (c.cajas = c.cajas || c.anillosPol.map(conCaja)).some(q => enCaja(q, lat, lng)));
      if (zona) zona.openPopup(e.latlng);
    });

    const segmento = (id, clave, dato) => $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (estado[clave] === b.dataset[dato]) return;
      $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      estado[clave] = b.dataset[dato];
      if (clave === 'tipo') estado.puntos = false;
      $('kmzEstado').textContent = '';
      mapaP.closePopup();
      pintar();
    }));
    segmento('poliTipo', 'tipo', 'tipo');
    segmento('poliPeriodo', 'modo', 'modo');
    $('poliNiveles').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      if (b.dataset.puntos) {
        estado.puntos = on;
        if (on) capaPts.addTo(mapaP); else mapaP.removeLayer(capaPts);
        return;
      }
      if (b.dataset.jef != null) {
        const k = +b.dataset.jef, capa = capas[`j-${k}`];
        if (on) { estado.jefs.add(k); capa.addTo(capaPol); capa.nombre.addTo(capaNombres); }
        else { estado.jefs.delete(k); capaPol.removeLayer(capa); capaNombres.removeLayer(capa.nombre); }
        return;
      }
      const p = +b.dataset.nivel;
      if (on) estado.niveles.add(p); else estado.niveles.delete(p);
      // Se vuelven a poner todas para conservar el orden (la más chica encima)
      capaPol.clearLayers();
      for (const q of [90, 75, 50]) {
        if (!estado.niveles.has(q)) continue;
        for (const [clave, capa] of Object.entries(capas)) if (clave.startsWith(q + '-')) capa.addTo(capaPol);
      }
    });
    if (S) $('poliRutas').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const dia = b.dataset.dia === '' ? null : +b.dataset.dia;
      if (dia === estado.dia) return;
      estado.dia = dia;
      $('poliRutas').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      pintar();
    });
    $('listaPoli').addEventListener('click', e => {
      const r = e.target.closest('[data-ruta]');
      if (r) {
        const x = lineas[+r.dataset.ruta];
        if (resaltada) resaltada.setStyle({ weight: 3 });
        $('listaPoli').querySelectorAll('[aria-current]').forEach(y => y.removeAttribute('aria-current'));
        r.setAttribute('aria-current', 'true');
        if (!x || !x.linea) return;
        resaltada = x.linea.setStyle({ weight: 7 });
        x.linea.bringToFront();
        mapaP.fitBounds(x.linea.getBounds().pad(0.2));
        setTimeout(() => x.linea.openPopup(x.linea.getCenter()), 300);
        if (window.innerWidth < 860) mapaP.getContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const b = e.target.closest('[data-capa]');
      if (!b) return;
      const capa = capas[b.dataset.capa], [grupo, k] = b.dataset.capa.split('-');
      const chip = $('poliNiveles').querySelector(grupo === 'j' ? `[data-jef="${k}"]` : `[data-nivel="${grupo}"]`);
      if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
      $('listaPoli').querySelectorAll('[aria-current]').forEach(x => x.removeAttribute('aria-current'));
      b.setAttribute('aria-current', 'true');
      mapaP.fitBounds(capa.getBounds().pad(0.25));
      setTimeout(() => capa.openPopup(grupo === 'j' ? capa.nombre.getLatLng() : capa.getBounds().getCenter()), 300);
      if (window.innerWidth < 860) mapaP.getContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Un KMZ por tipo de polígono: [título, descripción, carpetas, nombre del archivo]
    const fuente = cuadrado ? ' Límites trazados sobre las calles de OpenStreetMap (© colaboradores de OpenStreetMap).' : '';
    const kmzDe = tipo => {
      if (tipo === 'jefaturas') {
        return [`Jefaturas · ${D.unidad}`,
          `Polígonos de las jefaturas de la unidad ${D.unidad}: cada uno encierra a los clientes activos de la jefatura (Master Data y JefaturasFrecuencia).${fuente} Publicado ${D.generado}.`,
          [{ nombre: `Jefaturas de ${D.unidad}`, marcas: JEF.map((j, k) => {
            const z = D.por_zona.find(x => x.zona === j.jefatura);
            return { nombre: `Jefatura ${j.jefatura}`, color: colorJef(k), relleno: 0.25, ancho: 3, poligonos: j.anillos,
                     descripcion: `${num(j.clientes)} clientes activos (${partePct(j.dentro, j.clientes)} dentro del polígono) · ${num(j.rutas)} rutas · ${num(j.area_km2, 1)} km²${z && z.promedio != null ? ` · ICE de ${D.mes}: ${num(z.promedio, 1)}` : ''}`,
                     datos: { jefatura: j.jefatura, unidad: D.unidad, clientes: j.clientes, clientes_dentro: j.dentro, rutas: j.rutas, area_km2: j.area_km2,
                              ice_del_mes: z && z.promedio != null ? z.promedio : '' } };
          }) }],
          `Jefaturas_${D.unidad}_${D.hoy}.kmz`];
      }
      const M = datosDe(tipo), R = M.resultado, T = TIPOS_POL[tipo], restan = tipo === 'restan';
      const total = restan ? R.puntos : R.evaluaciones, peso = q => restan ? q.puntos : q.evaluaciones;
      const carpetas = [...R.niveles].sort((a, b) => b.p - a.p).map(n => ({
        nombre: `${T.niveles[n.p]} (${n.p} %): ${partePct(peso(n), total)} de ${restan ? 'los puntos debajo del promedio' : 'las evaluaciones'}, ${num(n.area_km2, 1)} km²`,
        marcas: n.poligonos.map((q, k) => {
          const rutas = rutasQueCruzan([q.anillos]).map(r => r.codigo).join(', ');
          const peor = (q.peor || []).map(([i, pts]) => `${D.metricas[i].nombre} −${num(pts, 1)}`).join(', ');
          return { nombre: `${T.niveles[n.p]} ${k + 1}`, color: T.color, relleno: RELLENO_POL[n.p], ancho: GROSOR_POL[n.p], poligonos: [q.anillos],
                   descripcion: restan
                     ? `ICE promedio ${num(q.ice, 1)} en ${num(q.evaluaciones)} evaluaciones de ${num(q.clientes)} clientes${q.impacto > 0 ? ` · le resta ${num(q.impacto, 2)} puntos al promedio de la unidad` : ''} · ${num(q.area_km2, 2)} km²${peor ? ` · lo que más quita: ${peor}` : ''}${rutas ? ` · rutas que la cruzan: ${rutas}` : ''}`
                     : `${num(q.evaluaciones)} evaluaciones (${partePct(q.evaluaciones, total)} del total) de ${num(q.clientes)} clientes · ${num(q.area_km2, 2)} km²${rutas ? ` · rutas que la cruzan: ${rutas}` : ''}`,
                   datos: { nivel_pct: n.p, zona: `${T.niveles[n.p]} ${k + 1}`, evaluaciones: q.evaluaciones, clientes: q.clientes, area_km2: q.area_km2,
                            ...(restan ? { ice_promedio: q.ice, puntos_debajo_del_promedio: q.puntos, resta_al_promedio: q.impacto == null ? '' : q.impacto, lo_que_mas_quita: peor } : {}),
                            rutas_que_cruzan: rutas } };
        }),
      }));
      return restan
        ? [`Zonas que más restan · ${D.unidad}`,
           `Zonas donde se juntan los puntos que las evaluaciones ICE de la unidad ${D.unidad} quedaron debajo de su promedio (por canal), ${periodoPol(M)}: ${num(M.debajo)} clientes debajo del promedio, ${num(M.total_puntos)} puntos. Cada nivel es la superficie más chica que reúne el 50, 75 o 90 % de esos puntos.${fuente} Publicado ${D.generado}.`,
           carpetas, `ZonasQueRestan_${D.unidad}_ultimos_${PG.meses}_meses_${M.hasta}.kmz`]
        : [`Polígonos ICE · ${D.unidad} · ${nombreModoPol(estado.modo)}`,
           `Zonas donde se concentran los clientes evaluados en ICE de la unidad ${D.unidad}${estado.modo === 'historico' ? ' (todo el histórico de los clientes del universo ICE)' : ''}, ${periodoPol(M)}: ${num(R.evaluaciones)} evaluaciones de ${num(R.clientes)} clientes. Regiones de mayor densidad de probabilidad (kernel gaussiano adaptativo, ancho base ${num(R.ancho_m)} m): cada nivel es la superficie más chica que reúne el 50, 75 o 90 % de la densidad.${fuente} Publicado ${D.generado}.`,
           carpetas, `PoligonosICE_${D.unidad}_${estado.modo === 'historico' ? 'historico' : `ultimos_${PG.meses}_meses`}_${M.hasta}.kmz`];
    };
    $('poliDescargas').addEventListener('click', async e => {
      const boton = e.target.closest('[data-kmz]'), aviso = $('kmzEstado');
      if (!boton || boton.disabled) return;
      const tipo = boton.dataset.kmz, M = datosDe(tipo);
      if (tipo !== 'jefaturas' && !(M && M.resultado)) { aviso.textContent = 'No hay zonas que descargar: muy pocos clientes con coordenadas.'; return; }
      boton.disabled = true;
      aviso.textContent = 'Generando el KMZ...';
      try {
        const [titulo, descripcion, carpetas, nombre] = kmzDe(tipo);
        Archivos.descargar(await Archivos.kmzCarpetas(titulo, descripcion, carpetas), nombre);
        aviso.textContent = `KMZ de ${TIPOS_POL[tipo].nombre.toLowerCase()} listo: revisa tus descargas.`;
      } catch (err) {
        console.error(err);
        aviso.textContent = 'No se pudo generar el KMZ.';
      } finally {
        boton.disabled = false;
      }
    });
  }

  // ── Excel de la clasificación ─────────────────────────────────────────
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
        ${tiposCliente(false)}
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

  // ── Preventa y Farmers ────────────────────────────────────────────────
  // Las dos pestañas son la misma vista con otros datos y textos: Preventa = rutas
  // de la Master Data con su frecuencia ZPV (D.rutas, D.rutas_semana) y Farmers =
  // ClaveFarmer con su FrecuenciaFarmer de JefaturasFrecuencia (D.farmers,
  // D.farmers_semana). En sus PDF la ÉPICA del mes es solo la de su grupo.
  const ZOOM_ETIQUETAS = 13;   // igual que en el sitio de brigadistas (js/unidad.js)
  const VISTAS_RUTA = {
    rutas: {
      datos: () => D.rutas, semana: () => D.rutas_semana, epica: () => D.epica_preventa || {},
      Uno: 'Ruta', uno: 'ruta', Varios: 'Rutas', varios: 'rutas', losVarios: 'las rutas', unUno: 'una ruta', estaUno: 'Esta ruta',
      delUno: 'de la ruta', cadaUno: 'cada ruta', clave: 'el código', frecuencia: 'ZPV',
      quien: 'preventa', quienUno: 'preventa', colEpica: 'ÉPICA preventa',
      botonHoy: 'Impresión Hoy Rutas', tituloHoy: 'Rutas de hoy', archivoHoy: 'ICE_Rutas_Hoy',
      tituloDia: dia => `Lista de preventa del ${dia}`, archivoDia: 'ICE_Preventa', listaDias: 'Lista de preventa por día',
      nota: '',
    },
    farmers: {
      datos: () => D.farmers, semana: () => D.farmers_semana, epica: () => D.epica_farmers || {},
      Uno: 'Farmer', uno: 'farmer', Varios: 'Farmers', varios: 'farmers', losVarios: 'los farmers', unUno: 'un farmer', estaUno: 'Este farmer',
      delUno: 'del farmer', cadaUno: 'cada farmer', clave: 'la clave', frecuencia: 'Farmer',
      quien: 'farmers', quienUno: 'farmer', colEpica: 'ÉPICA farmer',
      botonHoy: 'Impresión Hoy Farmers', tituloHoy: 'Farmers de hoy', archivoHoy: 'ICE_Farmers_Hoy',
      tituloDia: dia => `Lista de farmers del ${dia}`, archivoDia: 'ICE_Farmers', listaDias: 'Lista de farmers por día',
      nota: ' Cada cliente va con su farmer y se visita los días de su frecuencia Farmer (clave y frecuencia Farmer de JefaturasFrecuencia, /addjefaturas); la jefatura de cada farmer es la de la mayoría de sus clientes.',
      sinDatos: 'Esta publicación no trae los recorridos de los farmers: la base de jefaturas (JefaturasFrecuencia) no tiene las columnas de clave y frecuencia Farmer. Hay que volver a mandar el Excel de OBJETIVOS con /addjefaturas y publicar de nuevo.',
      panel: 'p-farmers-recorridos',      // dentro de la pestaña Farmers (farmersPestana)
      porCanal: true,                      // botón de canal de la pestaña (farmersCanal)
    },
  };
  // Farmers, vista Zona y cercanos (crearVistaCercanos): sus PDF agregan los cercanos
  VISTAS_RUTA.cercanos = { ...VISTAS_RUTA.farmers, panel: 'p-farmers-cercanos', cercanos: true, nota: '',
    botonHoy: 'Impresión Hoy Farmers y cercanos', tituloHoy: 'Farmers y cercanos de hoy', archivoHoy: 'ICE_Farmers_Cercanos_Hoy',
    tituloDia: dia => `Farmers y cercanos del ${dia}`, archivoDia: 'ICE_Farmers_Cercanos', listaDias: 'Lista con cercanos por día' };
  let vistasRuta = {};

  // Un color por ruta (ángulo dorado), sin rojos: el rojo es prioridad 1
  function colorRuta(i) {
    const h = 25 + (i * 137.508) % 310, s = 0.55, l = 0.42;
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
  }

  const cuentaTipos = puntos => puntos.reduce((a, p) => { a[p[4]] = (a[p[4]] || 0) + 1; return a; }, {});

  // Fila de la tabla de clientes de una ruta (detalle de una ruta o de un farmer)
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

  // Vista de la pestaña `id` ('rutas' = Preventa o 'farmers'): se arma la primera
  // vez que se abre; quitar() borra su mapa al cambiar de unidad (administrador)
  function crearVistaRuta(id) {
    const V = VISTAS_RUTA[id], I = n => id + n;   // ids de la vista: rutasMapa, farmersMapa...
    let mapa = null, capa = null, capaEtiq = null, grupos = [], diaSel = 'hoy', Rdia = null;

    // Letrero con el código de cada ruta (en el centro de sus clientes), solo al acercar el mapa
    function pintarEtiquetas() {
      if ($(I('Etiquetas')).checked && mapa.getZoom() >= ZOOM_ETIQUETAS) capaEtiq.addTo(mapa);
      else mapa.removeLayer(capaEtiq);
    }

    function abrir() {
      const panel = (V.panel && $(V.panel)) || $('p-' + id);
      if (mapa) { setTimeout(() => mapa.invalidateSize(), 50); return; }
      const datos = V.datos();
      if (!datos) {
        panel.innerHTML = seccion(V.Varios, '', `<p class="ice-nota">${esc(V.sinDatos || 'Esta publicación no trae estos datos.')}</p>`);
        return;
      }
      const H = datos.hoy, M = datos.manana, S = V.semana();
      panel.innerHTML = `
      <div class="mapa-barra">
        <div class="mapa-controles">
          <div class="rutas-acciones">
            <button type="button" class="ice-btn rojo" data-pdf="hoy">${svgIcono('imprimir')}${esc(V.botonHoy)}</button>
          </div>
          <label class="ice-check"><input type="checkbox" id="${I('PdfTodos')}"> Incluir a los clientes no ICE en la impresión de hoy</label>
        </div>
        <div class="rutas-acciones rutas-semana" role="group" aria-label="${esc(V.listaDias)} de la semana">
          <span class="poli-rutas-tit">${esc(V.listaDias)}:</span>
          ${(S ? S.dias : []).map((d, i) => `<button type="button" class="ice-btn sec" data-pdf-dia="${i}">${svgIcono('imprimir')}${esc(d.dia)}${d.hoy ? ' · hoy' : d.dia === M.dia ? ' · mañana' : ''}</button>`).join('')}
        </div>
        <p class="mapa-ayuda">Cada PDF trae <b>una hoja por ${esc(V.uno)}</b>, para que cada ${esc(V.quienUno)} se lleve la suya: los clientes <b>prioridad 1, 2 y 3</b> que visita ese día y que aún no tienen ICE en ${esc(D.mes)}, con la submétrica que más puntos le quitó a cada uno en su última evaluación y, arriba, qué es cada tipo de cliente. Si cabe en la hoja, abajo va la <b>ubicación de los clientes prioridad 1 y 2</b>: nombre, SAP y un QR que abre su ubicación en Google Maps; debajo, si también cabe, las <b>semanas de los clientes prioridad 3</b>: SAP, nombre y la semana del mes en que más veces los ha evaluado el auditor. Los ya evaluados en el mes no se imprimen, ni los no prioritarios, que nunca se han evaluado. En los PDF la ÉPICA del mes es solo la hecha por ${esc(V.quien)}; en esta página se ve la de brigadistas.${esc(V.nota)}</p>
        ${tiposCliente(false)}
        <div class="mapa-controles">
          <div class="segmento" role="group" aria-label="Día de ${esc(V.losVarios)}">
            <button type="button" data-dia="hoy" aria-pressed="true">Hoy · ${esc(H.dia)} ${esc(fechaCorta(H.fecha))}</button>
            <button type="button" data-dia="manana" aria-pressed="false">Mañana · ${esc(M.dia)} ${esc(fechaCorta(M.fecha))}</button>
          </div>
          <div class="chips" aria-label="Simbología">
            ${[1, 2, 3, 4].map(p => `<span class="chip" style="cursor:default"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre}</span>`).join('')}
            <span class="chip" style="cursor:default"><span class="punto-prio p0" aria-hidden="true"></span>No ICE (color ${esc(V.delUno)})</span>
          </div>
        </div>
        <p class="mapa-resumen" id="${I('Resumen')}" role="status"></p>
        <p class="mapa-ayuda" id="${I('PdfEstado')}" role="status" aria-live="polite"></p>
      </div>
      <div class="rutas-cuerpo">
        <div id="${I('Mapa')}" class="mapa"></div>
        <aside class="rutas-lista" aria-label="${esc(V.Varios)} del día">
          <input type="search" id="${I('Busca')}" placeholder="Buscar ${esc(V.uno)} o jefatura" aria-label="Buscar ${esc(V.uno)} o jefatura">
          <label class="ice-check"><input type="checkbox" id="${I('SoloIce')}"> Solo ${esc(V.varios)} con clientes ICE</label>
          <label class="ice-check"><input type="checkbox" id="${I('Etiquetas')}" checked> Etiquetas de ${esc(V.uno)} (al acercar el mapa)</label>
          <ul id="${I('Lista')}"></ul>
        </aside>
      </div>
      <section class="ruta-detalle" id="${I('Detalle')}"></section>`;
      mapa = L.map(I('Mapa'), { preferCanvas: true });
      capaBase(mapa);
      botonUbicacion(mapa);
      capa = L.layerGroup().addTo(mapa);
      capaEtiq = L.layerGroup();
      pintarDia('hoy');
      mapa.on('zoomend', pintarEtiquetas);

      panel.querySelectorAll('.segmento button').forEach(b => b.addEventListener('click', () => {
        panel.querySelectorAll('.segmento button').forEach(x => x.setAttribute('aria-pressed', x === b));
        pintarDia(b.dataset.dia);
      }));
      $(I('Busca')).addEventListener('input', filtrarLista);
      $(I('SoloIce')).addEventListener('change', filtrarLista);
      $(I('Etiquetas')).addEventListener('change', pintarEtiquetas);
      panel.querySelectorAll('[data-pdf], [data-pdf-dia]').forEach(b => b.addEventListener('click', () =>
        imprimir(V, b, $(I('PdfEstado')), $(I('PdfTodos')).checked)));
    }

    function filtrarLista() {
      const q = normalizar($(I('Busca')).value), solo = $(I('SoloIce')).checked;
      const R = Rdia.rutas;
      document.querySelectorAll(`#${I('Lista')} li`).forEach((li, i) => {
        const r = R[i];
        li.hidden = (!!q && !normalizar(`${r.codigo} ${r.jefatura}`).includes(q)) || (solo && !r.puntos.some(p => p[4]));
      });
    }

    function pintarDia(dia) {
      diaSel = dia;
      const R = Rdia = rutasVista(V, dia), sel = canalVista(V);
      capa.clearLayers();
      capaEtiq.clearLayers();
      grupos = [];
      const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
      const limites = [], marcadores = [], ice = [];
      const total = R.rutas.reduce((a, r) => a + r.puntos.length, 0);
      const tipos = cuentaTipos(R.rutas.flatMap(r => r.puntos));
      R.rutas.forEach((r, i) => {
        const color = colorRuta(i), coords = r.puntos.filter(p => p[0] != null).map(p => [p[0], p[1]]);
        const g = { r, color, limites: coords.length ? L.latLngBounds(coords) : null, linea: null };
        if (coords.length > 1) {
          g.linea = L.polyline(coords, { renderer: rend, color, weight: 2, opacity: 0.6 }).bindTooltip(`${esc(V.Uno)} ${esc(r.codigo)} · ${plural(r.puntos.length, 'cliente')}`, { sticky: true });
          g.linea.addTo(capa);
        }
        for (const p of r.puntos) {
          if (p[0] == null) continue;
          limites.push([p[0], p[1]]);
          if (p[4]) { ice.push({ p, r }); continue; }
          const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: 3.5, color: BLANCO, weight: 1, fillColor: color, fillOpacity: 1 })
            .bindPopup(() => popupRuta(p, r), { maxWidth: 320 });
          etiqueta(m, p[3], p[2]);
          m.addTo(capa);
          marcadores.push(m);
        }
        if (coords.length) {
          const c = coords.reduce((a, p) => [a[0] + p[0] / coords.length, a[1] + p[1] / coords.length], [0, 0]);
          L.marker(c, { interactive: false, keyboard: false,
            icon: L.divIcon({ className: 'ruta-etiqueta', html: `<span style="background:${color};color:${Graficas.tintaSobre(color)}">${esc(r.codigo)}</span>`, iconSize: null }) })
            .addTo(capaEtiq);
        }
        grupos.push(g);
      });
      // Los clientes ICE van encima de todo, con la prioridad 1 hasta arriba
      ice.sort((a, b) => b.p[4] - a.p[4]).forEach(({ p, r }) => {
        const s = PRIO[p[4]];
        const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: s.radio, color: s.borde, weight: s.grosor, fillColor: s.relleno, fillOpacity: 1 })
          .bindPopup(() => popupRuta(p, r), { maxWidth: 320 });
        etiqueta(m, p[3], p[2]);
        m.addTo(capa);
        marcadores.push(m);
      });
      if (limites.length) mapa.fitBounds(limitesRobustos(limites).pad(0.04));
      else mapa.setView([19.38, -99.14], 11);
      mapa.off('click');
      toqueCercano(mapa, marcadores);
      pintarEtiquetas();

      $(I('Resumen')).innerHTML = `${esc(V.Varios)} que visitan el <b>${esc(R.dia.toLowerCase())} ${esc(fechaLarga(R.fecha))}</b> (frecuencia ${esc(V.frecuencia)} <b>${esc(R.letra)}</b>)${sel != null ? `, solo sus clientes <b>${esc(nombreCanalCorto(sel))}</b>` : ''}: <b>${num(R.rutas.length)}</b> ${esc(V.varios)} · <b>${num(total)}</b> clientes · ICE: <b>${num(tipos[1] || 0)}</b> prioridad 1, <b>${num(tipos[2] || 0)}</b> prioridad 2, <b>${num(tipos[3] || 0)}</b> prioridad 3 y <b>${num(tipos[4] || 0)}</b> no prioritarios. Las líneas unen a los clientes de ${esc(V.cadaUno)}; al acercar el mapa aparece la etiqueta con ${esc(V.clave)} de ${esc(V.cadaUno)}.`;
      $(I('Lista')).innerHTML = R.rutas.map((r, i) => {
        const t = cuentaTipos(r.puntos);
        return `<li><button type="button" class="ruta-item" data-i="${i}">
          <span class="ruta-sw" style="background:${grupos[i].color}" aria-hidden="true"></span>
          <span class="ruta-cod">${esc(r.codigo)}</span>
          <span class="ruta-conteo">${[1, 2, 3, 4].map(p => t[p] ? `<span class="prio p${p}" title="${PRIO[p].nombre}">${PRIO[p].corto} ${t[p]}</span>` : '').join('')}</span>
          <span class="ruta-info">${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.puntos.length, 'cliente')}</span></button></li>`;
      }).join('') || `<li class="muted" style="padding:9px 6px">No hay ${esc(V.varios)}${sel != null ? ` con clientes ${esc(nombreCanalCorto(sel))}` : ''} este día.</li>`;
      document.querySelectorAll(`#${I('Lista')} .ruta-item`).forEach(b => b.addEventListener('click', () => elegirRuta(+b.dataset.i)));
      filtrarLista();
      $(I('Detalle')).innerHTML = `<p class="muted">Elige ${esc(V.unUno)} de la lista para ver sus clientes de ${dia === 'hoy' ? 'hoy' : 'mañana'}.</p>`;
    }

    function popupRuta(p, r) {
      const [lat, lon, sap, nombre, tipo] = p;
      const c = porSapCliente[sap];
      if (c) return popupCliente(c).replace('<span class="pc-sap">', `<span>${esc(V.Uno)} ${esc(r.codigo)}</span><span class="pc-sap">`);
      return `<div class="pc"><div class="pc-cab p3"><b>${esc(nombre || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(sap)}</strong></span>
        <span>${esc(V.Uno)} ${esc(r.codigo)} · ${PRIO[tipo].nombre}</span></div>${enlacesMapa(lat, lon)}
        <dl class="pc-cuerpo">${fila('Jefatura', esc(r.jefatura))}</dl></div>`;
    }

    function elegirRuta(i) {
      document.querySelectorAll(`#${I('Lista')} .ruta-item`).forEach(b => b.setAttribute('aria-current', +b.dataset.i === i ? 'true' : 'false'));
      const g = grupos[i];
      if (g.limites) mapa.fitBounds(g.limites.pad(0.15));
      if (g.linea) {
        g.linea.setStyle({ weight: 6, opacity: 0.9 });
        setTimeout(() => g.linea && g.linea.setStyle({ weight: 2, opacity: 0.6 }), 1800);
      }
      detalleRuta(g.r);
    }

    function detalleRuta(r) {
      const ice = r.puntos.filter(p => p[4]).sort((a, b) => a[4] - b[4]);
      const otros = r.puntos.filter(p => !p[4]);
      const t = cuentaTipos(r.puntos);
      const cont = $(I('Detalle'));
      cont.innerHTML = `<div class="ruta-detalle-cab"><div>
          <h3>${esc(V.Uno)} ${esc(r.codigo)}</h3>
          <p>${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.puntos.length, 'cliente')} ${diaSel === 'hoy' ? 'hoy' : 'mañana'} · ICE: ${num(t[1] || 0)} P1, ${num(t[2] || 0)} P2, ${num(t[3] || 0)} P3, ${num(t[4] || 0)} NP</p></div>
          ${otros.length ? `<button type="button" class="ice-btn sec" id="${I('VerOtros')}" aria-expanded="false">Ver los ${num(otros.length)} clientes no ICE</button>` : ''}</div>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th class="izq">#</th><th class="izq">Tipo</th><th class="izq">SAP</th><th class="izq">Cliente</th><th class="izq">Dirección</th><th>Último ICE</th><th>ICE ${esc(D.mes)}</th><th class="izq">ÉPICA del mes</th></tr></thead>
          <tbody id="${I('Filas')}">${ice.length ? ice.map((p, k) => filaClienteRuta(p, k + 1)).join('') : `<tr><td class="izq muted" colspan="8">${esc(V.estaUno)} no tiene clientes ICE.</td></tr>`}</tbody>
        </table></div>`;
      const btn = $(I('VerOtros'));
      if (btn) btn.addEventListener('click', () => {
        const abierto = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !abierto);
        btn.textContent = abierto ? `Ver los ${num(otros.length)} clientes no ICE` : 'Ocultar clientes no ICE';
        $(I('Filas')).innerHTML = (ice.length ? ice.map((p, k) => filaClienteRuta(p, k + 1)).join('') : '') +
          (abierto ? '' : otros.map((p, k) => filaClienteRuta(p, ice.length + k + 1)).join(''));
      });
    }

    // Al cambiar el canal (Farmers) se vuelve a pintar el día que se está viendo
    return { abrir, refrescar() { if (mapa) pintarDia(diaSel); }, quitar() { if (mapa) mapa.remove(); mapa = null; } };
  }

  // ── Farmers: vistas Recorridos y Zona y cercanos ──────────────────────
  // Recorridos = crearVistaRuta('farmers'). Zona y cercanos = crearVistaCercanos():
  // por cada día de la semana, la zona del recorrido de cada farmer (polígono de sus
  // clientes del día más un margen) y los clientes P1/P2 sin frecuencia Farmer que
  // caen en ella (farmers_semana.dias[].zonas, _zonas_farmers en publica_ice.py).
  let farmersSub = 'recorridos';

  // Botón de canal de Farmers: null = todos los canales; si no, el índice del canal en
  // D.canales ('Traditional' = Home Market). Lo respetan la pantalla y los PDF de las dos
  // vistas: solo quedan los clientes de ese canal (P1, P2, P3 y cercanos) y los cercanos
  // se escogen solo entre los de ese canal (farmers_semana.dias[].zonas_canal).
  let farmersCanal = null;
  const nombreCanalCorto = i => D.canales[i] === 'Traditional' ? 'Home Market' : D.canales[i];
  const canalVista = V => V.porCanal && farmersCanal != null ? farmersCanal : null;
  const conCanales = () => D.clientes.length > 0 && D.clientes[0].length > 18 && D.farmers.hoy.rutas.every(r => r.canales);

  // Rutas de hoy o de mañana de una vista (D.rutas.hoy, D.farmers.hoy...), solo con los
  // clientes del canal elegido (rutas[].canales: canal de cada punto)
  function rutasVista(V, dia) {
    const R = V.datos()[dia], sel = canalVista(V);
    if (sel == null) return R;
    return { ...R, rutas: R.rutas.map(r => ({ ...r, puntos: r.puntos.filter((p, k) => r.canales[k] === sel) })).filter(r => r.puntos.length) };
  }

  function farmersPestana() {
    if (!D.farmers) { vistasRuta.farmers.abrir(); return; }   // aviso: la base no trae farmers
    const p = $('p-farmers');
    if (!$('farmersSub')) {
      const canales = conCanales() ? [[null, 'Todos los canales'], ...['On Premise', 'Traditional'].map(c => [D.canales.indexOf(c), c === 'Traditional' ? 'Home Market' : c])] : [];
      p.innerHTML = `<div class="ice-subpestanas farmers-barra"><div class="segmento" id="farmersSub" role="group" aria-label="Vista de la pestaña Farmers">
          <button type="button" data-sub="recorridos" aria-pressed="true">Recorridos</button>
          <button type="button" data-sub="cercanos" aria-pressed="false">Zona y clientes cercanos</button></div>
          ${canales.length ? `<div class="farmers-canal"><span class="poli-rutas-tit">Canal:</span>
          <div class="segmento" id="farmersCanal" role="group" aria-label="Canal de los clientes de la pestaña Farmers">
            ${canales.map(([i, n]) => `<button type="button" data-canal="${i == null ? '' : i}" aria-pressed="${i === farmersCanal}">${esc(n)}</button>`).join('')}
          </div></div>
          <p class="mapa-ayuda farmers-canal-ayuda">Con <b>On Premise</b> o <b>Home Market</b>, el mapa, la lista y los PDF de las dos vistas quedan solo con los clientes de ese canal: prioridad 1, 2 y 3 de cada recorrido y, en Zona y clientes cercanos, sus cercanos, que se escogen solo entre los de ese canal.</p>` : ''}</div>
        <div id="p-farmers-recorridos"></div><div id="p-farmers-cercanos" hidden></div>`;
      $('farmersSub').addEventListener('click', e => {
        const b = e.target.closest('[data-sub]');
        if (b) { farmersSub = b.dataset.sub; farmersPestana(); }
      });
      if ($('farmersCanal')) $('farmersCanal').addEventListener('click', e => {
        const b = e.target.closest('[data-canal]');
        if (!b) return;
        farmersCanal = b.dataset.canal === '' ? null : +b.dataset.canal;
        $('farmersCanal').querySelectorAll('[data-canal]').forEach(x => x.setAttribute('aria-pressed', x === b));
        vistasRuta.farmers.refrescar();
        vistasRuta.cercanos.refrescar();
      });
    }
    $('farmersSub').querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sub === farmersSub));
    $('p-farmers-recorridos').hidden = farmersSub !== 'recorridos';
    $('p-farmers-cercanos').hidden = farmersSub !== 'cercanos';
    vistasRuta[farmersSub === 'recorridos' ? 'farmers' : 'cercanos'].abrir();
  }

  const esCercano = p => p.length > 5;     // [lat, lon, sap, nombre, tipo, metros a la ruta]

  function filaCercano(p, k) {
    const [, , sap, nombre, tipo, metros] = p;
    const c = porSapCliente[sap], u = c && c[17];
    const ultimo = c && c[10] ? `${dec1(c[11])} <span class="muted">(${esc(fechaCorta(c[10]))})</span>` : '<span class="muted">—</span>';
    return `<tr><td class="izq">C${k}</td><td class="izq"><span class="prio ${PRIO[tipo].clase}">${PRIO[tipo].corto}</span></td>
      <td class="izq">${esc(sap)}</td><td class="izq">${esc(nombre)}</td><td class="izq">${c ? esc(c[13]) : ''}</td>
      <td>${num(metros)} m</td><td>${ultimo}</td><td class="izq">${u ? esc(nombrePeor(u)) : '<span class="muted">—</span>'}</td>
      <td class="izq">${textoEpica(sap)}</td></tr>`;
  }

  function crearVistaCercanos() {
    const V = VISTAS_RUTA.cercanos, I = n => 'cercanos' + n;
    let mapa = null, capa = null, capaEtiq = null, grupos = [], R = null, diaI = 0;

    function pintarEtiquetas() {
      if ($(I('Etiquetas')).checked && mapa.getZoom() >= ZOOM_ETIQUETAS) capaEtiq.addTo(mapa);
      else mapa.removeLayer(capaEtiq);
    }

    function abrir() {
      const panel = $(V.panel);
      if (mapa) { setTimeout(() => mapa.invalidateSize(), 50); return; }
      const S = V.semana(), K = D.farmers_zonas_criterio;
      if (!S || !S.dias.length || !S.dias.every(d => d.zonas) || !K) {
        panel.innerHTML = seccion('Zona y clientes cercanos', '', '<p class="ice-nota">Esta publicación no trae las zonas de los farmers: no se pudieron armar. Se reintenta en la siguiente publicación.</p>');
        return;
      }
      const iHoy = S.dias.findIndex(d => d.hoy), M = D.farmers.manana;
      panel.innerHTML = `
      <div class="mapa-barra">
        ${iHoy >= 0 ? `<div class="mapa-controles"><div class="rutas-acciones">
          <button type="button" class="ice-btn rojo" data-pdf="hoy">${svgIcono('imprimir')}${esc(V.botonHoy)}</button></div></div>` : ''}
        <div class="rutas-acciones rutas-semana" role="group" aria-label="${esc(V.listaDias)} de la semana">
          <span class="poli-rutas-tit">${esc(V.listaDias)}:</span>
          ${S.dias.map((d, i) => `<button type="button" class="ice-btn sec" data-pdf-dia="${i}">${svgIcono('imprimir')}${esc(d.dia)}${d.hoy ? ' · hoy' : d.dia === M.dia ? ' · mañana' : ''}</button>`).join('')}
        </div>
        <p class="mapa-ayuda">Para cada farmer y cada día se arma la <b>zona de su recorrido</b>: el polígono que encierra a sus clientes de ese día (frecuencia Farmer) más un margen de ${num(K.margen)} m alrededor; si dentro hay menos de ${num(K.min)} clientes para agregar, el margen crece de ${num(K.paso)} en ${num(K.paso)} m hasta ${num(K.margen_max)} m. En su zona se le agregan <b>hasta ${num(K.max)} clientes prioridad 1 y 2 que no tienen frecuencia Farmer</b> y aún no tienen ICE en ${esc(D.mes)}: los más cercanos al camino que une a sus clientes en orden (◆ en el mapa). Un cliente que cae en varias zonas va solo con el farmer que lo tiene más cerca. Cada PDF trae <b>una hoja por farmer</b> con sus clientes prioridad 1, 2 y 3 del día y, aparte, sus <b>clientes cercanos, aclarando que están cerca de su ruta pero no en ella</b>; la ubicación con QR también los incluye (si no caben todos los QR en la hoja, van al menos los de los cercanos). En los PDF la ÉPICA del mes es solo la hecha por farmers; en esta página se ve la de brigadistas.</p>
        ${tiposCliente(false)}
        <div class="mapa-controles">
          <div class="segmento dias" role="group" aria-label="Día en el mapa">
            ${S.dias.map((d, i) => `<button type="button" data-dia="${i}" aria-pressed="${i === (iHoy >= 0 ? iHoy : 0)}">${esc(d.dia)}${d.hoy ? ' · hoy' : ''}</button>`).join('')}
          </div>
          <div class="chips" aria-label="Simbología">
            ${[1, 2, 3].map(p => `<span class="chip" style="cursor:default"><span class="punto-prio p${p}" aria-hidden="true"></span>${PRIO[p].nombre}</span>`).join('')}
            <span class="chip" style="cursor:default"><span class="punto-cercano p1" aria-hidden="true"></span>Cercano P1</span>
            <span class="chip" style="cursor:default"><span class="punto-cercano p2" aria-hidden="true"></span>Cercano P2</span>
            <span class="chip" style="cursor:default"><span class="zona-muestra" aria-hidden="true"></span>Zona del recorrido</span>
          </div>
        </div>
        <p class="mapa-resumen" id="${I('Resumen')}" role="status"></p>
        <p class="mapa-ayuda" id="${I('PdfEstado')}" role="status" aria-live="polite"></p>
      </div>
      <div class="rutas-cuerpo">
        <div id="${I('Mapa')}" class="mapa"></div>
        <aside class="rutas-lista" aria-label="Farmers del día">
          <input type="search" id="${I('Busca')}" placeholder="Buscar farmer o jefatura" aria-label="Buscar farmer o jefatura">
          <label class="ice-check"><input type="checkbox" id="${I('Solo')}"> Solo farmers con clientes cercanos</label>
          <label class="ice-check"><input type="checkbox" id="${I('Etiquetas')}" checked> Etiquetas de farmer (al acercar el mapa)</label>
          <ul id="${I('Lista')}"></ul>
        </aside>
      </div>
      <section class="ruta-detalle" id="${I('Detalle')}"></section>`;
      mapa = L.map(I('Mapa'), { preferCanvas: true });
      capaBase(mapa);
      botonUbicacion(mapa);
      capa = L.layerGroup().addTo(mapa);
      capaEtiq = L.layerGroup();
      pintarDia(iHoy >= 0 ? iHoy : 0);
      mapa.on('zoomend', pintarEtiquetas);
      panel.querySelectorAll('.segmento [data-dia]').forEach(b => b.addEventListener('click', () => {
        panel.querySelectorAll('.segmento [data-dia]').forEach(x => x.setAttribute('aria-pressed', x === b));
        pintarDia(+b.dataset.dia);
      }));
      $(I('Busca')).addEventListener('input', filtrarLista);
      $(I('Solo')).addEventListener('change', filtrarLista);
      $(I('Etiquetas')).addEventListener('change', pintarEtiquetas);
      panel.querySelectorAll('[data-pdf], [data-pdf-dia]').forEach(b => b.addEventListener('click', () =>
        imprimir(V, b, $(I('PdfEstado')), false)));
    }

    function filtrarLista() {
      const q = normalizar($(I('Busca')).value), solo = $(I('Solo')).checked;
      document.querySelectorAll(`#${I('Lista')} li`).forEach((li, i) => {
        const r = R.rutas[i];
        if (!r) return;
        li.hidden = (!!q && !normalizar(`${r.codigo} ${r.jefatura}`).includes(q)) || (solo && !r.cercanos.length);
      });
    }

    function pintarDia(i) {
      const S = V.semana(), d = S.dias[i], sel = canalVista(V);
      diaI = i;
      R = rutasDeSemana(V, i);
      capa.clearLayers();
      capaEtiq.clearLayers();
      grupos = [];
      const rend = L.canvas({ padding: 0.4, tolerance: TACTIL ? 8 : 4 });
      // Recorrido completo de cada farmer ese día (todas sus paradas, en orden)
      const lineas = {};
      for (const [k, , orden] of d.rutas || []) lineas[S.rutas[k].codigo] = orden.map(j => S.rutas[k].puntos[j]);
      const limites = [], marcadores = [], ice = [], cerc = [];
      R.rutas.forEach((r, k) => {
        const color = colorRuta(k), linea = lineas[r.codigo] || [];
        const g = { r, color, limites: null };
        if (r.poligono) {
          const pol = L.polygon(r.poligono, { renderer: rend, color, weight: 1.6, opacity: 0.9, dashArray: '6 4', fillColor: color, fillOpacity: 0.1 })
            .bindPopup(() => popupZona(r), { maxWidth: 300 }).addTo(capa);
          g.limites = pol.getBounds();
          for (const p of r.poligono) limites.push(p);
        }
        if (linea.length > 1) L.polyline(linea, { renderer: rend, color, weight: 2, opacity: 0.65, interactive: false }).addTo(capa);
        for (const p of linea) L.circleMarker(p, { renderer: rend, radius: 2.5, color: BLANCO, weight: 0.8, fillColor: color, fillOpacity: 1, interactive: false }).addTo(capa);
        for (const p of r.puntos) if (p[0] != null) ice.push({ p, r });
        for (const p of r.cercanos) if (p[0] != null) cerc.push({ p, r, color });
        const centro = linea.length ? linea : (r.poligono || []);
        if (centro.length) {
          const c = centro.reduce((a, p) => [a[0] + p[0] / centro.length, a[1] + p[1] / centro.length], [0, 0]);
          L.marker(c, { interactive: false, keyboard: false,
            icon: L.divIcon({ className: 'ruta-etiqueta', html: `<span style="background:${color};color:${Graficas.tintaSobre(color)}">${esc(r.codigo)}</span>`, iconSize: null }) })
            .addTo(capaEtiq);
        }
        grupos.push(g);
      });
      // Clientes P1–P3 de los recorridos y, encima, los cercanos (◆)
      ice.sort((a, b) => b.p[4] - a.p[4]).forEach(({ p, r }) => {
        const s = PRIO[p[4]];
        const m = L.circleMarker([p[0], p[1]], { renderer: rend, radius: s.radio, color: s.borde, weight: s.grosor, fillColor: s.relleno, fillOpacity: 1 })
          .bindPopup(() => popupRecorrido(p, r), { maxWidth: 320 });
        etiqueta(m, p[3], p[2]);
        m.addTo(capa);
        marcadores.push(m);
      });
      cerc.forEach(({ p, r, color }) => {
        const m = L.marker([p[0], p[1]], { zIndexOffset: 1000, keyboard: false,
          icon: L.divIcon({ className: 'cercano-icono', html: `<span class="cercano-rombo p${p[4]}" style="--c:${color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }) })
          .bindPopup(() => popupCercano(p, r), { maxWidth: 320 });
        etiqueta(m, p[3], p[2]);
        m.addTo(capa);
        marcadores.push(m);
      });
      if (limites.length) mapa.fitBounds(limitesRobustos(limites).pad(0.04));
      else mapa.setView([19.38, -99.14], 11);
      mapa.off('click');
      toqueCercano(mapa, marcadores);
      pintarEtiquetas();

      const tipos = cuentaTipos(R.rutas.flatMap(r => r.puntos)), tc = cuentaTipos(R.rutas.flatMap(r => r.cercanos));
      const nc = (tc[1] || 0) + (tc[2] || 0), con = R.rutas.filter(r => r.cercanos.length).length;
      $(I('Resumen')).innerHTML = `Zonas de los farmers del <b>${esc(R.dia.toLowerCase())} ${esc(fechaLarga(R.fecha))}</b> (frecuencia Farmer <b>${esc(R.letra)}</b>)${sel != null ? `, solo clientes <b>${esc(nombreCanalCorto(sel))}</b>` : ''}: <b>${num(R.rutas.length)}</b> farmers · ICE en sus recorridos: <b>${num(tipos[1] || 0)}</b> prioridad 1, <b>${num(tipos[2] || 0)}</b> prioridad 2 y <b>${num(tipos[3] || 0)}</b> prioridad 3 · <b>${num(nc)}</b> clientes cercanos (<b>${num(tc[1] || 0)}</b> P1 y <b>${num(tc[2] || 0)}</b> P2) para <b>${num(con)}</b> de ellos. Las líneas punteadas son la zona de cada farmer y la línea continua su recorrido del día.`;
      $(I('Lista')).innerHTML = R.rutas.map((r, k) => {
        const t = cuentaTipos(r.puntos);
        return `<li><button type="button" class="ruta-item" data-i="${k}">
          <span class="ruta-sw" style="background:${grupos[k].color}" aria-hidden="true"></span>
          <span class="ruta-cod">${esc(r.codigo)}</span>
          <span class="ruta-conteo">${[1, 2, 3].map(p => t[p] ? `<span class="prio p${p}" title="${PRIO[p].nombre}">${PRIO[p].corto} ${t[p]}</span>` : '').join('')}${r.cercanos.length ? `<span class="prio cercano" title="Clientes cercanos a su ruta">◆ ${r.cercanos.length}</span>` : ''}</span>
          <span class="ruta-info">${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.total, 'cliente')} · zona de +${num(r.margen)} m</span></button></li>`;
      }).join('') || '<li class="muted" style="padding:9px 6px">No hay farmers este día.</li>';
      document.querySelectorAll(`#${I('Lista')} .ruta-item`).forEach(b => b.addEventListener('click', () => elegir(+b.dataset.i)));
      filtrarLista();
      $(I('Detalle')).innerHTML = `<p class="muted">Elige un farmer de la lista para ver sus clientes del ${esc(R.dia.toLowerCase())} y los cercanos a su ruta.</p>`;
    }

    function popupZona(r) {
      const t = cuentaTipos(r.puntos);
      return `<div class="pc"><div class="pc-cab p3"><b>Zona de ${esc(r.codigo)}</b><span>${esc(R.dia)} · ${esc(nombreJefatura(r.jefatura || SIN_JEFATURA))}</span></div>
        <dl class="pc-cuerpo">${fila('Recorrido del día', plural(r.total, 'cliente'))}${fila('Margen de la zona', `${num(r.margen)} m`)}
          ${fila('ICE del recorrido', `P1 ${num(t[1] || 0)} · P2 ${num(t[2] || 0)} · P3 ${num(t[3] || 0)}`)}${fila('Clientes cercanos', num(r.cercanos.length))}</dl></div>`;
    }

    function popupRecorrido(p, r) {
      const c = porSapCliente[p[2]];
      if (c) return popupCliente(c).replace('<span class="pc-sap">', `<span>Farmer ${esc(r.codigo)}</span><span class="pc-sap">`);
      return `<div class="pc"><div class="pc-cab p3"><b>${esc(p[3] || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(p[2])}</strong></span><span>Farmer ${esc(r.codigo)}</span></div>${enlacesMapa(p[0], p[1])}</div>`;
    }

    function popupCercano(p, r) {
      const c = porSapCliente[p[2]];
      const nota = `<p class="pc-nota"><b>Cercano a la ruta de ${esc(r.codigo)}</b> (a ${num(p[5])} m de su recorrido del ${esc(R.dia.toLowerCase())}): no está en su ruta, no tiene frecuencia Farmer.</p>`;
      return c ? popupCliente(c, nota) : `<div class="pc"><div class="pc-cab p3"><b>${esc(p[3] || 'Cliente sin nombre')}</b><span class="pc-sap">SAP <strong>${esc(p[2])}</strong></span></div>${enlacesMapa(p[0], p[1])}${nota}</div>`;
    }

    function elegir(k) {
      document.querySelectorAll(`#${I('Lista')} .ruta-item`).forEach(b => b.setAttribute('aria-current', +b.dataset.i === k ? 'true' : 'false'));
      const g = grupos[k];
      if (g.limites) mapa.fitBounds(g.limites.pad(0.08));
      const r = g.r, ice = r.puntos.slice().sort((a, b) => a[4] - b[4]), t = cuentaTipos(r.puntos);
      $(I('Detalle')).innerHTML = `<div class="ruta-detalle-cab"><div>
          <h3>Farmer ${esc(r.codigo)}</h3>
          <p>${esc(r.jefatura || 'Sin jefatura')} · ${plural(r.total, 'cliente')} el ${esc(R.dia.toLowerCase())} · ICE: ${num(t[1] || 0)} P1, ${num(t[2] || 0)} P2, ${num(t[3] || 0)} P3 · ${plural(r.cercanos.length, 'cliente cercano', 'clientes cercanos')} · zona de +${num(r.margen)} m</p></div></div>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th class="izq">#</th><th class="izq">Tipo</th><th class="izq">SAP</th><th class="izq">Cliente</th><th class="izq">Dirección</th><th>Último ICE</th><th>ICE ${esc(D.mes)}</th><th class="izq">ÉPICA del mes</th></tr></thead>
          <tbody>${ice.length ? ice.map((p, j) => filaClienteRuta(p, j + 1)).join('') : `<tr><td class="izq muted" colspan="8">Este farmer no tiene clientes${canalVista(V) != null ? ` ${esc(nombreCanalCorto(canalVista(V)))}` : ''} prioridad 1, 2 o 3 este día.</td></tr>`}</tbody>
        </table></div>
        <h4 class="cercanos-tit">Clientes cercanos a su ruta (no están en ella)</h4>
        <div class="tabla-scroll"><table class="ice-tabla">
          <thead><tr><th class="izq">#</th><th class="izq">Tipo</th><th class="izq">SAP</th><th class="izq">Cliente</th><th class="izq">Dirección</th><th>A su recorrido</th><th>Último ICE</th><th class="izq">Le faltó</th><th class="izq">ÉPICA del mes</th></tr></thead>
          <tbody>${r.cercanos.length ? r.cercanos.map((p, j) => filaCercano(p, j + 1)).join('') : `<tr><td class="izq muted" colspan="9">No hay clientes${canalVista(V) != null ? ` ${esc(nombreCanalCorto(canalVista(V)))}` : ''} prioridad 1 o 2 sin frecuencia Farmer en su zona (ni con ${num(D.farmers_zonas_criterio.margen_max)} m de margen).</td></tr>`}</tbody>
        </table></div>`;
    }

    return { abrir, refrescar() { if (mapa) pintarDia(diaI); }, quitar() { if (mapa) mapa.remove(); mapa = null; } };
  }

  // ── Impresiones (PDF) ─────────────────────────────────────────────────
  // Una hoja por ruta (o por farmer), para que cada quien se lleve la suya. Si una
  // ruta no cabe sigue en otra hoja, con el mismo encabezado. ctx.V = la vista
  // (VISTAS_RUTA) de la que sale el PDF: textos y ÉPICA de su grupo.
  const PDF_M = 32, PDF_FILA = 16;
  const SIN_JEFATURA = 'Sin jefatura';     // igual que SIN_ZONA de Programas/publica_ice.py
  const nombreJefatura = j => j === SIN_JEFATURA ? j : `Jefatura ${j}`;

  // ctx.rutaPaginas: ruta de cada hoja (para el pie)
  function documentoRutas(V, titulo) {
    const doc = new PDF.Documento({ titulo: `${titulo} · ${D.unidad}` });
    const ctx = { doc, y: 0, titulo, rutaPaginas: [], V };
    doc.pie((n, total) => {
      const ruta = ctx.rutaPaginas[n - 1];
      let hoja = '';
      if (ruta != null) {
        const suyas = ctx.rutaPaginas.filter(r => r === ruta).length;
        const k = ctx.rutaPaginas.slice(0, n).filter(r => r === ruta).length;
        hoja = ` · ${V.Uno.toUpperCase()} ${ruta} (HOJA ${k} DE ${suyas})`;
      }
      doc.linea(PDF_M, doc.H - 30, doc.W - PDF_M, doc.H - 30, { color: GRIS, grosor: 0.5 });
      doc.texto(PDF_M, doc.H - 19, `BRIGADAS VDM · ${titulo.toUpperCase()} · UNIDAD ${D.unidad.toUpperCase()}${hoja}`, { tam: 6.5, color: GRIS_OSC, max: doc.W - 2 * PDF_M - 90 });
      doc.texto(doc.W - PDF_M, doc.H - 19, `Página ${n} de ${total}`, { tam: 6.5, color: GRIS_OSC, alinear: 'der' });
    });
    return ctx;
  }

  function insigniaPdf(doc, x, y, tipo) {
    const s = PRIO[tipo];
    if (tipo) doc.circulo(x + 4, y - 3, 3.6, { relleno: s.relleno, borde: tipo >= 3 ? GRIS_OSC : s.relleno, grosor: 1.2 });
    doc.texto(x + 11, y, s.corto, { tam: 7.5, negrita: true, color: NEGRO });
  }

  // Franja, unidad, título del PDF y día: lo primero de cada hoja
  function cabezaHoja(ctx, R) {
    const { doc } = ctx;
    doc.pagina();
    doc.rect(0, 0, doc.W, 8, { relleno: ROJO });
    doc.texto(PDF_M, 25, `REPORTE ICE · UNIDAD ${D.unidad.toUpperCase()} · ${ctx.titulo.toUpperCase()}`, { tam: 7.5, negrita: true, color: GRIS_OSC, max: doc.W - 2 * PDF_M - 210 });
    doc.texto(doc.W - PDF_M, 25, `${R.dia} ${fechaLarga(R.fecha)} · frecuencia ${ctx.V.frecuencia} ${R.letra}`, { tam: 8, color: NEGRO, alinear: 'der' });
  }

  // Encabezado de la hoja de una ruta (h = {codigo, jefatura, resumen}), con qué
  // es cada tipo de cliente (los criterios de tiposCliente)
  function hojaRuta(ctx, R, h, sigue) {
    const { doc, V } = ctx, ancho = doc.W - 2 * PDF_M, ant = D.prioridad.mes_anterior;
    cabezaHoja(ctx, R);
    ctx.rutaPaginas[doc.paginas.length - 1] = h.codigo;
    const w = doc.texto(PDF_M, 50, `${V.Uno.toUpperCase()} ${h.codigo}`, { tam: 20, negrita: true, color: ROJO });
    if (sigue) doc.texto(PDF_M + w + 8, 50, '(continuación)', { tam: 9, color: GRIS_OSC });
    doc.texto(doc.W - PDF_M, 50, nombreJefatura(h.jefatura).toUpperCase(), { tam: 11, negrita: true, color: NEGRO, alinear: 'der', max: 240 });
    doc.texto(PDF_M, 65, h.resumen, { tam: 8.5, color: NEGRO, max: ancho });
    const tipos = [[1, `Evaluado en ${ant} y con ${num(D.prioridad.min_visitas)} o más visitas ICE en los meses anteriores.`],
                   [2, `Evaluado en ${ant}, sin esa recurrencia.`],
                   [3, `Cliente aleatorio que no se evaluó en ${ant}, pero sí alguna vez antes.`]];
    let y = 73;
    doc.rect(PDF_M, y, ancho, 54, { relleno: '#F4F4F4' });
    doc.texto(PDF_M + 8, y + 11, 'QUÉ ES CADA TIPO DE CLIENTE', { tam: 6.5, negrita: true, color: GRIS_OSC });
    tipos.forEach(([p, texto], i) => {
      const yy = y + 23 + i * 11.5;
      insigniaPdf(doc, PDF_M + 8, yy, p);
      const wn = doc.texto(PDF_M + 34, yy, `${PRIO[p].nombre}:`, { tam: 8, negrita: true, color: NEGRO });
      doc.texto(PDF_M + 38 + wn, yy, texto, { tam: 8, color: NEGRO, max: ancho - 46 - wn });
    });
    y += 54 + 4;
    const nota = `Más le quitó: la submétrica que más puntos le quitó en su última evaluación ICE. ${V.colEpica}: la ÉPICA de ${D.mes} hecha por ${V.quien}${epicaAl() ? ` (datos al ${fechaLarga(epicaAl())})` : ''}, con calificación y fecha, o Pendiente.`;
    for (const linea of PDF.renglones(nota, ancho, 7)) {
      y += 9;
      doc.texto(PDF_M, y, linea, { tam: 7, color: GRIS_OSC });
    }
    ctx.y = y + 8;
  }

  // Tabla con cortes de hoja: hojaNueva() abre la siguiente y se repiten los encabezados
  function tablaPdf(ctx, columnas, filas, hojaNueva) {
    const { doc } = ctx, limite = doc.H - 42;
    const cabecera = () => {
      let x = PDF_M;
      for (const c of columnas) {
        doc.texto(c.alinear === 'der' ? x + c.ancho - 4 : x + 4, ctx.y + 10, c.titulo.toUpperCase(), { tam: 6.5, negrita: true, color: GRIS_OSC, alinear: c.alinear === 'der' ? 'der' : 'izq', max: c.ancho - 6 });
        x += c.ancho;
      }
      doc.linea(PDF_M, ctx.y + 14, doc.W - PDF_M, ctx.y + 14, { color: NEGRO, grosor: 0.8 });
      ctx.y += 15;
    };
    cabecera();
    filas.forEach((f, k) => {
      if (ctx.y + PDF_FILA > limite) { hojaNueva(); cabecera(); }
      if (k % 2) doc.rect(PDF_M, ctx.y, doc.W - 2 * PDF_M, PDF_FILA, { relleno: '#F4F4F4' });
      let x = PDF_M;
      columnas.forEach((c, j) => {
        const v = f[j];
        if (v && v.tipo != null) insigniaPdf(doc, x + 4, ctx.y + 11, v.tipo);
        else {
          const t = v && typeof v === 'object' ? v : { texto: v };
          doc.texto(c.alinear === 'der' ? x + c.ancho - 4 : x + 4, ctx.y + 11, t.texto == null ? '' : String(t.texto),
                    { tam: 8, negrita: !!t.negrita, color: t.color || NEGRO, alinear: c.alinear === 'der' ? 'der' : 'izq', max: c.ancho - 7 });
        }
        x += c.ancho;
      });
      ctx.y += PDF_FILA;
    });
    doc.linea(PDF_M, ctx.y, doc.W - PDF_M, ctx.y, { color: GRIS, grosor: 0.5 });
  }

  // Ubicación de clientes prioritarios: una tarjeta por cliente P1 y P2 de la hoja
  // con nombre, SAP y un QR que abre su ubicación en Google Maps. Va solo si caben
  // todas en lo que queda de la última hoja de la ruta; si no, no se pone.
  const QR_COLUMNAS = 3, QR_ALTO = 80, QR_SEP = 6;
  const urlUbicacion = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;

  // soloCercanos: solo los clientes cercanos a la ruta (Farmers, Zona y cercanos)
  function ubicacionesPdf(ctx, puntos, soloCercanos = false) {
    const lista = puntos.filter(p => p[4] === 1 || p[4] === 2);
    if (!lista.length) return false;
    const { doc } = ctx, ancho = doc.W - 2 * PDF_M, filas = Math.ceil(lista.length / QR_COLUMNAS);
    let y = ctx.y + 18;
    if (y + 30 + filas * (QR_ALTO + QR_SEP) - QR_SEP > doc.H - 42) return false;
    doc.rect(PDF_M, y, 4, 13, { relleno: ROJO });
    doc.texto(PDF_M + 10, y + 10.5, soloCercanos ? 'UBICACIÓN DE LOS CLIENTES CERCANOS' : 'UBICACIÓN DE CLIENTES PRIORITARIOS', { tam: 10.5, negrita: true, color: NEGRO });
    doc.texto(PDF_M, y + 24, `${soloCercanos ? 'Clientes cercanos a tu ruta (no están en ella)' : `Clientes prioridad 1 y 2 de esta hoja${lista.some(esCercano) ? ' (los marcados CERCANO no están en tu ruta)' : ''}`}. Escanea el QR con la cámara del celular para abrir su ubicación en Google Maps.`, { tam: 7, color: GRIS_OSC, max: ancho });
    y += 30;
    const w = (ancho - (QR_COLUMNAS - 1) * QR_SEP) / QR_COLUMNAS, lado = QR_ALTO - 8;
    lista.forEach((p, k) => {
      const x = PDF_M + (k % QR_COLUMNAS) * (w + QR_SEP), yy = y + Math.floor(k / QR_COLUMNAS) * (QR_ALTO + QR_SEP);
      doc.rect(x, yy, w, QR_ALTO, { borde: GRIS, grosor: 0.6 });
      if (p[0] != null && p[1] != null) doc.qr(x + 4, yy + 4, lado, QR.crear(urlUbicacion(p[0], p[1]), { nivel: 'M' }));
      else {
        doc.rect(x + 4, yy + 4, lado, lado, { relleno: '#F4F4F4' });
        doc.texto(x + 4 + lado / 2, yy + 4 + lado / 2 - 2, 'Sin', { tam: 7, color: GRIS_OSC, alinear: 'centro' });
        doc.texto(x + 4 + lado / 2, yy + 4 + lado / 2 + 7, 'coordenadas', { tam: 7, color: GRIS_OSC, alinear: 'centro' });
      }
      const tx = x + lado + 10, tw = w - lado - 14;
      insigniaPdf(doc, tx, yy + 15, p[4]);
      if (esCercano(p)) doc.texto(tx + 27, yy + 15, 'CERCANO', { tam: 6.5, negrita: true, color: ROJO });
      const nombre = PDF.renglones(p[3] || 'Cliente sin nombre', tw, 8, true);
      nombre.slice(0, 3).forEach((linea, i) => {
        const resto = i === 2 && nombre.length > 3 ? nombre.slice(2).join(' ') : linea;
        doc.texto(tx, yy + 30 + i * 10, resto, { tam: 8, negrita: true, color: NEGRO, max: tw });
      });
      doc.texto(tx, yy + QR_ALTO - 9, `SAP ${p[2]}`, { tam: 8, color: NEGRO, max: tw });
    });
    ctx.y = y + filas * (QR_ALTO + QR_SEP) - QR_SEP;
    return true;
  }

  // Semanas de clientes prioridad 3: SAP, nombre y la semana del mes en que más veces
  // lo ha evaluado el auditor (la de la pestaña Semanas). Va debajo de los QR (o de la
  // tabla, si los QR no cupieron), en dos columnas para que ocupe la mitad de alto, y
  // solo si cabe completa en lo que queda de la última hoja de la ruta; si no, no se pone.
  // Anchos: el SAP de 10 dígitos en negritas y el encabezado «SEMANA MÁS EVALUADA»; lo demás es del nombre
  const P3_FILA = 13, P3_SEP = 14, P3_ANCHO_SAP = 52, P3_ANCHO_SEMANA = 89;

  function semanasP3Pdf(ctx, puntos, R) {
    const lista = puntos.filter(p => p[4] === 3)
      .map((p, k) => ({ p, k, s: (porSapCliente[p[2]] || [])[14] || null }))
      .sort((a, b) => (a.s || 9) - (b.s || 9) || a.k - b.k);
    if (!lista.length) return false;
    const { doc } = ctx, ancho = doc.W - 2 * PDF_M;
    const f = partes(R.fecha), semHoja = semanaDe(f.d), finMes = new Date(f.a, f.m, 0).getDate();
    const dias = { 1: '1–7', 2: '8–14', 3: '15–21', 4: `22–${finMes}` };
    const nota = PDF.renglones(`Semana del mes en que más veces lo ha evaluado el auditor (si hay empate, la de su visita más reciente). ` +
      `El ${R.dia.toLowerCase()} ${f.d} de ${MESES[f.m - 1]} es semana ${semHoja}: esos van en negritas.`, ancho, 7);
    const filas = Math.ceil(lista.length / 2);
    let y = ctx.y + 18;
    const ty = y + 24 + (nota.length - 1) * 9 + 6;
    if (ty + 15 + filas * P3_FILA > doc.H - 42) return false;
    doc.rect(PDF_M, y, 4, 13, { relleno: ROJO });
    doc.texto(PDF_M + 10, y + 10.5, 'SEMANAS DE CLIENTES PRIORIDAD 3', { tam: 10.5, negrita: true, color: NEGRO });
    nota.forEach((linea, i) => doc.texto(PDF_M, y + 24 + i * 9, linea, { tam: 7, color: GRIS_OSC }));
    // Dos bloques lado a lado: primero se llena el izquierdo
    const w = (ancho - P3_SEP) / 2, columnas = [['SAP', P3_ANCHO_SAP], ['Cliente', w - P3_ANCHO_SAP - P3_ANCHO_SEMANA], ['Semana más evaluada', P3_ANCHO_SEMANA]];
    const bloques = [lista.slice(0, filas), lista.slice(filas)].filter(b => b.length);
    bloques.forEach((bloque, b) => {
      const x0 = PDF_M + b * (w + P3_SEP);
      let x = x0;
      for (const [titulo, a] of columnas) {
        doc.texto(x + 4, ty + 10, titulo.toUpperCase(), { tam: 6.5, negrita: true, color: GRIS_OSC, max: a - 6 });
        x += a;
      }
      doc.linea(x0, ty + 14, x0 + w, ty + 14, { color: NEGRO, grosor: 0.8 });
      let yy = ty + 15;
      bloque.forEach(({ p, s }, k) => {
        if (k % 2) doc.rect(x0, yy, w, P3_FILA, { relleno: '#F4F4F4' });
        const negrita = s === semHoja, valores = [p[2], p[3] || 'Cliente sin nombre', s ? `${s} (días ${dias[s]})` : 'Sin fecha'];
        let xc = x0;
        columnas.forEach(([, a], j) => {
          doc.texto(xc + 4, yy + 9.3, String(valores[j]), { tam: 8, negrita, color: s || j < 2 ? NEGRO : GRIS_OSC, max: a - 7 });
          xc += a;
        });
        yy += P3_FILA;
      });
      doc.linea(x0, yy, x0 + w, yy, { color: GRIS, grosor: 0.5 });
    });
    ctx.y = ty + 15 + filas * P3_FILA;
    return true;
  }

  // En los PDF imprimibles la ÉPICA del mes es solo la del grupo de la vista: preventa en
  // los de Preventa y farmers en los de Farmers (en pantalla, la de brigadistas)
  const epicaAl = () => D.epica_base_corte || D.epica_corte;

  function epicaPdf(V, sap) {
    const e = V.epica()[sap];
    if (!e) return { texto: 'Pendiente', negrita: true, color: ROJO };
    return { texto: `${dec1(e[1])} · ${ddmm(e[0])}${e[2] ? ' · NoGeo' : ''}${e[3] ? ' · FdF' : ''}`, negrita: !!(e[2] || e[3]), color: e[2] || e[3] ? ROJO : NEGRO };
  }

  // Día de la semana (índice en rutas_semana.dias o farmers_semana.dias) con la forma de
  // D.rutas.hoy: sus clientes P1, P2 y P3
  function rutasDeSemana(V, i) {
    const d = V.semana().dias[i], base = partes(D.hoy), sel = canalVista(V);
    let f = new Date(base.a, base.m - 1, base.d);
    for (let k = 0; k < 7 && DIAS[f.getDay()] !== d.dia; k++) f.setDate(f.getDate() + 1);
    const fecha = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    const punto = s => { const c = porSapCliente[s]; return [c ? c[2] : null, c ? c[3] : null, s, c ? c[1] : '', c ? c[4] : 3]; };
    // Con el botón de canal de Farmers: solo los clientes de ese canal (clientes[18]) y el
    // total de clientes de cada farmer es el de ese canal (dias[].canales_total)
    const okCanal = s => sel == null || (!!porSapCliente[s] && porSapCliente[s][18] === sel);
    const totalDe = (codigo, total) => sel == null || !d.canales_total ? total : (d.canales_total[codigo] || [])[sel] || 0;
    let rutas = d.ice.map(([codigo, jefatura, total, saps]) => ({ codigo, jefatura, total: totalDe(codigo, total), puntos: saps.filter(okCanal).map(punto) }));
    if (V.cercanos) {
      // Vista Zona y cercanos: todos los farmers del día (aunque no traigan P1–P3), con
      // su zona y sus cercanos [lat, lon, sap, nombre, tipo, metros a la ruta]; con un
      // canal elegido, las zonas y cercanos escogidos solo entre los de ese canal
      const por = Object.fromEntries(rutas.map(r => [r.codigo, r]));
      const zonas = sel != null && d.zonas_canal ? d.zonas_canal[D.canales[sel]] : d.zonas;
      for (const [codigo, jefatura, total, margen, poligono, cerc] of zonas || []) {
        const r = por[codigo] || (por[codigo] = { codigo, jefatura, total: totalDe(codigo, total), puntos: [] });
        Object.assign(r, { margen, poligono, cercanos: cerc.filter(([s]) => okCanal(s)).map(([s, metros]) => punto(s).concat([metros])) });
      }
      rutas = Object.values(por).sort((a, b) => a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
      for (const r of rutas) r.cercanos = r.cercanos || [];
    } else if (sel != null) rutas = rutas.filter(r => r.puntos.length);
    return { dia: d.dia, letra: d.letra, fecha, rutas };
  }

  // Clientes cercanos a la ruta que no están en ella (Farmers, vista Zona y cercanos): su
  // propia tabla debajo de la de la ruta, con cortes de hoja como la principal
  function cercanosPdf(ctx, R, h, cerc) {
    const { doc, V } = ctx, ancho = doc.W - 2 * PDF_M;
    const canal = canalVista(V) != null ? ` ${nombreCanalCorto(canalVista(V))}` : '';
    const nota = PDF.renglones(`Clientes${canal} prioridad 1 y 2 sin frecuencia Farmer y sin ICE en ${D.mes} que quedan dentro de la zona de tu recorrido del ${R.dia.toLowerCase()} ` +
      `(tus clientes del día más ${num(h.margen)} m alrededor). No están en tu ruta: son los más cercanos a ella. A tu ruta: distancia al camino que une a tus clientes en orden.`, ancho, 7);
    const alto = 18 + 24 + (nota.length - 1) * 9 + 6 + 15 + PDF_FILA;
    if (ctx.y + alto > doc.H - 42) hojaRuta(ctx, R, h, true);
    const y = ctx.y + 18;
    doc.rect(PDF_M, y, 4, 13, { relleno: ROJO });
    doc.texto(PDF_M + 10, y + 10.5, 'CLIENTES CERCANOS A TU RUTA (NO ESTÁN EN ELLA)', { tam: 10.5, negrita: true, color: NEGRO });
    nota.forEach((linea, i) => doc.texto(PDF_M, y + 24 + i * 9, linea, { tam: 7, color: GRIS_OSC }));
    ctx.y = y + 24 + (nota.length - 1) * 9 + 6;
    const columnas = [{ titulo: '#', ancho: 20 }, { titulo: 'Tipo', ancho: 28 }, { titulo: 'SAP', ancho: 52 }, { titulo: 'Cliente', ancho: 106 },
                      { titulo: 'Dirección', ancho: 94 }, { titulo: 'A tu ruta', ancho: 48, alinear: 'der' }, { titulo: 'Últ. ICE', ancho: 36, alinear: 'der' },
                      { titulo: 'Más le quitó', ancho: 78 }, { titulo: V.colEpica, ancho: 86 }];
    const filas = cerc.map((p, k) => {
      const c = porSapCliente[p[2]], u = c && c[17];
      return [`C${k + 1}`, { tipo: p[4] }, p[2], p[3], c ? c[13] : '', `${num(p[5])} m`, c && c[11] != null ? dec1(c[11]) : '',
              u ? { texto: cortoPeor(u), negrita: u[4] != null } : '', epicaPdf(V, p[2])];
    });
    tablaPdf(ctx, columnas, filas, () => hojaRuta(ctx, R, h, true));
  }

  // Rutas de preventa o de farmers: solo clientes prioridad 1, 2 y 3 que aún no tienen ICE en
  // el mes (los no prioritarios nunca se han evaluado y no traen nada que trabajar). Una ruta
  // por hoja, juntas las de cada jefatura. Devuelve cuántas rutas y hojas salieron.
  function pdfRutas(V, R, titulo, archivo, todos) {
    const evaluado = p => !!porSapEval[p[2]];
    const nunca = p => p[4] === 4 && !evaluado(p);
    const jefDe = x => x.r.jefatura || SIN_JEFATURA;
    const rutasPdf = R.rutas.map(r => ({ r, puntos: r.puntos.filter(p => !evaluado(p) && !nunca(p)), cerc: (r.cercanos || []).filter(p => !evaluado(p)) }))
      .filter(x => (todos ? x.puntos.length : x.puntos.some(p => p[4])) || x.cerc.length)
      .sort((a, b) => (jefDe(a) === SIN_JEFATURA) - (jefDe(b) === SIN_JEFATURA) || jefDe(a).localeCompare(jefDe(b), 'es', { numeric: true }));
    const ctx = documentoRutas(V, titulo);
    const canal = canalVista(V) != null ? ` ${nombreCanalCorto(canalVista(V))}` : '';   // botón de canal de Farmers
    let conQr = 0, conP3 = 0, cercanos = 0;
    const columnas = [{ titulo: '#', ancho: 18 }, { titulo: 'Tipo', ancho: 28 }, { titulo: 'SAP', ancho: 52 }, { titulo: 'Cliente', ancho: 128 },
                      { titulo: 'Dirección', ancho: 122 }, { titulo: 'Últ. ICE', ancho: 36, alinear: 'der' }, { titulo: 'Más le quitó', ancho: 78 },
                      { titulo: V.colEpica, ancho: 86 }];
    if (!rutasPdf.length) {
      cabezaHoja(ctx, R);
      ctx.doc.texto(PDF_M, 56, `No hay ${V.varios} con clientes ICE${canal} por evaluar este día.`, { tam: 12, negrita: true, color: NEGRO });
    }
    for (const x of rutasPdf) {
      const { r, puntos: pendientes, cerc } = x, t = cuentaTipos(pendientes), fuera = r.puntos.filter(evaluado).length;
      const ice = pendientes.filter(p => p[4]).sort((a, b) => a[4] - b[4]);
      const puntos = todos ? ice.concat(pendientes.filter(p => !p[4])) : ice;
      const filas = puntos.map((p, k) => {
        const c = porSapCliente[p[2]], u = c && c[17];
        return [k + 1, { tipo: p[4] }, p[2], p[3], c ? c[13] : '', p[4] && c && c[11] != null ? dec1(c[11]) : '',
                u ? { texto: cortoPeor(u), negrita: u[4] != null } : '', p[4] ? epicaPdf(V, p[2]) : ''];
      });
      const h = { codigo: r.codigo, jefatura: jefDe(x), margen: r.margen,
                  resumen: `Por evaluar: ${plural(ice.length, `cliente ICE${canal}`, `clientes ICE${canal}`)} (P1 ${t[1] || 0} · P2 ${t[2] || 0} · P3 ${t[3] || 0})` +
                           `${todos && t[0] ? ` + ${plural(t[0], `cliente no ICE${canal}`, `clientes no ICE${canal}`)}` : ''}` +
                           ` de ${plural(r.total != null ? r.total : r.puntos.length, `cliente${canal}`, `clientes${canal}`)} ${V.delUno}` +
                           `${fuera ? ` · ${plural(fuera, 'ya evaluado', 'ya evaluados')} en ${D.mes}, no se ${fuera === 1 ? 'imprime' : 'imprimen'}` : ''}` };
      hojaRuta(ctx, R, h, false);
      if (filas.length) tablaPdf(ctx, columnas, filas, () => hojaRuta(ctx, R, h, true));
      else {
        ctx.y += 12;
        ctx.doc.texto(PDF_M, ctx.y, `Ningún cliente${canal} prioridad 1, 2 o 3 de tu recorrido está pendiente este día.`, { tam: 9, negrita: true, color: NEGRO });
      }
      if (cerc.length) { cercanosPdf(ctx, R, h, cerc); cercanos += cerc.length; }
      if (ubicacionesPdf(ctx, puntos.concat(cerc))) conQr++;
      else if (cerc.length && ubicacionesPdf(ctx, cerc, true)) conQr++;   // si no caben todos, los de los cercanos
      if (semanasP3Pdf(ctx, puntos, R)) conP3++;
    }
    PDF.descargar(ctx.doc.blob(), archivo);
    return { rutas: rutasPdf.length, hojas: ctx.doc.paginas.length, conQr, conP3, cercanos };
  }

  // Botón de impresión de una vista: el de hoy (data-pdf) o el de un día de la semana (data-pdf-dia)
  function imprimir(V, boton, estado, todos) {
    boton.disabled = true;
    estado.textContent = 'Generando el PDF...';
    // Con el botón de canal de Farmers el título y el archivo dicen el canal
    const sel = canalVista(V), canal = sel == null ? '' : nombreCanalCorto(sel);
    const tit = t => canal ? `${t} · ${canal}` : t, arch = a => canal ? `${a}_${canal.replace(/\s+/g, '')}` : a;
    // Deja que el navegador pinte el aviso antes de armar el documento
    setTimeout(() => {
      try {
        let hecho;
        if (boton.dataset.pdfDia != null) {
          const R = rutasDeSemana(V, +boton.dataset.pdfDia);
          hecho = pdfRutas(V, R, tit(V.tituloDia(R.dia.toLowerCase())), `${arch(V.archivoDia)}_${R.dia}_${D.unidad}_${R.fecha}.pdf`, false);
        } else if (V.cercanos) {
          const R = rutasDeSemana(V, V.semana().dias.findIndex(d => d.hoy));
          hecho = pdfRutas(V, R, tit(V.tituloHoy), `${arch(V.archivoHoy)}_${D.unidad}_${R.fecha}.pdf`, false);
        } else {
          const R = rutasVista(V, 'hoy');
          hecho = pdfRutas(V, R, tit(V.tituloHoy), `${arch(V.archivoHoy)}_${D.unidad}_${R.fecha}.pdf`, todos);
        }
        estado.textContent = hecho.rutas ? `PDF listo${canal ? ` (solo ${canal})` : ''}: ${plural(hecho.rutas, V.uno, V.varios)} en ${plural(hecho.hojas, 'hoja')}, ${num(hecho.conQr)} con la ubicación de sus clientes prioritarios y ${num(hecho.conP3)} con las semanas de sus clientes prioridad 3${V.cercanos ? `; ${plural(hecho.cercanos, 'cliente cercano agregado', 'clientes cercanos agregados')}` : ''}. Revisa tus descargas.`
          : `PDF listo: este día no hay ${V.varios} con clientes${canal ? ` ${canal}` : ''} por evaluar.`;
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
  // Lo que comparte con el administrador (js/ice-admin.js)
  return { util: { capaBase, limitesRobustos, svgIcono } };
})();
