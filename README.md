# Stock Conviction Dashboard

Aplicación web para analizar una acción mediante tres filtros:

1. **Caso bajista:** tres riesgos materiales con evidencia y señales de confirmación.
2. **Conviction Score /100:** ROIC, FCF, deuda, ingresos, beneficios, precio y P/E.
3. **Catalizadores a 12 meses:** probabilidad, magnitud, timing y cuánto está en precio.

La regla final es: **si falla 2 de 3, no se toca**.

## Arquitectura

- `public/`: frontend estático en HTML, CSS y JavaScript. No requiere React ni compilación.
- `functions/api/analyze.js`: Cloudflare Pages Function en `/api/analyze`.
- La Function llama a la **OpenAI Responses API**, usa búsqueda web y exige una salida JSON estructurada.
- La clave de OpenAI queda únicamente en Cloudflare; nunca se expone al navegador.
- Los análisis se guardan en el Cache API de Cloudflare durante 6 horas para reducir costo y latencia.

## Probar localmente

Requisitos: Node.js 20 o superior y una API key de OpenAI con facturación habilitada. El repositorio no incluye dependencias npm porque el despliegue de Cloudflare Pages no necesita instalarlas.

```bash
cp .dev.vars.example .dev.vars
```

Edita `.dev.vars` y agrega tu clave real:

```text
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

Inicia el proyecto usando Wrangler de forma temporal:

```bash
npx wrangler@latest pages dev public
```

Wrangler mostrará una dirección local, normalmente `http://localhost:8788`.

## Subir a GitHub

Crea un repositorio vacío en GitHub y ejecuta dentro de esta carpeta:

```bash
git init
git add .
git commit -m "Initial stock conviction dashboard"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/stock-conviction-dashboard.git
git push -u origin main
```

No subas el archivo `.dev.vars`; ya está excluido por `.gitignore`.

## Desplegar en Cloudflare Pages desde GitHub

1. En Cloudflare abre **Workers & Pages**.
2. Selecciona **Create application → Pages → Connect to Git**.
3. Autoriza GitHub y elige el repositorio.
4. Configura:
   - Framework preset: **None**.
   - Build command: `exit 0`.
   - Build output directory: `public`.
   - Root directory: dejar vacío (raíz del repositorio).
5. Crea el proyecto.
6. En **Settings → Variables and Secrets → Build variables**, agrega:
   - `SKIP_DEPENDENCY_INSTALL` = `1`.
7. En **Settings → Variables and Secrets**, agrega como **Secret** para producción y previews:
   - `OPENAI_API_KEY` = tu clave.
8. Agrega como variable opcional:
   - `OPENAI_MODEL` = `gpt-5.6-luna`.
9. Ejecuta un nuevo deployment sin reutilizar la caché anterior.

Cada nuevo push a la rama principal generará un despliegue automático.

## Seguridad y costos

- No escribas una API key dentro de `public/` ni en el repositorio.
- Cada ticker nuevo puede generar consumo de modelo y búsqueda web en la API de OpenAI.
- Consultas repetidas del mismo ticker durante 6 horas utilizan caché, salvo que se marque “Ignorar caché”.
- Antes de abrir la aplicación públicamente, conviene protegerla con Cloudflare Access o agregar control de usuarios y límites de uso.

## Personalización

Los criterios y ponderaciones están definidos en:

```text
functions/api/analyze.js
```

Busca `RÚBRICA EXACTA DEL CONVICTION SCORE` para modificar puntajes o reglas. El frontend se puede personalizar en `public/styles.css`.

## Límites

El dashboard depende de datos públicos y de la calidad de las fuentes encontradas en cada consulta. No reemplaza revisión directa de filings, asesoría financiera ni una evaluación de precio de entrada y tamaño de posición.

## Solución al error `npm clean-install`

Esta versión elimina `package.json`, `package-lock.json` y los archivos temporales `.wrangler/`. La aplicación no requiere instalación de paquetes durante el build. Si una versión anterior de estos archivos ya está en GitHub, elimínalos del repositorio y vuelve a desplegar:

```bash
git rm -f package.json package-lock.json
git rm -r --cached .wrangler 2>/dev/null || true
git add .gitignore README.md
git commit -m "Fix Cloudflare Pages dependency install"
git push
```

En Cloudflare usa `exit 0` como Build command y `public` como Build output directory.
