/* Comentarios públicos de un texto (post.html). Vanilla JS, sin SDK: REST de Supabase con fetch.
   Seguridad: todo dato de usuario se pinta con textContent. Nunca innerHTML con datos. */
(function(){
"use strict";

const cfg=window.SUPABASE||{};
const BASE=String(cfg.url||"").replace(/\/+$/,"");
const KEY=String(cfg.anonKey||"");
const CONFIGURADO=!!(BASE&&KEY);
const slug=new URLSearchParams(location.search).get("p");
const ANCLA=document.getElementById("post");
if(!slug||!ANCLA||slug.length>80)return;

const MAX_TEXTO=1000, MAX_NOMBRE=40, ESPERA_MS=20000;
const K_NOMBRE="comentarios:seudonimo", K_ENVIO="comentarios:ultimo-envio";
const ESTRELLA="★";

/* localStorage protegido: en navegación privada o con datos bloqueados puede lanzar */
const ls={
  get(k){try{return localStorage.getItem(k);}catch(e){return null;}},
  set(k,v){try{localStorage.setItem(k,v);}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};

const el=(tag,cls,texto)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(texto!=null)n.textContent=texto;return n;};
const normTexto=s=>String(s||"").replace(/\r/g,"").split("\n").map(l=>l.replace(/[ \t ]+/g," ").trim()).join("\n").replace(/\n{3,}/g,"\n\n").trim();
const normNombre=s=>String(s||"").replace(/\s+/g," ").trim();
const inicial=s=>(Array.from(String(s||"").trim())[0]||"?").toLocaleUpperCase("es");

const RTF=(typeof Intl!=="undefined"&&Intl.RelativeTimeFormat)?new Intl.RelativeTimeFormat("es",{numeric:"always",style:"short"}):null;
function hace(iso){
  const t=Date.parse(iso);if(isNaN(t))return "";
  const s=Math.min(0,Math.round((t-Date.now())/1000)), a=Math.abs(s);
  if(a<60)return "justo ahora";
  if(a>=7*86400)return new Date(t).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});
  const [unidad,seg]=a>=86400?["day",86400]:a>=3600?["hour",3600]:["minute",60];
  const v=Math.round(s/seg);
  return RTF?RTF.format(v,unidad):`hace ${Math.abs(v)}`;
}

/* Barra de estrellas: base atenuada + capa dorada recortada por porcentaje (admite medias) */
function barraEstrellas(valor,cls){
  const w=el("span",cls);
  w.setAttribute("role","img");
  w.setAttribute("aria-label",`${valor.toFixed(valor%1?1:0)} de 5 estrellas`);
  w.append(el("span","cm-est-base",ESTRELLA.repeat(5)));
  const f=el("span","cm-est-fill",ESTRELLA.repeat(5));
  f.style.width=Math.max(0,Math.min(100,valor/5*100))+"%";
  w.append(f);
  return w;
}

/* Errores: tipo "red" si no hubo respuesta, "http" si el servidor respondió con error */
function textoError(e,accion){
  if(e&&e.tipo==="red")return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  if(e&&e.tipo==="http")return `No se pudo ${accion} (error ${e.status}). Inténtalo de nuevo.`;
  return `No se pudo ${accion}. Inténtalo de nuevo.`;
}

async function api(ruta,opts){
  opts=opts||{};
  const ctl=new AbortController(), tmo=setTimeout(()=>ctl.abort(),15000);
  let r;
  try{
    r=await fetch(BASE+ruta,{
      method:opts.method||"GET",
      headers:Object.assign({apikey:KEY,Authorization:"Bearer "+KEY,Accept:"application/json"},opts.headers||{}),
      body:opts.body,
      signal:ctl.signal
    });
  }catch(e){throw {tipo:"red"};}
  finally{clearTimeout(tmo);}
  if(!r.ok)throw {tipo:"http",status:r.status};
  return r.json();
}

/* ---- Estructura ---- */
const sec=el("section");sec.id="comentarios";sec.setAttribute("aria-labelledby","comentarios-titulo");
const titulo=el("h2",null,"Comentarios");titulo.id="comentarios-titulo";
sec.append(titulo);

if(!CONFIGURADO){
  sec.append(el("p","cm-muted","Comentarios próximamente"));
  ANCLA.after(sec);
  return;
}

const resumen=el("p","cm-resumen");resumen.setAttribute("aria-live","polite");

/* Formulario */
const form=el("form","cm-form");form.setAttribute("aria-label","Escribir un comentario");

const campoNombre=el("div","cm-campo");
const lblNombre=el("label",null,"Seudónimo");lblNombre.htmlFor="cm-seud";
const inNombre=el("input");inNombre.type="text";inNombre.id="cm-seud";inNombre.name="seudonimo";
inNombre.required=true;inNombre.maxLength=MAX_NOMBRE;inNombre.autocomplete="nickname";
inNombre.placeholder="Cómo quieres aparecer";inNombre.value=ls.get(K_NOMBRE)||"";
campoNombre.append(lblNombre,inNombre);

const fs=el("fieldset","cm-rate");
const lgEstrellas=el("legend",null,"Tu calificación");
const grupo=el("div","cm-rate-grupo");
/* DOM en orden 5..1 + flex row-reverse: se ve 1..5 y el hover/checked usan el selector ~ */
for(let n=5;n>=1;n--){
  const inp=el("input");inp.type="radio";inp.name="estrellas";inp.value=String(n);inp.id="cm-e"+n;
  inp.required=true;inp.setAttribute("aria-label",`${n} ${n===1?"estrella":"estrellas"}`);
  const lab=el("label",null,ESTRELLA);lab.htmlFor=inp.id;lab.setAttribute("aria-hidden","true");
  grupo.append(inp,lab);
}
fs.append(lgEstrellas,grupo);

const campoTexto=el("div","cm-campo");
const lblTexto=el("label",null,"Tu comentario");lblTexto.htmlFor="cm-texto";
const ta=el("textarea");ta.id="cm-texto";ta.name="comentario";ta.required=true;
ta.maxLength=MAX_TEXTO;ta.rows=4;ta.placeholder="Escribe tu opinión…";ta.setAttribute("aria-describedby","cm-contador");
const contador=el("span","cm-contador");contador.id="cm-contador";
function actualizaContador(){
  const n=ta.value.length;
  contador.textContent=`${n}/${MAX_TEXTO}`;
  contador.classList.toggle("lleno",n>=950);
}
ta.addEventListener("input",actualizaContador);
campoTexto.append(lblTexto,ta,contador);

/* Campo trampa: los bots lo rellenan; las personas no lo ven ni lo alcanzan con Tab */
const trampa=el("div","cm-hp");trampa.setAttribute("aria-hidden","true");
const hpIn=el("input");hpIn.type="text";hpIn.name="sitio_web";hpIn.tabIndex=-1;hpIn.autocomplete="off";
trampa.append(hpIn);

const acciones=el("div","cm-actions");
const msg=el("p","cm-msg");msg.setAttribute("role","status");
const btn=el("button","cm-btn","Publicar");btn.type="submit";
acciones.append(msg,btn);

form.append(campoNombre,fs,campoTexto);
form.append(trampa,acciones);

/* Lista y avisos */
const aviso=el("div","cm-aviso");
const lista=el("ul","cm-lista");

const tForm=el("h3","cm-sub","Deja tu comentario");
sec.append(resumen,lista,aviso,tForm,form);
ANCLA.after(sec);

/* ---- Estado ---- */
let rows=[],cargando=false,enviando=false;

const tops=()=>rows.filter(r=>!r.parent_id);
const respuestasDe=id=>rows.filter(r=>r.parent_id===id).sort((a,b)=>String(a.creado).localeCompare(String(b.creado)));

function pintaResumen(){
  resumen.replaceChildren();
  const t=tops().filter(r=>r.estrellas!=null);
  if(!t.length){resumen.textContent="Sin calificaciones todavía";return;}
  const avg=t.reduce((s,r)=>s+Number(r.estrellas),0)/t.length;
  resumen.append(
    barraEstrellas(avg,"cm-estrellas"),
    el("span",null,`${avg.toFixed(1)} · ${t.length} ${t.length===1?"opinión":"opiniones"}`)
  );
}

function tarjeta(c,nuevo,esResp){
  const li=el("li","cm-card"+(nuevo?" cm-new":"")+(esResp?" cm-resp":""));
  const av=el("div","cm-avatar",inicial(c.seudonimo));av.setAttribute("aria-hidden","true");
  const cuerpo=el("div","cm-cuerpo");
  const cab=el("div","cm-cabeza");
  const nombre=el("strong","cm-nombre",String(c.seudonimo||""));
  const fecha=el("time","cm-fecha",hace(c.creado));
  if(c.creado)fecha.setAttribute("datetime",String(c.creado));
  cab.append(nombre);
  if(!esResp&&c.estrellas!=null)cab.append(barraEstrellas(Number(c.estrellas)||0,"cm-estrellas-c"));
  cab.append(fecha);
  cuerpo.append(cab,el("p","cm-texto",String(c.comentario||"")));
  if(!esResp){
    const rs=el("ul","cm-resp-lista");
    respuestasDe(c.id).forEach(r=>rs.append(tarjeta(r,false,true)));
    const bar=el("div","cm-acc");
    const bt=el("button","cm-link","Responder");bt.type="button";bt.setAttribute("aria-expanded","false");
    bar.append(bt);
    const slot=el("div","cm-slot");
    bt.addEventListener("click",()=>{
      if(slot.firstChild){slot.replaceChildren();bt.setAttribute("aria-expanded","false");return;}
      slot.append(formRespuesta(c,rs,bt,slot));bt.setAttribute("aria-expanded","true");
      slot.querySelector("textarea").focus();
    });
    cuerpo.append(bar,slot,rs);
  }
  li.append(av,cuerpo);
  return li;
}

function formRespuesta(c,rs,bt,slot){
  const f=el("form","cm-rform");f.setAttribute("aria-label","Responder a "+String(c.seudonimo||""));
  const n=el("input");n.type="text";n.required=true;n.maxLength=MAX_NOMBRE;n.placeholder="Tu seudónimo";n.value=ls.get(K_NOMBRE)||"";n.setAttribute("aria-label","Seudónimo");
  const t=el("textarea");t.required=true;t.maxLength=MAX_TEXTO;t.rows=3;t.placeholder="Escribe tu respuesta…";t.setAttribute("aria-label","Tu respuesta");
  const m=el("p","cm-msg");m.setAttribute("role","status");
  const b=el("button","cm-btn","Enviar respuesta");b.type="submit";
  f.append(n,t,m,b);
  f.addEventListener("submit",async ev=>{
    ev.preventDefault();
    const nombre=normNombre(n.value).slice(0,MAX_NOMBRE),texto=normTexto(t.value).slice(0,MAX_TEXTO);
    if(!nombre||!texto){m.textContent="Escribe tu seudónimo y tu respuesta.";return;}
    const falta=ESPERA_MS-(Date.now()-Number(ls.get(K_ENVIO)||0));
    if(falta>0){m.textContent=`Espera ${Math.ceil(falta/1000)} s antes de publicar otra.`;return;}
    ls.set(K_ENVIO,String(Date.now()));ls.set(K_NOMBRE,nombre);b.disabled=true;b.textContent="Enviando…";
    try{
      const data=await api("/rest/v1/comentarios",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({slug,seudonimo:nombre,comentario:texto,parent_id:c.id})});
      const r=Array.isArray(data)?data[0]:data;
      if(r&&r.comentario){rows.push(r);rs.append(tarjeta(r,true,true));}
      slot.replaceChildren();bt.setAttribute("aria-expanded","false");
    }catch(e){ls.del(K_ENVIO);m.textContent=textoError(e,"publicar tu respuesta");b.disabled=false;b.textContent="Enviar respuesta";}
  });
  return f;
}

function pintaLista(){
  lista.replaceChildren(...tops().map(r=>tarjeta(r,false)));
  pintaResumen();
  aviso.replaceChildren();
  if(!tops().length)aviso.append(el("p","cm-vacio","Sé el primero en comentar"));
}

function pintaCargando(){
  resumen.textContent="Cargando comentarios…";
  lista.replaceChildren(...[0,1,2].map(()=>{const li=el("li","cm-skel");li.setAttribute("aria-hidden","true");return li;}));
  aviso.replaceChildren();
}

function pintaError(texto){
  lista.replaceChildren();
  resumen.textContent="";
  const box=el("div","cm-error");box.setAttribute("role","alert");
  const b=el("button","cm-btn cm-btn-sec","Reintentar");b.type="button";
  b.addEventListener("click",cargar);
  box.append(el("p",null,texto),b);
  aviso.replaceChildren(box);
}

async function cargar(){
  if(cargando)return;
  cargando=true;pintaCargando();
  try{
    const data=await api(`/rest/v1/comentarios?slug=eq.${encodeURIComponent(slug)}&select=*&order=creado.desc&limit=300`);
    rows=Array.isArray(data)?data:[];
    pintaLista();
  }catch(e){
    pintaError(textoError(e,"cargar los comentarios"));
  }finally{cargando=false;}
}

function mensaje(t){msg.textContent=t||"";}
function setEnviando(on){
  enviando=on;
  btn.disabled=on;
  btn.textContent=on?"Publicando…":"Publicar";
  form.setAttribute("aria-busy",on?"true":"false");
}

form.addEventListener("submit",async ev=>{
  ev.preventDefault();
  if(enviando)return;
  if(hpIn.value){ta.value="";actualizaContador();return;} /* trampa activada: rechazo silencioso */
  if(!form.reportValidity())return;

  const nombre=normNombre(inNombre.value).slice(0,MAX_NOMBRE);
  const texto=normTexto(ta.value).slice(0,MAX_TEXTO);
  const sel=form.querySelector('input[name="estrellas"]:checked');
  if(!nombre||!texto||!sel){mensaje("Escribe tu seudónimo, elige una calificación y escribe tu comentario.");return;}

  const ultimo=Number(ls.get(K_ENVIO)||0);
  const falta=ESPERA_MS-(Date.now()-ultimo);
  if(falta>0){mensaje(`Espera ${Math.ceil(falta/1000)} s antes de publicar otro comentario.`);return;}

  mensaje("");
  ls.set(K_ENVIO,String(Date.now()));
  ls.set(K_NOMBRE,nombre);
  setEnviando(true);
  try{
    const data=await api("/rest/v1/comentarios",{
      method:"POST",
      headers:{"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({slug,seudonimo:nombre,estrellas:Number(sel.value),comentario:texto})
    });
    const nuevo=Array.isArray(data)?data[0]:data;
    if(!nuevo||!nuevo.comentario){await cargar();}
    else{
      rows.unshift(nuevo);
      aviso.replaceChildren();
      lista.prepend(tarjeta(nuevo,true));
      pintaResumen();
    }
    ta.value="";sel.checked=false;actualizaContador();
    mensaje("Comentario publicado. ¡Gracias!");
  }catch(e){
    ls.del(K_ENVIO);
    mensaje(textoError(e,"publicar tu comentario"));
  }finally{setEnviando(false);}
});

actualizaContador();
cargar();
})();
