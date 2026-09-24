import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File, sondaje: string, from: string, to: string) => void;
  initialSondaje?: string;
  initialFrom?: string;
}

export default function CameraCropModal({ isOpen, onClose, onConfirm, initialSondaje, initialFrom }: Props) {
  const [sondaje, setSondaje] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialSondaje) setSondaje(initialSondaje);
      if (initialFrom) setFrom(initialFrom);
      setTo('');
      setImageSrc(null);
      setStream(null);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, initialSondaje, initialFrom]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Error reproduciendo cámara:", e));
    }
  }, [stream]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 4096 },
          height: { ideal: 2160 }
        } 
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (e) {
      alert("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setImageSrc(canvas.toDataURL('image/jpeg', 1.0));
    }
    stopCamera();
  };

  const cancelCamera = () => {
    stopCamera();
  };

  // Fallback for file picker if WebRTC is not preferred or fails
  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const generateCroppedImage = async () => {
    if (!completedCrop || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const cropWidthInPixels = Math.floor(completedCrop.width * scaleX);
    const cropHeightInPixels = Math.floor(completedCrop.height * scaleY);
    canvas.width = cropWidthInPixels;
    canvas.height = cropHeightInPixels;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // We want maximum quality rendering without blur
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      cropWidthInPixels,
      cropHeightInPixels
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const fileName = `${sondaje}_${from}_${to}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      onConfirm(file, sondaje, from, to);
      setImageSrc(null);
      stopCamera();
      onClose();
    }, 'image/jpeg', 1.0);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflowY: 'auto'
    }}>
      <div className="rqd-card" style={{ width: '600px', backgroundColor: 'var(--bg-surface)', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h4 style={{ margin: 0, color: 'var(--primary)' }}>📸 Tomar Foto de Caja</h4>
          <button onClick={() => { stopCamera(); onClose(); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
        </div>

        {stream ? (
          <div>
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              <video 
                ref={videoRef} 
                style={{ width: '100%', display: 'block' }} 
                autoPlay 
                playsInline
                muted
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-default w-100" onClick={cancelCamera}>Cancelar</button>
              <button className="btn btn-primary w-100" onClick={takePhoto}>Capturar</button>
            </div>
          </div>
        ) : !imageSrc ? (
          <div>
            <div className="form-group mb-3">
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nombre del Sondaje</label>
              <input type="text" className="form-control" value={sondaje} onChange={e => setSondaje(e.target.value)} placeholder="Ej: DDH-CP-001" required />
            </div>
            <div className="row mb-3" style={{ display: 'flex', gap: '10px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Desde (m)</label>
                <input type="number" step="0.01" className="form-control" value={from} onChange={e => setFrom(e.target.value)} placeholder="0.00" required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Hasta (m)</label>
                <input type="number" step="0.01" className="form-control" value={to} onChange={e => setTo(e.target.value)} placeholder="3.00" required />
              </div>
            </div>
            <div className="form-group mt-4">
              <button 
                className={`btn ${(!sondaje || !from || !to) ? 'btn-default' : 'btn-primary'} w-100 mb-2`} 
                onClick={startCamera}
                disabled={!sondaje || !from || !to}
                style={{ padding: '12px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                📷 Activar Cámara
              </button>
              
              <div style={{ textAlign: 'center', margin: '10px 0' }}>o</div>
              
              <label className={`btn ${(!sondaje || !from || !to) ? 'btn-default' : 'btn-outline-primary'} w-100`} style={{ cursor: (!sondaje || !from || !to) ? 'not-allowed' : 'pointer', padding: '12px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                📁 Subir archivo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onSelectFile}
                  style={{ display: 'none' }}
                  disabled={!sondaje || !from || !to}
                />
              </label>

              {(!sondaje || !from || !to) && <small className="text-danger mt-2 d-block text-center">Completa los campos arriba para habilitar las opciones.</small>}
            </div>
          </div>
        ) : (
          <div>
            <p style={{fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '8px'}}>Ajusta y recorta los 4 bordes de la foto para enfocar la caja.</p>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#f0f0f0', border: '1px solid #ccc', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  style={{ maxWidth: '100%' }}
                  onLoad={e => {
                    setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
                  }}
                />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-default w-100" onClick={() => setImageSrc(null)}>Reintentar Foto</button>
              <button className="btn btn-primary w-100" onClick={generateCroppedImage} disabled={!completedCrop?.width || !completedCrop?.height}>Confirmar y Agregar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
