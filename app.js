'use strict';
/* AYIFIN — Ayiti Finans — v3.2
   Connexion robuste + Supabase multi-utilisateur. */

/* ============================================================
   SECTION 1 — UTILITAIRES
   ============================================================ */
const T='ayf_theme';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const today=()=>iso(new Date()),now=()=>new Date().toISOString();
const r2=n=>Math.round((+n+Number.EPSILON)*100)/100;
const money=n=>r2(n).toLocaleString('fr-FR')+' G';
const fd=d=>{if(!d)return'';return String(d).slice(0,10).split('-').reverse().join('/')};
const addMonths=(d,n)=>{const x=new Date(d);x.setMonth(x.getMonth()+n);return x};
const empty=m=>`<p class="empty">${m}</p>`;
const dl=(n,t,m)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click()};

/* ============================================================
   SECTION 2 — ÉTAT GLOBAL
   ============================================================ */
let db = {
  entreprise:null,
  user:null,
  clients:[], comptes:[], depots:[], retraits:[], transactions:[],
  prets:[], echeances:[], paiements_pret:[], garanties:[],
  types_compte:[], types_pret:[]
};
let F = {q:'',pstatut:'Tous'};
let realtimeChannel = null;

/* ============================================================
   SECTION 3 — UI
   ============================================================ */
function toast(m,err){
  const t=$('#toast');
  if(!t){console.log('[toast]',m);return}
  t.textContent=m;t.className=err?'err show':'show';
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.className='',3600);
}
const modal=h=>{const m=$('#modal');if(!m)return;m.innerHTML=`<div class="sheet">${h}</div>`;m.hidden=false};
const closeM=()=>{const m=$('#modal');if(m)m.hidden=true};

/* ============================================================
   SECTION 4 — THÈME
   ============================================================ */
function theme(){
  try{
    const t=localStorage.getItem(T)||'auto';
    const dark=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
  }catch(e){}
}

/* ============================================================
   SECTION 5 — CHARGEMENT DES DONNÉES
   ============================================================ */
async function loadAll(){
  if(!db.entreprise) return;
  const data = await sbLoadAll(db.entreprise.id);
  db.clients = data.clients||[];
  db.comptes = data.comptes||[];
  db.depots = data.depots||[];
  db.retraits = data.retraits||[];
  db.transactions = data.transactions||[];
  db.prets = data.prets||[];
  db.echeances = data.echeances||[];
  db.paiements_pret = data.paiements_pret||[];
  db.garanties = data.garanties||[];
  db.types_compte = data.types_compte||[];
  db.types_pret = data.types_pret||[];
}

async function initSession(){
  try{
    /* 1. Vérifier la session Supabase */
    const session = await sbGetSession();
    if(!session){
      console.warn('initSession: pas de session Supabase');
      render();
      return;
    }
    console.log('initSession: session OK pour', session.user?.email);

    /* 2. Charger le profil (table public.users) */
    let profile = null;
    try {
      profile = await sbLoadProfile();
    } catch(err){
      console.error('initSession: sbLoadProfile a échoué', err);
    }

    /* 3. Si le profil manque, on NE déconnecte PAS — on affiche un message clair */
    if(!profile){
      console.warn('initSession: profil public.users manquant pour', session.user?.email);
      const user = await sbGetUser();
      db.user = {
        id: user.id,
        username: user.email,
        role: 'AGENT',
        entreprise_id: null
      };
      db.entreprise = null;
      toast('Connexion OK mais profil absent dans public.users. Voir la console.', 1);
      render();
      return;
    }

    /* 4. Si l'entreprise manque, message clair */
    if(!profile.entreprises){
      console.warn('initSession: entreprise manquante pour le profil', profile);
      db.user = profile;
      db.entreprise = null;
      toast('Aucune entreprise liée à votre compte.', 1);
      render();
      return;
    }

    /* 5. Succès */
    db.user = profile;
    db.entreprise = profile.entreprises;
    await loadAll();
    subscribeRealtime();
    render();
  }catch(err){
    console.error('initSession:', err);
    toast('Erreur d\'initialisation : ' + (err?.message||''), 1);
    render();
  }
}

function subscribeRealtime(){
  if(!db.entreprise) return;
  if(realtimeChannel){ try{ sb.removeChannel(realtimeChannel); }catch(e){} realtimeChannel=null; }
  realtimeChannel = sbSubscribe(db.entreprise.id, async ()=>{
    await loadAll();
    render();
  });
}

/* ============================================================
   SECTION 6 — CALCULS
   ============================================================ */
function globalStats(){
  const prets=db.prets,echs=db.echeances,comptes=db.comptes,depots=db.depots,retraits=db.retraits,paiements=db.paiements_pret;
  const pretsActifs=prets.filter(p=>['EN_COURS','RETARD','APPROUVE'].includes(p.statut));
  const epargne=r2(comptes.reduce((s,c)=>s+(+c.solde||0),0));
  const totalDepots=r2(depots.reduce((s,d)=>s+(+d.montant||0),0));
  const totalRetraits=r2(retraits.reduce((s,d)=>s+(+d.montant||0),0));
  const totalDecaisses=r2(prets.filter(p=>['EN_COURS','RETARD','APPROUVE','REMBOURSE'].includes(p.statut)).reduce((s,p)=>s+(+p.montant||0),0));
  const totalRembourses=r2(paiements.reduce((s,x)=>s+(+x.montant||0),0));
  const caisse=r2(totalDepots-totalRetraits-totalDecaisses+totalRembourses);
  const interets=r2(paiements.reduce((s,x)=>s+(+x.interet_paye||0),0));
  return {
    clients:db.clients.length,comptes:comptes.length,
    prets_actifs:pretsActifs.length,prets_total:prets.length,
    demandes:prets.filter(p=>p.statut==='DEMANDE').length,
    alertes:echs.filter(e=>e.statut==='EN_ATTENTE'&&e.date_echeance<today()).length,
    solde_total:epargne,encours_prets:r2(pretsActifs.reduce((s,p)=>s+(+p.solde_restant||0),0)),
    depots_total:totalDepots,retraits_total:totalRetraits,
    caisse,decaissements_total:totalDecaisses,remboursements_total:totalRembourses,interets_gagnes:interets
  };
}
const clientById=id=>db.clients.find(c=>c.id===id);
const compteById=id=>db.comptes.find(c=>c.id===id);
const typeCompteById=id=>db.types_compte.find(t=>t.id===id);
const typePretById=id=>db.types_pret.find(t=>t.id===id);
const pretById=id=>db.prets.find(p=>p.id===id);

function calcMensualite(capital,tauxMensuel,duree){
  if(duree<=0)throw new Error('Durée invalide');
  const c=+capital,t=+tauxMensuel/100,d=+duree;
  if(t===0)return r2(c/d);
  return r2((c+c*t*d)/d);
}
function genEcheancier(capital,tauxMensuel,duree,dateDebut){
  const mens=calcMensualite(capital,tauxMensuel,duree);
  const t=+tauxMensuel/100;
  let capRest=+capital,totalPaye=0,list=[];
  for(let i=1;i<=duree;i++){
    const interet=r2(capRest*t);
    let capRem,montant;
    if(i===duree){capRem=r2(capRest);montant=r2(capRem+interet)}
    else{capRem=r2(mens-interet);if(capRem>capRest)capRem=r2(capRest);montant=mens}
    capRest=r2(Math.max(0,capRest-capRem));
    totalPaye=r2(totalPaye+montant);
    const solde=r2(Math.max(0,mens*duree-totalPaye));
    const de=addMonths(new Date(dateDebut+'T12:00:00'),i);
    list.push({numero_echeance:i,date_echeance:iso(de),montant_echeance:montant,capital:capRem,interet,solde_restant:solde,statut:'EN_ATTENTE'});
  }
  if(list.length)list[list.length-1].solde_restant=0;
  return list;
}

/* ============================================================
   SECTION 7 — ICÔNES & NAV
   ============================================================ */
const I={
  home:'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z',
  users:'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.9',
  card:'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l14-3v3M16 14h2',
  plus:'M12 5v14M5 12h14',
  money:'M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6',
  clock:'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  chart:'M4 20V10M10 20V4M16 20v-8M22 20H2',
  gear:'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12h2M3 12h2M12 3v2M12 19v2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'
};
const ico=n=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${I[n]||''}"/></svg>`;
const NAV=[
  ['dashboard','Accueil','home'],['clients','Clients','users'],['comptes','Comptes','card'],
  ['operations','Opérations','plus'],['prets','Prêts','money'],['echeances','Échéances','clock'],
  ['rapports','Rapports','chart'],['settings','Réglages','gear']
];

/* ============================================================
   SECTION 8 — COMPOSANTS
   ============================================================ */
const clientOpts=(pre='')=>`<option value="">— Choisir —</option>`+
  db.clients.filter(c=>c&&c.nom_complet).sort((a,b)=>String(a.nom_complet||'').localeCompare(String(b.nom_complet||'')))
    .map(c=>`<option value="${esc(c.id)}" ${c.id===pre?'selected':''}>${esc(c.nom_complet)}</option>`).join('');
const compteOpts=(pre='')=>`<option value="">— Choisir —</option>`+
  db.comptes.filter(c=>c&&c.statut==='ACTIF').map(c=>{const cl=clientById(c.client_id);return`<option value="${esc(c.id)}" ${c.id===pre?'selected':''}>${esc(c.numero_compte_interne||'')} — ${esc(cl?cl.nom_complet:'?')}</option>`}).join('');
const typeCompteOpts=(pre='')=>db.types_compte.filter(t=>t&&t.actif).map(t=>`<option value="${t.id}" ${t.id===+pre?'selected':''}>${esc(t.nom||'')}</option>`).join('');
const typePretOpts=(pre='')=>db.types_pret.filter(t=>t&&t.actif).map(t=>`<option value="${t.id}" ${t.id===+pre?'selected':''}>${esc(t.nom||'')}</option>`).join('');
const statutBadge=s=>{
  const map={ACTIF:'green',SUSPENDU:'or',FERME:'red',EN_COURS:'blue',RETARD:'red',REMBOURSE:'green',DEMANDE:'or',APPROUVE:'blue',REJETE:'red',PAYE:'green',EN_ATTENTE:'or',ANNULE:'red'};
  const k=String(s||'');return `<span class="badge ${map[k]||''}">${esc(k)}</span>`;
};

/* ============================================================
   SECTION 9 — VUES
   ============================================================ */
const V={};

const loginV=()=>`
<div class="auth">
  <h1>AYIFIN</h1>
  <p>Ayiti Finans — Gestion de microfinance</p>
  <form id="flogin" class="form">
    <label>Email<input name="email" type="email" required autocomplete="username" value="admin@ayifin.com"></label>
    <label>Mot de passe<input name="pw" type="password" required autocomplete="current-password" value="Admin@2025!"></label>
    <button class="btn big" type="submit">Se connecter</button>
  </form>
  <div style="margin-top:20px;padding:12px;background:var(--bg);border-radius:10px;font-size:.8rem;color:var(--mu)">
    <b>🔑 Admin local (toujours disponible)</b><br>
    <code>admin@ayifin.com</code> / <code>Admin@2025!</code>
  </div>
</div>`;

V.dashboard=()=>{
  const s=globalStats();
  const card=(l,v,c)=>`<div class="card"><small>${l}</small><b class="n ${c||''}">${v}</b></div>`;
  const alertes=db.echeances.filter(e=>e.statut==='EN_ATTENTE'&&e.date_echeance<today()).slice(0,5).map(e=>{
    const p=pretById(e.pret_id);const cl=p?clientById(p.client_id):null;
    const jr=Math.floor((new Date()-new Date(e.date_echeance+'T12:00:00'))/864e5);
    return `<div class="alert ${jr>30?'danger':'warning'}"><b>${esc(cl?cl.nom_complet:'?')}</b> — Échéance #${e.numero_echeance} en retard de ${jr} jours (${money(e.montant_echeance)})</div>`;
  }).join('');
  return `<div class="grid">
    ${card('Clients',s.clients,'')}${card('Comptes',s.comptes,'')}${card('Prêts actifs',s.prets_actifs,'')}
    ${card('Demandes en attente',s.demandes,'or')}${card('Épargne clients',money(s.solde_total),'green')}
    ${card('Caisse',money(s.caisse),s.caisse>=0?'green':'red')}
    ${card('Encours prêts',money(s.encours_prets),'red')}
    ${card('Décaissements',money(s.decaissements_total),'red')}
    ${card('Remboursements',money(s.remboursements_total),'green')}
    ${card('Intérêts gagnés',money(s.interets_gagnes),'green')}
    ${card('Dépôts',money(s.depots_total),'green')}
    ${card('Retraits',money(s.retraits_total),'red')}
    <div class="card net"><small>Alertes retard</small><b class="n">${s.alertes}</b></div>
  </div>
  ${alertes?`<h2>⚠️ Alertes de retard</h2>${alertes}`:''}
  <div class="acts">
    <a class="btn" href="#/clients">+ Client</a>
    <a class="btn alt" href="#/prets">+ Prêt</a>
    <a class="btn alt" href="#/operations">Opération</a>
    <a class="btn alt" href="#/rapports">Rapports</a>
  </div>
  <h2>Derniers prêts</h2>
  ${[...db.prets].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,5).map(p=>{
    const cl=clientById(p.client_id);
    return `<a class="row" href="#/pret/${esc(p.id)}"><div><b>${esc(p.numero_pret||'')}</b>${statutBadge(p.statut)}<small>${esc(cl?cl.nom_complet:'?')} · ${fd(p.date_debut)}</small></div><div class="amt">${money(p.montant||0)}<small>reste ${money(p.solde_restant||0)}</small></div></a>`;
  }).join('')||empty('Aucun prêt')}`;
};

const clist=()=>{
  const q=(F.q||'').toLowerCase();
  const list=db.clients.filter(c=>c&&c.nom_complet)
    .filter(c=>!q||String(c.nom_complet||'').toLowerCase().includes(q)
      ||String(c.nif_cin||'').toLowerCase().includes(q)
      ||String(c.telephone||'').includes(q))
    .sort((a,b)=>String(a.nom_complet||'').localeCompare(String(b.nom_complet||'')));
  return list.map(c=>{
    const comptes=db.comptes.filter(x=>x&&x.client_id===c.id);
    const solde=r2(comptes.reduce((s,x)=>s+(+x.solde||0),0));
    return `<a class="row" href="#/client/${esc(c.id)}"><div><b>${esc(c.nom_complet)}</b><small>${esc(c.nif_cin||'')} · ${esc(c.telephone||'')}</small></div><div class="amt"><b>${money(solde)}</b><small>${comptes.length} compte(s)</small></div></a>`;
  }).join('')||empty('Aucun client');
};
V.clients=()=>`<div class="bar"><input id="q" data-f="q" placeholder="Rechercher…" value="${esc(F.q||'')}"><button class="btn" data-a="cform">+ Client</button></div><div id="clist">${clist()}</div>`;

V.client=id=>{
  const c=clientById(id);if(!c)return empty('Client introuvable');
  const comptes=db.comptes.filter(x=>x.client_id===id);
  const prets=db.prets.filter(p=>p.client_id===id);
  return `<div class="card"><h2 style="margin:0">${esc(c.nom_complet)}</h2>
    <small>NIF: ${esc(c.nif_cin||'')} · Tél: ${esc(c.telephone||'')}</small>
    <small>${esc(c.adresse||'')}${c.ville?', '+esc(c.ville):''}</small>
    <div class="acts"><button class="btn" data-a="cform" data-id="${esc(id)}">Modifier</button><button class="btn del" data-a="delc" data-id="${esc(id)}">Supprimer</button></div></div>
  <h2>Comptes (${comptes.length})</h2>
  ${comptes.map(cp=>{const t=typeCompteById(cp.type_compte_id);return`<a class="row" href="#/compte/${esc(cp.id)}"><div><b>${esc(cp.numero_compte_interne||'')}</b>${statutBadge(cp.statut)}<small>${esc(t?t.nom:'?')}</small></div><div class="amt green">${money(cp.solde||0)}</div></a>`}).join('')||empty('Aucun compte')}
  <button class="btn big" data-a="ccompte" data-id="${esc(id)}">+ Ouvrir un compte</button>
  <h2>Prêts (${prets.length})</h2>
  ${prets.map(p=>`<a class="row" href="#/pret/${esc(p.id)}"><div><b>${esc(p.numero_pret||'')}</b>${statutBadge(p.statut)}<small>${fd(p.date_debut)} → ${fd(p.date_fin)}</small></div><div class="amt">${money(p.montant||0)}<small>reste ${money(p.solde_restant||0)}</small></div></a>`).join('')||empty('Aucun prêt')}`;
};

V.comptes=()=>{
  const list=[...db.comptes].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  return `<div class="bar"><button class="btn" data-a="ccompte">+ Ouvrir un compte</button></div>
  ${list.map(cp=>{const cl=clientById(cp.client_id);const t=typeCompteById(cp.type_compte_id);return`<a class="row" href="#/compte/${esc(cp.id)}"><div><b>${esc(cp.numero_compte_interne||'')}</b>${statutBadge(cp.statut)}<small>${esc(cl?cl.nom_complet:'?')} · ${esc(t?t.nom:'?')}</small></div><div class="amt green">${money(cp.solde||0)}</div></a>`}).join('')||empty('Aucun compte')}`;
};

V.compte=id=>{
  const cp=compteById(id);if(!cp)return empty('Compte introuvable');
  const cl=clientById(cp.client_id),t=typeCompteById(cp.type_compte_id);
  const dep=db.depots.filter(d=>d.compte_id===id),ret=db.retraits.filter(d=>d.compte_id===id);
  const trx=db.transactions.filter(x=>x.compte_id===id).sort((a,b)=>String(b.date_transaction||'').localeCompare(String(a.date_transaction||''))).slice(0,30);
  return `<div class="card"><h2 style="margin:0">${esc(cp.numero_compte_interne||'')}</h2>${statutBadge(cp.statut)}
    <small>${esc(cl?cl.nom_complet:'?')} · ${esc(t?t.nom:'?')}</small>
    <div class="kpi">
      <div class="card"><small>Solde</small><b class="n green">${money(cp.solde||0)}</b></div>
      <div class="card"><small>Taux</small><b class="n">${t?t.taux+'%':'—'}</b></div>
      <div class="card"><small>Dépôts</small><b class="n">${dep.length}</b></div>
      <div class="card"><small>Retraits</small><b class="n">${ret.length}</b></div>
    </div>
    <div class="acts">
      <button class="btn" data-a="cdepot" data-id="${esc(id)}">+ Dépôt</button>
      <button class="btn alt" data-a="cretrait" data-id="${esc(id)}">− Retrait</button>
      <button class="btn alt" data-a="ccloture" data-id="${esc(id)}">Clôturer</button>
    </div></div>
    <h2>Dernières transactions</h2>
    ${trx.map(x=>`<div class="row"><div><b>${esc(x.type_transaction||'')}</b><small>${fd(x.date_transaction)} · ${esc(x.description||'')}</small></div><div class="amt ${(x.montant||0)<0?'red':'green'}">${money(x.montant||0)}</div></div>`).join('')||empty('Aucune transaction')}`;
};

V.operations=()=>{
  const ops=[...db.depots.map(d=>({k:'D',...d})),...db.retraits.map(d=>({k:'R',...d}))].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  return `<div class="card form">
    <b>Nouvelle opération</b>
    <form id="fop" class="form">
      <label>Compte<select name="compte_id" required>${compteOpts()}</select></label>
      <div class="seg">
        <label><input type="radio" name="type_op" value="DEPOT" checked><span>DÉPÔT</span></label>
        <label><input type="radio" name="type_op" value="RETRAIT"><span>RETRAIT</span></label>
      </div>
      <label>Montant (G)<input name="montant" type="number" step="0.01" min="0.01" required></label>
      <label>Date<input name="date" type="date" value="${today()}" required></label>
      <label>Description<input name="description"></label>
      <button class="btn big">VALIDER L'OPÉRATION</button>
    </form>
  </div>
  <h2>Dernières opérations</h2>
  ${ops.slice(0,30).map(o=>{const cp=compteById(o.compte_id);const cl=cp?clientById(cp.client_id):null;return`<div class="row"><div><b>${o.k==='D'?'Dépôt':'Retrait'}</b><small>${esc(cl?cl.nom_complet:'?')} · ${fd(o.date_operation)}</small></div><div class="amt ${o.k==='D'?'green':'red'}">${o.k==='D'?'+':'-'}${money(o.montant||0)}</div></div>`}).join('')||empty('Aucune opération')}`;
};

V.prets=()=>{
  const statuts=['Tous','DEMANDE','APPROUVE','EN_COURS','RETARD','REMBOURSE','REJETE'];
  const filtre=(F&&F.pstatut)||'Tous';
  const list=db.prets.filter(p=>filtre==='Tous'||p.statut===filtre).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  return `<div class="card"><div class="seg" style="flex-wrap:wrap">${statuts.map(s=>`<label style="flex:0 0 auto;min-width:80px"><input type="radio" name="pstatut" data-f="pstatut" value="${s}" ${filtre===s?'checked':''}><span>${s}</span></label>`).join('')}</div></div>
  <div class="bar"><button class="btn" data-a="cpret">+ Nouveau prêt</button></div>
  ${list.map(p=>{const cl=clientById(p.client_id);return`<a class="row" href="#/pret/${esc(p.id)}"><div><b>${esc(p.numero_pret||'')}</b>${statutBadge(p.statut)}<small>${esc(cl?cl.nom_complet:'?')} · ${fd(p.date_debut)} → ${fd(p.date_fin)}</small></div><div class="amt">${money(p.montant||0)}<small>reste ${money(p.solde_restant||0)}</small></div></a>`}).join('')||empty('Aucun prêt')}`;
};

V.pret=id=>{
  const p=pretById(id);if(!p)return empty('Prêt introuvable');
  const cl=clientById(p.client_id);const tp=typePretById(p.type_pret_id);
  const echs=db.echeances.filter(e=>e.pret_id===id).sort((a,b)=>a.numero_echeance-b.numero_echeance);
  const pays=db.paiements_pret.filter(x=>x.pret_id===id).sort((a,b)=>String(b.date_paiement||'').localeCompare(String(a.date_paiement||'')));
  const totalPaye=r2(pays.reduce((s,x)=>s+(+x.montant||0),0));
  const actions=p.statut==='DEMANDE'
    ?`<button class="btn" data-a="apret" data-id="${esc(id)}">Approuver</button><button class="btn del" data-a="rpret" data-id="${esc(id)}">Rejeter</button>`
    :['EN_COURS','RETARD','APPROUVE'].includes(p.statut)
      ?`<button class="btn" data-a="ppay" data-id="${esc(id)}">+ Paiement</button>`:'';
  return `<div class="card"><h2 style="margin:0">${esc(p.numero_pret||'')}</h2>${statutBadge(p.statut)}
    <small>${esc(cl?cl.nom_complet:'?')} · ${esc(tp?tp.nom:'?')}</small>
    <div class="kpi">
      <div class="card"><small>Montant</small><b class="n">${money(p.montant||0)}</b></div>
      <div class="card"><small>Intérêt</small><b class="n">${money(p.montant_interet||0)}</b></div>
      <div class="card"><small>Total dû</small><b class="n">${money(p.montant_total||0)}</b></div>
      <div class="card"><small>Mensualité</small><b class="n">${money(p.mensualite||0)}</b></div>
      <div class="card"><small>Payé</small><b class="n green">${money(totalPaye)}</b></div>
      <div class="card"><small>Reste</small><b class="n red">${money(p.solde_restant||0)}</b></div>
    </div>
    <div class="acts">${actions}</div>
  </div>
  <h2>Échéancier (${echs.length})</h2>
  <div class="card">${echs.map(e=>`<div class="echeance"><span>#${e.numero_echeance} — ${fd(e.date_echeance)}</span><span class="amt">${money(e.montant_echeance||0)}</span><span class="statut ${e.statut||'EN_ATTENTE'}">${e.statut||'EN_ATTENTE'}</span></div>`).join('')||empty('Aucune échéance')}</div>
  <h2>Paiements (${pays.length})</h2>
  ${pays.map(x=>`<div class="row"><div><b>${fd(x.date_paiement)}</b><small>Capital ${money(x.capital_rembourse||0)} · Intérêt ${money(x.interet_paye||0)}</small></div><div class="amt green">${money(x.montant||0)}</div></div>`).join('')||empty('Aucun paiement')}`;
};

V.echeances=()=>{
  const td=today();
  const list=db.echeances.filter(e=>e.statut==='EN_ATTENTE'||e.statut==='RETARD').sort((a,b)=>String(a.date_echeance||'').localeCompare(String(b.date_echeance||'')));
  const enRetard=list.filter(e=>e.date_echeance<td);
  const proches=list.filter(e=>e.date_echeance>=td&&e.date_echeance<=iso(new Date(Date.now()+7*864e5)));
  const row=e=>{const p=pretById(e.pret_id);const cl=p?clientById(p.client_id):null;const jr=Math.floor((new Date()-new Date(e.date_echeance+'T12:00:00'))/864e5);return`<a class="row" href="#/pret/${esc(e.pret_id)}"><div><b>${esc(cl?cl.nom_complet:'?')}</b><small>${esc(p?p.numero_pret:'?')} · #${e.numero_echeance} · ${fd(e.date_echeance)}</small></div><div class="amt red">${money(e.montant_echeance||0)}<small>${jr>0?jr+' j':''}</small></div></a>`};
  return `<h2>En retard (${enRetard.length})</h2>${enRetard.map(row).join('')||empty('Aucune')}
  <h2>7 prochains jours (${proches.length})</h2>${proches.map(row).join('')||empty('Aucune')}
  <h2>Toutes (${list.length})</h2>${list.slice(0,50).map(row).join('')||empty('Aucune')}`;
};

V.rapports=()=>{
  const s=globalStats();
  const pretsParStatut={};
  db.prets.forEach(p=>{const k=String(p.statut||'?');pretsParStatut[k]=(pretsParStatut[k]||0)+1});
  const totalPrets=Math.max(1,db.prets.length);
  return `<h2>Statistiques générales</h2>
  <div class="kpi">
    <div class="card"><small>Clients</small><b class="n">${s.clients}</b></div>
    <div class="card"><small>Comptes</small><b class="n">${s.comptes}</b></div>
    <div class="card"><small>Épargne clients</small><b class="n green">${money(s.solde_total)}</b></div>
    <div class="card"><small>Caisse</small><b class="n ${s.caisse>=0?'green':'red'}">${money(s.caisse)}</b></div>
    <div class="card"><small>Encours prêts</small><b class="n red">${money(s.encours_prets)}</b></div>
    <div class="card"><small>Intérêts gagnés</small><b class="n green">${money(s.interets_gagnes)}</b></div>
  </div>
  <h2>Prêts par statut</h2>
  <div class="card">${Object.entries(pretsParStatut).map(([k,v])=>`<div class="stat-row"><span class="k">${statutBadge(k)}</span><span class="v">${v} (${Math.round(v/totalPrets*100)}%)</span></div>`).join('')||empty('Aucun prêt')}</div>
  <div class="acts"><button class="btn" data-a="csv">Exporter CSV</button><button class="btn alt" data-a="print">Imprimer</button></div>`;
};

V.settings=()=>{
  const u=db.user, e=db.entreprise;
  return `<div class="card">
    <b>Entreprise</b>
    <small>${esc(e?.nom||'')}</small>
    <div class="acts"><button class="btn" data-a="cent">Configurer</button></div>
  </div>
  <div class="card"><b>Compte</b><small>${esc(u?.username||'')} (${esc(u?.role||'')})</small>
    <div class="acts"><button class="btn alt" data-a="logout">Se déconnecter</button></div>
  </div>
  <div class="card form"><label>Thème<select data-f="theme">${[['auto','Automatique'],['light','Clair'],['dark','Sombre']].map(([v,l])=>`<option value="${v}" ${(localStorage.getItem(T)||'auto')===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
  <div class="card"><b>Utilisateurs</b><small>Invitez d'autres utilisateurs via Supabase</small></div>
  <div class="acts"><button class="btn alt" data-a="csv">Exporter CSV</button></div>`;
};

/* ============================================================
   SECTION 10 — SUB (formulaires)
   ============================================================ */
const SUB={
  async flogin(f,d){
    try{
      const {user} = await sbSignIn(d.email, d.pw);
      console.log('Login Supabase OK pour', user?.email);
      toast('Connexion réussie.');

      /* Petit délai pour laisser Supabase propager la session */
      await new Promise(r => setTimeout(r, 300));

      await initSession();

      /* Si db.user n'est toujours pas défini → problème de profil */
      if(!db.user){
        toast('Connexion OK mais profil absent dans public.users. Vérifiez la table.', 1);
      }
    }catch(e){
      console.error('flogin:', e);
      const msg = e?.message || '';
      if(msg.includes('Invalid login credentials')){
        toast('Identifiants incorrects. Vérifiez Supabase → Authentication → Users.',1);
      } else if(msg.includes('Email not confirmed')){
        toast('Email non confirmé. Confirmez-le dans Supabase.',1);
      } else {
        toast('Erreur : '+msg,1);
      }
    }
  },
  async fclient(f,d){
    try{
      const id=d.client_id||'';
      const payload = {
        nom_complet:d.nom_complet,nif_cin:d.nif_cin,telephone:d.telephone,
        email:d.email,adresse:d.adresse,ville:d.ville,
        date_naissance:d.date_naissance||null,sexe:d.sexe,profession:d.profession
      };
      if(id){
        const {error}=await sb.from('clients').update(payload).eq('id',id);
        if(error)throw error;
      }else{
        const {error}=await sb.from('clients').insert({...payload, entreprise_id:db.entreprise.id});
        if(error)throw error;
      }
      toast('Client enregistré.');closeM();
    }catch(e){toast('Erreur : '+(e.message||''),1)}
  },
  async fcompte(f,d){
    try{
      const tc=typeCompteById(+d.type_compte_id);
      const depotInit=r2(d.depot_init||0);
      if(depotInit<tc.depot_min)return toast(`Dépôt min ${money(tc.depot_min)}`,1);
      const num = 'AYF-'+new Date().getFullYear()+'-'+Math.floor(Math.random()*99999).toString().padStart(5,'0');
      const solde = r2(depotInit-tc.frais_ouv);
      const {data:cp,error}=await sb.from('comptes').insert({
        entreprise_id:db.entreprise.id,client_id:d.client_id,type_compte_id:tc.id,
        numero_compte_interne:num,solde,date_ouverture:d.date||today(),statut:'ACTIF'
      }).select().single();
      if(error)throw error;
      if(depotInit>0){
        await sb.from('depots').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,montant:depotInit,date_operation:d.date||today(),description:'Dépôt initial',created_by:db.user.id});
        await sb.from('transactions').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,type_transaction:'DEPOT',montant:depotInit,description:'Dépôt initial',created_by:db.user.id});
      }
      if(tc.frais_ouv>0){
        await sb.from('transactions').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,type_transaction:'FRAIS',montant:-tc.frais_ouv,description:'Frais ouverture',created_by:db.user.id});
      }
      toast('Compte créé.');closeM();
    }catch(e){toast('Erreur : '+(e.message||''),1)}
  },
  async fop(f,d){
    try{
      const cp=compteById(d.compte_id);if(!cp)return toast('Compte introuvable.',1);
      const amt=r2(d.montant);
      if(d.type_op==='RETRAIT'&&amt>cp.solde)return toast('Solde insuffisant.',1);
      if(d.type_op==='DEPOT'){
        await sb.from('comptes').update({solde:r2(cp.solde+amt)}).eq('id',cp.id);
        await sb.from('depots').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,montant:amt,date_operation:d.date||today(),description:d.description,created_by:db.user.id});
        await sb.from('transactions').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,type_transaction:'DEPOT',montant:amt,description:d.description,created_by:db.user.id});
      }else{
        await sb.from('comptes').update({solde:r2(cp.solde-amt)}).eq('id',cp.id);
        await sb.from('retraits').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,montant:amt,date_operation:d.date||today(),description:d.description,created_by:db.user.id});
        await sb.from('transactions').insert({entreprise_id:db.entreprise.id,compte_id:cp.id,type_transaction:'RETRAIT',montant:-amt,description:d.description,created_by:db.user.id});
      }
      toast('Opération enregistrée.');
    }catch(e){toast('Erreur : '+(e.message||''),1)}
  },
  async fpret(f,d){
    try{
      const cp=compteById(d.compte_id),tp=typePretById(+d.type_pret_id);
      if(!cp||!tp)return toast('Sélection incomplète.',1);
      const amt=r2(d.montant),duree=+d.duree_mois,taux=+d.taux_mensuel;
      if(amt<tp.montant_min||amt>tp.montant_max)return toast(`Montant ${money(tp.montant_min)}–${money(tp.montant_max)}`,1);
      if(duree<1||duree>tp.duree_max)return toast(`Durée max ${tp.duree_max} mois`,1);
      const dateDebut=d.date_debut||today();
      const mens=calcMensualite(amt,taux,duree);
      const interets=r2(mens*duree-amt);
      const total=r2(amt+interets);
      const dateFin=iso(addMonths(new Date(dateDebut+'T12:00:00'),duree));
      const num='PR'+new Date().getFullYear()+String(Math.floor(Math.random()*9999)).padStart(4,'0');
      const {data:p,error}=await sb.from('prets').insert({
        entreprise_id:db.entreprise.id,client_id:d.client_id,compte_id:cp.id,type_pret_id:tp.id,
        numero_pret:num,montant:amt,taux_interet_mensuel:taux,duree_mois:duree,
        date_debut:dateDebut,date_fin:dateFin,montant_interet:interets,
        montant_total:total,mensualite:mens,solde_restant:total,statut:'DEMANDE',
        created_by:db.user.id
      }).select().single();
      if(error)throw error;
      const echs=genEcheancier(amt,taux,duree,dateDebut).map(e=>({...e,entreprise_id:db.entreprise.id,pret_id:p.id}));
      await sb.from('echeances').insert(echs);
      toast('Demande enregistrée.');closeM();
    }catch(e){toast('Erreur : '+(e.message||''),1)}
  },
  async fpaypret(f,d){
    try{
      const p=pretById(d.pret_id);if(!p)return toast('Prêt introuvable.',1);
      if(!['EN_COURS','RETARD','APPROUVE'].includes(p.statut))return toast('Statut non payant.',1);
      const amt=r2(d.montant);
      if(!(amt>0))return toast('Montant invalide.',1);
      const paysExist=db.paiements_pret.filter(x=>x.pret_id===p.id);
      const interetDeja=r2(paysExist.reduce((s,x)=>s+(+x.interet_paye||0),0));
      const capitalDeja=r2(paysExist.reduce((s,x)=>s+(+x.capital_rembourse||0),0));
      const interetRestant=r2(Math.max(0,(+p.montant_interet||0)-interetDeja));
      const capitalRestant=r2(Math.max(0,(+p.montant||0)-capitalDeja));
      const interetPaye=Math.min(amt,interetRestant);
      const capitalPaye=r2(Math.min(amt-interetPaye,capitalRestant));
      await sb.from('paiements_pret').insert({
        entreprise_id:db.entreprise.id,pret_id:p.id,date_paiement:d.date||today(),
        montant:amt,capital_rembourse:capitalPaye,interet_paye:interetPaye,
        description:d.description,created_by:db.user.id
      });
      const totalPaye=r2(paysExist.reduce((s,x)=>s+(+x.montant||0),0)+amt);
      const nouveauSolde=r2(Math.max(0,(+p.montant_total||0)-totalPaye));
      const nouveauStatut=nouveauSolde<=0?'REMBOURSE':'EN_COURS';
      await sb.from('prets').update({solde_restant:nouveauSolde,statut:nouveauStatut}).eq('id',p.id);
      await sb.from('transactions').insert({
        entreprise_id:db.entreprise.id,pret_id:p.id,type_transaction:'REMBOURSEMENT_PRET',
        montant:amt,description:`Remboursement prêt ${p.numero_pret}`,created_by:db.user.id
      });
      toast('Paiement enregistré.');
    }catch(e){toast('Erreur : '+(e.message||''),1)}
  },
  async fent(f,d){
    try{
      const e=db.entreprise;if(!e)return;
      let logo_url=e.logo_url;
      const fileInput=f.querySelector('[name="logo_file"]');
      if(fileInput&&fileInput.files&&fileInput.files[0]){
        logo_url=await sbUploadLogo(e.id,fileInput.files[0]);
      }
      const {error}=await sb.from('entreprises').update({
        nom:d.nom,slogan:d.slogan,adresse:d.adresse,telephone:d.telephone,
        email:d.email,devise:d.devise,logo_url
      }).eq('id',e.id);
      if(error)throw error;
      db.entreprise.logo_url=logo_url;
      db.entreprise.nom=d.nom;
      toast('Entreprise mise à jour.');closeM();
    }catch(err){toast('Erreur : '+(err.message||''),1)}
  }
};

/* ============================================================
   SECTION 11 — ACTIONS
   ============================================================ */
const ACT={
  closeM, print:()=>print(),
  async logout(){
    try{ await sbSignOut(); }catch(e){}
    db={entreprise:null,user:null,clients:[],comptes:[],depots:[],retraits:[],transactions:[],prets:[],echeances:[],paiements_pret:[],garanties:[],types_compte:[],types_pret:[]};
    if(realtimeChannel){ try{ await sb.removeChannel(realtimeChannel); }catch(e){} realtimeChannel=null; }
    render();
  },
  cform(id){
    const c=db.clients.find(x=>x.id===id)||{};
    modal(`<h2>${id?'Modifier client':'Nouveau client'}</h2><form id="fclient" class="form">
      <input type="hidden" name="client_id" value="${esc(id||'')}">
      <label>Nom complet *<input name="nom_complet" required value="${esc(c.nom_complet)}"></label>
      <label>NIF/CIN *<input name="nif_cin" required value="${esc(c.nif_cin)}"></label>
      <label>Téléphone *<input name="telephone" required value="${esc(c.telephone)}"></label>
      <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
      <label>Adresse<input name="adresse" value="${esc(c.adresse)}"></label>
      <label>Ville<input name="ville" value="${esc(c.ville)}"></label>
      <label>Date naissance<input name="date_naissance" type="date" value="${esc(c.date_naissance)}"></label>
      <label>Sexe<select name="sexe">${[['M','M'],['F','F'],['O','Autre'],['N','Non précisé']].map(([v,l])=>`<option value="${v}" ${c.sexe===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Profession<input name="profession" value="${esc(c.profession)}"></label>
      <button class="btn big">Enregistrer</button></form>`);
  },
  async delc(id){
    if(db.comptes.some(c=>c.client_id===id))return toast('Impossible : comptes existants.',1);
    if(!confirm('Supprimer ce client ?'))return;
    const {error}=await sb.from('clients').delete().eq('id',id);
    if(error)return toast('Erreur : '+error.message,1);
    toast('Supprimé.');
  },
  ccompte(clientId){
    modal(`<h2>Ouvrir un compte</h2><form id="fcompte" class="form">
      <label>Client<select name="client_id" required>${clientOpts(clientId)}</select></label>
      <label>Type<select name="type_compte_id" required>${typeCompteOpts()}</select></label>
      <label>Dépôt initial (G)<input name="depot_init" type="number" step="0.01" min="0" value="0"></label>
      <label>Date<input name="date" type="date" value="${today()}" required></label>
      <button class="btn big">Créer le compte</button></form>`);
  },
  cdepot(compteId){
    modal(`<h2>Dépôt</h2><form id="fop" class="form">
      <input type="hidden" name="type_op" value="DEPOT"><input type="hidden" name="compte_id" value="${esc(compteId)}">
      <label>Montant (G)<input name="montant" type="number" step="0.01" min="0.01" required></label>
      <label>Date<input name="date" type="date" value="${today()}" required></label>
      <label>Description<input name="description"></label>
      <button class="btn big">Valider</button></form>`);
  },
  cretrait(compteId){
    modal(`<h2>Retrait</h2><form id="fop" class="form">
      <input type="hidden" name="type_op" value="RETRAIT"><input type="hidden" name="compte_id" value="${esc(compteId)}">
      <label>Montant (G)<input name="montant" type="number" step="0.01" min="0.01" required></label>
      <label>Date<input name="date" type="date" value="${today()}" required></label>
      <label>Description<input name="description"></label>
      <button class="btn big">Valider</button></form>`);
  },
  async ccloture(compteId){
    const cp=compteById(compteId);if(!cp)return;
    if(cp.solde>0&&!confirm(`Solde ${money(cp.solde)}. Clôturer ?`))return;
    await sb.from('comptes').update({statut:'FERME',solde:0}).eq('id',compteId);
    toast('Compte clôturé.');
  },
  cpret(){
    modal(`<h2>Nouveau prêt</h2><form id="fpret" class="form">
      <label>Client<select name="client_id" required>${clientOpts()}</select></label>
      <label>Compte épargne<select name="compte_id" required>${compteOpts()}</select></label>
      <label>Type<select name="type_pret_id" required>${typePretOpts()}</select></label>
      <label>Montant (G)<input name="montant" type="number" step="0.01" min="0.01" required></label>
      <label>Taux mensuel %<input name="taux_mensuel" type="number" step="0.01" min="0.01" value="1.00" required></label>
      <label>Durée (mois)<input name="duree_mois" type="number" min="1" value="12" required></label>
      <label>Date début<input name="date_debut" type="date" value="${today()}" required></label>
      <button class="btn big">Créer la demande</button></form>`);
  },
  async apret(id){
    const p=pretById(id);if(!p||p.statut!=='DEMANDE')return toast('Non approuvable.',1);
    if(!confirm('Approuver et décaisser ? (sortie de caisse)'))return;
    await sb.from('prets').update({statut:'EN_COURS',date_approbation:now(),date_decaissement:today()}).eq('id',id);
    await sb.from('transactions').insert({
      entreprise_id:db.entreprise.id,pret_id:id,type_transaction:'PRET_DEBLOCAGE',
      montant:-p.montant,description:`Décaissement ${p.numero_pret}`,created_by:db.user.id
    });
    toast('Prêt approuvé.');
  },
  async rpret(id){
    const p=pretById(id);if(!p||p.statut!=='DEMANDE')return toast('Non rejetable.',1);
    const motif=prompt('Motif ?');if(motif===null)return;
    await sb.from('prets').update({statut:'REJETE',motif_rejet:motif}).eq('id',id);
    toast('Rejeté.');
  },
  ppay(id){
    const p=pretById(id);if(!p)return;
    modal(`<h2>Paiement ${esc(p.numero_pret)}</h2><form id="fpaypret" class="form">
      <input type="hidden" name="pret_id" value="${esc(id)}">
      <small>Reste : <b>${money(p.solde_restant)}</b></small>
      <label>Montant (G)<input name="montant" type="number" step="0.01" min="0.01" required></label>
      <label>Date<input name="date" type="date" value="${today()}" required></label>
      <label>Description<input name="description"></label>
      <button class="btn big">Valider</button></form>`);
  },
  cent(){
    const e=db.entreprise;if(!e)return;
    modal(`<h2>Configurer l'entreprise</h2><form id="fent" class="form">
      <label>Nom *<input name="nom" required value="${esc(e.nom||'')}"></label>
      <label>Slogan<input name="slogan" value="${esc(e.slogan||'')}"></label>
      <label>Adresse<input name="adresse" value="${esc(e.adresse||'')}"></label>
      <label>Téléphone<input name="telephone" value="${esc(e.telephone||'')}"></label>
      <label>Email<input name="email" type="email" value="${esc(e.email||'')}"></label>
      <label>Devise<select name="devise">${[['HTG','HTG'],['USD','USD'],['EUR','EUR']].map(([v,l])=>`<option value="${v}" ${e.devise===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Logo (image)<input name="logo_file" type="file" accept="image/*"></label>
      <button class="btn big">Enregistrer</button></form>`);
  },
  csv(){
    const rows=[['Type','Date','Client','Montant','Description']];
    db.depots.forEach(d=>{const cp=compteById(d.compte_id);const cl=cp?clientById(cp.client_id):null;rows.push(['DEPOT',d.date_operation,cl?cl.nom_complet:'',d.montant,d.description||''])});
    db.retraits.forEach(d=>{const cp=compteById(d.compte_id);const cl=cp?clientById(cp.client_id):null;rows.push(['RETRAIT',d.date_operation,cl?cl.nom_complet:'',-d.montant,d.description||''])});
    db.prets.forEach(p=>{const cl=clientById(p.client_id);rows.push(['PRET',p.date_debut,cl?cl.nom_complet:'',p.montant,`Total=${p.montant_total} Reste=${p.solde_restant}`])});
    dl('ayifin.csv','\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n'),'text/csv');
  }
};

/* ============================================================
   SECTION 12 — RENDU
   ============================================================ */
function render(){
  theme();
  const app=$('#app');if(!app)return;
  if(!db.user){ app.innerHTML=loginV(); return; }
  const hash=location.hash.slice(2)||'dashboard';
  const parts=hash.split('/');
  const p=parts[0]||'dashboard';
  const arg=parts[1]||'';
  const key=V[p]?p:'dashboard';
  const cur=key==='client'?'clients':key==='compte'?'comptes':key==='pret'?'prets':key;
  const ti=(NAV.find(n=>n[0]===cur)||[0,'AYIFIN'])[1];
  const link=(n,c)=>`<a href="#/${n[0]}" class="${cur===n[0]?'on':''}">${ico(n[2])}${c?n[1]:''}</a>`;
  const e=db.entreprise;
  const brand=e?`
    <div style="display:flex;align-items:center;gap:8px;padding:0 10px 8px">
      ${e.logo_url?`<img src="${e.logo_url}" alt="logo" style="width:36px;height:36px;border-radius:8px;object-fit:cover">`:`<div style="width:36px;height:36px;border-radius:8px;background:#ffffff22;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:.9rem">${esc((e.nom||'AY').slice(0,2).toUpperCase())}</div>`}
      <div style="flex:1;min-width:0">
        <div style="color:#fff;font-weight:800;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.nom||'AYIFIN')}</div>
        <div style="color:#8da0d0;font-size:.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.slogan||'')}</div>
      </div>
    </div>`:'<span class="brand">AYIFIN</span>';
  const view=V[key];
  const content=typeof view==='function'?view(arg):empty('Vue introuvable');
  app.innerHTML=`<aside class="side">${brand}${NAV.map(n=>link(n,1)).join('')}</aside><main><header class="top"><h1>${key==='client'?'Fiche client':key==='compte'?'Compte':key==='pret'?'Prêt':ti}</h1><div class="topi">${NAV.slice(5).map(n=>link(n)).join('')}</div></header><section class="view">${content}</section></main><nav class="bot">${NAV.slice(0,5).map(n=>link(n,1)).join('')}</nav>`;
  scrollTo(0,0);
}

/* ============================================================
   SECTION 13 — DÉLÉGATIONS
   ============================================================ */
document.addEventListener('submit', async e=>{
  e.preventDefault();
  const f=e.target;
  if(!(f instanceof HTMLFormElement))return;
  const key=f.getAttribute('id')||'';
  const h=SUB[key];
  if(typeof h!=='function'){toast('Formulaire inconnu.',1);return}
  const btn=f.querySelector('.big,button[type="submit"]');
  if(btn)btn.disabled=true;
  try{
    await h(f,Object.fromEntries(new FormData(f)));
    /* Ne pas recharger si c'est le login : initSession le fait déjà */
    if(key!=='flogin' && db.user && db.entreprise){
      await loadAll();
    }
    render();
  }catch(err){
    console.error('submit:',err);
    toast('Erreur : '+(err?.message||''),1);
  }finally{ if(btn)btn.disabled=false; }
});

document.addEventListener('click', e=>{
  if(e.target.id==='modal')return closeM();
  const b=e.target.closest('[data-a]');if(!b)return;
  const fn=ACT[b.dataset.a];
  if(typeof fn!=='function')return;
  try{
    const r=fn(b.dataset.id);
    if(r && typeof r.then==='function'){
      r.then(async()=>{
        if(db.user && db.entreprise){ await loadAll(); render(); }
        else render();
      }).catch(err=>toast('Erreur : '+(err?.message||''),1));
    }
  }catch(err){toast('Erreur : '+(err?.message||''),1)}
});

document.addEventListener('input', e=>{
  const t=e.target,n=t.dataset.f;if(!n)return;
  if(n==='theme'){localStorage.setItem(T,t.value);return theme()}
  F[n]=t.value;
  if($('#clist'))$('#clist').innerHTML=clist();
});

/* ============================================================
   SECTION 14 — INIT
   ============================================================ */
window.addEventListener('DOMContentLoaded', async ()=>{
  initSupabase();
  await initSession();
});
window.addEventListener('hashchange',render);
