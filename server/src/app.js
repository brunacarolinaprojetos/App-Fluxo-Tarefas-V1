// Monta a aplicação: banco + rotas. Recurso novo entra aqui com uma linha.
import { criarRoteador } from "./http.js";
import { abrirBanco } from "./db.js";
import { rotasDeItens } from "./itens.js";
import { rotasDeQuadros } from "./quadros.js";
import { rotasDeAuth } from "./auth.js";
import { rotasDeTickets } from "./tickets.js";

export function criarApp({ banco = ":memory:" } = {}) {
  const db = abrirBanco(banco);
  const app = criarRoteador();
  app.get("/api/saude", () => ({ ok: true }));
  rotasDeAuth(app, db);
  rotasDeItens(app, db);
  rotasDeQuadros(app, db);
  rotasDeTickets(app, db);
  return { servidor: app.servidor, db };
}
