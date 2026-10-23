/* Arranque: carga el índice publicado, muestra la pantalla de inicio y, al
 * entrar con una contraseña válida, abre la página de unidad o la del líder.
 * Los datos descifrados viven solo en memoria: "Salir" recarga la página. */
(function () {
  'use strict';
  // No se muestra dentro de un marco de otro sitio (clickjacking)
  if (window.top !== window.self) {
    try { void window.top.location.href; } catch (e) { document.documentElement.style.display = 'none'; return; }
  }
  let indice = null, llavesLider = {}, datosLider = null;
  const datosUnidad = {};   // id -> promesa de sus datos (página Jóvenes del Futuro)

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
      llavesLider = datos.llaves || {};
      delete datos.llaves;
      datosLider = datos;
      mostrarLider();
    } else {
      Unidad.render(datos, { salir });
    }
    return true;
  }

  function mostrarLider() {
    Lider.render(datosLider, { salir, abrirUnidad, cargarUnidad });
  }

  // Datos de una unidad con la llave del líder; se descifran una sola vez
  function cargarUnidad(id) {
    if (!llavesLider[id]) return Promise.reject(new Error('Los datos del líder no traen la llave de ' + id));
    if (!datosUnidad[id]) {
      datosUnidad[id] = sobre(id).then(s => Cripto.descifrarConLlave(s, llavesLider[id]));
      datosUnidad[id].catch(() => { delete datosUnidad[id]; });
    }
    return datosUnidad[id];
  }

  async function abrirUnidad(id) {
    if (!llavesLider[id]) throw new Error('Los datos del líder no traen la llave de ' + id);
    const datos = await Cripto.descifrarConLlave(await sobre(id), llavesLider[id]);
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
