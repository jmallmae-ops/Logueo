"""
Descarga los archivos Git LFS (modelos .onnx) cuando el código llega a Docker
solo con los "punteros" LFS (archivos de ~130 bytes).

Coolify clona el repo, pero los modelos pueden llegar como punteros. Este script
busca punteros en la carpeta indicada y los reemplaza por el archivo real usando
la API LFS de GitHub. Los archivos con el mismo contenido se descargan una vez.

Uso: python fetch_lfs.py <carpeta> <owner/repo>
Variable opcional GITHUB_TOKEN para repositorios privados.
"""
import base64, json, os, shutil, sys, urllib.request

POINTER_HEADER = b"version https://git-lfs.github.com/spec/v1"


def read_pointer(path):
    if os.path.getsize(path) > 1024:
        return None
    with open(path, "rb") as f:
        data = f.read()
    if not data.startswith(POINTER_HEADER):
        return None
    info = dict(line.split(" ", 1) for line in data.decode().strip().splitlines())
    return info["oid"].split(":", 1)[1], int(info["size"])


def main(root, repo):
    pointers = {}
    for dirpath, _, files in os.walk(root):
        for name in files:
            p = os.path.join(dirpath, name)
            ptr = read_pointer(p)
            if ptr:
                pointers.setdefault(ptr, []).append(p)
    if not pointers:
        print("[lfs] No hay punteros LFS; nada que descargar.")
        return

    headers = {
        "Accept": "application/vnd.git-lfs+json",
        "Content-Type": "application/vnd.git-lfs+json",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Basic " + base64.b64encode(f"x-access-token:{token}".encode()).decode()

    body = json.dumps({
        "operation": "download",
        "transfers": ["basic"],
        "objects": [{"oid": oid, "size": size} for oid, size in pointers],
    }).encode()
    req = urllib.request.Request(f"https://github.com/{repo}.git/info/lfs/objects/batch", body, headers)
    with urllib.request.urlopen(req) as r:
        batch = json.load(r)

    for obj in batch["objects"]:
        key = (obj["oid"], obj["size"])
        if "error" in obj:
            sys.exit(f"[lfs] Error con {obj['oid']}: {obj['error']}")
        action = obj["actions"]["download"]
        paths = pointers[key]
        first = paths[0]
        print(f"[lfs] Descargando {os.path.basename(first)} ({obj['size'] / 1e6:.0f} MB)...")
        dl = urllib.request.Request(action["href"], headers=action.get("header", {}))
        tmp = first + ".part"
        with urllib.request.urlopen(dl) as r, open(tmp, "wb") as out:
            shutil.copyfileobj(r, out, 1024 * 1024)
        if os.path.getsize(tmp) != obj["size"]:
            sys.exit(f"[lfs] Tamaño incorrecto para {first}")
        os.replace(tmp, first)
        for other in paths[1:]:
            shutil.copyfile(first, other)
            print(f"[lfs] Copiado a {other}")
    print("[lfs] Modelos listos.")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
