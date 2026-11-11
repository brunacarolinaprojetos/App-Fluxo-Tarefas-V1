import { Botao } from "./componentes/Botao.jsx";
import { Icone } from "./componentes/Icone.jsx";
import { Menu } from "./componentes/Menu.jsx";
import { agruparPorData, STATUS_TICKET } from "./atendimento/tempo.js";

const AREAS = [
  { tela: "quadros", caminho: "/quadro", rotulo: "Quadros", icone: "colunas" },
  { tela: "atendimento", caminho: "/atendimento", rotulo: "Atendimento", icone: "conversa" },
];

/** Link que troca de área sem recarregar a página (e ainda abre em nova aba com Ctrl/clique do meio). */
function LinkInterno({ caminho, aoNavegar, children, ...resto }) {
  return (
    <a
      href={caminho}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        aoNavegar(caminho);
      }}
      {...resto}
    >
      {children}
    </a>
  );
}

function SecaoQuadros({ quadros, quadroId, aoSelecionar, aoNovoQuadro, aoRenomear, aoExcluir }) {
  return (
    <>
      <div className="lateral-topo">
        <h2 className="lateral-titulo">Quadros</h2>
        <Botao variante="fantasma" icone="mais" aria-label="Criar quadro" onClick={aoNovoQuadro} />
      </div>

      {quadros === null ? (
        <p className="lateral-vazio">Carregando quadros…</p>
      ) : quadros.length ? (
        <ul className="lateral-lista">
          {quadros.map((quadro) => (
            <li key={quadro.id}>
              <div className="lateral-item" data-ativo={quadro.id === quadroId ? "" : undefined}>
                <button
                  type="button"
                  className="lateral-escolha"
                  aria-current={quadro.id === quadroId ? "page" : undefined}
                  onClick={() => aoSelecionar(quadro.id)}
                >
                  {quadro.title}
                </button>
                <span className="lateral-acoes">
                  <Botao variante="fantasma" icone="lapis" aria-label={`Renomear quadro ${quadro.title}`} onClick={() => aoRenomear(quadro)} />
                  <Botao variante="fantasma" icone="lixeira" aria-label={`Excluir quadro ${quadro.title}`} onClick={() => aoExcluir(quadro)} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lateral-vazio">Nenhum quadro ainda. Crie o primeiro para começar.</p>
      )}
    </>
  );
}

/** Histórico de tickets agrupado por data, como a lista de conversas de um chat. */
function SecaoTickets({ tickets, ticketId, aoNavegar, aoRenomear, aoExcluir }) {
  return (
    <>
      <LinkInterno caminho="/atendimento" aoNavegar={aoNavegar} className="lateral-novo" aria-current={!ticketId ? "page" : undefined}>
        <Icone nome="novo-ticket" tamanho={18} />
        <span>Novo ticket</span>
      </LinkInterno>

      {tickets === null ? (
        <p className="lateral-vazio">Carregando tickets…</p>
      ) : tickets.length ? (
        <div className="lateral-historico">
          {agruparPorData(tickets).map((grupo) => (
            <section key={grupo.rotulo} className="lateral-grupo" aria-label={grupo.rotulo}>
              <h2 className="lateral-titulo lateral-grupo-titulo">{grupo.rotulo}</h2>
              <ul className="lateral-lista">
                {grupo.tickets.map((t) => (
                  <li key={t.id}>
                    <div className="lateral-item lateral-ticket" data-ativo={t.id === ticketId ? "" : undefined}>
                      <LinkInterno
                        caminho={`/atendimento/${t.id}`}
                        aoNavegar={aoNavegar}
                        className="lateral-escolha"
                        aria-current={t.id === ticketId ? "page" : undefined}
                        title={t.title}
                      >
                        <span className="ponto-status" data-tom={STATUS_TICKET[t.status]?.tom} aria-label={STATUS_TICKET[t.status]?.rotulo} role="img" />
                        <span className="lateral-ticket-titulo">{t.title}</span>
                      </LinkInterno>
                      <span className="lateral-acoes">
                        <Menu
                          rotulo={`Opções do ticket ${t.title}`}
                          itens={[
                            { rotulo: "Renomear ticket", icone: "lapis", aoClicar: () => aoRenomear(t) },
                            { rotulo: "Excluir ticket", icone: "lixeira", perigo: true, aoClicar: () => aoExcluir(t) },
                          ]}
                        />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="lateral-vazio">Nenhum ticket ainda. Abra o primeiro quando precisar de ajuda.</p>
      )}
    </>
  );
}

/** Lateral: navegação entre áreas e, abaixo, o conteúdo da área ativa (quadros ou tickets). */
export function BarraLateral({ tela, aoNavegar, quadrosProps, ticketsProps }) {
  return (
    <aside className="lateral" aria-label="Navegação">
      <a className="marca" href="/" aria-label="Fluxo, voltar ao início" style={{ textDecoration: "none" }}>
        <span className="marca-simbolo" aria-hidden="true">
          <Icone nome="colunas" tamanho={18} />
        </span>
        <span className="marca-nome">Fluxo</span>
      </a>

      <nav className="lateral-nav" aria-label="Áreas">
        {AREAS.map((a) => (
          <LinkInterno
            key={a.tela}
            caminho={a.caminho}
            aoNavegar={aoNavegar}
            className="lateral-nav-item"
            aria-current={tela === a.tela ? "page" : undefined}
          >
            <Icone nome={a.icone} tamanho={18} />
            <span>{a.rotulo}</span>
          </LinkInterno>
        ))}
      </nav>

      <div className="lateral-separador" role="presentation" />

      {tela === "atendimento" ? <SecaoTickets aoNavegar={aoNavegar} {...ticketsProps} /> : <SecaoQuadros {...quadrosProps} />}
    </aside>
  );
}
