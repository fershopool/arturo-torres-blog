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

if(document.body.dataset.page==="home"){
  posts.then(l=>{
    const cards=l.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map((p,i)=>{
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
    const nav=document.createElement("div");nav.className="libro-nav";nav.hidden=true;
    const prev=iconBtn("M15 18l-6-6 6-6","Página anterior"),next=iconBtn("M9 18l6-6-6-6","Página siguiente");
    const count=document.createElement("span");count.className="libro-count";count.setAttribute("aria-live","polite");
    nav.append(prev,count,next);

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
    let io=null,pdfWrap=null,dimPs=[],plates=[];
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
    const bookTo=(page,anim)=>{
      if(!book)return;
      const spreads=Math.max(1,Math.ceil(bookN/bookCps));
      const s=Math.min(Math.max(0,Math.floor(page/bookCps)),spreads-1);
      bookPage=s*bookCps;
      book.cols.style.transform=`translate3d(${-s*bookStep}px,0,0)`;
      if(anim&&!reduce){book.vp.classList.remove("turning");void book.vp.offsetWidth;book.vp.classList.add("turning");}
      const p1=bookPage+1,p2=Math.min(bookN,bookPage+bookCps);
      book.foot[0].dataset.t=bookCps>1?String(p1):"";
      book.foot[1].dataset.t=bookCps>1?(p2>p1?String(p2):""):String(p1);
      count.textContent=p2>p1?`Págs. ${p1}–${p2} de ${bookN}`:`Pág. ${p1} de ${bookN}`;
      prev.disabled=s<=0;next.disabled=s>=spreads-1;
    };
    const bookTurn=dir=>{if(book)bookTo((Math.floor(bookPage/bookCps)+dir)*bookCps,true);};
    const bookLayout=()=>{
      if(!book)return;
      const {vp,cols}=book;
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
    prev.addEventListener("click",()=>bookTurn(-1));
    next.addEventListener("click",()=>bookTurn(1));
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
      const root=document.createElement("div");root.className="libro";root.append(vp);
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
    const render=m=>{
      mode=m;closeNote(false);closeLb();
      hooks=[updProgress];book=null;view=null;dimPs=[];plates=[];
      if(io){io.disconnect();io=null;}
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
      if(m==="hojas"){bookLayout();}
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
        render(m);
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
      if(e.key==="Escape"){closeNote(true);return;}
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
