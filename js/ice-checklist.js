/* Checklist ICE 2026 por cliente (las reglas viven en Programas/checklist_ice.py
 * y llegan resueltas por formato en el payload "checklist").
 *
 * Lo usan las fichas de ice.html (js/ice.js: barras de submétricas y hoja que
 * sube desde abajo) y la hoja descargable «Mis clientes ICE» (js/ice-extra.js
 * copia programaChecklist con toString y la corre dentro del archivo). Por eso
 * está en ES5 y no usa nada de afuera.
 *
 * Formato de una evaluación = '<tamaño>_<tipo>': tamaño c/m/g; tipo rsr/puesto
 * (On Premise) o ne/e (Home Market: sin reja / con reja).
 * Barra: % del reporte, puntos que sumó de su total (80% 36/45) y los que
 * perdió (−9). Calculadoras SOCI/SOVI: N = el menor número de frentes de
 * Coca-Cola con round1(N / (N + competencia) × 100) ≥ meta. */
function programaChecklist() {
  'use strict';
  var CK = null;
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Un decimal, mitades hacia arriba sobre la forma decimal del número (como toLocaleString)
  function r1(v) { var r = Math.round(Number(v + 'e1')) / 10; return isNaN(r) ? Math.round(v * 10) / 10 : r; }
  function r2(v) { var r = Math.round(Number(v + 'e2')) / 100; return isNaN(r) ? Math.round(v * 100) / 100 : r; }
  // Puntos para leer: 36 · 10.2 · 1.33 (sin ceros de más)
  function pts(v) { return v == null ? '—' : String(r2(v)); }
  function fecha(iso) { var t = String(iso || ''); return t.length >= 10 ? +t.slice(8, 10) + ' ' + MESES[+t.slice(5, 7) - 1] : ''; }

  function preparar(datos) { CK = datos && datos.canales ? datos : null; }
  function hay() { return !!CK; }
  function canalDe(ci) { return CK ? (CK.orden || ['Traditional', 'OnPremise'])[ci] : null; }
  function partes(fmt) { var p = String(fmt || '').split('_'); return { tam: p[0] || '', tipo: p[1] || '' }; }
  function rubrosDe(ci, fmt) {
    var c = CK && CK.canales[canalDe(ci)];
    return c && c.formatos ? c.formatos[fmt] || null : null;
  }
  function conPuntos(fecha) { return !!(CK && fecha && fecha >= CK.vigente_desde); }

  // Rubro de la submétrica i (orden de D.metricas) en el formato, o null si no cuenta ahí
  function rubro(ci, fmt, i) {
    var c = CK && CK.canales[canalDe(ci)], lista = rubrosDe(ci, fmt);
    if (!c || !lista) return null;
    var id = c.rubros[i];
    for (var k = 0; k < lista.length; k++) if (lista[k].id === id) return lista[k];
    return null;
  }
  // ¿La submétrica i no cuenta en ese formato? (con reja: SOVI y Métrica local)
  function noAplica(ci, fmt, i) {
    var c = CK && CK.canales[canalDe(ci)];
    return !!(c && rubrosDe(ci, fmt) && c.rubros[i] && !rubro(ci, fmt, i));
  }
  // Puntos de una barra: {total, ganados, perdidos} o null (sin checklist, sin formato o evaluación con otras reglas)
  function info(ci, fmt, i, pct, fecha) {
    if (pct == null || !conPuntos(fecha)) return null;
    var r = rubro(ci, fmt, i);
    if (!r) return null;
    // Un decimal en las barras (36.4/40 · −3.6); los pasos del checklist llevan hasta dos (1.33)
    var ganados = r1(Math.max(0, Math.min(100, pct)) * r.pts / 100);
    return { total: r.pts, ganados: ganados, perdidos: r1(r.pts - ganados), extra: !!r.extra };
  }
  function nombreFormato(ci, fmt) {
    var c = CK && CK.canales[canalDe(ci)], f = partes(fmt);
    if (!c) return '';
    return [CK.tamanos[f.tam], c.tipos[f.tipo]].filter(Boolean).join(' · ');
  }

  // ── Calculadora SOCI/SOVI ──
  function frase(K, C, meta, aprueba) {
    if (!(K >= 0) || !(C >= 0) || K + C === 0) return '<span class="ck-gris">Escribe cuántos frentes hay de Coca-Cola y de la competencia.</span>';
    var pct = r1(K / (K + C) * 100);
    if (meta == null) return 'Lleva <b>' + pct + '%</b>. <span class="ck-gris">Falta poner la meta de la zona.</span>';
    var chico = '<small>Lleva ' + pct + '% · meta ' + meta + '%</small>';
    if (pct >= meta) return '<span class="ck-ok">✔ <b>' + esc(aprueba) + '</b></span>' + chico;
    var n = Math.max(K, Math.floor(meta * C / (100 - meta)) - 2);
    while (r1(n / (n + C) * 100) < meta) n++;
    return 'Necesitas <b>' + n + '</b> frentes de Coca-Cola para aprobar. Tienes ' + K + ': <b class="ck-rojo">te faltan ' + (n - K) + '</b>.' + chico;
  }
  function calcular(caja) {
    var ins = caja.querySelectorAll('input');
    var leer = function (x) { return x.value === '' ? NaN : Math.floor(Number(x.value)); };
    var meta = caja.getAttribute('data-meta');
    caja.querySelector('.ck-frase').innerHTML = frase(leer(ins[0]), leer(ins[1]), meta === '' ? null : Number(meta), caja.getAttribute('data-aprueba'));
  }
  function enlazar(raiz) {
    if (!raiz || raiz.getAttribute('data-ck-calc')) return;
    raiz.setAttribute('data-ck-calc', '1');
    raiz.addEventListener('input', function (ev) {
      var caja = ev.target;
      while (caja && caja !== raiz && !/(^|\s)ck-calc(\s|$)/.test(caja.className || '')) caja = caja.parentNode;
      if (caja && caja !== raiz) calcular(caja);
    });
  }

  // ── Checklist de una submétrica ──
  // o = {ci, fmt, fmtMaster, i, pct, fecha, metrica (nombre)}
  function html(o) {
    var canal = canalDe(o.ci), c = CK && CK.canales[canal];
    if (!c) return '<p class="ck-aviso">El checklist llega con la siguiente publicación del sitio.</p>';
    var fmt = o.fmt && c.formatos[o.fmt] ? o.fmt : null;
    if (!fmt) return '<p class="ck-aviso">No se sabe el tipo de cliente de esta evaluación: no se puede armar su checklist.</p>';
    var r = rubro(o.ci, fmt, o.i);
    var f = partes(fmt), fm = partes(o.fmtMaster);
    var cab = '<div class="ck-cab"><p class="ck-kicker">Checklist ICE 2026 · ' + esc(c.nombre) + '</p>'
      + '<h4>' + esc(r ? r.nombre : o.metrica || '') + '</h4>'
      + '<p class="ck-fmt">Cliente <b>' + esc(nombreFormato(o.ci, fmt)) + '</b>'
      + (fm.tipo && fm.tipo !== f.tipo ? ' <span>· se calificó así; en la Master Data es ' + esc(c.tipos[fm.tipo]) + '</span>' : '')
      + (!fm.tam ? ' <span>· tamaño del reporte ICE</span>' : '') + '</p>'
      + (c.ayuda && c.ayuda[f.tipo] ? '<p class="ck-ayuda">' + esc(c.ayuda[f.tipo]) + '</p>' : '');
    if (!r) {
      return '<div class="ck">' + cab + '</div><p class="ck-aviso">' + esc(o.metrica || 'Esta submétrica') + ' no cuenta para un cliente '
        + esc(c.tipos[f.tipo] ? c.tipos[f.tipo].toLowerCase() : '') + ': no tiene puntos que ganar aquí.</p></div>';
    }
    var inf = info(o.ci, fmt, o.i, o.pct, o.fecha);
    var cuando = o.fecha ? 'En su evaluación del ' + esc(fecha(o.fecha)) : 'En su evaluación';
    if (inf) {
      cab += '<p class="ck-res">' + cuando + ': <b>' + Math.round(o.pct) + '%</b> · sumó <b>' + pts(inf.ganados) + '/' + pts(inf.total) + '</b>'
        + (inf.perdidos > 0.05 ? ' · perdió <b class="ck-rojo">' + pts(inf.perdidos) + ' pts</b>' : ' · <b>no perdió puntos</b>') + '.</p>';
    } else if (o.pct != null) {
      var m = CK.vigente_desde ? +CK.vigente_desde.slice(5, 7) : 0;
      cab += '<p class="ck-res">' + cuando + ': <b>' + Math.round(o.pct) + '%</b>.</p>'
        + '<p class="ck-aviso">Esa evaluación es de antes de ' + esc(m ? MESES_L[m - 1] + ' de ' + CK.vigente_desde.slice(0, 4) : 'las reglas de hoy')
        + ' y se calificó con otras reglas: no se calculan sus puntos. Abajo está el checklist de hoy.</p>';
    }
    cab += '</div>';

    var cuerpo = r.nota ? '<p class="ck-nota">' + esc(r.nota) + '</p>' : '';
    var nCore = 0, nEstr = 0;
    r.items.forEach(function (it) { if (it.tipo === 'core') nCore++; else if (it.tipo === 'estr') nEstr++; });
    var grupo = null, cierre = '';
    var finGrupo = function () {
      var s = cierre; cierre = ''; return s;
    };
    r.items.forEach(function (it) {
      if (it.g !== grupo) {
        cuerpo += finGrupo();
        grupo = it.g;
        if (grupo) cuerpo += '<p class="ck-grupo">' + esc(grupo) + '</p>' + (it.gnota ? '<p class="ck-gnota">' + esc(it.gnota) + '</p>' : '');
        if (r.puntaje === 'portafolio' && it.tipo === 'core' && r.reglas) {
          cierre = '<p class="ck-combo">Con los ' + nCore + ' básicos juntos: <b>+' + pts(r.reglas.comb_core) + ' pts</b></p>';
        } else if (r.puntaje === 'portafolio' && it.tipo === 'estr' && r.reglas) {
          cierre = '<p class="ck-combo">Con todo (básicos y estratégicos): <b>+' + pts(r.reglas.comb) + ' pts</b> más</p>';
        }
      }
      var p = it.pts;
      if (r.puntaje === 'portafolio' && r.reglas) p = it.tipo === 'core' ? r.reglas.core / nCore : it.tipo === 'estr' ? r.reglas.estr / nEstr : p;
      var meta = it.tool === 'share' ? c.metas[it.meta] : undefined;
      cuerpo += '<div class="ck-item"><div class="ck-fila"><span class="ck-t">' + esc(it.t) + '</span>'
        + (p != null ? '<b class="ck-pts">' + pts(p) + ' pts</b>' : '') + '</div>'
        + (it.d ? '<p class="ck-d">' + esc(it.d) + '</p>' : '')
        + (it.llena ? '<div class="ck-llena"><span>Se llena así</span>' + esc(it.llena) + '</div>' : '')
        + (it.formula ? '<p class="ck-formula">' + esc(it.formula) + ' · Meta: ' + (meta != null ? '<b>' + meta + '%</b>' : 'pendiente') + '</p>' : '')
        + (it.ojo ? '<p class="ck-ojo">' + esc(it.ojo) + '</p>' : '')
        + (it.tool === 'share'
          ? '<div class="ck-calc" data-meta="' + (meta != null ? meta : '') + '" data-aprueba="' + (canal === 'OnPremise' ? 'Aprueba el SOCI.' : 'Aprueba.') + '">'
            + '<label>Coca-Cola<input type="number" inputmode="numeric" min="0" step="1" placeholder="frentes"></label>'
            + '<label>Competencia<input type="number" inputmode="numeric" min="0" step="1" placeholder="frentes"></label>'
            + '<p class="ck-frase" aria-live="polite">' + frase(NaN, NaN, meta, '') + '</p></div>'
          : '')
        + '</div>';
    });
    cuerpo += finGrupo();
    if (r.puntaje === 'todo-o-nada') {
      cuerpo += '<p class="ck-combo">Con los ' + r.items.length + ' renglones: <b>' + pts(r.pts) + ' pts</b>. Si falta uno se cae casi todo.</p>';
    }
    var pie = '<p class="ck-pie">' + (r.extra ? 'Puntos extra: ' : 'Total del rubro: ') + pts(r.pts) + ' pts'
      + (CK.metas_al && r.items.some(function (it) { return it.tool === 'share'; }) ? ' · metas al ' + esc(fecha(CK.metas_al)) : '') + '. ' + esc(c.fuente || '') + '</p>';
    return '<div class="ck">' + cab + cuerpo + pie + '</div>';
  }

  var CSS = [
    '.ck{font-size:13px;line-height:1.45;color:#000;text-align:left}',
    '.ck-cab{padding:0 0 10px;border-bottom:2px solid #000}',
    '.ck-kicker{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#F40000}',
    '.ck-cab h4{margin:4px 0 0;font-size:19px;font-weight:800;line-height:1.15;text-transform:uppercase}',
    '.ck-fmt{margin:6px 0 0;font-size:12.5px}',
    '.ck-fmt span{color:#6E6E6E}',
    '.ck-ayuda{margin:2px 0 0;font-size:12px;color:#4D4D4D}',
    '.ck-res{margin:8px 0 0;padding:7px 10px;background:#F4F4F4;font-size:13px}',
    '.ck-rojo{color:#C40000}',
    '.ck-ok{color:#1E7B34}',
    '.ck-gris{color:#6E6E6E}',
    '.ck-aviso{margin:8px 0 0;padding:8px 10px;background:#FFF4E5;border-left:4px solid #EF6C00;font-size:12.5px}',
    '.ck-nota{margin:10px 0 0;padding:7px 10px;background:#FFE5E5;border-left:4px solid #F40000;font-size:12.5px;font-weight:700}',
    '.ck-grupo{margin:14px 0 0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#4D4D4D}',
    '.ck-gnota{margin:2px 0 0;font-size:12px;color:#C40000;font-weight:600}',
    '.ck-item{padding:8px 0;border-bottom:1px solid #E6E6E6}',
    '.ck-fila{display:flex;align-items:baseline;justify-content:space-between;gap:10px}',
    '.ck-t{font-weight:800}',
    '.ck-pts{flex:none;min-width:4.2em;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.ck-d{margin:2px 0 0;color:#333}',
    '.ck-ojo{margin:3px 0 0;color:#C40000;font-size:12px}',
    '.ck-formula{margin:3px 0 0;font-size:12px;color:#4D4D4D}',
    '.ck-llena{margin:6px 0 0;padding:7px 9px;border:2px dashed #F40000;font-size:12.5px;font-weight:700}',
    '.ck-llena span{display:block;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#F40000}',
    '.ck-combo{margin:6px 0 0;padding:6px 10px;background:#F4F4F4;font-size:12.5px}',
    '.ck-calc{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:8px 0 2px;padding:8px 10px;background:#F4F4F4}',
    '.ck-calc label{display:flex;flex-direction:column;gap:3px;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4D4D4D}',
    '.ck-calc input{width:100%;min-height:40px;padding:6px 8px;font:inherit;font-size:16px;font-weight:700;letter-spacing:0;color:#000;border:2px solid #000;border-radius:0;background:#fff;box-sizing:border-box}',
    '.ck-calc input:focus{outline:none;border-color:#F40000}',
    '.ck-frase{grid-column:1/-1;margin:0;font-size:13px}',
    '.ck-frase small{display:block;margin-top:2px;font-size:11.5px;color:#6E6E6E}',
    '.ck-pie{margin:12px 0 0;font-size:11px;color:#6E6E6E}'
  ].join('\n');

  return { preparar: preparar, hay: hay, info: info, noAplica: noAplica, html: html, enlazar: enlazar,
           formato: nombreFormato, pts: pts, css: CSS, conPuntos: conPuntos, frase: frase };
}
var IceChecklist = programaChecklist();
