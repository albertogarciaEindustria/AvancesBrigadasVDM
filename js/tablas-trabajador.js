/* Web Worker de las tablas PNG de Preventa y Farmers: dibuja el modelo con
 * js/tablas-png.js en un OffscreenCanvas y devuelve los bytes del PNG. La página
 * (TablasPng.hacer) abre hasta 6, según núcleos y memoria. Los workers no ven las fuentes de la
 * página: aquí se carga Montserrat aparte; si no se puede, la respuesta lo dice
 * (fuente: false) y la página dibuja esa tabla ella misma. */
'use strict';
importScripts('tablas-png.js' + self.location.search);

const fuenteLista = (async () => {
  if (!self.fonts || typeof FontFace === 'undefined') return false;
  try {
    for (const [url, rango] of TablasPng.FUENTES) {
      const f = new FontFace('Montserrat', `url(${url})`, { weight: '100 900', unicodeRange: rango });
      self.fonts.add(f);
      await f.load();
    }
    return true;
  } catch (e) {
    return false;
  }
})();

self.onmessage = async e => {
  const { id, modelo } = e.data;
  try {
    const fuente = await fuenteLista;
    const datos = await TablasPng.png(modelo);
    self.postMessage({ id, datos, fuente }, [datos.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
