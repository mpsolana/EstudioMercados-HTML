# Simulacion visual, comparativas y clases candidatas

## Distribucion de cartera individual

- Se recuperan los deslizadores y campos de pesos, normalizacion, reparto igual y restauracion del original.
- La simulacion recalcula ventanas, escenarios y evolucion con los historicos, rebalanceo y costes de la cartera cargada; no modifica esa cartera.
- El informe recalcula siempre con los pesos originales. Al finalizar restaura la simulacion que estaba viendo el usuario. Los cambios de peso visuales no invalidan informes originales existentes.
- Se evitan etiquetas superpuestas cuando media, minimo y maximo quedan muy cerca; la tabla y el hover conservan los valores.

## Analisis inicial e informes

- Variacion score muestra la diferencia aritmetica de scores ponderados disponibles. Se advierte que comparar categorias o coberturas distintas es orientativo, no una mejora homogenea de rentabilidad/riesgo.
- Un solo elemento de leyenda agrupa los peers de las categorias presentes. Se mantienen medias separadas por categoria y la misma escala de burbujas para todos los fondos.
- Notas junto a la grafica identifican los datos ausentes de origen/propuesta; se conservan aunque se desactive el apartado de metodologia.
- En propuestas independientes no se atribuye ahorro ni variacion TER/score a parejas ficticias. Se conserva el ahorro agregado y se muestran los originales frente a sus peers y los propuestos de su categoria. Las categorias exclusivamente propuestas se muestran frente a sus propios peers.
- Concentracion por gestora/categoria se presenta en una sola grafica. En informes extensos se agrupan las exposiciones menores en Otros, conservando ambos totales y avisando del numero de grupos.

## Origen y clases

- Las posiciones agregadas permiten seleccionar otro origen de datos del universo y restaurarlo. El ISIN importado, patrimonio y peso se conservan; la fuente alternativa se identifica en pantalla, informe de posiciones y snapshot.
- Cambiar la fuente no cuenta como una sustitucion propuesta. Las sustituciones y el boton Sin cambio se evaluan frente a la fuente seleccionada.
- Selector de clases candidatas compartido en analisis inicial, scoring individual y posiciones agregadas, con nombre, ISIN, TER, score y categoria.
- La busqueda acepta un identificador de subfondo comun, o familia de nombre, gestora y AUM coincidentes (tolerancia 1%). La antiguedad del gestor, si existe, apoya nombres casi iguales, no sustituye la evidencia de familia.
- Puede mostrar candidatas de otra categoria, divisa o cobertura. No las acredita automaticamente como equivalentes o aprobadas. Se conserva la comprobacion estricta para las oportunidades de clase mas barata.

## Comprobaciones

- Pruebas unitarias de coincidencia y rechazo de falsos positivos.
- Pruebas de navegador de simulacion, informe con pesos originales, cambio/restauracion de origen, peers agrupados, propuesta independiente y concentracion en PDF.
- Datos sinteticos; revisar casos reales anonimizados antes de tomar decisiones sobre equivalencia y acceso comercial.
