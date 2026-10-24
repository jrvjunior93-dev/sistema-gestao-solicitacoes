# Vínculos manuais NF-e, pedidos e títulos — DEV

## Pedido autorizado

Implementar/testar para refactor/frontend, ainda sem commit/push/deploy: uma NF-e
em vários pedidos da mesma solicitação ou de solicitações diferentes, associação
a títulos existentes, preservando permissões/histórico/baixas parciais. Corrigir
também a disponibilidade da criação independente de títulos por pedido. Compras
gere os títulos; GEO envia depois à fila/autorização. Automático NSDOCS OFF.

## Mapeamento inicial e decisões

- FiscalDocumentLink já aceita múltiplas linhas para documento/pedido/título;
  fluxo genérico atual não impõe idempotência transacional desses vínculos.
- PedidoCompraTitulo, alocações e fretes representam vínculos efetivos, não
  inferir pertencimento por solicitacao_id, fornecedor ou valor apenas.
- PedidoCompraFinanceiro esconde formulário em pedido aberto. Exemplo do usuário:
  pedido25 ABERTO/Nao iniciado. Expor próximo passo de fechamento para Compras,
  respeitando permissão existente de alteração de status. Não pedir ação GEO.
- Há bloqueio concreto adicional: frete já titulado sozinho impede criar título
  de mercadoria; tratar elegibilidade por natureza, preservando antirrepetição.
- NF-e não exige mudança de saldos, vencimentos, baixas, fila ou autorização.

## Implementação concluída localmente

- fiscalPurchaseLinkDomain/Service/Controller: associação em lote com valor por
  pedido, parcelas verificadas e mesma NF-e em várias solicitações. Escopo/empresa
  conferidos; frete terceiro separado; referências tardias e por renegociação.
- Idempotência UUID por autor/conteúdo, revisão contra envio desatualizado,
  locks/transação, unicidade e eventos fiscais before/after. Erro de auditoria
  reverte o conjunto. Encerrar marca rejected e mantém os registros anteriores.
- Model FiscalDocumentLink e migration202610240002: duas colunas nullable e
  índice único. Adota vínculo legado compatível, preservando created_by e evento
  anterior; duplicidade legada ambígua não é resolvida automaticamente.
- Rotas fiscais existentes mantêm ACL. Compras usa a conferência nova para
  pedido/parcelas; formulário genérico/sugestão antigos direcionam para ela.
  Outros vínculos fiscais e registros antigos continuam consultáveis.
- VinculosNfe/fiscalApi/acessoProduto: componente reutilizado no pedido, NF-e e
  título; seleção múltipla, confirmação/motivo, retry com mesma chave, readonly
  por permissão, contexto desmontado ao trocar registro/usuário, XML assinado.
- pedidoCompraFinanceiroService: resumo identifica seu pedido; frete sozinho
  não impede gerar mercadorias. Seleciona tipo para elegibilidade fiscal.
- PedidoCompraFinanceiro: fechamento por Compras visível no modal, usando ação
  existente e useConfirmacao({ok}); cancelamento não altera status. Formulário
  aparece após fechamento. Gestão dos títulos permanece com Compras.
- PedidoResumo: recusa resposta financeira de outro pedido. Preservadas travas
  de repetição do mesmo pedido, avulsos não revisados e regras de reabertura.
- package scripts backend/frontend, fixtures SQLite e QA dedicados; sem novas
  dependências ou alteração de locks. Guia em NFE_VINCULOS_PEDIDOS_TITULOS_DEV.md.

## Validações

- 10 testes backend com SQLite real: múltiplos pedidos/solicitações, valor sem
  multiplicar por parcelas, baixa parcial/XML intactos, replay/concorrência,
  rollback, escopo/permissão, CNPJ, títulos alheios/frete/receber/cancelado,
  evidência em quitado, referência futura, renegociação e adoção de legado.
- Servico de geração real com fronteiras simuladas: dois pedidos da mesma
  solicitação criam títulos independentes, frete parcial preservado, retry e
  repetição no mesmo pedido; histórico e proteção de avulsos mantidos.
- validarPedidoBoletoOpcional, validarSobreposicaoTitulos,
  validarCompraEtapasResumoPedido, validarPedidoCompraFinanceiroGeo passaram.
- Chrome: seleção de três pedidos/duas solicitações, controllers reais + SQLite
  local, ACK perdido após commit/retry sem duplicar, múltiplos cliques, encerramento,
  consulta do título, leitura sem edição e fechamento Compras confirmar/cancelar.
  Desktop/mobile revisados visualmente; screenshots somente em outputs/QA.
- Regressão de emissão/histórico/XML aprovada nos três fusos. Auditoria granular:
  zero chaves inválidas/duplicadas/frontend-only de risco. Fila/estorno preservados.
- Build Vite completo aprovado; sintaxe de12 arquivos backend/migration/QA e
  git diff --check aprovados. Avisos existentes de tamanho de chunks/Browserslist
  não impediram o build; nenhuma atualização/instalação de dependências.
- validarFiscalDfeProcessor fixture passou. Guia operacional e README fiscal
  atualizados. As últimas palavras do cabeçalho explicitam que GEO envia para
  autorização/fila; gestão dos títulos é de Compras.

## Riscos, limites e próximo passo

Nenhuma escrita real, migration, restart, chamada NSDOCS/AWS ou alteração de
produção. SQLite usa mutex no harness, não comprova concorrência real MySQL.
Controllers são reais, autenticação/layout são adaptadores QA; homologar perfis
e acesso a XML no DEV após a liberação. Nenhuma permissão foi concedida.

Migration202610240002 está apenas preparada. Antes de rodar backend novo no DEV,
aplicar/conferir somente ela em roteiro dedicado com backup e identidade TLS/UUID
do DEV. Model novo requer colunas antes das consultas fiscais. Publicar frontend
somente após backend/schema; manter Nodes/PM2/ambientes/dumps existentes.

Usuário autorizou posteriormente commit/push e roteiro DEV com backend antes do
frontend. Publicação separada: commit backend/schema/QA/operador primeiro; commit
frontend preparado localmente e retido até a saída de conferência da EC2 DEV.
Base2830ccb5. Nenhuma alteração de main ou operação EC2 pelo agente.

CLI fiscalVinculosDevSchema.js dedicada ao schema novo: TLS/UUID antes de DDL,
lock, verificação de tipos/índice e ledger após estrutura, confirmação backupDEV.
Operador atualizar-dev-fiscal-vinculos-20261024.cjs autocontido para stdin,
manifesto backend exato, QA sem rede, snapshot privado, somente restart backend-dev.
Roteiro em ops/deploy/README-fiscal-vinculos-dev-20261024.md.
QA do deploy/migration:9 testes, incluindo SQL real gerado pelo Sequelize MySQL,
negação fora do alvo, outra migration pendente, TLS/UUID, ordem/retry e proteção
de ambientes/Nodes/processos/dumps. Ambiente inicial do DEV normaliza somente
contadores/telemetria PM2 conhecidos, sem excluir variaveis configuradas pelo
aplicativo; ambientes de producao e Experience continuam comparados integralmente.
Nenhum DDL ou restart real foi executado.

Próximo passo: usuário executa etapa backendDEV e envia FISCAL_VINCULOS_BACKEND_DEV_PRONTO.
Então publicar frontend já autorizado. Não reutilizar operadores anteriores nem
incluir ownership inteiro, diagnósticos Node ou outputs nos commits.
