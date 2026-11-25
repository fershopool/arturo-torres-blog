/* Panel de administración de textos (admin.html). Vanilla JS, sin SDK: Auth y REST de Supabase con fetch.
   Seguridad: la clave anon es pública; el acceso real lo dan la sesión de un admin, RLS y es_admin().
   Todo HTML que llega de la IA pasa por DOMPurify antes de pintarse o guardarse.
   Todo dato de usuario se pinta con textContent. Nunca innerHTML con datos. */
(function(){
"use strict";

const cfg=window.SUPABASE||{};
const BASE=String(cfg.url||"").replace(/\/+$/,"");
const KEY=String(cfg.anonKey||"");
const CONFIGURADO=!!(BASE&&KEY);
const K_SESION="admin:sesion";
const MAX_ARCHIVO=52428800;
const TIPOS_IMG=["image/png","image/jpeg","image/webp","image/gif"];
const PDFJS_WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const PURIFY_CFG={
  ALLOWED_TAGS:["header","section","h1","h2","h3","p","em","strong","i","b","sup","sub","a","ol","ul","li","figure","figcaption","img","blockquote","br"],
  ALLOWED_ATTR:["href","id","class","src","alt","title"],
  ALLOW_DATA_ATTR:false
};

/* Prompt para la IA. Fuente única: formato-ia.md se genera con este mismo texto. No uses comillas invertidas aquí. */
const PROMPT_IA = `Vas a convertir un texto académico en un fragmento HTML para publicarlo en la página de un autor. Te adjunto el PDF original del texto.

CÓMO LEER EL PDF
- Lee TODAS las páginas, de la primera a la última, en orden de lectura (si hay columnas, columna por columna).
- No copies encabezados, pies de página ni números de página repetidos.
- Une las palabras cortadas con guion al final de línea y los párrafos partidos entre líneas o páginas.
- Distingue las notas al pie del cuerpo y colócalas en la lista de notas.
- Si el texto es largo, no lo resumas ni omitas nada: si no cabe en una respuesta, detente al final de un párrafo y, cuando escriba "sigue", continúa exactamente donde quedaste, sin repetir.
- Si el PDF es un escaneo y no puedes leer una parte con seguridad, no la inventes: dímelo en vez de dar el HTML.

RESPUESTA
- Devuelve ÚNICAMENTE el fragmento HTML dentro de un solo bloque de código, para poder copiarlo. Nada antes ni después: sin explicaciones ni saludos.
- No incluyas <html>, <head>, <body>, <style>, <script>, atributos style, JavaScript, ni clases distintas de las indicadas.
- Usa caracteres UTF-8 reales: acentos (á, é, ñ), signos (¿, ¡) y comillas tal como aparecen en el original.

ESTRUCTURA EXACTA
Usa esta estructura y este orden. Omite las secciones que el original no tenga. El ejemplo muestra la forma; sustituye los textos.

<header>
<h1>Título del texto</h1>
<p class="autor">Nombre del autor</p>
<p class="resumen">Resumen o introducción del texto.</p>
</header>

<section class="cuerpo">
<p>Párrafo del cuerpo.<sup><a href="#nota-1" id="ref-1">1</a></sup></p>
<h2>Subtítulo, solo si el original lo tiene</h2>
<p>Otro párrafo.</p>
</section>

<ol class="notas">
<li id="nota-1">Texto exacto de la nota. <a href="#ref-1">↩</a></li>
</ol>

<section id="fuentes">
<h2>Fuentes</h2>
<ul>
<li>Referencia bibliográfica tal como aparece en el original.</li>
</ul>
</section>

<section id="anexos">
<h2>Anexos</h2>
<figure>
<img src="ilustracion-1.png" alt="Descripción breve de la imagen">
<figcaption>Pie de figura exacto del original</figcaption>
</figure>
</section>

<!-- imagenes: ilustracion-1.png -->

REGLAS DE CONTENIDO
1. Texto intacto: conserva cada palabra del autor tal cual. No cambies, corrijas, resumas, amplíes, traduzcas ni reordenes nada, ni siquiera erratas evidentes. Respeta mayúsculas, acentos, comillas y puntuación.
2. Párrafos: une las líneas que el original parte a mitad de frase en un solo párrafo. Cada párrafo va en su propio <p>. No dejes <p> vacíos.
3. Encabezado: el <h1> es el título exacto. En <p class="autor"> va el nombre del autor tal como aparece. En <p class="resumen"> copia el resumen o abstract del original si lo tiene. Si no lo tiene, usa el primer párrafo completo del texto y no lo repitas en el cuerpo.
4. Encabezados internos: usa <h2> (o <h3> para subapartados) solo para títulos que existan en el original. No inventes títulos.
5. Notas al pie: numera las notas de forma consecutiva desde 1; si el original ya trae números, conserva esos. En el cuerpo, cada llamada va como <sup><a href="#nota-N" id="ref-N">N</a></sup>. En <ol class="notas"> cada nota va como <li id="nota-N"> con el texto exacto y, al final, <a href="#ref-N">↩</a>. Cada llamada debe tener su nota y cada nota su llamada. Las notas repetidas (ibid., op. cit.) se mantienen como notas propias, con su texto exacto.
6. Fuentes: en la <ul> pon una <li> por cada referencia de la bibliografía, con el texto tal como aparece en el original.
7. Anexos: una <figure> por cada imagen. En src escribe SOLO el nombre del archivo (por ejemplo ilustracion-2.png), sin carpetas ni URL. Si el autor indica nombres de archivo, úsalos; si no, usa ilustracion-1.png, ilustracion-2.png, etc., en orden de aparición. En alt describe brevemente la imagen. El <figcaption> es el pie exacto que el original da a la figura; si el original no tiene pie, omite el <figcaption>.
8. Escapa como entidades los caracteres < > & que aparezcan como texto (&lt; &gt; &amp;).
9. Omite cualquier sección que el original no tenga. Por ejemplo, si no hay notas, no incluyas <ol class="notas">.
10. Como última línea, escribe el comentario <!-- imagenes: nombre1.png, nombre2.png --> con los nombres de todas las imágenes de la sección de anexos. Si no hay imágenes, escribe <!-- imagenes: ninguna -->.`;

const $=id=>document.getElementById(id);
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;};

/* localStorage/sessionStorage protegidos: en navegación privada o con datos bloqueados pueden lanzar */
const store={
  get(){try{const v=JSON.parse(sessionStorage.getItem(K_SESION)||"null");return v&&typeof v==="object"?v:null;}catch(e){return null;}},
  set(v){try{sessionStorage.setItem(K_SESION,JSON.stringify(v));}catch(e){}},
  del(){try{sessionStorage.removeItem(K_SESION);}catch(e){}}
};

/* ---- Elementos ---- */
const estadoGlobal=$("estado-global"), vistaLogin=$("vista-login"), vistaPanel=$("vista-panel");
const formLogin=$("form-login"), inEmail=$("login-email"), inPass=$("login-pass"), loginMsg=$("login-msg"), btnLogin=$("btn-login");
const btnSalir=$("btn-salir"), toast=$("toast");
const formTexto=$("form-texto"), fTitulo=$("f-titulo"), fAutor=$("f-autor"), fFecha=$("f-fecha"), fResumen=$("f-resumen"), fResumenCont=$("f-resumen-cont");
const fSlug=$("f-slug"), fSlugEstado=$("f-slug-estado"), fPdf=$("f-pdf"), fPdfInfo=$("f-pdf-info"), fImgs=$("f-imgs"), fImgsInfo=$("f-imgs-info");
const fHtml=$("f-html"), btnValidar=$("btn-validar"), btnCopiar=$("btn-copiar"), promptTexto=$("prompt-texto");
const avisos=$("avisos"), avisosTitulo=$("avisos-titulo"), listaAvisos=$("lista-avisos"), vistaPrevia=$("vista-previa");
const btnPublicar=$("btn-publicar"), progreso=$("progreso"), pubMsg=$("pub-msg"), pubOk=$("pub-ok");
const listaMsg=$("lista-msg"), listaTextos=$("lista-textos");

/* ---- Estado ---- */
let sesion=null, refrescando=null, timerRefresco=0, publicando=false, pubEstado=null;
let postsSlugs=null, urlsVista=new Map(), imgsSel=[], pdfSel=null, toastTmo=0, debTimer=0, slugManual=false;
let filas=new Map();

/* ---- Utilidades de mensajes ---- */
function aviso(nodo,texto,tipo){nodo.textContent=texto||"";nodo.hidden=!texto;nodo.dataset.tipo=tipo||"";}
function mostrarToast(texto){
  toast.textContent=texto;toast.hidden=false;
  clearTimeout(toastTmo);toastTmo=setTimeout(()=>{toast.hidden=true;},3800);
}

/* ---- Red ---- */
/* Errores: {tipo:"red"} sin respuesta; {tipo:"http",status,detalle} respuesta de error; {tipo:"sesion"} sin sesión válida */
async function peticion(ruta,opts){
  opts=opts||{};
  const auth=opts.auth||"anon";
  const headers=Object.assign({apikey:KEY},opts.cabeceras||{});
  if(auth==="user"){await asegurarSesion();headers.Authorization="Bearer "+sesion.access_token;}
  else headers.Authorization="Bearer "+KEY;
  const ctl=new AbortController(), tmo=setTimeout(()=>ctl.abort(),opts.cuerpo instanceof Blob?600000:30000);
  let r;
  try{
    r=await fetch(BASE+ruta,{method:opts.metodo||"GET",headers,body:opts.cuerpo,signal:ctl.signal});
  }catch(e){throw {tipo:"red"};}
  finally{clearTimeout(tmo);}
  if(!r.ok){
    let detalle="";
    try{const j=await r.json();detalle=String(j.msg||j.message||j.error_description||j.error||"");}catch(e){}
    throw {tipo:"http",status:r.status,detalle};
  }
  if(r.status===204)return null;
  return r.json().catch(()=>null);
}

function textoErr(e,accion){
  if(e&&e.tipo==="sesion")return "Tu sesión caducó. Vuelve a entrar.";
  if(e&&e.tipo==="red")return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  if(e&&e.tipo==="http"){
    if(e.status===401||e.status===403)return `No tienes permiso para ${accion}. Vuelve a entrar.`;
    if(/duplicate key|already exists/i.test(e.detalle||""))return "Ya existe un texto con ese slug.";
    return `No se pudo ${accion} (error ${e.status}${e.detalle?": "+e.detalle:""}).`;
  }
  return (e&&e.message)?`No se pudo ${accion}: ${e.message}`:`No se pudo ${accion}. Inténtalo de nuevo.`;
}
function errLogin(e){
  if(e&&e.tipo==="red")return "Sin conexión con el servidor. Revisa tu internet.";
  if(e&&e.tipo==="http"){
    if(/not confirmed/i.test(e.detalle||""))return "Esta cuenta aún no está confirmada.";
    if(e.status===429)return "Demasiados intentos. Espera unos minutos.";
    if(e.status===400||e.status===401||e.status===422)return "Correo o contraseña incorrectos.";
  }
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

/* ---- Sesión ---- */
function guardaSesion(d){
  sesion={access_token:String(d.access_token||""),refresh_token:String(d.refresh_token||""),expires_at:Date.now()+(Number(d.expires_in)||3600)*1000};
  store.set(sesion);
  programaRefresco();
}
function programaRefresco(){
  clearTimeout(timerRefresco);
  if(!sesion)return;
  const ms=Math.max(5000,sesion.expires_at-Date.now()-60000);
  timerRefresco=setTimeout(()=>{refrescar().catch(()=>{});},ms);
}
function refrescar(){
  if(!refrescando){
    refrescando=(async()=>{
      try{
        const d=await peticion("/auth/v1/token?grant_type=refresh_token",{metodo:"POST",cuerpo:JSON.stringify({refresh_token:sesion.refresh_token}),cabeceras:{"Content-Type":"application/json"}});
        guardaSesion(d);
      }catch(e){
        if(e.tipo==="http"&&[400,401,403].includes(e.status)){salirLocal("Tu sesión caducó. Vuelve a entrar.");throw {tipo:"sesion"};}
        throw e;
      }finally{refrescando=null;}
    })();
  }
  return refrescando;
}
async function asegurarSesion(){
  if(!sesion)throw {tipo:"sesion"};
  if(sesion.expires_at-Date.now()>60000)return;
  await refrescar();
}
async function esAdmin(){
  const r=await peticion("/rest/v1/rpc/es_admin",{metodo:"POST",auth:"user",cuerpo:"{}",cabeceras:{"Content-Type":"application/json"}});
  return r===true;
}
function salirLocal(msg){
  sesion=null;clearTimeout(timerRefresco);store.del();
  verLogin();
  if(msg)aviso(loginMsg,msg,"error");
}
async function cerrarSesion(llamar){
  if(llamar!==false&&sesion){
    try{await peticion("/auth/v1/logout",{metodo:"POST",auth:"user"});}catch(e){}
  }
  salirLocal("");
}
function verLogin(){
  vistaPanel.hidden=true;vistaLogin.hidden=false;btnSalir.hidden=true;inPass.value="";
}
function verPanel(){
  vistaLogin.hidden=true;vistaPanel.hidden=false;btnSalir.hidden=false;
}

formLogin.addEventListener("submit",async ev=>{
  ev.preventDefault();
  if(!CONFIGURADO)return;
  const email=inEmail.value.trim(), pass=inPass.value;
  if(!email||!pass){aviso(loginMsg,"Escribe tu correo y tu contraseña.","error");return;}
  btnLogin.disabled=true;aviso(loginMsg,"Entrando…","info");
  try{
    const d=await peticion("/auth/v1/token?grant_type=password",{metodo:"POST",cuerpo:JSON.stringify({email,password:pass}),cabeceras:{"Content-Type":"application/json"}});
    guardaSesion(d);
    inPass.value="";
    if(await esAdmin()){
      aviso(loginMsg,"","");verPanel();await iniciarPanel();
    }else{
      await cerrarSesion(true);
      aviso(loginMsg,"Esta cuenta no tiene permisos de administrador.","error");
    }
  }catch(e){
    sesion=null;store.del();
    aviso(loginMsg,errLogin(e),"error");
  }finally{btnLogin.disabled=false;}
});
btnSalir.addEventListener("click",()=>{cerrarSesion(true);});

/* ---- Utilidades de texto y nombres ---- */
function slugify(s){
  return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80).replace(/-+$/,"");
}
function nombreBase(src){
  let s=String(src||"").split(/[?#]/)[0].split(/[\\/]/).pop()||"";
  try{s=decodeURIComponent(s);}catch(e){}
  return s;
}
function nombreValido(n){
  return /^[A-Za-z0-9 _.()-]{1,180}$/.test(n)&&!n.startsWith(".")&&n.toLowerCase()!=="thumb.png";
}
function urlPublica(slug,nombre){
  return `${BASE}/storage/v1/object/public/textos/${encodeURIComponent(slug)}/${encodeURIComponent(nombre)}`;
}
function fechaHoy(){
  const d=new Date(), p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

/* ---- Slug: comprobación de disponibilidad ---- */
async function cargarSlugsPosts(){
  if(postsSlugs)return postsSlugs;
  try{
    const r=await fetch("posts.json",{cache:"no-store"});
    const arr=r.ok?await r.json():[];
    postsSlugs=Array.isArray(arr)?arr.map(p=>String(p.slug||"")):[];
  }catch(e){postsSlugs=[];}
  return postsSlugs;
}
async function comprobarSlug(slug){
  if(!/^[a-z0-9-]{1,80}$/.test(slug)){
    aviso(fSlugEstado,"Solo minúsculas, números y guiones (máximo 80).","error");
    fSlug.setAttribute("aria-invalid","true");return false;
  }
  const enPosts=(await cargarSlugsPosts()).includes(slug);
  if(enPosts){aviso(fSlugEstado,"Ya existe en posts.json. Cambia el slug.","error");fSlug.setAttribute("aria-invalid","true");return false;}
  try{
    const rows=await peticion(`/rest/v1/textos?select=id&slug=eq.${encodeURIComponent(slug)}`,{auth:"user"});
    if(Array.isArray(rows)&&rows.length){aviso(fSlugEstado,"Ya existe un texto con ese slug.","error");fSlug.setAttribute("aria-invalid","true");return false;}
  }catch(e){aviso(fSlugEstado,textoErr(e,"comprobar el slug"),"error");return false;}
  aviso(fSlugEstado,"Disponible.","ok");fSlug.removeAttribute("aria-invalid");return true;
}
let debSlug=0;
function comprobarSlugDiferido(){
  clearTimeout(debSlug);
  const s=fSlug.value.trim();
  if(!s){aviso(fSlugEstado,"","");return;}
  debSlug=setTimeout(()=>{comprobarSlug(s);},400);
}
fTitulo.addEventListener("input",()=>{
  if(slugManual)return;
  fSlug.value=slugify(fTitulo.value);
  comprobarSlugDiferido();
});
fSlug.addEventListener("input",()=>{
  slugManual=fSlug.value.trim()!=="";
  comprobarSlugDiferido();
});
fResumen.addEventListener("input",()=>{fResumenCont.textContent=`${fResumen.value.length}/600`;});

/* ---- Archivos adjuntos ---- */
function refrescaUrlsVista(){
  urlsVista.forEach(u=>URL.revokeObjectURL(u));
  urlsVista=new Map();
  imgsSel.forEach(f=>urlsVista.set(f.name,URL.createObjectURL(f)));
}
fPdf.addEventListener("change",()=>{
  const f=fPdf.files[0]||null;
  pdfSel=f;
  if(f&&f.type!=="application/pdf"&&!/\.pdf$/i.test(f.name)){aviso(fPdfInfo,"Ese archivo no es un PDF.","error");pdfSel=null;fPdf.value="";return;}
  if(f&&f.size>MAX_ARCHIVO){aviso(fPdfInfo,"El PDF supera 50 MB.","error");pdfSel=null;fPdf.value="";return;}
  aviso(fPdfInfo,f?`${f.name} (${Math.round(f.size/1024)} KB)`:"","ok");
  analizarDiferido();
});
fImgs.addEventListener("change",()=>{
  const todos=[...fImgs.files], malos=[];
  /* si eligen el PDF aquí, va a su campo */
  const pdf=todos.find(f=>/\.pdf$/i.test(f.name));
  if(pdf){const dt=new DataTransfer();dt.items.add(pdf);fPdf.files=dt.files;fPdf.dispatchEvent(new Event("change"));if(pdfSel)mostrarToast("PDF colocado en el paso 1.");}
  if(pdf&&todos.every(f=>/\.pdf$/i.test(f.name)))return;
  const lista=todos.filter(f=>!/\.pdf$/i.test(f.name));
  imgsSel=lista.filter(f=>{
    const ok=TIPOS_IMG.includes(f.type)&&f.size<=MAX_ARCHIVO&&nombreValido(f.name);
    if(!ok)malos.push(f.name);
    return ok;
  });
  refrescaUrlsVista();
  let t=imgsSel.length?`${imgsSel.length} imagen(es): ${imgsSel.map(f=>f.name).join(", ")}`:"";
  if(malos.length)t+=(t?". ":"")+`No se usarán (tipo, tamaño o nombre con acentos o símbolos): ${malos.join(", ")}`;
  aviso(fImgsInfo,t,malos.length?"error":"ok");
  analizarDiferido();
});

/* ---- Validación y vista previa ---- */
/* Devuelve {vacio, avisos[], limpio}. Los avisos no bloquean la publicación; solo piden confirmación. */
/* la IA suele envolver el HTML: si hay bloques de código, solo cuenta lo de dentro */
const sinVallas=s=>{
  const t=String(s||""),b=[...t.matchAll(/^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gm)].map(m=>m[1]);
  return (b.length?b.join("\n"):t.replace(/^[ \t]*```.*$/gm,"")).trim();
};
function analizar(crudo){
  const txt=sinVallas(crudo);
  if(!txt)return {vacio:true,avisos:[],limpio:""};
  const lista=[];
  if(/<\s*(html|head|body|style|script)[\s>]/i.test(txt))lista.push("Hay etiquetas no permitidas (html, head, body, style o script); se eliminarán.");
  if(txt.length>600000)lista.push("El HTML supera 600 000 caracteres.");
  let limpio=DOMPurify.sanitize(txt,PURIFY_CFG).trim();
  const quit=[...new Set((DOMPurify.removed||[]).map(x=>{
    if(x.element)return x.element.nodeName.toLowerCase();
    if(x.attribute)return "atributo "+x.attribute.name;
    return "";
  }).filter(n=>n&&n!=="body"&&!n.startsWith("#")))];
  if(quit.length)lista.push(`Se eliminarán elementos o atributos no permitidos: ${quit.slice(0,8).join(", ")}.`);

  const t=document.createElement("template");t.innerHTML=limpio;
  const c=t.content;
  const h1=c.querySelector("header h1");
  if(!h1||!h1.textContent.trim())lista.push("Falta <h1> dentro de <header> (el título), o está vacío.");
  if(!c.querySelector("header p.autor"))lista.push('Falta <p class="autor"> dentro de <header>.');
  if(!c.querySelector("section.cuerpo"))lista.push('Falta <section class="cuerpo"> con los párrafos.');

  const adjuntas=new Set([...imgsSel.map(f=>f.name),...yaSubidas()]);
  const faltan=new Set();
  c.querySelectorAll("img").forEach(im=>{
    const src=(im.getAttribute("src")||"").trim();
    if(!src){faltan.add("(sin src)");return;}
    if(/^https?:\/\//i.test(src))return;
    const n=nombreBase(src);
    if(!adjuntas.has(n))faltan.add(n);
    im.setAttribute("src",encodeURIComponent(n)); /* los archivos se suben sin carpeta */
  });
  limpio=t.innerHTML;
  if(faltan.size)lista.push(`Imágenes sin adjuntar: ${[...faltan].join(", ")}. Adjunta el archivo con ese nombre o corrige el src.`);

  const refs=new Set([...c.querySelectorAll('sup a[href^="#nota-"]')].map(a=>a.getAttribute("href").slice(1)));
  const notas=new Set([...c.querySelectorAll("ol.notas > li[id]")].map(li=>li.id));
  const sinNota=[...refs].filter(r=>!notas.has(r)), sinRef=[...notas].filter(n=>!refs.has(n));
  if(sinNota.length)lista.push(`Llamadas a notas sin nota: ${sinNota.join(", ")}.`);
  if(sinRef.length)lista.push(`Notas sin llamada en el texto: ${sinRef.join(", ")}.`);

  return {vacio:false,avisos:lista,limpio};
}

/* al editar, las imágenes del texto guardado ya están en Storage */
let editando=null;
function yaSubidas(){
  if(!editando||!editando.base_url)return [];
  const t=document.createElement("template");t.innerHTML=editando.html||"";
  return [...t.content.querySelectorAll("img[src]")].map(i=>nombreBase(i.getAttribute("src")));
}
function pintaVista(limpio){
  const t=document.createElement("template");t.innerHTML=limpio;
  t.content.querySelectorAll("img").forEach(im=>{
    const src=im.getAttribute("src")||"";
    if(/^https?:\/\//i.test(src))return;
    const n=nombreBase(src);
    const url=urlsVista.get(n)||(yaSubidas().includes(n)?editando.base_url+encodeURIComponent(n):null);
    if(url)im.setAttribute("src",url);
    else{im.removeAttribute("src");im.classList.add("falta");}
  });
  if(!limpio){vistaPrevia.replaceChildren(el("p","ayuda","Aquí aparecerá el texto tal como se verá."));return;}
  vistaPrevia.replaceChildren(t.content);
}
/* Enlaces de notas dentro de la vista previa: se queda en el panel y baja a la nota */
vistaPrevia.addEventListener("click",ev=>{
  const a=ev.target.closest&&ev.target.closest('a[href^="#"]');
  if(!a)return;
  ev.preventDefault();
  const dest=vistaPrevia.querySelector(`[id="${CSS.escape(a.getAttribute("href").slice(1))}"]`);
  if(dest)dest.scrollIntoView({block:"center",behavior:"smooth"});
});

function ejecutarAnalisis(conMensaje){
  const r=analizar(fHtml.value);
  pintaVista(r.limpio);
  listaAvisos.replaceChildren();
  if(r.vacio){avisos.hidden=true;return r;}
  avisos.hidden=false;
  if(!r.avisos.length){
    avisosTitulo.textContent="HTML válido: no hay avisos.";avisosTitulo.dataset.tipo="ok";
  }else{
    avisosTitulo.textContent=`${r.avisos.length} aviso(s) antes de publicar:`;avisosTitulo.dataset.tipo="error";
    r.avisos.forEach(a=>listaAvisos.append(el("li",null,a)));
  }
  if(!conMensaje&&!r.avisos.length)avisos.hidden=true;
  return r;
}
function analizarDiferido(){clearTimeout(debTimer);debTimer=setTimeout(()=>ejecutarAnalisis(false),300);}
fHtml.addEventListener("input",analizarDiferido);
btnValidar.addEventListener("click",()=>{ejecutarAnalisis(true);});

/* ---- Prompt para IA ---- */
promptTexto.value=PROMPT_IA;
btnCopiar.addEventListener("click",async()=>{
  const det=$("det-prompt");
  if(navigator.clipboard&&navigator.clipboard.writeText){
    try{await navigator.clipboard.writeText(PROMPT_IA);mostrarToast("Prompt copiado. Pégalo en tu IA y adjunta el PDF.");return;}
    catch(e){/* cae al plan B */}
  }
  det.open=true;promptTexto.focus();promptTexto.select();
  mostrarToast("No se pudo copiar automáticamente. El texto quedó seleccionado: copia con Ctrl/Cmd + C.");
});

/* ---- Lectura del formulario ---- */
function leerFormulario(){
  return {
    titulo:fTitulo.value.trim(), autor:fAutor.value.trim(), fecha:fFecha.value,
    resumen:fResumen.value.trim(), slug:fSlug.value.trim(), html:fHtml.value,
    pdf:pdfSel, imgs:imgsSel.slice(), libro:leerLibro()
  };
}
function validarCampos(d){
  const e=[];
  if(!d.titulo||d.titulo.length>200)e.push("El título es obligatorio (máximo 200 caracteres).");
  if(!d.autor||d.autor.length>120)e.push("El autor es obligatorio (máximo 120 caracteres).");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha))e.push("Indica la fecha.");
  if(d.resumen.length>600)e.push("El resumen supera 600 caracteres.");
  if(!/^[a-z0-9-]{1,80}$/.test(d.slug))e.push("El slug solo puede tener minúsculas, números y guiones.");
  if(!d.html.trim())e.push("Pega el HTML del texto.");
  else if(d.html.length>600000)e.push("El HTML supera 600 000 caracteres.");
  return e;
}

/* ---- Publicación ---- */
function huella(d){
  return JSON.stringify([d.libro,d.titulo,d.autor,d.fecha,d.resumen,d.slug,d.html,d.pdf?d.pdf.name+d.pdf.size:"",d.imgs.map(f=>f.name+f.size)]);
}
async function subirArchivo(slug,nombre,cuerpo,tipo){
  await peticion(`/storage/v1/object/textos/${encodeURIComponent(slug)}/${encodeURIComponent(nombre)}`,{
    metodo:"POST",auth:"user",cuerpo,
    cabeceras:{"Content-Type":tipo||"application/octet-stream","x-upsert":"true"}
  });
}
async function miniaturaPdf(file){
  if(!window.pdfjsLib)throw new Error("no se cargó pdf.js (revisa tu conexión)");
  pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const page=await pdf.getPage(1);
  const escala=600/page.getViewport({scale:1}).width;
  const vp=page.getViewport({scale:escala});
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
  const blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("no se pudo generar la imagen")),"image/png"));
  pdf.destroy();
  return blob;
}
async function actualizarFila(d,limpio,st){
  const fila={titulo:d.titulo,autor:d.autor,fecha:d.fecha,resumen:d.resumen,html:limpio,libro:d.libro};
  const v="?v="+Date.now(); /* mismo nombre de archivo: evita la copia en caché */
  if(st.urlPdf){fila.pdf_url=st.urlPdf+v;fila.thumb_url=st.urlThumb?st.urlThumb+v:null;}
  const r=await peticion(`/rest/v1/textos?id=eq.${encodeURIComponent(editando.id)}`,{metodo:"PATCH",auth:"user",cuerpo:JSON.stringify(fila),
    cabeceras:{"Content-Type":"application/json",Prefer:"return=representation"}});
  if(!Array.isArray(r)||!r.length)throw new Error("el texto ya no existe o no tienes permiso");
}
async function editarTexto(t){
  let f;
  try{
    const r=await peticion(`/rest/v1/textos?select=*&id=eq.${encodeURIComponent(t.id)}`,{auth:"user"});
    f=r&&r[0];if(!f)throw new Error("ya no existe");
  }catch(e){aviso(listaMsg,textoErr(e,"abrir el texto"),"error");return;}
  if(publicando||((fHtml.value.trim()||fTitulo.value.trim())&&!confirm("Se descartará lo que hay en el formulario. ¿Continuar?")))return;
  limpiarFormulario();
  editando=f;slugManual=true;fSlug.readOnly=true;
  fTitulo.value=f.titulo;fAutor.value=f.autor;fFecha.value=f.fecha;fSlug.value=f.slug;fHtml.value=f.html;
  fResumen.value=f.resumen||"";fResumenCont.textContent=`${fResumen.value.length}/600`;
  const l=f.libro;if(l){fC1.value=l.c1;fC2.value=l.c2;fAlto.value=l.h;fAncho.value=l.w;}
  $("nuevo-titulo").textContent="Editar texto";btnPublicar.textContent="Guardar cambios";btnCancelar.hidden=false;
  if(f.pdf_url)aviso(fPdfInfo,"Ya tiene PDF. Elige otro solo si quieres reemplazarlo.","info");
  pintaLibro();pintaVistas();ejecutarAnalisis(false);
  $("nuevo-titulo").scrollIntoView({behavior:"smooth"});
}
async function insertarFila(d,limpio,st){
  const fila={
    slug:d.slug,titulo:d.titulo,autor:d.autor,fecha:d.fecha,resumen:d.resumen,html:limpio,
    pdf_url:st.urlPdf||null,thumb_url:st.urlThumb||null,
    base_url:`${BASE}/storage/v1/object/public/textos/${encodeURIComponent(d.slug)}/`,
    publicado:true,libro:d.libro
  };
  const envia=f=>peticion("/rest/v1/textos",{metodo:"POST",auth:"user",cuerpo:JSON.stringify(f),
    cabeceras:{"Content-Type":"application/json",Prefer:"return=minimal"}});
  try{await envia(fila);}
  catch(e){ /* sin la columna "libro" (falta ejecutar supabase/libro.sql): se guarda sin diseño */
    if(e&&e.status===400){delete fila.libro;await envia(fila);mostrarToast("Guardado sin diseño: ejecuta supabase/libro.sql.");}else throw e;
  }
}

function pintaProgreso(pasos){
  progreso.replaceChildren();
  progreso.hidden=false;
  pasos.forEach(p=>{
    const li=el("li","paso");li.dataset.k=p.k;
    li.append(el("span","paso-txt",p.label),el("span","paso-est","Pendiente"));
    progreso.append(li);
  });
}
function marcaPaso(k,estado,texto){
  const li=progreso.querySelector(`[data-k="${CSS.escape(k)}"]`);
  if(!li)return;
  li.dataset.estado=estado;
  li.querySelector(".paso-est").textContent=texto;
}

async function publicar(){
  if(publicando)return;
  const d=leerFormulario();
  const errores=validarCampos(d);
  if(errores.length){aviso(pubMsg,errores.join(" "),"error");return;}
  const an=ejecutarAnalisis(true);
  if(an.avisos.length){
    if(!confirm("Hay avisos en el HTML:\n- "+an.avisos.join("\n- ")+"\n\n¿Publicar igualmente?"))return;
  }
  aviso(pubMsg,"","");aviso(pubOk,"","");
  publicando=true;btnPublicar.disabled=true; /* antes del primer await: evita doble envío */

  const hu=huella(d);
  if(!pubEstado||pubEstado.slug!==d.slug||pubEstado.huella!==hu){
    pubEstado={slug:d.slug,huella:hu,hecho:new Set(),urlPdf:null,urlThumb:null,fila:false};
  }
  const st=pubEstado;
  if(!editando&&st.intento&&!st.fila){ /* se perdió la respuesta: ¿la fila ya quedó guardada? */
    try{
      const r=await peticion(`/rest/v1/textos?select=titulo&slug=eq.${encodeURIComponent(d.slug)}`,{auth:"user"});
      if(r&&r[0]&&r[0].titulo===d.titulo)st.fila=true;
    }catch(e){}
  }
  if(!editando&&!st.fila){
    const libre=await comprobarSlug(d.slug);
    if(!libre){publicando=false;btnPublicar.disabled=false;return;}
  }

  btnPublicar.textContent="Publicando…";
  const pasos=[];
  if(d.pdf){
    pasos.push({k:"pdf",label:`Subir PDF (${d.pdf.name})`,run:async()=>{
      await subirArchivo(d.slug,d.slug+".pdf",d.pdf,"application/pdf"); /* nombre seguro: Storage rechaza acentos */
      st.urlPdf=urlPublica(d.slug,d.slug+".pdf");
    }});
  }
  d.imgs.forEach((f,i)=>{
    pasos.push({k:"img"+i,label:`Subir imagen ${f.name}`,run:async()=>{
      await subirArchivo(d.slug,f.name,f,f.type);
    }});
  });
  if(d.pdf){
    pasos.push({k:"thumb",label:"Generar y subir miniatura de la página 1",run:async()=>{
      let b;
      try{b=await miniaturaPdf(d.pdf);}
      catch(e){mostrarToast("No se pudo crear la portada del PDF; se usará el color del libro.");return;}
      await subirArchivo(d.slug,"thumb.png",b,"image/png");
      st.urlThumb=urlPublica(d.slug,"thumb.png");
    }});
  }
  pasos.push({k:"fila",label:"Guardar el texto en la base de datos",run:async()=>{
    if(st.fila)return;
    if(editando)await actualizarFila(d,an.limpio,st);
    else{st.intento=true;await insertarFila(d,an.limpio,st);}
    st.fila=true;
  }});

  pintaProgreso(pasos);
  let fallo="";
  for(const p of pasos){
    if(st.hecho.has(p.k)){marcaPaso(p.k,"ok","Listo");continue;}
    marcaPaso(p.k,"curso","En curso…");
    try{
      await p.run();
      st.hecho.add(p.k);
      marcaPaso(p.k,"ok","Listo");
    }catch(e){
      marcaPaso(p.k,"error","Error");
      fallo=textoErr(e,"completar este paso");
      break;
    }
  }
  publicando=false;btnPublicar.disabled=false;btnPublicar.textContent="Publicar";

  if(fallo){
    aviso(pubMsg,`${fallo} Los pasos ya hechos no se repiten: pulsa «Reintentar publicación».`,"error");
    btnPublicar.textContent="Reintentar publicación";
    return;
  }
  pubEstado=null;
  const hecho=editando?"Cambios guardados.":"Texto publicado.";
  pubOk.replaceChildren();
  pubOk.append(hecho+" ");
  const enlace=el("a",null,"Ver el texto");enlace.href=`post.html?p=${encodeURIComponent(d.slug)}`;
  pubOk.append(enlace);
  pubOk.hidden=false;pubOk.dataset.tipo="ok";
  limpiarFormulario();
  cargarLista();
  mostrarToast(hecho);
}
btnPublicar.addEventListener("click",()=>{publicar();});
const btnCancelar=$("btn-cancelar");
btnCancelar.addEventListener("click",()=>{if(!publicando){limpiarFormulario();aviso(pubMsg,"","");}});
formTexto.addEventListener("submit",ev=>{ev.preventDefault();});

function limpiarFormulario(){
  editando=null;pubEstado=null;fSlug.readOnly=false;fSlug.removeAttribute("aria-invalid");
  $("nuevo-titulo").textContent="Nuevo texto";btnCancelar.hidden=true;
  formTexto.reset();
  fFecha.value=fechaHoy();
  slugManual=false;
  aviso(fSlugEstado,"","");aviso(fPdfInfo,"","");aviso(fImgsInfo,"","");
  pdfSel=null;imgsSel=[];refrescaUrlsVista();
  fResumenCont.textContent="0/600";
  pintaLibro();pintaVistas();
  ejecutarAnalisis(false);
  progreso.replaceChildren();progreso.hidden=true;
  btnPublicar.textContent="Publicar";
}

/* ---- Lista de textos ---- */
async function borrarArchivos(slug){
  const nombres=[];
  for(let off=0;;off+=1000){
    const lote=await peticion("/storage/v1/object/list/textos",{metodo:"POST",auth:"user",
      cuerpo:JSON.stringify({prefix:slug+"/",limit:1000,offset:off,sortBy:{column:"name",order:"asc"}}),
      cabeceras:{"Content-Type":"application/json"}});
    const arr=Array.isArray(lote)?lote:[];
    arr.forEach(o=>{if(o&&o.name&&o.id!==null)nombres.push(slug+"/"+o.name);});
    if(arr.length<1000)break;
  }
  for(let i=0;i<nombres.length;i+=100){
    await peticion("/storage/v1/object/textos",{metodo:"DELETE",auth:"user",
      cuerpo:JSON.stringify({prefixes:nombres.slice(i,i+100)}),cabeceras:{"Content-Type":"application/json"}});
  }
  return nombres.length;
}

async function cambiarVisibilidad(t){
  try{
    await peticion(`/rest/v1/textos?id=eq.${encodeURIComponent(t.id)}`,{metodo:"PATCH",auth:"user",
      cuerpo:JSON.stringify({publicado:!t.publicado}),cabeceras:{"Content-Type":"application/json",Prefer:"return=minimal"}});
    aviso(listaMsg,t.publicado?"Texto ocultado. Ya no aparece en el sitio.":"Texto visible en el sitio.","ok");
    await cargarLista();
  }catch(e){aviso(listaMsg,textoErr(e,"cambiar la visibilidad"),"error");}
}
async function eliminarTexto(t){
  if(!confirm(`¿Eliminar «${t.titulo}»?\n\nSe borran el texto, su PDF y sus imágenes. No se puede deshacer.`))return;
  try{
    await peticion(`/rest/v1/textos?id=eq.${encodeURIComponent(t.id)}`,{metodo:"DELETE",auth:"user",cabeceras:{Prefer:"return=minimal"}});
  }catch(e){aviso(listaMsg,textoErr(e,"eliminar el texto"),"error");return;}
  try{
    const n=await borrarArchivos(t.slug);
    aviso(listaMsg,`Texto eliminado${n?" con "+n+" archivo(s)":""}.`,"ok");
  }catch(e){
    aviso(listaMsg,"El texto se eliminó, pero no se pudieron borrar algunos archivos. Bórralos en Storage → textos/"+t.slug+" o vuelve a intentarlo.","error");
  }
  if(editando&&editando.id===t.id)limpiarFormulario();
  await cargarLista();
}

function pintaLista(rows){
  listaTextos.replaceChildren();
  filas=new Map(rows.map(r=>[String(r.id),r]));
  if(!rows.length){listaTextos.append(el("li","vacio","Todavía no hay textos."));return;}
  rows.forEach(t=>{
    const li=el("li","item"+(t.publicado?"":" oculto"));
    if(t.thumb_url){
      const im=el("img","item-miniatura");im.src=t.thumb_url;im.alt="";im.loading="lazy";im.width=54;im.height=72;li.append(im);
    }
    const info=el("div","item-info");
    info.append(
      el("strong","item-titulo",t.titulo),
      el("span","item-meta",`${t.autor} · ${t.fecha} · ${t.publicado?"publicado":"oculto"}`),
      el("code","item-slug",t.slug)
    );
    const acc=el("div","item-acciones");
    const ver=el("a","btn sec","Ver");ver.href=`post.html?p=${encodeURIComponent(t.slug)}`;
    ver.setAttribute("aria-label",`Ver «${t.titulo}»`);
    const tog=el("button","btn sec",t.publicado?"Ocultar":"Mostrar");tog.type="button";
    tog.dataset.accion="visibilidad";tog.dataset.id=String(t.id);
    tog.setAttribute("aria-label",`${t.publicado?"Ocultar":"Mostrar"} «${t.titulo}»`);
    const del=el("button","btn peligro","Eliminar");del.type="button";
    del.dataset.accion="eliminar";del.dataset.id=String(t.id);
    del.setAttribute("aria-label",`Eliminar «${t.titulo}»`);
    const ed=el("button","btn sec","Editar");ed.type="button";
    ed.dataset.accion="editar";ed.dataset.id=String(t.id);
    ed.setAttribute("aria-label",`Editar «${t.titulo}»`);
    ver.hidden=!t.publicado; /* un texto oculto no se puede abrir en el sitio */
    acc.append(ver,ed,tog,del);
    li.append(info,acc);
    listaTextos.append(li);
  });
}
listaTextos.addEventListener("click",ev=>{
  const b=ev.target.closest&&ev.target.closest("button[data-accion]");
  if(!b)return;
  const t=filas.get(b.dataset.id);
  if(!t)return;
  b.disabled=true;
  const fin=({eliminar:eliminarTexto,editar:editarTexto}[b.dataset.accion]||cambiarVisibilidad)(t);
  Promise.resolve(fin).finally(()=>{b.disabled=false;});
});

async function cargarLista(){
  aviso(listaMsg,"","");
  try{
    const rows=await peticion("/rest/v1/textos?select=id,slug,titulo,autor,fecha,publicado,thumb_url,creado&order=fecha.desc,creado.desc",{auth:"user"});
    pintaLista(Array.isArray(rows)?rows:[]);
  }catch(e){
    listaTextos.replaceChildren();
    aviso(listaMsg,textoErr(e,"cargar los textos"),"error");
  }
}

/* ---- Arranque ---- */
async function iniciarPanel(){
  fFecha.value=fechaHoy();
  await cargarLista();
}
async function arranque(){
  if(!CONFIGURADO){
    aviso(estadoGlobal,"Falta configurar config.js (url y anonKey de Supabase).","error");
    btnLogin.disabled=true;return;
  }
  if(typeof DOMPurify==="undefined"){
    aviso(estadoGlobal,"No se cargó DOMPurify. Revisa tu conexión y recarga la página.","error");
    btnPublicar.disabled=true;btnValidar.disabled=true;
  }
  const g=store.get();
  if(g&&g.access_token&&g.refresh_token){
    sesion=g;
    try{
      if(await esAdmin()){verPanel();await iniciarPanel();return;}
      await cerrarSesion(true);
      aviso(loginMsg,"Esta cuenta no tiene permisos de administrador.","error");
    }catch(e){
      if(e&&e.tipo==="red"){aviso(estadoGlobal,"Sin conexión con el servidor. Vuelve a intentarlo.","error");}
      else{aviso(loginMsg,"Tu sesión caducó. Vuelve a entrar.","error");}
    }
  }
  verLogin();
  inEmail.focus();
}
fFecha.value=fechaHoy();
arranque();

/* ---- diseño del libro, importación y vistas disponibles ---- */
const PALETAS=[["#8f1d33","#b3283c"],["#3b2a78","#5a3fb0"],["#14224f","#233a7a"],["#6b2147","#9a3566"],["#2a2f6b","#3f4aa0"],["#0f5c4d","#1f8f78"],["#8a5a12","#c58a2b"],["#2b2b33","#55556a"]];
const fC1=$("f-c1"),fC2=$("f-c2"),fAlto=$("f-alto"),fAncho=$("f-ancho"),edSpine=$("ed-spine"),edCover=$("ed-cover"),edSw=$("ed-sw"),vistasOk=$("vistas-ok"),fArch=$("f-arch");
function leerLibro(){return {c1:fC1.value,c2:fC2.value,h:+fAlto.value,w:+fAncho.value};}
function pintaLibro(){
  const l=leerLibro(),t=fTitulo.value.trim().split(":")[0].replace(/[“”"]/g,"")||"Título";
  [edSpine,edCover].forEach(n=>{n.style.setProperty("--c1",l.c1);n.style.setProperty("--c2",l.c2);});
  edSpine.style.setProperty("--h",l.h+"px");edSpine.style.setProperty("--w",l.w+"px");
  $("ed-spine-t").textContent=t;$("ed-cover-t").textContent=fTitulo.value.trim()||"Título";
  edSw.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.c1===l.c1&&b.dataset.c2===l.c2)));
}
PALETAS.forEach(([a,b])=>{
  const x=el("button");x.type="button";x.dataset.c1=a;x.dataset.c2=b;x.setAttribute("aria-label","Combinación "+a);
  x.style.background=`linear-gradient(135deg,${b},${a})`;
  x.addEventListener("click",()=>{fC1.value=a;fC2.value=b;pintaLibro();});
  edSw.append(x);
});
[fC1,fC2,fAlto,fAncho,fTitulo].forEach(n=>n.addEventListener("input",pintaLibro));
function pintaVistas(){
  const hayHtml=/<header[\s>]/i.test(fHtml.value)&&/class=["']cuerpo["']/i.test(fHtml.value),hayPdf=!!pdfSel||!!(editando&&editando.pdf_url);
  const v=[["PDF original",hayPdf],["Hojas personalizadas",hayHtml],["Página web",hayHtml],["Versión animada",hayHtml]];
  vistasOk.replaceChildren(...v.map(([n,ok])=>el("span",ok?"si":"",(ok?"✓ ":"✗ ")+n)));
}
fHtml.addEventListener("input",pintaVistas);fPdf.addEventListener("change",pintaVistas);
fArch.addEventListener("change",async()=>{
  const f=fArch.files[0];if(!f)return;
  if(f.size>600000){mostrarToast("El HTML supera 600 KB.");fArch.value="";return;}
  fHtml.value=await f.text();fHtml.dispatchEvent(new Event("input"));ejecutarAnalisis(true);
  if(!fTitulo.value){const m=/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(fHtml.value);if(m){fTitulo.value=m[1].replace(/<[^>]+>/g,"").trim();fTitulo.dispatchEvent(new Event("input"));}}
  if(!fAutor.value){const m=/class=["']autor["'][^>]*>([\s\S]*?)<\/p>/i.exec(fHtml.value);if(m)fAutor.value=m[1].replace(/<[^>]+>/g,"").trim();}
});
pintaLibro();pintaVistas();
})();
