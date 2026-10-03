# Negociação e parcelamento de títulos — implementação local

## Estado em 18/09/2026

Implementado no worktree `C:\Fluxy-refactor-frontend`, branch `refactor/frontend`.
Sem commit, push, migration aplicada, alteração em banco externo ou deploy.
Build e testes locais passaram. Homologação integrada em MySQL REAL ainda é obrigatória
antes de liberar em produção; os testes transacionais usam repositório simulado.

## Decisões do usuário

- Parcelar um título e negociar vários títulos a pagar/receber do mesmo parceiro.
- Somente saldo restante; baixas anteriores preservadas; encargos únicos em R$ ou %.
- Um novo título por vencimento, com rateio entre as obras e origens.
- Incluir títulos vinculados a contratos, pedidos e solicitações nesta entrega.
- Mesma empresa/tipo/parceiro na negociação; não misturar contas a pagar e receber.

## Comportamento implementado

- `Parcelar` na linha; `Negociar selecionados` para 2 a 100 títulos compatíveis.
- Permissão `financeiro.titulos.renegociar`; 1 a 120 parcelas mensais sugeridas,
  datas e valores editáveis; confirmação exige prévia válida e aceite explícito.
- Domínio usa centavos e BigInt para percentuais; distribuição fecha por parcela,
  obra, principal, juros e multa, incluindo resíduos de um centavo.
- Novos títulos ABERTO; originais RENEGOCIADO com saldo zero e valor baixado anterior
  intocado. A negociação não cria movimento bancário nem baixa fictícia.
- Chave de idempotência persistida, snapshot/hash da prévia, locks e transação.
  Repetir a mesma confirmação retorna o acordo existente; mudanças exigem nova prévia.
- Vínculos permanecem no título original. Uma projeção de leitura resolve o saldo e
  as baixas das parcelas novas para pedido, solicitação e contrato de origem.
- Pagamento parcial, quitação e estorno atualizam os sincronizadores existentes de
  pedido, contrato comercial e medição. Cronograma assinado não é reescrito.
- Estorno composto sincroniza apenas após atualizar todos os títulos do grupo.
- Guardas no modelo e triggers protegem originais e valores/rateios das novas parcelas;
  editar/excluir/reabrir original não pode duplicar o saldo transferido.
- Baixa nova verifica também retorno à Obra em qualquer título original.
- Fluxo de caixa, analítico, Financeiro de Obras, Resultado de Obras, endividamento
  e DRE usam rateios da negociação. DRE conserva a competência do principal original
  e soma somente encargos novos na competência da negociação.
- Baixas realizadas exibem a parcela do movimento por origem; estorno do movimento
  negociado é realizado no detalhe do título para conferir seu valor integral.
- Histórico no título permite navegar entre origens e parcelas novas.

## Restrições explícitas desta versão

Não renegocia novamente um título já pertencente a acordo. Não há desfazer acordo.
Bloqueia cobrança/boleto ativo, pagamento em andamento ou fila pendente até
regularização. Também bloqueia títulos com cartão/fatura/recarga, retenções,
intercompany/transferência interna, fechamento de RH e financiamento bancário:
esses módulos têm cronogramas/obrigações próprios não integrados a este acordo.
Títulos vinculados a pedidos, solicitações comuns, contratos comerciais e contratos
de medição NÃO são bloqueados simplesmente por terem esses vínculos.
Exige acesso a todas as obras para negociar/abrir/baixar um título consolidado;
relatórios podem exibir apenas a fatia de obra autorizada.

## Arquivos do escopo

Novos:
- `backend/migrations/202609180002_titulos_renegociacao.js`
- `backend/src/models/TituloRenegociacao{,Alocacao}.js`
- `backend/src/services/tituloRenegociacao{Domain,Service,Protecao,Leitura,Baixas,Vinculos,Sincronizacao}.js`
- `backend/src/controllers/TituloRenegociacaoController.js`
- `backend/scripts/validarTituloRenegociacao{Domain,Service,Vinculos,Sincronizacao,Migration}.js`
- `frontend/src/components/financeiro/TituloNegociacao{Modal,Historico}.jsx`
- `frontend/scripts/validarTituloNegociacaoModal.mjs`

Alterados:
- Modelo `TituloFinanceiro`, registro de modelos, rotas, registro de permissões,
  `authorizationService`, `financialValidators`.
- `tituloFinanceiroService`, `tituloFinanceiroRelatorioPdfService`,
  `relatorioFinanceiroService`, `ResultadoObrasController`.
- `comercialService`, `contratoFluxoNovoService`, `medicaoContratoService`,
  `pedidoCompraFinanceiroService`, `solicitacaoFinanceiroStatusService`,
  `chequeTerceiroService` (estorno composto).
- `FinanceiroTitulos.jsx`, `FinanceiroTituloDetalhe.jsx`, `FinanceiroBaixas.jsx`,
  `frontend/src/services/financeiro.js`.
- Fixtures `validarFinanceiroObrasComprometido.js`, `validarResultadoObrasHistorico.js`,
  ownership e este handoff.

## Validações executadas

- Cinco scripts novos de backend: domínio/proteção; serviço/idempotência/rollback;
  rateio e vínculos com instâncias Sequelize; sincronizadores reais de pedido,
  contrato comercial, medição e solicitação usando modelos em memória; migration
  estrutural/idempotente com SQL capturado e guarda do runner real.
- Testes existentes: `validarFinanceiroObrasComprometido`,
  `validarFinanceiroObrasSemLimite`, `validarResultadoObrasHistorico`,
  `validarFinanceiroObrasPdf`, `validarRelatorioFinanceiroPeriodo`,
  `validarPedidoCompraFinanceiroGeo`, `validarCompetenciaDreCriacaoTitulo`.
- Modal em Chrome headless, 390 e 1366 px: sem overflow da página, edição invalida
  confirmação, aceite obrigatório, retry com mesma chave, links do resultado.
  API simulada, acesso externo bloqueado. Capturas em `outputs/renegociacao/`.
- Build com `npx vite build --logLevel error`, sintaxe JS e `git diff --check`.

## Pendências de homologação e riscos

- NÃO houve execução dos triggers, migration ou testes de concorrência em MySQL real.
  Docker está instalado, porém daemon local não estava disponível. Não substituir
  esse teste por conexão automática em dev/produção.
- Migration estritamente estrutural; requer privilégios CREATE TRIGGER. Aplicar pelo
  runner protegido e conferir migrations pendentes ANTES de reiniciar backend.
- Locks de negociação e baixas preservam atomicidade; operações concorrentes em
  diferentes parcelas podem resultar em deadlock e rollback. Homologar duas sessões
  simultâneas e nova tentativa. Não há promessa de ausência de deadlock/retry automático.
- Validar pagamentos reais nos caminhos manual, composto, bancário/retorno e estorno,
  além das leituras dos contratos/pedidos na interface. Teste simulado não valida banco,
  integrações bancárias, permissões do usuário real ou ambiente EC2.
- Diagnóstico de cadastros/DRE e telas bancárias que listam títulos físicos continuam
  sujeitos às restrições existentes; esta alteração não redesenha esses módulos.

## Próximo passo exato

Com autorização de publicação, revisar/stagear APENAS o escopo acima e repetir
testes/build. Commitar/publicar `refactor/frontend` e entregar ao usuário os comandos
de migration/deploy DEV. Homologar casos avulso, multiobra, pedido parcial, contrato
comercial, medição, baixa/estorno e dupla confirmação em MySQL antes de cogitar main.
Não executar deploy automaticamente. Não afirmar homologação EC2 já realizada.

## Alterações preexistentes a preservar

Correção Cards/comentário de cotação ainda não commitada, seu script/handoff,
`docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e outputs anteriores.
Não incluir esses arquivos por acidente no commit da negociação.
