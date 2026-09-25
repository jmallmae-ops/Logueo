// URL base del backend.
// - Producción (Coolify): vacío → las llamadas van a /api en el mismo dominio (https://datageo.site/api/...)
// - Otro servidor: definir VITE_API_URL en el build, p. ej. VITE_API_URL=https://api.datageo.site
export const API_BASE: string = (import.meta as any).env?.VITE_API_URL ?? '';
