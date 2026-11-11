/**
 * Ícones em SVG inline, traço único e `currentColor`: o mesmo desenho serve para
 * todos os estados (hover, ativo, desabilitado) porque a cor vem do CSS.
 * Botão só com ícone precisa de `aria-label` — o svg em si é decorativo.
 */
const DESENHOS = {
  colunas: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="10" rx="1.5" />
      <rect x="17" y="4" width="4" height="14" rx="1.5" />
    </>
  ),
  mais: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  lapis: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  lixeira: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  fechar: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  mover: (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  "chevron-direita": <path d="m9 6 6 6-6 6" />,
  "chevron-baixo": <path d="m6 9 6 6 6-6" />,
  elipse: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  nota: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h7" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  pasta: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </>
  ),
  arrastar: (
    <>
      <circle cx="9" cy="6" r="1.3" />
      <circle cx="15" cy="6" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="18" r="1.3" />
      <circle cx="15" cy="18" r="1.3" />
    </>
  ),
  atualizar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3v6h-6" />
    </>
  ),
  conversa: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  "novo-ticket": (
    <>
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M17.5 3.5a2.12 2.12 0 0 1 3 3L13 14l-4 1 1-4Z" />
    </>
  ),
  enviar: (
    <>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  reabrir: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 3v6h6" />
    </>
  ),
};

export function Icone({ nome, tamanho = 18, rotulo, className = "", ...resto }) {
  const desenho = DESENHOS[nome];
  if (!desenho) return null;
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={rotulo ? "img" : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : "true"}
      focusable="false"
      {...resto}
    >
      {desenho}
    </svg>
  );
}
