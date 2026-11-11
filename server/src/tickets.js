// Atendimento: tickets de suporte em formato de conversa. Contrato JSON em inglês, como o de quadros.
//
// Cada ticket é uma conversa com mensagens em ordem cronológica. `role` diz quem falou:
//   "user"   — quem abriu o ticket
//   "agent"  — atendente (humano ou IA; o campo `author` guarda o nome exibido)
//   "system" — avisos automáticos (mudança de status etc.)
//
// Dono: cada navegador recebe um cookie `cliente` e só enxerga os próprios tickets
// (tickets antigos, sem dono, continuam visíveis para todos).
// Com AGENT_RUNTIME=github-actions, ticket novo vira issue no GitHub e a resposta do N1 volta
// por reconciliação (ver integracaoGithub.js).
import { randomBytes, randomUUID } from "node:crypto";
import { ErroHttp, invalido, naoEncontrado, texto } from "./http.js";
import { transacao } from "./db.js";
import { acompanhamento, configuracao, encaminharTicket, reconciliar } from "./integracaoGithub.js";

const STATUS = ["open", "in_progress", "resolved"];
const ROLES = ["user", "agent"];
const NOME_STATUS = { open: "Aberto", in_progress: "Em atendimento", resolved: "Resolvido" };
const COOKIE = "cliente";

const saidaTicket = (t) => ({
  id: t.id, title: t.title, status: t.status, createdAt: t.criado_em, updatedAt: t.atualizado_em,
  ...(t.ultima !== undefined ? { lastMessage: t.ultima ?? "" } : {}),
});
const saidaMensagem = (m) => ({ id: m.id, ticketId: m.ticket_id, role: m.role, author: m.author, content: m.content, createdAt: m.criado_em });

/** Título a partir da primeira mensagem: primeira linha, sem espaços repetidos, até 80 caracteres. */
export const tituloDaMensagem = (conteudo) => {
  const linha = conteudo.split("\n").map((l) => l.trim()).find(Boolean) ?? "Novo ticket";
  const limpa = linha.replace(/\s+/g, " ");
  return limpa.length > 80 ? `${limpa.slice(0, 77).trimEnd()}…` : limpa;
};

/** Identifica o cliente pelo cookie; cria um na primeira visita. */
function donoDoPedido({ req, res }) {
  const atual = (req.headers.cookie ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (atual && /^[a-f0-9]{32}$/.test(atual)) return atual;
  const novo = randomBytes(16).toString("hex");
  res.setHeader("set-cookie", `${COOKIE}=${novo}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${365 * 86_400}`);
  return novo;
}

export function rotasDeTickets(app, db) {
  /** Ticket visível para este dono (ou sem dono). Para quem não é dono, ele simplesmente não existe. */
  const buscar = (id, dono) => {
    const t = db.prepare("SELECT * FROM ticket WHERE id = ? AND (dono IS NULL OR dono = ?)").get(id, dono);
    if (!t) throw naoEncontrado("Ticket");
    return t;
  };
  const mensagens = (id) => db.prepare("SELECT * FROM ticket_mensagem WHERE ticket_id = ? ORDER BY criado_em, rowid").all(id).map(saidaMensagem);
  const gravarMensagem = (ticketId, role, author, content, criadoEm = new Date().toISOString()) => {
    const id = randomUUID();
    db.prepare("INSERT INTO ticket_mensagem (id, ticket_id, role, author, content, criado_em) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, ticketId, role, author, content, criadoEm);
    db.prepare("UPDATE ticket SET atualizado_em = ? WHERE id = ?").run(criadoEm, ticketId);
    return id;
  };
  /** Resposta de atendente: grava e põe o ticket aberto em atendimento. */
  const respostaDoAtendimento = (ticketId, author, content) => transacao(db, () => {
    gravarMensagem(ticketId, "agent", author, content);
    db.prepare("UPDATE ticket SET status = 'in_progress' WHERE id = ? AND status = 'open'").run(ticketId);
  });
  const vinculadoAoGithub = (ticketId) => Boolean(db.prepare("SELECT 1 FROM ticket_github WHERE ticket_id = ?").get(ticketId));
  const conteudo = (corpo) => texto(corpo, "content", { max: 10_000 });

  app.get("/api/tickets", (ctx) => {
    const dono = donoDoPedido(ctx);
    const status = ctx.url.searchParams.get("status");
    if (status && !STATUS.includes(status)) throw invalido(`status deve ser um de: ${STATUS.join(", ")}.`);
    const linhas = db.prepare(`
      SELECT t.*, (SELECT content FROM ticket_mensagem m WHERE m.ticket_id = t.id ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 1) AS ultima
      FROM ticket t WHERE (t.dono IS NULL OR t.dono = ?) ${status ? "AND t.status = ?" : ""}
      ORDER BY t.atualizado_em DESC, t.rowid DESC`).all(dono, ...(status ? [status] : []));
    return { tickets: linhas.map(saidaTicket) };
  });

  /** Abre um ticket já com a primeira mensagem do usuário. `title` é opcional: sem ele, sai da mensagem. */
  app.post("/api/tickets", (ctx) => {
    const dono = donoDoPedido(ctx);
    const content = conteudo(ctx.corpo);
    const title = texto(ctx.corpo, "title", { max: 120, opcional: true }) ?? tituloDaMensagem(content);
    const id = randomUUID();
    const agora = new Date().toISOString();
    transacao(db, () => {
      db.prepare("INSERT INTO ticket (id, title, status, criado_em, atualizado_em, dono) VALUES (?, ?, 'open', ?, ?, ?)").run(id, title, agora, agora, dono);
      gravarMensagem(id, "user", "", content, agora);
    });
    // Encaminha à automação em segundo plano: a resposta ao cliente não espera o GitHub.
    if (configuracao().ativo) {
      void encaminharTicket(db, { ticket: { id, title }, conteudo: content, avisar: (t) => gravarMensagem(id, "system", "", t) })
        .catch((e) => console.error(`[atendimento] encaminhamento do ticket ${id} falhou: ${e.message}`));
    }
    return { ticket: saidaTicket(buscar(id, dono)), messages: mensagens(id) };
  });

  app.get("/api/tickets/:id", async (ctx) => {
    const dono = donoDoPedido(ctx);
    const t = buscar(ctx.params.id, dono);
    // Enquanto a tela está aberta, cada consulta sincroniza com a issue; `?sincronizar=1` (botão Atualizar) força na hora.
    const forcar = ctx.url.searchParams.get("sincronizar") === "1";
    try {
      // Texto do agente entra como "Suporte N1"; marcos automáticos entram como status (mensagem de sistema).
      await reconciliar(db, t.id, {
        forcar,
        entregar: (texto, tipo) => (tipo === "status" ? gravarMensagem(t.id, "system", "", texto) : respostaDoAtendimento(t.id, "Suporte N1", texto)),
      });
    } catch (e) {
      console.error(`[atendimento] reconciliação do ticket ${t.id} falhou: ${e.message}`);
    }
    return { ticket: { ...saidaTicket(buscar(t.id, dono)), tracking: acompanhamento(db, t.id) }, messages: mensagens(t.id) };
  });

  app.patch("/api/tickets/:id", (ctx) => {
    const t = buscar(ctx.params.id, donoDoPedido(ctx));
    const title = texto(ctx.corpo, "title", { max: 120, opcional: true }) ?? t.title;
    let status = t.status;
    if (ctx.corpo.status !== undefined) {
      if (!STATUS.includes(ctx.corpo.status)) throw invalido(`status deve ser um de: ${STATUS.join(", ")}.`);
      status = ctx.corpo.status;
    }
    transacao(db, () => {
      db.prepare("UPDATE ticket SET title = ?, status = ? WHERE id = ?").run(title, status, t.id);
      if (status !== t.status) gravarMensagem(t.id, "system", "", `Status alterado para "${NOME_STATUS[status]}".`);
    });
    return { ticket: saidaTicket(buscar(t.id, t.dono)) };
  });

  app.delete("/api/tickets/:id", (ctx) => {
    const t = buscar(ctx.params.id, donoDoPedido(ctx));
    db.prepare("DELETE FROM ticket WHERE id = ?").run(t.id); // mensagens e vínculo caem em cascata
    return { ok: true };
  });

  /**
   * Nova mensagem na conversa. `role` padrão é "user".
   * Regras de status: resposta de agente em ticket aberto passa para "in_progress";
   * mensagem do usuário em ticket resolvido reabre o ticket.
   * Tickets acompanhados pela automação do GitHub só recebem respostas de agente pela reconciliação.
   */
  app.post("/api/tickets/:id/messages", (ctx) => {
    const t = buscar(ctx.params.id, donoDoPedido(ctx));
    const role = ctx.corpo.role ?? "user";
    if (!ROLES.includes(role)) throw invalido(`role deve ser um de: ${ROLES.join(", ")}.`);
    if (role === "agent" && vinculadoAoGithub(t.id)) throw new ErroHttp(409, "Este ticket é respondido pela automação de atendimento.");
    const content = conteudo(ctx.corpo);
    const author = role === "agent" ? texto(ctx.corpo, "author", { max: 80, opcional: true }) ?? "Suporte" : "";
    const id = transacao(db, () => {
      const novoId = gravarMensagem(t.id, role, author, content);
      const novoStatus = role === "agent" && t.status === "open" ? "in_progress" : role === "user" && t.status === "resolved" ? "open" : t.status;
      if (novoStatus !== t.status) db.prepare("UPDATE ticket SET status = ? WHERE id = ?").run(novoStatus, t.id);
      return novoId;
    });
    return {
      message: saidaMensagem(db.prepare("SELECT * FROM ticket_mensagem WHERE id = ?").get(id)),
      ticket: saidaTicket(buscar(t.id, t.dono)),
    };
  });
}
