# Medicao: vinculo legado, status de fila e acompanhamento Financeiro

## Evidencia e pedido

Conferencia do usuario no DEV: SOL-1978/ID2011, CT-0003/parcela10,
TIT-000194/ID190 com solicitacao_id=NULL, status ABERTO e interno
ENVIADO PARA PAGAMENTO; fila16 PENDENTE. A fila existia, mas a solicitacao
continuava LIBERADO/OBRA. Nao reenviar, criar outra fila ou autorizar de novo.

Pedido complementar: registrar a passagem da solicitacao pelo Financeiro e
devolve-la a Obra para novas medicoes. Financeiro acompanha pelo historico e
permissoes existentes, sem adquirir edicao fora do setor responsavel.

## Implementacao

- tituloSolicitacaoContratoService: resolver somente leitura dos vinculos
  faltantes atraves de ContratoParcela/Contrato fluxo_novo. Exige contrato
  unico, solicitacao existente e mesma obra no titulo/contrato/solicitacao.
  Vinculo direto nunca e substituido; titulos avulsos seguem sem vinculo.
  Associacao contratual ambigua/divergente bloqueia a operacao com 409.
- analiseProprietarioService: analise e rejeicao atualizam a solicitacao dona
  tambem quando o titulo antigo nao possui FK. Nao substitui decisao digital.
- pagamentoManualFilaService: apenas os novos envios resolvem/persistem FK
  ausente, com historico/auditoria na transacao. Isso permite que a baixa e
  os comprovantes futuros usem a solicitacao correta. Filas ja existentes nao
  sao reenviadas nem regularizadas pelo replay. Dossie converge antes da FK;
  snapshots/decisoes originais nao sao reescritos.
- solicitacaoFinanceiroStatusService: somente solicitacoes de contratos do
  fluxo novo, no envio a fila, registram Financeiro e retornam OBRA na mesma
  transacao, com dois ENVIADA_SETOR e StatusArea do Financeiro. Status global
  permanece ENVIADO PARA PAGAMENTO. Titulos avulsos/recarga preservam destino
  existente; aprovar medicao continua retornando OBRA/LIBERADO.
- DTO de parcelas inclui status_interno_pagar do titulo real. UI de parcelas
  e ModalMedicao mostram ABERTO/PARCIAL separados de Na fila/Não pago/
  Divergente/Em analise. Nao inferem quitacao da aprovacao nem da fila.
  Rodape explica fila existente; botoes continuam desabilitados para reenvio.

## Impacto ao promover para producao

Backend e frontend precisam ser publicados juntos. Nao ha migration nova,
seed, backfill automatico, chamada no startup, alteracao de valores, baixa,
movimentos de cartao/cheque ou nova permissao. Visibilidade continua sujeita
a grants, setor e escopo de obras da configuracao atual.

O deploy por si so nao modifica registros. Nas proximas operacoes autorizadas:
analise/rejeicao passa a encontrar a solicitacao pelo contrato; novo envio a
fila registra FK faltante, o status e a passagem Financeiro -> OBRA com
auditoria. Um erro reverte tudo na mesma transacao. O titulo continua ABERTO
ate baixa; mudar apenas seu status financeiro para ENVIADO seria incorreto.

Vincular a solicitacao corrige identidade/associacao nas consultas futuras;
nao recalcula valores, juros, multa, rateios ou custos. As classificacoes de
origem/filtros por solicitacao podem passar a reconhecer o titulo antes
tratado como avulso. Essa e uma consequencia intencional do vinculo correto.
Nao prometer que todos os relatorios/contagens por origem ficarao identicos.

Registros antigos ja enfileirados so mudam por reconciliacao explicita depois
da conferencia. Nao aprovar medicao novamente nem reenfileirar para corrigir.
Baixados, parciais, filas processadas/divergentes, vinculos ja preenchidos e
dossies ainda PENDENTE/AUTORIZADO estao fora do reparo automatico preparado.
Comprovantes antigos nao sao copiados por esta rotina; sua reconciliacao e
separada. Para baixas futuras, o vinculo preenchido permite historico normal.

## Reconciliacao preparada (nao executada em banco real)

Script: backend/scripts/reconciliarVinculosTitulosContrato.js.
Padrao somente leitura, paginacao limitada a 100, ou --titulo-ids explicitos.
Saida: IDs, vinculo atual/destino, fila, status, setor de registro, setor final,
motivo, cursor e SHA256 da conferencia. Exemplo de leitura apos publicar DEV:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
node scripts/reconciliarVinculosTitulosContrato.js --somente-leitura --titulo-ids=190
```

ID190 e exemplo exclusivamente DEV; nao reutilizar esse ID na producao.
Identificar titulos de producao por nova conferencia do ambiente correto.
DEV e producao possuem o mesmo DB_NAME, portanto conferir HOST+PORT+DB_NAME,
nao somente nome do banco (staging e producao usam RDS distintos).

Aplicacao exige --aplicar, --titulo-ids, --confirmacao exata da leitura,
--usuario-id de SUPERADMIN ativo e opt-in
ALLOW_CONTRACT_TITLE_LINK_RECONCILIATION=true somente no comando explicitamente
autorizado. Nunca deixar essa flag persistente no .env nem anexar aplicacao
ao deploy. Antes de escrever em producao: confirmar backup/Drive cifrado,
timer ativo e aprovar o recorte/efeitos mostrados. Nao executar nesta etapa.

O recorte seguro e titulo sem FK, ABERTO, saldo positivo, sem baixa, fatura ou
renegociacao, uma fila ativa PENDENTE ainda nao processada, contrato unico
do fluxo novo e mesma obra. Sem dossie pendente/autorizado para evitar mudar
material de uma decisao em curso. Somente FK/estado interno e historicos;
nao altera fila/baixas/snapshots. Status/setor da solicitacao sincronizam
apenas de LIBERADO/EM ANALISE/ENVIADO PARA PAGAMENTO, sem medicao ou pedido
de retorno PENDENTE/APROVADO. Outros fluxos preservam status e setor.
Revalidacao com locks e assinatura na transacao; dados mudaram => rollback.
Replay com assinatura antiga recusa; conferencia nova de vinculo ja regular
retorna zero alteracoes e nao duplica historico.

Rollback de codigo nao desfaz dados legitimamente gravados por operacoes ou
reconciliacao; nao executar SQL de desvinculacao em massa. Se necessario,
investigar auditoria e preparar reparo pontual autorizado.

## Arquivos / validacao local

Servicos: analiseProprietarioService, pagamentoManualFilaService,
solicitacaoFinanceiroStatusService, contratoFluxoNovoService,
tituloMedicaoEnvioDomain; novos tituloSolicitacaoContratoService e
tituloContratoReconService. UI: PrevisoesContrato, ModalMedicao e
envioTitulosPagamento. Scripts: nova reconciliacao/validacao de vinculos;
fixtures ajustadas em validarAnaliseProprietario, validarCartaoOpcionalSolicitacao,
validarFilaComprovantePendente, validarMedicaoRecargaFluxoPagamento e teste UI.

- validarVinculosTitulosContrato: caso informado, leitura sem escrita,
  opt-in/assinatura/ator, auditar/rollback, conflitos/obra, replay, concorrencia,
  medicao e retorno pendentes, acompanhamento real no detalhe/anexos e Obra.
- test:medicao-recarga-envio: aprovacao, recarga/relatorios, permissao,
  convergencia direta/digital, titulo legado, snapshot original e replay.
- test:medicao-recarga-envio-ui: componentes reais, APIs simuladas,
  status operacional, permissoes, retry/duplo clique, desktop/mobile.
- test:fila-juros-multa, test:fila-instrumentos,
  test:fila-comprovante-pendente; acompanhamento GEO e acesso a anexos/fila.
- Build frontend aprovado, avisos antigos Browserslist/chunks preservados.
  Capturas desktop/mobile inspecionadas em outputs/ (fora do Git).

## Proximo passo

Homologar no DEV, publicar somente quando usuario pedir commit/push. Antes
de main, comparar dependencias de c75fc396/a3ab0dec e promover o pacote
Financeiro/Medicao de forma isolada: nao incluir a implantacao DP118209c0
adiada pelo usuario. Nao fazer merge integral da refactor/frontend por
conveniencia. Rever diff, testes e backup antes de promocao/deploy.

Estado desta etapa: alteracoes locais, sem commit/push/main/deploy, sem
migration ou acesso/escrita no banco real. Reconciliacao real pendente.

## Publicacao DEV autorizada

Usuario autorizou commit/push somente na refactor/frontend e comandos da EC2
DEV. Base local/remota conferida: a3ab0dec1c771108024552855215944a6b7beee9.
Pacote funcional completo revisado; outputs/ excluido. Revalidacoes de
vinculo, medicao/recarga/analise, juros/multa/instrumentos, comprovantes,
documentacao e UI reais com APIs simuladas aprovadas antes da publicacao.

Atualizacao deve fixar o SHA publicado, exigir branch refactor/frontend e
fast-forward, confirmar PM2 backend-dev no checkout DEV e RDS staging
(HOST+PORT+DB_NAME; nome igual ao de producao nao basta). Preflight apenas
leitura; nenhuma migration nova desta tarefa. Se houver pendencias, parar e
avaliar a lista antes de escrever. Reiniciar somente backend-dev e verificar
https://api-dev.jrfluxy.com.br/health. Frontend DEV depende do deploy Vercel.

Depois do deploy, executar somente a conferencia de TIT190/DEV, sem --aplicar.
Enviar a saida para revisar o efeito e a assinatura antes de autorizar qualquer
reconciliacao. Main, dados reais e deploy nao executados pelo agente.
