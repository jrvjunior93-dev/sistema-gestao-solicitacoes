# Fila: cheque de terceiro sem conta bancaria na baixa em massa

## Estado e escopo

Implementacao local autorizada pelo usuario em 2026-10-13. Base 310358a7,
checkout promocao-main-20261003, branch codex/pedido-boleto-opcional-refactor.
Sem delegacao, commit/push, EC2, migrations ou escrita em banco real. outputs/
contem artefatos QA nao versionados. Ownership liberado ao concluir testes.

## Mapeamento e mudancas

- Endpoint existente de baixa da fila e instrumentos, permissoes e escopo
  preservados. Carteira retorna apenas nome/ativo da empresa ja vinculada aos
  mesmos cheques disponiveis; nao consulta catalogo administrativo novo.
- paymentValidators: conta opcional somente quando instrumentos_lote CHEQUE
  contem exclusivamente carteira; empresa explicita apenas no componente
  carteira do grupo. Demais payloads continuam estritos, inclusive legado.
- pagamentoFilaLiquidacaoService: cheque/empresa ativa resolvidos sob lock;
  conta null para carteira e obrigatoria para proprio. Empresa existente nao
  pode ser sobrescrita; legado exige empresa explicita (snapshot, sem editar
  cadastro). Rateio existente e baixa canonica preservados.
- pagamentoManualFilaService: somente fonte do grupo interno validado permite
  nao carregar conta. Snapshot nullable e empresa da fonte; nenhum campo HTTP
  adiciona bypass. Estorno existente usa todos os movimentos e devolve a carteira.
- BaixaMassaFilaModal/ChequesParceladosFilaModal: banco apenas para proprios,
  carteira escolhida sem filtro pela conta de outro instrumento, empresa do
  documento identificada. Legado pede empresa, nunca selecao bancaria ficticia.
  Cache temporario de quantidade conserva carteira ao trocar banco do proprio.
- FinanceiroFilaPagamentos: valida/envia conta opcional so para lote exclusivo
  de terceiros; empresa do lote identificada pelos instrumentos, nao pela divida.
  Cancelamento, valores/encargos, mutex e confirmacao final preservados.

## Validacoes

- validarFilaLiquidacaoRateada: 1000 rateios; services reais sob modelos em
  memoria; carteira sem conta, entre empresas, legado explicito, empresa
  inativa/inexistente/trocada, lote misto, replay, rollback, estorno, ACL/fatura.
- validarFilaBaixaEstorno, validarFilaInstrumentos, validarFilaPagamentosManuais,
  validarCarteiraChequesBaixaComposta, validarAutorizacaoConsultaSql aprovados.
- validarFilaInstrumentosUI: tela real em desktop 1366 e celular 390 com APIs
  isoladas, sem banco; carteira/legado sem conta, proprio/misto, quantidade,
  cache, cancelamento, duplo clique, multicartao, estorno, colunas e preview.
- validarWorkspacePiloto --financeiro-only aprovado (rascunhos, filtros,
  conflitos/403, envio unico sem replay) em desktop/mobile, APIs isoladas.
- Build aprovado (avisos preexistentes Browserslist e chunk grande); capturas
  de carteira desktop/mobile revisadas. Documentacao e git diff --check aprovados.

## Proximo passo e limites

Commit e push em refactor/frontend autorizados pelo usuario nesta etapa;
validacoes focadas reexecutadas e aprovadas antes da publicacao. Nenhuma
migration nova; manter schema anterior de liquidacao compartilhada compativel.
Backend e frontend devem ser atualizados juntos em dev antes de homologar.
Homologar com carteira da mesma/outra empresa, cheque proprio, lote misto,
legado e estorno do grupo. Nunca ensaiar escrita em producao. Testes isolados
nao comprovam concorrencia MySQL entre processos nem dados reais da carteira.
Esta excecao de conta e exclusiva do conjunto da baixa em massa; demais fluxos
de baixa individual/composta permanecem no contrato anterior.
