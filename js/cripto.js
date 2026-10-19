/* Descifrado de los datos del sitio.
 *
 * Cada archivo de datos/ es un "sobre": los datos van comprimidos (gzip) y
 * cifrados con AES-256-GCM usando una llave aleatoria; esa llave viene
 * envuelta una vez por cada contraseña que la puede abrir (PBKDF2-SHA256 +
 * AES-GCM). Si ninguna envoltura abre con la contraseña escrita, la
 * contraseña es incorrecta. Ver Programas/publica_avance.py (cifrar).
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

  /** Devuelve los datos descifrados, o null si la contraseña no abre el sobre. */
  async function descifrar(sobre, contrasena) {
    const sutil = crypto.subtle;
    const base = await sutil.importKey('raw', new TextEncoder().encode(contrasena),
                                       'PBKDF2', false, ['deriveKey']);
    let llave = null;
    for (const envoltura of sobre.llaves) {
      const kek = await sutil.deriveKey(
        { name: 'PBKDF2', salt: bytes(envoltura.sal), iterations: sobre.iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      try {
        llave = await sutil.decrypt({ name: 'AES-GCM', iv: bytes(envoltura.iv) }, kek,
                                    bytes(envoltura.llave));
        break;
      } catch (e) { /* esta envoltura es de otra contraseña */ }
    }
    if (!llave) return null;

    const k = await sutil.importKey('raw', llave, 'AES-GCM', false, ['decrypt']);
    const comprimido = await sutil.decrypt({ name: 'AES-GCM', iv: bytes(sobre.iv) }, k,
                                           bytes(sobre.datos));
    const flujo = new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flujo).text());
  }

  return { descifrar, disponible };
})();
