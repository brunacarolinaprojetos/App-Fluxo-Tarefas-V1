---
id: "issue-3"
titulo: "Como renomear uma lista dentro de um quadro"
tipo: "duvida-de-uso"
status: "resolvido"
issue: 3
pr: null
request_id: "3ec7fc71-9c16-4872-a0c9-665e44369969"
tags: ["listas","quadros","renomear"]
arquivos: []
fonte: "documentador (backfill a partir do código atual); a resposta automática original foi simulada"
criado_em: "2026-11-11"
atualizado_em: "2026-11-11"
---

# Como renomear uma lista dentro de um quadro

## Pedido

Cliente perguntou como renomear uma lista dentro de um quadro. A issue foi fechada durante um ensaio (AGENT_DRY_RUN=true): a resposta automática enviada foi simulada e não respondeu à dúvida.

## Solução

No quadro aberto, clique no nome da lista (no topo da coluna): abre o diálogo "Renomear lista". Digite o novo nome no campo "Título da lista" (até 120 caracteres) e clique em "Salvar alterações". O mesmo diálogo também abre pelo menu de opções da lista (botão ⋯ no topo da coluna) > "Renomear lista". Por trás, a interface chama PATCH /api/lists/:id com { title }. Verificado no código: client/src/Lista.jsx (botão lista-nome e menu) e client/src/App.jsx (diálogo renomear-lista).

## Como reutilizar

Serve para dúvidas sobre renomear listas ou colunas. O mesmo padrão (clicar no nome ou usar o menu ⋯) vale para renomear quadros pela barra lateral. Antes de reaproveitar, confira se Lista.jsx ainda tem o botão lista-nome e o item de menu Renomear lista.

## Rastreabilidade

- Issue: #​3 (https://github.com/brunacarolinaprojetos/App-Fluxo-Tarefas-V1/issues/3)
- PR: não houve
- Situação: resolvido
