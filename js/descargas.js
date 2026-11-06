/* Pestaña "Descargas" de la página de unidad: Excel listos para importar en
 * Google My Maps con los clientes faltantes (universo brigadista sin
 * trabajar), los trabajados (con quién, cuándo y cómo quedó su ÉPICA) y los
 * fáciles (con ÉPICA en meses anteriores, Historicos/EPICAHistorico.db). My
 * Maps importa hasta MAX_FILAS filas por capa, así que cada grupo se parte en
 * archivos de ese tamaño (ordenados por jefatura y ruta para que cada archivo
 * sea una zona) y todo se puede bajar junto en un ZIP. Se arman aquí con los
 * datos de la unidad (mapa y buscador): no viajan archivos en los datos. */
const Descargas = (function () {
  'use strict';
  const { esc, num } = Util;
  const MAX_FILAS = 2000;
  const SI = v => v ? 'Sí' : 'No';
  const compara = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

  // Datos del cliente desde el buscador (Master Data de la oficina)
  function indiceClientes(D) {
    const B = D.buscador, d = B.dic, porSap = {};
    for (const c of B.clientes) {
      porSap[c[0]] = { nombre: c[1], calle: c[2], colonia: d.col[c[3]], ciudad: d.ciu[c[4]], cp: c[5], lat: c[6], lon: c[7],
        ruta: d.ruta[c[8]], canal: d.can[c[9]], subcanal: d.sub[c[10]], segmento: d.seg[c[11]], nivel: d.niv[c[12]],
        jefatura: d.jef[c[13]], zpv: d.zpv[c[14]], brigadista: !!(c[15] & 1), ice: !!(c[15] & 2) };
    }
    return porSap;
  }

  const COLS_INICIO = [['Nombre', 34], ['SAP', 12], ['Latitud', 11], ['Longitud', 11]];
  const COLS_CLIENTE = [['Dirección', 34], ['Colonia', 24], ['Ciudad', 16], ['CP', 8], ['Ruta', 10], ['Jefatura', 14],
    ['Frecuencia ZPV', 11], ['Canal', 14], ['Subcanal', 20], ['Segmento', 12], ['Nivel', 10], ['Cliente brigadista', 11],
    ['Evaluable ICE', 10]];
  const columnas = (...grupos) => grupos.flat().map(([titulo, ancho]) => ({ titulo, ancho }));
  const comoLlegar = (lat, lon) => lat == null ? null : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const datosCliente = c => [c.calle, c.colonia, c.ciudad, c.cp, c.ruta, c.jefatura || 'Sin jefatura', c.zpv, c.canal,
    c.subcanal, c.segmento, c.nivel, SI(c.brigadista), SI(c.ice)];

  /** Los tres grupos de archivos de la unidad: [{id, titulo, descripcion,
   *  prefijo, hoja, columnas, filas}]. Se calculan una vez por unidad. */
  let cache = null;
  function grupos(D) {
    if (cache && cache.D === D) return cache.grupos;
    const porSap = indiceClientes(D), M = D.mapa, H = D.epica_historico;
    const hist = H ? H.clientes : {};
    const nombreDe = Object.fromEntries((D.brigadistas || []).map(b => [b.clave, b.nombre]));
    const mesTxt = `${D.mes} ${D.anio}`;
    // Cliente del mapa ([lat, lon, sap, nombre, jefatura, zpv, ruta, ice]) con lo que falte del buscador
    const cliente = p => ({ nombre: p[3], lat: p[0], lon: p[1], jefatura: M.jefaturas[p[4]], zpv: p[5], ruta: p[6], ice: !!p[7],
      brigadista: true, ...Object.fromEntries(Object.entries(porSap[p[2]] || {}).filter(([, v]) => v != null && v !== '')) });
    const diasHist = sap => hist[sap] ? hist[sap][0] : 0;
    const porZona = (a, b) => compara(a.c.jefatura || '~', b.c.jefatura || '~') || compara(a.c.ruta || '', b.c.ruta || '') || compara(a.c.nombre || '', b.c.nombre || '');

    const faltantes = M.faltantes.map(p => ({ p, c: cliente(p) })).sort(porZona).map(({ p, c }) => [
      c.nombre, p[2], p[0], p[1], diasHist(p[2]), ...datosCliente(c), comoLlegar(p[0], p[1])]);

    const epica = D.buscador.epica || {};
    const trabajados = M.trabajados.map(p => ({ p, c: cliente(p) })).sort(porZona).map(({ p, c }) => {
      const ses = epica[p[2]] || [];
      return [c.nombre, p[2], p[0], p[1], p[8], nombreDe[p[8]] || '', p[9], p[10], ses.length || 1,
        SI(ses.some(s => s[3])), SI(ses.some(s => s[4])), ses.length && ses[0][5] != null ? Math.round(ses[0][5]) : null,
        ...datosCliente(c), comoLlegar(p[0], p[1])];
    });

    const trabajadosSap = new Set(M.trabajados.map(p => p[2]));
    const faciles = Object.entries(hist).map(([sap, h]) => ({ sap, h, c: porSap[sap] || { nombre: '' } }))
      .sort((a, b) => b.h[0] - a.h[0] || b.h[2] - a.h[2] || compara(a.c.nombre, b.c.nombre))
      .map(({ sap, h, c }) => [c.nombre, sap, c.lat, c.lon, h[0], h[1], h[2], h[3], h[4], h[5], h[6],
        SI(h[0] >= H.min_recurrente), SI(trabajadosSap.has(sap) || (epica[sap] || []).length), ...datosCliente(c), comoLlegar(c.lat, c.lon)]);

    const lista = [
      { id: 'faltantes', titulo: 'Clientes faltantes', prefijo: 'Faltantes', hoja: 'Faltantes', filas: faltantes,
        descripcion: `Universo de clientes brigadistas sin ÉPICA en ${esc(mesTxt)}, por jefatura y ruta. La columna "Días con ÉPICA en meses anteriores" marca a los que ya aceptaron ÉPICA antes (más fáciles).`,
        columnas: columnas(COLS_INICIO, [['Días con ÉPICA en meses anteriores', 14]], COLS_CLIENTE, [['Cómo llegar', 50]]) },
      { id: 'trabajados', titulo: 'Clientes trabajados', prefijo: 'Trabajados', hoja: 'Trabajados', filas: trabajados,
        descripcion: `Clientes con ÉPICA en ${esc(mesTxt)}: quién y cuándo los trabajó, su calificación, NoGeo, foto de foto y distancia del cierre al cliente, con todos sus datos.`,
        columnas: columnas(COLS_INICIO, [['Trabajado por', 12], ['Brigadista', 26], ['Fecha de la ÉPICA', 11], ['Calificación ÉPICA', 11],
          ['ÉPICAs del mes', 9], ['NoGeo', 8], ['Foto de foto', 9], ['Distancia del cierre (m)', 11]], COLS_CLIENTE, [['Cómo llegar', 50]]) },
    ];
    if (H) lista.push({ id: 'faciles', titulo: 'Clientes fáciles (recurrentes de ÉPICA)', prefijo: 'Faciles', hoja: 'Fáciles', filas: faciles,
      descripcion: `Clientes de la unidad con ÉPICA en meses anteriores (${esc(H.meses.map(mesLargo).join(', ') || 'sin meses')}), del que más veces la ha tenido al que menos. Recurrente = ÉPICA en ${num(H.min_recurrente)} o más días distintos.`,
      columnas: columnas(COLS_INICIO, [['Días con ÉPICA', 9], ['Meses con ÉPICA', 9], ['ÉPICAs (sesiones)', 9], ['Última ÉPICA', 11],
        ...H.grupos.map(g => [`Hechas por ${g}`, 10]), ['Recurrente', 10], [`¿Con ÉPICA en ${D.mes}?`, 11]], COLS_CLIENTE, [['Cómo llegar', 50]]) });
    cache = { D, grupos: lista };
    return lista;
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function mesLargo(am) { return `${MESES[+am.slice(5, 7) - 1]} ${am.slice(0, 4)}`; }

  /** Partes de hasta MAX_FILAS filas: [{nombre del archivo, desde, hasta, filas}] */
  function partes(D, g) {
    const n = Math.max(1, Math.ceil(g.filas.length / MAX_FILAS)), salida = [];
    for (let i = 0; i < n; i++) {
      salida.push({ nombre: `${g.prefijo}_${D.unidad}${n > 1 ? `_${i + 1}de${n}` : ''}.xlsx`,
        desde: i * MAX_FILAS + 1, hasta: Math.min(g.filas.length, (i + 1) * MAX_FILAS),
        filas: g.filas.slice(i * MAX_FILAS, (i + 1) * MAX_FILAS) });
    }
    return salida;
  }

  const xlsxDe = (g, parte) => Archivos.xlsx(g.hoja, g.columnas, parte.filas);
  const limpioNombre = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

  function leeme(D, lista) {
    return [`Archivos para Google My Maps · Unidad ${D.unidad} · publicado ${D.generado}`, '',
      `Cada archivo trae como máximo ${MAX_FILAS.toLocaleString('es-MX')} clientes: es lo que My Maps importa por capa.`, '',
      'Cómo importarlos:',
      '1. Entra a https://www.google.com/mymaps y crea un mapa nuevo.',
      '2. En la capa, elige "Importar" y sube uno de los archivos .xlsx.',
      '3. Para colocar los marcadores elige las columnas "Latitud" y "Longitud".',
      '4. Como título de los marcadores elige "Nombre".',
      '5. Agrega una capa por cada archivo (un mapa admite hasta 10 capas; si hay más archivos, usa otro mapa).',
      '6. En "Estilo" puedes agrupar por "Jefatura", "Ruta" o "Días con ÉPICA" para darles color.', '',
      'Archivos:', ...lista.map(x => `- ${limpioNombre(x.nombre)}: ${x.titulo}, clientes ${x.desde.toLocaleString('es-MX')} a ${x.hasta.toLocaleString('es-MX')}`), ''].join('\r\n');
  }

  /** Descarga un grupo: un .xlsx si cabe en uno, o un ZIP con sus partes. */
  async function descargarGrupo(D, id) {
    const g = grupos(D).find(x => x.id === id), ps = partes(D, g);
    if (ps.length === 1) return Archivos.descargar(new Blob([await xlsxDe(g, ps[0])]), ps[0].nombre);
    const entradas = [];
    for (const p of ps) entradas.push({ nombre: limpioNombre(p.nombre), datos: await xlsxDe(g, p) });
    entradas.push({ nombre: 'LEEME.txt', datos: leeme(D, ps.map(p => ({ ...p, titulo: g.titulo }))) });
    Archivos.descargar(await Archivos.zip(entradas), `${g.prefijo}_${D.unidad}_MyMaps.zip`);
  }

  // ── Pestaña ───────────────────────────────────────────────────────────
  function render(panel, D, seccion) {
    const lista = grupos(D), todas = lista.flatMap(g => partes(D, g).map(p => ({ ...p, g })));
    const vacio = g => !g.filas.length;
    panel.innerHTML = seccion('Descargas para Google My Maps',
      `Excel con los clientes de ${esc(D.unidad)} listos para importar en My Maps: cada archivo trae hasta ${num(MAX_FILAS)} clientes (lo que My Maps importa por capa), con Latitud y Longitud para colocarlos y Nombre como título, más todos sus datos y el enlace "Cómo llegar".`,
      `<div class="desc-todo">
        <button type="button" class="kof-btn" id="descZip">Descargar todo en ZIP (${num(todas.filter(x => x.filas.length).length)} archivos)</button>
        <p class="desc-estado" id="descEstado" role="status" aria-live="polite"></p>
      </div>
      <div class="desc-grupos">${lista.map(g => `
        <article class="desc-grupo">
          <h3>${esc(g.titulo)} <span>${num(g.filas.length)}</span></h3>
          <p>${g.descripcion}</p>
          <div class="desc-partes">${vacio(g) ? '<span class="muted">Sin clientes</span>' : partes(D, g).map((p, i, ps) => `
            <button type="button" class="kof-btn sec" data-grupo="${g.id}" data-parte="${i}">${ps.length > 1 ? `Parte ${i + 1} · ` : ''}${num(p.desde)}–${num(p.hasta)} <small>.xlsx</small></button>`).join('')}</div>
        </article>`).join('')}
      </div>
      <ol class="desc-pasos">
        <li>Entra a <b>google.com/mymaps</b> y crea un mapa nuevo.</li>
        <li>En la capa, elige <b>Importar</b> y sube un archivo.</li>
        <li>Para colocar los marcadores elige <b>Latitud</b> y <b>Longitud</b>; como título, <b>Nombre</b>.</li>
        <li>Una capa por archivo: un mapa admite hasta 10 capas. En <b>Estilo</b> puedes agrupar por Jefatura, Ruta o Días con ÉPICA.</li>
      </ol>`);
    const estado = panel.querySelector('#descEstado');
    const ocupado = async (boton, texto, tarea) => {
      boton.disabled = true;
      estado.textContent = texto;
      try { await tarea(); estado.textContent = 'Listo: revisa tus descargas.'; }
      catch (e) { console.error(e); estado.textContent = 'No se pudo generar el archivo.'; }
      finally { boton.disabled = false; }
    };
    panel.querySelectorAll('[data-parte]').forEach(b => b.addEventListener('click', () => ocupado(b, 'Generando el Excel...', async () => {
      const g = lista.find(x => x.id === b.dataset.grupo), p = partes(D, g)[+b.dataset.parte];
      Archivos.descargar(new Blob([await xlsxDe(g, p)]), p.nombre);
    })));
    panel.querySelector('#descZip').addEventListener('click', e => ocupado(e.currentTarget, 'Generando el ZIP...', async () => {
      const entradas = [], hechas = [];
      for (const p of todas) {
        if (!p.filas.length) continue;
        entradas.push({ nombre: limpioNombre(p.nombre), datos: await xlsxDe(p.g, p) });
        hechas.push({ ...p, titulo: p.g.titulo });
      }
      entradas.push({ nombre: 'LEEME.txt', datos: leeme(D, hechas) });
      Archivos.descargar(await Archivos.zip(entradas), `MyMaps_${D.unidad}_${D.generado.slice(0, 10)}.zip`);
    }));
  }

  return { render, descargarGrupo, grupos, MAX_FILAS };
})();
