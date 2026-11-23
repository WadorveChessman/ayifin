'use strict';
/* AYIFIN — Connecteur Supabase
   ⚠️ REMPLACEZ ces 2 constantes par vos vraies clés */

const SUPABASE_URL = 'https://myqhbcdpaupphmepyufz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ORLo5kzk_L8q1OhD-6fFPQ_YIKJgcKu';

let sb = null;

function initSupabase(){
  if(typeof window.supabase==='undefined'){
    console.error('❌ SDK Supabase non chargé');
    return false;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase initialisé');
  return true;
}

async function sbSignIn(email, password){
  if(!sb) throw new Error('Supabase non initialisé');
  const {data, error} = await sb.auth.signInWithPassword({email,password});
  if(error) throw error;
  return data;
}
async function sbSignOut(){
  if(!sb) return;
  try{ await sb.auth.signOut(); }catch(e){}
}
async function sbGetSession(){
  if(!sb) return null;
  try{
    const {data} = await sb.auth.getSession();
    return data?.session || null;
  }catch(e){ return null; }
}
async function sbGetUser(){
  if(!sb) return null;
  try{
    const {data:{user}} = await sb.auth.getUser();
    return user;
  }catch(e){ return null; }
}

async function sbLoadProfile(){
  if(!sb) return null;
  const user = await sbGetUser();
  if(!user) return null;
  const {data, error} = await sb
    .from('users')
    .select('*, entreprises(*)')
    .eq('id', user.id)
    .maybeSingle();
  if(error){ console.error('sbLoadProfile:', error); return null; }
  return data;
}

async function sbLoadAll(entrepriseId){
  if(!sb || !entrepriseId) return {};
  const tables = ['clients','comptes','depots','retraits','transactions','prets','echeances','paiements_pret','garanties','types_compte','types_pret'];
  const out = {};
  for(const t of tables){
    try{
      const {data, error} = await sb.from(t).select('*').eq('entreprise_id', entrepriseId);
      out[t] = error ? [] : (data||[]);
      if(error) console.warn('loadAll:'+t, error.message);
    }catch(e){ out[t] = []; }
  }
  return out;
}

function sbSubscribe(entrepriseId, onChange){
  if(!sb) return null;
  try{
    const channel = sb.channel('ayifin-'+entrepriseId);
    const tables = ['clients','comptes','depots','retraits','transactions','prets','echeances','paiements_pret','garanties','entreprises'];
    tables.forEach(t=>{
      channel.on('postgres_changes',
        {event:'*', schema:'public', table:t, filter:`entreprise_id=eq.${entrepriseId}`},
        payload => onChange(t, payload)
      );
    });
    channel.subscribe();
    return channel;
  }catch(e){
    console.warn('sbSubscribe:', e);
    return null;
  }
}

async function sbUploadLogo(entrepriseId, file){
  if(!sb) throw new Error('Supabase non initialisé');
  const ext = (file.name.split('.').pop()||'png').toLowerCase();
  const path = `${entrepriseId}/logo-${Date.now()}.${ext}`;
  const {error} = await sb.storage.from('logos').upload(path, file, {upsert:true, contentType:file.type});
  if(error) throw error;
  const {data} = sb.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}
