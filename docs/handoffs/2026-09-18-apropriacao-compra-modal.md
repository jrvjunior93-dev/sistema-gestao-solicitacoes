# Apropriação por modal em Solicitação de Compra e Compra Direta

## Escopo

- `NovaSolicitacaoCompra.jsx` é compartilhado pelas duas telas. O botão
  **Item manual** continua criando uma linha editável diretamente na lista.
- A coluna de apropriação voltou a mostrar resumo e botão **Apropriar/Editar**.
  A escolha da apropriação, as quantidades e os rateios adicionais ficam no
  `OverlayModal` existente do sistema.
- Editar um rateio no modal não altera o item até **Salvar distribuição**.
  **Cancelar**, **Fechar** e Escape descartam a edição. A validação de total,
  apropriações obrigatórias, duplicidade e quantidades permanece no utilitário
  de rateio usado pela revisão da solicitação.
- Nenhum endpoint, payload de API ou regra de backend foi alterado.

## Validação local

- `npm run build`: passou.
- `npm run test:reaproveitamento-compra`: passou.
- `node frontend/scripts/validarResponsividadeFrontend.mjs`: passou.
- `npm run test:apropriacao-compra`: passou no navegador local nos dois modos,
  cobrindo item manual inline, abertura, salvamento e cancelamento do modal.
- `git diff --check`: passou.

## Próximo passo

Homologar em dev com usuário autenticado antes do deploy de produção. Não houve
acesso a EC2, RDS ou Vercel. `outputs/`
permanece fora deste escopo.
