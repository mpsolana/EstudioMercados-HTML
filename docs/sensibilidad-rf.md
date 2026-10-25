# Sensibilidad de renta fija

La vista esta en Analisis Cartera > Analisis Inicial > Sensibilidad tipos. Su motor es
`assets/rate-sensitivity.js`; la interfaz y exportacion estan en
`assets/portfolio-workspace.js`.

## Datos y unidades

- Importe total y peso RF se expresan sobre la misma fecha y divisa base. El valor
  de RF se puede introducir directamente; la interfaz sincroniza peso e importe.
- Los movimientos de tipos y spreads se introducen en puntos basicos (100 pb = 1%).
- La duracion de tipos y la spread duration son entradas independientes. La base
  RF GDC/GICI solo aporta duracion modificada y YTM, nunca spread duration; esta
  ultima se deja pendiente hasta que el gestor la indique.
- En modo granular, "Cargar RF del origen" toma los pesos del Analisis Inicial,
  identifica RF por categorizacion o universo y hereda las metricas disponibles
  de la base RF. Se muestran coberturas completas; cualquier metrica ausente
  impide su media agregada. El Excel de origen no incorpora fecha de estas
  metricas: la procedencia se marca expresamente como fecha no registrada.
- Los cambios manuales y escenarios viven solo en la sesion. Para conservar
  resultados, descargue el Excel o PDF. No se modifica el libro subido al navegador.

## Calculo

Para cada escenario, con shocks expresados como fraccion decimal:

`impacto_RF = -D_tipos * shock_tipos - D_spread * shock_spread + carry`

`carry = YTM_anual * meses / 12`, solo si se activa. El impacto en la cartera es
`impacto_RF * peso_RF`; el importe monetario es ese resultado por el valor total.
Los valores por posicion se ponderan por su valor dentro de la manga RF. No se
redondea hasta la presentacion. Las pruebas de referencia estan en
`tests/rate-sensitivity.test.cjs` y el flujo visual en
`tests/master-load-browser.cjs`.

## Limites

Es una aproximacion lineal de primer orden, no una proyeccion de rentabilidad.
No modela convexidad, desplazamientos no paralelos, opciones, impagos, liquidez,
divisa, derivados ni gestion activa. La duracion modificada frente al rendimiento
propio puede diferir de la duracion frente a la curva libre de riesgo. La YTM no
garantiza el carry. Un shock amplio incrementa el error de esta aproximacion.
La opcion de cartera ajustada compara sensibilidades bajo el mismo escenario,
sin generar recomendaciones de inversion.

Referencia metodologica: [CFA Institute, Overview of Fixed-Income Portfolio
Management](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/overview-fixed-income-portfolio-management).
