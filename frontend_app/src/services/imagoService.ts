const IMAGO_BASE_URL = 'https://portal.imago.live/api/v3';

export async function loginToImago(username: string, password: string): Promise<string> {
  try {
    const response = await fetch(IMAGO_BASE_URL + '/Login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('Credenciales inválidas o error de conexión');
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.warn("Fallo en la llamada real a Imago (Posible CORS). Usando MOCK para desarrollo.");
    if (username === 'demo' && password === 'demo') {
      return 'mock-token-12345';
    }
    throw new Error('No se pudo conectar a Imago Seequent. Revisa tus credenciales o bloqueos de red (CORS).');
  }
}

export async function fetchImagoWorkspaces(token: string): Promise<any[]> {
  try {
    const response = await fetch(IMAGO_BASE_URL + '/Workspaces', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    if (!response.ok) throw new Error('Error al cargar workspaces');
    return await response.json();
  } catch (error) {
    if (token === 'mock-token-12345') {
      return [
        { id: 1, name: "Proyecto Mina Sur" },
        { id: 2, name: "Exploración 2026" }
      ];
    }
    throw error;
  }
}

export async function fetchImagoImages(token: string, workspaceId: string): Promise<any[]> {
  try {
    const response = await fetch(IMAGO_BASE_URL + '/Workspaces/' + workspaceId + '/Images', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    if (!response.ok) throw new Error('Error al cargar imágenes');
    return await response.json();
  } catch (error) {
    if (token === 'mock-token-12345') {
      return [
        { id: 101, name: "DDH-01_10.0-15.0m", url: "https://picsum.photos/1024/200" },
        { id: 102, name: "DDH-01_15.0-20.0m", url: "https://picsum.photos/1024/200" }
      ];
    }
    throw error;
  }
}
