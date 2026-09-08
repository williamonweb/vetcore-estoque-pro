function openModal(title, html){document.getElementById('mt').textContent=title;document.getElementById('mb').innerHTML=html;document.getElementById('modal').classList.remove('hidden')}
function closeModal(){document.getElementById('modal').classList.add('hidden')}
function toast(msg){let t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function confirmModal(title,msg,onYes){openModal(title,`<p>${msg}</p><button id="yes">Confirmar</button><button class="secondary" onclick="closeModal()">Cancelar</button>`);document.getElementById('yes').onclick=()=>{closeModal();onYes()}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('modal'))closeModal()});
document.addEventListener('click',e=>{if(e.target?.id==='modal')closeModal()});

async function applyPublicBranding(){
  try{
    const r=await fetch('/api/public-settings'); if(!r.ok)return; const s=await r.json(); const b=s.branding||{},a=s.appearance||{};
    if(a.accent)document.documentElement.style.setProperty('--accent',a.accent);if(a.accent2)document.documentElement.style.setProperty('--accent2',a.accent2);if(a.gold)document.documentElement.style.setProperty('--gold',a.gold);if(a.danger)document.documentElement.style.setProperty('--danger',a.danger);if(a.radius)document.documentElement.style.setProperty('--radius',a.radius+'px');if(a.fontScale)document.documentElement.style.setProperty('--font-scale',a.fontScale/100);document.body.dataset.density=a.density||'comfortable';
    const ids={visualSystem:b.systemName,visualModule:b.moduleName,mobileSystem:b.systemName,mobileModule:b.moduleName,loginCompany:b.companyName};Object.entries(ids).forEach(([id,v])=>{const el=document.getElementById(id);if(el&&v)el.textContent=v});
    ['visualLogo','mobileLogo'].forEach(id=>{const el=document.getElementById(id);if(!el)return;if(b.logoUrl)el.innerHTML=`<img src="${b.logoUrl}" alt="logo">`;else el.textContent=(b.shortName||'VC').slice(0,4)});
    if(b.systemName)document.title=b.systemName+' • Acesso';
  }catch(e){console.warn('Não foi possível carregar a identidade pública.',e)}
}
applyPublicBranding();
