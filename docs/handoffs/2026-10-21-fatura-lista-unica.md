# Lista unica da fatura de cartao - 2026-10-21

## Pedido e limites

Usuario autorizou unificar as listas na refactor/frontend, exibindo todos os
titulos com data da compra, parcela e valor nesta fatura, sem duplicar valores
nem alterar regras financeiras ou producao. Agente unico, sem delegacao.
Trabalho local no checkout `codex/permutas-obras-case-20261020`, baseado em
refactor/frontend `93f75d67`. Nenhum commit/push/deploy solicitado nesta etapa.
Publicacao deste delta na refactor/frontend autorizada pelo usuario apos a
implementacao. Roteiro especifico DEV e teste estatico das guardas adicionados:
sem instalacao/dependencias/DDL/reinicio, confira PM2/watch/caminho/branch/SHA,
clean, hash .env, schema readonly e backend runtime identico a base.
Guardas/Node/Bash/unidade/backend/build/docs/diff repetidos e aprovados.
QA de UI deve rodar apos o build: execucao concorrente disputa os arquivos
dist/assets usados pelo harness e pode dar ENOENT de CSS; nao e erro da tela.
UI1366/390 repetida sequencialmente e aprovada antes da publicacao.
Delta anterior do relatorio de permutas preservado; nao mistura-lo sem revisao
em eventual publicacao. `outputs/` contem arquivos privados e nao deve ser staged.

## Mapa de dependencias antes da mudanca

- Leitura: servico frontend `getFaturaCartaoFinanceiro` continua consumindo a
  mesma resposta: `titulos` diretos e `compras_rateadas` (movimentos da fila
  e parcelas ativas). Backend nao modificado nesta tarefa.
- Baixa: `baixarFaturaCartaoFinanceiro`, permissao `financeiro.cartoes.baixar_fatura`,
  conta/data/observacoes, confirmacao, processingRef, conflito de rascunho e
  revisao de dados intactos. Nao converter linhas da tabela em payload de baixa.
- Total oficial vem de `fatura.valor_total`; saldo/contagem/status conservam
  os helpers anteriores. Nenhuma nova soma financeira no runtime da pagina.
- API filtra/autoriza os registros; a projecao nao consulta outros titulos nem
  amplia escopo ou permissoes. Sem anexos, migrations ou dados reais.

## Arquivos e escolhas

- `frontend/src/pages/FinanceiroFaturaCartaoDetalhe.jsx`: unica TabelaPadrao,
  conserva status/vencimento/saldo, adiciona compra/parcela e renomeia valor
  para Valor nesta fatura. Celular usa o mesmo componente responsivo existente.
- `frontend/src/utils/faturaCartaoItens.mjs`: projecao pura, sem mutacao do
  payload. Valores diretos/originais e valores das partes nao se confundem.
  Identidade por origem e entidade, nunca somente por titulo: duas partes
  legitimas do mesmo titulo continuam visiveis; transporte repetido da mesma
  entidade e exibido uma vez. Campos ausentes nao recebem valores inventados.
- Nova chave de preferencia de lista evita herdar colunas ocultas antigas.
- `frontend/scripts/validarFaturaItensUnificados.mjs`: unidade sem rede/banco.
- `frontend/scripts/validarFaturasWorkspace.mjs`: tela real com API em memoria,
  chama unidade e testa mistura de vinculos/Monday/parcelas/rateios.
- README Financeiro e controles workspace atualizados.

## Validacoes executadas

- Unitario: legado 2/6 + duas compras Monday 1/1 + parcela 2/3 + dois movimentos
  distintos para mesmo titulo; soma em centavos esperada, zero, ausencias,
  IDs que nao colidem e duplicata de transporte; payload congelado imutavel.
- UI real 1366/390: lista unica, ambos Monday uma vez, valor da parcela 33,34
  em vez dos 1200 do titulo, partes legitimas preservadas, titulo distinto
  contado uma vez, consulta sem escrita, snapshot inalterado e sem overflow.
  Consulta sem permissao de baixa mantem lista e nao oferece formulario;
  falha de leitura limpa os dados. Capturas locais inspecionadas visualmente.
- Regressao Faturas Workspace: busca/origem, aba auxiliar, rascunho preservado,
  conflito de saldo/status, dupla submissao/confirmacao com unica baixa mock,
  fatura de rateios paga nao oferece outra baixa; desktop/mobile aprovados.
- `node backend/scripts/validarCartaoParcelamentoBaixa.js`: aprovado, memoria
  isolada; centavos/encargos, parcial, ACL, replay, debito, estorno e rollback.
- `node frontend/scripts/validarCartaoParcelamentoUI.mjs`: aprovado desktop/mobile,
  fila/detalhe/modal amplo, retry/duplo clique e permissoes; rede externa bloqueada.
- `npm run build` em frontend: aprovado. Avisos preexistentes de Browserslist
  desatualizado e chunks grandes; nenhuma atualizacao de dependencia realizada.
- Navegacao e abas internas aprovadas; catalogo gerado sem delta.
- `npm run test:docs`:589 Markdown/19 canonicos aprovados; `git diff --check`
  e Node check dos novos modulos/testes aprovados.
- Verificador geral de layout nao fica verde: baseline HEAD da tela tem127
  violacoes no repositorio; tela atual reduz para125. Baseline lida por
  `git show` e substituida somente em memoria na execucao do mesmo verificador,
  sem reset/checkout/escrita. As duas R17 removidas pertenciam a tabela antiga
  de parcelas sem tipo; nenhuma falha atual nesta tela. Demais violacoes fora
  do escopo nao foram alteradas ou dispensadas.

## Riscos e proximo passo

Sem alteracao de backend financeiro, ACL, historico, total oficial ou deploy.
Validacao em dispositivo fisico e nos dados reais permanece para homologacao
do operador no DEV apos publicacao autorizada. Conferir a fatura com os titulos
Monday, mais uma parcelada e uma antiga, sem repetir baixas reais apenas para
testar exibicao. Sem necessidade de migration.

Docs/diff finais aprovados, ownership liberado. Aguardar pedido de publicacao;
nao acessar EC2. Nao promover main/producao sem novo pedido.
