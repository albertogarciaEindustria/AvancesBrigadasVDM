/* Descifrado de los datos del sitio.
 *
 * Cada archivo de datos/ es un "sobre": los datos van comprimidos (gzip) y
 * cifrados con AES-256-GCM usando una llave aleatoria; esa llave viene
 * envuelta una vez por cada contraseña que la puede abrir (PBKDF2-SHA256 +
 * AES-GCM, con una sola sal por sobre: abrirlo cuesta una derivación). Si
 * ninguna envoltura abre con la contraseña escrita, la contraseña es
 * incorrecta. Los datos del líder traen las llaves de las unidades, así que
 * esas se abren directo con la llave. Ver Programas/publica_avance.py (cifrar).
 */
const Cripto = (function () {
  'use strict';

  function bytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function disponible() {
    return !!(window.crypto && crypto.subtle && window.DecompressionStream);
  }

  async function abrir(sobre, llave) {
    const sutil = crypto.subtle;
    const k = await sutil.importKey('raw', llave, 'AES-GCM', false, ['decrypt']);
    const comprimido = await sutil.decrypt({ name: 'AES-GCM', iv: bytes(sobre.iv) }, k,
                                           bytes(sobre.datos));
    const flujo = new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flujo).text());
  }

  /** Devuelve los datos descifrados, o null si la contraseña no abre el sobre. */
  async function descifrar(sobre, contrasena) {
    if (!sobre.llaves.length) return null;
    const sutil = crypto.subtle;
    const base = await sutil.importKey('raw', new TextEncoder().encode(contrasena),
                                       'PBKDF2', false, ['deriveKey']);
    const kek = await sutil.deriveKey(
      { name: 'PBKDF2', salt: bytes(sobre.sal), iterations: sobre.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let llave = null;
    for (const envoltura of sobre.llaves) {
      try {
        llave = await sutil.decrypt({ name: 'AES-GCM', iv: bytes(envoltura.iv) }, kek,
                                    bytes(envoltura.llave));
        break;
      } catch (e) { /* esta envoltura es de otra contraseña */ }
    }
    return llave ? abrir(sobre, llave) : null;
  }

  /** Datos de un sobre con su llave en base64 (las que trae el líder). */
  function descifrarConLlave(sobre, llave) {
    return abrir(sobre, bytes(llave));
  }

  return { descifrar, descifrarConLlave, disponible };
})();
