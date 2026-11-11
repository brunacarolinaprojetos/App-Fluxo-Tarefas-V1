// Atendimento: tickets de suporte em formato de conversa. Contrato JSON em inglês, como o de quadros.
//
// Cada ticket é uma conversa com mensagens em ordem cronológica. `role` diz quem falou:
//   "user"   — quem abriu o ticket
//   "agent"  — atendente (humano ou agente autônomo; o campo `author` guarda o nome exibido)
//   "system" — avisos automáticos (mudança de status etc.)
//
// Ponto de integração para agentes autônomos: ler `GET /api/tickets?status=open` e responder com
// `POST /api/tickets/:id/messages { role: "agent", author: "Nome do agente", content }`.
import { randomUUID } from "node:crypto";
import { invalido, naoEncontrado, texto } from "./http.js";
import { transacao } from "./db.js";

const STATUS = ["open", "in_progress", "resolved"];
const ROLES = ["user", "agent"];
const NOME_STATUS = { open: "Aberto", in_progress: "Em atendimento", resolved: "Resolvido" };

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

export function rotasDeTickets(app, db) {
  const buscar = (id) => {
    const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(id);
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
  const conteudo = (corpo) => texto(corpo, "content", { max: 10_000 });

  app.get("/api/tickets", ({ url }) => {
    const status = url.searchParams.get("status");
    if (status && !STATUS.includes(status)) throw invalido(`status deve ser um de: ${STATUS.join(", ")}.`);
    const linhas = db.prepare(`
      SELECT t.*, (SELECT content FROM ticket_mensagem m WHERE m.ticket_id = t.id ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 1) AS ultima
      FROM ticket t ${status ? "WHERE t.status = ?" : ""}
      ORDER BY t.atualizado_em DESC, t.rowid DESC`).all(...(status ? [status] : []));
    return { tickets: linhas.map(saidaTicket) };
  });

  /** Abre um ticket já com a primeira mensagem do usuário. `title` é opcional: sem ele, sai da mensagem. */
  app.post("/api/tickets", ({ corpo }) => {
    const content = conteudo(corpo);
    const title = texto(corpo, "title", { max: 120, opcional: true }) ?? tituloDaMensagem(content);
    const id = randomUUID();
    const agora = new Date().toISOString();
    transacao(db, () => {
      db.prepare("INSERT INTO ticket (id, title, status, criado_em, atualizado_em) VALUES (?, ?, 'open', ?, ?)").run(id, title, agora, agora);
      gravarMensagem(id, "user", "", content, agora);
    });
    return { ticket: saidaTicket(buscar(id)), messages: mensagens(id) };
  });

  app.get("/api/tickets/:id", ({ params }) => {
    const t = buscar(params.id);
    return { ticket: saidaTicket(t), messages: mensagens(t.id) };
  });

  app.patch("/api/tickets/:id", ({ params, corpo }) => {
    const t = buscar(params.id);
    const title = texto(corpo, "title", { max: 120, opcional: true }) ?? t.title;
    let status = t.status;
    if (corpo.status !== undefined) {
      if (!STATUS.includes(corpo.status)) throw invalido(`status deve ser um de: ${STATUS.join(", ")}.`);
      status = corpo.status;
    }
    transacao(db, () => {
      db.prepare("UPDATE ticket SET title = ?, status = ? WHERE id = ?").run(title, status, t.id);
      if (status !== t.status) gravarMensagem(t.id, "system", "", `Status alterado para "${NOME_STATUS[status]}".`);
    });
    return { ticket: saidaTicket(buscar(t.id)) };
  });

  app.delete("/api/tickets/:id", ({ params }) => {
    const t = buscar(params.id);
    db.prepare("DELETE FROM ticket WHERE id = ?").run(t.id); // mensagens caem em cascata
    return { ok: true };
  });

  /**
   * Nova mensagem na conversa. `role` padrão é "user".
   * Regras de status: resposta de agente em ticket aberto passa para "in_progress";
   * mensagem do usuário em ticket resolvido reabre o ticket.
   */
  app.post("/api/tickets/:id/messages", ({ params, corpo }) => {
    const t = buscar(params.id);
    const role = corpo.role ?? "user";
    if (!ROLES.includes(role)) throw invalido(`role deve ser um de: ${ROLES.join(", ")}.`);
    const content = conteudo(corpo);
    const author = role === "agent" ? texto(corpo, "author", { max: 80, opcional: true }) ?? "Suporte" : "";
    const id = transacao(db, () => {
      const novoId = gravarMensagem(t.id, role, author, content);
      const novoStatus = role === "agent" && t.status === "open" ? "in_progress" : role === "user" && t.status === "resolved" ? "open" : t.status;
      if (novoStatus !== t.status) db.prepare("UPDATE ticket SET status = ? WHERE id = ?").run(novoStatus, t.id);
      return novoId;
    });
    return {
      message: saidaMensagem(db.prepare("SELECT * FROM ticket_mensagem WHERE id = ?").get(id)),
      ticket: saidaTicket(buscar(t.id)),
    };
  });
}
