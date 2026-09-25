FROM python:3.12-slim
WORKDIR /app/backend_api

ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DB_PATH=/data/geology.sqlite

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

# 1 worker: SQLite no tolera bien varios procesos escribiendo a la vez
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 8 --timeout 300 server:app"]
