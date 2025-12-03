import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase não configurado - variáveis de ambiente ausentes');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (supabase) {
  console.log('✓ Supabase Storage configurado');
} else {
  console.log('❌ Supabase Storage não configurado');
}

export default supabase;