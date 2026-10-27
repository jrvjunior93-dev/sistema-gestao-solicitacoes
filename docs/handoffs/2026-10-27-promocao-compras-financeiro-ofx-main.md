# Promocao Compras/Financeiro/OFX para main - 27/10/2026

## Autorizacao e base

Usuario autorizou migrar o filtro OFX e demais alteracoes pendentes para main,
com comandos para o operador atualizar producao, preservando PROD4096 e DEV.
Sem EC2 pelo agente, registros reais ou migrations. Refactor/frontend6701ee7b
conferida em DEV por saida OFX_NATUREZA_BACKEND_DEV_PRONTO do operador.
Main de origem46ac88de; branch local codex/promocao-compras-ofx-main-20261027.

Transposicao seletiva de nove arquivos backend e do frontend das seis frentes:
paginacao/detalhes SC, cartao repetido, sugestoes formas da fila, codigo da
solicitacao em titulos, filtros/visibilidade/retorno e natureza OFX. Nao e
merge integral DEV: NSDOCS manual DEV e telas fiscais exclusivas ficam fora.
Main ja contem o hotfix OOM de cotacoes, Vale e demais promocoes anteriores.

## Arquivos e publicacao em etapas

- Backend: SolicitacaoCompraController, solicitacoesCompraPaginacao,
  pagamentoFilaAutocompleteService, pagamentoFilaLiquidacaoService,
  tituloFinanceiroService, tituloSolicitacaoCodigoFiltro,
  conciliacaoBancariaService, financialValidators, paymentValidators.
- QAs novos: validarSolicitacoesCompraPaginacao, validarFilaFormasDisponiveis,
  validarTitulosSolicitacaoCodigo, validarFilaCartaoRepetido,
  validarConciliacaoNaturezaFiltro; harness validarOfxMatchesExclusivos atualizado.
- Frontend: tabela/hook/services Compras; modal CartoesRateadosFilaModal;
  FiltrosFilaPagamentos/ApropriacaoAutocomplete; PreferenciasContext;
  FinanceiroTitulos/Detalhe/Editar/useRetornoTitulos; FinanceiroConciliacao.
  QAs de tela correspondentes. Conteudo funcional identico ao DEV6701ee7b.
- Aplicador/teste/manifesto/README novos compras-financeiro-ofx-prod-20261027.
  Manifestos/aplicadores anteriores fechados nao sao alterados.
- Backend deve ser publicado primeiro com frontend de main46ac intacto.
  Frontend completo fica em commit LOCAL posterior, testado, para publicar
  apos PRONTO manual. Autorizacao de promocao ja existe; falta a conferencia
  tecnica da EC2, nao nova permissao funcional. Evitar UI nova com backend antigo.

## Verificacoes

21 QAs backend sob bloqueio de rede: SQL em SQLite efemero/VM/models ficticios,
contagem/escopo/paginacao, autocomplete, titulos e liquidacoes, permissoes,
idempotencia/replay, OFX, cotacoes, pedidos e cancelamento reversivel existentes.
Pagina/hook/services reais Compras, preferencias/retorno titulos desktop/mobile,
OFX novo/existente, cartoes e filtro da fila com HTTP inteiramente ficticio.
Testes de aplicador verificam manifesto fechado, snapshots PM2 reais simulados,
heap4096, transicao somente PROD, DEV/Experience/daemon/env/dumps, confirmacoes,
QA antes do restart e retomada. Build e documentacao integram a conferencia.

Nao houve teste MySQL/carga real nem EC2 pelo agente. Fixtures podem escrever
somente em memoria; nenhum registro no banco do sistema e alterado pelos testes
ou aplicador. Ao operar depois, usuarios continuam com suas gravacoes normais.
NSDOCS automatico OFF; planos/historico/46 notas/XMLs nao sao manipulados.

## Proximo passo exato

Operador executa preparar com SHA backend publicado e aplicar/conferir apos
backup/timer/janela conferidos, conforme README. Nao executar SQL/install,
migrations, PM2 save/update/resurrect/update-env ou reinicio DEV. Retornar PRONTO
com old_space4096 e preservacao confirmados; entao publicar commit frontend
posterior ja preparado. Nenhuma conciliacao/captura/cancelamento real faz parte
da homologacao deste pacote. Refactor/frontend permanece6701ee7b sem alteracao.

## Resultado local

21 scripts backend e13 testes do aplicador aprovados. UI real Compras,
preferencias3casos, titulos1366/390, OFX novo e exclusivo, cartoes1366/390 e
filtro de formas da fila aprovados. Uma execucao concorrente de UI antiga
disputou a porta local5173; repetida em serie apos liberar os outros testes,
passou sem mudar codigo funcional. Build frontend19.49s; avisos ja existentes
de Browserslist/chunks. Documentacao653MD/19canonicos e diff/sintaxe aprovados.
Arquivos funcionais selecionados devem coincidir byte a byte (LF) com DEV6701.
Antes do push, verificar manifesto contra blobs/nomes do commit backend e
frontend sem delta sobre46ac; depois preparar commit frontend separado local.
