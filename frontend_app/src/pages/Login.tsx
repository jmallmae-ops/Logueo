import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';


export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    // Simulate slight delay for UX
    setTimeout(() => {
      if (username === 'admin' && password === '123') {
        localStorage.setItem('imagoToken', 'dummy_admin_token');
        navigate('/workspace');
      } else {
        setErrorMsg('Usuario o contraseña incorrectos.');
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div 
      style={{ 
        display: 'flex', 
        height: '100vh', 
        width: '100vw',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundImage: "url('/Lienzo.jpg')",
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column'
      }}
    >
      <img 
        src="/Logo_Buenaventura.png" 
        alt="Logo Buenaventura" 
        style={{ width: '300px', height: '300px', marginBottom: '20px', objectFit: 'contain' }} 
      />
      
      <h1 style={{ 
        fontSize: '32px', 
        color: 'gold', 
        fontWeight: 'bold', 
        marginBottom: '40px', 
        textAlign: 'center', 
        textShadow: '1px 1px 4px rgba(0,0,0,0.8)' 
      }}>
        GEOLOGICAL LOGGING
      </h1>

      <div 
        style={{ 
          width: '80%', 
          maxWidth: '300px', 
          backgroundColor: 'rgba(255,255,255,0.95)', 
          padding: '25px', 
          borderRadius: '15px', 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center', 
          boxShadow: '0 8px 10px rgba(0,0,0,0.3)' 
        }}
      >
        {errorMsg && (
          <div style={{ color: '#DC2626', marginBottom: '15px', fontSize: '14px', textAlign: 'center', fontWeight: 'bold' }}>
            {errorMsg}
          </div>
        )}
        
        <form onSubmit={handleLogin} style={{ width: '100%' }}>
          <input 
            type="text" 
            style={{ 
              width: '100%', 
              border: '1px solid #E5E7EB', 
              borderRadius: '8px', 
              padding: '12px', 
              marginBottom: '15px',
              boxSizing: 'border-box'
            }}
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario"
            required
          />

          <input 
            type="password" 
            style={{ 
              width: '100%', 
              border: '1px solid #E5E7EB', 
              borderRadius: '8px', 
              padding: '12px', 
              marginBottom: '20px',
              boxSizing: 'border-box'
            }}
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
          />

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '15px 0', 
              backgroundColor: loading ? '#9CA3AF' : '#4C9A2A', 
              color: 'white', 
              border: 'none', 
              borderRadius: '30px', 
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 5px 5px rgba(0,0,0,0.2)'
            }}
          >
            {loading ? 'Conectando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
