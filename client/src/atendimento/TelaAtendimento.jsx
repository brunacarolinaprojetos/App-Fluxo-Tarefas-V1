import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icone } from "../componentes/Icone.jsx";
import { Menu } from "../componentes/Menu.jsx";
import { aguardandoResposta, horaDaMensagem, STATUS_TICKET } from "./tempo.js";

const SUGESTOES = [
  "Não consigo mover cartões entre listas",
  "Tenho uma dúvida sobre como organizar meus quadros",
  "Encontrei um erro no sistema",
  "Quero sugerir uma melhoria",
];

/** Campo de mensagem: cresce com o texto, Enter envia e Shift+Enter quebra a linha. */
function Compositor({ aoEnviar, desabilitado, placeholder, autoFocus, textoInicial }) {
  const [texto, setTexto] = useState("");
  const campo = useRef(null);

  useEffect(() => {
    if (textoInicial) {
      setTexto(textoInicial.valor);
      campo.current?.focus();
    }
  }, [textoInicial]);

  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [texto]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || desabilitado) return;
    setTexto("");
    const ok = await aoEnviar(conteudo);
    if (!ok) setTexto(conteudo);
    campo.current?.focus();
  };

  return (
    <form className="compositor" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <label className="sr-only" htmlFor="compositor-texto">Mensagem</label>
      <textarea
        id="compositor-texto"
        ref={campo}
        className="compositor-texto"
        rows={1}
        value={texto}
        maxLength={10000}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void enviar();
          }
        }}
      />
      <button type="submit" className="compositor-enviar" aria-label="Enviar mensagem" disabled={!texto.trim() || desabilitado}>
        <Icone nome="enviar" tamanho={18} />
      </button>
    </form>
  );
}

function SeloStatus({ status }) {
  const s = STATUS_TICKET[status] ?? STATUS_TICKET.open;
  return <span className="selo-status" data-tom={s.tom}>{s.rotulo}</span>;
}

function Mensagem({ mensagem }) {
  if (mensagem.role === "system") {
    return <li className="msg msg-sistema"><span>{mensagem.content}</span></li>;
  }
  if (mensagem.role === "user") {
    return (
      <li className="msg msg-usuario" data-pendente={mensagem.pendente ? "" : undefined}>
        <div className="msg-balao">{mensagem.content}</div>
        <span className="msg-hora">{mensagem.pendente ? "Enviando…" : horaDaMensagem(mensagem.createdAt)}</span>
      </li>
    );
  }
  return (
    <li className="msg msg-agente">
      <span className="msg-avatar" aria-hidden="true"><Icone nome="conversa" tamanho={16} /></span>
      <div className="msg-corpo">
        <p className="msg-autor">
          {mensagem.author || "Suporte"} <span className="msg-hora">{horaDaMensagem(mensagem.createdAt)}</span>
        </p>
        <div className="msg-texto">{mensagem.content}</div>
      </div>
    </li>
  );
}

/** Tela de "novo ticket": saudação central, campo de mensagem e atalhos de assunto. */
function NovoTicket({ aoEnviar, enviando }) {
  const [sugestao, setSugestao] = useState(null);
  return (
    <div className="atd-inicio">
      <div className="atd-inicio-conteudo">
        <span className="atd-inicio-icone" aria-hidden="true"><Icone nome="conversa" tamanho={24} /></span>
        <h1 className="atd-inicio-titulo">Como podemos ajudar?</h1>
        <p className="atd-inicio-texto">Descreva o que está acontecendo. Cada ticket vira uma conversa com o nosso atendimento.</p>
        <Compositor aoEnviar={aoEnviar} desabilitado={enviando} placeholder="Descreva seu problema ou dúvida…" autoFocus textoInicial={sugestao} />
        <ul className="atd-sugestoes" aria-label="Sugestões de assunto">
          {SUGESTOES.map((s) => (
            <li key={s}>
              <button type="button" className="atd-sugestao" onClick={() => setSugestao({ valor: s })}>{s}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Área de atendimento no estilo de chat: cada ticket é uma conversa. */
/** Linha de sincronização: issue vinculada, horário da última busca e botão Atualizar. */
function Sincronizacao({ tracking, sincronizando, sincronizadoEm, aoSincronizar }) {
  const hora = sincronizadoEm ? sincronizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
  return (
    <div className="atd-sinc" role="status">
      {tracking?.issueUrl ? (
        <a className="atd-sinc-issue" href={tracking.issueUrl} target="_blank" rel="noreferrer">Issue #{tracking.issueNumber}</a>
      ) : null}
      <span className="atd-sinc-texto">
        {tracking?.ativo ? "Sincronizando automaticamente" : "Atendimento encerrado na issue"}
        {hora ? ` · atualizado às ${hora}` : ""}
      </span>
      <button type="button" className="botao botao-fantasma atd-sinc-botao" onClick={aoSincronizar} disabled={sincronizando}>
        <Icone nome="atualizar" tamanho={16} className={sincronizando ? "girando" : ""} />
        <span>{sincronizando ? "Atualizando…" : "Atualizar"}</span>
      </button>
    </div>
  );
}

export function TelaAtendimento({ ticketId, conversa, enviando, aoEnviar, aoRenomear, aoMudarStatus, aoExcluir, aoSincronizar, sincronizando, sincronizadoEm }) {
  const fim = useRef(null);
  const quantidade = conversa?.messages?.length ?? 0;
  const primeiraRolagem = useRef(true);

  useEffect(() => { primeiraRolagem.current = true; }, [ticketId]);
  useEffect(() => {
    if (!quantidade) return;
    fim.current?.scrollIntoView({ block: "end", behavior: primeiraRolagem.current ? "auto" : "smooth" });
    primeiraRolagem.current = false;
  }, [quantidade, ticketId]);

  if (!ticketId && !conversa) return <NovoTicket aoEnviar={aoEnviar} enviando={enviando} />;

  if (!conversa) {
    return (
      <div className="atd">
        <p className="carregando-line atd-carregando" role="status">Carregando conversa…</p>
      </div>
    );
  }

  const { ticket, messages } = conversa;
  const resolvido = ticket.status === "resolved";
  const salvo = Boolean(ticket.id);

  return (
    <div className="atd">
      <header className="atd-topo">
        <div className="atd-topo-texto">
          <h1 className="atd-titulo">{ticket.title}</h1>
          <SeloStatus status={ticket.status} />
        </div>
        {salvo ? (
          <div className="atd-topo-acoes">
            {resolvido ? null : (
              <button type="button" className="botao botao-suave atd-resolver" aria-label="Marcar como resolvido" onClick={() => aoMudarStatus(ticket.id, "resolved")}>
                <Icone nome="check" tamanho={18} />
                <span>Marcar como resolvido</span>
              </button>
            )}
            <Menu
              rotulo={`Opções do ticket ${ticket.title}`}
              itens={[
                resolvido
                  ? { rotulo: "Reabrir ticket", icone: "reabrir", aoClicar: () => aoMudarStatus(ticket.id, "open") }
                  : { rotulo: "Marcar como resolvido", icone: "check", aoClicar: () => aoMudarStatus(ticket.id, "resolved") },
                { rotulo: "Renomear ticket", icone: "lapis", aoClicar: () => aoRenomear(ticket) },
                { rotulo: "Excluir ticket", icone: "lixeira", perigo: true, aoClicar: () => aoExcluir(ticket) },
              ]}
            />
          </div>
        ) : null}
      </header>

      {ticket.tracking ? (
        <Sincronizacao tracking={ticket.tracking} sincronizando={sincronizando} sincronizadoEm={sincronizadoEm} aoSincronizar={aoSincronizar} />
      ) : null}

      <div className="atd-rolagem">
        <ol className="atd-mensagens" aria-label="Conversa" aria-live="polite">
          {messages.map((m) => <Mensagem key={m.id} mensagem={m} />)}
          {(aguardandoResposta(ticket, messages) || ticket.tracking?.ativo) && !enviando ? (
            <li className="msg msg-agente msg-aguardando">
              <span className="msg-avatar" aria-hidden="true"><Icone nome="conversa" tamanho={16} /></span>
              <div className="msg-corpo">
                <p className="msg-autor">{ticket.tracking?.ativo ? "Suporte N1" : "Atendimento"}</p>
                <p className="msg-espera">
                  <span className="pontos" aria-hidden="true"><i /><i /><i /></span>
                  {ticket.tracking?.ativo
                    ? "Acompanhando o andamento do seu pedido. Cada novidade aparece aqui assim que acontece."
                    : "Recebemos sua mensagem. A resposta aparece aqui assim que alguém do atendimento responder."}
                </p>
              </div>
            </li>
          ) : null}
        </ol>
        <div ref={fim} />
      </div>

      <div className="atd-rodape">
        {resolvido ? <p className="atd-aviso-resolvido">Este ticket está resolvido. Enviar uma nova mensagem reabre o atendimento.</p> : null}
        <Compositor key={ticket.id ?? "novo"} aoEnviar={aoEnviar} desabilitado={enviando || !salvo} placeholder="Escreva uma mensagem…" autoFocus />
        <p className="atd-dica">Enter envia · Shift+Enter quebra a linha</p>
      </div>
    </div>
  );
}
