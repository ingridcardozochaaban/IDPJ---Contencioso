// Teste do site antes de publicar: abre o index.html num navegador com um Supabase simulado
// e confere login, carga dos dados, permissões de operador, gravação com sigla e ausência de erros.
// Uso: node tools/teste_site.js [caminho/index.html]   (sai com código 1 se algo falhar)
const { chromium } = require("playwright");
const path = require("path");
const arquivo = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));

const seed = {
  processos: [
    { id: "0000001-11.2024.5.02.0001", dados: { numero: "0000001-11.2024.5.02.0001", partes: "Fulana de Teste", unidade: "UNIDADE TESTE", status: "Ativo", faseProc: "Execução", idpjFase: "Citado – defesa pendente", estatutarios: "Diretor Teste — Presidente — 2019-2021", criadoPor: "ICC", atualizadoPor: "ICC", atualizadoEm: "2026-11-01T10:00:00Z" } },
  ],
  agenda: [
    { id: "f1", dados: { kind: "follow", tipoFollow: "providencia", titulo: "Acompanhamento IDPJ", data: "2020-01-02", processo: "0000001-11.2024.5.02.0001", partes: "Fulana de Teste", status: "Pendente", criadoPor: "ICC", atualizadoPor: "ICC", atualizadoEm: "2026-11-01T10:00:00Z" } },
  ],
  decisoes: [],
};

const MOCK = `(function(){const seed=window.__seed;const T={};for(const k in seed){T[k]=new Map(seed[k].map(r=>[r.id,r.dados]))}window.__T=T;
const perfil={user_id:'u1',nome:'Operadora Teste',sigla:'OPT',papel:'operador',ativo:true,permissoes:{agenda:'editar',processos:'editar',decisoes:'editar',ia:true,importar:true,exportar:false}};
let session=null;
function q(t){const st={t,op:'select',f:{},rng:null};const api={
 select(){return api},eq(k,v){st.f[k]=v;return api},order(){return api},range(a,b){st.rng=[a,b];return api},
 insert(row){st.op='insert';st.row=row;return api},upsert(row){st.op='upsert';st.row=row;return api},update(p){st.op='update';st.patch=p;return api},delete(){st.op='delete';return api},
 async maybeSingle(){return {data:t==='perfis'?perfil:null,error:null}},then(res,rej){return run().then(res,rej)}};
 async function run(){const M=T[t];
  if(st.op==='select'){const all=[...M].map(([id,dados])=>({id,dados}));return {data:st.rng?all.slice(st.rng[0],st.rng[1]+1):all,error:null}}
  const stamp=(id,d)=>({...d,criadoPor:(M.get(id)||{}).criadoPor||'OPT',atualizadoPor:'OPT'});
  if(st.op==='insert'||st.op==='upsert'){const d=stamp(st.row.id,st.row.dados);M.set(st.row.id,d);return {data:[{dados:d}],error:null}}
  if(st.op==='update'){if(!M.has(st.f.id))return {data:[],error:null};const d=stamp(st.f.id,st.patch.dados);M.set(st.f.id,d);return {data:[{dados:d}],error:null}}
  return {data:[],error:null}}
 return api}
window.supabase={createClient(){return {
 auth:{async getSession(){return {data:{session}}},async getUser(){return {data:{user:session?{id:'u1'}:null}}},
  async signInWithPassword({password}){if(password!=='senha1234')return {error:{message:'Invalid login credentials'}};session={u:1};return {data:{},error:null}},
  async signOut(){session=null},onAuthStateChange(){}},
 from:q,async rpc(){return {data:'sig',error:null}},
 functions:{async invoke(){return {data:{ok:true},error:null}}}}}};})();`;

(async () => {
  const falhas = [];
  const ok = (cond, msg) => { if (!cond) falhas.push(msg); console.log((cond ? "OK   " : "FALHA ") + msg); };
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.route("**/supabase.min.js", (r) => r.fulfill({ contentType: "application/javascript", body: MOCK }));
  await p.route(/^https?:\/\//, (r) => (/supabase\.min\.js/.test(r.request().url()) ? r.fallback() : r.abort()));
  await p.addInitScript((s) => { window.__seed = s; }, seed);
  await p.goto("file://" + arquivo);
  await p.waitForTimeout(600);
  ok(await p.isVisible("#lgForm"), "tela de login aparece");
  await p.fill("#lgEmail", "teste@exemplo.com");
  await p.fill("#lgSenha", "senha1234");
  await p.click("#lgBtn");
  await p.waitForTimeout(1200);
  ok(await p.isVisible("#app"), "entra no sistema após o login");
  ok((await p.textContent("#userSigla")) === "OPT", "mostra a sigla do usuário");
  ok(await p.$eval("#btnUsuarios", (e) => e.hidden), "operador não vê o botão Usuários");
  ok(await p.$eval("#btnCsv", (e) => e.hidden), "operador sem permissão não vê exportação");
  ok(await p.evaluate(() => document.body.classList.contains("no-del")), "operador não vê botões de excluir");
  ok((await p.textContent("#kf")) === "1", "agenda carregou (1 follow)");
  ok(await p.evaluate(() => document.querySelectorAll("#ptbody tr[data-proc]").length === 1), "base de processos carregou");
  ok(await p.evaluate(() => !!document.querySelector("#sideList .autoria")), "cartões mostram a sigla de autoria");
  const btn = await p.$("[data-folok]");
  if (btn) { await btn.click(); await p.waitForTimeout(900); }
  const f = await p.evaluate(() => window.__T.agenda.get("f1"));
  ok(f && f.status === "Analisado" && f.atualizadoPor === "OPT", "gravação funciona e registra a sigla");
  await p.click('[data-tab="processos"]');
  await p.waitForTimeout(200);
  ok(await p.isVisible("#ptbody"), "aba Processos e relatórios abre");
  ok(erros.length === 0, "sem erros de JavaScript" + (erros.length ? ": " + erros.join(" | ") : ""));
  await b.close();
  if (falhas.length) { console.log(`\n${falhas.length} falha(s). NÃO publicar.`); process.exit(1); }
  console.log("\nTudo certo. Pode publicar.");
})().catch((e) => { console.error(e); process.exit(1); });
