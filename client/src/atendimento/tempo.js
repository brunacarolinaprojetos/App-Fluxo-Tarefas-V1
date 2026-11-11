// Lógica pura do atendimento (sem React), testada sem navegador.

const DIA = 86_400_000;
const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Agrupa tickets (já ordenados do mais recente) como no histórico de conversas: Hoje, Ontem, 7 dias, 30 dias, Mais antigos. */
export function agruparPorData(tickets, agora = new Date()) {
  const hoje = inicioDoDia(agora);
  const faixas = [
    { rotulo: "Hoje", desde: hoje },
    { rotulo: "Ontem", desde: hoje - DIA },
    { rotulo: "Últimos 7 dias", desde: hoje - 7 * DIA },
    { rotulo: "Últimos 30 dias", desde: hoje - 30 * DIA },
    { rotulo: "Mais antigos", desde: -Infinity },
  ];
  const grupos = faixas.map((f) => ({ rotulo: f.rotulo, tickets: [] }));
  for (const t of tickets) {
    const quando = new Date(t.updatedAt).getTime();
    const i = faixas.findIndex((f) => quando >= f.desde);
    grupos[i === -1 ? grupos.length - 1 : i].tickets.push(t);
  }
  return grupos.filter((g) => g.tickets.length);
}

/** "14:32" se for hoje; "10/11, 14:32" se for outro dia. */
export function horaDaMensagem(iso, agora = new Date()) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (inicioDoDia(d) === inicioDoDia(agora)) return hora;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}

export const STATUS_TICKET = {
  open: { rotulo: "Aberto", tom: "aberto" },
  in_progress: { rotulo: "Em atendimento", tom: "andamento" },
  resolved: { rotulo: "Resolvido", tom: "resolvido" },
};

/** Ainda esperando o atendimento responder: última mensagem é do usuário e o ticket não está resolvido. */
export const aguardandoResposta = (ticket, mensagens) =>
  ticket?.status !== "resolved" && mensagens.length > 0 && mensagens[mensagens.length - 1].role === "user";
