const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
let neonReadyPromise = null;
const upload = multer({ storage: multer.memoryStorage() });

const DEFAULT_SETTINGS = {
  branding: {
    systemName: "VetCore",
    moduleName: "Estoque & Compras",
    shortName: "VC",
    logoUrl: "",
    companyName: "Clínica Veterinária Onda Animal",
    documentName: "Onda Animal",
    cnpj: "",
    phone: "",
    email: "",
    address: ""
  },
  appearance: {
    accent: "#246BCE",
    accent2: "#4F8FE8",
    gold: "#7D91A8",
    danger: "#E4515A",
    radius: 20,
    density: "comfortable",
    fontScale: 100,
    sidebarCompact: false
  },
  stock: {
    defaultUnit: "un",
    units: ["un", "cx", "pct", "fr", "amp", "ml", "l", "g", "kg"],
    defaultMinStock: 0,
    allowNegative: false,
    requireMoveNote: false,
    lowStockInclusive: true
  },
  quotes: {
    defaultTitle: "Cotação",
    currency: "R$",
    whatsGreeting: "Olá! Segue fechamento da cotação {cotacao}:",
    whatsFooter: "Obrigado!",
    printTitle: "Fechamento de Cotação",
    showWinnerByLowestPrice: true
  },
  supplierPortal: {
    title: "Minhas cotações",
    intro: "Preencha valores, marca, prazo e condições. Tudo salva online no sistema.",
    requireBrand: false,
    requireDelivery: false,
    requirePayment: false
  },
  nfe: {
    defaultCategoryName: "Importado NF-e",
    createMissingProducts: true
  },
  modules: {
    dashboard: true,
    suppliers: true,
    users: true,
    categories: true,
    products: true,
    stockMoves: true,
    quotes: true,
    nfe: true,
    cms: true
  }
};

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
const SESSION_SECRET = process.env.SESSION_SECRET || "vetcore-estoque-dev-secret-change-me";

function b64url(input){
  return Buffer.from(input).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function fromB64url(input){
  const normalized = String(input||"").replace(/-/g,"+").replace(/_/g,"/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}
function signPayload(payload){
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function authToken(user){
  const payload = b64url(JSON.stringify({user, exp:Date.now() + 1000*60*60*12}));
  return payload + "." + signPayload(payload);
}
function parseAuthToken(token){
  try{
    const [payload, sig] = String(token||"").split(".");
    if(!payload || !sig) return null;
    const expected = signPayload(payload);
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if(a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
    const parsed = JSON.parse(fromB64url(payload));
    if(!parsed?.user || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.user;
  }catch{return null;}
}
function getCookie(req,name){
  const raw = req.headers.cookie || "";
  for(const chunk of raw.split(";")){
    const i = chunk.indexOf("=");
    if(i < 0) continue;
    if(chunk.slice(0,i).trim() === name) return decodeURIComponent(chunk.slice(i+1).trim());
  }
  return "";
}
function setAuthCookie(res, token){
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `vetcore_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`);
}
function clearAuthCookie(res){
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `vetcore_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
app.use((req,res,next)=>{
  req.session = { user: parseAuthToken(getCookie(req,"vetcore_auth")) };
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function uid(prefix){ return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8); }
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function mergeDeep(base, extra){
  const out = Array.isArray(base) ? [...base] : { ...base };
  if(!extra || typeof extra !== "object") return out;
  Object.keys(extra).forEach(key => {
    if(extra[key] && typeof extra[key] === "object" && !Array.isArray(extra[key]) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])){
      out[key] = mergeDeep(base[key], extra[key]);
    } else {
      out[key] = extra[key];
    }
  });
  return out;
}
function normalizeDB(db){
  db.users = Array.isArray(db.users) ? db.users : [];
  db.suppliers = Array.isArray(db.suppliers) ? db.suppliers : [];
  db.products = Array.isArray(db.products) ? db.products : [];
  db.stockMoves = Array.isArray(db.stockMoves) ? db.stockMoves : [];
  db.quotes = Array.isArray(db.quotes) ? db.quotes : [];
  db.categories = Array.isArray(db.categories) ? db.categories : [];
  db.settings = mergeDeep(clone(DEFAULT_SETTINGS), db.settings || {});
  return db;
}
async function ensureNeon(){
  if(!sql) return;
  if(!neonReadyPromise){
    neonReadyPromise = (async()=>{
      await sql`CREATE TABLE IF NOT EXISTS vetcore_state (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      const rows = await sql`SELECT id FROM vetcore_state WHERE id = 1`;
      if(!rows.length){
        let seed = normalizeDB({users:[],suppliers:[],products:[],stockMoves:[],quotes:[],categories:[]});
        try{
          if(fs.existsSync(DB_PATH)) seed = normalizeDB(JSON.parse(fs.readFileSync(DB_PATH,"utf8")));
        }catch(e){ console.warn("Falha ao ler seed local:", e.message); }
        await sql`INSERT INTO vetcore_state (id,data) VALUES (1, ${JSON.stringify(seed)}::jsonb)
                  ON CONFLICT (id) DO NOTHING`;
      }
    })().catch(err=>{
      neonReadyPromise = null;
      throw err;
    });
  }
  return neonReadyPromise;
}
async function readDB(){
  if(sql){
    await ensureNeon();
    const rows = await sql`SELECT data FROM vetcore_state WHERE id = 1`;
    if(!rows.length) return normalizeDB({users:[],suppliers:[],products:[],stockMoves:[],quotes:[],categories:[]});
    return normalizeDB(rows[0].data);
  }
  if(!fs.existsSync(DB_PATH)){
    fs.mkdirSync(path.dirname(DB_PATH), {recursive:true});
    fs.writeFileSync(DB_PATH, JSON.stringify(normalizeDB({users:[],suppliers:[],products:[],stockMoves:[],quotes:[],categories:[]}), null, 2));
  }
  return normalizeDB(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
}
async function writeDB(db){
  db = normalizeDB(db);
  if(sql){
    await ensureNeon();
    await sql`INSERT INTO vetcore_state (id,data,updated_at)
              VALUES (1, ${JSON.stringify(db)}::jsonb, NOW())
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function verifyPassword(password, stored){
  stored = String(stored || "");
  if(!stored.startsWith("scrypt$")) return String(password) === stored; // compatibilidade com bases antigas
  const parts = stored.split("$");
  if(parts.length !== 3) return false;
  const test = crypto.scryptSync(String(password), parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}
function safeUser(u){ return {id:u.id,name:u.name,username:u.username,role:u.role,supplierId:u.supplierId||null,active:u.active!==false}; }
function requireLogin(req,res,next){ if(!req.session.user) return res.status(401).json({error:"Sessão expirada. Entre novamente."}); next(); }
function requireAdmin(req,res,next){ if(!req.session.user || req.session.user.role !== "admin") return res.status(403).json({error:"Acesso negado."}); next(); }
function requireStockOrAdmin(req,res,next){ if(!req.session.user || !["admin","estoque"].includes(req.session.user.role)) return res.status(403).json({error:"Acesso negado."}); next(); }
function sanitizeSettings(input){
  const s = mergeDeep(clone(DEFAULT_SETTINGS), input || {});
  const colorKeys = ["accent","accent2","gold","danger"];
  colorKeys.forEach(k => { if(!/^#[0-9a-f]{6}$/i.test(String(s.appearance[k]||""))) s.appearance[k] = DEFAULT_SETTINGS.appearance[k]; });
  s.appearance.radius = Math.max(8, Math.min(32, Number(s.appearance.radius)||20));
  s.appearance.fontScale = Math.max(85, Math.min(120, Number(s.appearance.fontScale)||100));
  s.appearance.density = ["compact","comfortable","spacious"].includes(s.appearance.density) ? s.appearance.density : "comfortable";
  s.stock.defaultMinStock = Math.max(0, Number(s.stock.defaultMinStock)||0);
  s.stock.units = Array.isArray(s.stock.units) ? [...new Set(s.stock.units.map(x=>String(x).trim()).filter(Boolean))].slice(0,40) : DEFAULT_SETTINGS.stock.units;
  if(!s.stock.units.length) s.stock.units = ["un"];
  ["sidebarCompact"].forEach(k=>s.appearance[k]=!!s.appearance[k]);
  ["allowNegative","requireMoveNote","lowStockInclusive"].forEach(k=>s.stock[k]=!!s.stock[k]);
  ["showWinnerByLowestPrice"].forEach(k=>s.quotes[k]=!!s.quotes[k]);
  ["requireBrand","requireDelivery","requirePayment"].forEach(k=>s.supplierPortal[k]=!!s.supplierPortal[k]);
  ["createMissingProducts"].forEach(k=>s.nfe[k]=!!s.nfe[k]);
  Object.keys(DEFAULT_SETTINGS.modules).forEach(k=>s.modules[k]=s.modules[k] !== false);
  return s;
}

app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public","login.html")));
app.get("/api/public-settings", async (req,res)=>{
  const s = (await readDB()).settings;
  res.json({branding:s.branding, appearance:s.appearance});
});

app.post("/api/login", async (req,res)=>{
  const db = await readDB();
  const {username,password} = req.body;
  const user = db.users.find(u=>u.username===username && u.active !== false);
  if(!user || !verifyPassword(password, user.password)) return res.status(401).json({error:"Usuário ou senha inválidos."});
  if(!String(user.password||"").startsWith("scrypt$")){ user.password = hashPassword(password); await writeDB(db); }
  const sessionUser = safeUser(user);
  setAuthCookie(res, authToken(sessionUser));
  req.session.user = sessionUser;
  res.json({ok:true,user:sessionUser});
});
app.post("/api/logout", (req,res)=>{ clearAuthCookie(res); res.json({ok:true}); });
app.get("/api/me", requireLogin, (req,res)=>res.json(req.session.user));

app.get("/api/state", requireLogin, async (req,res)=>{
  const db = await readDB();
  const me = req.session.user;
  if(me.role === "fornecedor"){
    const supplier = db.suppliers.find(s=>s.id===me.supplierId);
    const quotes = db.quotes
      .map(q=>({id:q.id,title:q.title,status:q.status,createdAt:q.createdAt,items:q.items,suppliers:q.suppliers.filter(s=>s.supplierId===me.supplierId)}))
      .filter(q=>q.suppliers.length);
    return res.json({user:me,supplier,quotes,settings:db.settings});
  }
  if(me.role === "estoque"){
    return res.json({
      user: me,
      products: db.products,
      categories: db.categories,
      stockMoves: db.stockMoves.filter(m=>m.type==="saida").slice(-200),
      settings: db.settings
    });
  }
  res.json({...db, users: db.users.map(safeUser)});
});

app.put("/api/settings", requireAdmin, async (req,res)=>{
  const db = await readDB();
  db.settings = sanitizeSettings(req.body || {});
  await writeDB(db);
  res.json({ok:true, settings:db.settings});
});
app.post("/api/settings/reset", requireAdmin, async (req,res)=>{
  const db = await readDB();
  db.settings = clone(DEFAULT_SETTINGS);
  await writeDB(db);
  res.json({ok:true, settings:db.settings});
});

app.post("/api/users", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const {name,username,password,role,supplierId} = req.body;
  if(!name || !username || !password || !role) return res.status(400).json({error:"Preencha nome, login, senha e perfil."});
  if(db.users.some(u=>u.username===username)) return res.status(400).json({error:"Esse login já existe."});
  if(role==="fornecedor" && !supplierId) return res.status(400).json({error:"Usuário fornecedor precisa estar vinculado a um fornecedor."});
  const user = {id:uid("usr"),name,username,password:hashPassword(password),role,supplierId:role==="fornecedor"?supplierId:null,active:true};
  db.users.push(user); await writeDB(db); res.json({ok:true,user:safeUser(user)});
});

app.put("/api/users/:id", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const user = db.users.find(u=>u.id===req.params.id);
  if(!user) return res.status(404).json({error:"Usuário não encontrado."});
  const {name,username,password,role,supplierId,active} = req.body;
  if(username && username !== user.username && db.users.some(u=>u.username===username && u.id!==user.id)) return res.status(400).json({error:"Esse login já existe."});
  if(name !== undefined) user.name = name;
  if(username !== undefined) user.username = username;
  if(password !== undefined && password !== "") user.password = hashPassword(password);
  if(role !== undefined) user.role = role;
  if(active !== undefined) user.active = !!active;
  if(user.role === "fornecedor"){
    if(!supplierId && supplierId !== undefined) return res.status(400).json({error:"Usuário fornecedor precisa estar vinculado a um fornecedor."});
    if(supplierId !== undefined) user.supplierId = supplierId;
  } else user.supplierId = null;
  await writeDB(db);
  res.json({ok:true,user:safeUser(user)});
});
app.delete("/api/users/:id", requireAdmin, async (req,res)=>{
  const db = await readDB();
  if(req.params.id==="u_admin") return res.status(400).json({error:"O admin inicial não pode ser excluído."});
  db.users = db.users.filter(u=>u.id!==req.params.id);
  await writeDB(db); res.json({ok:true});
});

app.post("/api/suppliers", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const {name,phone,email,username,password} = req.body;
  if(!name) return res.status(400).json({error:"Nome do fornecedor é obrigatório."});
  if(username && db.users.some(u=>u.username===username)) return res.status(400).json({error:"Esse login já existe."});
  const supplier = {id:uid("sup"),name,phone:phone||"",email:email||""};
  db.suppliers.push(supplier);
  if(username && password) db.users.push({id:uid("usr"),name,username,password:hashPassword(password),role:"fornecedor",supplierId:supplier.id,active:true});
  await writeDB(db); res.json({ok:true,supplier});
});
app.put("/api/suppliers/:id", requireAdmin, async (req,res)=>{
  const db = await readDB(); const s = db.suppliers.find(x=>x.id===req.params.id);
  if(!s) return res.status(404).json({error:"Fornecedor não encontrado."});
  ["name","phone","email"].forEach(k=>{ if(req.body[k]!==undefined) s[k]=req.body[k]; });
  if(!String(s.name||"").trim()) return res.status(400).json({error:"Nome do fornecedor é obrigatório."});
  await writeDB(db); res.json({ok:true,supplier:s});
});
app.delete("/api/suppliers/:id", requireAdmin, async (req,res)=>{
  const db = await readDB();
  db.suppliers = db.suppliers.filter(s=>s.id!==req.params.id);
  db.users = db.users.filter(u=>u.supplierId!==req.params.id);
  await writeDB(db); res.json({ok:true});
});

app.post("/api/categories", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const name = (req.body.name || "").trim();
  if(!name) return res.status(400).json({error:"Nome da categoria é obrigatório."});
  if(db.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())) return res.status(400).json({error:"Categoria já cadastrada."});
  const category = {id:uid("cat"), name};
  db.categories.push(category); await writeDB(db); res.json({ok:true, category});
});
app.put("/api/categories/:id", requireAdmin, async (req,res)=>{
  const db = await readDB(); const c=db.categories.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({error:"Categoria não encontrada."});
  const name=String(req.body.name||"").trim(); if(!name) return res.status(400).json({error:"Nome da categoria é obrigatório."});
  if(db.categories.some(x=>x.id!==c.id && x.name.toLowerCase()===name.toLowerCase())) return res.status(400).json({error:"Categoria já cadastrada."});
  c.name=name; await writeDB(db); res.json({ok:true,category:c});
});
app.delete("/api/categories/:id", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const inUse = db.products.some(p=>p.categoryId===req.params.id || p.category===req.params.id);
  if(inUse) return res.status(400).json({error:"Categoria em uso por produtos. Altere os produtos antes de excluir."});
  db.categories = db.categories.filter(c=>c.id!==req.params.id); await writeDB(db); res.json({ok:true});
});

app.post("/api/products", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const {name,category,categoryId,supplierId,stock,minStock,unit,ean} = req.body;
  if(!name) return res.status(400).json({error:"Nome do produto é obrigatório."});
  const product = {id:uid("prod"),name,categoryId:categoryId||"",category:category||"",supplierId:supplierId||"",stock:Number(stock||0),minStock:minStock===""||minStock===undefined?Number(db.settings.stock.defaultMinStock||0):Number(minStock||0),unit:unit||db.settings.stock.defaultUnit||"un",ean:ean||""};
  db.products.push(product); await writeDB(db); res.json({ok:true,product});
});
app.put("/api/products/:id", requireAdmin, async (req,res)=>{
  const db=await readDB(); const p=db.products.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:"Produto não encontrado."});
  ["name","categoryId","category","supplierId","unit","ean"].forEach(k=>{if(req.body[k]!==undefined)p[k]=req.body[k]});
  ["stock","minStock"].forEach(k=>{if(req.body[k]!==undefined && req.body[k]!=="")p[k]=Number(req.body[k])});
  if(!String(p.name||"").trim()) return res.status(400).json({error:"Nome do produto é obrigatório."});
  await writeDB(db); res.json({ok:true,product:p});
});
app.delete("/api/products/:id", requireAdmin, async (req,res)=>{
  const db = await readDB(); db.products = db.products.filter(p=>p.id!==req.params.id); await writeDB(db); res.json({ok:true});
});

app.post("/api/stock-out", requireStockOrAdmin, async (req,res)=>{
  const db = await readDB();
  const {productId,quantity,note} = req.body;
  const product = db.products.find(p=>p.id===productId);
  if(!product) return res.status(404).json({error:"Produto não encontrado."});
  const qty = Number(quantity||0);
  if(qty<=0) return res.status(400).json({error:"Quantidade inválida."});
  if(db.settings.stock.requireMoveNote && !String(note||"").trim()) return res.status(400).json({error:"A observação é obrigatória nas movimentações."});
  if(!db.settings.stock.allowNegative && Number(product.stock||0) - qty < 0) return res.status(400).json({error:"Estoque insuficiente."});
  product.stock = Number(product.stock||0) - qty;
  db.stockMoves.push({
    id:uid("mov"), productId, type:"saida", quantity:qty, note:note||"",
    date:new Date().toISOString(), userId:req.session.user.id, userName:req.session.user.name
  });
  await writeDB(db);
  res.json({ok:true,product});
});

app.post("/api/stock", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const {productId,type,quantity,note} = req.body;
  const product = db.products.find(p=>p.id===productId);
  if(!product) return res.status(404).json({error:"Produto não encontrado."});
  const qty = Number(quantity||0);
  if(qty<=0) return res.status(400).json({error:"Quantidade inválida."});
  if(db.settings.stock.requireMoveNote && !String(note||"").trim()) return res.status(400).json({error:"A observação é obrigatória nas movimentações."});
  if(type==="entrada") product.stock += qty;
  else if(type==="saida"){
    if(!db.settings.stock.allowNegative && product.stock - qty < 0) return res.status(400).json({error:"Saída maior que o estoque atual. Libere estoque negativo no CMS se necessário."});
    product.stock -= qty;
  } else return res.status(400).json({error:"Tipo inválido."});
  db.stockMoves.push({id:uid("mov"),productId,type,quantity:qty,note:note||"",date:new Date().toISOString(),userId:req.session.user.id,userName:req.session.user.name});
  await writeDB(db); res.json({ok:true,product});
});

app.post("/api/quotes", requireAdmin, async (req,res)=>{
  const db = await readDB();
  const {title,productIds,supplierIds} = req.body;
  if(!productIds?.length) return res.status(400).json({error:"Selecione pelo menos um produto."});
  if(!supplierIds?.length) return res.status(400).json({error:"Selecione pelo menos um fornecedor."});
  const items = productIds.map(pid=>{
    const p = db.products.find(x=>x.id===pid);
    if(!p) return null;
    const needed = Math.max(1, Number(p.minStock||0) - Number(p.stock||0));
    return {productId:p.id,name:p.name,quantity:needed,unit:p.unit||db.settings.stock.defaultUnit||"un"};
  }).filter(Boolean);
  const quote = {id:uid("cot"),title:title||db.settings.quotes.defaultTitle||"Cotação",status:"aberta",createdAt:new Date().toISOString(),items,suppliers:supplierIds.map(sid=>({supplierId:sid,status:"pendente",respondedAt:null,answers:[]}))};
  db.quotes.push(quote); await writeDB(db); res.json({ok:true,quote});
});
app.post("/api/quotes/:quoteId/respond", requireLogin, async (req,res)=>{
  const db = await readDB();
  const quote = db.quotes.find(q=>q.id===req.params.quoteId);
  if(!quote) return res.status(404).json({error:"Cotação não encontrada."});
  const supplierId = req.session.user.role==="fornecedor" ? req.session.user.supplierId : req.body.supplierId;
  const row = quote.suppliers.find(s=>s.supplierId===supplierId);
  if(!row) return res.status(403).json({error:"Fornecedor não participa desta cotação."});
  const answers=(req.body.answers||[]).map(a=>({productId:a.productId,brand:a.brand||"",unitPrice:Number(a.unitPrice||0),deliveryTime:a.deliveryTime||"",paymentCondition:a.paymentCondition||"",note:a.note||""}));
  for(const a of answers){
    const item=quote.items.find(i=>i.productId===a.productId); if(!item) continue;
    if(a.unitPrice<=0) return res.status(400).json({error:`Informe um valor válido para ${item.name}.`});
    if(db.settings.supplierPortal.requireBrand && !a.brand.trim()) return res.status(400).json({error:`Informe a marca de ${item.name}.`});
    if(db.settings.supplierPortal.requireDelivery && !a.deliveryTime.trim()) return res.status(400).json({error:`Informe o prazo de ${item.name}.`});
    if(db.settings.supplierPortal.requirePayment && !a.paymentCondition.trim()) return res.status(400).json({error:`Informe a condição de pagamento de ${item.name}.`});
  }
  row.answers = answers; row.status = "respondida"; row.respondedAt = new Date().toISOString();
  await writeDB(db); res.json({ok:true});
});
app.delete("/api/quotes/:id", requireAdmin, async (req,res)=>{
  const db = await readDB(); db.quotes = db.quotes.filter(q=>q.id!==req.params.id); await writeDB(db); res.json({ok:true});
});

app.post("/api/import-nfe", requireAdmin, upload.single("xml"), async (req,res)=>{
  const db = await readDB();
  const xml = req.file ? req.file.buffer.toString("utf8") : "";
  if(!xml) return res.status(400).json({error:"XML não enviado."});
  const dets = [...xml.matchAll(/<det[\s\S]*?<\/det>/g)].map(m=>m[0]);
  let imported = 0, skipped=0;
  dets.forEach(det=>{
    const name = (det.match(/<xProd>(.*?)<\/xProd>/)?.[1]||"").trim();
    const ean = (det.match(/<cEAN>(.*?)<\/cEAN>/)?.[1]||"").trim();
    const qty = Number((det.match(/<qCom>(.*?)<\/qCom>/)?.[1]||"0").replace(",","."));
    if(!name || !qty) return;
    let product = db.products.find(p=>(ean && p.ean===ean) || p.name.toLowerCase()===name.toLowerCase());
    if(!product && !db.settings.nfe.createMissingProducts){ skipped++; return; }
    if(!product){
      const catName=db.settings.nfe.defaultCategoryName||"Importado NF-e";
      let cat=db.categories.find(c=>c.name.toLowerCase()===catName.toLowerCase());
      if(!cat){cat={id:uid("cat"),name:catName};db.categories.push(cat);}
      product = {id:uid("prod"),name,category:catName,categoryId:cat.id,supplierId:"",stock:0,minStock:Number(db.settings.stock.defaultMinStock||0),unit:db.settings.stock.defaultUnit||"un",ean}; db.products.push(product);
    }
    product.stock += qty;
    db.stockMoves.push({id:uid("mov"),productId:product.id,type:"entrada",quantity:qty,note:"Entrada via XML NF-e",date:new Date().toISOString(),userId:req.session.user.id});
    imported++;
  });
  await writeDB(db); res.json({ok:true,imported,skipped});
});


app.get("/api/health", async (req,res)=>{
  try{
    const db = await readDB();
    res.json({ok:true,version:"29.0.0",storage:sql?"neon":"local",users:db.users.length,products:db.products.length});
  }catch(e){
    res.status(500).json({ok:false,error:"Falha de conexão com o banco."});
  }
});

app.use((err,req,res,next)=>{
  console.error(err);
  if(res.headersSent) return next(err);
  res.status(500).json({error:"Erro interno do sistema."});
});

if(require.main === module){
  app.listen(PORT, ()=>console.log("VetCore Estoque rodando na porta "+PORT));
}
module.exports = app;
