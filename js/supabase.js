// Configuracion central de Supabase.
// NOTA SEGURIDAD: la anon key es publica por diseño en Supabase.
// La proteccion real viene de Row Level Security (RLS) en el dashboard.
const SUPABASE_URL = "https://dssuqiihmopipydajpde.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzc3VxaWlobW9waXB5ZGFqcGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzY0OTYsImV4cCI6MjA5NTU1MjQ5Nn0.A8y9o_Lpd1Iwxat0FoqF-fLIj0QkmUMuqfhrH8Jc4Us";

// Storage con fallback: si Tracking Prevention bloquea localStorage,
// usa sessionStorage. Si ambos estan bloqueados, sesion dura solo el tab.
const _buildStorage = () => ({
  getItem(key) {
    try { return window.localStorage.getItem(key); }
    catch (_) {
      try { return window.sessionStorage.getItem(key); }
      catch (_) { return null; }
    }
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); return; }
    catch (_) {}
    try { window.sessionStorage.setItem(key, value); }
    catch (_) {}
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch (_) {}
    try { window.sessionStorage.removeItem(key); } catch (_) {}
  },
});

window.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          _buildStorage(),
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});
