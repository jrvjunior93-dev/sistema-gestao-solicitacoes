/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      /*
        CAMADA TAMBÉM SE DECLARA PELO TOKEN NO TAILWIND (06/09).

        Medido antes de escrever: camada é feita aqui de TRÊS jeitos —
        `z-index` cru no CSS, classe `z-*` do Tailwind e `zIndex` no
        `style` inline. Eram 110 lugares fora da escala, e 59 deles eram
        classe do Tailwind. Sem esta ponte, converter o CSS deixaria o JSX
        preso na faixa `z-0…z-50`, que é justamente a faixa que PERDE para
        a barra do topo — e a saída fácil seria inventar um QUARTO jeito
        (`style={{ zIndex: 'var(--z-modal)' }}` espalhado pelas telas).

        Não é jeito novo: continua sendo classe do Tailwind. Só que o valor
        vem do mesmo lugar que o do CSS — `--z-*`, em `src/index.css`.
        Mudar a fila do sistema continua sendo UMA edição, num arquivo só.

        Os nomes são os da escala, sem número nenhum: `z-modal`, `z-sticky`,
        `z-dropdown`… Número no nome da classe é o defeito que a R32 pega.
      */
      zIndex: {
        atras: 'var(--z-atras)',
        base: 'var(--z-base)',
        conteudo: 'var(--z-conteudo)',
        'conteudo-acima': 'var(--z-conteudo-acima)',
        'conteudo-topo': 'var(--z-conteudo-topo)',
        celula: 'var(--z-celula-fixa)',
        'celula-cabecalho': 'var(--z-celula-fixa-cabecalho)',
        alca: 'var(--z-alca)',
        'presa-no-bloco': 'var(--z-presa-no-bloco)',
        'flutuante-local': 'var(--z-flutuante-local)',
        'faixa-presa': 'var(--z-faixa-presa)',
        'faixa-presa-acima': 'var(--z-faixa-presa-acima)',
        sticky: 'var(--z-sticky)',
        dropdown: 'var(--z-dropdown)',
        veu: 'var(--z-veu)',
        sidebar: 'var(--z-sidebar)',
        painel: 'var(--z-painel)',
        'dropdown-portal': 'var(--z-dropdown-portal)',
        modal: 'var(--z-modal)',
        'modal-acima': 'var(--z-modal-acima)',
        toast: 'var(--z-toast)',
      },
    },
  },
  plugins: [],
}
