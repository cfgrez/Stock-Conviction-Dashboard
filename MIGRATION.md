# Corrección del error `_worker.js`

El despliegue estaba ejecutando `npx wrangler deploy`, es decir, estaba creando un **Worker**, no un proyecto Pages.

En Workers, un archivo `public/_worker.js` se interpreta como un posible asset público y Wrangler bloquea el despliegue para evitar exponer código de servidor.

La solución aplicada es:

- mover `public/_worker.js` a `src/index.js`;
- declarar `main: "./src/index.js"` en `wrangler.jsonc`;
- declarar `public` como directorio de assets con el binding `ASSETS`;
- mantener el deploy command `npx wrangler deploy`.
