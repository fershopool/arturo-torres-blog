const $=s=>document.querySelector(s);
const fmt=d=>new Date(d+"T12:00").toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const posts=fetch("posts.json").then(r=>r.json());

/* header: se encoge al hacer scroll */
const hdr=$("header");
const onHeader=()=>hdr.classList.toggle("is-scrolled",scrollY>24);
addEventListener("scroll",onHeader,{passive:true});onHeader();

if(document.body.dataset.page==="home"){
  posts.then(l=>{
    const cards=l.sort((a,b)=>b.date.localeCompare(a.date)).map((p,i)=>{
      const img=p.thumb||p.image;
      const a=document.createElement("a");
      a.className=`card${img?"":" noimg"}${reduce?"":" reveal"}`;
      a.href=`post.html?p=${encodeURIComponent(p.slug)}`;
      a.style.setProperty("--i",Math.min(i,8));
      const div=document.createElement("div"),small=document.createElement("small"),h3=document.createElement("h3"),para=document.createElement("p");
      small.textContent=fmt(p.date);h3.textContent=p.title;para.textContent=p.summary||"";
      div.append(small,h3,para);a.append(div);
      if(img){
        const wrap=document.createElement("div"),im=document.createElement("img");
        wrap.className="thumb-wrap";im.className="thumb";im.src=img;im.alt="";im.loading="lazy";im.decoding="async";
        wrap.append(im);a.append(wrap);
      }
      return a;
    });
    $("#list").replaceChildren(...cards);
    if(reduce||!("IntersectionObserver" in window)){cards.forEach(c=>c.classList.add("in"));return;}
    const io=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}
    }),{threshold:.12,rootMargin:"0px 0px -40px 0px"});
    cards.forEach(c=>io.observe(c));
  }).catch(()=>{$("#list").textContent="No se pudieron cargar los textos.";});
}else{
  const slug=new URLSearchParams(location.search).get("p");
  const FMTS=[["revista","Revista"],["lectura","Lectura"],["margen","Notas al margen"],["pdf","PDF original"]];
  const FMT_KEY="post-fmt",FS_KEY="post-fs",FS_MIN=16,FS_MAX=24;
  const lsGet=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  const mkBtn=(text,aria)=>{const b=document.createElement("button");b.type="button";b.textContent=text;b.setAttribute("aria-label",aria);return b;};
  /* barra de progreso de lectura */
  const bar=document.createElement("div");
  bar.id="progress";bar.setAttribute("aria-hidden","true");document.body.append(bar);
  let ticking=false;
  const updProgress=()=>{
    ticking=false;
    const h=document.documentElement,max=h.scrollHeight-h.clientHeight;
    bar.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;
  };
  addEventListener("scroll",()=>{if(!ticking){ticking=true;requestAnimationFrame(updProgress);}},{passive:true});
  addEventListener("resize",updProgress);updProgress();

  posts.then(async l=>{
    const p=l.find(x=>x.slug===slug);if(!p)throw 0;
    document.title=p.title+" · Arturo Torres";
    const art=$("#post");art.replaceChildren();
    /* cabecera: fecha, etiqueta PDF y enlace a la versión animada */
    const top=document.createElement("div");top.className="post-top";
    const meta=document.createElement("small");meta.className="meta";meta.append(fmt(p.date));
    if(p.pdf){const tag=document.createElement("span");tag.className="tag";tag.textContent="PDF";meta.append(" · ",tag);}
    const anim=document.createElement("a");
    anim.className="anim-btn";anim.href=`lectura.html?p=${encodeURIComponent(p.slug)}`;
    anim.target="_blank";anim.rel="noopener";anim.textContent="Abrir versión animada ↗";
    top.append(meta,anim);art.append(top);

    /* texto en fragmento HTML: varios formatos sobre el mismo contenido */
    const htmlURL=p.html?new URL(p.html,location.href):null;
    let frag=null;
    if(htmlURL){try{const r=await fetch(htmlURL);if(!r.ok)throw 0;frag=await r.text();}catch(e){frag=null;}}
    if(frag===null){ /* sin fragmento: lector PDF o Markdown como antes */
      const h1=document.createElement("h1"),body=document.createElement("div");
      h1.textContent=p.title;body.id="body";
      art.append(h1);
      if(p.pdf){art.append(toolbar(p.pdf,body),body);return readPdf(p.pdf,body);}
      art.append(body);
      body.innerHTML=marked.parse(await fetch(`posts/${encodeURIComponent(slug)}.md`).then(r=>r.text()));
      return;
    }

    const valid=FMTS.map(f=>f[0]).filter(k=>k!=="pdf"||p.pdf);
    const want=new URLSearchParams(location.search).get("v");
    let cur=[want,lsGet(FMT_KEY),"lectura"].find(k=>valid.includes(k));

    const stage=document.createElement("div");stage.className="fmt-stage";
    const view=document.createElement("div");view.className=`post-body fmt-${cur}`;
    view.innerHTML=frag;
    view.querySelectorAll("img").forEach(im=>{im.src=new URL(im.getAttribute("src"),htmlURL).href;});
    view.querySelectorAll("#anexos img").forEach(im=>{
      im.loading="lazy";im.tabIndex=0;im.setAttribute("role","button");im.setAttribute("aria-label","Ampliar imagen: "+im.alt);
    });
    const pdfWrap=document.createElement("div");pdfWrap.hidden=true;
    const pdfBody=document.createElement("div");pdfBody.id="body";
    if(p.pdf)pdfWrap.append(toolbar(p.pdf,pdfBody),pdfBody);
    stage.append(view,pdfWrap);

    /* selector de formato */
    const bar2=document.createElement("div");bar2.className="fmt-bar";
    const seg=document.createElement("div");seg.className="seg fmt-seg";
    seg.setAttribute("role","group");seg.setAttribute("aria-label","Formato de lectura");
    const btns=new Map();
    FMTS.filter(([k])=>valid.includes(k)).forEach(([k,label])=>{
      const b=mkBtn(label,label);b.removeAttribute("aria-label");b.dataset.fmt=k;
      b.setAttribute("aria-pressed",String(k===cur));btns.set(k,b);seg.append(b);
    });
    /* tamaño de letra (solo formato Lectura) */
    const ctl=document.createElement("div");ctl.className="fs-ctl";
    ctl.setAttribute("role","group");ctl.setAttribute("aria-label","Tamaño de letra");
    const minus=mkBtn("A−","Reducir letra"),plus=mkBtn("A+","Aumentar letra");
    let fs=Math.min(FS_MAX,Math.max(FS_MIN,parseInt(lsGet(FS_KEY),10)||19));
    const setFs=n=>{
      fs=Math.min(FS_MAX,Math.max(FS_MIN,n));
      view.style.setProperty("--fs",fs+"px");lsSet(FS_KEY,String(fs));
      minus.disabled=fs<=FS_MIN;plus.disabled=fs>=FS_MAX;
    };
    minus.addEventListener("click",()=>setFs(fs-1));
    plus.addEventListener("click",()=>setFs(fs+1));
    ctl.append(minus,plus);
    bar2.append(seg,ctl);
    art.append(bar2,stage);

    /* notas: popover al pulsar la marca; en pantallas estrechas, hoja inferior */
    const pop=document.createElement("div");pop.className="notepop";pop.hidden=true;
    pop.setAttribute("role","dialog");pop.setAttribute("aria-label","Nota al pie");
    const pc=document.createElement("div");pc.className="notepop-body";
    const pclose=document.createElement("button");pclose.type="button";pclose.className="notepop-close";pclose.textContent="Cerrar";
    pop.append(pc,pclose);document.body.append(pop);
    let opener=null;
    const noteNodes=id=>{
      const li=view.querySelector(`[id="${id}"]`);if(!li)return null;
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
    addEventListener("keydown",e=>{
      if(!lb.hidden){
        if(e.key==="Escape")closeLb();
        else if(e.key==="Tab"){e.preventDefault();lbClose.focus();}
        return;
      }
      if(e.key==="Escape")closeNote(true);
    });
    document.addEventListener("pointerdown",e=>{
      if(pop.hidden||pop.contains(e.target)||(e.target.closest&&e.target.closest("sup a")))return;
      closeNote(false);
    });
    view.addEventListener("click",e=>{
      const a=e.target.closest&&e.target.closest("sup a");
      if(a){e.preventDefault();openNote(a);return;}
      const im=e.target.closest&&e.target.closest("#anexos img");
      if(im)openLb(im);
    });
    view.addEventListener("keydown",e=>{
      if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches("#anexos img")){e.preventDefault();openLb(e.target);}
    });

    /* notas al margen: copia de cada nota junto al párrafo que la cita */
    view.querySelectorAll(".cuerpo p").forEach(par=>{
      const sups=par.querySelectorAll("sup a");if(!sups.length)return;
      const aside=document.createElement("aside");aside.className="margen";aside.setAttribute("aria-label","Notas de este párrafo");
      sups.forEach(a=>{
        const nodes=noteNodes(a.getAttribute("href").slice(1));if(!nodes)return;
        const d=document.createElement("p");d.className="margen-nota";
        const n=document.createElement("b");n.textContent=a.textContent+" ";
        d.append(n,...nodes);aside.append(d);
      });
      par.after(aside);
    });
    const placeMargins=()=>{
      let bottom=0;
      view.querySelectorAll(".cuerpo > .margen").forEach(aside=>{
        const par=aside.previousElementSibling;if(!par)return;
        const top=Math.max(par.offsetTop,bottom+14);
        aside.style.top=top+"px";bottom=top+aside.offsetHeight;
      });
    };
    let rt;
    addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{
      placeMargins();if(!pop.hidden&&opener)place(opener);
    },120);});

    /* cambio de formato con fundido */
    const show=f=>{
      const isPdf=f==="pdf";
      view.hidden=isPdf;pdfWrap.hidden=!isPdf;
      if(!isPdf)view.className=`post-body fmt-${f}`;
      ctl.hidden=f!=="lectura";
      if(isPdf&&!view.dataset.pdf){
        view.dataset.pdf="1";
        readPdf(p.pdf,pdfBody).catch(()=>{pdfBody.textContent="No se pudo cargar el PDF.";});
      }
      placeMargins();
    };
    const choose=f=>{
      if(f===cur)return;
      const go=()=>{
        cur=f;lsSet(FMT_KEY,f);
        btns.forEach((b,k)=>b.setAttribute("aria-pressed",String(k===f)));
        show(f);
      };
      if(reduce){go();return;}
      stage.classList.add("is-fading");
      setTimeout(()=>{go();requestAnimationFrame(()=>stage.classList.remove("is-fading"));},200);
    };
    seg.addEventListener("click",e=>{const b=e.target.closest("button[data-fmt]");if(b)choose(b.dataset.fmt);});

    setFs(fs);
    show(cur);
  }).catch(()=>{$("#post").textContent="Texto no encontrado.";});
}

/* modo de lectura: "dark" (tema del sitio) o "paper" (hoja original) */
const MODE_KEY="reader-mode";
function getMode(){try{return localStorage.getItem(MODE_KEY)==="paper"?"paper":"dark";}catch(e){return "dark";}}
function setMode(m){try{localStorage.setItem(MODE_KEY,m);}catch(e){}}

function toolbar(url,body){
  const bar=document.createElement("div");bar.className="toolbar";
  const seg=document.createElement("div");seg.className="seg";
  seg.setAttribute("role","group");seg.setAttribute("aria-label","Modo de lectura");
  const cur=getMode();body.dataset.mode=cur;
  const btns=[["dark","Oscuro"],["paper","Hoja original"]].map(([m,label])=>{
    const b=document.createElement("button");
    b.type="button";b.dataset.mode=m;b.textContent=label;b.setAttribute("aria-pressed",String(m===cur));
    b.addEventListener("click",()=>{
      body.dataset.mode=m;setMode(m);
      btns.forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
    });
    seg.append(b);return b;
  });
  const dl=document.createElement("a");
  dl.className="dl";dl.href=url;dl.download="";dl.textContent="Descargar PDF ↓";
  bar.append(seg,dl);
  return bar;
}

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
