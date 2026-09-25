from flask import Flask, request, jsonify, send_from_directory, abort
import sqlite3
import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Carpeta con el frontend compilado (vite build). En Docker: /app/static
STATIC_DIR = os.environ.get('STATIC_DIR', os.path.join(BASE_DIR, '..', 'frontend_app', 'dist'))

app = Flask(__name__, static_folder=None)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Base de datos: en producción vive en un volumen persistente (/data).
# Si no existe todavía, se copia la base semilla incluida en el repo.
SEED_DB_PATH = os.path.join(BASE_DIR, 'database', 'geology.sqlite')
DB_PATH = os.environ.get('DB_PATH', SEED_DB_PATH)

def ensure_db():
    if DB_PATH != SEED_DB_PATH and not os.path.exists(DB_PATH):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        shutil.copyfile(SEED_DB_PATH, DB_PATH)
        print(f"[init] Base de datos inicial copiada a {DB_PATH}")

ensure_db()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/areas', methods=['GET'])
def get_areas():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT AREACODE, AREANAME FROM AREAS ORDER BY AREANAME")
        areas = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(areas)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects', methods=['GET'])
def get_projects():
    areacode = request.args.get('areacode', '')
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT PROJECTCODE, PROJECTNAME FROM PROYECTOS WHERE AREACODE = ? ORDER BY PROJECTNAME", (areacode,))
        projects = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(projects)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/holes', methods=['GET'])
def get_holes():
    projectcode = request.args.get('projectcode', '')
    try:
        conn = get_db()
        cursor = conn.cursor()
        if projectcode:
            cursor.execute("SELECT HOLEID FROM HOLELOCATION WHERE PROJECTCODE = ? ORDER BY HOLEID", (projectcode,))
        else:
            cursor.execute("SELECT HOLEID FROM HOLELOCATION ORDER BY HOLEID")
        holes = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(holes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logged_holes', methods=['GET'])
def get_logged_holes():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get distinct hole_ids from all log tables
        query = """
            SELECT DISTINCT hole_id FROM log_lithology
            UNION
            SELECT DISTINCT hole_id FROM log_alteration
            UNION
            SELECT DISTINCT hole_id FROM log_structural
            UNION
            SELECT DISTINCT hole_id FROM log_mineralization
            UNION
            SELECT DISTINCT hole_id FROM log_geocoment
        """
        cursor.execute(query)
        holes = [{'HOLEID': row['hole_id']} for row in cursor.fetchall() if row['hole_id']]
        
        # Sort alphabetically
        holes = sorted(holes, key=lambda x: x['HOLEID'])
        
        conn.close()
        return jsonify(holes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_logs', methods=['GET'])
def get_logs():
    hole_id = request.args.get('hole_id', '')
    dataset = request.args.get('dataset', 'Lithology')
    
    if not hole_id:
        return jsonify([])
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        if dataset == 'Lithology':
            cursor.execute("SELECT * FROM log_lithology WHERE hole_id = ? ORDER BY depth_from ASC", (hole_id,))
            logs = [dict(row) for row in cursor.fetchall()]
        elif dataset == 'Alteration':
            cursor.execute("SELECT * FROM log_alteration WHERE hole_id = ? ORDER BY depth_from ASC", (hole_id,))
            logs = [dict(row) for row in cursor.fetchall()]
        elif dataset == 'Structural':
            cursor.execute("SELECT * FROM log_structural WHERE hole_id = ? ORDER BY depth_from ASC", (hole_id,))
            logs = [dict(row) for row in cursor.fetchall()]
        elif dataset == 'Mineralization':
            cursor.execute("SELECT * FROM log_mineralization WHERE hole_id = ? ORDER BY depth_from ASC", (hole_id,))
            logs = [dict(row) for row in cursor.fetchall()]
        elif dataset == 'GeoComent':
            cursor.execute("SELECT * FROM log_geocoment WHERE hole_id = ? ORDER BY depth_from ASC", (hole_id,))
            logs = [dict(row) for row in cursor.fetchall()]
            
        conn.close()
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/hole_summary', methods=['GET'])
def get_hole_summary():
    hole_id = request.args.get('hole_id', '')
    if not hole_id:
        return jsonify({})
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        tables = {
            'Lithology': 'log_lithology',
            'Alteration': 'log_alteration',
            'Structural': 'log_structural',
            'Mineralization': 'log_mineralization',
            'GeoComent': 'log_geocoment'
        }
        
        summary = {}
        for key, table in tables.items():
            cursor.execute(f"SELECT MIN(depth_from) as min_from, MAX(depth_to) as max_to FROM {table} WHERE hole_id = ?", (hole_id,))
            row = cursor.fetchone()
            summary[key] = {
                'min': row['min_from'] if row['min_from'] is not None else '0.00',
                'max': row['max_to'] if row['max_to'] is not None else '0.00'
            }
            
        conn.close()
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/save_log', methods=['POST'])
def save_log():
    data = request.json
    dataset = data.get('dataset', '')
    hole_id = data.get('hole_id', 'DDH-001')
    log_data = data.get('data', {})
    
    action = data.get('action', 'new')
    record_id = data.get('id')
    from_depth = log_data.get('from', 0)
    to_depth = log_data.get('to', 0)
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        if dataset == 'Lithology':
            if action == 'update' and record_id:
                cursor.execute("""
                    UPDATE log_lithology SET depth_from=?, depth_to=?, tipo=?, subtipo=?, textura=?, composicion=?, forma=?, formacion=?
                    WHERE id=?
                """, (from_depth, to_depth, log_data.get('tipo',''), log_data.get('subtipo',''), log_data.get('textura',''), log_data.get('composicion',''), log_data.get('forma',''), log_data.get('formacion',''), record_id))
            else:
                cursor.execute("""
                    INSERT INTO log_lithology (hole_id, depth_from, depth_to, tipo, subtipo, textura, composicion, forma, formacion) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (hole_id, from_depth, to_depth, log_data.get('tipo',''), log_data.get('subtipo',''), log_data.get('textura',''), log_data.get('composicion',''), log_data.get('forma',''), log_data.get('formacion','')))
        
        elif dataset == 'Alteration':
            import json
            # Alt table has specific columns but for extensibility we might want to store all in data_json? Wait, schema has specific ones.
            # Let's check schema for alteration! It has: tipo, subtipo, geointerp, descripcion, mineral1, intensid1, estilo1
            if action == 'update' and record_id:
                cursor.execute("""
                    UPDATE log_alteration SET depth_from=?, depth_to=?, tipo=?, subtipo=?, geointerp=?, descripcion=?, mineral1=?, intensid1=?, estilo1=?
                    WHERE id=?
                """, (from_depth, to_depth, log_data.get('tipoAlt',''), log_data.get('subtipo',''), log_data.get('geointerp',''), log_data.get('descripcion',''), log_data.get('mineral1',''), log_data.get('intensid1',''), log_data.get('estilo1',''), record_id))
            else:
                cursor.execute("""
                    INSERT INTO log_alteration (hole_id, depth_from, depth_to, tipo, subtipo, geointerp, descripcion, mineral1, intensid1, estilo1) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (hole_id, from_depth, to_depth, log_data.get('tipoAlt',''), log_data.get('subtipo',''), log_data.get('geointerp',''), log_data.get('descripcion',''), log_data.get('mineral1',''), log_data.get('intensid1',''), log_data.get('estilo1','')))
            
        elif dataset == 'Structural':
            if action == 'update' and record_id:
                cursor.execute("""
                    UPDATE log_structural SET depth_from=?, depth_to=?, tipo=?, subtipo=?, intensidad=?, movimiento=?, relleno=?, informacion=?, textura=?, ancho=?
                    WHERE id=?
                """, (from_depth, to_depth, log_data.get('tipo',''), log_data.get('subtipo',''), log_data.get('intensidad',''), log_data.get('movimiento',''), log_data.get('relleno',''), log_data.get('informacion',''), log_data.get('textura',''), log_data.get('ancho',''), record_id))
            else:
                cursor.execute("""
                    INSERT INTO log_structural (hole_id, depth_from, depth_to, tipo, subtipo, intensidad, movimiento, relleno, informacion, textura, ancho) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (hole_id, from_depth, to_depth, log_data.get('tipo',''), log_data.get('subtipo',''), log_data.get('intensidad',''), log_data.get('movimiento',''), log_data.get('relleno',''), log_data.get('informacion',''), log_data.get('textura',''), log_data.get('ancho','')))
            
        elif dataset == 'Mineralization':
            import json
            if action == 'update' and record_id:
                cursor.execute("""
                    UPDATE log_mineralization SET depth_from=?, depth_to=?, data_json=? WHERE id=?
                """, (from_depth, to_depth, json.dumps(log_data), record_id))
            else:
                cursor.execute("""
                    INSERT INTO log_mineralization (hole_id, depth_from, depth_to, data_json) 
                    VALUES (?, ?, ?, ?)
                """, (hole_id, from_depth, to_depth, json.dumps(log_data)))
            
        elif dataset == 'GeoComent':
            import json
            if action == 'update' and record_id:
                cursor.execute("""
                    UPDATE log_geocoment SET depth_from=?, depth_to=?, data_json=? WHERE id=?
                """, (from_depth, to_depth, json.dumps(log_data), record_id))
            else:
                cursor.execute("""
                    INSERT INTO log_geocoment (hole_id, depth_from, depth_to, data_json) 
                    VALUES (?, ?, ?, ?)
                """, (hole_id, from_depth, to_depth, json.dumps(log_data)))
            
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Log saved successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "message": "Geological Logging API Running (Python/Flask)"})

# ---------------------------------------------------------------------------
# Frontend (React compilado). Cualquier ruta que no sea /api/* se sirve desde
# STATIC_DIR; si el archivo no existe se devuelve index.html (SPA con HashRouter).
# ---------------------------------------------------------------------------
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def frontend(path):
    if path.startswith('api/'):
        abort(404)
    full = os.path.join(STATIC_DIR, path)
    if path and os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path, conditional=True)
    if path and os.path.isdir(full) and os.path.isfile(os.path.join(full, 'index.html')):
        return send_from_directory(full, 'index.html')
    index_file = os.path.join(STATIC_DIR, 'index.html')
    if os.path.isfile(index_file):
        return send_from_directory(STATIC_DIR, 'index.html')
    # Sin frontend en este contenedor (despliegue con servicios separados): solo API
    return jsonify({"message": "Geological Logging API Running (Python/Flask)"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG') == '1')
