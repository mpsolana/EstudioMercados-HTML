# Carga, Calidad e informes de origen

## Historicos largos

- Ventanas de retorno compuesto y correlacion calculadas con acumuladores, evitando volver a recorrer cada ventana.
- Drawdown de todas las ventanas mediante una cola de resumen ordenado, con coste lineal por plazo. Contrastado con el calculo directo.
- Eliminado un calculo duplicado de distribucion durante la importacion.
- Lectura de Excel de mas de 1 MB en un worker; respaldo local si el navegador no permite workers o no puede cargar la biblioteca.
- Progreso por fases y bloqueo temporal del resto de controles hasta finalizar el analisis y los graficos pendientes; liberacion tambien ante errores.
- Plotly reutiliza graficos existentes. Las lineas muy largas se simplifican visualmente conservando extremos de cada bloque y ambos extremos de la serie; los datos y calculos financieros completos no se recortan.
- Prueba sintetica: 6.000 fechas, 8 posiciones, 16 benchmarks, Excel de 6,8 MB; aproximadamente 3,4 segundos tras cargar la aplicacion en el equipo de pruebas. No constituye un tiempo garantizado para otros equipos, ficheros o proveedores.

## Calidad

- Presentacion de los scores mediante Calidad de 1 a 5 estrellas, sin alterar los calculos ni los criterios de seleccion.
- Intervalos sin solapamiento: [0,1), [1,2), [2,3), [3,4) y 4 exacto. No se redondea antes de clasificar. Valores ausentes o fuera de 0-4: sin clasificacion.
- La calidad ponderada se obtiene del score ponderado disponible, no del promedio de estrellas. Se mantiene la cobertura de datos.
- Metodologia accesible al equipo y obligatoria en los informes, incluso al desactivar otros apartados. Es una conversion interna del ranking importado, no una calificacion Morningstar ni una reconstruccion de la formula del proveedor.
- Los campos manuales y variaciones tecnicas conservan sus valores numericos. Las estrellas de las tablas PDF se dibujan como vectores para no depender de glifos de fuentes externas.

## Informe inicial sin propuestas

- Nuevo control: Incluir fondos propuestos en el informe, activado inicialmente.
- Al desactivarlo, el informe incluye solo posiciones originales, metricas, media de categoria y peers, segun los apartados seleccionados.
- Se omiten alternativas, ahorros, flujos y composiciones propuestas. No se exige una propuesta completa para generar el diagnostico de origen.
- No se modifica la propuesta guardada ni los datos de trabajo.

## Clases de otras categorias

- Se normalizan sufijos EURH y otras divisas con H/HDG/Hedged, antes de extraer la familia del nombre.
- Capa adicional independiente del nombre y de sufijos como EURH: busca en todas las categorias por AUM (tolerancia 2%), corroborado por gestora normalizada o tenure del gestor (tolerancia 0,1 anos, sin gestoras contradictorias). Las coincidencias aparecen en el desplegable compartido de clases candidatas.
- Se conserva la busqueda previa por familia e identificador. Tenure tambien permite investigar familias exactas cuando falta AUM; la antiguedad del fondo no se confunde con la del gestor.
- Un AUM incompatible o identificadores explicitos contradictorios no se ignoran. Nombre, gestora, AUM o tenure aislados no acreditan una clase equivalente.
- La busqueda ampliada propone candidatas para revision, sin extender automaticamente equivalencia economica ni aprobacion a divisas/coberturas distintas.
- Pendiente contrastar los dos ISIN reales mencionados por el usuario, cuando esten disponibles. Las pruebas actuales cubren casos sinteticos EURH y falsos positivos.

## Verificacion

- Pruebas unitarias de limites de estrellas, correlacion, retorno compuesto, drawdown, simplificacion visual y candidatos EURH.
- Prueba de navegador de carga larga, liberacion tras error, informe sin propuestas y metodologia obligatoria.
- Regresiones de cartera, propuestas, simulacion visual e informes y revision visual del PDF.

## Revision de cargas e informes (26 septiembre)

- La importacion del ranking espera al analisis de los ISIN de cartera. Los analisis automaticos iniciados desde la sincronizacion de cartera tambien se registran y esperan antes de cerrar la carga.
- La tabla de scoring se reconstruye una sola vez al finalizar, no despues de cada ISIN. El ranking se transforma en lotes de 250 filas, cediendo tiempo al navegador y mostrando avance.
- La actualizacion final de las vistas ocurre dentro del bloqueo de carga. El porcentaje no retrocede entre fases.
- Posiciones agregadas excluye ETF, exchange-traded funds y fondos cotizados detectados en tipo de producto, tipo de activo o nombre. Conserva el filtro previo de fondos/IIC. Importes y pesos se calculan despues de excluirlos; no se cambian las carteras individuales ni el universo.
- Los tres generadores de informes y la descarga PDF muestran progreso por fases y mantienen el bloqueo hasta terminar. El PDF tiene un limite de espera y libera el indicador ante errores. Los porcentajes representan etapas, no una estimacion de tiempo restante.
- Corregido un fallo previo en historicos sin periodos negativos: una fecha de peor caida ausente se representa con un guion y ya no interrumpe el analisis ni el informe individual.
- Nueva regresion de navegador: cartera individual de 20 posiciones con 6.000 fechas y benchmarks, seguida de ranking de 20.000 fondos; comprueba un unico render de scoring dentro de la carga, ausencia de errores, filtro de ETF, recalculo de pesos y progreso PDF.
