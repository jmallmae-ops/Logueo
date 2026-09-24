import React, { useState } from 'react';
import GeologicalLoggingView from '../components/common/GeologicalLoggingView';
import DatosView from '../components/common/DatosView';
import '../assets/styles/main.css';

export default function Workspace() {
  const [currentView, setCurrentView] = useState<'light_table' | 'gallery' | 'map' | 'datos' | 'logueo'>('logueo');
  const [rqdImages, setRqdImages] = useState<any[]>([]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'RQD_IMAGE_PROCESSED') {
        setRqdImages(prev => {
          const newImg = event.data.payload;
          // Replace if it already exists, or append
          const existingIdx = prev.findIndex(img => img.id === newImg.id);
          if (existingIdx !== -1) {
            const next = [...prev];
            next[existingIdx] = newImg;
            return next;
          }
          return [...prev, newImg];
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#f5f6f8' }}>
      
      {/* Top Navigation Bar */}
      <div style={{ height: '50px', backgroundColor: '#fff', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
          My work {'>'} DrillHole Logging
        </div>
        
        <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd', overflow: 'hidden' }}>
          <button 
            onClick={() => setCurrentView('logueo')}
            style={{ backgroundColor: currentView === 'logueo' ? '#005b7f' : 'transparent', color: currentView === 'logueo' ? 'white' : '#555', border: 'none', padding: '6px 16px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            📝 Logueo
          </button>
          <button 
            onClick={() => setCurrentView('light_table')}
            style={{ backgroundColor: currentView === 'light_table' ? '#005b7f' : 'transparent', color: currentView === 'light_table' ? 'white' : '#555', border: 'none', padding: '6px 16px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderLeft: '1px solid #eee' }}>
            📸 Light table
          </button>
          <button 
            onClick={() => setCurrentView('gallery')}
            style={{ backgroundColor: currentView === 'gallery' ? '#005b7f' : 'transparent', color: currentView === 'gallery' ? 'white' : '#555', border: 'none', padding: '6px 16px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderLeft: '1px solid #eee' }}>
            🔲 Gallery
          </button>
          <button 
            onClick={() => setCurrentView('map')}
            style={{ backgroundColor: currentView === 'map' ? '#005b7f' : 'transparent', color: currentView === 'map' ? 'white' : '#555', border: 'none', padding: '6px 16px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderLeft: '1px solid #eee' }}>
            🗺️ Map
          </button>
          <button 
            onClick={() => setCurrentView('datos')}
            style={{ backgroundColor: currentView === 'datos' ? '#005b7f' : 'transparent', color: currentView === 'datos' ? 'white' : '#555', border: 'none', padding: '6px 16px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderLeft: '1px solid #eee' }}>
            📊 Datos
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* Geological Logging View */}
        <div style={{ width: '100%', height: '100%', display: currentView === 'logueo' ? 'flex' : 'none' }}>
           <GeologicalLoggingView images={rqdImages} />
        </div>

        {/* Datos View */}
        {currentView === 'datos' && (
           <div style={{ width: '100%', height: '100%' }}>
             <DatosView />
           </div>
        )}

        {/* RQD Analyzer iframe */}
        <div style={{ width: '100%', height: '100%', display: (currentView === 'light_table' || currentView === 'gallery' || currentView === 'map') ? 'block' : 'none' }}>
           <iframe src="/RQD_Analyzer_Web_Ready/index.html" style={{ width: '100%', height: '100%', border: 'none' }} title="RQD Analyzer" />
        </div>
        
      </div>

    </div>
  );
}
