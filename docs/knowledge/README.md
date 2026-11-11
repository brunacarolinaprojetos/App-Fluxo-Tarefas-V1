# Base de conhecimento dos agentes

Memória do atendimento do Fluxo. Toda issue fechada e todo PR gerado pelo atendimento viram um arquivo aqui. Os agentes consultam essa base **antes** de trabalhar, seja para responder uma dúvida, seja para mexer no código.

## Estrutura

```
docs/knowledge/
├── README.md              ← este arquivo (formato e regras)
└── atendimento/
    └── issue-<N>.md       ← um arquivo por atendimento (issue N), atualizado ao longo da vida dele
```

## Formato de cada arquivo

O frontmatter tem uma chave por linha, e cada valor em JSON (string entre aspas, lista entre colchetes):

```markdown
---
id: "issue-3"
titulo: "Como renomear uma lista dentro de um quadro"
tipo: "duvida-de-uso"            # duvida-de-uso | mudanca-de-codigo | comercial | esclarecimento | pendencia
status: "resolvido"              # resolvido | encerrado | pr-aberto | pr-pendente | integrado
issue: 3
pr: null                         # link do PR, quando houver
request_id: "…"                  # liga o arquivo ao requestId do atendimento
tags: ["listas","quadros"]
arquivos: []                     # arquivos de produto alterados (só em mudança de código)
fonte: "…"                       # quem produziu e como foi validado
criado_em: "2026-11-11"
atualizado_em: "2026-11-11"
---

# Título

## Pedido
## Solução
## Critério de aceite        (só em mudança de código)
## Arquivos envolvidos        (só em mudança de código)
## Como reutilizar
## Rastreabilidade
```

## Como é gerado

1. O agente `documentador` (`.claude/agents/documentador.md`) escreve o conteúdo no fim de cada atendimento: título, tipo, tags, pedido, solução e como reutilizar.
2. O controlador valida esse conteúdo fora do modelo: tamanho, tipo, ausência de credenciais e de menções.
3. O job `conhecimento` do workflow `ai-agents.yml` monta o arquivo e faz o commit na branch padrão:
   - quando a issue é fechada, seja pelo próprio atendimento, seja manualmente;
   - quando um PR é gerado (`pr-aberto`), e de novo quando ele é integrado (`integrado`).
4. Ensaios (`AGENT_DRY_RUN=true`) **não** geram conhecimento, porque nenhum agente analisou o pedido.

Para trazer a base para o app local, faça `git pull`.

## Como os agentes usam

- O controlador envia aos agentes o **índice** da base (o frontmatter de cada arquivo).
- Se houver entrada relacionada, o agente pede a leitura completa dela antes da resposta final ou da alteração de código.
- O conhecimento ajuda, mas não substitui conferir o código atual: se a entrada estiver desatualizada, o agente segue o código e o documentador atualiza o registro.
