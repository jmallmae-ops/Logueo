import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config';

const TABLES = [
  { id: 'Lithology', name: 'LITOLOGIA LOG' },
  { id: 'Alteration', name: 'ALTERACION' },
  { id: 'Structural', name: 'ESTRUCTURAS' },
  { id: 'Mineralization', name: 'MINERALIZACION' },
  { id: 'GeoComent', name: 'COMENTARIO' }
];

export default function DatosView() {
  const [holes, setHoles] = useState<string[]>([]);
  const [activeHole, setActiveHole] = useState<string>('');
  const [activeTable, setActiveTable] = useState<string>('Lithology');
  const [tableData, setTableData] = useState<any[]>([]);
  const [searchHole, setSearchHole] = useState<string>('');
  const [holeSummary, setHoleSummary] = useState<Record<string, {min: number | string, max: number | string}>>({});

  useEffect(() => {
    // Fetch only holes that have data
    fetch(API_BASE + '/api/logged_holes')
      .then(res => res.json())
      .then(data => {
        const ids = data.map((h: any) => h.HOLEID);
        setHoles(ids);
        if (ids.length > 0) setActiveHole(ids[0]);
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (!activeHole) {
      setTableData([]);
      setHoleSummary({});
      return;
    }
    // Fetch table data
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=${activeTable}`)
      .then(res => res.json())
      .then(data => setTableData(data))
      .catch(err => console.error(err));

    // Fetch summary
    fetch(`${API_BASE}/api/hole_summary?hole_id=${activeHole}`)
      .then(res => res.json())
      .then(data => setHoleSummary(data))
      .catch(err => console.error(err));
  }, [activeHole, activeTable]);

  // Pre-process table data to flatten data_json and map common fields
  const processedData = tableData.map(row => {
    let flat = { ...row };
    if (flat.data_json) {
      try {
        const parsed = JSON.parse(flat.data_json);
        flat = { ...flat, ...parsed };
      } catch(e) {}
    }
    flat.HOLEID = flat.hole_id;
    flat.GEOLFROM = flat.depth_from;
    flat.GEOLTO = flat.depth_to;
    flat.ANCHO = (parseFloat(flat.depth_to || 0) - parseFloat(flat.depth_from || 0)).toFixed(2);
    // map lowercase keys to uppercase for matching
    Object.keys(flat).forEach(k => {
      flat[k.toUpperCase()] = flat[k];
    });
    return flat;
  });

  let columns: string[] = [];
  if (activeTable === 'Lithology') {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO', 'PRIORITY', 'TIPO', 'SUBTIPO', 'TEXTURA', 'CLASTO', 'COMPOSICION', 'FORMA', 'FOSILES', 'FOSILES_2', 'FORMACION', 'CEMENTOMTZ', 'LITOFENMASA', 'LITOFRAGMTX', 'GEOINTERP', 'DESCRIPCION'];
  } else if (activeTable === 'Alteration') {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO', 'PRIORITY', 'TIPO', 'SUBTIPO', 'GEOINTERP', 'DESCRIPCION'];
    for(let i=1; i<=8; i++) {
      columns.push(`MINERAL${i}`, `INTENSIDAD${i}`, `ESTILO${i}`);
    }
  } else if (activeTable === 'Structural') {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO', 'PRIORITY', 'TIPO', 'SUBTIPO', 'INTENSIDAD', 'INFORMACION', 'MOVIMIENTO', 'TEXTURA', 'RELLENO', 'ANCHOEST', 'ANGULO', 'DESCRIPCION', 'GEOINTERP', 'MENA1', 'GANGA1', 'MENA2', 'GANGA2'];
  } else if (activeTable === 'Mineralization') {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO', 'PRIORITY', 'TIPO', 'DESCRIPCION', 'GEOINTERP'];
    for(let i=1; i<=8; i++) {
      columns.push(`COMPOSICION${i}`, `ESTILO${i}`, `MIN_PCT${i}`);
    }
  } else if (activeTable === 'GeoComent') {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO', 'PRIORITY', 'COMENTARIO'];
  } else {
    columns = ['HOLEID', 'PROJECTCODE', 'GEOLFROM', 'GEOLTO', 'ANCHO'];
    if (processedData.length > 0) {
      const keys = Object.keys(processedData[0]).filter(k => k !== 'id' && k !== 'hole_id' && k !== 'depth_from' && k !== 'depth_to' && k !== 'data_json' && !columns.includes(k));
      columns = [...columns, ...keys];
    }
  }

  const exportToCsv = () => {
    if (processedData.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }
    const header = columns.join(',');
    const rows = processedData.map(row => columns.map(c => `"${row[c] || ''}"`).join(','));
    const csvContent = [header, ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeTable}_${activeHole}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#eee', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
      
      {/* Toolbar */}
      <div style={{ height: '40px', backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '10px' }}>
         <button style={{ padding: '4px 8px', cursor: 'pointer', border: '1px solid #ccc', backgroundColor: '#fff' }}>sum</button>
         <button onClick={exportToCsv} style={{ padding: '4px 8px', cursor: 'pointer', border: '1px solid #ccc', backgroundColor: '#fff' }}>Exportar CSV</button>
         <div style={{ marginLeft: 'auto', fontSize: '12px' }}>
            <label><input type="checkbox" /> Comprobar intervalos</label>
         </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Panel: Sondajes */}
        <div style={{ width: '200px', backgroundColor: '#fff', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
           <div style={{ padding: '5px', backgroundColor: '#f9f9f9', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #ccc', borderTop: '1px solid #ccc' }}>
              Sondajes
           </div>
           <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc', backgroundColor: '#f0f0f0' }}>
                    <th style={{ textAlign: 'left', padding: '2px', fontWeight: 'normal' }}>
                       <input 
                         type="text" 
                         placeholder="Buscar sondaje..." 
                         value={searchHole}
                         onChange={e => setSearchHole(e.target.value)}
                         style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ccc', padding: '2px 4px', fontSize: '11px' }}
                       />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holes.filter(h => h.toLowerCase().includes(searchHole.toLowerCase())).map(hole => (
                    <tr 
                      key={hole} 
                      onClick={() => setActiveHole(hole)}
                      style={{ 
                        cursor: 'pointer', 
                        backgroundColor: activeHole === hole ? '#e6f2ff' : 'transparent',
                        color: activeHole === hole ? '#0000ee' : '#333'
                      }}
                    >
                      <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{hole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>

        {/* Middle Panel: Tablas */}
        <div style={{ width: '250px', backgroundColor: '#fff', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
           <div style={{ padding: '5px', backgroundColor: '#f9f9f9', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #ccc', borderTop: '1px solid #ccc' }}>
              Tablas
           </div>
           <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc', backgroundColor: '#f0f0f0' }}>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'normal', width: '60%' }}>Temas de Mapeo</th>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'normal', width: '20%' }}>Desde</th>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'normal', width: '20%' }}>Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLES.map(table => {
                    const summary = holeSummary[table.id] || { min: '0.00', max: '0.00' };
                    return (
                      <tr 
                        key={table.id}
                        onClick={() => setActiveTable(table.id)}
                        style={{ 
                          cursor: 'pointer',
                          backgroundColor: activeTable === table.id ? '#005b9f' : 'transparent',
                          color: activeTable === table.id ? '#fff' : '#333'
                        }}
                      >
                        <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{table.name}</td>
                        <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{summary.min}</td>
                        <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{summary.max}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
           </div>
        </div>

        {/* Right Panel: Datos del Tema */}
        <div style={{ flex: 1, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', borderTop: '1px solid #ccc' }}>
           <div style={{ padding: '5px', backgroundColor: '#f9f9f9', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Datos del Tema
           </div>
           <div style={{ padding: '5px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', borderBottom: '1px solid #ccc' }}>
              Tablas del Tema
              <select 
                value={activeTable} 
                onChange={e => setActiveTable(e.target.value)}
                style={{ backgroundColor: '#005b9f', color: 'white', padding: '2px 5px', border: 'none', outline: 'none' }}
              >
                {TABLES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
           </div>
           
           <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f0f0f0', zIndex: 1 }}>
                  <tr>
                    {columns.map(col => (
                      <th key={col} style={{ border: '1px solid #ccc', padding: '4px 10px', textAlign: 'left', fontWeight: 'normal' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processedData.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {columns.map(col => (
                        <td key={col} style={{ border: '1px solid #ccc', padding: '4px 10px' }}>
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
  );
}
