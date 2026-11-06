/* Archivos que se arman y descargan en el navegador, sin bibliotecas externas
 * (los usan el sitio de brigadistas y el sitio ICE):
 *   - ZIP con uno o varios archivos (deflate con CompressionStream si el
 *     navegador puede; si no, guardados tal cual)
 *   - Excel .xlsx de una hoja, listo para importar en Google My Maps
 *   - KML de los polígonos de concentración (Programas/poligonos_ice.py), que
 *     se descarga como KMZ (un ZIP con doc.kml) */
const Archivos = (function () {
  'use strict';
  const { esc, num } = Util;

  // Niveles de los polígonos: % de la probabilidad que reúne cada uno. KML
  // usa colores aabbggrr: relleno rojo con transparencia y su línea
  const NIVELES = {
    50: { nombre: 'Núcleo', kml: ['6b0000f4', 'ff0000c4', 2] },
    75: { nombre: 'Zona alta', kml: ['3d0000f4', 'ff0000f4', 1.5] },
    90: { nombre: 'Zona amplia', kml: ['1f0000f4', 'ff0000f4', 1] },
  };

  // ── ZIP ───────────────────────────────────────────────────────────────
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const bytesDe = d => typeof d === 'string' ? new TextEncoder().encode(d) : d;

  async function comprimir(datos) {
    if (window.CompressionStream) {
      try {
        const flujo = new Blob([datos]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return [new Uint8Array(await new Response(flujo).arrayBuffer()), 8];
      } catch (e) { /* sin deflate-raw: se guarda tal cual */ }
    }
    return [datos, 0];
  }

  // Escribe [[desplazamiento, valor, bytes]] en little endian
  function campos(largo, lista) {
    const v = new DataView(new ArrayBuffer(largo));
    for (const [o, x, t] of lista) { if (t === 4) v.setUint32(o, x, true); else v.setUint16(o, x, true); }
    return v;
  }

  /** ZIP de [{nombre, datos: Uint8Array o texto}] (nombres en UTF-8). */
  async function zip(entradas, tipo = 'application/zip') {
    const f = new Date();
    const hora = (f.getHours() << 11) | (f.getMinutes() << 5) | (f.getSeconds() >> 1);
    const dia = ((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate();
    const partes = [], central = [];
    let desplazamiento = 0, tamCentral = 0;
    for (const e of entradas) {
      const datos = bytesDe(e.datos), n = new TextEncoder().encode(e.nombre), crc = crc32(datos);
      const [cuerpo, metodo] = await comprimir(datos);
      const local = campos(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, metodo, 2], [10, hora, 2], [12, dia, 2],
        [14, crc, 4], [18, cuerpo.length, 4], [22, datos.length, 4], [26, n.length, 2], [28, 0, 2]]);
      const cab = campos(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, metodo, 2], [12, hora, 2],
        [14, dia, 2], [16, crc, 4], [20, cuerpo.length, 4], [24, datos.length, 4], [28, n.length, 2], [30, 0, 2],
        [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, desplazamiento, 4]]);
      partes.push(local, n, cuerpo);
      central.push(cab, n);
      desplazamiento += 30 + n.length + cuerpo.length;
      tamCentral += 46 + n.length;
    }
    const fin = campos(22, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, entradas.length, 2], [10, entradas.length, 2],
      [12, tamCentral, 4], [16, desplazamiento, 4], [20, 0, 2]]);
    return new Blob([...partes, ...central, fin], { type: tipo });
  }

  // ── Excel (.xlsx de una hoja) ─────────────────────────────────────────
  // Texto en cada celda (inlineStr: nunca se toma como fórmula), números como
  // número, encabezado en negritas, fijo y con filtro
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org';
  const limpio = s => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '');
  function letra(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }

  /** Uint8Array del .xlsx. columnas = [{titulo, ancho}]; filas = [[valor]]
   *  (número, texto o null). */
  async function xlsx(hoja, columnas, filas) {
    const celda = (v, ref, estilo = '') => {
      if (v == null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
      return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${esc(limpio(v))}</t></is></c>`;
    };
    const renglones = [`<row r="1">${columnas.map((c, j) => celda(c.titulo, `${letra(j)}1`, ' s="1"')).join('')}</row>`];
    filas.forEach((f, i) => renglones.push(`<row r="${i + 2}">${f.map((v, j) => celda(v, `${letra(j)}${i + 2}`)).join('')}</row>`));
    const ultima = `${letra(columnas.length - 1)}${filas.length + 1}`;
    const archivos = [
      ['[Content_Types].xml', `${XML}<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `${XML}<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `${XML}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="${esc(limpio(hoja).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', `${XML}<styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ['xl/worksheets/sheet1.xml', `${XML}<worksheet xmlns="${NS}/spreadsheetml/2006/main"><dimension ref="A1:${ultima}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnas.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('')}</cols><sheetData>${renglones.join('')}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`],
    ];
    const blob = await zip(archivos.map(([nombre, datos]) => ({ nombre, datos })));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ── KML de los polígonos ──────────────────────────────────────────────
  /** KML de un resultado de poligonos_ice.calcular (solo polígonos). `peso` =
   *  cómo se llama lo que pesa cada cliente ('evaluaciones', 'días con ÉPICA'). */
  function kmlPoligonos(R, { titulo, descripcion, peso }) {
    const anillo = a => [...a, a[0]].map(([lat, lon]) => `${lon},${lat},0`).join(' ');
    const dato = (k, v) => `<Data name="${k}"><value>${esc(v)}</value></Data>`;
    const pct = n => R.evaluaciones ? `${num(n / R.evaluaciones * 100, 0)} %` : '—';
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(titulo)}</name>
<description>${esc(descripcion)}</description>
${[90, 75, 50].map(p => { const [relleno, linea, ancho] = NIVELES[p].kml; return `<Style id="n${p}"><LineStyle><color>${linea}</color><width>${ancho}</width></LineStyle><PolyStyle><color>${relleno}</color></PolyStyle></Style>`; }).join('\n')}
${[...R.niveles].sort((a, b) => b.p - a.p).map(n => `<Folder>
<name>${esc(`${NIVELES[n.p].nombre} (${n.p} %): ${pct(n.evaluaciones)} de ${peso}, ${num(n.area_km2, 1)} km²`)}</name>
${n.poligonos.map((q, k) => `<Placemark>
<name>${esc(`${NIVELES[n.p].nombre} ${k + 1}`)}</name>
<description>${esc(`${num(q.evaluaciones)} ${peso} (${pct(q.evaluaciones)} del total) de ${num(q.clientes)} clientes · ${num(q.area_km2, 2)} km²`)}</description>
<styleUrl>#n${n.p}</styleUrl>
<ExtendedData>${dato('nivel_pct', n.p)}${dato('zona', `${NIVELES[n.p].nombre} ${k + 1}`)}${dato(peso.replace(/\W+/g, '_'), q.evaluaciones)}${dato('clientes', q.clientes)}${dato('area_km2', q.area_km2)}</ExtendedData>
<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${anillo(q.anillos[0])}</coordinates></LinearRing></outerBoundaryIs>${q.anillos.slice(1).map(h => `<innerBoundaryIs><LinearRing><coordinates>${anillo(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>
</Placemark>`).join('\n')}
</Folder>`).join('\n')}
</Document>
</kml>
`;
  }

  /** KMZ (Blob) de un resultado de poligonos_ice.calcular. */
  function kmz(R, opciones) {
    return zip([{ nombre: 'doc.kml', datos: kmlPoligonos(R, opciones) }], 'application/vnd.google-earth.kmz');
  }

  // ── Descarga ──────────────────────────────────────────────────────────
  /** Descarga el blob con un nombre sin acentos ni caracteres raros. */
  function descargar(blob, nombre) {
    const nombreLimpio = String(nombre).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 140) || 'archivo';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreLimpio;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { NIVELES, zip, xlsx, kmlPoligonos, kmz, descargar };
})();
