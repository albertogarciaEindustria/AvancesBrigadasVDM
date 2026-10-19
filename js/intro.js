/* Pantalla de inicio: matriz de símbolos que cambian (gris claro con tono de
 * aurora), título en arte ASCII y acceso con unidad + contraseña. */
const Intro = (function () {
  'use strict';

  const SIMBOLOS = ('\\|/()[]{}<>~-_+=?!;:1iIlLrtfjxXcCvVuUnmzZYJQ0OwpqdbkhaeoMW#*^').split('');
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Matriz ────────────────────────────────────────────────────────────
  let lienzo, ctx, dpr = 1, cols = 0, filas = 0, cw = 0, ch = 0, tam = 15;
  let celdas = null, raf = null, ultimo = 0, vivo = false;
  const estilos = new Map();

  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
    tam = w < 640 ? 12 : 15;
    cw = tam * 0.92;
    ch = tam * 1.34;
    cols = Math.ceil(w / cw) + 1;
    filas = Math.ceil(h / ch) + 1;
    celdas = new Uint8Array(cols * filas);
    for (let i = 0; i < celdas.length; i++) celdas[i] = (Math.random() * SIMBOLOS.length) | 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'top';
  }

  // Color de la celda: gris claro de base; donde pasa la "cortina" de aurora
  // sube el brillo y toma un tinte verde → turquesa → violeta, sin saturar.
  function estilo(hBalde, iBalde) {
    const k = hBalde * 16 + iBalde;
    let s = estilos.get(k);
    if (!s) {
      const inten = iBalde / 15;
      const hue = 135 + hBalde * 13;
      const sat = 6 + 46 * inten;
      const luz = 66 + 18 * inten;
      const alfa = 0.24 + 0.66 * inten;
      s = `hsla(${hue},${sat.toFixed(0)}%,${luz.toFixed(0)}%,${alfa.toFixed(2)})`;
      estilos.set(k, s);
    }
    return s;
  }

  const grupos = Array.from({ length: 12 * 16 }, () => []);

  function cuadro(t) {
    const tt = t / 1000;
    for (const g of grupos) g.length = 0;
    for (let y = 0; y < filas; y++) {
      const v = y / filas;
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        const onda = 0.5 + 0.5 * Math.sin(u * 6.2 + tt * 0.55 + Math.sin(v * 3.1 + tt * 0.35) * 1.6);
        const onda2 = 0.5 + 0.5 * Math.sin(u * 13.0 - tt * 0.32 + v * 2.4);
        const cortina = Math.pow(onda * 0.68 + onda2 * 0.32, 1.8);
        const banda = 1 - Math.min(1, Math.abs(v - (0.42 + 0.16 * Math.sin(u * 2.7 + tt * 0.18))) * 1.25);
        const inten = Math.max(0, Math.min(1, cortina * (0.35 + 0.65 * banda)));
        const hue = 0.5 + 0.5 * Math.sin(u * 2.4 + tt * 0.22 + v * 1.3);
        const hB = Math.min(11, (hue * 12) | 0);
        const iB = Math.min(15, (inten * 16) | 0);
        grupos[hB * 16 + iB].push(y * cols + x);
      }
    }
    ctx.clearRect(0, 0, lienzo.width / dpr, lienzo.height / dpr);
    ctx.font = `500 ${tam}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    for (let k = 0; k < grupos.length; k++) {
      const g = grupos[k];
      if (!g.length) continue;
      ctx.fillStyle = estilo((k / 16) | 0, k % 16);
      for (const i of g) {
        ctx.fillText(SIMBOLOS[celdas[i]], (i % cols) * cw, ((i / cols) | 0) * ch);
      }
    }
  }

  function mutar(prop) {
    const n = Math.max(1, (celdas.length * prop) | 0);
    for (let k = 0; k < n; k++) {
      celdas[(Math.random() * celdas.length) | 0] = (Math.random() * SIMBOLOS.length) | 0;
    }
  }

  function bucle(t) {
    if (!vivo) return;
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    const intervalo = reducido ? 1400 : 70;
    if (t - ultimo < intervalo) return;
    ultimo = t;
    mutar(reducido ? 0.01 : 0.018);
    cuadro(reducido ? 0 : t);
  }

  // ── Título en arte ASCII ──────────────────────────────────────────────
  const LETRAS = {
    A: [' ### ', '#   #', '#####', '#   #', '#   #'],
    V: ['#   #', '#   #', '#   #', ' # # ', '  #  '],
    N: ['#   #', '##  #', '# # #', '#  ##', '#   #'],
    C: [' ####', '#    ', '#    ', '#    ', ' ####'],
    E: ['#####', '#    ', '#### ', '#    ', '#####'],
    D: ['#### ', '#   #', '#   #', '#   #', '#### '],
    M: ['#   #', '## ##', '# # #', '#   #', '#   #'],
    ' ': ['   ', '   ', '   ', '   ', '   '],
  };

  function arteAscii(texto) {
    const renglones = ['', '', '', '', ''];
    for (const c of texto) {
      const g = LETRAS[c] || LETRAS[' '];
      for (let i = 0; i < 5; i++) renglones[i] += g[i] + ' ';
    }
    return renglones.map(r => r.replace(/\s+$/, '')).join('\n');
  }

  function pintarTitulo() {
    const pre = document.getElementById('introTitulo');
    pre.textContent = window.innerWidth < 700
      ? arteAscii('AVANCE') + '\n\n' + arteAscii('VDM')
      : arteAscii('AVANCE VDM');
  }

  function cajaAscii(texto) {
    const linea = '+' + '-'.repeat(texto.length + 8) + '+';
    return `<span aria-hidden="true">${linea}</span>\n` +
           `<span><span aria-hidden="true">|</span>    ${texto}    <span aria-hidden="true">|</span></span>\n` +
           `<span aria-hidden="true">${linea}</span>`;
  }

  function escribir(el, texto, ms) {
    if (reducido) { el.textContent = texto; return; }
    let i = 0;
    const paso = () => {
      el.textContent = texto.slice(0, ++i);
      if (i < texto.length) setTimeout(paso, ms);
    };
    paso();
  }

  // ── Acceso ────────────────────────────────────────────────────────────
  let alEntrar = null, elegido = null;

  function abrirAcceso() {
    const acceso = document.getElementById('acceso');
    acceso.hidden = false;
    document.getElementById('accesoEstado').textContent = '';
    const primero = acceso.querySelector('.acceso-opcion[aria-checked="true"]') ||
                    acceso.querySelector('.acceso-opcion');
    if (primero) primero.focus();
  }

  function cerrarAcceso() {
    document.getElementById('acceso').hidden = true;
    document.getElementById('accesoPass').value = '';
    document.getElementById('btnEntrar').focus();
  }

  function elegir(boton) {
    for (const b of document.querySelectorAll('.acceso-opcion')) {
      b.setAttribute('aria-checked', b === boton ? 'true' : 'false');
      b.tabIndex = b === boton ? 0 : -1;
    }
    elegido = boton.dataset.id;
    document.getElementById('accesoPass').focus();
  }

  function opciones(indice) {
    const cont = document.getElementById('accesoOpciones');
    const lista = [...(indice.unidades || []), indice.lider];
    cont.innerHTML = '';
    lista.forEach((u, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'acceso-opcion' + (u.id === indice.lider.id ? ' lider' : '');
      b.dataset.id = u.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = i === 0 ? 0 : -1;
      b.innerHTML = `<span class="marca" aria-hidden="true"></span>${Util.esc(u.nombre)}`;
      b.addEventListener('click', () => elegir(b));
      b.addEventListener('keydown', e => {
        const todos = [...cont.querySelectorAll('.acceso-opcion')];
        const k = todos.indexOf(b);
        if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); elegir(todos[(k + 1) % todos.length]); todos[(k + 1) % todos.length].focus(); }
        if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); const j = (k - 1 + todos.length) % todos.length; elegir(todos[j]); todos[j].focus(); }
      });
      cont.appendChild(b);
    });
  }

  async function enviar(e) {
    e.preventDefault();
    const estado = document.getElementById('accesoEstado');
    const pass = document.getElementById('accesoPass').value;
    if (!elegido) { estado.textContent = '✕ elige una unidad operativa'; estado.className = 'acceso-estado error'; return; }
    if (!pass) { estado.textContent = '✕ escribe la contraseña'; estado.className = 'acceso-estado error'; return; }
    const btn = document.getElementById('accesoEntrar');
    btn.disabled = true;
    estado.className = 'acceso-estado';
    estado.textContent = '> descifrando datos...';
    try {
      const ok = await alEntrar(elegido, pass);
      if (!ok) {
        estado.textContent = '✕ contraseña incorrecta';
        estado.className = 'acceso-estado error';
        document.getElementById('accesoPass').select();
      }
    } catch (err) {
      console.error(err);
      estado.textContent = '✕ no se pudieron cargar los datos; recarga la página';
      estado.className = 'acceso-estado error';
    } finally {
      btn.disabled = false;
    }
  }

  // ── API ───────────────────────────────────────────────────────────────
  function iniciar(indice, entrar) {
    alEntrar = entrar;
    lienzo = document.getElementById('matriz');
    ctx = lienzo.getContext('2d');
    medir();
    pintarTitulo();
    vivo = true;
    cuadro(performance.now());
    raf = requestAnimationFrame(bucle);
    let espera;
    window.addEventListener('resize', () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (vivo) { medir(); cuadro(performance.now()); } pintarTitulo(); }, 150);
    });

    const btn = document.getElementById('btnEntrar');
    btn.innerHTML = cajaAscii('VER  AVANCE  >');
    const kicker = document.getElementById('introKicker');
    const pie = document.getElementById('introPie');
    if (!indice) {
      kicker.textContent = 'SIN DATOS PUBLICADOS';
      escribir(document.getElementById('introSub'), 'Publica con /publicaavance desde el bot.', 28);
      return;
    }
    kicker.textContent = `CORTE · ${indice.corte.toUpperCase()}`;
    escribir(document.getElementById('introSub'),
             'Avance de brigadistas EPICA · Valle de México', 32);
    pie.textContent = `publicado ${indice.generado}`;
    if (!Cripto.disponible()) {
      pie.textContent = 'Este navegador no puede descifrar los datos; abre la página en Chrome, Edge, Firefox o Safari actualizados.';
      return;
    }
    opciones(indice);
    btn.disabled = false;
    btn.addEventListener('click', abrirAcceso);
    document.getElementById('formAcceso').addEventListener('submit', enviar);
    document.getElementById('accesoCancelar').addEventListener('click', cerrarAcceso);
    document.getElementById('acceso').addEventListener('click', e => {
      if (e.target.id === 'acceso') cerrarAcceso();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('acceso').hidden) cerrarAcceso();
    });
  }

  function detener() {
    vivo = false;
    if (raf) cancelAnimationFrame(raf);
    document.getElementById('acceso').hidden = true;
    document.getElementById('accesoPass').value = '';
    document.getElementById('intro').hidden = true;
  }

  return { iniciar, detener };
})();
