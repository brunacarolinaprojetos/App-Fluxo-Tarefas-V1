import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { BarraLateral } from "./BarraLateral.jsx";
import { TelaAtendimento } from "./atendimento/TelaAtendimento.jsx";
import { useAtendimento } from "./atendimento/useAtendimento.js";
import { TelaQuadro } from "./TelaQuadro.jsx";
import { Botao } from "./componentes/Botao.jsx";
import { Campo } from "./componentes/Campo.jsx";
import { Confirmar } from "./componentes/Confirmar.jsx";
import { Dialogo } from "./componentes/Dialogo.jsx";
import { Icone } from "./componentes/Icone.jsx";
import { moverCartaoEntreListas } from "./ordem.js";

/** Telas em espera: blocos discretos, sem animação, enquanto a API responde. */
function Esqueleto() {
  return (
    <div className="listas">
      {[0, 1, 2].map((i) => (
        <div className="lista" key={i} aria-hidden="true">
          <div className="esqueleto-linha" style={{ width: "55%" }} />
          <div className="esqueleto">
            <div className="esqueleto-bloco" />
            <div className="esqueleto-bloco" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EstadoVazio({ titulo, descricao, children }) {
  return (
    <div className="vazio-canvas">
      <h2>{titulo}</h2>
      <p>{descricao}</p>
      {children}
    </div>
  );
}

/** Lê a área e o ticket a partir do caminho: `/quadro`, `/atendimento` ou `/atendimento/:id`. */
function lerRota(caminho) {
  const m = caminho.match(/^\/atendimento(?:\/([^/]+))?\/?$/);
  if (m) return { tela: "atendimento", ticketId: m[1] ? decodeURIComponent(m[1]) : null };
  return { tela: "quadros", ticketId: null };
}

export function App() {
  const [caminho, setCaminho] = useState(() => window.location.pathname);
  const { tela, ticketId } = lerRota(caminho);
  const [quadros, setQuadros] = useState(null);
  const [quadroId, setQuadroId] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  // Quadros: a lista vem da API e define qual quadro fica aberto.
  useEffect(() => {
    let vivo = true;
    api.quadros
      .listar()
      .then((dados) => {
        if (!vivo) return;
        const lista = dados?.boards ?? [];
        setQuadros(lista);
        setErro(null);
        setQuadroId((atual) => (atual && lista.some((q) => q.id === atual) ? atual : lista[0]?.id ?? null));
      })
      .catch((e) => {
        if (!vivo) return;
        setErro(e.message);
        setQuadros([]);
      });
    return () => { vivo = false; };
  }, [tentativa]);

  // Quadro aberto: listas e cartões.
  useEffect(() => {
    if (!quadroId) {
      setDetalhe(null);
      return;
    }
    let vivo = true;
    setDetalhe(null);
    api.quadros
      .detalhe(quadroId)
      .then((dados) => {
        if (!vivo) return;
        setDetalhe(dados);
        setErro(null);
      })
      .catch((e) => {
        if (!vivo) return;
        setErro(e.message);
        setDetalhe(null);
      });
    return () => { vivo = false; };
  }, [quadroId, tentativa]);

  const recarregar = () => setTentativa((t) => t + 1);

  // Navegação sem recarregar: o histórico do navegador (voltar/avançar) continua funcionando.
  useEffect(() => {
    const aoVoltar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  const navegar = useCallback((destino) => {
    setErro(null);
    if (destino !== window.location.pathname) window.history.pushState(null, "", destino);
    setCaminho(destino);
  }, []);
  const abrirTicket = useCallback((id) => navegar(id ? `/atendimento/${encodeURIComponent(id)}` : "/atendimento"), [navegar]);

  const atendimento = useAtendimento({ ativo: tela === "atendimento", ticketId, abrirTicket, aoErro: setErro });

  const renomearTicket = async (title) => {
    const alvo = dialogo?.ticket;
    if (alvo && (await atendimento.renomear(alvo.id, title))) setDialogo(null);
  };

  const excluirTicket = async () => {
    const alvo = dialogo?.ticket;
    if (alvo && (await atendimento.excluir(alvo.id))) setDialogo(null);
  };

  const executar = async (acao, aoTerminar) => {
    try {
      setErro(null);
      await acao();
      if (aoTerminar) aoTerminar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const criarQuadro = async (title) => {
    await executar(async () => {
      const r = await api.quadros.criar(title);
      await api.quadros.listar().then((dados) => setQuadros(dados?.boards ?? []));
      if (r?.board?.id) setQuadroId(r.board.id);
      setDialogo(null);
    });
  };

  const renomearQuadro = async (title) => {
    const alvo = dialogo?.quadro;
    if (!alvo) return;
    await executar(async () => {
      await api.quadros.renomear(alvo.id, title);
      const dados = await api.quadros.listar();
      setQuadros(dados?.boards ?? []);
      setDialogo(null);
    });
  };

  const excluirQuadro = async () => {
    const alvo = dialogo?.quadro;
    if (!alvo) return;
    await executar(async () => {
      await api.quadros.excluir(alvo.id);
      setDialogo(null);
      const dados = await api.quadros.listar();
      const lista = dados?.boards ?? [];
      setQuadros(lista);
      setQuadroId((atual) => (atual && lista.some((q) => q.id === atual) ? atual : lista[0]?.id ?? null));
    });
  };

  const recarregarQuadro = async () => {
    if (!quadroId) return;
    const dados = await api.quadros.detalhe(quadroId);
    setDetalhe(dados);
  };

  const criarLista = async (title) => {
    await executar(async () => {
      await api.listas.criar(quadroId, title);
      await recarregarQuadro();
    });
  };

  const renomearLista = async (title) => {
    const alvo = dialogo?.lista;
    if (!alvo) return;
    await executar(async () => {
      await api.listas.renomear(alvo.id, title);
      await recarregarQuadro();
      setDialogo(null);
    });
  };

  const excluirLista = async () => {
    const alvo = dialogo?.lista;
    if (!alvo) return;
    await executar(async () => {
      await api.listas.excluir(alvo.id);
      await recarregarQuadro();
      setDialogo(null);
    });
  };

  const criarCartao = async (listId, title) => {
    await executar(() => api.cartoes.criar(listId, title).then(recarregarQuadro));
  };

  const editarCartao = async (dados) => {
    const alvo = dialogo?.cartao;
    if (!alvo) return;
    await executar(async () => {
      await api.cartoes.editar(alvo.id, dados);
      await recarregarQuadro();
      setDialogo(null);
    });
  };

  const excluirCartao = async () => {
    const alvo = dialogo?.cartao;
    if (!alvo) return;
    await executar(async () => {
      await api.cartoes.excluir(alvo.id);
      await recarregarQuadro();
      setDialogo(null);
    });
  };

  const moverCartao = async (cartao, listaId) => {
    const lista = detalhe?.lists?.find((l) => l.id === listaId);
    const semCartao = (lista?.cards ?? []).filter((c) => c.id !== cartao.id);
    const posicao = semCartao.length;
    await executar(async () => {
      await api.cartoes.mover(cartao.id, listaId, posicao);
      await recarregarQuadro();
    });
  };

  const soltarCartao = async (cartaoId, listaId, posicao) => {
    const anterior = detalhe;
    setDetalhe((atual) => moverCartaoEntreListas(atual, cartaoId, listaId, posicao));
    try {
      await api.cartoes.mover(cartaoId, listaId, posicao);
      await recarregarQuadro();
    } catch (e) {
      setDetalhe(anterior);
      setErro(e.message);
    }
  };

  const conteudo = () => {
    if (tela === "atendimento") {
      return (
        <TelaAtendimento
          ticketId={ticketId}
          conversa={atendimento.conversa}
          enviando={atendimento.enviando}
          aoEnviar={atendimento.enviar}
          aoMudarStatus={atendimento.mudarStatus}
          aoSincronizar={atendimento.sincronizar}
          sincronizando={atendimento.sincronizando}
          sincronizadoEm={atendimento.sincronizadoEm}
          aoRenomear={(ticket) => setDialogo({ tipo: "renomear-ticket", ticket })}
          aoExcluir={(ticket) => setDialogo({ tipo: "excluir-ticket", ticket })}
        />
      );
    }
    if (quadros === null) {
      return (
        <>
          <p className="carregando-line" role="status">Carregando quadros…</p>
          <Esqueleto />
        </>
      );
    }
    if (!quadroId) {
      return (
        <EstadoVazio titulo="Nenhum quadro ainda" descricao="Um quadro reúne listas em colunas, e cada lista guarda cartões com o que precisa ser feito.">
          <Botao variante="primario" icone="mais" onClick={() => setDialogo({ tipo: "novo-quadro" })}>Criar quadro</Botao>
        </EstadoVazio>
      );
    }
    if (!detalhe) {
      return (
        <>
          <p className="carregando-line" role="status">Carregando quadro…</p>
          <Esqueleto />
        </>
      );
    }
    return (
      <TelaQuadro
        board={detalhe.board}
        listas={detalhe.lists ?? []}
        aoRenomearQuadro={() => setDialogo({ tipo: "renomear-quadro", quadro: detalhe.board })}
        aoExcluirQuadro={() => setDialogo({ tipo: "excluir-quadro", quadro: detalhe.board })}
        aoCriarLista={criarLista}
        aoRenomearLista={(lista) => setDialogo({ tipo: "renomear-lista", lista })}
        aoExcluirLista={(lista) => setDialogo({ tipo: "excluir-lista", lista })}
        aoCriarCartao={criarCartao}
        aoEditarCartao={(cartao) => setDialogo({ tipo: "editar-cartao", cartao })}
        aoExcluirCartao={(cartao) => setDialogo({ tipo: "excluir-cartao", cartao })}
        aoMoverCartao={moverCartao}
        aoSoltarCartao={soltarCartao}
      />
    );
  };

  return (
    <div className="app">
      <BarraLateral
        tela={tela}
        aoNavegar={navegar}
        quadrosProps={{
          quadros,
          quadroId,
          aoSelecionar: setQuadroId,
          aoNovoQuadro: () => setDialogo({ tipo: "novo-quadro" }),
          aoRenomear: (quadro) => setDialogo({ tipo: "renomear-quadro", quadro }),
          aoExcluir: (quadro) => setDialogo({ tipo: "excluir-quadro", quadro }),
        }}
        ticketsProps={{
          tickets: atendimento.tickets,
          ticketId,
          aoRenomear: (ticket) => setDialogo({ tipo: "renomear-ticket", ticket }),
          aoExcluir: (ticket) => setDialogo({ tipo: "excluir-ticket", ticket }),
        }}
      />

      <main className={`canvas ${tela === "atendimento" ? "canvas-atendimento" : ""}`.trim()}>
        {erro ? (
          <div className="aviso" role="alert">
            <span className="aviso-texto">
              <Icone nome="alerta" tamanho={18} />
              <span>{erro}</span>
            </span>
            {tela === "atendimento" ? (
              <Botao icone="fechar" onClick={() => setErro(null)}>Fechar</Botao>
            ) : (
              <Botao icone="atualizar" onClick={recarregar}>Tentar de novo</Botao>
            )}
          </div>
        ) : null}

        {conteudo()}
      </main>

      {dialogo?.tipo === "novo-quadro" ? (
        <Dialogo aberto titulo="Novo quadro" descricao="Dê um nome para o trabalho que este quadro vai acompanhar." aoFechar={() => setDialogo(null)}>
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault();
              const titulo = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (titulo) void criarQuadro(titulo);
            }}
          >
            <Campo rotulo="Título do quadro" name="title" maxLength={120} required autoFocus placeholder="Ex.: Lançamento do site" />
            <div className="acoes">
              <Botao onClick={() => setDialogo(null)}>Cancelar</Botao>
              <Botao variante="primario" type="submit">Criar quadro</Botao>
            </div>
          </form>
        </Dialogo>
      ) : null}

      {dialogo?.tipo === "renomear-quadro" ? (
        <Dialogo aberto titulo="Renomear quadro" aoFechar={() => setDialogo(null)}>
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault();
              const titulo = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (titulo) void renomearQuadro(titulo);
            }}
          >
            <Campo rotulo="Título do quadro" name="title" defaultValue={dialogo.quadro.title} maxLength={120} required autoFocus />
            <div className="acoes">
              <Botao onClick={() => setDialogo(null)}>Cancelar</Botao>
              <Botao variante="primario" type="submit">Salvar alterações</Botao>
            </div>
          </form>
        </Dialogo>
      ) : null}

      {dialogo?.tipo === "excluir-quadro" ? (
        <Confirmar
          aberto
          titulo="Excluir quadro"
          descricao={`Excluir "${dialogo.quadro.title}" apaga as listas e os cartões dentro dele. Não dá para desfazer.`}
          rotuloConfirmar="Excluir quadro"
          aoConfirmar={() => void excluirQuadro()}
          aoFechar={() => setDialogo(null)}
        />
      ) : null}

      {dialogo?.tipo === "renomear-lista" ? (
        <Dialogo aberto titulo="Renomear lista" aoFechar={() => setDialogo(null)}>
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault();
              const titulo = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (titulo) void renomearLista(titulo);
            }}
          >
            <Campo rotulo="Título da lista" name="title" defaultValue={dialogo.lista.title} maxLength={120} required autoFocus />
            <div className="acoes">
              <Botao onClick={() => setDialogo(null)}>Cancelar</Botao>
              <Botao variante="primario" type="submit">Salvar alterações</Botao>
            </div>
          </form>
        </Dialogo>
      ) : null}

      {dialogo?.tipo === "excluir-lista" ? (
        <Confirmar
          aberto
          titulo="Excluir lista"
          descricao={`Excluir "${dialogo.lista.title}" apaga os cartões dentro dela. Não dá para desfazer.`}
          rotuloConfirmar="Excluir lista"
          aoConfirmar={() => void excluirLista()}
          aoFechar={() => setDialogo(null)}
        />
      ) : null}

      {dialogo?.tipo === "editar-cartao" ? (
        <Dialogo aberto titulo="Editar cartão" aoFechar={() => setDialogo(null)}>
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              const titulo = String(dados.get("title") ?? "").trim();
              if (!titulo) return;
              void editarCartao({ title: titulo, description: String(dados.get("description") ?? "").trim() });
            }}
          >
            <Campo rotulo="Título do cartão" name="title" defaultValue={dialogo.cartao.title} maxLength={200} required autoFocus />
            <Campo rotulo="Descrição" name="description" defaultValue={dialogo.cartao.description ?? ""} multilinha rows={4} maxLength={2000} placeholder="Detalhes, links, contexto do trabalho" />
            <div className="acoes">
              <Botao onClick={() => setDialogo(null)}>Cancelar</Botao>
              <Botao variante="primario" type="submit">Salvar alterações</Botao>
            </div>
          </form>
        </Dialogo>
      ) : null}

      {dialogo?.tipo === "excluir-cartao" ? (
        <Confirmar
          aberto
          titulo="Excluir cartão"
          descricao={`Excluir "${dialogo.cartao.title}" não dá para desfazer.`}
          rotuloConfirmar="Excluir cartão"
          aoConfirmar={() => void excluirCartao()}
          aoFechar={() => setDialogo(null)}
        />
      ) : null}
      {dialogo?.tipo === "renomear-ticket" ? (
        <Dialogo aberto titulo="Renomear ticket" aoFechar={() => setDialogo(null)}>
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault();
              const titulo = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (titulo) void renomearTicket(titulo);
            }}
          >
            <Campo rotulo="Título do ticket" name="title" defaultValue={dialogo.ticket.title} maxLength={120} required autoFocus />
            <div className="acoes">
              <Botao onClick={() => setDialogo(null)}>Cancelar</Botao>
              <Botao variante="primario" type="submit">Salvar alterações</Botao>
            </div>
          </form>
        </Dialogo>
      ) : null}

      {dialogo?.tipo === "excluir-ticket" ? (
        <Confirmar
          aberto
          titulo="Excluir ticket"
          descricao={`Excluir "${dialogo.ticket.title}" apaga a conversa inteira. Não dá para desfazer.`}
          rotuloConfirmar="Excluir ticket"
          aoConfirmar={() => void excluirTicket()}
          aoFechar={() => setDialogo(null)}
        />
      ) : null}
    </div>
  );
}
