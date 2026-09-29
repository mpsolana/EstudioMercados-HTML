# Interaccion de carteras y revision del informe agregado

## Rendimiento

- El selector de fondos extensos prepara sus opciones al abrirse. Mantiene la busqueda, paginacion y lista completa.
- Las categorias y el resultado de clases mas baratas se reutilizan mientras no cambien los datos que intervienen.
- La busqueda de clases candidatas crea un indice por AUM, identificador de subfondo y familia cuando falta AUM. Mantiene la validacion anterior de gestora, tenure, nombre y TER; solo reduce los registros examinados.
- En una prueba sintetica con 20.000 fondos y 12 posiciones, aplicar una sustitucion agregada bajo de unos 3,8 segundos a 0,11-0,13 segundos; en una propuesta inicial de diez filas, de unos 4,1 segundos a aproximadamente 1 segundo. Son tiempos de ese equipo y fichero de prueba, no garantias de latencia.

## Posiciones agregadas

- Datos de origen permite modificar score tecnico, TER, retornos, riesgos y caidas desde maximo. Los ajustes se muestran en el informe aun con la seccion opcional Metodologia desactivada.
- Tabla por ISIN con contenido mas grande y centrado, columna Aprobado eliminada y estrellas blancas sobre cuartil Q1 oscuro.
- Boton para llevar ISIN efectivos y pesos normalizados tras los cambios al scoring individual. No importa historicos de precios: esos datos requieren su propia carga.

## Informe

- Resumen agregado tras cambios, sin los recuentos de aprobados/no aprobados.
- Calidad acompaniada del score tecnico numerico, tambien para origen y propuesta en Impacto de los cambios.
- Valor relativo frente a peers con verde para mejor calidad o menor coste, rojo para peor calidad o mayor coste, y neutral cuando coincide con la media. La evaluacion conjunta solo se colorea cuando ambas dimensiones son favorables o desfavorables.
- Alfa historico verde si es positivo y rojo si es negativo en los periodos seleccionados y por ano natural.
- Cambio aplicado incluye ISIN y nombre del nuevo fondo.
- Las estrellas se dibujan en el PDF, incluidas las celdas de cuartil oscuro. El score tecnico va debajo y la tabla por ISIN comienza con su encabezado.
