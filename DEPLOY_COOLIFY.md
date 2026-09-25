# Despliegue en Coolify — https://datageo.site

La app se publica como **un solo contenedor**: Flask (gunicorn) en el puerto **8010**
sirve la API en `/api/*` y el frontend React compilado en el resto de rutas.

## 1. DNS
Registro **A** de `datageo.site` (y `www` si lo usas) apuntando a la IP del servidor de Coolify.

## 2. Crear el recurso en Coolify
1. *New Resource → Public/Private Repository* → `https://github.com/jmallmae-ops/Logueo`, rama `main`.
2. **Build Pack:** `Dockerfile` (Dockerfile en la raíz, Base Directory `/`).
3. **Domains:** `https://datageo.site`
4. **Ports Exposes:** `8010`  (no hace falta *Port Mapping*: Traefik recibe 80/443 y reenvía al 8010).

## 3. Almacenamiento persistente (obligatorio)
*Storages → Add Volume* con **Destination Path** `/data`.
Ahí vive `geology.sqlite`. Sin volumen, cada redeploy borra lo logueado.
En el primer arranque se copia la base incluida en el repo.

## 4. Variables (opcionales)
| Variable | Uso |
|---|---|
| `GITHUB_TOKEN` (build) | Solo si el repo vuelve a ser privado: permite descargar los modelos `.onnx` de Git LFS. |
| `VITE_API_URL` (build) | Solo si la API se sirve en otro dominio. Vacío = mismo dominio. |

## 5. Desarrollo local
```bash
cd backend_api && pip install -r requirements.txt && python server.py   # API en :8010
cd frontend_app && npm install && npm run dev                          # Vite, /api → :8010
```
