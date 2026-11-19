/* Generador de códigos QR (ISO/IEC 18004) sin librerías externas: modo byte
 * (texto en UTF-8), versiones 1 a 40, niveles de corrección L, M, Q y H y la
 * máscara con menos penalización. Sigue el algoritmo de referencia de Project
 * Nayuki (QR Code generator library, licencia MIT).
 *
 * QR.crear(texto, { nivel: 'M', version: null, mascara: null }) devuelve
 * { version, tamano, nivel, mascara, modulos } con modulos[fila][columna] =
 * true si el módulo es oscuro, sin la zona blanca de alrededor (4 módulos).
 * Lo usan los PDF de rutas de la página ICE (ubicación en Google Maps). */
const QR = (function () {
  'use strict';

  // Por nivel: índice en las tablas y bits del formato
  const NIVELES = { L: { i: 0, bits: 1 }, M: { i: 1, bits: 0 }, Q: { i: 2, bits: 3 }, H: { i: 3, bits: 2 } };
  // Códigos de corrección por bloque y número de bloques, por nivel y versión (1–40)
  const ECC_POR_BLOQUE = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOQUES = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const N1 = 3, N2 = 3, N3 = 40, N4 = 10;   // pesos de la penalización

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  // Módulos de datos (sin patrones de función) de una versión
  function modulosDatos(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }

  const codigosDatos = (v, n) => Math.floor(modulosDatos(v) / 8) - ECC_POR_BLOQUE[n][v] * BLOQUES[n][v];

  // Producto en GF(2^8) con el polinomio 0x11D
  function multiplica(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function divisorRS(grado) {
    const r = new Array(grado).fill(0);
    r[grado - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grado; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = multiplica(r[j], raiz);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      raiz = multiplica(raiz, 0x02);
    }
    return r;
  }

  function restoRS(datos, divisor) {
    const r = divisor.map(() => 0);
    for (const b of datos) {
      const factor = b ^ r.shift();
      r.push(0);
      divisor.forEach((c, i) => { r[i] ^= multiplica(c, factor); });
    }
    return r;
  }

  // Datos + corrección, en bloques intercalados
  function conCorreccion(datos, v, n) {
    const bloques = BLOQUES[n][v], eccBloque = ECC_POR_BLOQUE[n][v];
    const crudos = Math.floor(modulosDatos(v) / 8);
    const cortos = bloques - crudos % bloques, largoCorto = Math.floor(crudos / bloques);
    const div = divisorRS(eccBloque), lista = [];
    for (let i = 0, k = 0; i < bloques; i++) {
      const dat = datos.slice(k, k + largoCorto - eccBloque + (i < cortos ? 0 : 1));
      k += dat.length;
      const ecc = restoRS(dat, div);
      if (i < cortos) dat.push(0);
      lista.push(dat.concat(ecc));
    }
    const salida = [];
    for (let i = 0; i < lista[0].length; i++) {
      lista.forEach((b, j) => { if (i !== largoCorto - eccBloque || j >= cortos) salida.push(b[i]); });
    }
    return salida;
  }

  function posicionesAlineacion(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, tam = v * 4 + 17;
    const paso = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = tam - 7; r.length < n; p -= paso) r.splice(1, 0, p);
    return r;
  }

  class Matriz {
    constructor(v) {
      this.v = v;
      this.tam = v * 4 + 17;
      this.m = Array.from({ length: this.tam }, () => new Array(this.tam).fill(false));
      this.funcion = Array.from({ length: this.tam }, () => new Array(this.tam).fill(false));
    }
    pon(x, y, oscuro) { this.m[y][x] = oscuro; this.funcion[y][x] = true; }

    patrones() {
      const t = this.tam;
      for (let i = 0; i < t; i++) { this.pon(6, i, i % 2 === 0); this.pon(i, 6, i % 2 === 0); }
      for (const [cx, cy] of [[3, 3], [t - 4, 3], [3, t - 4]]) {
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
            if (x >= 0 && x < t && y >= 0 && y < t) this.pon(x, y, d !== 2 && d !== 4);
          }
        }
      }
      const al = posicionesAlineacion(this.v), n = al.length;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) this.pon(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
      this.formato(0, 0);
      if (this.v >= 7) {
        let r = this.v;
        for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
        const bits = this.v << 12 | r;
        for (let i = 0; i < 18; i++) {
          const b = bit(bits, i), a = t - 11 + i % 3, c = Math.floor(i / 3);
          this.pon(a, c, b);
          this.pon(c, a, b);
        }
      }
    }

    formato(nivelBits, mascara) {
      const datos = nivelBits << 3 | mascara;
      let r = datos;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = (datos << 10 | r) ^ 0x5412, t = this.tam;
      for (let i = 0; i <= 5; i++) this.pon(8, i, bit(bits, i));
      this.pon(8, 7, bit(bits, 6));
      this.pon(8, 8, bit(bits, 7));
      this.pon(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) this.pon(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) this.pon(t - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) this.pon(8, t - 15 + i, bit(bits, i));
      this.pon(8, t - 8, true);
    }

    codigos(datos) {
      const t = this.tam;
      let i = 0;
      for (let der = t - 1; der >= 1; der -= 2) {
        if (der === 6) der = 5;
        for (let vert = 0; vert < t; vert++) {
          for (let j = 0; j < 2; j++) {
            const x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? t - 1 - vert : vert;
            if (!this.funcion[y][x] && i < datos.length * 8) {
              this.m[y][x] = bit(datos[i >>> 3], 7 - (i & 7));
              i++;
            }
          }
        }
      }
    }

    mascara(k) {
      const t = this.tam;
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          let inv;
          switch (k) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = x * y % 2 + x * y % 3 === 0; break;
            case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
            default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
          }
          if (!this.funcion[y][x] && inv) this.m[y][x] = !this.m[y][x];
        }
      }
    }

    penalizacion() {
      const t = this.tam, m = this.m;
      let r = 0;
      const agrega = (largo, hist) => {
        if (hist[0] === 0) largo += t;
        hist.pop();
        hist.unshift(largo);
      };
      const patrones = hist => {
        const n = hist[1];
        const nucleo = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
        return (nucleo && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) + (nucleo && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
      };
      const cierra = (color, largo, hist) => {
        if (color) { agrega(largo, hist); largo = 0; }
        largo += t;
        agrega(largo, hist);
        return patrones(hist);
      };
      for (const filas of [true, false]) {
        for (let a = 0; a < t; a++) {
          let color = false, largo = 0;
          const hist = [0, 0, 0, 0, 0, 0, 0];
          for (let b = 0; b < t; b++) {
            const v = filas ? m[a][b] : m[b][a];
            if (v === color) {
              largo++;
              if (largo === 5) r += N1;
              else if (largo > 5) r++;
            } else {
              agrega(largo, hist);
              if (!color) r += patrones(hist) * N3;
              color = v;
              largo = 1;
            }
          }
          r += cierra(color, largo, hist) * N3;
        }
      }
      for (let y = 0; y < t - 1; y++) {
        for (let x = 0; x < t - 1; x++) {
          const c = m[y][x];
          if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += N2;
        }
      }
      let oscuros = 0;
      for (const fila of m) for (const v of fila) if (v) oscuros++;
      const total = t * t;
      r += (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * N4;
      return r;
    }
  }

  function crear(texto, { nivel = 'M', version = null, mascara = null } = {}) {
    const N = NIVELES[nivel];
    if (!N) throw new Error(`Nivel de corrección desconocido: ${nivel}`);
    const bytes = Array.from(new TextEncoder().encode(String(texto)));
    // Versión: la más chica en la que caben los datos
    let v = version, bitsUsados = 0;
    for (let k = version || 1; k <= (version || 40); k++) {
      bitsUsados = 4 + (k <= 9 ? 8 : 16) + bytes.length * 8;
      if (bitsUsados <= codigosDatos(k, N.i) * 8) { v = k; break; }
      v = null;
    }
    if (!v) throw new Error('El texto no cabe en un código QR');
    const capacidad = codigosDatos(v, N.i) * 8;
    const bits = [];
    const agrega = (valor, largo) => { for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
    agrega(4, 4);                                   // modo byte
    agrega(bytes.length, v <= 9 ? 8 : 16);
    for (const b of bytes) agrega(b, 8);
    agrega(0, Math.min(4, capacidad - bits.length));
    agrega(0, (8 - bits.length % 8) % 8);
    for (let relleno = 0xEC; bits.length < capacidad; relleno ^= 0xEC ^ 0x11) agrega(relleno, 8);
    const datos = [];
    for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));

    const base = new Matriz(v);
    base.patrones();
    base.codigos(conCorreccion(datos, v, N.i));
    const conMascara = k => {
      const q = new Matriz(v);
      q.m = base.m.map(f => f.slice());
      q.funcion = base.funcion;
      q.mascara(k);
      q.formato(N.bits, k);
      return q;
    };
    let mejor = null, elegida = mascara;
    if (mascara == null) {
      let menor = Infinity;
      for (let k = 0; k < 8; k++) {
        const q = conMascara(k), p = q.penalizacion();
        if (p < menor) { menor = p; mejor = q; elegida = k; }
      }
    } else {
      mejor = conMascara(mascara);
    }
    return { version: v, tamano: mejor.tam, nivel, mascara: elegida, modulos: mejor.m };
  }

  return { crear };
})();
