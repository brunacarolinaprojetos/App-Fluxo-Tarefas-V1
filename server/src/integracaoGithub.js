// Ponte entre o atendimento e o GitHub Actions (AGENT_RUNTIME=github-actions).
// O backend usa a autenticação GitHub da máquina (GH_TOKEN ou `gh auth token`), nunca o token efêmero das Actions.
// Fluxo: ticket novo -> issue com origin:app + vínculo -> dispatch do workflow -> consulta periódica do
// comentário de controle -> mensagem do N1 no app, uma única vez por id.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { AUTOR_CONTROLE, FASES_COM_RESPOSTA, LIMITES, ROTULO_ORIGEM, corpoDaIssue, lerControle } from "../../scripts/agentes/contrato.mjs";

const executar = promisify(execFile);
const INTERVALO_CONSULTA = 15_000;

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

/**
 * Consulta o comentário de controle da issue e entrega no app a mensagem pública do N1 já validada.
 * Só lê comentários do workflow (github-actions[bot]) cujo vínculo bate com o do SQLite.
 */
export async function reconciliar(db, ticketId, { entregar }) {
  const cfg = configuracao();
  if (!cfg.ativo) return;
  const v = db.prepare("SELECT * FROM ticket_github WHERE ticket_id = ?").get(ticketId);
  if (!v?.issue_number || v.fase === "entregue" || v.fase === "falha-envio") return;
  const agora = Date.now();
  if (v.consultado_em && agora - Date.parse(v.consultado_em) < INTERVALO_CONSULTA) return;
  db.prepare("UPDATE ticket_github SET consultado_em = ? WHERE ticket_id = ?").run(new Date(agora).toISOString(), ticketId);

  const comentarios = await github("GET", `/repos/${cfg.repo}/issues/${v.issue_number}/comments?per_page=100`);
  const controle = lerControle(comentarios.filter((c) => c.user?.login === AUTOR_CONTROLE));
  const estado = controle?.estado;
  if (!estado || estado.ticketId !== ticketId || estado.requestId !== v.request_id) return;
  db.prepare("UPDATE ticket_github SET fase = ?, run_id = ?, pr_url = ? WHERE ticket_id = ?").run(estado.fase, estado.runId ?? null, estado.prUrl ?? null, ticketId);

  // Só entrega o que o controlador confirmou: sem código, resposta validada; com código, só depois do merge na main.
  if (!FASES_COM_RESPOSTA.includes(estado.fase)) return;
  const publicText = typeof estado.respostaFinal?.texto === "string" ? estado.respostaFinal.texto.trim().slice(0, LIMITES.publicText) : "";
  const idMensagem = typeof estado.respostaFinal?.id === "string" ? estado.respostaFinal.id : `n1-final-${v.request_id}`;
  const enviadas = JSON.parse(v.mensagens_enviadas || "[]");
  if (publicText && !enviadas.includes(idMensagem)) {
    entregar(publicText);
    enviadas.push(idMensagem);
  }
  db.prepare("UPDATE ticket_github SET mensagens_enviadas = ?, fase = 'entregue' WHERE ticket_id = ?").run(JSON.stringify(enviadas), ticketId);
}
