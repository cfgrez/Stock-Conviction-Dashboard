# Stock Conviction Dashboard — Cloudflare Pages (Advanced Mode)

Aplicación web para analizar una acción con tres filtros:

1. **Caso bajista:** tres riesgos materiales con evidencia y señales de confirmación.
2. **Conviction Score /100:** ROIC, FCF, deuda, ingresos, beneficios, precio y P/E.
3. **Catalizadores a 12 meses:** probabilidad, magnitud, timing y cuánto está en precio.

Regla final: **si falla 2 de 3, no se toca**.

## Por qué esta versión corrige el HTTP 404

La API está dentro de:

```text
public/_worker.js
```

Cloudflare Pages lo despliega en **Advanced Mode** junto con los archivos estáticos. Así no depende de que Cloudflare detecte una carpeta `/functions` fuera del directorio de salida.

Rutas disponibles:

```text
GET  /api/health
GET  /api/analyze
POST /api/analyze
```

Todas las demás rutas se sirven mediante `env.ASSETS.fetch(request)`.

## Estructura

```text
public/
  _worker.js       # API y enrutamiento del sitio
  index.html
  app.js
  styles.css
  _headers
  icon.svg
.dev.vars.example
.gitignore
README.md
LICENSE
```

> No debe existir una carpeta `functions/` en esta versión. Cuando hay un `_worker.js` en el directorio de salida, Cloudflare ignora `/functions`.

## Reemplazar el repositorio actual

Descomprime esta versión y sustituye por completo el contenido del repositorio. Confirma en GitHub que se vea este archivo:

```text
public/_worker.js
```

Luego:

```bash
git add -A
git commit -m "Fix API routing with Pages advanced mode"
git push
```

## Configuración de Cloudflare Pages

En **Settings → Builds & deployments**:

```text
Framework preset: None
Build command: exit 0
Build output directory: public
Root directory: vacío
```

En **Settings → Variables and Secrets**, para Production y Preview:

```text
OPENAI_API_KEY = tu clave real
OPENAI_MODEL = gpt-5.6-luna
```

`OPENAI_MODEL` es opcional; el valor predeterminado es `gpt-5.6-luna`.

Después ejecuta un despliegue nuevo con la caché de build eliminada.

## Prueba obligatoria antes de analizar

Abre en el navegador:

```text
https://TU-DOMINIO.pages.dev/api/health
```

Debe devolver un JSON parecido a:

```json
{
  "ok": true,
  "service": "Stock Conviction Dashboard API",
  "openAIConfigured": true,
  "model": "gpt-5.6-luna"
}
```

También puedes abrir:

```text
https://TU-DOMINIO.pages.dev/api/analyze
```

Debe mostrar la descripción de la API. Si cualquiera devuelve 404, revisa que `public/_worker.js` esté realmente en la rama y carpeta desplegadas.

## Diagnóstico rápido

- **`/api/health` devuelve 404:** `_worker.js` no fue incluido en el despliegue, el directorio de salida no es `public`, el repositorio tiene una carpeta adicional o Cloudflare está desplegando otra rama.
- **`openAIConfigured: false`:** falta agregar `OPENAI_API_KEY` al entorno correspondiente y volver a desplegar.
- **La API devuelve 401/429/502:** la Function sí está operativa; revisa clave, facturación, límites o el mensaje devuelto por OpenAI.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars
npx wrangler@latest pages dev public
```

No subas `.dev.vars` a GitHub.
