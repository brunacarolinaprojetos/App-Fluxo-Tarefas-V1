import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarApp } from "../src/app.js";
import { tituloDaMensagem } from "../src/tickets.js";

let base, servidor, cookie = "";
const chamar = async (metodo, caminho, corpo) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { "content-type": "application/json", cookie }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const novo = r.headers.get("set-cookie");
  if (novo) cookie = novo.split(";")[0];
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
};
const abrir = async (content, title) => (await chamar("POST", "/api/tickets", { content, title })).dados;

before(async () => {
  ({ servidor } = criarApp());
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("ticket de exemplo existe na primeira criação do banco", async () => {
  const { tickets } = (await chamar("GET", "/api/tickets")).dados;
  const semente = tickets.find((t) => t.id === "ticket-boas-vindas");
  assert.ok(semente);
  assert.equal(semente.status, "in_progress");
  const conversa = (await chamar("GET", `/api/tickets/${semente.id}`)).dados;
  assert.deepEqual(conversa.messages.map((m) => m.role), ["user", "agent"]);
});

test("abrir ticket grava a primeira mensagem e tira o título dela", async () => {
  const { ticket, messages } = await abrir("  Não consigo mover cartões entre listas  \n\nAcontece no Chrome.");
  assert.equal(ticket.title, "Não consigo mover cartões entre listas");
  assert.equal(ticket.status, "open");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "Não consigo mover cartões entre listas  \n\nAcontece no Chrome.");
  assert.equal((await abrir("qualquer coisa", "Título próprio")).ticket.title, "Título próprio");
  assert.equal((await chamar("POST", "/api/tickets", { content: "   " })).status, 400);
});

test("título derivado é cortado em 80 caracteres", () => {
  const t = tituloDaMensagem("a".repeat(200));
  assert.ok(t.length <= 80);
  assert.ok(t.endsWith("…"));
  assert.equal(tituloDaMensagem("\n\n  oi   tudo  bem \n"), "oi tudo bem");
});

test("listagem vem do mais recente e traz a última mensagem; filtra por status", async () => {
  const a = (await abrir("Primeiro")).ticket;
  const b = (await abrir("Segundo")).ticket;
  await chamar("POST", `/api/tickets/${a.id}/messages`, { content: "Atualizando o primeiro" });
  const { tickets } = (await chamar("GET", "/api/tickets")).dados;
  assert.equal(tickets[0].id, a.id);
  assert.equal(tickets[0].lastMessage, "Atualizando o primeiro");
  assert.ok(tickets.findIndex((t) => t.id === b.id) > 0);
  const abertos = (await chamar("GET", "/api/tickets?status=open")).dados.tickets;
  assert.ok(abertos.every((t) => t.status === "open"));
  assert.equal((await chamar("GET", "/api/tickets?status=xyz")).status, 400);
});

test("resposta de agente põe em atendimento; usuário reabre ticket resolvido", async () => {
  const { ticket } = await abrir("Preciso de ajuda");
  const resposta = (await chamar("POST", `/api/tickets/${ticket.id}/messages`, { role: "agent", author: "Agente IA", content: "Claro!" })).dados;
  assert.equal(resposta.message.role, "agent");
  assert.equal(resposta.message.author, "Agente IA");
  assert.equal(resposta.ticket.status, "in_progress");

  const resolvido = (await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "resolved" })).dados.ticket;
  assert.equal(resolvido.status, "resolved");
  const reaberto = (await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "Voltou a acontecer" })).dados.ticket;
  assert.equal(reaberto.status, "open");

  const { messages } = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.deepEqual(messages.map((m) => m.role), ["user", "agent", "system", "user"]);
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { role: "system", content: "x" })).status, 400);
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "fechado" })).status, 400);
});

test("renomear e excluir ticket; mensagens somem junto", async () => {
  const { ticket } = await abrir("Para apagar");
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { title: "Novo nome" })).dados.ticket.title, "Novo nome");
  assert.deepEqual((await chamar("DELETE", `/api/tickets/${ticket.id}`)).dados, { ok: true });
  assert.equal((await chamar("GET", `/api/tickets/${ticket.id}`)).status, 404);
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "x" })).status, 404);
});
