import sqlite3
import os

db_path = r"D:\GEOLOGICAL_LOGGING\backend_api\database\geology.sqlite"

# Create directory if it doesn't exist
os.makedirs(os.path.dirname(db_path), exist_ok=True)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create Tables
schema = """
-- Drillholes (Sondajes)
CREATE TABLE IF NOT EXISTS drillholes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hole_id TEXT NOT NULL UNIQUE,
    project TEXT,
    max_depth REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lithology Log
CREATE TABLE IF NOT EXISTS log_lithology (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hole_id TEXT NOT NULL,
    depth_from REAL NOT NULL,
    depth_to REAL NOT NULL,
    tipo TEXT,
    subtipo TEXT,
    textura TEXT,
    composicion TEXT,
    forma TEXT,
    formacion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(hole_id) REFERENCES drillholes(hole_id)
);

-- Alteration Log
CREATE TABLE IF NOT EXISTS log_alteration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hole_id TEXT NOT NULL,
    depth_from REAL NOT NULL,
    depth_to REAL NOT NULL,
    tipo TEXT,
    subtipo TEXT,
    geointerp TEXT,
    descripcion TEXT,
    mineral1 TEXT,
    intensid1 TEXT,
    estilo1 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(hole_id) REFERENCES drillholes(hole_id)
);

-- Structural Log
CREATE TABLE IF NOT EXISTS log_structural (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hole_id TEXT NOT NULL,
    depth_from REAL NOT NULL,
    depth_to REAL NOT NULL,
    tipo TEXT,
    subtipo TEXT,
    intensidad TEXT,
    movimiento TEXT,
    relleno TEXT,
    informacion TEXT,
    textura TEXT,
    ancho TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(hole_id) REFERENCES drillholes(hole_id)
);

-- Core Photos
CREATE TABLE IF NOT EXISTS core_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hole_id TEXT NOT NULL,
    depth_from REAL NOT NULL,
    depth_to REAL NOT NULL,
    file_path TEXT NOT NULL,
    box_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(hole_id) REFERENCES drillholes(hole_id)
);
"""

cursor.executescript(schema)

# Insert a dummy drillhole
cursor.execute("INSERT OR IGNORE INTO drillholes (hole_id, project, max_depth) VALUES ('DDH-001', 'Proyecto Alpha', 300.5)")
conn.commit()
conn.close()

print(f"Database created successfully at {db_path}")
