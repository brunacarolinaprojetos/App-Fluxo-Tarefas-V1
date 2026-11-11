# Progresso — automação do atendimento

## Etapa 00 — Preparar o projeto e o acesso (2026-11-11)

- **Cópia local:** `c:\Users\Sup.003\App-Fluxo-Tarefas-V1` (reutilizada).
- **Remote atual (`origin`):** https://github.com/bittencourtthulio/App-Fluxo-Tarefas-V1 (original do professor; nada enviado para ele).
- **Repositório próprio no GitHub:** pendente — criar depois do login no GitHub (`gh auth login`).
- **Node:** v26.13.0 · npm 11.20.0
- **Comandos (package.json):** `dev`, `preflight`, `start`, `test`, `build`.

### Abrir o app

```
npm install
npm run dev
```

Mostra os endereços da interface e da API (portas livres, ex.: `http://127.0.0.1:5173` e `http://127.0.0.1:3001/api`).
A área de atendimento fica em `/atendimento`.

### Build

`npm run build` → ok: `dist/` gerado (index.html, CSS 25 kB e JS 267 kB), sem erros.
Conferido com `npm run dev`: a página `/atendimento` e `GET /api/saude` responderam 200.

### Dados e credenciais

- O banco local em `server/dados/app.sqlite` foi preservado (está no `.gitignore`).
- Não existe `.env`. O backend não usa token: ele autentica por sessão/cookie.
- `COPILOT_AGENT_TOKEN` vai existir só como secret das GitHub Actions. Não vai para `.env`, código nem documentos, e o valor nunca é exibido.
- A demonstração usa só dados fictícios.

### Acesso ao GitHub (verificado só com leitura)

- **Conta autenticada no `gh`:** `brunacarolinaprojetos`.
- **Copilot:** plano **Free** (`free_limited_copilot`). O cloud agent exige plano pago, então ainda **não** está disponível.
- **Actions:** sem como conferir ainda. No repositório do professor a conta só tem leitura (sem push nem admin), e o repositório próprio ainda não existe.

### Decisão: usar o Claude no lugar do Copilot

Como a conta não tem Copilot pago, os agentes vão usar o **Claude** (Claude Code):

- **Definição dos agentes:** `.claude/agents/*.md` (no lugar de `.github/agents/*.agent.md`).
- **Nas Actions:** a action oficial `anthropics/claude-code-action`.
- **Secret das Actions:** `ANTHROPIC_API_KEY` (chave da API da Anthropic) ou `CLAUDE_CODE_OAUTH_TOKEN` (gerado com `claude setup-token`), no lugar de `COPILOT_AGENT_TOKEN`. Continua separado da credencial local do backend, nunca vai para `.env`, código ou documentos, e o valor nunca é exibido.
- **Localmente:** o Claude Code já roda nesta máquina.

## Etapa 02 — Equipe de agentes (2026-11-11)

- Criei seis perfis em `.claude/agents/` (equivalente ao Claude de `.github/agents/*.agent.md`): `coordenador`, `n1`, `comercial`, `po`, `desenvolvedor` e `revisor`.
- **Coordenador:** no Claude Code, um subagente não chama outro. Por isso o coordenador roda como agente principal (`claude --agent coordenador`) e invoca os especialistas pela ferramenta `Agent(...)`.
- **Contrato do relatório:** JSON em `resultPath` com `requestId`, `outcome`, `publicText`, `agents`, `allowedFiles`, `criteria` e `updates`. A cada marco o coordenador regrava esse arquivo, no lugar do `report_progress` do Copilot.
- Não havia controlador nem catálogo de preços no projeto. O Comercial responde que preço precisa de confirmação.

## Etapa 03 — App, issue e coordenador via GitHub Actions (2026-11-11)

- **Fluxo:** o cliente abre um ticket → o backend cria a issue (`origin:app` + vínculo `ticketId`/`requestId` no corpo) e grava o vínculo em `ticket_github` no SQLite → dispatch explícito de `ai-agents.yml` → o controlador (`scripts/agentes/controlador.mjs`) valida, chama o coordenador e publica → o backend consulta o comentário de controle e entrega a mensagem do N1 no app.
- **Provedor:** `AI_PROVIDER=anthropic`, chamado pelo SDK oficial `@anthropic-ai/sdk`, com saída JSON estruturada, `maxRetries: 0`, timeout de 180 s e no máximo 2 chamadas por execução (`AI_MAX_CALLS`). As instruções vêm de `.claude/agents/*.md`, carregadas explicitamente.
- **Dono do ticket:** cookie `cliente`. Outro navegador recebe 404.
- **Estado:** fica no comentário de controle da issue (escrito só por `github-actions[bot]`). Uma execução que para no meio vira `incerto` e só segue com `workflow_dispatch` + `retomar=true`.
- **Conferência local:** `node conferir-etapa03.mjs` (na pasta temporária), com GitHub falso, dados fictícios e dry-run. Passaram: leitura pelo dono, entrada do coordenador, dispatch, resultado simulado, mensagem do N1 no app e ausência de duplicação. `npm test` passou (27/27) e `npm run build` também.

### Configuração mínima para o ensaio real

1. Repositório próprio com este código na `main`.
2. **Variables** do repositório: `AGENT_RUNTIME=github-actions`, `AGENT_DRY_RUN=true` (só `false` no ensaio), `AI_PROVIDER=anthropic`, `AI_MODEL=claude-opus-5-5` e `APP_GITHUB_LOGIN=brunacarolinaprojetos`. `AI_BASE_URL` só se for usar outro endpoint confiável.
3. **Secret** `AI_API_KEY` (chave da API da Anthropic), cadastrado por você em Settings → Secrets and variables → Actions, ou com `gh secret set AI_API_KEY`, que pede o valor sem mostrá-lo.
4. Settings → Actions → General: marcar **"Allow GitHub Actions to create and approve pull requests"** (necessário para o job `propor-pr`).
5. **Backend local:** `AGENT_RUNTIME=github-actions`, `GITHUB_REPOSITORY=<dono>/<repo>` e `GH_BIN=<caminho do gh.exe>` (o `gh` não está no PATH). O backend usa `gh auth token`, nunca o `GITHUB_TOKEN` das Actions.

### Pendência

Faltam o repositório próprio (onde as Actions vão rodar) e o secret do Claude cadastrado nele. Até lá, os arquivos ficam só locais.
