# Publicacao do pacote financeiro/compras no DEV

## Autorizacao / escopo

Usuario autorizou commit/push de todos os ajustes implementados pendentes na
refactor/frontend e comandos para atualizar somente EC2 DEV. Nunca acessar EC2
diretamente nem promover main/producao nesta tarefa.

Base remota conferida por fetch:39f368bed941592c565181243b058160ba32d500.
Branch de trabalho isolada codex/fila-multiplas-fontes-20261018, mesma base.
O checkout local antigo de refactor/frontend nao foi alterado; publicacao do
HEAD validado diretamente para a referencia remota, sem force.

## Conteudo

- Multiplas fontes na fila, transacao/ledger/carteira/estorno e permissoes atuais.
- Compras e Compra Direta nas telas proprias para Centros de Custo, sem mudar
  o catalogo/tipo fixo da Nova Solicitacao nem o escopo de acesso do usuario.
- Cancelamento individual com motivo, permissao propria, trilha permanente,
  idempotencia/versao e protecao de pagamentos/operacoes/vinculos especializados.
- Inventario de datas regenerado (1828 fontes/2274 conversoes, zero erros);
  nenhuma padronizacao global ou correcao automatica de dados historicos.
- Metricas/documentacao da nova permissao atualizadas:19grupos/111areas/397chaves.
- Nao incluir outputs, dados/planilhas da auditoria ou handoff privado da analise.
  Ownership local da auditoria continua fora deste commit. Observacoes exclusivas
  da criacao do titulo ainda nao implementadas, conforme adiamento anterior.

## Validacoes do conjunto

- Backend test:fila-multiplas-fontes e test:titulo-cancelamento aprovados.
- Compras/centros,14 cenarios de acesso, desvinculacao de fatura, cartao/fila,
  guardas de deploy e documentacao aprovados. Nova rota contabilizada na
  matriz granular; nenhuma concessao gravada.
- Frontend test:fila-multiplas-fontes, test:titulo-cancelamento e
  validarTituloCompras.mjs aprovados em desktop/mobile com transporte simulado.
- npm run build completo (inclui catalogo de navegacao), test:navegacao,
  test:mapa-datas/reprodutibilidade e git diff --check aprovados.
- Teste antigo validarCompraDiretaFrete.js possui marcador de UI obsoleto
  preexistente; nao e correcao deste pacote. Detalhes no handoff de compras.
- MySQL real nao acessado pelo agente. Roteiro DEV inclui SELECT/EXPLAIN em
  transacao READ ONLY/rollback com identidade/UUID DEV conferidos pelo script.
- Bash -n e validarDeployFinanceiroDev20261019.js aprovados. Nenhuma migration
  nova neste diff. Dependencias lockfiles sem mudanca; manter npm ci --omit=dev.

## Atualizacao / homologacao

Roteiro ops/deploy/atualizar-dev-financeiro-20261019.sh recebe SHA completo do
commit publicado. Antes de merge verifica caminho dev, branch, checkout sem
alteracoes rastreadas, lock de deploy, PM2 exclusivo backend-dev/8001/watch off,
identidade MySQL DEV, flags, schema e sessao12h. Qualquer pendencia interrompe.
Instala dependencias, repete verificacoes, executa suites locais e MySQL somente
leitura; reinicia apenas backend-dev, preservando seu ambiente, e exige health200.
Sem editar .env/PILOT, rodar migrations, reiniciar outro processo ou operar main.

Homologar no DEV:

1. Multiplas fontes:PIX+dinheiro/duas contas, valores por fonte, parcial com
   justificativa, permuta/debito/carteira integral; conferir movimento/saldo/
   historico/comprovante, retry sem duplicar e estorno de todo o grupo.
2. Compras:abrir as duas telas diretamente, selecionar Administrativo Escritorio,
   criar/revisar, conferir GEO; Nova Solicitacao permanece com tipo fixo. Repetir
   com usuario sem acesso ao centro e sem permissao de criar:negado.
3. Cancelamento:conceder financeiro.titulos.cancelar ao operador DEV de teste,
   cancelar manual PAGAR/RECEBER sem baixa, motivo/autor/data, filtro Cancelado,
   saldo0, anexos preservados e nenhum pagamento novo. Sem a chave, sem acao.
4. Tentar cancelar quitado/parcial/na fila/autorizado/fatura:deve bloquear.
   Duplo clique/retry idempotente; titulo cancelado nao entra na fila nem baixa.
5. Cartao credito e encargos continuam no fluxo proprio; passkey/PILOT e
   demais parametros preservados. Nao homologar escrevendo em producao.

Proximo passo apos push:entregar SHA/comandos ao usuario. A execucao EC2 e
os testes manuais DEV sao responsabilidade do operador, sem acesso remoto do agente.
