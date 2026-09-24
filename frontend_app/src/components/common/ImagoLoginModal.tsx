import React, { useState } from 'react';
import { loginToImago, fetchImagoWorkspaces, fetchImagoImages } from '../../services/imagoService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadImages: (images: {name: string, url: string}[]) => void;
}

export default function ImagoLoginModal({ isOpen, onClose, onLoadImages }: Props) {
  const [step, setStep] = useState<'login' | 'select'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [token, setToken] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const t = await loginToImago(username, password);
      setToken(t);
      const ws = await fetchImagoWorkspaces(t);
      setWorkspaces(ws);
      setStep('select');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceChange = async (wsId: string) => {
    setSelectedWorkspace(wsId);
    if (!wsId) return;
    setLoading(true);
    try {
      const imgs = await fetchImagoImages(token, wsId);
      setImages(imgs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleImage = (id: number) => {
    const newSet = new Set(selectedImages);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedImages(newSet);
  };

  const handleImport = () => {
    const toImport = images.filter(i => selectedImages.has(i.id));
    onLoadImages(toImport);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="rqd-card" style={{ width: '500px', backgroundColor: 'var(--bg-surface)', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h4 style={{ margin: 0, color: 'var(--primary)' }}>☁️ Imago Seequent</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
        </div>

        {error && <div className="alert alert-danger" style={{ color: 'red', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>}

        {step === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Usuario / Email (Imago)</label>
              <input type="text" className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group mt-3">
              <label>Contraseña</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
              <p style={{fontSize: '0.75rem', marginTop: '8px'}} className="text-muted">
                Tip: Usa <b>demo / demo</b> si quieres probar el flujo simulado.
              </p>
            </div>
            <button type="submit" className="btn btn-primary w-100 mt-4" disabled={loading}>
              {loading ? 'Conectando...' : 'Iniciar Sesión en Imago'}
            </button>
          </form>
        ) : (
          <div>
            <div className="form-group">
              <label>Selecciona un Proyecto (Workspace)</label>
              <select className="form-control" value={selectedWorkspace} onChange={e => handleWorkspaceChange(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>

            {loading && <div style={{textAlign: 'center', padding: '20px'}}>Cargando imágenes...</div>}

            {!loading && images.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '8px', display: 'block' }}>Imágenes disponibles</label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px' }}>
                  {images.map(img => (
                    <label key={img.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input type="checkbox" style={{ marginRight: '8px' }} checked={selectedImages.has(img.id)} onChange={() => toggleImage(img.id)} />
                      {img.name}
                    </label>
                  ))}
                </div>
                <button className="btn btn-primary w-100 mt-3" onClick={handleImport} disabled={selectedImages.size === 0}>
                  Importar {selectedImages.size} Imágenes
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
