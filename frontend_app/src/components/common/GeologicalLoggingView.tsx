import React, { useState, useEffect } from 'react';
import GeologicalLoggingForm from './GeologicalLoggingForm';
import domainsData from '../../utils/cleanDomains.json';
import domainMapping from '../../utils/domainMapping.json';
import { API_BASE } from '../../config';

interface GeologicalLoggingViewProps {
  images: any[]; // Or ImageItem[]
}

export default function GeologicalLoggingView({ images }: GeologicalLoggingViewProps) {
  const [activeDataSet, setActiveDataSet] = useState('LITOLOGIA');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeHole, setActiveHole] = useState('');
  
  // Dynamic data states
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [holeIds, setHoleIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // LOG DATA STATES
  const [litoLogs, setLitoLogs] = useState<any[]>([]);
  const [altLogs, setAltLogs] = useState<any[]>([]);
  const [strLogs, setStrLogs] = useState<any[]>([]);
  const [minLogs, setMinLogs] = useState<any[]>([]);
  const [geoLogs, setGeoLogs] = useState<any[]>([]);

  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [scale, setScale] = useState(10);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(180); // px, resizable
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(380); // px, resizable

  const datasets = ['LITOLOGIA', 'ALTERACION', 'ESTRUCTURAL', 'MINERALIZACION', 'COMENTARIO', 'LOGUEADO POR', 'DIAMETRO DE LINEA', 'RQD'];

  const getActiveLogs = () => {
    switch(activeDataSet) {
        case 'LITOLOGIA': return litoLogs;
        case 'ALTERACION': return altLogs;
        case 'ESTRUCTURAL': return strLogs;
        case 'MINERALIZACION': return minLogs;
        case 'COMENTARIO': return geoLogs;
        default: return [];
    }
  };
  const currentLogs = getActiveLogs();

  // Fetch Areas on mount
  useEffect(() => {
    fetch(API_BASE + '/api/areas')
      .then(res => res.json())
      .then(data => {
        setAreas(data);
        if (data.length > 0) setSelectedArea(data[0].AREACODE);
      })
      .catch(err => console.error("Error fetching areas", err));
  }, []);

  // Fetch Projects when Area changes
  useEffect(() => {
    if (!selectedArea) return;
    fetch(`${API_BASE}/api/projects?areacode=${selectedArea}`)
      .then(res => res.json())
      .then(data => {
        setProjects(data);
        if (data.length > 0) setSelectedProject(data[0].PROJECTCODE);
        else setSelectedProject('');
      })
      .catch(err => console.error("Error fetching projects", err));
  }, [selectedArea]);

  // Fetch Holes when Project changes
  useEffect(() => {
    if (!selectedProject) {
      setHoleIds([]);
      setActiveHole('');
      return;
    }
    fetch(`${API_BASE}/api/holes?projectcode=${selectedProject}`)
      .then(res => res.json())
      .then(data => {
        const ids = data.map((h: any) => h.HOLEID);
        setHoleIds(ids);
        setActiveHole(''); // Reset active hole when project changes
      })
      .catch(err => console.error("Error fetching holes", err));
  }, [selectedProject]);

  const fetchLogs = () => {
    if (!activeHole) return;
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=Lithology`)
      .then(res => res.json()).then(data => setLitoLogs(data)).catch(err => console.error(err));
      
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=Alteration`)
      .then(res => res.json()).then(data => setAltLogs(data)).catch(err => console.error(err));
      
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=Structural`)
      .then(res => res.json()).then(data => setStrLogs(data)).catch(err => console.error(err));
      
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=Mineralization`)
      .then(res => res.json()).then(data => setMinLogs(data)).catch(err => console.error(err));
      
    fetch(`${API_BASE}/api/get_logs?hole_id=${activeHole}&dataset=GeoComent`)
      .then(res => res.json()).then(data => setGeoLogs(data)).catch(err => console.error(err));
  };

  // Fetch Logs when activeHole changes
  useEffect(() => {
    if (!activeHole) {
      setLitoLogs([]);
      setAltLogs([]);
      setStrLogs([]);
      setMinLogs([]);
      setGeoLogs([]);
      return;
    }
    fetchLogs();
  }, [activeHole]);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#fff', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      
      {/* EXTREME LEFT STRIP */}
      <div style={{ width: '32px', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f9f9f9', zIndex: 10 }}>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ width: '100%', height: '40px', background: 'none', border: 'none', borderBottom: '1px solid #ccc', cursor: 'pointer', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#555' }}
        >
          {sidebarOpen ? '<' : '>'}
        </button>
        <div style={{ flex: 1, position: 'relative', width: '100%' }}>
          <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%) rotate(-90deg)', transformOrigin: 'left top', whiteSpace: 'nowrap', fontSize: '12px', color: '#555', fontWeight: 'bold', width: 'max-content' }}>
             AREA: {areas.find(a => a.AREACODE === selectedArea)?.AREANAME || '...'} &nbsp;&nbsp;&nbsp; Projects: {projects.find(p => p.PROJECTCODE === selectedProject)?.PROJECTNAME || '...'} &nbsp;&nbsp;&nbsp; Drillholes: {sidebarOpen ? '' : activeHole}
          </div>
        </div>
      </div>

      {/* LEFT SIDEBAR (Filter & Drillholes) */}
      {sidebarOpen && (
        <div style={{ width: '220px', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
          <div style={{ padding: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', color: '#777', fontWeight: 'bold' }}>AREA</label>
              <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)} style={{ width: '100%', padding: '4px', fontSize: '12px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px' }}>
                {areas.map(a => <option key={a.AREACODE} value={a.AREACODE}>{a.AREANAME}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', color: '#777', fontWeight: 'bold' }}>Projects</label>
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ width: '100%', padding: '4px', fontSize: '12px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px' }}>
                {projects.map(p => <option key={p.PROJECTCODE} value={p.PROJECTCODE}>{p.PROJECTNAME}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#777', fontWeight: 'bold' }}>Drillholes</label>
              <div style={{ marginTop: '4px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: '8px', top: '6px', fontSize: '14px', color: '#999', transform: 'rotate(-45deg)' }}>&#9906;</span>
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '6px 6px 6px 24px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #eee' }}>
            <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 'bold', color: '#555', borderBottom: '1px solid #eee' }}>
              HOLEID ({holeIds.length})
            </div>
            {holeIds.filter(id => id.toLowerCase().includes(searchQuery.toLowerCase())).map(id => (
              <div 
                key={id}
                onClick={() => setActiveHole(id)}
                style={{ 
                  padding: '8px 12px', 
                  fontSize: '12px', 
                  borderBottom: '1px solid #f0f0f0', 
                  cursor: 'pointer',
                  backgroundColor: activeHole === id ? '#e6f7ff' : '#fff',
                  color: activeHole === id ? '#005b7f' : '#333',
                  fontWeight: activeHole === id ? 'bold' : 'normal'
                }}
              >
                {id}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CENTER STRIP LOG VISUALIZATION */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflow: 'hidden' }}>
        
        {/* Toolbar - FIXED, never scrolls */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #ccc', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {[
              { label: 'Select', icon: '⊕' },
              { label: 'Edit',   icon: '✎', active: true },
              { label: 'Delete', icon: '−' },
              { label: 'Strips', icon: '≡' },
              { label: 'Pan',    icon: '✥' },
            ].map(btn => (
              <button key={btn.label} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', color: btn.active ? '#00a8cc' : '#555', gap: '2px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: btn.active ? '#00a8cc' : '#eee', color: btn.active ? 'white' : '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>{btn.icon}</div>
                <span style={{ fontSize: '9px' }}>{btn.label}</span>
              </button>
            ))}
          </div>
          {/* Depth zoom control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#555', border: '1px solid #ccc', borderRadius: '4px', padding: '3px 8px', backgroundColor: '#fff' }}>
            <span style={{ fontSize: '10px', color: '#888' }}>Depth zoom:</span>
            <button onClick={() => setScale(s => Math.max(1, Math.round(s / 1.5)))} style={{ border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', padding: '0 6px', fontWeight: 'bold', fontSize: '14px', lineHeight: '20px' }}>−</button>
            <input
              type="range"
              min="1" max="200" step="1"
              value={scale}
              onChange={e => setScale(Number(e.target.value))}
              style={{ width: '80px', cursor: 'pointer' }}
            />
            <button onClick={() => setScale(s => Math.min(200, Math.round(s * 1.5)))} style={{ border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', padding: '0 6px', fontWeight: 'bold', fontSize: '14px', lineHeight: '20px' }}>+</button>
            <span style={{ minWidth: '42px', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>{scale} px/m</span>
          </div>
        </div>


        {/* Single scrollable container - header sticky inside it so columns always align */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
          <div style={{ minWidth: '800px' }}>

          {/* Header Row - sticky so it stays on top while scrolling */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', fontSize: '10px', fontWeight: 'bold', borderBottom: '2px solid #aaa', backgroundColor: '#f5f5f5' }}>
          <div style={{ width: '40px', borderRight: '1px solid #ccc', padding: '3px 2px', fontSize: '9px', color: '#777', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>Depth</div>
          
          {/* Core Photo */}
          <div style={{ width: '60px', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#333', borderBottom: '1px solid #ccc', backgroundColor: '#d0e0e3' }}>Core Photo</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>WET</div>
            </div>
          </div>

          {/* Lithology */}
          <div style={{ flex: 1.5, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#5b4500', borderBottom: '1px solid #ccc', backgroundColor: '#f5deb3' }}>Lithology</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>TIPO</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>SUBTIPO</div>
            </div>
          </div>
          {/* Alteration */}
          <div style={{ flex: 1.5, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#5a5a00', borderBottom: '1px solid #ccc', backgroundColor: '#fffacd' }}>Alteration</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>TIPO</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>SUBTIPO</div>
            </div>
          </div>
          {/* Structural */}
          <div style={{ flex: 1.5, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#002a6e', borderBottom: '1px solid #ccc', backgroundColor: '#cce0ff' }}>Structural</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>TIPO</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>SUBTIPO</div>
            </div>
          </div>
          {/* Mineralization */}
          <div style={{ flex: 2.5, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#4a004a', borderBottom: '1px solid #ccc', backgroundColor: '#f5ccff' }}>Mineralization</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>TIPO</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>ESTILO1</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>COMPOSIC1</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>MIN_PCT1</div>
            </div>
          </div>
          {/* Diameter */}
          <div style={{ flex: 1, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#333', borderBottom: '1px solid #ccc', backgroundColor: '#e8e8e8' }}>Diameter</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', borderRight: '1px solid #eee', fontSize: '9px', color: '#555' }}>TIPOPERF</div>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>DIAMETRO</div>
            </div>
          </div>
          {/* LoggedBy */}
          <div style={{ flex: 1, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#333', borderBottom: '1px solid #ccc', backgroundColor: '#e8e8e8' }}>LoggedBy</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>GEOLOGO</div>
            </div>
          </div>
          {/* GeoComent */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '3px 6px', textAlign: 'center', color: '#333', borderBottom: '1px solid #ccc', backgroundColor: '#e8e8e8' }}>GeoComent</div>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '3px 2px', textAlign: 'center', fontSize: '9px', color: '#555' }}>COMENTARIO</div>
            </div>
          </div>
        </div>

        {/* Data content */}
        {!activeHole ? (
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', backgroundColor: '#fcfcfc', height: '400px' }}>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ccc' }}>&#9783;</div>
                 <h2>No hay datos visuales</h2>
                 <p>Selecciona un Drillhole del panel izquierdo para cargar el logueo.</p>
              </div>
           </div>
        ) : (
           <div style={{ display: 'flex', width: '100%', height: `${Math.max(500, (litoLogs.length ? Math.max(...litoLogs.map(l=>l.depth_to)) : 100) * scale)}px`, position: 'relative' }}>
              
              {/* Grid Lines removed per user request */}

              {/* Depth Axis */}
              <div style={{ width: '40px', borderRight: '1px solid #ccc', position: 'relative', flexShrink: 0 }}>
                 {(() => {
                   const maxDepth = litoLogs.length ? Math.max(...litoLogs.map(l => l.depth_to)) : 100;
                   const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
                   const labelInterval = candidates.find(c => c * scale >= 40) || 500;
                   const tickInterval = candidates.find(c => c * scale >= 8) || labelInterval;
                   const count = Math.ceil(maxDepth / tickInterval);
                   return [...Array(count + 1)].map((_, i) => {
                     const depth = i * tickInterval;
                     const isLabel = Math.abs(depth % labelInterval) < 0.0001 || depth === 0;
                     return (
                       <React.Fragment key={i}>
                         <div style={{ position: 'absolute', top: `${depth * scale}px`, right: 0, width: isLabel ? '6px' : '4px', borderTop: '1px solid #aaa' }} />
                         {isLabel && <div style={{ position: 'absolute', top: `${depth * scale - 6}px`, right: 8, fontSize: '9px', color: '#666', textAlign: 'right' }}>{depth % 1 === 0 ? depth : depth.toFixed(2)}</div>}
                       </React.Fragment>
                     );
                   });
                 })()}
              </div>

              {/* Core Photo */}
              <div style={{ width: '60px', borderRight: '1px solid #ccc', position: 'relative', flexShrink: 0, backgroundColor: '#111', overflow: 'hidden' }}>
                 {images && images.length > 0 && (
                    images
                      .filter(img => {
                         if (!activeHole || !img.holeId) return false;
                         const hId = String(img.holeId).toLowerCase();
                         const aId = String(activeHole).toLowerCase();
                         // Exact match or the filename contains the exact Hole ID (e.g., "EMP24-001_box1.jpg" contains "EMP24-001")
                         return hId === aId || hId.includes(aId);
                      })
                      .map((img, idx) => (
                       <img 
                         key={idx}
                         src={img.src} 
                         alt="Core Photo"
                         style={{ 
                           position: 'absolute', 
                           top: `${img.from * scale}px`, 
                           left: 0, 
                           width: '100%', 
                           height: `${(img.to - img.from) * scale}px`, 
                           objectFit: 'fill' 
                         }} 
                         title={`${img.holeId} | ${img.from}m - ${img.to}m`} 
                       />
                    ))
                 )}
              </div>

              {/* Lithology */}
              <div style={{ flex: 1.5, borderRight: '1px solid #ccc', position: 'relative', display: 'flex' }}>
                 <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                     {litoLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const rawTipo = d.TIPO || d.tipo || '';
                       const fullName = (domainMapping as any).Lithology?.codeToName?.[rawTipo] || rawTipo;
                       const domainColor = (domainsData.Lithology as any)[fullName]?.color || '#e2ca5f';
                       const isDark = parseInt(domainColor.slice(1,3),16)*0.299 + parseInt(domainColor.slice(3,5),16)*0.587 + parseInt(domainColor.slice(5,7),16)*0.114 < 128;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'LITOLOGIA';
                       
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('LITOLOGIA'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', backgroundColor: domainColor, borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: isDark ? 'white' : '#333', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }} title={`${fullName}\n${log.depth_from} → ${log.depth_to}`}>
                             {rawTipo}
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, position: 'relative' }}>
                    {litoLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const subtipo = (domainMapping as any).Lithology?.codeToName?.[log.subtipo || ''] || log.subtipo || '';
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'LITOLOGIA';
                       
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('LITOLOGIA'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {subtipo.substring(0,6)}
                          </div>
                       )
                    })}
                 </div>
              </div>

              {/* Alteration - with polka-dot pattern overlay like Acquire Arena */}
              <div style={{ flex: 1.5, borderRight: '1px solid #ccc', position: 'relative', display: 'flex' }}>
                 <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                    {altLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const rawTipo = d.TIPO || d.tipo || '';
                       const fullName = (domainMapping as any).Alteration?.codeToName?.[rawTipo] || rawTipo;
                       const domainColor = (domainsData.Alteration as any)[fullName]?.color || '#d3d3d3';
                       const dotPattern = `radial-gradient(circle, ${domainColor} 40%, transparent 40%)`;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'ALTERACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('ALTERACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', backgroundColor: fullName.toLowerCase().includes('sin') ? domainColor : '#fff', borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', backgroundImage: fullName.toLowerCase().includes('sin') ? 'none' : dotPattern, backgroundSize: '10px 10px', backgroundPosition: '0 0', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }} title={`${fullName}\n${log.depth_from} → ${log.depth_to}`}>
                             <span style={{ backgroundColor: 'rgba(255,255,255,0.7)', padding: '1px 3px', borderRadius: '2px', fontSize: '9px', color: '#333' }}>{rawTipo}</span>
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, position: 'relative' }}>
                    {altLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const subtipo = (domainMapping as any).Alteration?.codeToName?.[d.SUBTIPO || d.subtipo || ''] || d.SUBTIPO || d.subtipo || '';
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'ALTERACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('ALTERACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {subtipo.substring(0,6)}
                          </div>
                       )
                    })}
                 </div>
              </div>

              {/* Structural */}
              <div style={{ flex: 1.5, borderRight: '1px solid #ccc', position: 'relative', display: 'flex' }}>
                 <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                     {strLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const rawTipo = d.TIPO || d.tipo || '';
                       const fullName = (domainMapping as any).Structural?.codeToName?.[rawTipo] || rawTipo;
                       const domainColor = (domainsData.Structural as any)[fullName]?.color || '#808080';
                       const isDark = parseInt(domainColor.slice(1,3),16)*0.299 + parseInt(domainColor.slice(3,5),16)*0.587 + parseInt(domainColor.slice(5,7),16)*0.114 < 128;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'ESTRUCTURAL';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('ESTRUCTURAL'); }} style={{ position: 'absolute', top: `${t}px`, height: `${Math.max(h, 6)}px`, width: '100%', backgroundColor: domainColor, borderBottom: '1px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: isDark ? 'white' : '#333', fontWeight: 'bold', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }} title={`${fullName}\n${log.depth_from} → ${log.depth_to}`}>
                             {rawTipo}
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, position: 'relative' }}>
                    {strLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const subtipo = (domainMapping as any).Structural?.codeToName?.[d.SUBTIPO || d.subtipo || ''] || d.SUBTIPO || d.subtipo || '';
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'ESTRUCTURAL';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('ESTRUCTURAL'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {subtipo.substring(0,6)}
                          </div>
                       )
                    })}
                 </div>
              </div>

              {/* Mineralization */}
              <div style={{ flex: 2.5, borderRight: '1px solid #ccc', position: 'relative', display: 'flex' }}>
                  <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                    {minLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const rawTipo = d.TIPO || d.tipo || '';
                       const fullName = (domainMapping as any).Mineralization?.codeToName?.[rawTipo] || rawTipo;
                       const domainColor = (domainsData.Mineralization as any)[fullName]?.color || '#ffffff';
                       const isDark = parseInt(domainColor.slice(1,3),16)*0.299 + parseInt(domainColor.slice(3,5),16)*0.587 + parseInt(domainColor.slice(5,7),16)*0.114 < 128;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'MINERALIZACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('MINERALIZACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', backgroundColor: domainColor, borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: isDark ? 'white' : '#333', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }} title={`${fullName}\n${log.depth_from} → ${log.depth_to}`}>
                             {rawTipo.substring(0,8)}
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                    {minLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'MINERALIZACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('MINERALIZACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {(d.ESTILO1 || '').substring(0,6)}
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, borderRight: '1px solid #eee', position: 'relative' }}>
                    {minLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'MINERALIZACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('MINERALIZACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {(d.COMPOSICION1 || '').substring(0,6)}
                          </div>
                       )
                    })}
                 </div>
                 <div style={{ flex: 1, position: 'relative' }}>
                    {minLogs.map((log, idx) => {
                       const h = (log.depth_to - log.depth_from) * scale;
                       const t = log.depth_from * scale;
                       const d = log.data_json ? JSON.parse(log.data_json) : log;
                       const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'MINERALIZACION';
                       return (
                          <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('MINERALIZACION'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#555', overflow: 'hidden', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                             {(d.MIN_PCT1 || '')}
                          </div>
                       )
                    })}
                 </div>
              </div>

              {/* Diameter, Logged By */}
              <div style={{ flex: 1, borderRight: '1px solid #eee' }}></div>
              <div style={{ flex: 1, borderRight: '1px solid #eee' }}></div>

              {/* GeoComent */}
              <div style={{ flex: 3, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                 {geoLogs.map((log, idx) => {
                    const h = (log.depth_to - log.depth_from) * scale;
                    const t = log.depth_from * scale;
                    const d = log.data_json ? JSON.parse(log.data_json) : log;
                    const isSelected = selectedLog && selectedLog.id === log.id && activeDataSet === 'COMENTARIO';
                    return (
                       <div key={idx} onClick={() => { setSelectedLog(log); setActiveDataSet('COMENTARIO'); }} style={{ position: 'absolute', top: `${t}px`, height: `${h}px`, width: '100%', padding: '4px', fontSize: '9px', borderBottom: '1px solid #ccc', overflowY: 'auto', cursor: 'pointer', boxSizing: 'border-box', boxShadow: isSelected ? 'inset 0 0 0 3px #0dcaf0' : 'none', zIndex: isSelected ? 10 : 1 }}>
                          {d.COMENTARIO || ''}
                       </div>
                    )
                 })}
              </div>

           </div>
           )}
        </div>{/* closes minWidth: 800px wrapper */}
        </div>{/* closes single scrollable container */}

        {/* BOTTOM DRAWER - always visible at bottom, expands upward */}
        <div style={{ flexShrink: 0, borderTop: '2px solid #aaa', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
          
          {/* Drag handle to resize - only visible when panel is open */}
          {isBottomPanelOpen && (
            <div
              style={{ height: '5px', cursor: 'ns-resize', backgroundColor: '#e0e0e0', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseDown={e => {
                e.preventDefault();
                const startY = e.clientY;
                const startH = bottomPanelHeight;
                const onMove = (ev: MouseEvent) => {
                  const delta = startY - ev.clientY; // drag up = increase height
                  setBottomPanelHeight(Math.max(60, Math.min(600, startH + delta)));
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <div style={{ width: '40px', height: '3px', borderRadius: '2px', backgroundColor: '#aaa' }} />
            </div>
          )}

          {/* Header bar - always visible, click to toggle */}
          <div
            onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
            style={{ padding: '5px 16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#f0f0f0', borderBottom: isBottomPanelOpen ? '1px solid #ddd' : 'none', userSelect: 'none' }}
          >
            <span style={{ fontSize: '10px', color: '#888' }}>Tabla:</span>
            <span style={{ color: '#333' }}>{activeDataSet}</span>
            <span style={{ fontSize: '16px', color: '#555', transform: isBottomPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>&#8964;</span>
          </div>

          {/* Table content - only visible when open */}
          {isBottomPanelOpen && (
            <div style={{ height: `${bottomPanelHeight}px`, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: '#333' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', borderBottom: '2px solid #ccc', zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '5px 12px', textAlign: 'left', fontWeight: '600', color: '#555', borderRight: '1px solid #eee' }}>Drillhole</th>
                    <th style={{ padding: '5px 12px', textAlign: 'right', fontWeight: '600', color: '#555', borderRight: '1px solid #eee' }}>FROM</th>
                    <th style={{ padding: '5px 12px', textAlign: 'right', fontWeight: '600', color: '#555', borderRight: '1px solid #eee' }}>TO</th>
                    <th style={{ padding: '5px 12px', textAlign: 'center', fontWeight: '600', color: '#555' }}>PRIORITY</th>
                  </tr>
                </thead>
                <tbody>
                  {currentLogs.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#999' }}>No data found</td></tr>
                  ) : (
                    currentLogs.map((log, idx) => {
                      const isSelected = selectedLog && selectedLog.id === log.id;
                      return (
                        <tr key={idx}
                          onClick={() => setSelectedLog(log)}
                          style={{ borderBottom: '1px solid #eee', backgroundColor: isSelected ? '#0aa2b8' : (idx % 2 === 0 ? '#fafafa' : '#fff'), color: isSelected ? '#fff' : '#333', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '5px 12px', borderRight: '1px solid #eee' }}>{log.hole_id} - {selectedProject}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', borderRight: '1px solid #eee' }}>{log.depth_from}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', borderRight: '1px solid #eee' }}>{log.depth_to}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'center' }}>1</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>{/* closes bottom drawer */}

      </div>

      {/* RIGHT DRAWER - collapsible and resizable */}
      <div style={{ flexShrink: 0, display: 'flex', borderLeft: '2px solid #aaa', backgroundColor: '#fff', height: '100%', zIndex: 100 }}>
        
        {/* Toggle & Resize Bar */}
        <div style={{ display: 'flex', flexDirection: 'row' }}>
          
          {/* Resize handle (only active when open) */}
          {isRightPanelOpen && (
             <div
               style={{ width: '5px', cursor: 'ew-resize', backgroundColor: '#e0e0e0', borderRight: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
               onMouseDown={e => {
                 e.preventDefault();
                 const startX = e.clientX;
                 const startW = rightPanelWidth;
                 const onMove = (ev: MouseEvent) => {
                   const delta = startX - ev.clientX; // drag left = increase width
                   setRightPanelWidth(Math.max(250, Math.min(800, startW + delta)));
                 };
                 const onUp = () => {
                   window.removeEventListener('mousemove', onMove);
                   window.removeEventListener('mouseup', onUp);
                 };
                 window.addEventListener('mousemove', onMove);
                 window.addEventListener('mouseup', onUp);
               }}
             >
               <div style={{ height: '40px', width: '3px', borderRadius: '2px', backgroundColor: '#aaa' }} />
             </div>
          )}

          {/* Toggle Button / Bar */}
          <div 
             onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
             style={{ width: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: '#f0f0f0', borderRight: isRightPanelOpen ? '1px solid #ddd' : 'none', userSelect: 'none' }}
             title={isRightPanelOpen ? "Ocultar panel" : "Mostrar panel"}
          >
             <span style={{ fontSize: '14px', color: '#555', transform: isRightPanelOpen ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', marginBottom: '8px' }}>&#8964;</span>
             {!isRightPanelOpen && <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '10px', color: '#888', letterSpacing: '2px', fontWeight: 'bold' }}>LOGUEO</span>}
          </div>
        </div>

        {/* Panel Content (only when open) */}
        {isRightPanelOpen && (
          <div style={{ width: `${rightPanelWidth}px`, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee' }}>
              <div style={{ backgroundColor: '#17a2b8', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>III</div>
              <div style={{ fontSize: '10px', color: '#555', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span>Data set</span>
                <select 
                   value={activeDataSet}
                   onChange={e => setActiveDataSet(e.target.value)}
                   style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', color: '#333' }}
                >
                  {datasets.map(ds => <option key={ds} value={ds}>{ds}</option>)}
                </select>
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                {!activeHole && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
                        <div style={{ backgroundColor: '#fff', padding: '16px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', color: '#555', border: '1px solid #ddd' }}>
                            <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#9776;</div>
                            <div style={{ fontWeight: 'bold' }}>Selecciona un Drillhole</div>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>Para habilitar la captura de datos</div>
                        </div>
                    </div>
                )}
                <div style={{ pointerEvents: activeHole ? 'auto' : 'none', opacity: activeHole ? 1 : 0.4 }}>
                    <GeologicalLoggingForm activeDataSet={activeDataSet} activeHole={activeHole} selectedLog={selectedLog} allLogs={currentLogs} onLogsChanged={fetchLogs} />
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

