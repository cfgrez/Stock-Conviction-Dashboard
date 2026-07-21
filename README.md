# Stock Conviction Dashboard — Cloudflare Workers + Gemini

Dashboard bursátil con tres filtros:

1. Caso bajista.
2. Conviction Score sobre 100.
3. Catalizadores alcistas a 12 meses.

La aplicación usa un **Cloudflare Worker con Static Assets**. El frontend está en `public/` y la API segura en `src/index.js`. El análisis lo genera **Google Gemini** (free tier de Google AI Studio, sin tarjeta de crédito) usando dos llamadas:

1. **Investigación** (`gemini-2.5-flash` + Grounding with Google Search): busca en la web y redacta los hallazgos.
2. **Estructuración** (`gemini-2.5-flash` + salida JSON con schema): convierte esos hallazgos al JSON exacto que usa el dashboard.

Se hace en dos pasos porque Gemini no combina de forma confiable la búsqueda web con salida JSON estructurada en una sola llamada.

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

### 1. Consigue tu clave de Gemini (gratis)

1. Entra a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) con tu cuenta de Google.
2. **Create API key** → elige o crea un proyecto → copia la clave.
3. No necesitas agregar tarjeta de crédito: el free tier de `gemini-2.5-flash` da varios cientos de requests/día, suficiente para uso personal.

### 2. Subir a GitHub

```bash
cd stock-conviction-dashboard-workers-fixed
git init                       # si el repo aún no existe
git add -A
git commit -m "Stock conviction dashboard (Gemini)"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

Si ya tenías un repo, reemplaza el contenido por esta versión y haz `git push`.

### 3. Crear el Worker en Cloudflare (conectado a Git)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a Git repository**.
2. Elige tu repo de GitHub.
3. Configuración de build:

```text
Build command: (vacío)
Deploy command: npx wrangler deploy
Root directory: (vacío)
```

`wrangler.jsonc` es la fuente de verdad — no hace falta indicar manualmente un output directory.

### 4. Variables y secretos

En el Worker recién creado: **Settings → Variables and Secrets → Add**:

```text
Type:  Secret
Name:  GEMINI_API_KEY
Value: tu clave de Google AI Studio
```

Haz clic en **Deploy** (no solo "Save") para que se aplique de inmediato. Confirma que la variable quede listada en esa misma pantalla.

### 5. Verificar

Abre:

```text
https://TU-SUBDOMINIO.workers.dev/api/health
```

Debe devolver algo como:

```json
{"ok":true,"service":"Stock Conviction Dashboard API","provider":"Google Gemini","geminiConfigured":true,...}
```

Si `geminiConfigured` es `false`, la variable no se guardó — repite el paso 4 y revisa que el nombre sea exactamente `GEMINI_API_KEY`.

Luego abre el dashboard y prueba un ticker (ej. IBM, NVDA, AAPL). La primera consulta de un ticker tarda más (investiga + estructura); las siguientes usan caché de 6 horas.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars
# edita .dev.vars y pega tu GEMINI_API_KEY real
npx wrangler@latest dev
```

No subas `.dev.vars` a GitHub (ya está en `.gitignore`).

## Notas de costo

`gemini-2.5-flash` tiene free tier real (sin tarjeta). Si algún día superas la cuota diaria gratuita, Google devolverá un error 429 y el dashboard lo mostrará como "análisis excedió el tiempo disponible / límite" — no se te cobrará nada a menos que actives explícitamente facturación en el proyecto de Google Cloud asociado.
