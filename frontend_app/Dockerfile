# ---------- 1) Compilar React + Vite ----------
FROM node:20-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# URL pública del backend (se inyecta en el build)
ARG VITE_API_URL=https://api.datageo.site
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- 2) Modelos ONNX (Git LFS) ----------
FROM python:3.12-alpine AS models
WORKDIR /work
COPY --from=build /build/dist ./dist
COPY deploy/fetch_lfs.py .
ARG LFS_REPO=jmallmae-ops/Logueo
ARG GITHUB_TOKEN=""
# Los modelos del RQD Analyzer se sirven desde /assets/*.onnx
RUN GITHUB_TOKEN=${GITHUB_TOKEN} python fetch_lfs.py dist ${LFS_REPO}

# ---------- 3) Servir con nginx en el puerto 3000 ----------
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=models /work/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
