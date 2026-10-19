/* Arranque: carga el índice publicado, muestra la pantalla de inicio y, al
 * entrar con una contraseña válida, abre la página de unidad o la del líder.
 * Los datos descifrados viven solo en memoria: "Salir" recarga la página. */
(function () {
  'use strict';
  let indice = null, passLider = null, datosLider = null;

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function sobre(id) {
    window.AVANCE_CIFRADO = window.AVANCE_CIFRADO || {};
    if (!window.AVANCE_CIFRADO[id]) {
      await cargarScript(`datos/${encodeURIComponent(id)}.js?v=${encodeURIComponent(indice.version)}`);
    }
    return window.AVANCE_CIFRADO[id];
  }

  async function entrar(id, pass) {
    const datos = await Cripto.descifrar(await sobre(id), pass);
    if (!datos) return false;
    Intro.detener();
    if (datos.tipo === 'lider') {
      passLider = pass;
      datosLider = datos;
      mostrarLider();
    } else {
      Unidad.render(datos, { salir });
    }
    return true;
  }

  function mostrarLider() {
    Lider.render(datosLider, { salir, abrirUnidad });
  }

  async function abrirUnidad(id) {
    const datos = await Cripto.descifrar(await sobre(id), passLider);
    if (!datos) throw new Error('La contraseña del líder no abre ' + id);
    Unidad.render(datos, { salir, volver: mostrarLider });
  }

  function salir() {
    location.reload();
  }

  (async function iniciar() {
    try {
      await cargarScript('datos/indice.js?t=' + Date.now());
      indice = window.AVANCE_INDICE && window.AVANCE_INDICE.datos;
    } catch (e) {
      indice = null;
    }
    Intro.iniciar(indice, entrar);
  })();
})();
