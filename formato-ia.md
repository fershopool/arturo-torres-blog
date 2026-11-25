# Formato para IA: texto a HTML

Cómo preparar un texto con una IA para subirlo en admin.html. Copia el prompt de abajo (o usa el botón «Copiar prompt para IA» del panel), pégalo en la IA y adjunta o pega el texto del autor. Luego pega el HTML resultante en el campo «HTML del texto», pulsa «Validar» y revisa la vista previa.

El prompt de esta página es el mismo que usa admin.js (constante PROMPT_IA). Si cambias uno, cambia el otro.

## Prompt

```text
Vas a convertir un texto académico en un fragmento HTML para publicarlo en la página de un autor. Te adjunto el PDF original del texto.

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
10. Como última línea, escribe el comentario <!-- imagenes: nombre1.png, nombre2.png --> con los nombres de todas las imágenes de la sección de anexos. Si no hay imágenes, escribe <!-- imagenes: ninguna -->.
```

## Después de la IA

1. Revisa que el HTML empiece por `<header>` (las comillas de bloque de código se quitan solas).
2. Adjunta las imágenes con los mismos nombres que aparecen en `<!-- imagenes: ... -->` y en los `src` de las figuras.
3. Si hay PDF, adjúntalo: se genera la miniatura de la página 1.
4. Pulsa «Validar». Los avisos no impiden publicar, pero conviene resolverlos antes.
