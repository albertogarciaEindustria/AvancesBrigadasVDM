/* Inicio del sitio (estilo del manual de marca): dos reportes, ICE (página
 * aparte, ice.html) y Brigadista, que abre el acceso de siempre con unidad
 * operativa + contraseña. */
const Intro = (function () {
  'use strict';

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
    if (!elegido) { estado.textContent = 'Elige una unidad operativa.'; estado.className = 'acceso-estado error'; return; }
    if (!pass) { estado.textContent = 'Escribe la contraseña.'; estado.className = 'acceso-estado error'; return; }
    const btn = document.getElementById('accesoEntrar');
    btn.disabled = true;
    estado.className = 'acceso-estado';
    estado.textContent = 'Descifrando datos...';
    try {
      const ok = await alEntrar(elegido, pass);
      if (!ok) {
        estado.textContent = 'Contraseña incorrecta.';
        estado.className = 'acceso-estado error';
        document.getElementById('accesoPass').select();
      }
    } catch (err) {
      console.error(err);
      estado.textContent = 'No se pudieron cargar los datos; recarga la página.';
      estado.className = 'acceso-estado error';
    } finally {
      btn.disabled = false;
    }
  }

  // ── API ───────────────────────────────────────────────────────────────
  function iniciar(indice, entrar) {
    alEntrar = entrar;
    const btn = document.getElementById('btnEntrar');
    const pie = document.getElementById('introPie');
    if (!indice) {
      pie.textContent = 'Aún no hay datos de brigadistas publicados.';
      return;
    }
    pie.innerHTML = `Brigadistas: corte al <b>${Util.esc(indice.corte)}</b> · actualizado el ${Util.esc(indice.actualizado || indice.generado)}`;
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
    document.getElementById('acceso').hidden = true;
    document.getElementById('accesoPass').value = '';
    document.getElementById('intro').hidden = true;
  }

  return { iniciar, detener };
})();
