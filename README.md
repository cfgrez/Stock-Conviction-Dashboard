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
package.json
.dev.vars.example
.gitignore
LICENSE
README.md
```

No debe existir `public/_worker.js`.

## Paso a paso completo

### 1. Subir a GitHub

```bash
cd stock-conviction-dashboard-workers-fixed
git init                       # si el repo aún no existe
git add -A
git commit -m "Stock conviction dashboard"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

Si ya tenías un repo, simplemente reemplaza el contenido por esta versión y haz `git push`.

### 2. Crear el Worker en Cloudflare (conectado a Git)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a Git repository**.
2. Elige tu repo de GitHub.
3. Configuración de build:

```text
Build command: (vacío)
Deploy command: npx wrangler deploy
Root directory: (vacío)
```

`wrangler.jsonc` es la fuente de verdad — no hace falta indicar manualmente un output directory.

### 3. Variables y secretos

En el Worker recién creado: **Settings → Variables and Secrets**:

```text
OPENAI_API_KEY = tu clave real   (marca "Encrypt")
OPENAI_MODEL   = gpt-5.6-terra   (opcional)
```

Guarda y vuelve a desplegar (o espera al próximo push, que redepliega solo).

### 4. Verificar

```text
https://TU-SUBDOMINIO.workers.dev/api/health   → { ok: true, openAIConfigured: true, ... }
```

Luego abre el dashboard y prueba un ticker.

## Variables y secretos

En el Worker, abre **Settings → Variables and Secrets** y agrega:

```text
OPENAI_API_KEY = tu clave real
OPENAI_MODEL = gpt-5.6-terra
```

`OPENAI_MODEL` es opcional (por defecto `gpt-5.6-terra`, buen balance calidad/costo para análisis financiero). Para tickers de bajo volumen o pruebas puedes usar `gpt-5.6-luna` (más barato); para casos que requieran el máximo razonamiento, `gpt-5.6-sol`.

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
