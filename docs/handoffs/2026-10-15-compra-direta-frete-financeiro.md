# Compra Direta: sincronizacao financeira do frete - 2026-10-15

## Autorizacao e escopo

Proprietario confirmou: embutido atualiza titulo aberto sem baixa; se pago,
gera complemento; terceiro gera separado sem duplicidade. Substitui apenas a
regra de preservar titulos para FRETE. Quantidade continua sem ajuste financeiro.
Branch local `codex/compra-direta-frete-financeiro-20261015`, sem delegacao.

## Implementacao

- Novo `backend/src/services/compraDiretaFreteFinanceiroService.js`, chamado
  apos autorizacao/locks do `compraDiretaGestaoService.js` na mesma transacao.
  Alteracao por delta, parcelas/rateios com centavos exatos, complemento para
  pago/parcial, terceiro separado, cancelamento de frete nao pago, fila sem
  baixa sincronizada, auditoria e status parcial para solicitacao antes PAGA.
- `tituloFinanceiroService.js` valida geracao inicial/revisao sob locks e
  bloqueia regeneracao do fornecedor. `financialValidators.js` permite marcador
  booleano validado no servidor contra dados da compra. Nao confia em valor,
  credor, forma, favorecido ou identificador de titulo fornecido pelo cliente.
- `FinanceiroCard.jsx` omite frete existente do formulario e total a gerar,
  bloqueia regeneracao, recarrega lista apos revisao do frete; modal aberto
  continua preservado. `CompraDiretaFreteForm.jsx` informa novo comportamento.
- Permissoes gerais nao ampliadas. Acao exige gerenciar_frete, leitura/escopo,
  interacao no setor atual e modulo habilitado, com bypass existente preservado.
- Sem schema, dependencias, .env, flags, banco real, EC2, commit/push ou deploy.

## Restricoes de seguranca

Pagamento/baixa existente nunca e sobrescrito. Reducao de pago exige acerto
financeiro. Edicao de titulo protegido por renegociacao, cartao/fatura, retorno,
impostos/desconto, cobranca/cheque, integracao, autorizacao ou conferencia da
fila e recusada. Credor legado ambiguo nao e inferido. Terceiro automatico
sem base de classificacao nasce sem categoria/DRE; conferir no Financeiro.
Novos titulos nunca sao automaticamente enfileirados ou pagos.

Lock da compra serializa edicao e geracao inicial; locks de titulos protegem
contra baixa concorrente. Fluxos antigos de baixa usam ordem inversa de
solicitacao/titulo: eventual deadlock reverte pelo InnoDB e a edicao retorna
conflito amigavel para reabrir, sem retry cego. Homologar concorrencia real em dev.

## Validacoes

- `node backend/scripts/validarCompraDiretaGestao.js`: services reais de compra,
  frete e saldo de fila, models transacionais em memoria; aberto, pago, parcial,
  movimento ativo, parcelas/rateios, PIX/boleto, repeticao, edicoes simultaneas,
  protecoes/ACL, rollback e corpo forjado.
- `node backend/scripts/validarCompraDiretaFreteFinanceiro.js`: service canonico
  de titulo + novo service + validator reais; geracao completa ou somente
  fornecedor, replay e revisao obsoleta. Sem models reais/.env/rede.
- Regressao: validarCartaoOpcionalSolicitacao, validarAdiantamentoFinanceiro,
  validarCompraDiretaGeoAcesso, validarRhAdmissaoCatalogo,
  validarComprovantesTitulosSolicitacao aprovados com adaptadores isolados.
- UI real com API em memoria: validarCompraDiretaGestao.mjs e
  validarTituloSolicitacaoAtualizacao.mjs normal e `--frete`, desktop/mobile.
- Frontend build aprovado (590 modulos); avisos preexistentes Browserslist/chunk.
- Documentacao valida (536 Markdown / 19 canonicos), auditoria de permissoes
  (393, nenhuma chave invalida/duplicada/risco somente frontend), sintaxe e
  diff aprovados. Seguranca de acesso direto: 2304 comparacoes de visibilidade,
  66 casos de escopo, autenticacao/token/troca e 47 rotas HTTP, sem banco/rede.
- Ownership de edicao liberado no encerramento local; nao commitado/publicado.

## Publicacao DEV autorizada

Usuario solicitou commit/push na refactor/frontend e comandos de atualizacao
EC2 dev. Base remota conferida: d72a9c9372dd33cbdf342b922d0a59534a472456.
Transportar somente este delta para a refactor, sem commits exclusivos da main.
Ownership de edicao liberado apos validacoes para publicacao autorizada.

Novo script `ops/deploy/atualizar-dev-frete-financeiro-20261015.sh`: checkout
dev/refactor limpo, ancestral d72a9c93, npm ci, sintaxe/testes, PM2 backend-dev
unico/caminho dev/8001, ambiente development, host/UUID/banco staging e schema
somente leitura antes do restart exclusivo backend-dev; health 8001 depois.
Comparacao semantica de flags/defaults aceita AUSENTE vs false sem sobrescrever
valores, e bloqueia divergencia funcional. Nenhuma migration/seed/backfill.

`validarDeployFreteFinanceiroDev.js` executa os blocos reais em memoria com
positivas/negativas de PM2/processo/porta/ambiente/flags/identidade/schema/health.
Bash -n, testes backend/regras financeiras/ACL, UI desktop/mobile e build
revalidados na publicacao. Nao houve execucao de EC2 ou banco real pelo agente.

Depois do push, operador executa o script no checkout dev e aguarda a Vercel
de refactor-dev. Homologar especialmente concorrencia MySQL com baixa,
classificacao, parcelas/rateios e fila. Producao nao foi alterada.

Transporte para a base dev concluido: conflitos somente nos quatro registros
workspace, mantendo os registros da refactor e adicionando apenas esta tarefa;
historico/documentos exclusivos da main nao foram importados. Runtime identico
ao candidato validado. Testes focados/script/Bash/diff reaprovados; documentacao
da base dev: 521 Markdown / 19 canonicos. Demais checkouts e outputs preservados.
