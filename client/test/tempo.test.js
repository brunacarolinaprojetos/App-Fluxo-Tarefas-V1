import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorData, aguardandoResposta } from "../src/atendimento/tempo.js";

const agora = new Date(2026, 10, 11, 15, 0);
const em = (dias, hora = 10) => ({ id: `t${dias}`, updatedAt: new Date(2026, 10, 11 - dias, hora).toISOString() });

test("agrupa tickets por faixa de data e omite grupos vazios", () => {
  const grupos = agruparPorData([em(0), em(1), em(3), em(45)], agora);
  assert.deepEqual(grupos.map((g) => g.rotulo), ["Hoje", "Ontem", "Últimos 7 dias", "Mais antigos"]);
  assert.deepEqual(grupos.map((g) => g.tickets.length), [1, 1, 1, 1]);
  assert.deepEqual(agruparPorData([], agora), []);
});

test("ontem à noite não conta como hoje", () => {
  const [grupo] = agruparPorData([em(1, 23)], agora);
  assert.equal(grupo.rotulo, "Ontem");
});

test("aguardando resposta só quando a última fala é do usuário e o ticket não está resolvido", () => {
  const u = { role: "user" }, a = { role: "agent" };
  assert.equal(aguardandoResposta({ status: "open" }, [u]), true);
  assert.equal(aguardandoResposta({ status: "open" }, [u, a]), false);
  assert.equal(aguardandoResposta({ status: "resolved" }, [u]), false);
  assert.equal(aguardandoResposta({ status: "open" }, []), false);
});
