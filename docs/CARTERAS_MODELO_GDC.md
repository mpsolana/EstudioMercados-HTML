# Carteras modelo GDC

## Entrada

- La hoja `Carteras Modelo` usa la primera fila como cabecera. A contiene la categoria generica, B las categorias Morningstar separadas por `;` y C en adelante una columna de peso por cartera modelo.
- Cada columna de pesos se interpreta como fraccion si suma cerca de 1, o como porcentaje en otro caso. La aplicacion muestra el total y no valida el tracking error si difiere de 100% en mas de 0,5 puntos.
- La hoja `bench categ` relaciona `ticker` del indice y `asset class` con cada categoria Morningstar. La hoja `bench` contiene fecha y una columna de precios por indice. La hoja `prices` puede incluir precios por ISIN. Se reutilizan las series del backtest individual cuando estan disponibles.
- El fondo propuesto se elige entre los cinco ISIN mejor scoreados de las categorias asociadas. El ISIN actual se introduce aparte; si falta en el universo, sus metricas y el ahorro TER quedan pendientes.

## Tracking error

El benchmark del modelo combina, con los pesos objetivo, el indice de la categoria Morningstar del fondo elegido en cada fila. El fondo y su indice utilizan cierres mensuales comunes y consecutivos. El tracking error es la desviacion estandar muestral de la diferencia de retornos mensuales de cartera e indice compuesto, multiplicada por raiz de 12. Se requieren al menos cuatro cierres mensuales comunes de todas las posiciones e indices. Se asume rebalanceo mensual y no se incluyen costes, impuestos ni conversion de divisas.

Si faltan fondos, indices, precios o un limite configurado, el informe y el Excel no afirman que el modelo cumple el limite. El estado queda como pendiente o sin validar. El usuario debe confirmar que fondos e indices estan en la misma divisa y que el tratamiento de distribuciones/ajustes es comparable antes de validar el limite de TE.

## Salidas

`Exportar Excel` descarga la seleccion de la sesion con ISIN actuales/propuestos, pesos, metricas y estado de TE. El informe PDF contiene pesos, calidad y TER ponderados, tabla actual/propuesta y comparativa de calidad y TER frente a peers. El ahorro TER solo se calcula para filas con ambos costes disponibles; no se convierte a euros sin AUM.

La calidad ponderada entre categorias es orientativa. El score tecnico de un fondo debe interpretarse principalmente frente a peers de su propia categoria.
