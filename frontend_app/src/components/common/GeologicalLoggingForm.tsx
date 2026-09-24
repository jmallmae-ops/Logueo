import React, { useState, useEffect } from 'react';
import domainsData from '../../utils/cleanDomains.json';
import domainMapping from '../../utils/domainMapping.json';

interface GeologicalLoggingFormProps {
  activeDataSet?: string;
  activeHole?: string;
  onSave?: (data: any) => void;
  selectedLog?: any;
  allLogs?: any[];
  onLogsChanged?: () => void;
}

export default function GeologicalLoggingForm({ activeDataSet = 'LITOLOGIA', activeHole = '', onSave, selectedLog, allLogs = [], onLogsChanged }: GeologicalLoggingFormProps) {
  const [formMode, setFormMode] = useState<'new'|'update'>('update');
  const [from, setFrom] = useState(selectedLog?.from || '22.8');
  const [to, setTo] = useState(selectedLog?.to || '37.1');

  // LITHOLOGY
  const [litoTipo, setLitoTipo] = useState('Subvolcánico');
  const [litoSubtipo, setLitoSubtipo] = useState('');
  const [litoTextura, setLitoTextura] = useState('Porfirítico');
  const [litoComp, setLitoComp] = useState('Dacita');
  const [litoForma, setLitoForma] = useState('Domo');
  const [litoFormacion, setLitoFormacion] = useState('Indiferenciado');
  const [litoDesc, setLitoDesc] = useState('');
  const [litoGeo, setLitoGeo] = useState('Domo Dacítico');

  // ALTERATION
  const [altTipo, setAltTipo] = useState('Alterado');
  const [altSubtipo, setAltSubtipo] = useState('Hipógena');
  const [altGeo, setAltGeo] = useState('Sílice Alunita');
  const [altDesc, setAltDesc] = useState('Fuerte');
  const [altMins, setAltMins] = useState(Array(8).fill(''));
  const [altInts, setAltInts] = useState(Array(8).fill(''));
  const [altEsts, setAltEsts] = useState(Array(8).fill(''));

  // STRUCTURAL
  const [strTipo, setStrTipo] = useState('Venillas');
  const [strSubtipo, setStrSubtipo] = useState('Venillas (<10cm)');
  const [strIntensidad, setStrIntensidad] = useState('');
  const [strInfo, setStrInfo] = useState('Inferida');
  const [strMov, setStrMov] = useState('Indiferenciado');
  const [strTextura, setStrTextura] = useState('');
  const [strRelleno, setStrRelleno] = useState('Sulfuros');
  const [strAncho, setStrAncho] = useState('<0.1m');
  const [strMena1, setStrMena1] = useState('Pirita');
  const [strGanga1, setStrGanga1] = useState('');
  const [strMena2, setStrMena2] = useState('');
  const [strGanga2, setStrGanga2] = useState('');
  const [strAngulo, setStrAngulo] = useState('40');
  const [strDesc, setStrDesc] = useState('Pirita');
  const [strGeo, setStrGeo] = useState('');

  // MINERALIZATION
  const [minTipo, setMinTipo] = useState('Hipogeno, Prim');
  const [minComps, setMinComps] = useState(Array(9).fill(''));
  const [minEsts, setMinEsts] = useState(Array(9).fill(''));
  const [minPcts, setMinPcts] = useState(Array(9).fill(''));
  const [minDesc, setMinDesc] = useState('');
  const [minGeo, setMinGeo] = useState('');

  // GEOCOMENT
  const [geoComent, setGeoComent] = useState('Toba cristalolítica dacítica con\nlíticos de 1-4 cm\nsubredondeados y silíceos;\nmatriz tufácea parcialmente');

  // Helpers for arrays
  const updateArray = (arr: string[], index: number, value: string, setter: any) => {
    const newArr = [...arr];
    newArr[index] = value;
    setter(newArr);
  };

  useEffect(() => {
    if (selectedLog) {
      setFormMode('update');
      setFrom(selectedLog.depth_from || '');
      setTo(selectedLog.depth_to || '');
      
      const d = selectedLog.data_json ? JSON.parse(selectedLog.data_json) : selectedLog;
      
      if (activeDataSet === 'LITOLOGIA') {
         const c2n = (domainMapping as any).Lithology?.codeToName || {};
         const mapVal = (v: string) => v ? (c2n[v] || v) : '';
         
         setLitoTipo(mapVal(d.tipo || d.TIPO || ''));
         setLitoSubtipo(mapVal(d.subtipo || d.SUBTIPO || ''));
         setLitoTextura(mapVal(d.textura || d.TEXTURA || ''));
         setLitoComp(mapVal(d.composicion || d.COMPOSICION || ''));
         setLitoForma(mapVal(d.forma || d.FORMA || ''));
         setLitoFormacion(mapVal(d.formacion || d.FORMACION || ''));
         setLitoGeo(mapVal(d.geointerp || d.GEOINTERP || ''));
         setLitoDesc(d.descripcion || d.DESCRIPCION || '');
      } else if (activeDataSet === 'ALTERACION') {
         const c2n = (domainMapping as any).Alteration?.codeToName || {};
         const mapVal = (v: string) => v ? (c2n[v] || v) : '';
         setAltTipo(mapVal(d.tipo || d.TIPO || ''));
         setAltSubtipo(mapVal(d.subtipo || d.SUBTIPO || ''));
         setAltGeo(mapVal(d.geointerp || d.GEOINTERP || ''));
         setAltDesc(d.descripcion || d.DESCRIPCION || '');
         
         const newMins = [...altMins]; const newInts = [...altInts]; const newEsts = [...altEsts];
         for (let i=0; i<8; i++) {
            newMins[i] = d[`mineral${i+1}`] || d[`MINERAL${i+1}`] || '';
            newInts[i] = d[`intensid${i+1}`] || d[`INTENSIDAD${i+1}`] || '';
            newEsts[i] = d[`estilo${i+1}`] || d[`ESTILO${i+1}`] || '';
         }
         setAltMins(newMins); setAltInts(newInts); setAltEsts(newEsts);
      } else if (activeDataSet === 'ESTRUCTURAL') {
         const c2n = (domainMapping as any).Structural?.codeToName || {};
         const mapVal = (v: string) => v ? (c2n[v] || v) : '';
         setStrTipo(mapVal(d.tipo || d.TIPO || ''));
         setStrSubtipo(mapVal(d.subtipo || d.SUBTIPO || ''));
         setStrIntensidad(mapVal(d.intensidad || d.INTENSIDAD || ''));
         setStrMov(mapVal(d.movimiento || d.MOVIMIENTO || ''));
         setStrRelleno(mapVal(d.relleno || d.RELLENO || ''));
         setStrInfo(mapVal(d.informacion || d.INFORMACION || ''));
         setStrTextura(mapVal(d.textura || d.TEXTURA || ''));
         setStrAncho(mapVal(d.ancho || d.ANCHO || ''));
         setStrMena1(mapVal(d.mena1 || d.MENA1 || ''));
         setStrGanga1(mapVal(d.ganga1 || d.GANGA1 || ''));
         setStrGeo(mapVal(d.geointerp || d.GEOINTERP || ''));
         setStrDesc(d.descripcion || d.DESCRIPCION || '');
      } else if (activeDataSet === 'MINERALIZACION') {
         const c2n = (domainMapping as any).Mineralization?.codeToName || {};
         const mapVal = (v: string) => v ? (c2n[v] || v) : '';
         setMinTipo(mapVal(d.tipo || d.TIPO || ''));
         const newComps = [...minComps]; const newEsts = [...minEsts]; const newPcts = [...minPcts];
         for (let i=0; i<9; i++) {
            newComps[i] = mapVal(d[`COMPOSICION${i+1}`] || '');
            newEsts[i] = mapVal(d[`ESTILO${i+1}`] || '');
            newPcts[i] = d[`MIN_PCT${i+1}`] || '';
         }
         setMinComps(newComps); setMinEsts(newEsts); setMinPcts(newPcts);
      } else if (activeDataSet === 'COMENTARIO') {
         setGeoComent(d.COMENTARIO || d.text || '');
      }
    } else {
      setFrom(''); setTo('');
      setLitoTipo(''); setLitoSubtipo(''); setLitoTextura(''); setLitoComp(''); setLitoForma(''); setLitoFormacion(''); setLitoGeo(''); setLitoDesc('');
    }
  }, [selectedLog, activeDataSet]);

  const clearFields = () => {
      setFrom(''); setTo('');
      setLitoTipo(''); setLitoSubtipo(''); setLitoTextura(''); setLitoComp(''); setLitoForma(''); setLitoFormacion(''); setLitoGeo(''); setLitoDesc('');
      setAltTipo(''); setAltSubtipo(''); setAltGeo(''); setAltDesc(''); setAltMins(Array(8).fill('')); setAltInts(Array(8).fill('')); setAltEsts(Array(8).fill(''));
      setStrTipo(''); setStrSubtipo(''); setStrIntensidad(''); setStrMov(''); setStrRelleno(''); setStrInfo(''); setStrTextura(''); setStrAncho(''); setStrMena1(''); setStrGanga1(''); setStrMena2(''); setStrGanga2(''); setStrAngulo(''); setStrDesc(''); setStrGeo('');
      setMinTipo(''); setMinComps(Array(9).fill('')); setMinEsts(Array(9).fill('')); setMinPcts(Array(9).fill('')); setMinDesc(''); setMinGeo('');
      setGeoComent('');
  };

  const handleNew = () => {
      setFormMode('new');
      clearFields();
      const currentLogs = allLogs;
      let maxTo = 0;
      currentLogs.forEach(l => {
          const d_to = parseFloat(l.depth_to);
          if (!isNaN(d_to) && d_to > maxTo) maxTo = d_to;
      });
      setFrom(maxTo.toString());
  };

  const renderRadioGroup = (label: string, value: string, setter: (v: string) => void, options: string[]) => {
    if (!options || options.length === 0 || (options.length === 1 && options[0] === 'Indiferenciado')) return null;
    const allOptions = [...options];
    if (value && !allOptions.includes(value)) allOptions.push(value);

    return (
    <div style={{ marginBottom: '16px', flex: 1 }}>
      <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden', paddingLeft: '8px', backgroundColor: '#fff' }}>
         <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid #0dcaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {value && <div style={{ width: '6px', height: '6px', backgroundColor: '#0d6efd', borderRadius: '50%' }}></div>}
         </div>
         <select value={value} onChange={(e) => setter(e.target.value)} style={{ flex: 1, padding: '6px', border: 'none', fontSize: '12px', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer' }}>
           <option value=""></option>
           {allOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
         </select>
      </div>
    </div>
    );
  };

  const renderDropdown = (label: string, value: string, setter: (v: string) => void, options: string[], color?: string) => {
    if (!options || options.length === 0 || (options.length === 1 && options[0] === 'Indiferenciado')) return null;
    const allOptions = [...options];
    if (value && !allOptions.includes(value)) allOptions.push(value);
    
    return (
    <div style={{ marginBottom: '16px', flex: 1 }}>
      <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#fff' }}>
         <select value={value} onChange={(e) => setter(e.target.value)} style={{ flex: 1, padding: '6px', border: 'none', borderLeft: color ? `4px solid ${color}` : 'none', fontSize: '12px', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer' }}>
           <option value=""></option>
           {allOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
         </select>
      </div>
    </div>
    );
  };

  const renderColorDropdown = (label: string, value: string, setter: (v: string) => void, domainObject: any, idPrefix: string) => {
    const dropdownId = `${idPrefix}-dropdown`;
    return (
      <div style={{ marginBottom: '16px', flex: 1, position: 'relative' }}>
         <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
         <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #0dcaf0', borderRadius: '4px', overflow: 'visible', cursor: 'pointer', position: 'relative' }}
              onClick={() => {
                  const el = document.getElementById(dropdownId);
                  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
              }}
              onMouseLeave={() => {
                  const el = document.getElementById(dropdownId);
                  if (el) el.style.display = 'none';
              }}
         >
            <div style={{ backgroundColor: 'transparent', padding: '6px', color: '#333', display: 'flex', alignItems: 'center', flex: 1, fontSize: '12px' }}>
               <div style={{ width: '16px', height: '16px', backgroundColor: domainObject[value]?.color || '#ccc', marginRight: '8px' }}></div>
               {value}
            </div>
            <div style={{ padding: '0 8px', fontSize: '12px', color: '#333', display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
               &#8964;
            </div>
            
            <div id={dropdownId} style={{ display: 'none', position: 'absolute', top: '100%', left: '-2px', right: '-2px', backgroundColor: '#fff', border: '2px solid #0dcaf0', borderTop: 'none', zIndex: 100, maxHeight: '250px', overflowY: 'auto' }}>
               {Object.keys(domainObject || {}).map(tipo => (
                  <div key={tipo} 
                       onClick={(e) => { 
                           e.stopPropagation();
                           setter(tipo); 
                           document.getElementById(dropdownId)!.style.display = 'none'; 
                       }}
                       style={{ padding: '8px', display: 'flex', alignItems: 'center', fontSize: '12px', cursor: 'pointer', backgroundColor: value === tipo ? '#0dcaf0' : '#fff', color: value === tipo ? '#fff' : '#333' }}
                  >
                      <div style={{ width: '16px', height: '16px', backgroundColor: domainObject[tipo]?.color || '#ccc', marginRight: '8px' }}></div>
                      {tipo}
                  </div>
               ))}
            </div>
         </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (!activeHole) return;
    
    let dsStr = activeDataSet;
    if (activeDataSet === 'LITOLOGIA') dsStr = 'Lithology';
    if (activeDataSet === 'ALTERACION') dsStr = 'Alteration';
    if (activeDataSet === 'ESTRUCTURAL') dsStr = 'Structural';
    if (activeDataSet === 'MINERALIZACION') dsStr = 'Mineralization';
    if (activeDataSet === 'COMENTARIO') dsStr = 'GeoComent';

    const reverseMap = (datasetKey: string, val: string) => {
        const n2c = (domainMapping as any)[datasetKey]?.nameToCode || {};
        return n2c[val] || val;
    };

    let dataToSave: any = { from, to };
    
    if (dsStr === 'Lithology') {
        dataToSave = { ...dataToSave,
            tipo: reverseMap('Lithology', litoTipo),
            subtipo: reverseMap('Lithology', litoSubtipo),
            textura: reverseMap('Lithology', litoTextura),
            composicion: reverseMap('Lithology', litoComp),
            forma: reverseMap('Lithology', litoForma),
            formacion: reverseMap('Lithology', litoFormacion),
            geointerp: reverseMap('Lithology', litoGeo),
            descripcion: litoDesc
        };
    } else if (dsStr === 'Alteration') {
        dataToSave = { ...dataToSave,
            tipoAlt: reverseMap('Alteration', altTipo),
            subtipo: reverseMap('Alteration', altSubtipo),
            geointerp: reverseMap('Alteration', altGeo),
            descripcion: altDesc
        };
        for(let i=0; i<8; i++){
            dataToSave[`mineral${i+1}`] = altMins[i];
            dataToSave[`intensid${i+1}`] = altInts[i];
            dataToSave[`estilo${i+1}`] = altEsts[i];
        }
    } else if (dsStr === 'Structural') {
        dataToSave = { ...dataToSave,
            tipo: reverseMap('Structural', strTipo),
            subtipo: reverseMap('Structural', strSubtipo),
            intensidad: reverseMap('Structural', strIntensidad),
            movimiento: reverseMap('Structural', strMov),
            relleno: reverseMap('Structural', strRelleno),
            informacion: reverseMap('Structural', strInfo),
            textura: reverseMap('Structural', strTextura),
            ancho: reverseMap('Structural', strAncho),
            mena1: reverseMap('Structural', strMena1),
            ganga1: reverseMap('Structural', strGanga1),
            geointerp: reverseMap('Structural', strGeo),
            descripcion: strDesc
        };
    } else if (dsStr === 'Mineralization') {
        dataToSave = { ...dataToSave, tipo: reverseMap('Mineralization', minTipo) };
        for(let i=0; i<9; i++){
            dataToSave[`COMPOSICION${i+1}`] = minComps[i];
            dataToSave[`ESTILO${i+1}`] = minEsts[i];
            dataToSave[`MIN_PCT${i+1}`] = minPcts[i];
        }
    } else if (dsStr === 'GeoComent') {
        dataToSave = { ...dataToSave, COMENTARIO: geoComent };
    }

    const payload = {
        dataset: dsStr,
        hole_id: activeHole,
        action: formMode,
        id: selectedLog?.id,
        data: dataToSave
    };

    try {
        const response = await fetch('http://localhost:8000/api/save_log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            if (onLogsChanged) onLogsChanged();
            
            // Automatically switch to "New" mode, clear fields, and set FROM to the TO we just saved
            const lastTo = to;
            setFormMode('new');
            clearFields();
            setFrom(lastTo);
        } else {
            console.error("Failed to save log", await response.text());
        }
    } catch (e) {
        console.error("Error saving log", e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 8px 16px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#333' }}>{'>'} {activeDataSet}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0', marginBottom: '16px', padding: '0 16px' }}>
          <button onClick={handleNew} style={{ padding: '6px 32px', borderRadius: '16px 0 0 16px', border: 'none', backgroundColor: formMode === 'new' ? '#17a2b8' : '#555', color: 'white', fontSize: '12px', cursor: 'pointer' }}>New</button>
          <button onClick={() => setFormMode('update')} style={{ padding: '6px 32px', borderRadius: '0 16px 16px 0', border: 'none', backgroundColor: formMode === 'update' ? '#17a2b8' : '#555', color: 'white', fontSize: '12px', cursor: 'pointer' }}>Update</button>
      </div>

      <div style={{ padding: '0 16px 16px 16px', overflowY: 'auto', flex: 1 }}>
        
        {/* COMMON FROM/TO FOR ALL DATASETS */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>From</div>
            <input type="text" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>To</div>
            <input type="text" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* LITHOLOGY */}
        {activeDataSet === 'LITOLOGIA' && (
          <>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                {renderColorDropdown('Tipo', litoTipo, setLitoTipo, domainsData.Lithology, 'lito-tipo')}
                {renderRadioGroup('Subtipo', litoSubtipo, setLitoSubtipo, ((domainsData.Lithology as any)[litoTipo]?.subtipos || []))}
                {renderRadioGroup('Textura', litoTextura, setLitoTextura, ((domainsData.Lithology as any)[litoTipo]?.texturas || []))}
                
                {['Subvolcánico', 'Volcánico Fragmental', 'Volcánico Coherente', 'Intrusivo', 'Metamórfico'].includes(litoTipo) && 
                   renderRadioGroup('Composici', litoComp, setLitoComp, ((domainsData.Lithology as any)[litoTipo]?.composiciones || []))}
                
                {['Brecha'].includes(litoTipo) && 
                   renderRadioGroup('Composici', litoComp, setLitoComp, ((domainsData.Lithology as any)[litoTipo]?.composiciones || []))}

                {['Subvolcánico', 'Volcánico Fragmental', 'Volcánico Coherente', 'Intrusivo', 'Sedimentario', 'Metamórfico'].includes(litoTipo) && 
                   renderRadioGroup('Formacion', litoFormacion, setLitoFormacion, ((domainsData.Lithology as any)[litoTipo]?.formaciones || []))}

                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Descripci</div>
                <textarea value={litoDesc} onChange={e=>setLitoDesc(e.target.value)} style={{width: '100%', height: '60px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box'}} />
              </div>
              <div style={{ flex: 1 }}>
                {['Subvolcánico', 'Volcánico Fragmental', 'Volcánico Coherente', 'Intrusivo', 'Brecha'].includes(litoTipo) && 
                   renderRadioGroup('Forma', litoForma, setLitoForma, ((domainsData.Lithology as any)[litoTipo]?.formas || []))}
                
                {renderDropdown('Geointerp', litoGeo, setLitoGeo, ((domainsData.Lithology as any)[litoTipo]?.geointerps || []))}
              </div>
            </div>
          </>
        )}

        {/* ALTERATION */}
        {activeDataSet === 'ALTERACION' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>{renderColorDropdown('Tipo', altTipo, setAltTipo, domainsData.Alteration, 'alt-tipo')}</div>
                <div style={{ flex: 1 }}>{renderRadioGroup('Subtipo', altSubtipo, setAltSubtipo, ((domainsData.Alteration as any)[altTipo]?.subtipos || ['Específica', 'Hipógena', 'Supergena']))}</div>
            </div>
            
            {altTipo === 'Alterado' && (
                <>
                {[0,1,2,3,4,5,6,7].map(i => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '0px' }}>
                        {renderDropdown(`Mineral${i+1}`, altMins[i], (v)=>updateArray(altMins, i, v, setAltMins), ((domainsData.Alteration as any)[altTipo]?.minerales || ['Sílice beige', 'Alunita', 'Pirofilita', 'Cuarzo']))}
                        {renderDropdown(`Intensid${i+1}`, altInts[i], (v)=>updateArray(altInts, i, v, setAltInts), ((domainsData.Alteration as any)[altTipo]?.intensidades || ['Débil', 'Fuerte', 'Moderada']))}
                        {renderDropdown(`Estilo${i+1}`, altEsts[i], (v)=>updateArray(altEsts, i, v, setAltEsts), ((domainsData.Alteration as any)[altTipo]?.estilos || ['Matriz', 'Irregular', 'Fracturas']))}
                    </div>
                ))}
                </>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>{renderDropdown('Geointerp', altGeo, setAltGeo, ((domainsData.Alteration as any)[altTipo]?.geointerps || ['Sílice Alunita', 'Fílica']))}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Descripcion</div>
                    <textarea value={altDesc} onChange={e=>setAltDesc(e.target.value)} style={{width: '100%', height: '40px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box'}} />
                </div>
            </div>
          </>
        )}

        {/* STRUCTURAL */}
        {activeDataSet === 'ESTRUCTURAL' && (
          <>
            <div style={{ display: 'flex', gap: '12px' }}>
                {renderColorDropdown('Tipo', strTipo, setStrTipo, domainsData.Structural, 'str-tipo')}
                {renderDropdown('Subtipo', strSubtipo, setStrSubtipo, ((domainsData.Structural as any)[strTipo]?.subtipos || []))}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                {renderRadioGroup('Intensidad', strIntensidad, setStrIntensidad, ((domainsData.Structural as any)[strTipo]?.intensidades || []))}
                {renderRadioGroup('Movimient', strMov, setStrMov, ((domainsData.Structural as any)[strTipo]?.movimientos || []))}
                {renderRadioGroup('Relleno', strRelleno, setStrRelleno, ((domainsData.Structural as any)[strTipo]?.rellenos || []))}
                {renderDropdown('Mena1', strMena1, setStrMena1, ((domainsData.Structural as any)[strTipo]?.menas || []))}
                {renderDropdown('Mena2', strMena2, setStrMena2, ((domainsData.Structural as any)[strTipo]?.menas || []))}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Angulo</div>
                    <input type="text" value={strAngulo} onChange={e=>setStrAngulo(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                {renderDropdown('Geointerp', strGeo, setStrGeo, ((domainsData.Structural as any)[strTipo]?.geointerps || []))}
              </div>
              <div style={{ flex: 1 }}>
                {renderRadioGroup('Informacion', strInfo, setStrInfo, ((domainsData.Structural as any)[strTipo]?.informaciones || []))}
                {renderDropdown('Textura', strTextura, setStrTextura, ((domainsData.Structural as any)[strTipo]?.texturas || []))}
                {renderRadioGroup('Ancho', strAncho, setStrAncho, ((domainsData.Structural as any)[strTipo]?.anchos || []))}
                {renderDropdown('Ganga1', strGanga1, setStrGanga1, ((domainsData.Structural as any)[strTipo]?.gangas || []))}
                {renderDropdown('Ganga2', strGanga2, setStrGanga2, ((domainsData.Structural as any)[strTipo]?.gangas || []))}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Descripcion</div>
                    <textarea value={strDesc} onChange={e=>setStrDesc(e.target.value)} style={{width: '100%', height: '80px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box'}} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* MINERALIZATION */}
        {activeDataSet === 'MINERALIZACION' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>{renderColorDropdown('Tipo', minTipo, setMinTipo, domainsData.Mineralization, 'min-tipo')}</div>
                <div style={{ flex: 1 }}></div>
            </div>
            {[0,1,2,3,4,5,6,7,8].map(i => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '0px' }}>
                    {renderDropdown(`Composic${i+1}`, minComps[i], (v)=>updateArray(minComps, i, v, setMinComps), ((domainsData.Mineralization as any)[minTipo]?.composiciones || []))}
                    {renderDropdown(`Estilo${i+1}`, minEsts[i], (v)=>updateArray(minEsts, i, v, setMinEsts), ((domainsData.Mineralization as any)[minTipo]?.estilos || []))}
                    <div style={{ flex: 1, marginBottom: '16px' }}>
                        <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Min_Pct{i+1}</div>
                        <input type="text" value={minPcts[i]} onChange={e=>updateArray(minPcts, i, e.target.value, setMinPcts)} style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: '12px' }}>
               <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Descripcion</div>
                    <textarea value={minDesc} onChange={e=>setMinDesc(e.target.value)} style={{width: '100%', height: '60px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box'}} />
               </div>
               <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Geointerp</div>
                    <textarea value={minGeo} onChange={e=>setMinGeo(e.target.value)} style={{width: '100%', height: '60px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box'}} />
               </div>
            </div>
          </>
        )}

        {/* GEOCOMENT */}
        {activeDataSet === 'COMENTARIO' && (
          <>
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Comentario</div>
                <textarea value={geoComent} onChange={e=>setGeoComent(e.target.value)} style={{width: '100%', height: '200px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none', boxSizing: 'border-box', padding: '8px', fontSize: '12px'}} />
            </div>
          </>
        )}

        {/* LOGUEADO POR */}
        {activeDataSet === 'LOGUEADO POR' && (
          <>
            {renderDropdown('Logueado Por', '', ()=>{}, ((domainsData as any).LoggedBy ? Object.keys((domainsData as any).LoggedBy) : []))}
          </>
        )}

        {/* DIAMETRO DE LINEA */}
        {activeDataSet === 'DIAMETRO DE LINEA' && (
          <>
            {renderDropdown('Diámetro de Línea', '', ()=>{}, ((domainsData as any).DiameterLine ? Object.keys((domainsData as any).DiameterLine) : []))}
          </>
        )}

        {/* RQD */}
        {activeDataSet === 'RQD' && (
          <>
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>RQD (%)</div>
                <input type="number" min="0" max="100" style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
            </div>
          </>
        )}
      </div>

      {/* Bottom Save Bar */}
      {/* Bottom Save Bar */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
        <button style={{ background: 'none', cursor: 'pointer', color: '#aaa', fontSize: '18px', padding: '4px', borderRadius: '50%', border: '1px solid #eee' }}>
           ←
        </button>
        <button onClick={handleSave} style={{ padding: '6px 32px', borderRadius: '16px', border: 'none', backgroundColor: activeHole ? '#005b7f' : '#ccc', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: activeHole ? 'pointer' : 'not-allowed' }}>
          Save
        </button>
      </div>
    </div>
  );
}
