# Edición local y BBDD compartidas

Descomprime el paquete completo en tu equipo y abre `local.html` con Chrome, Edge o Brave. Conserva la carpeta `assets` junto al HTML. No publiques esta edición en una web ni incorpores Excel de clientes al repositorio de código.

## Primera carga

1. Comprueba en OneDrive que tus carpetas corporativas han terminado de sincronizar. Marca las fuentes necesarias como disponibles en el dispositivo si utilizáis archivos solo en línea.
2. En Panel de control, pulsa **Vincular BBDD** y selecciona `SL_SLAM_DPTO_GDC - General/Comités/BBDD`.
3. Pulsa **Vincular Control DNI** y selecciona `SL_SLAM_DPTO_GDC - General/Dia Dia GDC & Gestión Pasiva/Dia Dia`.
4. Revisa los candidatos. Elige el Maestro que corresponda: puede haber varias plantillas válidas. Confirma que sus históricos están expresados en EUR únicamente si lo has verificado.
5. Pulsa **Cargar selección**. Revisa las fechas de valoración y los tipos de cambio pendientes en el panel.

Se reconocen las hojas y las columnas, aunque cambie el nombre del archivo. Los tipos compatibles son universo/ranking, Maestro con pesos y precios, estados GDC y GICI, categorización, posiciones, saldos y Control DNI. El Control requiere su formato habitual de columnas y la hoja `Control DNI & TEST`. Los formatos desconocidos y los Excel temporales no se cargan. Solo se inspeccionan los archivos de primer nivel de las carpetas seleccionadas.

## Actualización y navegadores

Pulsa **Revisar cambios** cuando OneDrive haya terminado de sincronizar. Revisa la selección y pulsa **Cargar selección** para aplicar la nueva copia. No hay actualizaciones de datos en segundo plano ni escritura sobre los Excel originales.

Cuando el navegador permite vincular una carpeta, se solicita permiso de **lectura**. Si esa función está deshabilitada, utiliza la selección manual de carpeta o **Elegir archivos**; tendrás que volver a seleccionarlos para actualizar. No cambies las protecciones de Brave ni las políticas corporativas para activar esta función. Los permisos, selecciones y archivos cargados se mantienen en memoria durante esta sesión.

El identificador de la última carga y los hashes de cada archivo permiten comparar copias entre compañeros. No garantizan que OneDrive haya terminado ni que varios archivos representen la misma fecha financiera. Cada fuente conserva su fecha y sus controles de conciliación. El análisis no sustituye un cambio de divisa desconocido por 1:1.

Se validan los formatos antes de iniciar la carga. Si falla un importador, se muestra **Carga incompleta**, con el número de archivos aplicados. En ese caso revisa y vuelve a cargar antes de analizar. Las importaciones manuales posteriores también pueden modificar el análisis.

## Alcance de esta entrega

La edición local incluye las bibliotecas en el paquete y bloquea las conexiones de red desde la aplicación mediante CSP y guardas adicionales. Las consultas de mercado, Yahoo, FIGI y actualizaciones web no están disponibles: usa precios importados y tipos de cambio manuales. Los exportadores siguen trabajando localmente. Esto no controla el propio navegador, sus extensiones, el equipo, OneDrive ni las políticas de la empresa.

La aplicación no guarda las nuevas fuentes en localStorage o en una base de datos del navegador. Las parametrizaciones editadas siguen en memoria y se conservan mediante las exportaciones ya existentes. Esta entrega no publica cambios ni resuelve ediciones simultáneas de compañeros. La publicación de parametrizaciones, propuestas y versiones oficiales es una fase posterior.

## Desarrollo y distribución

Ejecuta `node scripts/package-local.cjs`. Genera `local-release` con una lista explícita de código, bibliotecas y documentación; no incorpora los Excel de origen. Distribuye esa carpeta completa. `local.html` y `local-release` son artefactos generados y no se versionan.

Las dependencias tienen versiones fijadas, licencias y hashes SHA-256 en `assets/vendor/local/manifest.json`. La construcción comprueba esos hashes. `scripts/vendor-local.cjs` solo se ejecuta para actualizar dependencias públicas, nunca durante el uso ni con documentos de clientes.

Pruebas: `node scripts/check-syntax.cjs`, `node --test --test-concurrency=1 tests/*.test.cjs` y `node tests/shared-data-browser.cjs` (requiere Playwright; `CHROME_PATH` permite elegir Chrome o Edge). Brave usa la misma alternativa manual comprobada, pero no se ha ejecutado Brave en este equipo porque no está instalado.
