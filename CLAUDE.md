# IDPJ – Contencioso (site)

Site da pauta de IDPJ dos estatutários da Pró-Saúde, publicado no GitHub Pages:
https://ingridcardozochaaban.github.io/IDPJ---Contencioso/

## Como o site nasce
- A versão de trabalho é o **painel no Claude** (artifact `https://claude.ai/code/artifact/734277c2-cb0b-4047-a73b-6e437707b745`), usado só pela administradora (Ingrid, sigla ICC).
- O site é o mesmo programa, convertido por `tools/sincronizar.py`, que troca o bloco de dados do painel (conector do Supabase) por `fonte/boot-site.js` (login, permissões, usuários, siglas).
- **Nunca edite `index.html` à mão** para mudanças de tela ou funcionalidade: mude o painel e gere de novo. Mudanças só do site (login, permissões, tela de usuários) vão em `fonte/boot-site.js` ou em `tools/sincronizar.py`.

## Publicar o painel no site (o que a tarefa "Publicar painel IDPJ no site" faz)
1. Ler o painel com a ferramenta Artifact (`action: "read"`, url acima) e salvar o HTML completo em `/tmp/painel.html`.
2. `python3 tools/sincronizar.py /tmp/painel.html index.html`
3. `node tools/teste_site.js index.html` — se falhar, **não publicar**; avisar o motivo.
4. Se `git diff --quiet index.html`, não há nada novo: avisar e parar.
5. Commit em `main` (autor `Claude <noreply@anthropic.com>`) e `git push origin main`. O GitHub Pages publica em ~5 min.

## Banco de dados
Supabase, projeto `IDPJ - Contencioso` (`mvjflaguvinptdeewkph`), tabelas `public.processos`, `public.agenda`, `public.decisoes`, `public.perfis`, `public.acessos_autorizados`, `public.historico`. Permissões por RLS; exclusão só para administrador. Funções: `acesso` (convites e usuários) e `claude` (análise com a API da Anthropic, chave no segredo `ANTHROPIC_API_KEY`). O esquema `icds` no mesmo projeto é de outro painel — não mexer.
