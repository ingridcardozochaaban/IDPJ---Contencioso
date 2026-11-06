#!/usr/bin/env python3
"""Gera o site (index.html) a partir do painel do Claude.

Uso:  python3 tools/sincronizar.py <painel.html> [saida.html]

O painel e o site são o mesmo programa. O site troca só:
  - o bloco de dados do painel (conector do Supabase) pelo bloco de login, permissões e usuários (fonte/boot-site.js);
  - acrescenta a tela de login, os botões de usuário no topo, a tela "Usuários", os estilos e a sigla de autoria nos cartões.
Tudo o mais (visual, funcionalidades, regras) vem do painel como está.
Se um ponto de ancoragem não for encontrado, o script para com erro e nada é gerado.
"""
import sys, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
INICIO_BOOT = "/* ---------- banco de dados: Supabase"
FIM_BOOT = "\n})();\n})();"

CSS = '''
/* login e usuários */
.loginwrap{min-height:calc(100vh - 80px);display:grid;place-items:center}
.logincard{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px 24px;width:min(420px,100%);display:flex;flex-direction:column;gap:14px}
.logincard .f input{font-size:15px}
.linkbtn{background:none;border:0;padding:0;color:var(--accent);text-decoration:underline;text-underline-offset:2px;font-weight:500;cursor:pointer;align-self:flex-start}
#lgMsg{min-height:1.2em;color:var(--bad);font-size:13px}
#dlgUsers{width:min(980px,calc(100vw - 32px))}
.urow{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.uperm{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end}
.uperm .f{min-width:150px}.uperm .f span{font-size:12px;color:var(--muted)}
.uperm select{font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.autoria{font-size:11.5px;color:var(--muted)}
body.no-del [id^="askDel"]{display:none!important}
body.ro-agenda #btnNew,body.ro-agenda #btnFol,body.ro-agenda #btnPub,body.ro-agenda #btnXls,body.ro-agenda .sitsel{display:none!important}
body.ro-proc #btnSaveProc,body.ro-proc #btnNovoProc,body.ro-proc #btnNewProc,body.ro-proc #pecaBox{display:none!important}
body.ro-dec #addDec,body.ro-dec #btnSaveDec,body.ro-dec [data-editdec]{display:none!important}
body.no-dec #decBox,body.no-dec #rDec{display:none!important}
</style>'''

LOGIN = '''<div id="loginBox" class="loginwrap" hidden>
  <form id="lgForm" class="logincard" autocomplete="on">
    <div><div class="eyebrow">IDPJ · Estatutários e diretores da Pró-Saúde</div><h1 style="font-size:24px">Pauta de incidentes de desconsideração</h1></div>
    <h2 id="lgTitulo">Entrar</h2>
    <div class="f"><label for="lgEmail">E-mail</label><input id="lgEmail" type="email" required autocomplete="username"></div>
    <div class="f" id="lgSenhaBox"><label for="lgSenha">Senha</label><input id="lgSenha" type="password" autocomplete="current-password"></div>
    <div id="lgPrimeiro" hidden style="display:flex;flex-direction:column;gap:14px">
      <div class="hint">Use o código de convite que o administrador enviou. Ele serve para criar a primeira senha ou para trocar uma senha esquecida.</div>
      <div class="f"><label for="lgCodigo">Código de convite</label><input id="lgCodigo" class="mono" placeholder="XXXXX-XXXXX" autocomplete="one-time-code"></div>
      <div class="f"><label for="lgNova">Nova senha (mínimo 8 caracteres)</label><input id="lgNova" type="password" autocomplete="new-password"></div>
      <div class="f"><label for="lgNova2">Repita a nova senha</label><input id="lgNova2" type="password" autocomplete="new-password"></div>
    </div>
    <div id="lgMsg" role="alert"></div>
    <button type="submit" class="primary" id="lgBtn">Entrar</button>
    <button type="button" class="linkbtn" id="lgToggle">Primeiro acesso ou esqueci a senha</button>
  </form>
</div>
<div class="wrap" id="app" hidden>'''

DLG = '''<!-- Usuários -->
<dialog id="dlgUsers">
  <div class="dlg">
    <div class="dlghead"><div><div class="eyebrow">Administração</div><h2>Usuários e permissões</h2></div><button type="button" class="ghost" data-close="dlgUsers" aria-label="Fechar">✕</button></div>
    <div class="hint">Só quem você autoriza aqui consegue entrar. Operadores incluem e editam conforme as permissões, mas não excluem nada. Toda alteração fica registrada com a sigla de quem fez.</div>
    <div id="uCodigo" class="parse" hidden>
      <div class="eyebrow">Código de acesso gerado: envie esta mensagem para a pessoa</div>
      <textarea id="uCodTxt" rows="7" readonly style="font-family:var(--f-body);font-size:13px"></textarea>
      <div class="actions" style="justify-content:flex-end"><button type="button" class="primary sm" id="uCopiar">Copiar mensagem</button></div>
    </div>
    <div id="uList" class="cklist"></div>
    <form id="formNovoUser" class="prep">
      <h3>Autorizar nova pessoa</h3>
      <div class="form">
        <div class="f s2"><label for="nu_nome">Nome completo</label><input id="nu_nome" required></div>
        <div class="f"><label for="nu_sigla">Sigla</label><input id="nu_sigla" required maxlength="5" placeholder="Ex.: LMZ" style="text-transform:uppercase"></div>
        <div class="f"><label for="nu_papel">Papel</label><select id="nu_papel"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
        <div class="f s4"><label for="nu_email">E-mail</label><input id="nu_email" type="email" required></div>
        <div class="f s4" id="nu_perm"></div>
      </div>
      <div class="actions" style="justify-content:flex-end"><button type="submit" class="primary">Autorizar e gerar código</button></div>
    </form>
  </div>
</dialog>

<div id="toast" class="toast" hidden></div>'''

AUTORIA = ('function autoria(it){if(!it||it.kind==="tarefa"||!(it.criadoPor||it.atualizadoPor))return "";const quando=it.atualizadoEm?" em "+fmtDH(it.atualizadoEm):"";\n'
  '  return `<div class="autoria">${it.criadoPor?"Incluído por "+esc(it.criadoPor):""}${it.atualizadoPor&&(it.atualizadoPor!==it.criadoPor||it.atualizadoEm!==it.criadoEm)?(it.criadoPor?" · ":"")+"alterado por "+esc(it.atualizadoPor)+quando:""}</div>`}\n'
  'function card(it){const h=card0(it);const a=autoria(it);return a?h.replace(/<\\/div>\\s*$/,a+"</div>"):h}\nfunction card0(it){\n')


def gerar(painel: str) -> str:
    s = painel
    boot = (RAIZ / "fonte" / "boot-site.js").read_text(encoding="utf8").rstrip("\n")

    def rep(a, b, obrig=True):
        nonlocal s
        n = s.count(a)
        if n != 1:
            if obrig:
                raise SystemExit(f"Ponto de ancoragem não encontrado uma única vez ({n}x): {a[:80]!r}")
            return
        s = s.replace(a, b)

    i = s.find(INICIO_BOOT)
    if i < 0 or s.count(INICIO_BOOT) != 1:
        raise SystemExit("Bloco de dados do painel não encontrado.")
    j = s.find(FIM_BOOT, i)
    if j < 0:
        raise SystemExit("Fim do bloco de dados do painel não encontrado.")
    s = s[:i] + boot + s[j + len("\n})();"):]

    rep("</style>\n\n<div class=\"wrap\">", CSS.rstrip("\n") + "\n\n<div class=\"wrap\">")
    rep('<div class="wrap">', LOGIN)
    rep('    <div class="actions">\n      <button id="btnIcs"',
        '    <div class="actions">\n      <span class="chip acc" id="userSigla" style="font-size:12px;padding:3px 9px"></span><button id="btnUsuarios" type="button" hidden>Usuários</button><button id="btnSair" type="button" class="ghost">Sair</button>\n      <button id="btnIcs"')
    if 'id="sbSt"' in s:
        import re
        s = re.sub(r'<div class="hint" id="sbSt"[^>]*>[^<]*</div>', '<div class="hint" id="sbSt" style="margin-top:4px"></div>', s, count=1)
    else:
        rep('      <h1>Pauta de incidentes de desconsideração</h1>\n    </div>',
            '      <h1>Pauta de incidentes de desconsideração</h1>\n      <div class="hint" id="sbSt" style="margin-top:4px"></div>\n    </div>')
    rep('<div id="toast" class="toast" hidden></div>', DLG)
    rep('<script>\n(function(){', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n<script>\n(function(){')
    if "function autoria(it)" not in s:
        rep('function card(it){\n', AUTORIA)
    rep('c(p.criadoEm,"cadastro criado");c(p.atualizadoEm,"cadastro");',
        'c(p.criadoEm,"cadastro criado"+(p.criadoPor?" · "+p.criadoPor:""));c(p.atualizadoEm,"cadastro"+(p.atualizadoPor?" · "+p.atualizadoPor:""));', obrig=False)
    rep('c(i.criadoEm,`${w} incluíd${g}`);c(i.atualizadoEm,`${w} atualizad${g}`);',
        'c(i.criadoEm,`${w} incluíd${g}`+(i.criadoPor?" · "+i.criadoPor:""));c(i.atualizadoEm,`${w} atualizad${g}`+(i.atualizadoPor?" · "+i.atualizadoPor:""));', obrig=False)
    for marca in ['id="loginBox"', 'id="dlgUsers"', "supabase.min.js", "function aplicarPermissoes", "function card0("]:
        if marca not in s:
            raise SystemExit(f"Conversão incompleta: falta {marca}")
    if "claude.use(" in s:
        raise SystemExit("Sobrou código do painel do Claude (claude.use) no site.")
    return s


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    entrada = pathlib.Path(sys.argv[1])
    saida = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else RAIZ / "index.html"
    saida.write_text(gerar(entrada.read_text(encoding="utf8")), encoding="utf8")
    print(f"Site gerado em {saida}")
