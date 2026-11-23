# TrabajoColaborativoFrontend

## Reportes de atención (HU-27 a HU-30)

Entra a **Reportes de atención** desde el menú con el rol activo de administrador,
coordinador o responsable de área (`/inicio/reportes-atencion`). La consulta permite
filtrar por fechas de creación UTC, campus, área, estado y prioridad. **Generar
reporte** aplica los filtros; **Exportar CSV** descarga todos los resultados de la
última consulta generada, incluyendo las páginas que no están visibles.

La vista muestra totales, distribución por área, promedios con su muestra y un
detalle paginado. En cada incidencia, **Atención recibida** muestra sus tiempos;
el autor puede enviar una evaluación de 1 a 5 con comentario opcional cuando la
incidencia esté cerrada. La evaluación solo se envía una vez.

`data/analytics-api.service.ts` concentra los contratos y llamadas HTTP. Las vistas
`analytics/` y `attention/` se encargan de la interacción; los permisos y las reglas
de cálculo se validan en el backend. La pantalla de reportes se carga bajo demanda.
Hay estados de carga, vacío y error, cancelación de consultas anteriores y bloqueo
de envíos duplicados. Los tiempos sin historial se presentan como «Sin datos».

Validación:

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.14.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
