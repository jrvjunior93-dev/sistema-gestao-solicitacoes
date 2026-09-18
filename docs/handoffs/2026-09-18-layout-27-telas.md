# Correção da checagem geral de layout — 18/09/2026

## Escopo e estado

Branch `refactor/frontend`. Correção local concluída; commit e push
autorizados pelo usuário na continuação. Não houve acesso a EC2, RDS, deploy
ou alteração de dados. Preservar `outputs/`
como conteúdo preexistente não relacionado.

## Telas e alterações

- Unidades Comerciais: espaçamento, altura mínima e cor semântica alinhados à escala.
- Troca rápida de usuários: menu sem corte por `overflow` indevido; tabela de
  configuração com rolagem própria e colunas ajustáveis.
- Listas de solicitações: tamanho do indicador de retorno pendente alinhado ao token.
- Detalhe da solicitação de compra: tipografia dos blocos de compras alinhada aos tokens.
- Cartões / recarga: classificação da tabela com tipo explícito.
- DP/RH, transferências de obra: tipos e identidade das colunas declarados nas duas tabelas.
- Negociação de títulos, confirmação de entregas e entrega no pedido: campos de
  data consistentes em DD/MM/AAAA, preservando os valores ISO enviados à API.
  A prova local do pedido foi atualizada para digitar nesse formato, sem
  sobrescrever a captura anterior em `outputs/`.
- Prévia de importação do planejamento: primeira coluna sempre identifica a
  linha, tanto em custos quanto nos demais tipos de importação.
- Fila de Pagamentos: dimensões e tipografia alinhadas à escala; tabela da fila
  e prévia de comprovantes com rolagem própria e colunas redimensionáveis.
- Tipos de solicitação por destino: espaçamento de opção alinhado à escala.
- Responsáveis de obra: adicionada à cobertura da checagem de layout; não precisou
  de alteração visual.
- Troca rápida, Fila de Pagamentos e Tipos por destino também entraram no
  manifesto e no preview de telas. Novos tamanhos de coluna são reutilizáveis.

## Validações

- `node frontend/scripts/validarResponsividadeFrontend.mjs`: aprovado, 0 falhas.
- `npm run build` no frontend: aprovado.
- `git diff --check`: aprovado.
- `npm run test:pedido-entregas`: aprovado em navegador local, incluindo as
  larguras de 375, 700 e 1200 px.
- `npm run test:responsive`: a validação de layout e de navegação passou, mas a
  cadeia parou na varredura de cancelamento, que apontou dois casos fora deste
  ajuste (`RhDpJornada.jsx` e `SolicitacaoDetalhe/PedidoEntrega.jsx`). Não foi
  alterada a lógica dessas confirmações nesta tarefa.
- `npm run provas`: interrompido ao iniciar provas que exigem o Chromium
  empacotado do Playwright, que não está instalado nesta máquina. A prova
  específica de entregas usa o Chrome local e passou.

## Próximo passo

Revisar visualmente a Fila de Pagamentos e a configuração da troca rápida em
larguras de desktop e celular quando houver Chromium disponível. O deploy da
EC2 dev será executado somente pelo usuário; não há migrations nesta entrega.
