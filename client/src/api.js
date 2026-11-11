// Cliente da API: um lugar só para falar com o servidor. Erros viram Error com a mensagem do servidor.
async function pedir(metodo, caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? {} : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor. Confira se ele está no ar.");
  }
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = dados?.error ?? dados?.mensagem ?? `Erro ${resposta.status}.`;
    throw new Error(mensagem);
  }
  return dados;
}

/** Remove campos vazios para não enviar `description: undefined` no corpo. */
const corpo = (dados) => Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined && v !== null));

export const api = {
  quadros: {
    listar: () => pedir("GET", "/boards"),
    criar: (title) => pedir("POST", "/boards", { title }),
    renomear: (id, title) => pedir("PATCH", `/boards/${id}`, { title }),
    excluir: (id) => pedir("DELETE", `/boards/${id}`),
    detalhe: (id) => pedir("GET", `/boards/${id}`),
  },
  listas: {
    criar: (boardId, title) => pedir("POST", `/boards/${boardId}/lists`, { title }),
    renomear: (id, title) => pedir("PATCH", `/lists/${id}`, { title }),
    excluir: (id) => pedir("DELETE", `/lists/${id}`),
  },
  cartoes: {
    criar: (listId, title, description) => pedir("POST", `/lists/${listId}/cards`, corpo({ title, description })),
    editar: (id, mudanca) => pedir("PATCH", `/cards/${id}`, corpo(mudanca)),
    excluir: (id) => pedir("DELETE", `/cards/${id}`),
    mover: (id, listId, position) => pedir("PATCH", `/cards/${id}`, corpo({ listId, position })),
  },
  tickets: {
    listar: () => pedir("GET", "/tickets"),
    abrir: (content) => pedir("POST", "/tickets", { content }),
    detalhe: (id) => pedir("GET", `/tickets/${id}`),
    renomear: (id, title) => pedir("PATCH", `/tickets/${id}`, { title }),
    mudarStatus: (id, status) => pedir("PATCH", `/tickets/${id}`, { status }),
    excluir: (id) => pedir("DELETE", `/tickets/${id}`),
    enviar: (id, content) => pedir("POST", `/tickets/${id}/messages`, { content }),
  },
};
