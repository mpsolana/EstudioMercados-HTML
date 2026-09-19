# Integracion de fallbacks y revision de carteras

## Ramas y alcance

- `main`: integrado `codex/macro-dashboard-fallbacks` mediante el merge `e77679a` y publicado en origen.
- `codex/portfolio-audit-redesign`: trabajo posterior, separado de `main`.
- La rama de revision se publico a peticion del usuario. Los cambios posteriores siguen en esa rama, sin mezclarse con `main`.
- Base: auditoria de Analyzer y prueba de concepto revisadas con el usuario. No es una certificacion financiera ni una auditoria de seguridad exhaustiva.

## Cambios realizados

### Cuarta revision: comparativa inicial y estilo global

- Comparativa por metricas del universo trasladada a una pestana propia de Analisis Inicial: Datos, Analisis inicial, Comparativa universo e Informe. Conserva filtros, seleccion de fondos, ejes, tabla y datos compartidos. La comparativa historica sigue en Cartera individual.
- Hoja de estilo comun para Mercados, Valoraciones Relativas, Macro, Analisis Individual, Analisis Cartera y Ayuda: azules, grises, blancos y texto oscuro; tipografia, botones, formularios, tablas y cabeceras coherentes.
- Secciones mas planas, sin sombras decorativas y con separadores discretos. Desplegables conservan elevacion para distinguirlos del contenido. Cabeceras de informes con fondo claro y contraste legible.
- Se conservan colores semanticos de rentabilidad, alertas, cuartiles y series graficas; no se modifican calculos ni fuentes de datos.
- Navegacion inicial adaptable a movil, foco de teclado visible y estados activos conservados.
- Verificacion: 13 pruebas unitarias, sintaxis, regresion de navegador con los tres PDF y capturas de las seis secciones a 1440 y 390 px. Las capturas generales no consultan datos financieros en vivo; la regresion utiliza datos sinteticos y Excel de prueba.

### Tercera revision: navegacion del screener y agregados

- Screener tiene su propia pestana principal, junto a Analisis Inicial, Cartera individual y Posiciones agregadas. Se abre directamente en el screener y conserva acceso a Datos para cargar el universo.
- Retirado Screener de las herramientas internas de Posiciones agregadas. Se mantienen sus filtros y datos compartidos.
- Posiciones agregadas muestra solo Datos, Diagnostico e Informe. Propuesta queda exclusivamente en Analisis Inicial; un estado antiguo de propuesta agregada se reconduce a Diagnostico, sin mostrar dos accesos al mismo contenido.
- Pruebas de navegador ampliadas para verificar separacion de paneles, paso activo, carga de datos y ausencia del acceso duplicado, en escritorio y movil.

### Segunda revision: ocho ajustes solicitados

1. Ayuda al pie en Cartera individual: explica rebalanceo, coste por volumen (pb), tipo libre de riesgo, moneda base y la confirmacion de historicos propios. Los controles quedan vinculados a sus descripciones para lectores de pantalla.
2. Navegacion: contorno gris para el paso y herramienta activos; estado accesible `aria-current` / `aria-pressed` actualizado al cambiar de apartado.
3. Benchmark: la grafica de cartera usa la misma alineacion por periodos que el comparador de fondos, en lugar de exigir fechas exactas. No inventa precios en periodos ausentes ni compara historiales disjuntos.
4. Comparador masivo y Screener trasladados a Diagnostico de Posiciones agregadas, conservando su funcionalidad. El comparador sigue utilizando los historicos/benchmarks importados en la aplicacion.
5. Retirados los botones Word de los informes de cartera y gestora. Los tres informes descargan directamente un PDF A4, con texto seleccionable, tablas, graficas y paginacion, sin abrir el dialogo de impresion. Exportador cliente pdfmake 0.2.20 + html-to-pdfmake 2.5.33, cargado a demanda; no se envian datos de cartera a un servicio de conversion.
6. Boton renombrado a Cargar tickers Yahoo y analizar; nota que aclara que el Excel se analiza al importarlo y no requiere esa segunda carga.
7. Nuevo ambito Analisis Inicial para estudiar la cartera recibida del cliente y sus costes/sustituciones. Cartera individual queda para el comportamiento historico de la cartera construida. Informes y snapshots separados. En fondos sin match: editor de origen con proxy del universo y nombre propio, o datos manuales de nombre, categoria, moneda, score, TER, retornos, riesgos y drawdowns 1/3/5 anos. Los campos opcionales ausentes siguen siendo datos faltantes, no ceros. El proxy nunca acredita por si mismo una clase equivalente; la procedencia queda identificada en pantalla e informe. Se puede editar/restablecer el origen y reutilizar una cartera scoring importada.
8. Categorias: agrupacion normalizada de espacios, mayusculas y acentos. Dos posiciones del 15% de una categoria suman 30%. La composicion historica permite elegir Fondos o Categorias, conservando ambas vistas.

Verificacion de esta revision: 13 pruebas unitarias, comprobacion de sintaxis, pruebas de navegador de los tres ambitos, benchmark con cierres mensuales distintos, categoria 15+15, edicion de proxy y datos manuales, importacion Excel semanal y descarga efectiva de los tres PDF. Pruebas con datos sinteticos y vistas de escritorio/movil; falta aceptacion con los ficheros reales del usuario.

Los puntos siguientes documentan la primera revision. Donde se menciona impresion para exportar PDF, queda sustituida por la descarga directa descrita arriba.

### Calculos y calidad de datos

1. Propuestas automaticas: exigen score estrictamente superior dentro de la misma categoria. Si no hay mejora, se conserva el fondo de origen.
2. Seleccion manual: se conservan Aprobados, Universo y Universo completo, incluyendo fondos de otra categoria o con menor score y filas sin match.
3. Scores no comparables: no se publica una mejora agregada cuando falta score o hay cambios de categoria; se neutralizan las comparaciones relativas entre categorias.
4. Pesos: unidad explicita para scoring/propuesta (porcentaje, fraccion o importe), sin convertir automaticamente un 1 en 100 por fila. Validacion de negativos, limites y suma positiva.
5. Duplicados de activos: el normalizador del backtest agrupa sus pesos.
6. Aprobacion: solo por ISIN exacto. Los nombres parecidos no conceden aprobacion a otra clase o divisa.
7. Clases de menor TER: exigen identificador de subfondo, moneda y cobertura coincidentes. AUM y similitud de nombre ya no acreditan equivalencia.
8. Historicos incompletos: se bloquea el backtest si falta un activo; no se transforma su peso en efectivo ni se elimina renormalizando silenciosamente.
9. Validacion de series: precios positivos y finitos, fechas validas y ordenadas, sin duplicados.
10. Frecuencias: semanal (52) y diaria natural (365), ademas de bursatil (252), mensual, trimestral y anual. Ajustados horizontes rolling y agrupacion semanal de comparaciones.
11. CAGR: no se anualizan historiales inferiores a un ano.
12. Sharpe de cartera: media aritmetica del exceso de retorno y volatilidad muestral; tipo libre de riesgo anual configurable y convertido a la frecuencia de observacion.
13. Backtest: seleccion entre pesos constantes por observacion, rebalanceo mensual y comprar/mantener. Costes en puntos basicos sobre volumen negociado al rebalancear.
14. Divisa: moneda base configurable; conversion del historico Yahoo con tipos de cambio disponibles. Para precios propios se requiere confirmar que estan en moneda base.
15. Proveniencia Yahoo: se conserva moneda, fuente, fecha de consulta y uso de cierre ajustado o no ajustado. Se avisa si la cartera usa cierres sin ajuste.
16. Cobertura TER: visible en propuesta y trazabilidad. Se mantiene bloqueado el ahorro monetario total cuando faltan TER en origen o propuesta.
17. Flujos: la importacion de evolucion real rechaza flujos externos declarados posteriores al inicio, en lugar de interpretar patrimonio bruto como retorno.
18. Hipotesis modificadas: aviso de backtest desactualizado y bloqueo del informe individual hasta recargar/importar la cartera.

### Organizacion y experiencia

19. Ambitos separados: Cartera individual y Posiciones agregadas; el agregado no se presenta como backtest consolidado.
20. Flujo de cuatro pasos: Datos, Diagnostico, Propuesta e Informe.
21. Cargas reunidas en Datos, con visibilidad segun ambito. Universo y aprobados siguen siendo recursos compartidos.
22. Herramientas especializadas conservadas en Diagnostico: evolucion/riesgo, scoring, distribucion, comparativa de fondos, comparador masivo y screener.
23. Propuesta individual separada de las graficas del comparador de fondos.
24. Estado de fuentes, contexto, revision y cobertura visibles; acciones manuales compactas con nombres accesibles y foco visible.
25. Busqueda sobre todos los candidatos antes de paginar, 40 opciones por pagina y contador, sin miles de nodos por selector ni corte oculto a 120 resultados.
26. Ajustes de movil en pasos, campos y acciones del constructor; estilo mas plano con blanco, gris y azul.

### Informes

27. Plantilla compartida de presentacion: blanco dominante, titulos azules, texto gris, lineas finas y menos recuadros anidados.
28. Mayor legibilidad de tablas y encabezados repetidos para impresion. Las tablas planas de mas de ocho columnas se dividen, repitiendo las dos columnas identificadoras.
29. Vista previa aislada en iframe, para que los estilos del documento no alteren la aplicacion.
30. PDF mediante impresion del navegador con texto seleccionable, en sustitucion de la captura rasterizada de estos tres informes. El usuario puede elegir Guardar como PDF.
31. Exportacion PDF regenerada con los datos actuales, sin reutilizar un informe antiguo.
32. Opciones de graficos, detalle de sustituciones y marca Borrador/Final. La marca Final es editorial, no una firma ni certificacion.
33. Identificador, revision, fecha, version de motor, cobertura e hipotesis en el documento.
34. Snapshot JSON descargable con datos, propuestas, resultados del agregado, parametros y procedencia. Se invalida al modificar datos; si cambian durante la generacion se descarta ese informe.
35. Texto metodologico actualizado: identidad de clases, rebalanceo, Sharpe y alcance del ahorro TER.

### Ingenieria, datos y rendimiento

36. Extraidos modulos de nucleo financiero, selector, proveedor de precios, simulacion, presentacion de informes y espacio de carteras.
37. Eliminadas declaraciones duplicadas de funciones y anadida comprobacion automatica de sintaxis/duplicados.
38. Descarga Yahoo: backend propio primero, fallback directo secuencial; retiradas las carreras simultaneas contra proxies publicos de terceros.
39. Limite de cuatro consultas concurrentes, deduplicacion de consultas pendientes y cache acotada con caducidad de 15 minutos.
40. Timeouts con AbortController en cliente y backend.
41. Yahoo, OpenFIGI y FRED: validacion de metodo, origen y parametros; validacion de tamano/lotes de OpenFIGI y limites basicos de peticiones por instancia.
42. FRED usa la clave del entorno servidor, no una clave aportada por la URL del navegador.
43. Simulaciones reproducibles con semilla, ejecutadas en Worker; fallback cooperativo si no se puede crear el Worker.
44. Modelo lognormal y bootstrap circular por bloques de cinco observaciones; escenarios opcionales de caida inicial del 10%, 20% o 35%. Son escenarios hipoteticos, no probabilidades incondicionales ni predicciones.
45. Pruebas de regresion del nucleo, simulacion y validacion de APIs; prueba de navegador para flujo, busqueda completa, importacion Excel semanal, informe de propuesta e informe individual.

## Verificacion

- `node --test tests/*.test.cjs`: pruebas unitarias sin llamadas a proveedores externos.
- `node scripts/check-syntax.cjs`: sintaxis del HTML y modulos; deteccion de funciones duplicadas.
- `node tests/browser.cjs`: requiere Playwright y Chromium. Usa las librerias CDN de la aplicacion, datos sinteticos y no consulta carteras reales.
- La prueba visual puede escribir sus PNG/PDF fuera del repositorio mediante `BROWSER_OUTPUT_DIR`.
- Probados escritorio 1440x1000 y movil 390x844, sin errores JavaScript no capturados.
- La importacion de prueba conserva 1%/99%, detecta frecuencia semanal, carga 60 observaciones y detecta hipotesis modificadas.

## Limites y trabajo que NO se da por terminado

- Sigue siendo una extraccion incremental: el HTML conserva funciones y estado global. No se ha migrado todo a TypeScript ni a un framework nuevo.
- No se ha sustituido toda la cadena CDN/Tailwind por una compilacion local con lockfile ni realizado un inventario completo de vulnerabilidades/licencias. Las pruebas de navegador requieren conexion para esas bibliotecas.
- No hay autenticacion nueva, almacenamiento persistente de expedientes ni limitador distribuido. El control de abuso anadido es por instancia; necesita refuerzo de plataforma en produccion.
- No se ha desarrollado una base de equivalencias confirmadas ni validacion de minimo de entrada, elegibilidad, fiscalidad o liquidez de las clases. Sin identificadores fiables no se acredita equivalencia.
- La conversion de moneda cubre la construccion de cartera Yahoo. No se garantiza homogeneidad monetaria de todas las comparaciones/benchmarks heredados ni ajuste por flujos no declarados.
- No se reconstruye TWR a partir de movimientos ni XIRR. La evolucion real debe ser un NAV ajustado por flujos. No se aplica una anualizacion irregular sofisticada ni un calendario por mercado.
- Los costes de rebalanceo no incluyen suscripcion, reembolso, impuestos ni la inversion inicial. El TER no se descuenta otra vez de NAV historicos, evitando doble contabilizacion.
- Los snapshots se guardan en memoria y se descargan; no hay registro firmado, hash de ficheros ni restauracion completa de expedientes. No son una certificacion de procedencia.
- Las tablas complejas con celdas combinadas no se dividen automaticamente. Falta validacion editorial con informes reales extensos y anonimizados, especialmente los consolidados.
- No se han probado credenciales ni proveedores de produccion, todas las modalidades de importacion ni todos los navegadores. La bateria con datos sinteticos no sustituye esa aceptacion funcional.
- El agregado conserva sus capacidades actuales de sustitucion y analisis comercial, ahora en un ambito separado. No se ha inventado un motor nuevo de campañas por cliente ni un backtest de agregados.

## Como revisar

1. Abrir `index.html` en esta rama y entrar en Analisis Cartera. El HTML local sirve para importaciones y revision; los endpoints `/api` requieren el alojamiento de la aplicacion.
2. Revisar con datos anonimizados los dos ambitos, las sustituciones y los tres informes antes de publicar la rama.
3. Revisar el diff frente a `main`. Los nuevos cambios no modifican el `main` ya integrado.
