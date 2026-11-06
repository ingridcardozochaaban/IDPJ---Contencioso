/* ---------- banco de dados: Supabase (projeto "IDPJ - Contencioso"), com login de cada pessoa ----------
   Tabelas: public.processos, public.agenda (audiências, prazos e follows) e public.decisoes.
   As permissões são aplicadas no próprio banco (RLS): o site só mostra ou esconde os botões. */
const SB_URL="https://mvjflaguvinptdeewkph.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12amZsYWd1dmlucHRkZWV3a3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjQ4MDUsImV4cCI6MjEwOTU0MDgwNX0.wPYpqLWhRRjipW4oRuVDRKk9OxPcFTwEOXJWTGULLaM";
const SB_T={audiencias:"agenda",processos:"processos",decisoes:"decisoes"};
const SBC={};let sb=null,me=null,sbSig="",sbReady=false,sbPending=0,sbKickT=null,sbLoading=null,sbLastLoad=0,sbPollT=null;
const isAdmin=()=>!!me&&me.papel==="admin";
const permOf=a=>isAdmin()?"editar":((me&&me.permissoes&&me.permissoes[a])||"nenhum");
const recOf=r=>isAdmin()||!!(me&&me.permissoes&&me.permissoes[r]);
function sbStatus(t){const s=$("#sbSt");if(s)s.textContent=t}
function sbBanner(html,retry){const b=$("#banner");b.innerHTML=html+(retry?` <button type="button" class="sm" id="sbRetry">${retry}</button>`:"");b.hidden=false}
function sbEmit(name){const c=SBC[name];if(!c)return;const docs=[...c.docs].map(([id,d])=>({id,data:()=>d}));c.subs.forEach(s=>{try{s.cb({docs})}catch(_){}})}
function sbKick(){clearTimeout(sbKickT);sbKickT=setTimeout(()=>{if(sbPending>0){sbKick();return}sbLoadAll().catch(()=>{})},1500)}
function sbNewId(){return (crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36)+Math.random().toString(36).slice(2)).slice(0,20)}
function sbErr(r,vazioEhErro){if(r.error){const e=r.error;throw {code:(e.code==="42501"||e.code==="PGRST116")?"sem_permissao":"erro",message:e.message}}
  if(vazioEhErro&&(!r.data||(Array.isArray(r.data)&&!r.data.length)))throw {code:"sem_permissao",message:"Sem permissão para esta alteração."};return r.data}
async function sbWrite(name,fn){sbPending++;
  try{const out=await fn(SBC[name].docs);sbEmit(name);sbStatus(`${me?me.sigla+" · ":""}salvo às `+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));return out}
  catch(e){if(e&&e.code==="sem_permissao")toast("Seu usuário não tem permissão para esta alteração.");throw e}
  finally{sbPending--;sbKick()}}
function sbCollection(name){const t=SB_T[name];SBC[name]={t,subs:[],docs:new Map()};
  const clone=o=>JSON.parse(JSON.stringify(o||{}));
  return {
    async add(o){const id=sbNewId(),d=clone(o);
      await sbWrite(name,async m=>{const r=sbErr(await sb.from(t).insert({id,dados:d}).select("dados"),true);m.set(id,r[0].dados)});return {id}},
    doc(id){id=id||sbNewId();return {id,
      async set(o){const d=clone(o);await sbWrite(name,async m=>{const r=sbErr(await sb.from(t).upsert({id,dados:d},{onConflict:"id"}).select("dados"),true);m.set(id,r[0].dados)})},
      async update(o){const d=clone(o);await sbWrite(name,async m=>{const cur=m.get(id)||{};const r=sbErr(await sb.from(t).update({dados:{...cur,...d}}).eq("id",id).select("dados"),true);m.set(id,r[0].dados)})},
      async delete(){await sbWrite(name,async m=>{sbErr(await sb.from(t).delete().eq("id",id).select("id"),true);m.delete(id)})}}},
    onSnapshot(cb,err){SBC[name].subs.push({cb,err});if(sbReady)sbEmit(name);return ()=>{}}}}
async function sbFetchAll(t){const out=[];for(let i=0;;i+=1000){const r=await sb.from(t).select("id,dados").order("id").range(i,i+999);if(r.error)throw {code:"erro",message:r.error.message};out.push(...r.data);if(r.data.length<1000)break}return out}
async function sbLoadAll(){if(sbLoading)return sbLoading;
  sbLoading=(async()=>{
    const [rows,sig]=await Promise.all([Promise.all(Object.values(SB_T).map(sbFetchAll)),sb.rpc("idpj_assinatura")]);
    Object.keys(SB_T).forEach((name,ix)=>{const m=new Map();for(const x of rows[ix])m.set(x.id,x.dados||{});SBC[name].docs=m});
    sbSig=sig&&sig.data||"";sbReady=true;sbLastLoad=Date.now();$("#banner").hidden=true;
    for(const name of Object.keys(SB_T))sbEmit(name);
    sbStatus(`${me.nome} (${me.sigla}) · atualizado às `+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
  })();
  try{await sbLoading}finally{sbLoading=null}}
async function sbPoll(){if(document.hidden||!sbReady||sbPending>0||Date.now()-sbLastLoad<20000)return;
  try{const r=await sb.rpc("idpj_assinatura");if(r.error)return;if(r.data!==sbSig)await sbLoadAll();else sbLastLoad=Date.now()}catch(_){}}
async function fnCall(name,body){const r=await sb.functions.invoke(name,{body});
  if(r.error){let msg=r.error.message,code="erro";try{const j=await r.error.context.json();msg=j.erro||msg;code=j.code||code}catch(_){}throw {code,message:msg}}
  return r.data}
/* análise com o Claude pelo servidor (a chave da API fica no Supabase) */
const blob64=b=>new Promise((ok,ko)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result).split(",")[1]);fr.onerror=ko;fr.readAsDataURL(b)});
const claudeSrv={
  async json(prompt,opts){opts=opts||{};const images=[];for(const b of (opts.images||[]))images.push({data:await blob64(b),media_type:b.type||"image/jpeg"});
    const call=fnCall("claude",{prompt,images,formato:"json"});
    const abort=opts.signal?new Promise((_,ko)=>opts.signal.addEventListener("abort",()=>ko({code:"cancelled"}),{once:true})):null;
    const r=await (abort?Promise.race([call,abort]):call);
    if(r&&r.json)return r.json;throw {code:"erro",message:"Resposta do Claude fora do formato esperado."}},
  async limits(){return {images:{maxCount:12}}}};
/* download de arquivos gerados no navegador */
const localDownloads={async save({filename,data}){const u=URL.createObjectURL(data);const a=document.createElement("a");a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}};

/* ---------- permissões na tela ---------- */
function aplicarPermissoes(){const B=document.body.classList;
  B.toggle("no-del",!isAdmin());
  const ag=permOf("agenda"),pr=permOf("processos"),de=permOf("decisoes");
  canWrite=ag==="editar";
  B.toggle("ro-agenda",ag!=="editar");B.toggle("ro-proc",pr!=="editar");B.toggle("ro-dec",de!=="editar");B.toggle("no-dec",de==="nenhum");
  $('[data-tab="agenda"]').hidden=ag==="nenhum";$('[data-tab="processos"]').hidden=pr==="nenhum";
  if(ag==="nenhum"&&pr!=="nenhum")showTab("processos");
  sampleFn=recOf("ia")?claudeSrv:null;
  downloads=recOf("exportar")?localDownloads:null;$("#btnIcs").hidden=!downloads;$("#btnCsv").hidden=!downloads;
  $("#btnXls").hidden=!(recOf("importar")&&ag==="editar");
  $("#btnUsuarios").hidden=!isAdmin();
  $("#userSigla").textContent=me.sigla;$("#userSigla").title=me.nome+(isAdmin()?" · administrador":"");}

/* ---------- login ---------- */
function mostrarLogin(msg){$("#loginBox").hidden=false;$("#app").hidden=true;$("#lgMsg").textContent=msg||"";setTimeout(()=>$("#lgEmail").focus(),50)}
function modoPrimeiro(on){$("#lgPrimeiro").hidden=!on;$("#lgSenhaBox").hidden=on;$("#lgTitulo").textContent=on?"Primeiro acesso ou nova senha":"Entrar";
  $("#lgBtn").textContent=on?"Criar senha e entrar":"Entrar";$("#lgToggle").textContent=on?"Voltar para o login":"Primeiro acesso ou esqueci a senha";$("#lgMsg").textContent=""}
$("#lgToggle").onclick=()=>modoPrimeiro($("#lgPrimeiro").hidden);
$("#lgForm").addEventListener("submit",async e=>{e.preventDefault();const btn=$("#lgBtn");const email=$("#lgEmail").value.trim().toLowerCase();
  const primeiro=!$("#lgPrimeiro").hidden;let senha=primeiro?$("#lgNova").value:$("#lgSenha").value;
  if(primeiro){if(senha.length<8){$("#lgMsg").textContent="A senha precisa ter pelo menos 8 caracteres.";return}if(senha!==$("#lgNova2").value){$("#lgMsg").textContent="As duas senhas não conferem.";return}}
  btn.disabled=true;$("#lgMsg").textContent=primeiro?"Criando a sua senha…":"Entrando…";
  try{if(primeiro)await fnCall("acesso",{acao:"primeiro_acesso",email,codigo:$("#lgCodigo").value,senha});
    const r=await sb.auth.signInWithPassword({email,password:senha});
    if(r.error){$("#lgMsg").textContent=/invalid/i.test(r.error.message)?"E-mail ou senha incorretos.":r.error.message;return}
    $("#lgSenha").value="";$("#lgNova").value="";$("#lgNova2").value="";$("#lgCodigo").value="";modoPrimeiro(false);await entrar()}
  catch(err){$("#lgMsg").textContent=err&&err.message||"Não foi possível entrar."}
  finally{btn.disabled=false}});
$("#btnSair").onclick=async()=>{await sb.auth.signOut();location.reload()};
async function entrar(){
  const {data:{user}}=await sb.auth.getUser();if(!user){mostrarLogin();return}
  const r=await sb.from("perfis").select("*").eq("user_id",user.id).maybeSingle();
  if(r.error||!r.data||!r.data.ativo){await sb.auth.signOut();mostrarLogin(r.data&&!r.data.ativo?"Seu acesso está desativado. Fale com o administrador.":"Seu acesso ainda não foi liberado pelo administrador.");return}
  me=r.data;$("#loginBox").hidden=true;$("#app").hidden=false;aplicarPermissoes();render();
  sbStatus("Carregando os dados…");
  try{await sbLoadAll()}catch(e){sbBanner(esc("Não foi possível carregar os dados: "+(e&&e.message||"")),"Tentar de novo")}
  if(!sbPollT){sbPollT=setInterval(sbPoll,30000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)sbPoll()})}}
$("#banner").addEventListener("click",async e=>{if(e.target.id!=="sbRetry")return;e.target.disabled=true;try{await sbLoadAll()}catch(err){sbBanner(esc("Não foi possível carregar os dados: "+(err&&err.message||"")),"Tentar de novo")}});

/* ---------- usuários (só administrador) ---------- */
const P_AREAS=[["agenda","Agenda"],["processos","Processos"],["decisoes","Decisões"]],P_REC=[["ia","Análise com Claude"],["importar","Importar Excel"],["exportar","Exportar"]];
function permEditor(pfx,p,papel){p=p||{};const adm=papel==="admin";
  return `<div class="uperm">${P_AREAS.map(([k,l])=>`<label class="f"><span>${l}</span><select data-pk="${k}" id="${pfx}_${k}" ${adm?"disabled":""}>${[["nenhum","Sem acesso"],["ver","Só visualizar"],["editar","Incluir e editar"]].map(([v,t])=>`<option value="${v}" ${(adm?"editar":p[k])===v?"selected":""}>${t}</option>`).join("")}</select></label>`).join("")}
    ${P_REC.map(([k,l])=>`<label class="chk2"><input type="checkbox" data-pk="${k}" ${adm||p[k]?"checked":""} ${adm?"disabled":""}> ${l}</label>`).join("")}</div>`}
function lerPerm(box){const o={};box.querySelectorAll("[data-pk]").forEach(e=>{o[e.dataset.pk]=e.type==="checkbox"?e.checked:e.value});return o}
let usuariosCache=null;
async function abrirUsuarios(){openDlg("dlgUsers");$("#uList").innerHTML='<div class="hint">Carregando…</div>';$("#uCodigo").hidden=true;
  try{usuariosCache=await fnCall("acesso",{acao:"listar"});renderUsuarios()}catch(e){$("#uList").innerHTML=`<div class="nocad-msg">${esc(e.message||"Erro ao carregar.")}</div>`}}
function renderUsuarios(){const {acessos,perfis}=usuariosCache;const pf=Object.fromEntries(perfis.map(p=>[p.user_id,p]));
  $("#uList").innerHTML=acessos.map((a,i)=>{const p=a.user_id?pf[a.user_id]:null;const ativo=p?p.ativo:true;const eu=p&&p.user_id===me.user_id;
    const sit=!a.user_id?`<span class="chip yel">Aguardando primeiro acesso${a.codigo_expira?" · código vale até "+fmtDate(a.codigo_expira.slice(0,10)):""}</span>`:ativo?'<span class="chip ok">Ativo</span>':'<span class="chip bad">Desativado</span>';
    return `<div class="urow" data-uix="${i}">
      <div class="actions" style="justify-content:space-between"><div><b>${esc(a.nome)}</b> <span class="chip acc">${esc(a.sigla)}</span> <span class="muted">${esc(a.email)}</span> ${sit}</div>
        <div class="actions">${eu?'<span class="chip">Você</span>':""}<label class="f" style="flex-direction:row;align-items:center;gap:6px"><span class="hint">Papel</span><select data-upapel ${eu?"disabled":""}><option value="operador" ${a.papel==="operador"?"selected":""}>Operador</option><option value="admin" ${a.papel==="admin"?"selected":""}>Administrador</option></select></label></div></div>
      ${permEditor("u"+i,a.permissoes,a.papel)}
      <div class="actions" style="justify-content:flex-end">${eu?"":`<button type="button" class="sm" data-unovo="${i}">${a.user_id?"Gerar código para nova senha":"Gerar novo código de convite"}</button>`}${eu||!a.user_id?"":`<button type="button" class="sm ${ativo?"danger":""}" data-uativo="${i}">${ativo?"Desativar acesso":"Reativar acesso"}</button>`}<button type="button" class="sm primary" data-usalvar="${i}">Salvar permissões</button></div></div>`}).join("")||'<div class="hint">Nenhuma pessoa autorizada.</div>'}
function mostrarCodigo(nome,email,c){const txt=`Olá, ${nome.split(" ")[0]}! Seu acesso ao sistema de IDPJ está liberado.\n\n1. Abra: ${location.href.split("#")[0]}\n2. Clique em "Primeiro acesso ou esqueci a senha"\n3. Informe o e-mail ${email}, o código ${c.codigo} e crie a sua senha.\n\nO código vale até ${fmtDate(c.expira.slice(0,10))} e só pode ser usado uma vez.`;
  $("#uCodigo").hidden=false;$("#uCodTxt").value=txt;$("#uCodigo").scrollIntoView({block:"nearest"})}
$("#btnUsuarios").onclick=abrirUsuarios;
$("#uCopiar").onclick=async()=>{try{await navigator.clipboard.writeText($("#uCodTxt").value);toast("Mensagem copiada.")}catch(_){$("#uCodTxt").select();toast("Use Ctrl+C para copiar.")}};
$("#nu_papel").onchange=()=>{$("#nu_perm").innerHTML=permEditor("nu",{agenda:"editar",processos:"editar",decisoes:"editar",ia:true,importar:true,exportar:false},$("#nu_papel").value)};
$("#nu_papel").onchange();
$("#formNovoUser").addEventListener("submit",async e=>{e.preventDefault();const b={acao:"autorizar",nome:properName($("#nu_nome").value.trim()),email:$("#nu_email").value.trim().toLowerCase(),sigla:$("#nu_sigla").value.trim().toUpperCase(),papel:$("#nu_papel").value,permissoes:lerPerm($("#nu_perm"))};
  try{const r=await fnCall("acesso",b);$("#formNovoUser").reset();$("#nu_papel").onchange();usuariosCache=await fnCall("acesso",{acao:"listar"});renderUsuarios();mostrarCodigo(b.nome,b.email,r);toast("Pessoa autorizada. Envie o código para ela.")}
  catch(err){toast(err.message||"Não foi possível autorizar.")}});
$("#uList").addEventListener("change",e=>{const s=e.target.closest("[data-upapel]");if(!s)return;const row=s.closest(".urow");const a=usuariosCache.acessos[+row.dataset.uix];row.querySelector(".uperm").outerHTML=permEditor("u"+row.dataset.uix,a.permissoes,s.value)});
$("#uList").addEventListener("click",async e=>{const t=e.target.closest("button");if(!t)return;const row=t.closest(".urow");if(!row)return;const a=usuariosCache.acessos[+row.dataset.uix];t.disabled=true;
  try{
    if(t.dataset.usalvar!=null){await fnCall("acesso",{acao:"atualizar",email:a.email,papel:row.querySelector("[data-upapel]").value,permissoes:lerPerm(row.querySelector(".uperm"))});toast("Permissões de "+a.sigla+" salvas.")}
    if(t.dataset.unovo!=null){const r=await fnCall("acesso",{acao:"novo_codigo",email:a.email});mostrarCodigo(a.nome,a.email,r)}
    if(t.dataset.uativo!=null){const p=usuariosCache.perfis.find(x=>x.user_id===a.user_id);await fnCall("acesso",{acao:"atualizar",email:a.email,ativo:!(p&&p.ativo)});toast(p&&p.ativo?"Acesso desativado.":"Acesso reativado.")}
    usuariosCache=await fnCall("acesso",{acao:"listar"});renderUsuarios()}
  catch(err){toast(err.message||"Não foi possível salvar.")}finally{t.disabled=false}});

/* ---------- início ---------- */
(async()=>{
  if(!window.supabase||!window.supabase.createClient){mostrarLogin("Não foi possível carregar o sistema. Verifique a internet e recarregue a página.");$("#lgBtn").disabled=true;return}
  sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  col=sbCollection("audiencias");pcol=sbCollection("processos");dcol=sbCollection("decisoes");
  pcol.onSnapshot(snap=>{procs=snap.docs.map(d=>({id:d.id,...d.data()}));render()},()=>{});
  dcol.onSnapshot(snap=>{decs=snap.docs.map(d=>({id:d.id,...d.data()}));render();if($("#dlgProc").open&&procEditing)renderProcExtras(procs.find(p=>p.id===procEditing))},()=>{});
  col.onSnapshot(snap=>{items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(i=>i.data);render();if($("#dlgProc").open&&procEditing){const p=procs.find(x=>x.id===procEditing);if(p)renderProcLinked(p)}},()=>{});
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT"&&me){me=null;mostrarLogin("Sua sessão terminou. Entre novamente.")}});
  const {data:{session}}=await sb.auth.getSession();
  if(session)await entrar();else mostrarLogin();
})();
