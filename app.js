const $=s=>document.querySelector(s);
const fmt=d=>new Date(d+"T12:00").toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const wide=matchMedia("(min-width:1000px)");
const staticP=fetch("posts.json").then(r=>r.json());

/* textos subidos desde el admin: tabla public.textos (REST, clave anon de config.js) */
const sbCfg=()=>{const c=window.SUPABASE||{};return {base:String(c.url||"").replace(/\/+$/,""),key:String(c.anonKey||"")};};
const sbHeaders=c=>({apikey:c.key,Authorization:"Bearer "+c.key,Accept:"application/json"});
const fromRow=r=>({slug:r.slug,title:r.titulo,date:r.fecha,summary:r.resumen||null,thumb:r.thumb_url||null,pdf:r.pdf_url||null,fromDb:true,htmlInline:r.html||"",base:r.base_url||null});
const dbList=()=>{
  const c=sbCfg();if(!c.base||!c.key)return Promise.resolve([]);
  return fetch(`${c.base}/rest/v1/textos?select=slug,titulo,autor,fecha,resumen,pdf_url,thumb_url&order=fecha.desc,creado.desc`,{headers:sbHeaders(c)})
    .then(r=>{if(!r.ok)throw 0;return r.json();})
    .then(rows=>Array.isArray(rows)?rows.map(fromRow):[])
    .catch(()=>[]);
};
/* estáticos primero: si un slug existe en ambos, gana posts.json */
const posts=Promise.all([staticP,dbList()]).then(([st,db])=>{
  const seen=new Set(),out=[];
  [...st,...db].forEach(p=>{if(!seen.has(p.slug)){seen.add(p.slug);out.push(p);}});
  return out;
});
/* entrada de un texto: posts.json, si no, una consulta individual a la BD */
const getPost=async slug=>{
  const st=await staticP.catch(()=>[]);
  const s=st.find(x=>x.slug===slug);if(s)return s;
  const c=sbCfg();if(!slug||!c.base||!c.key)return null;
  const r=await fetch(`${c.base}/rest/v1/textos?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,{headers:sbHeaders(c)});
  if(!r.ok)throw 0;
  const rows=await r.json();
  return Array.isArray(rows)&&rows[0]?fromRow(rows[0]):null;
};
/* HTML de la BD: DOMPurify con lista blanca; sin DOMPurify no se inyecta nada */
const SAN={ALLOWED_TAGS:"header,section,h1,h2,h3,p,em,strong,i,b,sup,sub,a,ol,ul,li,figure,figcaption,img,blockquote,br".split(","),ALLOWED_ATTR:["href","id","class","src","alt","title"],ALLOW_DATA_ATTR:false};
let sanHook=false;
const sanitizeHtml=h=>{
  if(!h||!window.DOMPurify)return null;
  if(!sanHook){sanHook=true;DOMPurify.addHook("afterSanitizeAttributes",n=>{
    if(n.hasAttribute("href")&&!/^(https?:|#)/i.test(n.getAttribute("href")))n.removeAttribute("href");
  });}
  return DOMPurify.sanitize(String(h),SAN)||null;
};
const safeURL=s=>{try{return s?new URL(s):null;}catch(e){return null;}};

/* header: se encoge al hacer scroll */
const hdr=$("header");
const onHeader=()=>hdr.classList.toggle("is-scrolled",scrollY>24);
addEventListener("scroll",onHeader,{passive:true});onHeader();
const yearEl=$("#year");if(yearEl)yearEl.textContent=String(new Date().getFullYear());

if(document.body.dataset.page==="home"){
  const SPOT=matchMedia("(hover:hover)").matches&&!reduce;
  const href=p=>`post.html?p=${encodeURIComponent(p.slug)}`;
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;};
  const dateTxt=d=>d?fmt(d):"";
  const plural=n=>n===1?"1 opinión":`${n} opiniones`;
  /* calificaciones: promedio y total por slug; si falla o no hay config, no se muestran */
  const ratingsP=(()=>{
    const c=sbCfg();if(!c.base||!c.key)return Promise.resolve({});
    return fetch(`${c.base}/rest/v1/comentarios?select=slug,estrellas&limit=1000`,{headers:sbHeaders(c)})
      .then(r=>{if(!r.ok)throw 0;return r.json();})
      .then(rows=>{
        const acc={};
        if(Array.isArray(rows))rows.forEach(r=>{
          const v=Number(r.estrellas);if(!r.slug||!(v>0))return;
          const a=acc[r.slug]||(acc[r.slug]={sum:0,n:0});a.sum+=v;a.n++;
        });
        const out={};
        Object.keys(acc).forEach(k=>{out[k]={avg:acc[k].sum/acc[k].n,n:acc[k].n};});
        return out;
      })
      .catch(()=>({}));
  })();
  const rateLine=(p,R)=>{
    const r=R[p.slug];if(!r||!r.n)return null;
    const avg=r.avg.toLocaleString("es-MX",{minimumFractionDigits:1,maximumFractionDigits:1});
    const q=el("p","rating"),star=el("span","star","★");
    star.setAttribute("aria-hidden","true");
    q.append(star,document.createTextNode(` ${avg} · ${plural(r.n)}`));
    return q;
  };
  const modeChips=p=>{const o=[];if(p.pdf)o.push("PDF");if(p.fromDb?p.htmlInline:p.html)o.push("Hojas","Web");return o;};
  const cover=(p,cls)=>{
    const w=el("div",cls);w.setAttribute("aria-hidden","true");
    const img=p.thumb||p.image;
    if(img){const im=el("img");im.src=img;im.alt="";im.loading="lazy";im.decoding="async";w.append(im);}
    else w.append(el("span","ph","AT"));
    return w;
  };
  const spot=e=>{
    const t=e.currentTarget,r=t.getBoundingClientRect();
    t.style.setProperty("--mx",(e.clientX-r.left)+"px");t.style.setProperty("--my",(e.clientY-r.top)+"px");
  };
  const reveal=nodes=>{
    if(reduce||!("IntersectionObserver" in window)){nodes.forEach(n=>n.classList.add("in"));return;}
    const io=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}
    }),{threshold:.12,rootMargin:"0px 0px -40px 0px"});
    nodes.forEach(n=>io.observe(n));
  };
  const featured=(p,R)=>{
    const a=el("a","feature spot reveal");a.href=href(p);
    a.append(cover(p,"feature-cover"));
    const b=el("div","feature-body");
    b.append(el("p","date",dateTxt(p.date)),el("h3",null,p.title));
    if(p.summary)b.append(el("p","summary",p.summary));
    const ch=modeChips(p);
    if(ch.length){const ul=el("ul","chips");ch.forEach(t=>ul.append(el("li",null,t)));b.append(ul);}
    const rl=rateLine(p,R);if(rl)b.append(rl);
    b.append(el("span","cta-line","Leer ahora →"));
    a.append(b);
    if(SPOT)a.addEventListener("pointermove",spot);
    return a;
  };
  const card=(p,R,i)=>{
    const a=el("a","card spot reveal");a.href=href(p);a.style.setProperty("--i",Math.min(i,6));
    a.append(cover(p,"card-cover"));
    const b=el("div","card-body");
    b.append(el("p","date",dateTxt(p.date)),el("h3",null,p.title));
    if(p.summary)b.append(el("p","summary",p.summary));
    const rl=rateLine(p,R);if(rl)b.append(rl);
    a.append(b);
    if(SPOT)a.addEventListener("pointermove",spot);
    return a;
  };
  const skelCard=()=>{
    const a=el("div","card skel");a.setAttribute("aria-hidden","true");
    const c=el("div","card-cover");c.append(el("span","sk sk-img"));
    const b=el("div","card-body");
    b.append(el("span","sk sk-t"),el("span","sk sk-l"),el("span","sk sk-l short"));
    a.append(c,b);return a;
  };
  /* estantería: cada texto es un lomo; al elegirlo se muestran título, fecha y autor */
  const SPINES=[["#8f1d33","#b3283c"],["#3b2a78","#5a3fb0"],["#14224f","#233a7a"],["#6b2147","#9a3566"],["#2a2f6b","#3f4aa0"]];
  const shelf=(l)=>{
    const wrap=el("div","shelf"),row=el("div","shelf-row"),info=el("div","shelf-info");
    row.setAttribute("role","group");row.setAttribute("aria-label","Estantería de textos");
    info.id="shelf-info";info.setAttribute("aria-live","polite");
    info.append(el("p","shelf-hint","Elige un libro de la estantería."));
    let cur=null;
    const show=(p,btn)=>{
      if(cur)cur.setAttribute("aria-pressed","false");
      if(cur===btn){cur=null;info.replaceChildren(el("p","shelf-hint","Elige un libro de la estantería."));return;}
      cur=btn;btn.setAttribute("aria-pressed","true");
      const a=el("a","shelf-open","Leer →");a.href=href(p);
      const b=el("div","shelf-meta");
      b.append(el("p","date",dateTxt(p.date)),el("h3",null,p.title),el("p","shelf-author","Arturo Torres"),a);
      const card=el("div","shelf-card");card.append(cover(p,"shelf-cover"),b);
      info.replaceChildren(card);
    };
    l.forEach((p,i)=>{
      const h=[...p.slug].reduce((x,c)=>(x*31+c.charCodeAt(0))>>>0,7),[c1,c2]=SPINES[h%SPINES.length];
      const s=el("button","spine");s.type="button";s.setAttribute("aria-pressed","false");s.setAttribute("aria-controls","shelf-info");
      s.setAttribute("aria-label",`${p.title}, ${dateTxt(p.date)}, Arturo Torres`);
      s.style.setProperty("--c1",c1);s.style.setProperty("--c2",c2);
      s.style.setProperty("--h",(176+h%48)+"px");s.style.setProperty("--w",(46+(h>>3)%18)+"px");
      s.append(el("span",null,p.title.split(":")[0].replace(/[“”"]/g,"")));
      s.addEventListener("click",()=>show(p,s));
      row.append(s);
    });
    wrap.append(row,info);return wrap;
  };
  const state=(txt,tag="p")=>el(tag,"state",txt);

  const featSlot=$("#featured"),list=$("#list"),count=$("#count"),heroCta=$("#hero-cta");
  list.replaceChildren(skelCard());
  Promise.all([posts,ratingsP]).then(([l,R])=>{
    l.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    count.textContent=`· ${l.length}`;
    if(!l.length){
      heroCta.hidden=true;
      list.replaceChildren(state("Aún no hay textos publicados. Pronto aparecerán aquí los primeros ensayos."));
      return;
    }
    heroCta.href=href(l[0]);
    const f=featured(l[0],R);
    featSlot.replaceChildren(f);reveal([f]);
    const sh=shelf(l);list.className="";list.replaceChildren(sh);reveal([sh]);
  }).catch(()=>{
    list.replaceChildren(state("No se pudieron cargar los textos. Inténtalo de nuevo más tarde."));
  });
  reveal([...document.querySelectorAll(".how-card")]);
}else{
  const slug=new URLSearchParams(location.search).get("p");
  const MODES=[["web","Página web"],["hojas","Hojas personalizadas"],["pdf","PDF original"]];
  const MODE_KEY="post-fmt";
  const lsGet=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  const mkBtn=(text,aria)=>{const b=document.createElement("button");b.type="button";b.textContent=text;b.setAttribute("aria-label",aria);return b;};
  const dlLink=url=>{const a=document.createElement("a");a.className="dl";a.href=url;a.download="";a.textContent="Descargar PDF ↓";return a;};
  const iconBtn=(d,aria)=>{
    const b=document.createElement("button");b.type="button";b.setAttribute("aria-label",aria);
    const s=document.createElementNS("http://www.w3.org/2000/svg","svg");
    s.setAttribute("viewBox","0 0 24 24");s.setAttribute("fill","none");s.setAttribute("stroke","currentColor");
    s.setAttribute("stroke-width","2");s.setAttribute("stroke-linecap","round");s.setAttribute("aria-hidden","true");
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",d);s.append(path);b.append(s);
    return b;
  };

  /* progreso de lectura y efectos de scroll: un solo listener */
  const bar=document.createElement("div");
  bar.id="progress";bar.setAttribute("aria-hidden","true");document.body.append(bar);
  const updProgress=()=>{
    const h=document.documentElement,max=h.scrollHeight-h.clientHeight;
    bar.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;
  };
  let hooks=[updProgress],raf=0;
  const runHooks=()=>{raf=0;hooks.forEach(f=>f());};
  addEventListener("scroll",()=>{if(!raf)raf=requestAnimationFrame(runHooks);},{passive:true});
  updProgress();

  getPost(slug).then(async p=>{
    if(!p)throw 0;
    document.title=p.title+" · Arturo Torres";
    const metaDesc=document.querySelector('meta[name="description"]');
    if(metaDesc&&p.summary)metaDesc.setAttribute("content",p.summary);
    const art=$("#post");art.replaceChildren();

    /* cabecera y controles fuera de #post: #post solo contiene el texto del escrito */
    const chrome=document.createElement("div");chrome.className="post-chrome";
    const top=document.createElement("div");top.className="post-top";
    const meta=document.createElement("small");meta.className="meta";meta.append(fmt(p.date));
    if(p.pdf){const tag=document.createElement("span");tag.className="tag";tag.textContent="PDF";meta.append(" · ",tag);}
    const anim=document.createElement("a");
    anim.className="anim-btn";anim.href=`lectura.html?p=${encodeURIComponent(p.slug)}`;
    anim.target="_blank";anim.rel="noopener";anim.textContent="Abrir versión animada ↗";
    top.append(meta,anim);chrome.append(top);
    art.before(chrome);

    /* texto en fragmento HTML */
    const htmlURL=(!p.fromDb&&p.html)?new URL(p.html,location.href):null;
    let frag=null;
    if(p.fromDb){frag=sanitizeHtml(p.htmlInline);}
    else if(htmlURL){try{const r=await fetch(htmlURL);if(!r.ok)throw 0;frag=await r.text();}catch(e){frag=null;}}
    if(frag===null){ /* sin fragmento: PDF o Markdown como antes */
      const h1=document.createElement("h1"),body=document.createElement("div");
      h1.textContent=p.title;body.id="body";
      art.append(h1);
      if(p.pdf){chrome.append(dlLink(p.pdf));art.append(body);return readPdf(p.pdf,body);}
      art.append(body);
      if(p.fromDb){body.textContent=p.summary||"";return;}
      body.innerHTML=marked.parse(await fetch(`posts/${encodeURIComponent(slug)}.md`).then(r=>r.text()));
      return;
    }

    const short=(p.title.match(/[“"]([^”"]+)[”"]/)||[])[1]||p.title;
    const valid=MODES.map(m=>m[0]).filter(k=>k!=="pdf"||p.pdf);
    const want=new URLSearchParams(location.search).get("v");
    let cur=[want,lsGet(MODE_KEY)].find(k=>valid.includes(k))||"web";

    /* selector de modo y navegacion del libro */
    const bar2=document.createElement("div");bar2.className="fmt-bar";
    const seg=document.createElement("div");seg.className="seg fmt-seg";
    seg.setAttribute("role","group");seg.setAttribute("aria-label","Modo de lectura");
    const btns=new Map();
    MODES.filter(([k])=>valid.includes(k)).forEach(([k,label])=>{
      const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.fmt=k;
      b.setAttribute("aria-pressed",String(k===cur));btns.set(k,b);seg.append(b);
    });
    bar2.append(seg);
    const dl=p.pdf?dlLink(p.pdf):null;
    if(dl){dl.hidden=true;bar2.append(dl);}
    chrome.append(bar2);
    /* controlador flotante (pastilla) y flechas laterales del libro */
    const CHV_L="M15 18l-6-6 6-6",CHV_R="M9 18l6-6-6-6";
    const nav=document.createElement("div");nav.className="libro-nav";nav.setAttribute("role","group");nav.setAttribute("aria-label","Navegación del libro");nav.hidden=true;
    const prev=iconBtn(CHV_L,"Página anterior"),next=iconBtn(CHV_R,"Página siguiente");
    const aPrev=iconBtn(CHV_L,"Página anterior"),aNext=iconBtn(CHV_R,"Página siguiente");
    aPrev.className="libro-arrow prev";aNext.className="libro-arrow next";
    const count=document.createElement("button");count.type="button";count.className="libro-count";
    count.setAttribute("aria-haspopup","dialog");count.setAttribute("aria-expanded","false");count.setAttribute("aria-label","Ir a una página");
    const cnt=document.createElement("span");cnt.setAttribute("aria-live","polite");count.append(cnt);
    const pbar=document.createElement("div");pbar.className="libro-prog";pbar.setAttribute("aria-hidden","true");
    const pfill=document.createElement("i");pbar.append(pfill);
    const jump=document.createElement("div");jump.className="libro-jump";jump.hidden=true;
    jump.setAttribute("role","dialog");jump.setAttribute("aria-label","Ir a página");
    const jn=document.createElement("input");jn.type="number";jn.min="1";jn.inputMode="numeric";jn.setAttribute("aria-label","Número de página");
    const jr=document.createElement("input");jr.type="range";jr.min="1";jr.step="1";jr.setAttribute("aria-label","Deslizar a página");
    jump.append(jn,jr);
    const snBtn=document.createElement("button");snBtn.type="button";snBtn.className="libro-snd";
    const snSet=()=>{snBtn.setAttribute("aria-pressed",String(soundOn));snBtn.setAttribute("aria-label",soundOn?"Silenciar sonido de página":"Activar sonido de página");snBtn.title=snBtn.getAttribute("aria-label");snBtn.textContent=soundOn?"♪":"♪̸";snBtn.style.opacity=soundOn?"1":".45";};
    snBtn.addEventListener("click",()=>{soundOn=!soundOn;try{localStorage.setItem("libroSonido",soundOn?"1":"0");}catch(e){}snSet();});
    nav.append(prev,count,next,snBtn,pbar,jump);
    queueMicrotask(snSet);

    const stage=document.createElement("div");stage.className="fmt-stage";
    art.append(stage);
    art.after(nav);

    /* notas: popover al pulsar la marca; en pantallas estrechas, hoja inferior */
    const pop=document.createElement("div");pop.className="notepop";pop.hidden=true;
    pop.setAttribute("role","dialog");pop.setAttribute("aria-label","Nota al pie");
    const pc=document.createElement("div");pc.className="notepop-body";
    const pclose=document.createElement("button");pclose.type="button";pclose.className="notepop-close";pclose.textContent="Cerrar";
    pop.append(pc,pclose);document.body.append(pop);
    let opener=null;
    let view=null,mode=null,book=null,bookPage=0,bookN=1,bookCps=1,bookStep=1;
    let io=null,pillIo=null,pdfWrap=null,dimPs=[],plates=[];
    const noteNodes=id=>{
      const li=view&&view.querySelector(`[id="${id}"]`);if(!li)return null;
      return [...li.childNodes].filter(n=>!(n.nodeType===1&&n.classList.contains("volver"))).map(n=>n.cloneNode(true));
    };
    const place=a=>{
      if(innerWidth<640){pop.classList.add("sheet");pop.style.left="";pop.style.top="";pop.style.width="";return;}
      pop.classList.remove("sheet");
      const r=a.getBoundingClientRect(),w=Math.min(340,innerWidth-24);
      pop.style.width=w+"px";
      pop.style.left=Math.min(Math.max(12,r.left+scrollX+r.width/2-w/2),scrollX+innerWidth-w-12)+"px";
      let top=r.bottom+scrollY+10;
      if(r.bottom+10+pop.offsetHeight>innerHeight&&r.top-10-pop.offsetHeight>0)top=r.top+scrollY-10-pop.offsetHeight;
      pop.style.top=top+"px";
    };
    const openNote=a=>{
      const nodes=noteNodes(a.getAttribute("href").slice(1));if(!nodes)return;
      pc.replaceChildren(...nodes);opener=a;pop.hidden=false;place(a);
      pclose.focus({preventScroll:true});
    };
    const closeNote=restore=>{
      if(pop.hidden)return;
      pop.hidden=true;
      if(restore&&opener)opener.focus({preventScroll:true});
      opener=null;
    };
    pclose.addEventListener("click",()=>closeNote(true));

    /* imagen ampliada */
    const lb=document.createElement("div");lb.className="lightbox";lb.hidden=true;
    lb.setAttribute("role","dialog");lb.setAttribute("aria-modal","true");lb.setAttribute("aria-label","Imagen ampliada");
    const lbImg=new Image();lbImg.alt="";
    const lbClose=mkBtn("Cerrar ✕","Cerrar imagen");lbClose.className="lb-close";
    lb.append(lbClose,lbImg);document.body.append(lb);
    let lbOpener=null;
    const openLb=im=>{
      lbOpener=im;lbImg.src=im.src;lbImg.alt=im.alt;lbImg.classList.remove("zoomed");
      lb.hidden=false;document.body.style.overflow="hidden";lbClose.focus();
    };
    const closeLb=()=>{
      if(lb.hidden)return;
      lb.hidden=true;document.body.style.overflow="";
      if(lbOpener)lbOpener.focus({preventScroll:true});lbOpener=null;
    };
    lbClose.addEventListener("click",closeLb);
    lb.addEventListener("click",e=>{
      if(e.target===lbImg)lbImg.classList.toggle("zoomed");else closeLb();
    });
    document.addEventListener("pointerdown",e=>{
      if(pop.hidden||pop.contains(e.target)||(e.target.closest&&e.target.closest("sup a")))return;
      closeNote(false);
    });

    /* ---- modo Hojas: libro con columnas CSS ---- */
    /* sonido de papel: ruido filtrado sintetizado (sin archivos); silenciable y recordado */
    let actx=null,soundOn=true;
    try{soundOn=localStorage.getItem("libroSonido")!=="0";}catch(e){}
    const pageSound=dir=>{
      if(!soundOn||reduce)return;
      try{
        actx=actx||new (window.AudioContext||window.webkitAudioContext)();
        if(actx.state==="suspended")actx.resume();
        const t=actx.currentTime,len=1.0,sr=actx.sampleRate,buf=actx.createBuffer(1,sr*len,sr),d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
        const src=actx.createBufferSource();src.buffer=buf;
        const bp=actx.createBiquadFilter();bp.type="bandpass";bp.Q.value=.7;
        bp.frequency.setValueAtTime(900,t);bp.frequency.exponentialRampToValueAtTime(4200,t+.35);bp.frequency.exponentialRampToValueAtTime(1800,t+.85);
        const g=actx.createGain();
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.16,t+.12);g.gain.linearRampToValueAtTime(.09,t+.4);g.gain.linearRampToValueAtTime(.2,t+.62);g.gain.exponentialRampToValueAtTime(.001,t+.95);
        const pan=actx.createStereoPanner?actx.createStereoPanner():null;
        if(pan){pan.pan.setValueAtTime(dir>0?.35:-.35,t);pan.pan.linearRampToValueAtTime(dir>0?-.35:.35,t+.9);}
        src.connect(bp);bp.connect(g);g.connect(pan||actx.destination);if(pan)pan.connect(actx.destination);
        src.start(t);src.stop(t+len);
      }catch(e){}
    };
    /* hoja que se voltea y se curva: tiras anidadas, cada una gira un poco más que la anterior */
    let flipEnd=null;
    const NS=8;
    const buildFlip=()=>{
      const {vp,cols}=book,W=vp.clientWidth,two=bookCps>1,H=two?W/2:W,R=two?W/2:0,sw=H/NS;
      if(book.fc)book.fc.wrap.remove();
      const mk=(parent,off,cls,w)=>{
        const f=document.createElement("div");f.className=cls;
        const c=cols.cloneNode(true);c.querySelectorAll("[id]").forEach(e=>e.removeAttribute("id"));
        c.style.cssText=`left:${-off}px;right:auto;width:${W}px;transition:none`;
        f.append(c);parent.append(f);if(w)f.style.width=w+"px";return {f,c};
      };
      const wrap=document.createElement("div");wrap.className="libro-flip";wrap.setAttribute("aria-hidden","true");wrap.inert=true;
      const box=(l,cls)=>{const d=document.createElement("div");d.className=cls;d.style.left=l+"px";d.style.width=H+"px";wrap.append(d);return d;};
      const underR=mk(box(R,"libro-half"),R),castR=box(R,"libro-cast");
      let underL=null,castL=null;
      if(two){underL=mk(box(0,"libro-half"),0);castL=box(0,"libro-cast l");}
      const strips=[];let par=wrap;
      for(let k=0;k<NS;k++){
        const s=document.createElement("div");s.className="libro-strip";
        s.style.left=(k?sw:R)+"px";s.style.width=(sw+(k<NS-1?1:0))+"px";
        const fr=mk(s,R+k*sw,"libro-face",sw+1),bk=mk(s,two?R-(k+1)*sw:0,"libro-face back",sw+1);
        if(!two)bk.c.style.display="none";
        par.append(s);par=s;strips.push({s,fr,bk});
      }
      vp.append(wrap);
      book.fc={wrap,underR,underL,castR,castL,strips,key:W+"x"+bookCps};
    };
    const bookFlip=(o,n)=>{
      const {vp,cols}=book,two=bookCps>1;
      if(!book.fc||book.fc.key!==vp.clientWidth+"x"+bookCps)buildFlip();
      const fc=book.fc,A=Math.min(o,n),B=Math.max(o,n),fwd=n>o,T=s=>`translate3d(${-s*bookStep}px,0,0)`;
      fc.strips.forEach(t=>{t.fr.c.style.transform=T(A);t.bk.c.style.transform=T(B);});
      fc.underR.c.style.transform=T(B);if(fc.underL)fc.underL.c.style.transform=T(A);
      const showR=fwd,showL=!fwd&&two;
      fc.underR.f.style.visibility=fc.castR.style.visibility=showR?"visible":"hidden";
      if(fc.underL)fc.underL.f.style.visibility=fc.castL.style.visibility=showL?"visible":"hidden";
      const dur=1100,t0=performance.now();let raf=0,ended=false;
      const ease=p=>{const s=p*p*(3-2*p);return .5*s+.5*(p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2);};
      const frame=p=>{
        const q=fwd?ease(p):1-ease(p),th=-180*q,sn=Math.sin(Math.PI*q),m=.2+.55*sn;
        fc.strips.forEach((t,k)=>{
          const r=k?th*m/(NS-1):th*(1-m);
          t.s.style.transform=`rotateY(${r}deg)`;
        });
        let acc=0;
        fc.strips.forEach((t,k)=>{
          acc+=k?th*m/(NS-1):th*(1-m);
          const sh=Math.abs(Math.sin(acc*Math.PI/180));
          t.fr.f.style.setProperty("--sh",(sh*.5).toFixed(3));t.bk.f.style.setProperty("--sh",(sh*.5).toFixed(3));
        });
        const c=(.8*sn).toFixed(3);fc.castR.style.opacity=c;if(fc.castL)fc.castL.style.opacity=c;
        fc.wrap.style.setProperty("--lift",(sn*14).toFixed(1)+"px");
      };
      const done=()=>{
        if(ended)return;ended=true;cancelAnimationFrame(raf);if(flipEnd===done)flipEnd=null;
        fc.wrap.classList.remove("on");
        cols.style.transition="none";cols.style.transform=T(n);void cols.offsetWidth;cols.style.transition="";
      };
      const tick=now=>{const p=Math.min(1,(now-t0)/dur);frame(p);if(p<1)raf=requestAnimationFrame(tick);else done();};
      pageSound(fwd?1:-1);flipEnd=done;frame(0);fc.wrap.classList.add("on");raf=requestAnimationFrame(tick);setTimeout(done,dur+150);
    };
    const bookTo=(page,anim)=>{
      if(!book)return;
      const spreads=Math.max(1,Math.ceil(bookN/bookCps));
      const s=Math.min(Math.max(0,Math.floor(page/bookCps)),spreads-1);
      const old=Math.floor(bookPage/bookCps);
      bookPage=s*bookCps;
      if(flipEnd)flipEnd();
      if(anim&&!reduce&&s!==old)bookFlip(old,s);
      else book.cols.style.transform=`translate3d(${-s*bookStep}px,0,0)`;
      const p1=bookPage+1,p2=Math.min(bookN,bookPage+bookCps);
      book.foot[0].dataset.t=bookCps>1?String(p1):"";
      book.foot[1].dataset.t=bookCps>1?(p2>p1?String(p2):""):String(p1);
      cnt.textContent=p2>p1?`Págs. ${p1}–${p2} de ${bookN}`:`Pág. ${p1} de ${bookN}`;
      prev.disabled=aPrev.disabled=s<=0;next.disabled=aNext.disabled=s>=spreads-1;
      pfill.style.transform=`scaleX(${(s+1)/spreads})`;
      jr.max=jn.max=String(bookN);
      if(document.activeElement!==jr)jr.value=String(p1);
      if(document.activeElement!==jn)jn.value=String(p1);
    };
    const bookTurn=dir=>{if(book)bookTo((Math.floor(bookPage/bookCps)+dir)*bookCps,true);};
    const bookLayout=()=>{
      if(!book)return;
      const {vp,cols}=book;
      if(flipEnd)flipEnd();if(book.fc){book.fc.wrap.remove();book.fc=null;}
      cols.style.transform="none";
      const cs=getComputedStyle(cols);
      bookCps=Math.max(1,parseInt(cs.columnCount,10)||1);
      const G=parseFloat(cs.columnGap)||0,pad=parseFloat(cs.paddingLeft)||0;
      const Wc=cols.clientWidth-2*pad,period=(Wc+G)/bookCps;
      bookStep=Wc+G;
      /* columnas = hojas; el desbordamiento del vp cuenta las columnas */
      bookN=Math.max(1,Math.round((vp.scrollWidth-pad+G)/period));
      bookTo(bookPage,false);
    };
    [prev,aPrev].forEach(b=>b.addEventListener("click",()=>bookTurn(-1)));
    [next,aNext].forEach(b=>b.addEventListener("click",()=>bookTurn(1)));
    /* salto de página: contador -> panel con número y deslizador */
    const closeJump=restore=>{
      if(jump.hidden)return;
      jump.hidden=true;count.setAttribute("aria-expanded","false");
      if(restore)count.focus({preventScroll:true});
    };
    const jumpTo=(p,anim)=>{
      if(!book)return 1;
      const v=Math.min(bookN,Math.max(1,Math.round(+p)||1));
      bookTo(v-1,anim);return v;
    };
    count.addEventListener("click",()=>{
      if(!jump.hidden){closeJump(true);return;}
      jump.hidden=false;count.setAttribute("aria-expanded","true");jn.focus();jn.select();
    });
    jn.addEventListener("change",()=>{jn.value=String(jumpTo(jn.value,true));});
    jn.addEventListener("keydown",e=>{
      if(e.key==="Enter"){e.preventDefault();jn.value=String(jumpTo(jn.value,true));closeJump(true);}
    });
    jr.addEventListener("input",()=>{jumpTo(jr.value,false);});
    /* fragmento en <template> (inerte): las rutas de imagen se reescriben antes de que el navegador las pida */
    const parseFrag=()=>{
      const t=document.createElement("template");t.innerHTML=frag;const c=t.content;
      /* DB: base_url resuelve las rutas relativas; si no hay base, se dejan como están */
      const fb=p.fromDb?safeURL(p.base):htmlURL;
      if(fb)c.querySelectorAll("img").forEach(im=>{im.src=new URL(im.getAttribute("src")||"",fb).href;});
      c.querySelectorAll("#anexos img").forEach(im=>{
        im.loading="lazy";im.tabIndex=0;im.setAttribute("role","button");im.setAttribute("aria-label","Ampliar imagen: "+im.alt);
      });
      return c;
    };
    const buildHojas=()=>{
      const cols=document.createElement("div");cols.className="libro-cols post-body";cols.append(parseFrag());
      const hd=cols.querySelector(":scope > header");
      if(hd){const cover=document.createElement("div");cover.className="cover";hd.before(cover);cover.append(hd);}
      const vp=document.createElement("div");vp.className="libro-vp";
      const head=document.createElement("div");head.className="libro-head";head.dataset.t=short;head.setAttribute("aria-hidden","true");
      const foot=document.createElement("div");foot.className="libro-foot";foot.setAttribute("aria-hidden","true");
      const fl=document.createElement("span"),fr=document.createElement("span");foot.append(fl,fr);
      vp.append(head,cols,foot);
      let sx=null;
      vp.addEventListener("pointerdown",e=>{if(e.pointerType!=="mouse")sx={x:e.clientX,y:e.clientY};});
      vp.addEventListener("pointerup",e=>{
        if(!sx)return;const dx=e.clientX-sx.x,dy=e.clientY-sx.y;sx=null;
        if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4)bookTurn(dx<0?1:-1);
      });
      vp.addEventListener("pointercancel",()=>{sx=null;});
      /* franjas laterales del libro: un clic pasa la página (sin tocar texto, notas ni imágenes) */
      const zoneOf=e=>{const r=vp.getBoundingClientRect();return (e.clientX-r.left)/r.width;};
      vp.addEventListener("click",e=>{
        if(e.target.closest&&e.target.closest("a,button,img,input,sup,figure"))return;
        const sel=getSelection&&getSelection();if(sel&&!sel.isCollapsed)return;
        const x=zoneOf(e);
        if(x<.2)bookTurn(-1);else if(x>.8)bookTurn(1);
      });
      vp.addEventListener("pointermove",e=>{
        if(e.pointerType!=="mouse")return;
        const x=zoneOf(e);vp.dataset.zone=x<.2?"prev":x>.8?"next":"";
      });
      const root=document.createElement("div");root.className="libro";root.append(aPrev,vp,aNext);
      return {root,vp,cols,foot:[fl,fr]};
    };

    /* ---- modo Página web ---- */
    const splitWords=root=>{
      let k=0;
      const walk=n=>{
        [...n.childNodes].forEach(c=>{
          if(c.nodeType===3){
            if(!c.nodeValue.trim())return;
            const f=document.createDocumentFragment();
            c.nodeValue.split(/(\s+)/).forEach(t=>{
              if(!t)return;
              if(/^\s+$/.test(t)){f.append(t);return;}
              const s=document.createElement("span");s.className="w";s.textContent=t;
              s.style.setProperty("--i",Math.min(k++,60));f.append(s);
            });
            c.replaceWith(f);
          }else if(c.nodeType===1&&c.tagName!=="SUP"&&c.tagName!=="A")walk(c);
        });
      };
      walk(root);
    };
    const placeNotes=()=>{
      if(mode!=="web"||!view)return;
      const ol=view.querySelector(":scope > ol.notas");if(!ol)return;
      const lis=[...ol.querySelectorAll(":scope > li")];
      if(!wide.matches){ol.classList.remove("margen-on");lis.forEach(li=>{li.style.top="";});return;}
      ol.classList.add("margen-on");
      const base=view.getBoundingClientRect().top;
      let bottom=0;
      lis.forEach(li=>{
        const ref=view.querySelector(`a[href="#${li.id}"]`);
        const par=ref&&ref.closest("p");
        const t=Math.max(par?par.getBoundingClientRect().top-base:0,bottom);
        li.style.top=t+"px";bottom=t+li.offsetHeight+12;
      });
    };
    const focusFn=()=>{
      const a=innerHeight*.28,b=innerHeight*.72;
      dimPs.forEach(q=>{const r=q.getBoundingClientRect();q.classList.toggle("dim",r.bottom<a||r.top>b);});
    };
    const parallaxFn=()=>{
      plates.forEach(f=>{
        const r=f.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;
        const c=(r.top+r.height/2-innerHeight/2)/innerHeight;
        f.style.setProperty("--py",(-c*28).toFixed(1)+"px");
      });
    };
    const buildWeb=()=>{
      const el=document.createElement("div");el.className="web post-body";el.append(parseFrag());
      const h1=el.querySelector("h1");if(h1)h1.classList.add("hero-title");
      el.querySelectorAll("#anexos figure").forEach(f=>f.classList.add("plate"));
      const targets=[...el.querySelectorAll(".resumen, .cuerpo p, #fuentes, #anexos figure")];
      if(!reduce)el.querySelectorAll(".resumen, .cuerpo p").forEach(splitWords);
      dimPs=[...el.querySelectorAll(".cuerpo p")];
      plates=[...el.querySelectorAll("#anexos figure")];
      if(io)io.disconnect();
      if(reduce){targets.forEach(t=>t.classList.add("in"));return {el,targets:[]};}
      io=new IntersectionObserver(es=>es.forEach(e=>{
        if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}
      }),{threshold:.15,rootMargin:"0px 0px -6% 0px"});
      return {el,targets};
    };

    /* ---- render de un modo dentro de #post ---- */
    const render=(m,scroll)=>{
      mode=m;closeNote(false);closeLb();closeJump(false);
      hooks=[updProgress];book=null;view=null;dimPs=[];plates=[];
      if(io){io.disconnect();io=null;}
      if(pillIo){pillIo.disconnect();pillIo=null;}
      nav.classList.remove("is-on");
      let el;
      if(m==="pdf"){
        if(!pdfWrap){
          pdfWrap=document.createElement("div");pdfWrap.className="pdf-wrap";
          const pb=document.createElement("div");pb.id="body";pdfWrap.append(pb);
          stage.replaceChildren(pdfWrap);
          readPdf(p.pdf,pb).catch(()=>{pb.textContent="No se pudo cargar el PDF.";});
        }
        el=pdfWrap;
      }else if(m==="hojas"){
        book=buildHojas();view=book.cols;bookPage=0;el=book.root;
      }else{
        const w=buildWeb();el=w.el;view=el;
        if(!reduce){
          w.targets.forEach(t=>io.observe(t));
          hooks=[updProgress,focusFn,parallaxFn];
        }else hooks=[updProgress];
      }
      stage.replaceChildren(el);
      if(m==="hojas"){
        bookLayout();
        /* controlador flotante solo mientras el libro esta en pantalla */
        pillIo=new IntersectionObserver(es=>nav.classList.toggle("is-on",es[es.length-1].isIntersecting),{threshold:0});
        pillIo.observe(book.root);
        if(scroll)book.root.scrollIntoView({block:"center",behavior:reduce?"auto":"smooth"});
      }
      if(m==="web"){focusFn();parallaxFn();placeNotes();}
      nav.hidden=m!=="hojas";
      if(dl)dl.hidden=m!=="pdf";
      btns.forEach((b,k)=>b.setAttribute("aria-pressed",String(k===m)));
    };

    /* cambio de modo con fundido */
    const choose=m=>{
      if(m===mode||!btns.has(m))return;
      const go=()=>{
        cur=m;lsSet(MODE_KEY,m);
        const u=new URL(location.href);u.searchParams.set("v",m);history.replaceState(null,"",u);
        render(m,true);
      };
      if(reduce){go();return;}
      stage.classList.add("is-fading");
      setTimeout(()=>{go();requestAnimationFrame(()=>stage.classList.remove("is-fading"));},200);
    };
    seg.addEventListener("click",e=>{const b=e.target.closest("button[data-fmt]");if(b)choose(b.dataset.fmt);});

    /* delegacion: notas, anexos ampliables */
    stage.addEventListener("click",e=>{
      if(!view)return;
      const a=e.target.closest&&e.target.closest("sup a");
      if(a&&view.contains(a)){e.preventDefault();openNote(a);return;}
      const im=e.target.closest&&e.target.closest("#anexos img");
      if(im&&view.contains(im))openLb(im);
    });
    stage.addEventListener("keydown",e=>{
      if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches("#anexos img")){e.preventDefault();openLb(e.target);}
    });
    addEventListener("keydown",e=>{
      if(!lb.hidden){
        if(e.key==="Escape")closeLb();
        else if(e.key==="Tab"){e.preventDefault();lbClose.focus();}
        return;
      }
      if(e.key==="Escape"){if(!jump.hidden)closeJump(true);else closeNote(true);return;}
      if(mode==="hojas"&&pop.hidden&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){
        if(e.key==="ArrowRight")bookTurn(1);
        else if(e.key==="ArrowLeft")bookTurn(-1);
      }
    });
    let rt;
    addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{
      bookLayout();placeNotes();if(!pop.hidden&&opener)place(opener);
    },120);});
    if(document.fonts)document.fonts.ready.then(()=>{bookLayout();placeNotes();});

    render(cur);
  }).catch(()=>{
    const art=$("#post");art.replaceChildren();
    const h=document.createElement("h1");h.textContent="Texto no encontrado";
    const pp=document.createElement("p");pp.textContent="El enlace puede estar mal escrito o el texto ya no está publicado.";
    const back=document.createElement("a");back.href="./";back.textContent="← Volver a todos los textos";
    art.append(h,pp,back);
  });
}

/* PDF original: canvas de pdf.js sobre hojas blancas, sin filtros de color */
async function readPdf(url,el){
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await pdfjsLib.getDocument(url).promise;
  const w=el.clientWidth*(devicePixelRatio||1);
  for(let n=1;n<=pdf.numPages;n++){ // ponytail: canvas only, texto no seleccionable; añadir textLayer si lo piden
    const pg=await pdf.getPage(n),base=pg.getViewport({scale:1}),vp=pg.getViewport({scale:w/base.width});
    const slot=document.createElement("div");
    slot.className="pagewrap skel";slot.style.aspectRatio=`${base.width} / ${base.height}`;
    el.append(slot);
    const c=document.createElement("canvas");
    c.className="pdfpage";c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
    await pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
    slot.classList.remove("skel");slot.append(c);
    requestAnimationFrame(()=>slot.classList.add("in"));
  }
}
