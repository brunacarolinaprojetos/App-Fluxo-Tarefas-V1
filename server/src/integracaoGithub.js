// Ponte entre o atendimento e o GitHub Actions (AGENT_RUNTIME=github-actions).
// O backend usa a autenticação GitHub da máquina (GH_TOKEN ou `gh auth token`), nunca o token efêmero das Actions.
// Fluxo: ticket novo -> issue com origin:app + vínculo -> dispatch do workflow -> consulta periódica do
// comentário de controle -> mensagem do N1 no app, uma única vez por id.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { AUTOR_CONTROLE, FASES_COM_RESPOSTA, LIMITES, ROTULO_ORIGEM, corpoDaIssue, lerControle, lerMensagensN1 } from "../../scripts/agentes/contrato.mjs";

const executar = promisify(execFile);
const INTERVALO_CONSULTA = 4_000; // tela aberta (o app consulta a cada 5 s): no máximo uma busca na issue por ciclo
const INTERVALO_MINIMO = 2_000; // botão Atualizar: na hora, com um mínimo de folga

export const configuracao = () => ({
  ativo: process.env.AGENT_RUNTIME === "github-actions",
  repo: process.env.GITHUB_REPOSITORY ?? "",
  api: process.env.GITHUB_API_URL ?? "https://api.github.com",
  workflow: process.env.AGENT_WORKFLOW ?? "ai-agents.yml",
  ref: process.env.AGENT_WORKFLOW_REF ?? "main",
});

let tokenEmCache = null;
async function tokenLocal() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (!tokenEmCache) {
    const { stdout } = await executar(process.env.GH_BIN ?? "gh", ["auth", "token"], { timeout: 10_000 });
    tokenEmCache = stdout.trim();
  }
  return tokenEmCache;
}

async function github(metodo, caminho, corpo) {
  const { api } = configuracao();
  const r = await fetch(`${api}${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${await tokenLocal()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho} respondeu ${r.status}.`);
  return r.status === 204 ? null : r.json();
}

/**
 * Cria a issue do ticket e dispara o workflow. Grava o vínculo antes do dispatch, para que um erro
 * no meio não deixe uma issue órfã sem registro. Erros viram fase "falha-envio", sem nova tentativa automática.
 */
export async function encaminharTicket(db, { ticket, conteudo, avisar }) {
  const cfg = configuracao();
  if (!cfg.ativo) return;
  const requestId = randomUUID();
  const gravarFase = (fase) => db.prepare("UPDATE ticket_github SET fase = ? WHERE ticket_id = ?").run(fase, ticket.id);
  db.prepare("INSERT INTO ticket_github (ticket_id, request_id, fase) VALUES (?, ?, 'criando-issue')").run(ticket.id, requestId);
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new Error("GITHUB_REPOSITORY não configurado.");
    const issue = await github("POST", `/repos/${cfg.repo}/issues`, {
      title: `[App] ${ticket.title}`.slice(0, 200),
      body: corpoDaIssue({ ticketId: ticket.id, requestId, conteudo }),
      labels: [ROTULO_ORIGEM],
    });
    db.prepare("UPDATE ticket_github SET issue_number = ?, fase = 'issue-criada' WHERE ticket_id = ?").run(issue.number, ticket.id);
    // Dispatch explícito: não dependemos do evento `issues` para iniciar o processamento.
    await github("POST", `/repos/${cfg.repo}/actions/workflows/${cfg.workflow}/dispatches`, { ref: cfg.ref, inputs: { issue_number: String(issue.number) } });
    gravarFase("disparado");
  } catch (e) {
    console.error(`[atendimento] não foi possível encaminhar o ticket ${ticket.id}: ${e.message}`);
    try {
      gravarFase("falha-envio");
      avisar("Não conseguimos encaminhar seu ticket automaticamente agora. Nossa equipe vai verificar.");
    } catch { /* ticket pode ter sido excluído no meio do envio */ }
  }
}

/** Fases do vínculo em que não há mais nada a buscar na issue. */
const ENCERRADAS = ["finalizado", "entregue", "falha-envio"];
const emAndamento = new Set();

/** Dados de acompanhamento para a tela: issue vinculada e se o app ainda está sincronizando. */
export function acompanhamento(db, ticketId) {
  const cfg = configuracao();
  const v = db.prepare("SELECT * FROM ticket_github WHERE ticket_id = ?").get(ticketId);
  if (!v) return null;
  return {
    issueNumber: v.issue_number ?? null,
    issueUrl: v.issue_number && cfg.repo ? `https://github.com/${cfg.repo}/issues/${v.issue_number}` : null,
    fase: v.fase,
    ativo: cfg.ativo && !ENCERRADAS.includes(v.fase),
    sincronizadoEm: v.consultado_em ?? null,
  };
}

/**
 * Espelha no app as mensagens do N1 publicadas na issue, na ordem em que aparecem.
 * Roda enquanto a tela do ticket consulta o backend (a cada 5 s, ou na hora com `forcar`).
 * Só aceita comentários do workflow (github-actions[bot]) e só se o estado bate com o vínculo do SQLite.
 * Cada mensagem tem ID estável e entra uma única vez.
 */
export async function reconciliar(db, ticketId, { entregar, forcar = false }) {
  const cfg = configuracao();
  if (!cfg.ativo || emAndamento.has(ticketId)) return;
  const v = db.prepare("SELECT * FROM ticket_github WHERE ticket_id = ?").get(ticketId);
  if (!v?.issue_number || ENCERRADAS.includes(v.fase)) return;
  const agora = Date.now();
  const intervalo = forcar ? INTERVALO_MINIMO : INTERVALO_CONSULTA;
  if (v.consultado_em && agora - Date.parse(v.consultado_em) < intervalo) return;
  emAndamento.add(ticketId);
  try {
    db.prepare("UPDATE ticket_github SET consultado_em = ? WHERE ticket_id = ?").run(new Date(agora).toISOString(), ticketId);
    const comentarios = await github("GET", `/repos/${cfg.repo}/issues/${v.issue_number}/comments?per_page=100`);
    const estado = lerControle(comentarios.filter((c) => c.user?.login === AUTOR_CONTROLE))?.estado;
    if (!estado || estado.ticketId !== ticketId || estado.requestId !== v.request_id) return;

    const enviadas = JSON.parse(v.mensagens_enviadas || "[]");
    const novas = lerMensagensN1(comentarios).filter((m) => !enviadas.includes(m.id));
    // Compatibilidade: estados antigos guardavam só a resposta final, sem comentário próprio.
    const final = estado.respostaFinal;
    if (FASES_COM_RESPOSTA.includes(estado.fase) && typeof final?.id === "string" && typeof final.texto === "string"
      && !enviadas.includes(final.id) && !novas.some((m) => m.id === final.id)) {
      novas.push({ id: final.id, texto: final.texto.trim().slice(0, LIMITES.publicText) });
    }
    for (const m of novas) {
      entregar(m.texto);
      enviadas.push(m.id);
    }
    // Encerra a sincronização quando a resposta final já chegou e o caso terminou.
    const terminou = ["concluido", "integrado"].includes(estado.fase) && enviadas.includes(final?.id);
    db.prepare("UPDATE ticket_github SET mensagens_enviadas = ?, fase = ?, run_id = ?, pr_url = ? WHERE ticket_id = ?")
      .run(JSON.stringify(enviadas), terminou ? "finalizado" : estado.fase, estado.runId ?? null, estado.prUrl ?? null, ticketId);
  } finally {
    emAndamento.delete(ticketId);
  }
}
