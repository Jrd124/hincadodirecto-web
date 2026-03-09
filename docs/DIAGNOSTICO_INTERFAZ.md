# Diagnóstico: no se podía acceder a la interfaz

## Resumen

**No se ha eliminado ni movido ningún fichero** en los cambios de los puntos 13 y 14 del checklist. Solo se **editó el contenido** de:

- `interfaz_facturas/backend.py` (cache Nominatim, ThreadPoolExecutor)
- `CHECKLIST_MEJORAS.md` (marcar ítems hechos)

## Qué pasó

1. **Cuando dejaste de poder acceder**  
   El backend no estaba en marcha, o se estaba intentando arrancar desde `interfaz_facturas` con el `.bat`, pero en esa carpeta **no había** `backend.py` ni `config.py` en disco (sí había una copia en `data\Facturas Recibidas\empresa1\Sin_fecha\Sin fecha\`). Por eso al ejecutar el `.bat` fallaba: "can't open file backend.py".

2. **Por qué falla la interfaz al arrancar desde `interfaz_facturas`**  
   Flask sirve la página principal con `send_from_directory(".", "index.html")`, es decir, busca `index.html` **en la misma carpeta que el backend** (`interfaz_facturas`).  
   En tu proyecto, **`index.html` no está en `interfaz_facturas`**; la única copia que existe está en  
   `data\Facturas Recibidas\empresa1\Sin_fecha\Sin fecha\`.  
   Por tanto:
   - Si el backend se arranca desde `interfaz_facturas`: el servidor responde, pero al abrir `http://127.0.0.1:8000/` no encuentra `index.html` → error 404 o página en blanco.
   - Si antes podías acceder, o bien arrancabas el backend desde esa carpeta de `data` (donde sí está `index.html`), o en algún momento `index.html` estuvo en `interfaz_facturas` y ya no está (eso no fue por los cambios del checklist).

## Estado actual de `interfaz_facturas`

| Archivo/carpeta | ¿Existe? |
|-----------------|----------|
| backend.py      | Sí (se copió desde la carpeta de data) |
| config.py       | Sí (se copió desde la carpeta de data) |
| index.html      | **No** → la ruta "/" falla |
| core/           | Sí |
| static/css, static/js | Sí |

## Conclusión

- Los cambios de los puntos 13 y 14 **no borraron ni movieron** ningún fichero.
- El problema es de **dónde está la app completa**: en disco, la única carpeta que tiene a la vez `backend.py`, `config.py` e `index.html` es  
  `data\Facturas Recibidas\empresa1\Sin_fecha\Sin fecha\`.  
  En `interfaz_facturas` faltaba primero `backend.py` y `config.py` (ya corregido copiándolos) y **falta `index.html`**.

## Arreglo aplicado

Se copia `index.html` desde  
`data\Facturas Recibidas\empresa1\Sin_fecha\Sin fecha\`  
a  
`interfaz_facturas\`  
para que, al arrancar el backend desde `interfaz_facturas` (con el `.bat` o con `python backend.py`), la ruta "/" encuentre la página y puedas acceder a la interfaz.
