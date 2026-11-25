(function () {
  'use strict';
/* una figura cuya imagen no existe se retira (y Anexos si queda vacío) */
document.addEventListener("error",e=>{
  const im=e.target;if(!im||im.tagName!=="IMG")return;
  const f=im.closest("figure");if(!f)return;
  const a=f.closest("#anexos");f.remove();
  if(a&&!a.querySelector("figure"))a.remove();
},true);


  var root = document.documentElement;
  root.classList.add('js');

  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var slug = new URLSearchParams(location.search).get('p') || '';

  var tituloEl = document.getElementById('titulo-bloque');
  var articulo = document.getElementById('texto');
  var tiempo = document.getElementById('tiempo');
  var cue = document.getElementById('lx-cue');
  var barra = document.getElementById('lx-bar');
  var volver = document.getElementById('lx-volver');
  var aa = document.getElementById('lx-aa');
  var pop = document.getElementById('lx-pop');
  var popBody = document.getElementById('lx-pop-body');
  var popX = document.getElementById('lx-pop-x');
  var lb = document.getElementById('lx-lb');
  var lbImg = document.getElementById('lx-lb-img');
  var lbX = document.getElementById('lx-lb-x');

  var paragraphs = [];
  var figs = [];
  var active = null;
  var popFor = null;
  var lastFocus = null;
  var ticking = false;

  function fail(msg) {
    console.warn('[lectura] ' + msg);
    tituloEl.textContent = '';
    var h = document.createElement('h1');
    h.textContent = msg;
    tituloEl.appendChild(h);
    tiempo.textContent = '';
    cue.hidden = true;
  }

  // Envuelve cada palabra en un span sin alterar el texto. Los <sup> se respetan tal cual.
  function envolver(el, cls) {
    if (!el) return;
    var nodos = [];
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) nodos.push(w.currentNode);
    var i = 0;
    nodos.forEach(function (t) {
      if (!t.nodeValue || (t.parentElement && t.parentElement.closest('sup'))) return;
      var partes = t.nodeValue.split(/(\s+)/);
      var f = document.createDocumentFragment();
      partes.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { f.appendChild(document.createTextNode(part)); return; }
        var s = document.createElement('span');
        s.className = cls;
        s.style.setProperty('--i', i++);
        s.textContent = part;
        f.appendChild(s);
      });
      t.parentNode.replaceChild(f, t);
    });
    /* el número de nota entra en su turno, justo tras la palabra anterior */
    el.querySelectorAll('sup').forEach(function (sp) {
      var prev = sp.previousSibling;
      while (prev && !(prev.nodeType === 1 && prev.classList.contains(cls))) prev = prev.previousSibling;
      sp.classList.add(cls);
      sp.style.setProperty('--i', prev ? (Number(prev.style.getPropertyValue('--i')) || 0) + 1 : 0);
    });
  }

  function render(html, base) {
    var src = new DOMParser().parseFromString(html, 'text/html').body;
    var esperado = src.textContent.replace(/\s+/g, '');

    var h1 = src.querySelector('h1');
    var autor = src.querySelector('.autor');
    tituloEl.textContent = '';
    if (h1) tituloEl.appendChild(h1);
    if (autor) tituloEl.appendChild(autor);
    while (src.firstChild) articulo.appendChild(src.firstChild);

    // rutas de imágenes relativas a la carpeta del fragmento
    articulo.querySelectorAll('img').forEach(function (img) {
      var s = img.getAttribute('src');
      if (s) { try { img.setAttribute('src', new URL(s, base).href); } catch (e) { img.removeAttribute('src'); } }
      img.loading = 'lazy';
      img.decoding = 'async';
    });

    paragraphs = Array.prototype.slice.call(articulo.querySelectorAll('.cuerpo > p, .resumen'));
    paragraphs.forEach(function (p) { p.classList.add('lx-p'); envolver(p, 'lx-w'); });
    envolver(tituloEl.querySelector('h1'), 'lx-tw');

    var fuentes = articulo.querySelector('#fuentes');
    if (fuentes) {
      Array.prototype.forEach.call(fuentes.querySelectorAll('li'), function (li, k) {
        li.style.setProperty('--i', k);
      });
    }

    figs = Array.prototype.slice.call(articulo.querySelectorAll('figure'));
    figs.forEach(function (f) {
      var img = f.querySelector('img');
      if (!img) return;
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Ampliar: ' + (img.alt || 'ilustración'));
      f.addEventListener('click', function () { openLb(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(img); }
      });
    });

    // tiempo de lectura: solo el cuerpo
    var cuerpo = articulo.querySelector('.cuerpo');
    var palabras = ((cuerpo && cuerpo.textContent) || '').match(/\S+/g) || [];
    tiempo.textContent = '~' + Math.max(1, Math.round(palabras.length / 220)) + ' min de lectura';

    // revelado por IntersectionObserver (o inmediato con movimiento reducido)
    var observados = paragraphs.concat(figs);
    if (fuentes) observados.push(fuentes);
    if (RM) {
      observados.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
      observados.forEach(function (el) { io.observe(el); });
    }

    // autocomprobación: el texto debe ser idéntico al del fragmento (sin espacios)
    var real = (tituloEl.textContent + articulo.textContent).replace(/\s+/g, '');
    window.__textoIntacto = real === esperado;
    if (!window.__textoIntacto) console.warn('[lectura] el texto renderizado no coincide con el fragmento original');

    onScroll();
  }

  // Notas al pie: popover en lugar de salto de página
  function placePop() {
    if (!popFor) return;
    var r = popFor.getBoundingClientRect();
    var vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) { closePop(); return; }
    var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = window.innerWidth;
    var left = r.left + r.width / 2 - pw / 2;
    left = Math.max(12, Math.min(left, vw - pw - 12));
    var top = r.bottom + 10;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 10);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function closePop() {
    pop.hidden = true;
    popFor = null;
  }

  articulo.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('sup a[href^="#nota-"]');
    if (!a) return;
    e.preventDefault();
    if (popFor === a) { closePop(); return; }
    var li = document.getElementById(a.getAttribute('href').slice(1));
    if (!li) return;
    var copia = li.cloneNode(true);
    copia.querySelectorAll('.volver').forEach(function (n) { n.remove(); });
    popBody.textContent = copia.textContent.replace(/\s+/g, ' ').trim();
    popFor = a;
    pop.hidden = false;
    placePop();
  });

  document.addEventListener('click', function (e) {
    if (!popFor) return;
    if (pop.contains(e.target) || popFor.contains(e.target)) return;
    closePop();
  });
  popX.addEventListener('click', closePop);

  // Lightbox de ilustraciones
  function openLb(img) {
    lastFocus = document.activeElement;
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lbX.focus();
  }

  function closeLb() {
    lb.hidden = true;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  lbX.addEventListener('click', closeLb);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!lb.hidden) { closeLb(); return; }
      if (popFor) { var f = popFor; closePop(); f.focus(); }
    }
    if (e.key === 'Tab' && !lb.hidden) { e.preventDefault(); lbX.focus(); }
  });

  // Tamaño de texto
  aa.addEventListener('click', function () {
    var on = root.classList.toggle('lx-big');
    aa.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  // Barra de progreso, foco en el párrafo central, parallax de ilustraciones
  function frame() {
    ticking = false;
    var vh = window.innerHeight || 1;
    var max = document.documentElement.scrollHeight - vh;
    var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    barra.style.transform = 'scaleX(' + pct + ')';

    var best = null, bd = Infinity;
    paragraphs.forEach(function (p) {
      var r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var d = Math.abs((r.top + r.bottom) / 2 - vh / 2);
      if (d < bd) { bd = d; best = p; }
    });
    if (best !== active) {
      if (active) active.classList.remove('is-focus');
      if (best) best.classList.add('is-focus');
      active = best;
    }
    root.classList.toggle('lx-focus', !!best);

    if (!RM) {
      figs.forEach(function (f) {
        var img = f.querySelector('img');
        if (!img) return;
        var r = f.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var off = ((r.top + r.height / 2) - vh / 2) / vh;
        img.style.setProperty('--py', (-off * 40).toFixed(1) + 'px');
      });
    }

    if (popFor) placePop();
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // Textos subidos desde el admin (tabla textos). Mismas opciones que app.js.
  var SAN = { ALLOWED_TAGS: "header,section,h1,h2,h3,p,em,strong,i,b,sup,sub,a,ol,ul,li,figure,figcaption,img,blockquote,br".split(","), ALLOWED_ATTR: ["href", "id", "class", "src", "alt", "title"], ALLOW_DATA_ATTR: false };
  var sanHook = false;
  function sanitizeHtml(h) {
    if (!h || !window.DOMPurify) return null;
    if (!sanHook) {
      sanHook = true;
      DOMPurify.addHook('afterSanitizeAttributes', function (n) {
        if (n.hasAttribute('href') && !/^(https?:|#)/i.test(n.getAttribute('href'))) n.removeAttribute('href');
      });
    }
    return DOMPurify.sanitize(String(h), SAN) || null;
  }
  function sbCfg() {
    var c = window.SUPABASE || {};
    return { base: String(c.url || '').replace(/\/+$/, ''), key: String(c.anonKey || '') };
  }
  function fetchDbRow(s) {
    var c = sbCfg();
    if (!s || !c.base || !c.key) return Promise.resolve(null);
    return fetch(c.base + '/rest/v1/textos?select=*&slug=eq.' + encodeURIComponent(s) + '&limit=1', {
      headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('textos ' + r.status);
      return r.json();
    }).then(function (rows) { return Array.isArray(rows) && rows[0] ? rows[0] : null; });
  }
  function baseDe(u) {
    try { return new URL(u || '', location.href).href; } catch (e) { return location.href; }
  }

  // Carga
  function load() {
    if (!slug) { fail('Falta el texto a leer.'); return; }
    fetch('posts.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('posts.json ' + r.status); return r.json(); })
      .catch(function (err) { console.warn('[lectura] ' + err.message); return []; })
      .then(function (posts) {
        var entry = posts.find(function (p) { return p.slug === slug; });
        if (entry) {
          volver.href = 'post.html?p=' + encodeURIComponent(slug);
          var fragUrl = new URL(entry.html || ('posts/' + slug + '/contenido.html'), location.href);
          return fetch(fragUrl.href, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error('fragmento ' + r.status);
            return r.text();
          }).then(function (html) { render(html, fragUrl.href); });
        }
        return fetchDbRow(slug).then(function (row) {
          if (!row) throw new Error('slug no encontrado');
          var html = sanitizeHtml(row.html);
          if (html === null) throw new Error('texto sin HTML o sin DOMPurify');
          volver.href = 'post.html?p=' + encodeURIComponent(slug);
          if (row.titulo) document.title = row.titulo + ' · Arturo Torres';
          render(html, baseDe(row.base_url));
        });
      })
      .catch(function (err) {
        console.warn('[lectura] ' + err.message);
        fail('No encontramos este texto.');
      });
  }

  load();
})();
