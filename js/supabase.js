// Configuracion central de Supabase.
// 1. Crea tu proyecto en https://supabase.com
// 2. Copia la URL y la anon public key en estas constantes.
const SUPABASE_URL = "https://dssuqiihmopipydajpde.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzc3VxaWlobW9waXB5ZGFqcGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzY0OTYsImV4cCI6MjA5NTU1MjQ5Nn0.A8y9o_Lpd1Iwxat0FoqF-fLIj0QkmUMuqfhrH8Jc4Us";

window.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
