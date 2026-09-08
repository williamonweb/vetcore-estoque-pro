let state = {};
let activeQuoteId = null;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

async function api(url, opts = {}) {
  const o = { ...opts };
  if (o.body && !(o.body instanceof FormData)) o.headers = { ...(o.headers || {}), "Content-Type": "application/json" };
  const r = await fetch(url, o);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Erro");
  return j;
}

async function load() {
  state = await api("/api/state");
  ["categories","products","suppliers","users","stockMoves","quotes"].forEach(k => state[k] = state[k] || []);
  state.settings = state.settings || {};
  applySettings();
  renderAll();
}

function renderAll() {
  [renderDashboard, renderSuppliers, renderUsers, renderCategories, renderProducts, renderMoves, renderStockMoves, renderQuotes, renderQuoteSheet, renderWinnerGroups, renderCms].forEach(fn => {
    try { fn(); } catch (e) { console.error("Erro ao renderizar:", fn.name, e); }
  });
}

const pageInfo = {
  dashboard:["Dashboard","Visão geral do estoque e das compras."],
  fornecedores:["Fornecedores","Cadastre fornecedores e gerencie o acesso às cotações."],
  usuarios:["Usuários","Controle contas, perfis, status e senhas."],
  categorias:["Categorias","Organize o catálogo de produtos."],
  produtos:["Produtos","Cadastre, localize e acompanhe os itens do estoque."],
  movimentos:["Entrada / Saída","Registre movimentações e acompanhe o histórico."],
  cotacoes:["Cotações","Compare propostas e gere o fechamento por fornecedor."],
  nfe:["XML NF-e","Importe produtos e entradas diretamente do XML."],
  cms:["Configurações CMS","Personalize a operação e a aparência do sistema."]
};
function showPage(id, btn) {
  document.querySelectorAll(".sec").forEach(s => s.classList.add("hidden"));
  const sec = $(id); if (sec) sec.classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  const info = pageInfo[id] || [btn?.textContent?.trim() || id, ""];
  $("title").textContent = info[0]; $("pageSubtitle").textContent = info[1];
  window.scrollTo({top:0,behavior:"smooth"});
}

function applySettings() {
  const s = state.settings || {};
  const b = s.branding || {}, a = s.appearance || {}, m = s.modules || {};
  document.documentElement.style.setProperty("--accent", a.accent || "#246BCE");
  document.documentElement.style.setProperty("--accent2", a.accent2 || "#4F8FE8");
  document.documentElement.style.setProperty("--gold", a.gold || "#d4af5f");
  document.documentElement.style.setProperty("--danger", a.danger || "#ff6178");
  document.documentElement.style.setProperty("--radius", (a.radius || 20) + "px");
  document.documentElement.style.setProperty("--font-scale", (a.fontScale || 100) / 100);
  document.body.dataset.density = a.density || "comfortable";
  $("appLayout")?.classList.toggle("sidebar-compact", !!a.sidebarCompact);
  $("sidebarName").textContent = b.systemName || "VetCore";
  $("sidebarModule").textContent = b.moduleName || "Estoque & Compras";
  $("companyBreadcrumb").textContent = b.documentName || b.companyName || "Sistema";
  const logo = $("sidebarLogo");
  if (b.logoUrl) { logo.innerHTML = `<img src="${esc(b.logoUrl)}" alt="logo">`; }
  else logo.textContent = (b.shortName || "VC").slice(0,4);
  const me = state.user || state.users.find(u => u.id === "u_admin") || state.users[0];
  if (me) { $("miniUser").textContent = me.name || me.username; document.querySelector(".avatar").textContent = (me.name || "A").charAt(0).toUpperCase(); }
  document.title = `${b.systemName || "VetCore"} • ${b.moduleName || "Estoque & Compras"}`;
  document.querySelectorAll("[data-module]").forEach(btn => {
    const key = btn.dataset.module;
    btn.classList.toggle("module-hidden", key !== "cms" && m[key] === false);
  });
}

function supplierName(id) { return state.suppliers.find(s => s.id === id)?.name || "-"; }
function categoryName(idOrText) { return state.categories.find(c => c.id === idOrText)?.name || idOrText || "-"; }
function productById(id) { return state.products.find(p => p.id === id); }
function currency(v) { return `${state.settings?.quotes?.currency || "R$"} ${Number(v || 0).toFixed(2).replace(".",",")}`; }
function lowStock(p){ const inclusive=state.settings?.stock?.lowStockInclusive !== false; return inclusive ? Number(p.stock)<=Number(p.minStock) : Number(p.stock)<Number(p.minStock); }

function renderDashboard() {
  const low = state.products.filter(lowStock);
  const pending = state.quotes.reduce((n,q)=>n+(q.suppliers||[]).filter(s=>s.status!=="respondida").length,0);
  $("cards").innerHTML = `
    <div class="kpi-card"><div class="kpi-icon">▦</div><div><span>Produtos</span><strong>${state.products.length}</strong><small>${low.length} com atenção</small></div></div>
    <div class="kpi-card"><div class="kpi-icon">♙</div><div><span>Fornecedores</span><strong>${state.suppliers.length}</strong><small>${state.users.filter(u=>u.role==='fornecedor'&&u.active!==false).length} acessos ativos</small></div></div>
    <div class="kpi-card"><div class="kpi-icon">≋</div><div><span>Cotações</span><strong>${state.quotes.length}</strong><small>${pending} respostas pendentes</small></div></div>
    <div class="kpi-card alert"><div class="kpi-icon">!</div><div><span>Abaixo do mínimo</span><strong>${low.length}</strong><small>itens para revisar</small></div></div>`;
  $("lowStock").innerHTML = low.map(p => `<tr><td><b>${esc(p.name)}</b><small class="table-sub">${esc(categoryName(p.categoryId||p.category))}</small></td><td>${p.stock} ${esc(p.unit)}</td><td>${p.minStock} ${esc(p.unit)}</td><td><span class="pill warn-pill">+${Math.max(0,Number(p.minStock)-Number(p.stock))} ${esc(p.unit)}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">✓ Nenhum produto abaixo do mínimo.</td></tr>';
}

function renderSuppliers() {
  $("supCount").textContent = state.suppliers.length;
  $("supTable").innerHTML = state.suppliers.map(s => {
    const u = state.users.find(u => u.supplierId === s.id);
    return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.phone||"-")}</td><td>${esc(s.email||"-")}</td><td>${u ? `<span class="pill">${esc(u.username)}</span>` : '<span class="pill warn-pill">sem login</span>'}</td><td class="actions"><button class="secondary small" onclick="openEditSupplier('${s.id}')">Editar</button><button class="danger small" onclick="delSupplier('${s.id}')">Excluir</button></td></tr>`;
  }).join("") || '<tr><td colspan="5" class="empty">Nenhum fornecedor cadastrado.</td></tr>';
}
function openEditSupplier(id){
  const s=state.suppliers.find(x=>x.id===id); if(!s)return;
  openModal("Editar fornecedor",`<div class="grid two"><div><label>Nome</label><input id="editSupName" value="${esc(s.name)}"></div><div><label>WhatsApp</label><input id="editSupPhone" value="${esc(s.phone||'')}"></div></div><label>E-mail</label><input id="editSupEmail" value="${esc(s.email||'')}"><button onclick="saveEditSupplier('${id}')">Salvar alterações</button>`);
}
async function saveEditSupplier(id){try{await api('/api/suppliers/'+id,{method:'PUT',body:JSON.stringify({name:$("editSupName").value,phone:$("editSupPhone").value,email:$("editSupEmail").value})});closeModal();toast('Fornecedor atualizado');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}

function renderUsers() {
  $("userCount").textContent = state.users.length;
  $("userSupplier").innerHTML = '<option value="">Vincular fornecedor</option>' + state.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("userTable").innerHTML = state.users.map(u => {
    const status = u.active === false ? '<span class="pill bad-pill">Bloqueado</span>' : '<span class="pill ok-pill">Ativo</span>';
    const role = u.role === "admin" ? "Administrador" : (u.role === "estoque" ? "Estoque" : "Fornecedor");
    return `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td><td><span class="pill">${role}</span></td><td>${esc(supplierName(u.supplierId))}</td><td>${status}</td><td class="actions"><button class="secondary small" onclick="openEditUser('${u.id}')">Editar</button>${u.id === "u_admin" ? "" : `<button class="danger small" onclick="delUser('${u.id}')">Excluir</button>`}</td></tr>`;
  }).join("");
}

function renderCategories() {
  $("catCount").textContent = state.categories.length;
  $("catTable").innerHTML = state.categories.map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="actions"><button class="secondary small" onclick="openEditCategory('${c.id}')">Editar</button><button class="danger small" onclick="delCategory('${c.id}')">Excluir</button></td></tr>`).join("") || '<tr><td colspan="2" class="empty">Nenhuma categoria cadastrada.</td></tr>';
}
function openEditCategory(id){const c=state.categories.find(x=>x.id===id);if(!c)return;openModal('Editar categoria',`<label>Nome</label><input id="editCatName" value="${esc(c.name)}"><button onclick="saveEditCategory('${id}')">Salvar alterações</button>`)}
async function saveEditCategory(id){try{await api('/api/categories/'+id,{method:'PUT',body:JSON.stringify({name:$("editCatName").value})});closeModal();toast('Categoria atualizada');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}

function unitOptions(selected=""){
  const units=state.settings?.stock?.units || ["un"];
  return units.map(u=>`<option value="${esc(u)}" ${u===selected?'selected':''}>${esc(u)}</option>`).join('');
}
function renderProducts() {
  $("prodSupplier").innerHTML = '<option value="">Fornecedor padrão</option>' + state.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("prodCat").innerHTML = '<option value="">Selecione a categoria</option>' + state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const defUnit=state.settings?.stock?.defaultUnit || 'un';
  const current=$("prodUnit").value || defUnit; $("prodUnit").innerHTML=unitOptions(current); if([...["prodUnit"].map(id=>$(id))][0]) $("prodUnit").value=(state.settings?.stock?.units||[]).includes(current)?current:defUnit;
  if(!$("prodMin").value && state.settings?.stock?.defaultMinStock) $("prodMin").placeholder=String(state.settings.stock.defaultMinStock);
  const term=($("productSearch")?.value||"").toLowerCase().trim();
  const list=state.products.filter(p=>`${p.name} ${categoryName(p.categoryId||p.category)} ${p.ean||''}`.toLowerCase().includes(term));
  $("prodCount").textContent = list.length;
  $("prodTable").innerHTML = list.map(p => `<tr><td><b>${esc(p.name)}</b>${p.ean?`<small class="table-sub">EAN ${esc(p.ean)}</small>`:''}</td><td>${esc(categoryName(p.categoryId || p.category))}</td><td>${esc(supplierName(p.supplierId))}</td><td><span class="stock-value ${lowStock(p)?'stock-low':''}">${p.stock} ${esc(p.unit)}</span></td><td>${p.minStock} ${esc(p.unit)}</td><td class="actions"><button class="secondary small" onclick="openEditProduct('${p.id}')">Editar</button><button class="danger small" onclick="delProduct('${p.id}')">Excluir</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nenhum produto encontrado.</td></tr>';
}
function openEditProduct(id){
  const p=productById(id);if(!p)return;
  const cats='<option value="">Sem categoria</option>'+state.categories.map(c=>`<option value="${c.id}" ${c.id===(p.categoryId||'')?'selected':''}>${esc(c.name)}</option>`).join('');
  const sups='<option value="">Sem fornecedor</option>'+state.suppliers.map(s=>`<option value="${s.id}" ${s.id===(p.supplierId||'')?'selected':''}>${esc(s.name)}</option>`).join('');
  openModal('Editar produto',`<div class="grid two"><div><label>Produto</label><input id="editProdName" value="${esc(p.name)}"></div><div><label>EAN / Código</label><input id="editProdEan" value="${esc(p.ean||'')}"></div><div><label>Categoria</label><select id="editProdCat">${cats}</select></div><div><label>Fornecedor padrão</label><select id="editProdSupplier">${sups}</select></div><div><label>Estoque atual</label><input id="editProdStock" type="number" value="${Number(p.stock||0)}"></div><div><label>Estoque mínimo</label><input id="editProdMin" type="number" value="${Number(p.minStock||0)}"></div><div><label>Unidade</label><select id="editProdUnit">${unitOptions(p.unit)}</select></div></div><button onclick="saveEditProduct('${id}')">Salvar alterações</button>`);
}
async function saveEditProduct(id){try{await api('/api/products/'+id,{method:'PUT',body:JSON.stringify({name:$("editProdName").value,ean:$("editProdEan").value,categoryId:$("editProdCat").value,supplierId:$("editProdSupplier").value,stock:$("editProdStock").value,minStock:$("editProdMin").value,unit:$("editProdUnit").value})});closeModal();toast('Produto atualizado');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}

function renderMoves() {
  $("moveProduct").innerHTML = state.products.map(p => `<option value="${p.id}">${esc(p.name)} — estoque ${p.stock} ${esc(p.unit)}</option>`).join("") || '<option value="">Cadastre um produto</option>';
}
function renderStockMoves() {
  const moves=[...state.stockMoves].reverse(); $("moveCount").textContent=moves.length;
  $("stockMovesTable").innerHTML = moves.map(m => {const p=productById(m.productId);const isIn=m.type==='entrada';return `<tr><td>${m.date?new Date(m.date).toLocaleString('pt-BR'):'-'}</td><td><b>${esc(p?.name||'-')}</b></td><td><span class="pill ${isIn?'ok-pill':'bad-pill'}">${isIn?'↑ Entrada':'↓ Saída'}</span></td><td><b>${isIn?'+':'-'}${m.quantity}</b></td><td>${esc(m.note||'-')}</td></tr>`}).join('') || '<tr><td colspan="5" class="empty">Nenhuma movimentação registrada.</td></tr>';
}

function compute(q) {
  return (q.items || []).map(item => {
    const offers = [];
    (q.suppliers || []).forEach(s => { const a=(s.answers||[]).find(x=>x.productId===item.productId); if(a&&Number(a.unitPrice)>0) offers.push({...a,supplierId:s.supplierId,total:Number(a.unitPrice)*Number(item.quantity)}); });
    offers.sort((a,b)=>a.unitPrice-b.unitPrice); return {item,winner:offers[0]||null,offers};
  });
}
function currentQuote(){ if(!state.quotes.length)return null; return (activeQuoteId&&state.quotes.find(q=>q.id===activeQuoteId))||state.quotes[0]; }
function selectQuoteSheet(id){activeQuoteId=id;renderQuoteSheet();renderWinnerGroups();renderQuotes();}
function renderQuotes(){
  $("quotesList").innerHTML=state.quotes.map(q=>`<div class="quote-status-row"><div><b>${esc(q.title)}</b><small>${q.createdAt?new Date(q.createdAt).toLocaleString('pt-BR'):''}</small></div><div class="quote-status-actions">${(q.suppliers||[]).map(s=>`<span class="pill ${s.status==='respondida'?'ok-pill':''}">${esc(supplierName(s.supplierId))}: ${esc(s.status)}</span>`).join(' ')}<button class="secondary small" onclick="selectQuoteSheet('${q.id}')">Abrir</button><button class="danger small" onclick="delQuote('${q.id}')">Excluir</button></div></div>`).join('')||'<p class="empty">Nenhuma cotação.</p>';
}
function renderQuoteSheet(){
  const q=currentQuote(); $("quoteTabs").innerHTML=state.quotes.map(item=>`<button class="${q&&q.id===item.id?'active':''}" onclick="selectQuoteSheet('${item.id}')">${esc(item.title)}</button>`).join('')||'<span class="muted">Nenhuma cotação criada.</span>';
  if(!q){$("quoteSheetBody").innerHTML='<tr><td colspan="9" class="empty">Crie uma cotação para visualizar a planilha.</td></tr>';return;}
  const winnerMap={};compute(q).forEach(w=>{if(w.winner)winnerMap[w.item.productId]=w.winner}); const rows=[];
  (q.items||[]).forEach(item=>(q.suppliers||[]).forEach((s,idx)=>{const ans=(s.answers||[]).find(a=>a.productId===item.productId)||{};const isWinner=winnerMap[item.productId]?.supplierId===s.supplierId;const highlight=isWinner&&state.settings?.quotes?.showWinnerByLowestPrice!==false;rows.push(`<tr class="${highlight?'winner-row':''}"><td>${idx===0?`<b>${esc(item.name)}</b><small class="table-sub">${item.quantity} ${esc(item.unit)}</small>`:''}</td><td>${idx===0?item.quantity:''}</td><td>${esc(supplierName(s.supplierId))}</td><td>${esc(ans.brand||'-')}</td><td>${ans.unitPrice?currency(ans.unitPrice):'-'}</td><td>${esc(ans.deliveryTime||'-')}</td><td>${esc(ans.paymentCondition||'-')}</td><td>${esc(ans.note||'-')}</td><td>${highlight?'<span class="pill ok-pill">Menor preço</span>':''}</td></tr>`)}));
  $("quoteSheetBody").innerHTML=rows.join('');
}
function renderWinnerGroups(){
  const q=currentQuote();if(!q){$("quoteWinnerGroups").innerHTML='<tr><td colspan="4" class="empty">Nenhuma cotação.</td></tr>';return;}const grouped={};
  compute(q).forEach(w=>{if(w.winner){const sid=w.winner.supplierId;grouped[sid]=grouped[sid]||{items:[],total:0};grouped[sid].items.push(`${w.item.name} — ${w.item.quantity} ${w.item.unit} — ${w.winner.brand||'sem marca'} — ${currency(w.winner.unitPrice)}`);grouped[sid].total+=Number(w.winner.unitPrice)*Number(w.item.quantity)}});
  $("quoteWinnerGroups").innerHTML=Object.keys(grouped).map(sid=>`<tr><td><b>${esc(supplierName(sid))}</b></td><td>${grouped[sid].items.map(i=>`<div class="winner-item">${esc(i)}</div>`).join('')}</td><td><b>${currency(grouped[sid].total)}</b></td><td class="actions"><button class="small" onclick="showWhats('${q.id}','${sid}')">WhatsApp</button><button class="secondary small" onclick="printSupplierQuote('${q.id}','${sid}')">Imprimir / PDF</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aguardando respostas dos fornecedores.</td></tr>';
}

async function saveSupplier(){try{await api('/api/suppliers',{method:'POST',body:JSON.stringify({name:$("supName").value,phone:$("supPhone").value,email:$("supEmail").value,username:$("supUser").value,password:$("supPass").value})});['supName','supPhone','supEmail','supUser','supPass'].forEach(id=>$(id).value='');toast('Fornecedor salvo');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
async function saveUser(){try{await api('/api/users',{method:'POST',body:JSON.stringify({name:$("userName").value,username:$("userLogin").value,password:$("userPass").value,role:$("userRole").value,supplierId:$("userSupplier").value})});['userName','userLogin','userPass'].forEach(id=>$(id).value='');toast('Usuário salvo');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
function openEditUser(id){const u=state.users.find(x=>x.id===id);if(!u)return;const suppliers='<option value="">Sem fornecedor</option>'+state.suppliers.map(s=>`<option value="${s.id}" ${u.supplierId===s.id?'selected':''}>${esc(s.name)}</option>`).join('');openModal('Editar usuário',`<div class="grid two"><div><label>Nome</label><input id="editUserName" value="${esc(u.name)}"></div><div><label>Login</label><input id="editUserLogin" value="${esc(u.username)}"></div><div><label>Nova senha</label><input type="password" id="editUserPass" placeholder="Deixe em branco para manter"></div><div><label>Perfil</label><select id="editUserRole"><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option><option value="estoque" ${u.role==='estoque'?'selected':''}>Estoque</option><option value="fornecedor" ${u.role==='fornecedor'?'selected':''}>Fornecedor</option></select></div><div><label>Fornecedor</label><select id="editUserSupplier">${suppliers}</select></div><div><label>Status</label><select id="editUserActive"><option value="true" ${u.active!==false?'selected':''}>Ativo</option><option value="false" ${u.active===false?'selected':''}>Bloqueado</option></select></div></div><button onclick="saveEditUser('${u.id}')">Salvar alterações</button><button class="secondary" onclick="resetUserPassword('${u.id}')">Redefinir para 123456</button>`)}
async function saveEditUser(id){try{await api('/api/users/'+id,{method:'PUT',body:JSON.stringify({name:$("editUserName").value,username:$("editUserLogin").value,password:$("editUserPass").value,role:$("editUserRole").value,supplierId:$("editUserSupplier").value,active:$("editUserActive").value==='true'})});closeModal();toast('Usuário atualizado');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
async function resetUserPassword(id){try{await api('/api/users/'+id,{method:'PUT',body:JSON.stringify({password:'123456'})});closeModal();toast('Senha redefinida para 123456');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
async function saveCategory(){try{await api('/api/categories',{method:'POST',body:JSON.stringify({name:$("catName").value})});$("catName").value='';toast('Categoria salva');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
function openNewCategoryModal(){openModal('Nova categoria','<label>Nome da categoria</label><input id="modalCatName" placeholder="Ex.: Medicamentos"><button onclick="saveCategoryFromModal()">Salvar categoria</button>')}
async function saveCategoryFromModal(){try{await api('/api/categories',{method:'POST',body:JSON.stringify({name:$("modalCatName").value})});closeModal();toast('Categoria salva');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
async function saveProduct(){try{const body={name:$("prodName").value.trim(),categoryId:$("prodCat").value,supplierId:$("prodSupplier").value,stock:$("prodStock").value||0,minStock:$("prodMin").value,unit:$("prodUnit").value||state.settings?.stock?.defaultUnit||'un',ean:$("prodEan").value||''};if(!body.name)return openModal('Atenção','<p>Informe o nome do produto.</p>');await api('/api/products',{method:'POST',body:JSON.stringify(body)});['prodName','prodStock','prodMin','prodEan'].forEach(id=>$(id).value='');toast('Produto salvo');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
async function saveMove(){try{if(!$("moveProduct").value)return openModal('Atenção','<p>Cadastre ou selecione um produto.</p>');await api('/api/stock',{method:'POST',body:JSON.stringify({productId:$("moveProduct").value,type:$("moveType").value,quantity:$("moveQty").value,note:$("moveNote").value})});$("moveQty").value='';$("moveNote").value='';toast('Movimentação lançada');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
function openProductSearch(){openModal('Localizar produto','<input id="modalProductSearch" placeholder="Buscar por nome, categoria ou EAN" oninput="renderModalProductList()"><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>EAN</th><th>Estoque</th><th>Mínimo</th><th>Ação</th></tr></thead><tbody id="modalProductList"></tbody></table></div>');renderModalProductList()}
function renderModalProductList(){const el=$("modalProductList");if(!el)return;const term=($("modalProductSearch")?.value||'').toLowerCase().trim();const filtered=state.products.filter(p=>`${p.name} ${categoryName(p.categoryId||p.category)} ${p.ean||''}`.toLowerCase().includes(term));el.innerHTML=filtered.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(categoryName(p.categoryId||p.category))}</td><td>${esc(p.ean||'-')}</td><td>${p.stock} ${esc(p.unit)}</td><td>${p.minStock}</td><td><button class="secondary small" onclick="selectProductForMove('${p.id}')">Selecionar</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhum produto encontrado.</td></tr>'}
function selectProductForMove(id){$("moveProduct").value=id;const p=productById(id);closeModal();toast(`Produto selecionado: ${p?.name||''}`);$("moveQty")?.focus()}
function openNewQuoteModal(){const pc=state.products.map(p=>`<label><input type="checkbox" name="modalQProd" value="${p.id}"><span><b>${esc(p.name)}</b><small>${p.stock}/${p.minStock} ${esc(p.unit)}</small></span></label>`).join('')||'<p class="empty">Cadastre produtos primeiro.</p>';const sc=state.suppliers.map(s=>`<label><input type="checkbox" name="modalQSup" value="${s.id}"><span><b>${esc(s.name)}</b><small>${esc(s.phone||s.email||'Fornecedor')}</small></span></label>`).join('')||'<p class="empty">Cadastre fornecedores primeiro.</p>';openModal('Nova cotação',`<label>Título</label><input id="modalQuoteTitle" value="${esc(state.settings?.quotes?.defaultTitle||'Cotação')}" placeholder="Título da cotação"><div class="grid two"><div><h3>Produtos</h3><div class="checks">${pc}</div></div><div><h3>Fornecedores</h3><div class="checks">${sc}</div></div></div><button onclick="createQuoteFromModal()">Criar cotação</button>`)}
async function createQuoteFromModal(){try{const productIds=[...document.querySelectorAll('[name=modalQProd]:checked')].map(x=>x.value);const supplierIds=[...document.querySelectorAll('[name=modalQSup]:checked')].map(x=>x.value);const result=await api('/api/quotes',{method:'POST',body:JSON.stringify({title:$("modalQuoteTitle").value,productIds,supplierIds})});activeQuoteId=result.quote.id;closeModal();toast('Cotação criada');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}
function showWhats(qid,sid){const q=state.quotes.find(x=>x.id===qid);const wins=compute(q).filter(w=>w.winner?.supplierId===sid);const qs=state.settings?.quotes||{};const greeting=(qs.whatsGreeting||'Olá! Segue fechamento da cotação {cotacao}:').replaceAll('{cotacao}',q.title);const footer=qs.whatsFooter||'Obrigado!';const msg=`${greeting}\n\n`+wins.map(w=>`• ${w.item.name} — ${w.item.quantity} ${w.item.unit}\nMarca: ${w.winner.brand||'-'}\nValor unitário: ${currency(w.winner.unitPrice)}\nPrazo: ${w.winner.deliveryTime||'-'}`).join('\n\n')+`\n\n${footer}`;const sup=state.suppliers.find(s=>s.id===sid);const phone=(sup?.phone||'').replace(/\D/g,'');openModal('Mensagem para '+supplierName(sid),`<textarea rows="14" id="wmsg">${esc(msg)}</textarea><button onclick="navigator.clipboard.writeText($(\'wmsg\').value);toast(\'Mensagem copiada\')">Copiar mensagem</button>${phone?`<button class="secondary" onclick="openWhatsApp('${phone}')">Abrir WhatsApp</button>`:''}`)}
function openWhatsApp(phone){const txt=encodeURIComponent($("wmsg")?.value||'');window.open(`https://wa.me/55${phone.replace(/^55/,'')}?text=${txt}`,'_blank')}
function printSupplierQuote(qid,sid){const q=state.quotes.find(x=>x.id===qid);const wins=compute(q).filter(w=>w.winner?.supplierId===sid);const supplier=supplierName(sid);const b=state.settings?.branding||{},qs=state.settings?.quotes||{};const html=`<html><head><title>${esc(q.title)} - ${esc(supplier)}</title><style>body{font-family:Arial;padding:34px;color:#17202a}h1{margin-bottom:4px}p{color:#667}table{width:100%;border-collapse:collapse;margin-top:22px}td,th{border:1px solid #ddd;padding:9px;text-align:left}th{background:#f4f6f8}</style></head><body><h1>${esc(qs.printTitle||'Fechamento de Cotação')}</h1><p><b>${esc(b.documentName||b.companyName||'')}</b>${b.cnpj?` • ${esc(b.cnpj)}`:''}</p><h2>${esc(supplier)}</h2><p>${esc(q.title)}</p><table><thead><tr><th>Produto</th><th>Qtd</th><th>Marca</th><th>Valor unit.</th><th>Prazo</th></tr></thead><tbody>${wins.map(w=>`<tr><td>${esc(w.item.name)}</td><td>${w.item.quantity} ${esc(w.item.unit)}</td><td>${esc(w.winner.brand||'-')}</td><td>${currency(w.winner.unitPrice)}</td><td>${esc(w.winner.deliveryTime||'-')}</td></tr>`).join('')}</tbody></table></body></html>`;const win=window.open('','_blank');win.document.write(html);win.document.close();win.print()}
async function importNfe(){try{if(!$("xmlFile").files[0])return openModal('Atenção','<p>Selecione um arquivo XML.</p>');const fd=new FormData();fd.append('xml',$("xmlFile").files[0]);const r=await fetch('/api/import-nfe',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw new Error(j.error);$("nfeMsg").textContent=`Importados ${j.imported} itens${j.skipped?` e ignorados ${j.skipped}`:''}.`;toast('NF-e importada');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}

function showCmsTab(name,btn){document.querySelectorAll('.cms-pane').forEach(p=>p.classList.add('hidden'));$("cms-"+name)?.classList.remove('hidden');document.querySelectorAll('.cms-tabs button').forEach(b=>b.classList.remove('active'));btn?.classList.add('active')}
function setVal(id,v){const el=$(id);if(el)el.value=v??''}function setCheck(id,v){const el=$(id);if(el)el.checked=!!v}
function renderCms(){const s=state.settings||{},b=s.branding||{},a=s.appearance||{},st=s.stock||{},q=s.quotes||{},sp=s.supplierPortal||{},nf=s.nfe||{},m=s.modules||{};
  setVal('cfgSystemName',b.systemName);setVal('cfgModuleName',b.moduleName);setVal('cfgShortName',b.shortName);setVal('cfgLogoUrl',b.logoUrl);setVal('cfgCompanyName',b.companyName);setVal('cfgDocumentName',b.documentName);setVal('cfgCnpj',b.cnpj);setVal('cfgPhone',b.phone);setVal('cfgEmail',b.email);setVal('cfgAddress',b.address);
  setVal('cfgAccent',a.accent||'#246BCE');setVal('cfgAccent2',a.accent2||'#4F8FE8');setVal('cfgGold',a.gold||'#7D91A8');setVal('cfgDanger',a.danger||'#E4515A');setVal('cfgDensity',a.density||'comfortable');setVal('cfgFontScale',a.fontScale||100);setVal('cfgRadius',a.radius||20);setCheck('cfgSidebarCompact',a.sidebarCompact);$("fontScaleValue").textContent=(a.fontScale||100)+'%';$("radiusValue").textContent=(a.radius||20)+'px';
  setVal('cfgDefaultUnit',st.defaultUnit||'un');setVal('cfgUnits',(st.units||[]).join(', '));setVal('cfgDefaultMinStock',st.defaultMinStock||0);setCheck('cfgAllowNegative',st.allowNegative);setCheck('cfgRequireMoveNote',st.requireMoveNote);setCheck('cfgLowStockInclusive',st.lowStockInclusive!==false);
  setVal('cfgQuoteTitle',q.defaultTitle);setVal('cfgCurrency',q.currency||'R$');setVal('cfgPrintTitle',q.printTitle);setVal('cfgWhatsGreeting',q.whatsGreeting);setVal('cfgWhatsFooter',q.whatsFooter);setCheck('cfgLowestWinner',q.showWinnerByLowestPrice!==false);
  setVal('cfgPortalTitle',sp.title);setVal('cfgPortalIntro',sp.intro);setCheck('cfgRequireBrand',sp.requireBrand);setCheck('cfgRequireDelivery',sp.requireDelivery);setCheck('cfgRequirePayment',sp.requirePayment);
  setVal('cfgNfeCategory',nf.defaultCategoryName);setCheck('cfgNfeCreate',nf.createMissingProducts!==false);
  setCheck('modDashboard',m.dashboard!==false);setCheck('modProducts',m.products!==false);setCheck('modStockMoves',m.stockMoves!==false);setCheck('modQuotes',m.quotes!==false);setCheck('modNfe',m.nfe!==false);setCheck('modSuppliers',m.suppliers!==false);setCheck('modCategories',m.categories!==false);setCheck('modUsers',m.users!==false);
  const admin=state.users.find(u=>u.id==='u_admin')||state.users.find(u=>u.role==='admin');if(admin){setVal('cfgAdminName',admin.name);setVal('cfgAdminLogin',admin.username);setVal('cfgAdminPass','')}
}
function collectSettings(){return {branding:{systemName:$("cfgSystemName").value.trim(),moduleName:$("cfgModuleName").value.trim(),shortName:$("cfgShortName").value.trim(),logoUrl:$("cfgLogoUrl").value.trim(),companyName:$("cfgCompanyName").value.trim(),documentName:$("cfgDocumentName").value.trim(),cnpj:$("cfgCnpj").value.trim(),phone:$("cfgPhone").value.trim(),email:$("cfgEmail").value.trim(),address:$("cfgAddress").value.trim()},appearance:{accent:$("cfgAccent").value,accent2:$("cfgAccent2").value,gold:$("cfgGold").value,danger:$("cfgDanger").value,radius:Number($("cfgRadius").value),density:$("cfgDensity").value,fontScale:Number($("cfgFontScale").value),sidebarCompact:$("cfgSidebarCompact").checked},stock:{defaultUnit:$("cfgDefaultUnit").value.trim()||'un',units:$("cfgUnits").value.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean),defaultMinStock:Number($("cfgDefaultMinStock").value||0),allowNegative:$("cfgAllowNegative").checked,requireMoveNote:$("cfgRequireMoveNote").checked,lowStockInclusive:$("cfgLowStockInclusive").checked},quotes:{defaultTitle:$("cfgQuoteTitle").value.trim()||'Cotação',currency:$("cfgCurrency").value.trim()||'R$',whatsGreeting:$("cfgWhatsGreeting").value,whatsFooter:$("cfgWhatsFooter").value,printTitle:$("cfgPrintTitle").value,showWinnerByLowestPrice:$("cfgLowestWinner").checked},supplierPortal:{title:$("cfgPortalTitle").value,intro:$("cfgPortalIntro").value,requireBrand:$("cfgRequireBrand").checked,requireDelivery:$("cfgRequireDelivery").checked,requirePayment:$("cfgRequirePayment").checked},nfe:{defaultCategoryName:$("cfgNfeCategory").value.trim()||'Importado NF-e',createMissingProducts:$("cfgNfeCreate").checked},modules:{dashboard:$("modDashboard").checked,suppliers:$("modSuppliers").checked,users:$("modUsers").checked,categories:$("modCategories").checked,products:$("modProducts").checked,stockMoves:$("modStockMoves").checked,quotes:$("modQuotes").checked,nfe:$("modNfe").checked,cms:true}}}
async function saveSettings(){try{state.settings=(await api('/api/settings',{method:'PUT',body:JSON.stringify(collectSettings())})).settings;applySettings();renderAll();toast('Configurações salvas')}catch(e){openModal('Erro ao salvar',`<p>${esc(e.message)}</p>`)}}
function resetSettings(){confirmModal('Restaurar configurações','Deseja restaurar o padrão visual e operacional do CMS? Seus produtos, fornecedores, usuários e cotações não serão apagados.',async()=>{try{state.settings=(await api('/api/settings/reset',{method:'POST'})).settings;applySettings();renderAll();toast('Configurações restauradas')}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}})}
async function saveAdminCredentials(){try{const admin=state.users.find(u=>u.id==='u_admin')||state.users.find(u=>u.role==='admin');if(!admin)throw new Error('Administrador não encontrado.');await api('/api/users/'+admin.id,{method:'PUT',body:JSON.stringify({name:$("cfgAdminName").value.trim(),username:$("cfgAdminLogin").value.trim(),password:$("cfgAdminPass").value})});toast('Acesso administrativo atualizado');await load()}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}}

function delSupplier(id){confirmModal('Excluir fornecedor','Deseja excluir este fornecedor? O acesso vinculado também será removido.',async()=>{await api('/api/suppliers/'+id,{method:'DELETE'});await load();toast('Fornecedor excluído')})}
function delUser(id){confirmModal('Excluir usuário','Deseja excluir este usuário?',async()=>{await api('/api/users/'+id,{method:'DELETE'});await load();toast('Usuário excluído')})}
function delCategory(id){confirmModal('Excluir categoria','Deseja excluir esta categoria?',async()=>{try{await api('/api/categories/'+id,{method:'DELETE'});await load();toast('Categoria excluída')}catch(e){openModal('Erro',`<p>${esc(e.message)}</p>`)}})}
function delProduct(id){confirmModal('Excluir produto','Deseja excluir este produto?',async()=>{await api('/api/products/'+id,{method:'DELETE'});await load();toast('Produto excluído')})}
function delQuote(id){confirmModal('Excluir cotação','Deseja excluir esta cotação?',async()=>{await api('/api/quotes/'+id,{method:'DELETE'});if(activeQuoteId===id)activeQuoteId=null;await load();toast('Cotação excluída')})}
async function logout(){await fetch('/api/logout',{method:'POST'});location.href='/'}

load().catch(e=>openModal('Erro',`<p>${esc(e.message)}</p>`));
