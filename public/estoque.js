let state = {};
let selectedProduct = null;
let moveMode = "normal";
const $ = id => document.getElementById(id);

async function api(url, opts = {}) {
  const o = { ...opts };
  if (o.body && !(o.body instanceof FormData)) o.headers = {"Content-Type":"application/json"};
  const r = await fetch(url, o);
  const j = await r.json().catch(()=>({}));
  if(!r.ok) {
    if(r.status===401) location.href="/";
    throw new Error(j.error || "Erro");
  }
  return j;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function load(){
  state = await api("/api/state");
  state.products ||= []; state.categories ||= []; state.stockMoves ||= [];
  if(state.user?.role!=="estoque" && state.user?.role!=="admin") return location.href="/";
  $("who").textContent = state.user?.name || "Estoque";
  renderStockOuts();
  $("scanInput").focus();
}
function categoryName(id){ return state.categories.find(c=>c.id===id)?.name || "Sem categoria"; }
function setMoveMode(mode){
  moveMode = mode === "transfer" ? "transfer" : "normal";
  document.querySelectorAll("[data-move-mode]").forEach(btn=>btn.classList.toggle("active", btn.dataset.moveMode===moveMode));
  const isTransfer = moveMode === "transfer";
  $("transferNotice")?.classList.toggle("hidden", !isTransfer);
  if($("stockConfirmBtn")) $("stockConfirmBtn").classList.toggle("transfer-active", isTransfer);
  if($("stockConfirmTitle")) $("stockConfirmTitle").textContent = isTransfer ? "Confirmar transferência" : "Confirmar saída";
  if($("stockConfirmSubtitle")) $("stockConfirmSubtitle").textContent = isTransfer ? "Baixar do estoque e registrar destino Cachoeirinha" : "Registrar movimentação no estoque";
  if($("outNote")) $("outNote").placeholder = isTransfer ? "Ex.: caixa 1, pedido da unidade, responsável..." : "Ex.: Internação, consultório, uso interno...";
}

function productById(id){ return state.products.find(p=>p.id===id); }
function selectProduct(id){
  selectedProduct = productById(id);
  closeModal(); renderSelected(); beepOk(); $("outQty").focus();
}
function renderSelected(){
  const box=$("selectedProductBox");
  if(!selectedProduct){box.className="empty-state";box.innerHTML="Nenhum produto selecionado.";return}
  box.className="selected-product";
  box.innerHTML=`<div class="selected-product-head"><div><span class="eyebrow">SELECIONADO</span><h2>${esc(selectedProduct.name)}</h2></div><span class="stock-value">${Number(selectedProduct.stock||0)} ${esc(selectedProduct.unit||"un")}</span></div>
    <div class="selected-meta"><span>Categoria: <b>${esc(categoryName(selectedProduct.categoryId))}</b></span><span>EAN: <b>${esc(selectedProduct.ean||"-")}</b></span></div>`;
}
function findByEAN(){
  const code=$("scanInput").value.trim();
  if(!code){beepError();$("scanMsg").innerHTML='<span class="bad">Digite ou bipe um código.</span>';return}
  const p=state.products.find(p=>String(p.ean||"").trim()===code || String(p.id)===code);
  if(!p){beepError();$("scanMsg").innerHTML=`<span class="bad">Produto não encontrado para ${esc(code)}.</span>`;return}
  selectedProduct=p;$("scanMsg").innerHTML=`<span class="ok">Produto localizado: ${esc(p.name)}</span>`;$("scanInput").value="";
  renderSelected();beepOk();$("outQty").focus();
}
$("scanInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")findByEAN()});
async function saveStockOut(){
  try{
    if(!selectedProduct){beepError();return openModal("Atenção","<p>Selecione um produto primeiro.</p>")}
    const qty=Number($("outQty").value||0);
    if(qty<=0){beepError();return openModal("Atenção","<p>Informe uma quantidade válida.</p>")}
    const transfer = moveMode === "transfer";
    await api("/api/stock-out",{method:"POST",body:JSON.stringify({
      productId:selectedProduct.id,
      quantity:qty,
      note:$("outNote").value||"",
      movementKind: transfer ? "transferencia" : "saida",
      destination: transfer ? "Cachoeirinha" : ""
    })});
    toast(transfer ? "Transferência para Cachoeirinha registrada" : "Saída registrada");
    beepOk();selectedProduct=null;$("outQty").value=1;$("outNote").value="";renderSelected();await load();
    $("scanInput").focus();
  }catch(e){beepError();openModal("Erro",`<p>${esc(e.message)}</p>`)}
}
function openProductSearch(){
  openModal("Pesquisar produto",`<input id="modalProductSearch" placeholder="Buscar por nome, categoria ou EAN" oninput="renderProductSearchList()">
  <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>EAN</th><th>Estoque</th><th>Ação</th></tr></thead><tbody id="modalProductList"></tbody></table></div>`);
  renderProductSearchList();setTimeout(()=>$("modalProductSearch")?.focus(),100);
}
function renderProductSearchList(){
  const term=($("modalProductSearch")?.value||"").toLowerCase().trim();
  const filtered=state.products.filter(p=>`${p.name||""} ${categoryName(p.categoryId)} ${p.ean||""}`.toLowerCase().includes(term));
  $("modalProductList").innerHTML=filtered.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(categoryName(p.categoryId))}</td><td>${esc(p.ean||"-")}</td><td><span class="stock-value">${Number(p.stock||0)} ${esc(p.unit||"un")}</span></td><td><button class="secondary small" onclick="selectProduct('${p.id}')">Selecionar</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">Nenhum produto encontrado.</td></tr>';
}
function renderStockOuts(){
  const list=[...state.stockMoves].reverse();
  $("outCount").textContent=list.length;
  $("stockOutTable").innerHTML=list.map(m=>{
    const p=productById(m.productId);
    const transfer=m.movementKind==="transferencia" || !!m.destination;
    const destination=transfer?(m.destination||"Cachoeirinha"):"Saída normal";
    return `<tr><td>${m.date?new Date(m.date).toLocaleString("pt-BR"):"-"}</td><td><b>${esc(p?.name||"-")}</b></td><td><span class="pill bad-pill">-${Number(m.quantity||0)}</span></td><td><span class="pill ${transfer?'transfer-pill':'neutral-pill'}">${transfer?'→ ':''}${esc(destination)}</span></td><td>${esc(m.userName||"-")}</td><td>${esc(m.note||"-")}</td></tr>`
  }).join("")||'<tr><td colspan="6" class="empty">Nenhuma saída registrada.</td></tr>';
}
function beepOk(){beep(880,100)} function beepError(){beep(220,180)}
function beep(freq,duration){try{const A=window.AudioContext||window.webkitAudioContext;const c=new A(),o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;o.type="sine";g.gain.value=.06;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close()},duration)}catch{}}
async function logout(){await fetch("/api/logout",{method:"POST"});location.href="/"}
setMoveMode("normal");
load().catch(e=>openModal("Erro",`<p>${esc(e.message)}</p>`));
