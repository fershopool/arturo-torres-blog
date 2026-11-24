/* Disuasión de copia en la lectura. Límite: ningún sitio web puede impedir capturas
   del sistema ni garantizar que un PDF público no se descargue; esto frena lo casual. */
(function(){
  var css=document.createElement("style");
  css.textContent="body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}"+
    "input,textarea{-webkit-user-select:text;user-select:text}"+
    "img,canvas{-webkit-user-drag:none;pointer-events:auto}"+
    "body.oculto main,body.oculto .libro-nav{filter:blur(24px)}"+
    "@media print{body{display:none!important}}";
  document.head.appendChild(css);
  var ok=function(e){var t=e.target;return t&&t.closest&&t.closest("input,textarea");};
  ["contextmenu","copy","cut","dragstart","selectstart"].forEach(function(n){
    document.addEventListener(n,function(e){if(!ok(e))e.preventDefault();});
  });
  document.addEventListener("keydown",function(e){
    var k=(e.key||"").toLowerCase();
    if((e.ctrlKey||e.metaKey)&&"scpua".indexOf(k)>-1&&k.length===1&&!ok(e))e.preventDefault();
    if(k==="printscreen"){try{navigator.clipboard.writeText("");}catch(x){}}
  });
  document.addEventListener("keyup",function(e){
    if((e.key||"")==="PrintScreen"){try{navigator.clipboard.writeText("");}catch(x){}}
  });
  document.addEventListener("visibilitychange",function(){document.body.classList.toggle("oculto",document.hidden);});
})();
