# Panel de control patrimonial

## Fuentes y conciliación

- **Posiciones**: se cargan desde la casilla existente de Posiciones agregadas. El panel conserva también acciones, ETF, renta fija y planes, aunque el scoring agregado siga filtrando su propio universo. Usa `INVERSIS ACCOUNT NUMBER` para separar cuentas, `ACCOUNT` para cruzar con `CUENTA (Inversis)` del control y `DIV INSTITUTION COUNTER VALUE` como contravalor EUR.
- Cada cuenta/ISIN se netea antes de calcular AUM. Las filas compensadas `INMOVILIZADO`/`CONTADO` no cuentan dos veces; saldos netos nulos o negativos no forman parte de una cartera larga. Importes ausentes impiden validar límites.
- **Control GDC DNI**: se importa localmente la hoja `Control DNI & TEST`. Solo se retienen cuenta, código, nombre, organización, perfil, efectivo si está informado, AUM reportado, presencia y vencimiento de documentos, vigencias y fecha de cumpleaños. No se retienen números de DNI, teléfono, email ni dirección. Si el cruce no es único, queda pendiente.
- **Categorización**: hoja `Categorización` con columnas `ISIN`, `Categoría genérica`, `Tipo` (`RV`, `RF`, `Otros`). El panel avisa de ISIN sin categoría válida. Las sugerencias automáticas solo se ofrecen cuando el ranking y el mapeo GDC/GICI llevan a una única categoría exacta; el usuario debe aceptarlas.

## Límite de renta variable

`RV % = contravalor neto clasificado como RV / (contravalor neto invertido + efectivo confirmado) × 100`.

`Posición en banda % = (RV % − mínimo del perfil) / (máximo − mínimo) × 100`.

Se usan las bandas de perfil ya definidas en GDC/GICI. La posición en banda puede ser menor que 0 o mayor que 100 para hacer visible una infracción. El estado es **sin verificar** si falta el cruce de cliente, perfil, efectivo confirmado, contravalor o categorización completa. Una RV calculada sin efectivo se muestra solo como orientación sobre el capital invertido. El AUM del control se enseña aparte para conciliación; no se mezcla automáticamente con posiciones de otra fecha.

## Modelos y vigencias

- La vista por cliente compara pesos por categoría genérica con el benchmark fijo y la cartera modelo GDC/GICI del perfil cargado en la sesión. Si falta el comité correspondiente, la comparación se marca pendiente.
- DNI: se utiliza la fecha de caducidad de cada interviniente, no el estado precalculado en Excel. KYC: fecha del último KYC más meses de vigencia. Idoneidad y ESG: fechas de validez de la hoja. Se consideran próximos los vencimientos a 30 días o menos. Fechas ausentes quedan pendientes.
- La categorización editada se descarga en un Excel nuevo para reutilizarla. Una página web no puede leer o sobrescribir automáticamente una ruta fija de SharePoint sin una integración autorizada y permisos de acceso. La carga del control y el efectivo manual viven solo en memoria de la sesión.

## Antes de usar datos reales en producción

El repositorio y la vista previa no contienen ficheros de clientes. El procesamiento local no sustituye un despliegue corporativo con acceso controlado, revisión de dependencias externas y política de retención. No se debe considerar la vista previa pública como entorno aprobado para datos de DNI/KYC.
