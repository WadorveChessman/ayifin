'use strict';
/* AYIFIN — Connecteur Supabase
   ⚠️ REMPLACEZ ces 2 constantes par vos vraies clés
   (Supabase → Settings → API) */

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

/* Auth */
async function sbSignIn(email, password){
  const {data,error} = await sb.auth.signInWithPassword({email,password});
  if(error) throw error;
  return data;
}
async function sbSignOut(){ await sb.auth.signOut(); }
async function sbGetSession(){
  const {data} = await sb.auth.getSession();
  return data?.session||null;
}
async function sbGetUser(){
  const {data:{user}} = await sb.auth.getUser();
  return user;
}

/* Charger le profil + entreprise de l'utilisateur connecté */
async function sbLoadProfile(){
  const user = await sbGetUser();
  if(!user) return null;
  const {data,error} = await sb
    .from('users')
    .select('*, entreprises(*)')
    .eq('id', user.id)
    .maybeSingle();
  if(error) throw error;
  return data;
}

/* Charger toutes les données de l'entreprise */
async function sbLoadAll(entrepriseId){
  const tables = ['clients','comptes','depots','retraits','transactions','prets','echeances','paiements_pret','garanties','types_compte','types_pret'];
  const out = {};
  for(const t of tables){
    const {data,error} = await sb.from(t).select('*').eq('entreprise_id',entrepriseId);
    out[t] = error ? [] : (data||[]);
  }
  return out;
}

/* Realtime : abonnement aux changements */
function sbSubscribe(entrepriseId, onChange){
  const channel = sb.channel('ayifin-'+entrepriseId);
  const tables = ['clients','comptes','depots','retraits','transactions','prets','echeances','paiements_pret','garanties','entreprises'];
  tables.forEach(t=>{
    channel.on('postgres_changes',
      {event:'*', schema:'public', table:t, filter:`entreprise_id=eq.${entrepriseId}`},
      payload => onChange(t, payload)
    );
  });
  channel.on('postgres_changes',
    {event:'UPDATE', schema:'public', table:'entreprises', filter:`id=eq.${entrepriseId}`},
    payload => onChange('entreprises', payload)
  );
  channel.subscribe();
  return channel;
}

/* Upload logo vers Supabase Storage */
async function sbUploadLogo(entrepriseId, file){
  const ext = file.name.split('.').pop()||'png';
  const path = `${entrepriseId}/logo-${Date.now()}.${ext}`;
  const {error} = await sb.storage.from('logos').upload(path, file, {upsert:true});
  if(error) throw error;
  const {data} = sb.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}
