import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const INTERVALO_ATUALIZACAO = 5000;

/**
 * Estado do atendimento: lista de tickets, conversa aberta e envio de mensagens.
 * `ticketId` vem da URL (`/atendimento/:id`); `null` é a tela de "novo ticket".
 * A conversa aberta é consultada a cada poucos segundos para receber respostas
 * dos agentes (humanos ou autônomos) sem recarregar a página.
 */
export function useAtendimento({ ativo, ticketId, abrirTicket, aoErro }) {
  const [tickets, setTickets] = useState(null);
  const [conversa, setConversa] = useState(null); // { ticket, messages }
  const [enviando, setEnviando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizadoEm, setSincronizadoEm] = useState(null);
  const conversaRef = useRef(conversa);
  conversaRef.current = conversa;
  const enviandoRef = useRef(false);

  const recarregarLista = useCallback(async () => {
    const dados = await api.tickets.listar();
    setTickets(dados?.tickets ?? []);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    recarregarLista().catch((e) => { aoErro(e.message); setTickets([]); });
  }, [ativo, recarregarLista, aoErro]);

  // Conversa aberta. Se ela já está em memória (acabou de ser criada), não busca de novo.
  useEffect(() => {
    if (!ativo) return;
    if (!ticketId) {
      if (conversaRef.current?.ticket?.id) setConversa(null);
      return;
    }
    if (conversaRef.current?.ticket?.id === ticketId) return;
    let vivo = true;
    setConversa(null);
    api.tickets.detalhe(ticketId)
      .then((dados) => { if (vivo) setConversa(dados); })
      .catch((e) => {
        if (!vivo) return;
        aoErro(e.message);
        abrirTicket(null);
      });
    return () => { vivo = false; };
  }, [ativo, ticketId, abrirTicket, aoErro]);

  // Atualização periódica da conversa aberta (só com a aba visível e sem envio em curso).
  useEffect(() => {
    if (!ativo || !ticketId) return;
    const id = setInterval(async () => {
      if (document.hidden || enviandoRef.current) return;
      try {
        const dados = await api.tickets.detalhe(ticketId);
        const atual = conversaRef.current;
        if (!atual || atual.ticket.id !== ticketId) return;
        setSincronizadoEm(new Date());
        const mudou = dados.messages.length !== atual.messages.length || dados.ticket.status !== atual.ticket.status
          || dados.ticket.title !== atual.ticket.title || JSON.stringify(dados.ticket.tracking) !== JSON.stringify(atual.ticket.tracking);
        if (mudou) {
          setConversa(dados);
          recarregarLista().catch(() => {});
        }
      } catch { /* silencioso: a próxima rodada tenta de novo */ }
    }, INTERVALO_ATUALIZACAO);
    return () => clearInterval(id);
  }, [ativo, ticketId, recarregarLista]);

  /** Envia uma mensagem; sem ticket aberto, abre um novo com ela. Devolve `true` se deu certo. */
  const enviar = useCallback(async (conteudo) => {
    const provisoria = { id: `temp-${Date.now()}`, role: "user", author: "", content: conteudo, createdAt: new Date().toISOString(), pendente: true };
    const anterior = conversaRef.current;
    enviandoRef.current = true;
    setEnviando(true);
    try {
      if (!ticketId) {
        setConversa({ ticket: { id: null, title: "Novo ticket", status: "open" }, messages: [provisoria] });
        const criado = await api.tickets.abrir(conteudo);
        conversaRef.current = criado;
        setConversa(criado);
        abrirTicket(criado.ticket.id);
      } else {
        setConversa((c) => c && { ...c, messages: [...c.messages, provisoria] });
        const r = await api.tickets.enviar(ticketId, conteudo);
        setConversa((c) => c && { ticket: r.ticket, messages: c.messages.map((m) => (m.id === provisoria.id ? r.message : m)) });
      }
      recarregarLista().catch(() => {});
      return true;
    } catch (e) {
      setConversa(anterior);
      aoErro(e.message);
      return false;
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, [ticketId, abrirTicket, aoErro, recarregarLista]);

  const atualizarTicket = useCallback(async (id, acao) => {
    try {
      const r = await acao();
      setConversa((c) => (c?.ticket?.id === id ? { ...c, ticket: r.ticket } : c));
      // Mudança de status gera aviso do sistema na conversa: busca de novo para mostrá-lo.
      if (conversaRef.current?.ticket?.id === id) setConversa(await api.tickets.detalhe(id));
      await recarregarLista();
      return true;
    } catch (e) {
      aoErro(e.message);
      return false;
    }
  }, [aoErro, recarregarLista]);

  /** Botão "Atualizar": busca na issue agora, sem esperar o próximo ciclo. */
  const sincronizar = useCallback(async () => {
    if (!ticketId || enviandoRef.current) return;
    setSincronizando(true);
    try {
      const dados = await api.tickets.detalhe(ticketId, { sincronizar: true });
      if (conversaRef.current?.ticket?.id === ticketId) setConversa(dados);
      setSincronizadoEm(new Date());
      recarregarLista().catch(() => {});
    } catch (e) {
      aoErro(e.message);
    } finally {
      setSincronizando(false);
    }
  }, [ticketId, aoErro, recarregarLista]);

  const renomear = (id, title) => atualizarTicket(id, () => api.tickets.renomear(id, title));
  const mudarStatus = (id, status) => atualizarTicket(id, () => api.tickets.mudarStatus(id, status));

  const excluir = async (id) => {
    try {
      await api.tickets.excluir(id);
      if (ticketId === id) abrirTicket(null);
      await recarregarLista();
      return true;
    } catch (e) {
      aoErro(e.message);
      return false;
    }
  };

  return { tickets, conversa, enviando, enviar, renomear, mudarStatus, excluir, recarregarLista, sincronizar, sincronizando, sincronizadoEm };
}
