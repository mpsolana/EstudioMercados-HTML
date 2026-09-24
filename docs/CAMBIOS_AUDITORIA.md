# Integracion de fallbacks y revision de carteras

## Ramas y alcance

- `main`: integrado `codex/macro-dashboard-fallbacks` mediante el merge `e77679a` y publicado en origen.
- `codex/portfolio-audit-redesign`: trabajo posterior, separado de `main`.
- La rama de revision se publico a peticion del usuario. Los cambios posteriores siguen en esa rama, sin mezclarse con `main`.
- Base: auditoria de Analyzer y prueba de concepto revisadas con el usuario. No es una certificacion financiera ni una auditoria de seguridad exhaustiva.

## Cambios realizados

### Duodecima revision: coherencia de rentabilidades, cobertura y peers

- Corregido el rango max/media/min del backtest: la preparacion anterior reutilizaba retornos nativos de los activos como si fueran mensuales, reconstruyendo ademas una cartera de pesos constantes. Ahora usa la serie real `portfolioData`, con su frecuencia, rebalanceo y costes ya incorporados.
- Motor compartido para rango, estadisticas y serie movil. Rentabilidad de cada ventana = precio final / inicial - 1; desde un ano se anualiza cada ventana con periodos por ano / longitud antes de tomar su media aritmetica. La media no es el CAGR del historico completo ni la anualizacion de una media acumulada. Ventanas completas, mismo numero de muestras, sin ceros inventados para plazos sin historico.
- Los escenarios externos de distribucion de activos conservan su analisis mensual independiente. Boton para volver al backtest; pesos de ese backtest no editables desde el escenario para evitar simulaciones que aparenten ser la misma cartera. Se conserva el umbral de probabilidad elegido.
- Propuesta independiente: TER y score se calculan por separado para cada cartera, ponderando su peso con datos y mostrando cobertura. Un problema en origen no vacia los indicadores validos del destino. Score orientativo entre categorias; no se presenta delta como comparable si cambian.
- Cargar propuesta sincroniza el origen escrito y resuelve ISIN previamente pendientes cuando el universo ya existe. Se conservan origenes sin match para el informe y Sankey sin inventar metricas; sin cobertura completa de TER en ambos lados no se estima ahorro total. Los pesos deben sumar 100% y los errores indican la suma y la cartera afectada. Selector explicito porcentaje/fraccion para cargar destino.
- Tabla TER/score frente a peers en agregadas y bloque opcional en su PDF: ISIN, nombre, categoria, metricas efectivas, medias, diferencias, muestra y lectura relativa. Media simple de otros ISIN de la misma categoria con ambas metricas disponibles, sin duplicados ni el propio fondo. Muestra reducida si hay menos de tres peers. No se divide score por TER ni se formula recomendacion de inversion.
- Pruebas: 45 unitarias, coherencia numerica en cinco frecuencias de navegador, origen sin match, pesos incompletos, carga fraccionaria, cobertura e informe, peers con TER manual y regresiones de las funciones anteriores. Datos sinteticos, no certificacion de todos los ficheros de clientes.

### Undecima revision: propuesta independiente e informes

- Analisis Inicial conserva Sustitucion por fondo y anade Cartera propuesta independiente. Carga directa ISIN;peso porcentual, busqueda en todo el universo, altas/bajas, normalizacion y edicion de peso, TER y score. Cambiar de modo conserva ambas selecciones; el origen no se altera.
- Cada cartera debe sumar 100%. Los ISIN repetidos de la carga se agrupan; los desconocidos bloquean la carga completa sin sobrescribir la anterior. Se mantiene el AUM total. No se simulan aportaciones ni retiradas.
- Asignacion ilustrativa para los graficos existentes: retener primero fondos comunes, luego categoria y finalmente remanente. Los flujos conservan los pesos de origen y destino; no representan instrucciones de traspaso. El informe distingue las composiciones reales de esta asignacion.
- Peers de ambas categorias en comparaciones cruzadas, con una misma escala de tamano para todos los fondos. Valores ausentes usan tamano neutro; media de categoria sigue siendo referencia fija. Se conserva el muestreo declarado de hasta 1.000 peers por categoria.
- Leyenda explicita de cuartiles, grafica y detalle agrupados, menor altura para comparativas individuales. Los informes individuales con tabla extensa de scoring pasan a A4 horizontal y mantienen todas las columnas, sin division horizontal.
- Agregadas: universo completo sin filtro de categoria/score, TER efectivo manual con herencia del dato existente y boton Mantener fondo actual. El informe incluye Sin cambio confirmado, TER manual y sustituciones; cambiar de fondo restablece el TER heredado sin modificar el universo.
- Asset Class: escala secuencial gris/azul ligada a la metrica del eje Y, incluido su titulo.
- Verificacion: 36 pruebas unitarias; recorrido de navegador de la propuesta independiente, peers, decisiones agregadas, controles de screener y PDF. Pruebas de escritorio y movil con datos sinteticos. No se modifica drawdown ni se anaden benchmarks.

### Decima revision: graficos de decision

- Analisis Inicial > Propuesta: cascada del ahorro TER anual por sustitucion, comparacion de puntos origen/propuesta para TER y score, y concentracion por gestora/categoria. Todos se recalculan al cambiar las posiciones o el AUM.
- Cascada: incluye encarecimientos en rojo y ahorro en verde. Si faltan TER, declara cobertura y subtotal conocido; no trata los datos ausentes como cero. Carteras largas agrupan las aportaciones menores en Resto sin perder el total.
- Score: solo se conectan categorias comparables. No se inventan valores faltantes. El informe pagina la comparacion en grupos de 12 posiciones y la concentracion en grupos de 10, conservando los porcentajes del conjunto.
- Posiciones Agregadas: concentracion ponderada por contravalor real y mapa de oportunidades con el ahorro potencial por clase de menor TER. Solo usa importes completos; clientes/cuentas se representan por area cuando sus identificadores son completos, y con tamano uniforme si no lo son. Los recuentos no son sumables entre fondos.
- Mapa comercial rotulado Uso interno y desactivado por defecto en el informe. En PDF se incluye una tabla numerada para identificar las burbujas. No implica sustitucion automatica ni confirma accesibilidad comercial de clases probables.
- Casillas independientes para los nuevos graficos; el interruptor global de graficos tambien se respeta. El informe agregado conserva A4 horizontal y el inicial paginas amplias para graficas.
- La grafica existente de caidas desde maximos no se modifica ni se duplica; no se anade comparacion con benchmark.
- Pruebas: 32 casos unitarios, nuevo recorrido escritorio/movil y PDF, controles de cobertura, omision de graficos y regresion de los flujos anteriores.

### Novena revision: flujos de categorias

- Sankey en Analisis Inicial > Propuesta: categorias de origen y destino, grosor proporcional al AUM de cartera por peso, agrupacion de flujos repetidos y color compartido por categoria en ambos lados.
- Conserva posiciones sin cambio de categoria y fondos sin identificar, agrupados como Sin categoria. No usa el patrimonio del fondo ni normaliza pesos de forma silenciosa; solicita AUM positivo y pesos al 100%.
- Detalle interactivo con importe, porcentaje y fondos implicados. Actualizacion al editar la cartera o el AUM, y visualizacion movil con desplazamiento horizontal contenido.
- Casilla independiente Flujos de categorias (AUM) en el informe inicial, exportada en pagina de grafica grande. Pruebas de conservacion de capital, agrupacion, escritorio/movil, hover y PDF opcional.

### Octava revision: maquetacion de informes

- Comparativas del informe inicial al ancho de pagina, empezando en pagina nueva, con lienzo mas alto, leyenda inferior y etiquetas ampliadas. El detalle numerico de cada sustitucion queda separado de su grafica.
- Las tablas de oportunidades de clases solo incluyen posiciones con una alternativa de menor TER; si no existe ninguna, se muestra una frase de resumen sin filas por ISIN. No se eliminan posiciones de las tablas generales de cartera.
- Informe agregado en A4 horizontal, sin fragmentacion por columnas. Las tablas de posiciones por ISIN y Santalucia conservan sus 12 y 11 columnas, con anchos proporcionales, mas espacio para fondo/categoria, cabecera repetida y filas no partidas.
- Validacion automatizada de ausencia de fragmentos, orientacion horizontal, anchos de columnas y filtrado de oportunidades; PDF renderizado para comprobacion visual.

### Septima revision: clases comparables e informes personalizados

- Detector compartido en analisis inicial, scoring individual y posiciones agregadas. Conserva identificadores explicitos y anade candidatos por nombre base sin sufijo de clase, misma entidad/categoria y AUM con tolerancia relativa del 1%. Rechaza conflictos de identificador, divisa y cobertura; las coincidencias inferidas se rotulan como probables, no como equivalencias certificadas.
- Texto comercial uniforme: "No se han identificado clases mas baratas en el universo cargado". Las alternativas muestran nombre, ISIN, TER y diferencia en puntos porcentuales; no se afirma ser la clase mas barata de todo el mercado.
- Opcion global, desactivada inicialmente, para extender aprobacion a clases identificadas de la misma familia. Etiquetas distintas para aprobado por ISIN y por familia; se aplica a las alternativas de los tres flujos y queda registrada en el snapshot.
- Tablas con tipografia, encabezados "Clases y alternativas", avisos y acciones comunes; se conservan columnas propias de cada ambito.
- Graficas del informe inicial recuperan peer group y media por categoria, origen y propuesta, con nombre e ISIN. Ejes configurables, seleccion sin duplicados identicos y colores de rol estables. La media usa todos los registros validos; nubes de mas de 1000 puntos se muestrean y se indica en la leyenda.
- Ajustes manuales, metodologia y procedencia se pueden incluir u omitir en el informe inicial. La configuracion completa permanece en el snapshot interno.
- Informe agregado configurable por resumen, impacto TER/score, clases, posiciones, cambios, exposicion, Santalucia, comparativas, metodologia y fuentes. No se generan apartados excluidos. Periodos corregidos a "año" y "años" en la interfaz.
- Validacion: 27 pruebas unitarias, regresion de navegador y PDF, controles de omision de apartados, familias aprobadas optativas y comparacion con peer groups. Sin cambios en main ni reorganizacion de historicos.

### Sexta revision: edicion, informes y rendimiento

- Historicos: reorganizacion aplazada expresamente; se mantienen las cargas y la biblioteca actuales, sin nuevas bases de datos ni persistencia.
- Analisis Inicial: editar origen en todas las filas, anadir/eliminar posiciones, editar pesos y normalizar con una accion explicita. Identificador estable por fila; los ISIN repetidos conservan ajustes independientes. La entrada por texto y la tabla se sincronizan, y recalcular conserva las sustituciones.
- TER y score editables en origen y propuesta, con marca Manual y restablecimiento por campo. Los registros compartidos del universo/aprobados no se modifican. Las posiciones incompletas o los pesos que no suman 100% bloquean el informe hasta su correccion.
- Clases equivalentes: criterio unico por identificador de fondo, divisa y cobertura. Diferencia entre menor TER identificado, alternativa mas barata y datos insuficientes. Se distinguen universo y aprobadas, con acciones de eleccion voluntaria en los tres flujos. Los proxies no acreditan equivalencia y se advierte de que falta verificar acceso comercial.
- Informe inicial: controles independientes para posiciones, cambios, clases, detalle de metricas, ahorro, comparacion global y graficas por sustitucion. Los bloques desactivados no se generan. Ejes X/Y configurables, presets riesgo 5A/retorno 5A y TER/score, y tamano de burbuja fijo o por metrica. Metodologia, cobertura y procedencia permanecen visibles. Configuracion y ajustes incluidos en trazabilidad JSON.
- Informe agregado: YTD inicial, 1/3/5 anos, historico completo o fechas personalizadas. Periodo aplicado a graficas y tablas, con fecha de referencia comun basada en benchmarks y sin cambiar la frecuencia de calculo. El ultimo precio anterior al periodo sirve como base cuando esta disponible.
- Tabla agregada Origen/Propuesta/Variacion para TER y score ponderados sobre las mismas posiciones con datos en ambos lados. Cobertura explicita; el score excluye del diferencial cambios entre categorias, y su media entre categorias se identifica como orientativa.
- Screener: Fondos y Asset class separados, pagina inicial de 100 filas y opciones 250/500/1000. Filtros sobre todo el universo leidos una vez, resultados cacheados por archivo/filtros y debounce de 250 ms. Nube bajo demanda, limite independiente de 100/500/1000/5000/20000 puntos y muestra determinista declarada; WebGL por encima de 1500 puntos.
- Asset class: lectura de valores y formatos Excel, normalizacion a puntos porcentuales y previsualizacion con selector por grupos de metricas para celdas sin unidad. 0,06 decimal y 6% se muestran como 6%; AUM y numero de fondos no se escalan.
- Pruebas: 25 casos unitarios, suite de regresion con los tres PDF y nueva prueba integral con 20000 fondos, edicion de duplicados, restablecimiento, configuracion de PDF, importacion XLSX y vistas movil/escritorio. Entrada del screener medida en 235 ms en una ejecucion local; no constituye un SLA ni prueba de disponibilidad de proveedores en vivo.

### Quinta revision: colores financieros en tablas y graficas

- Motor visual compartido `assets/financial-visuals.js`: todas las graficas Plotly del programa pasan por el mismo adaptador, incluidas las generadas para informes. No cambia series, calculos ni fuentes.
- Serie unica azul oscuro; dos series azul y gris. Comparativas amplias con paleta profesional ampliada y trazos diferenciados cuando se repiten colores; composiciones con tonos adicionales para mas de doce posiciones.
- Etiquetas finales, leyendas y anotaciones coherentes con las series. Tablas macro usan el mismo orden de colores que las curvas. Se conservan bandas de confianza, transparencias, simbolos y escalas numericas de burbujas.
- Barras de rentabilidad mensual, semanal, trimestral, anual y comparaciones por horizonte/regimen: verde positivo, rojo negativo y gris cero/sin dato. Barras agrupadas anaden patrones para distinguir series sin perder el signo. Las distribuciones de frecuencias no se colorean como si fueran ganancias.
- Mapas de rentabilidad centrados en cero, rojo/blanco/verde; correlaciones con rango fijo -1/+1, gris/blanco/azul. Drawdown en rojo. Escalas de score en azul, sin implicar rentabilidad.
- Tablas: cuatro cuartiles distinguibles de azul oscuro a gris claro; leyendas actualizadas. El cuartil no se confunde con el signo de una rentabilidad. Positivos/negativos con tonos sobrios comunes, tambien en PDF.
- Eliminado el rojo decorativo del ano actual en el histograma de distribucion; sigue destacado en negrita. Minimos/maximos de la tabla de retornos se colorean por su signo real.
- Verificacion: 20 pruebas unitarias, sintaxis, regresion de carteras y tres descargas PDF, y prueba visual con datos sinteticos de ocho tipos de grafica y cuartiles a 1440/390 px. No se verifica disponibilidad de proveedores financieros en vivo en estas pruebas.

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
