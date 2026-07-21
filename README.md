# Stock Conviction Dashboard — Cloudflare Workers

Dashboard bursátil con tres filtros:

1. Caso bajista.
2. Conviction Score sobre 100.
3. Catalizadores alcistas a 12 meses.

La aplicación usa un **Cloudflare Worker con Static Assets**. El frontend está en `public/` y la API segura en `src/index.js`.

## Estructura correcta

```text
public/
  _headers
  app.js
  icon.svg
  index.html
  styles.css
src/
  index.js
wrangler.jsonc
.dev.vars.example
.gitignore
LICENSE
README.md
```

No debe existir `public/_worker.js`.

## GitHub

Reemplaza el contenido del repositorio por esta versión y sube los cambios:

```bash
git add -A
git commit -m "Fix Worker entry point and static assets"
git push
```

## Cloudflare Workers Builds

El proyecto está preparado para el flujo que ejecuta:

```text
npx wrangler deploy
```

Configuración recomendada:

```text
Build command: vacío
Deploy command: npx wrangler deploy
Root directory: vacío
```

`wrangler.jsonc` es la fuente de verdad. No necesitas indicar manualmente un output directory en el comando de despliegue.

## Variables y secretos

En el Worker, abre **Settings → Variables and Secrets** y agrega:

```text
OPENAI_API_KEY = tu clave real
OPENAI_MODEL = gpt-5.6-luna
```

`OPENAI_MODEL` es opcional.

## Pruebas

Después del despliegue abre:

```text
https://TU-SUBDOMINIO.workers.dev/api/health
```

Debe devolver JSON con `ok: true`.

Luego abre:

```text
https://TU-SUBDOMINIO.workers.dev/api/analyze
```

Debe indicar que la ruta acepta `POST`.

Finalmente prueba un ticker desde el dashboard.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars
npx wrangler@latest dev
```

No subas `.dev.vars` a GitHub.
