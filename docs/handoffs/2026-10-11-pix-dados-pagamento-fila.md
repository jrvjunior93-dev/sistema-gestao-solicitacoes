# Pix Copia e Cola e dados completos na fila

## Escopo e impacto

Usuario pediu conferir capacidade das chaves Pix, inclusive sem seletor de
tipo, e modal de consulta para instrucoes extensas da fila de pagamentos.
Implementacao local na refactor/frontend; sem commit/push/main/deploy,
migration executada, acesso ao banco real ou transferencia financeira.

Mapa previo: beneficiaryData monta instrucoes de favorecido, solicitacao,
boleto ou observacoes; coluna dados e reordenavel/ocultavel pelas preferencias.
Consulta usa os dados que a fila ja entrega e nao adiciona endpoint/permissao.
Permissoes de baixa/importacao, selecao, rascunhos, juros/multa, comprovantes,
status e idempotencia permanecem intactos. Skill frontend-design aplicada ao
modal compacto/reutilizacao da casca operacional, sem redesenhar a fila.

## Auditoria Pix

- Backend utils/pix limita Copia e Cola a 8192; explicitamente COPIA_COLA
  aceita texto livre. Sem seletor, validadores de favorecido/frete inferem
  Copia e Cola por 000201; Compras/medicoes/RH aceitam campos longos diretamente.
- Cadastros de parceiros, favorecidos, Nova Solicitacao, titulo novo/editar,
  preparar Pix no FinanceiroCard, medicao, frete do pedido e telas RH auditados:
  sem maxLength curto em chaves, exceto os tres campos corrigidos abaixo.
  CPF/CNPJ e contatos de instrucoes NAO sao chaves Pix; limites preservados.
- Modelos TEXT: PaymentBeneficiary, Parceiro (3), RhColaborador,
  RhColaboradorPagamento (3), RhEventoRecorrente, Solicitacao,
  SolicitacaoCompra e ContratoMedicao. Migration existente expande 12 colunas,
  preserva indice MySQL por prefixo e e idempotente. Nao criada nova migration.
- Lacunas encontradas: PedidoCompraFinanceiro config.chave_pix e
  NovaSolicitacaoCompra detalhe.chave_pix/freteChavePix usavam maxLength 255.
  Corrigidos para constante frontend PIX_TEXTO_MAX (8192), mesmo limite backend.
- Producao: nao confirmado deploy/aplicacao da migration existente nesta tarefa.
  Confirmar preflight/schema somente leitura no ambiente antes de afirmar
  capacidade instalada. Nenhuma credencial ou URL bancaria foi acessada.

## Arquivos e comportamento

- frontend/src/utils/pix.js: constante de limite reutilizavel.
- PedidoCompraFinanceiro.jsx e NovaSolicitacaoCompra.jsx: tres limites maiores;
  handlers, campos obrigatorios, formas, favorecidos e envio mantidos.
- DadosPagamentoFila.jsx: acima de 120 caracteres ou mais de duas linhas,
  preview compacto de tres linhas e botao Ver dados completos. OverlayModal
  amplo/responsivo, textarea readOnly selecionavel e Copiar dados (instrucao
  inteira, inclusive rotulo Pix/Boleto); clipboard negado permite copia manual.
  Fechar/Escape/fundo, foco e rolagem de volta ao titulo. Sem edicao/envio.
- FinanceiroFilaPagamentos.jsx: integra componente apenas na coluna dados;
  detalhes dos colaboradores do reembolso mantidos.
- Scripts validarPixCopiaCola backend/frontend, validarFilaInstrumentosUI e
  novo filaDadosPagamentoQA.mjs: regressao/limite/UI com transporte isolado.

## Validacoes e proximo passo

- Backend test:pix-copia-cola: aprovado; 8192 e negativa 8193 no pedido,
  frete sem seletor, validadores/cadastros/modelos/indice/migration isolados.
- Frontend test:pix-copia-cola: aprovado; tres inputs extraidos por AST da UI
  real e handlers preservam 8192, preparar Pix/titulos reais desktop/mobile.
- Frontend test:fila-instrumentos-ui: aprovado; novo modal desktop/mobile,
  clipboard simulado (inclusive negativa), texto inteiro, Fechar/Escape/fundo,
  foco/rolagem/valores/selecao intactos, consulta sem baixa; colunas/preview,
  instrumentos, juros/multa e baixa em massa existentes aprovados.
- Capturas desktop/mobile inspecionadas visualmente; outputs fora do Git.
- Build/documentacao/diff aprovados. Build mantem avisos preexistentes de
  Browserslist desatualizado e chunk acima de 500 kB; sem alterar dependencias.
- Falhas de teste corrigidas: middleware do fixture nao pode interceptar seu
  proprio modulo JS; autoFocus do textarea exige restaurar disparador explicito.
  Nenhuma mudanca na casca global de modal.
- Commit/push autorizado pelo usuario em 2026-10-11 na refactor/frontend,
  junto de motivos de ajuste e interacoes. Pix backend/UI, fila, build/docs/diff
  revalidados antes da publicacao. Auditoria financeira e outputs excluidos.
- Proximo: homologar dev e conferir migration Pix existente no ambiente.
  Sem banco, deploy ou promocao para main.
