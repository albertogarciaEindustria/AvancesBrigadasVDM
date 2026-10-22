/* Generador mínimo de PDF (sin librerías externas): texto en Helvetica y
 * Helvetica-Bold (fuentes estándar de todo lector de PDF, codificación WinAnsi:
 * acentos y ñ incluidos), líneas y rectángulos. Las coordenadas van en puntos
 * desde la esquina superior izquierda; el texto se coloca por su línea base.
 * Lo usa la página ICE para imprimir las listas de rutas. */
const PDF = (function () {
  'use strict';

  // Anchos (milésimas del tamaño) de los caracteres WinAnsi 32–255, de las
  // métricas AFM de Adobe (Helvetica.afm y Helvetica-Bold.afm)
  const ANCHOS = {
    F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
  };
  // Unicode -> WinAnsi para los caracteres de 0x80–0x9F
  const ESPECIALES = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
    0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
    0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
  };
  const ELIPSIS = 0x85;

  function codigoDe(ch) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 0xA0 && c <= 0xFF)) return c;
    if (ESPECIALES[c]) return ESPECIALES[c];
    if (c === 9 || c === 10 || c === 13) return 32;
    // Sin equivalente: la letra sin acento o '?'
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const b = base.codePointAt(0);
    return base && b >= 32 && b < 127 ? b : 63;
  }

  const codigos = texto => Array.from(String(texto == null ? '' : texto), codigoDe);

  function anchoCodigos(cods, tam, negrita) {
    const tabla = ANCHOS[negrita ? 'F2' : 'F1'];
    let s = 0;
    for (const c of cods) s += tabla[c - 32] || 556;
    return s * tam / 1000;
  }

  function ancho(texto, tam, negrita) { return anchoCodigos(codigos(texto), tam, negrita); }

  // Recorta con "…" para que quepa en `max` puntos
  function recortar(cods, max, tam, negrita) {
    if (anchoCodigos(cods, tam, negrita) <= max) return cods;
    const tabla = ANCHOS[negrita ? 'F2' : 'F1'];
    let s = tabla[ELIPSIS - 32] * tam / 1000;
    const out = [];
    for (const c of cods) {
      const w = (tabla[c - 32] || 556) * tam / 1000;
      if (s + w > max) break;
      out.push(c);
      s += w;
    }
    while (out.length && out[out.length - 1] === 32) out.pop();
    out.push(ELIPSIS);
    return out;
  }

  // Cadena literal de PDF solo con ASCII (lo demás en octal)
  function literal(cods) {
    let s = '';
    for (const c of cods) {
      if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
      else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
      else s += String.fromCharCode(c);
    }
    return '(' + s + ')';
  }

  function rgb(color) {
    const h = String(color || '#000').replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0');
    return [0, 2, 4].map(i => (parseInt(n.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  }

  const f = n => (Math.round(n * 100) / 100).toString();

  // Dividir un texto en renglones de `max` puntos (por palabras)
  function renglones(texto, max, tam, negrita) {
    const palabras = String(texto || '').split(/\s+/).filter(Boolean);
    const out = [];
    let linea = '';
    for (const p of palabras) {
      const prueba = linea ? linea + ' ' + p : p;
      if (!linea || ancho(prueba, tam, negrita) <= max) linea = prueba;
      else { out.push(linea); linea = p; }
    }
    if (linea) out.push(linea);
    return out;
  }

  class Documento {
    constructor({ ancho: W = 612, alto: H = 792, titulo = '' } = {}) {
      this.W = W; this.H = H; this.titulo = titulo;
      this.paginas = []; this.ops = null; this._pie = null;
    }

    pagina() { this.ops = []; this.paginas.push(this.ops); return this; }

    texto(x, y, contenido, { tam = 9, negrita = false, color = '#000000', alinear = 'izq', max = null } = {}) {
      let cods = codigos(contenido);
      if (max != null) cods = recortar(cods, max, tam, negrita);
      const w = anchoCodigos(cods, tam, negrita);
      const x0 = alinear === 'der' ? x - w : alinear === 'centro' ? x - w / 2 : x;
      this.ops.push(`BT /${negrita ? 'F2' : 'F1'} ${f(tam)} Tf ${rgb(color)} rg ${f(x0)} ${f(this.H - y)} Td ${literal(cods)} Tj ET`);
      return w;
    }

    rect(x, y, w, h, { relleno = null, borde = null, grosor = 0.5 } = {}) {
      const caja = `${f(x)} ${f(this.H - y - h)} ${f(w)} ${f(h)} re`;
      if (relleno && borde) this.ops.push(`${rgb(relleno)} rg ${rgb(borde)} RG ${f(grosor)} w ${caja} B`);
      else if (relleno) this.ops.push(`${rgb(relleno)} rg ${caja} f`);
      else if (borde) this.ops.push(`${rgb(borde)} RG ${f(grosor)} w ${caja} S`);
    }

    linea(x1, y1, x2, y2, { color = '#000000', grosor = 0.5 } = {}) {
      this.ops.push(`${rgb(color)} RG ${f(grosor)} w ${f(x1)} ${f(this.H - y1)} m ${f(x2)} ${f(this.H - y2)} l S`);
    }

    circulo(x, y, r, { relleno = null, borde = null, grosor = 0.8 } = {}) {
      const k = 0.5523 * r, cy = this.H - y;
      const d = `${f(x + r)} ${f(cy)} m ${f(x + r)} ${f(cy + k)} ${f(x + k)} ${f(cy + r)} ${f(x)} ${f(cy + r)} c ` +
                `${f(x - k)} ${f(cy + r)} ${f(x - r)} ${f(cy + k)} ${f(x - r)} ${f(cy)} c ` +
                `${f(x - r)} ${f(cy - k)} ${f(x - k)} ${f(cy - r)} ${f(x)} ${f(cy - r)} c ` +
                `${f(x + k)} ${f(cy - r)} ${f(x + r)} ${f(cy - k)} ${f(x + r)} ${f(cy)} c`;
      if (relleno && borde) this.ops.push(`${rgb(relleno)} rg ${rgb(borde)} RG ${f(grosor)} w ${d} B`);
      else if (relleno) this.ops.push(`${rgb(relleno)} rg ${d} f`);
      else if (borde) this.ops.push(`${rgb(borde)} RG ${f(grosor)} w ${d} S`);
    }

    /** fn(número de página, total) se llama en cada página al cerrar el documento. */
    pie(fn) { this._pie = fn; }

    blob() {
      const total = this.paginas.length;
      if (this._pie) {
        this.paginas.forEach((ops, i) => { this.ops = ops; this._pie(i + 1, total); });
      }
      const objs = [];
      const agregar = cuerpo => { objs.push(cuerpo); return objs.length; };
      const catalogo = agregar(null), paginas = agregar(null);
      const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = [];
      for (const ops of this.paginas) {
        const contenido = ops.join('\n');
        const c = agregar(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
        kids.push(agregar(`<< /Type /Page /Parent ${paginas} 0 R /MediaBox [0 0 ${this.W} ${this.H}] ` +
                          `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
      }
      objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginas} 0 R >>`;
      objs[paginas - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
      const ahora = new Date(), p2 = n => String(n).padStart(2, '0');
      const fecha = `D:${ahora.getFullYear()}${p2(ahora.getMonth() + 1)}${p2(ahora.getDate())}${p2(ahora.getHours())}${p2(ahora.getMinutes())}${p2(ahora.getSeconds())}`;
      const info = agregar(`<< /Title ${literal(codigos(this.titulo))} /Producer (Brigadas VDM) /CreationDate (${fecha}) >>`);

      let salida = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const posiciones = [];
      objs.forEach((cuerpo, i) => {
        posiciones.push(salida.length);
        salida += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
      });
      const xref = salida.length;
      salida += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
                posiciones.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
                `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      // Todo es ASCII salvo los 4 bytes binarios del encabezado (latin-1)
      const bytes = new Uint8Array(salida.length);
      for (let i = 0; i < salida.length; i++) bytes[i] = salida.charCodeAt(i) & 0xFF;
      return new Blob([bytes], { type: 'application/pdf' });
    }
  }

  /** Descarga el blob como archivo (nombre sin caracteres raros). */
  function descargar(blob, nombre) {
    const limpio = String(nombre).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'reporte.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = limpio.endsWith('.pdf') ? limpio : limpio + '.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { Documento, ancho, renglones, descargar };
})();
