const $=s=>document.querySelector(s);
const fmt=d=>new Date(d+"T12:00").toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
const posts=fetch("posts.json").then(r=>r.json());
if(document.body.dataset.page==="home"){
  posts.then(l=>{$("#list").innerHTML=l.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>
    `<a class="card ${p.image?"":"noimg"}" href="post.html?p=${encodeURIComponent(p.slug)}">
      ${p.image?`<img src="${p.image}" alt="" loading="lazy">`:""}
      <div><small>${fmt(p.date)}</small><h3></h3><p></p></div></a>`).join("");
    [...document.querySelectorAll(".card")].forEach((c,i)=>{c.querySelector("h3").textContent=l[i].title;c.querySelector("p").textContent=l[i].summary||""});
  });
}else{
  const slug=new URLSearchParams(location.search).get("p");
  posts.then(async l=>{
    const p=l.find(x=>x.slug===slug);if(!p)throw 0;
    document.title=p.title+" · Arturo Torres";
    $("#post").innerHTML=`<small style="color:var(--red)">${fmt(p.date)}</small><h1></h1><div id="body"></div>`;
    $("#post h1").textContent=p.title;
    if(p.pdf)return readPdf(p.pdf,$("#body"));
    $("#body").innerHTML=marked.parse(await fetch(`posts/${encodeURIComponent(slug)}.md`).then(r=>r.text()));
  }).catch(()=>$("#post").textContent="Texto no encontrado.");
}
async function readPdf(url,el){
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  el.innerHTML=`<p><a class="dl" href="${url}" download>Descargar PDF ↓</a></p>`;
  const pdf=await pdfjsLib.getDocument(url).promise,w=el.clientWidth*(devicePixelRatio||1);
  for(let n=1;n<=pdf.numPages;n++){ // ponytail: canvas only, texto no seleccionable; añadir textLayer si lo piden
    const pg=await pdf.getPage(n),c=document.createElement("canvas"),vp=pg.getViewport({scale:w/pg.getViewport({scale:1}).width});
    c.width=vp.width;c.height=vp.height;c.className="pdfpage";el.append(c);
    await pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
  }
}
