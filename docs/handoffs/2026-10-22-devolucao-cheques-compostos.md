# Devolucao seletiva de cheques de recebimento composto

## Autoridade, base e estado

Usuario autorizou implementar/testar DEV um ou varios cheques, usando o caso
real apenas como referencia, preservando outros recebimentos e estorno integral.
Agente unico, branch codex/devolucao-cheques-compostos-20261022 sobre
origin/refactor/frontend28670b81. Publicacao em refactor/frontend agora autorizada
pelo usuario, incluindo roteiro de migration/deploy DEV. Sem deploy, banco/EC2/
S3/Redis reais, alteracao de flags/dependencias, DDL real ou estorno financeiro real.
Nenhuma alteracao em main/producao. Outputs privados fora do Git.

Consulta feita pelo usuario confirmou cheque85, componente8/grupo1,
movimento5430/TIT-007520 (id8746), principal8000 sem encargos, somente uma
alocacao e sem vinculos bancarios registrados. Motivo22 informado pelo usuario;
o recebimento substituto ainda precisa ser conferido para nao duplicar baixa.
QA usa fixture anonimizada com os mesmos valores/IDs, 17 fontes, 3 titulos e
outro cheque8000 rateado em2titulos; nenhuma escrita no registro real.

## Implementacao e arquivos

- Nova migration202610220002_baixa_composta_estornos_cheques.js/modelo
  BaixaFinanceiraGrupo: JSON nullable estornos_cheques, aditivo/idempotente;
  down bloqueado para nao apagar recibos. Criada, NAO aplicada.
- baixaCompostaChequeEstornoService: GET de candidatos, POST previa/confirmar,
  schema estrito, codigo bancario2digitos, justificativa3..1000, data valida
  entre entrada e hoje, selecao1..100cheques da MESMA baixa. Conferencia limitada
  a200titulos/1000alocacoes, sem recorte silencioso; valores em centavos seguros.
- Exige Financeiro + permissoes individuais visualizar/estornar baixa composta
  e devolver cheques. Escopo de TODOS os titulos, inclusive rateios, titulos
  compartilhados/negociados. Payload nao define valores, titulos ou movimentos.
- Titulos bloqueados em ordem antes do grupo/fontes/alocacoes/movimentos/
  cheques. Valida vinculos e soma integral por componente, uma identidade de
  carteira por fonte, apenas BAIXA ATIVA CHEQUE/RECEBER sem encargos, titulo
  quitado/parcial nao substituido. Snapshot da previa inclui estado atual e
  usuario. Confirmacao revalida sob transacao; nenhuma parte se falhar uma.
- Cheques devem estar EM_CARTEIRA, mesma empresa da fonte, sem deposito,
  compensacao, utilizacao, devolucao, conciliacao ou vinculo posterior. Casos
  bancarios devem ser regularizados no fluxo correspondente; nao gera
  contrapartida bancaria, nao reabre OFX e nao presume que extrato foi importado.
- Reverte todos os movimentos do cheque, inclusive rateado; atualiza apenas
  saldos/status/quitacao dos titulos afetados, chequeDEVOLVIDO/data/usuario,
  historico e recibos do grupo. Nao cria titulos, nova receita ou recebimento
  substituto; nao escolhe outro titulo arbitrariamente. Preserva outras fontes,
  valores/vencimentos/origens/rateios/categorias e pagamentos parciais anteriores.
- Cheques de mesmo valor sao distintos porID/vinculo, nao valor. Se o mesmo
  documento fisico esta fragmentado em varios registros legados da mesma baixa,
  exige selecionar todos os registros de identidade coincidente; um vinculo
  divergente bloqueia. Sem consolidacao/backfill silencioso. Entrada legada
  pode usar movimento_financeiro_id se movimento_entrada_id estiver ausente;
  FKs conflitantes bloqueiam, nao sao corrigidas automaticamente.
- Grupo PARCIAL_ESTORNADO ou ESTORNADO quando todos os movimentos originais
  foram estornados. Recibos persistem chave/hash/usuario/payload/resultado.
  Retry igual com mesma chave devolve recibo, sem nova escrita; chave reutilizada
  com outro payload/usuario e cheque ja devolvido em nova operacao bloqueiam.
- Evento de cheque, SecurityEventLog e historicos de solicitacao na MESMA
  transacao. Auditoria/sincronizacao falha => rollback integral. Sincroniza
  contrato comercial, realizacao de compra, negociacao e solicitacoes depois
  de todos os saldos afetados, preservando contexto transacional.
- chequeTerceiroService: detalhe projeta baixa_composta_id somente leitura;
  estorno integral agora trava titulos antes do grupo e, apos devolucao parcial,
  estorna apenas alocacoes ainda ativas, reconhecendo somente movimentos ja
  estornados nos recibos. ChequesDEVOLVIDO anteriores nao viram CANCELADO nem
  saldo e reaberto duas vezes. Movimentos posteriores dos cheques restantes
  continuam bloqueando o estorno integral; falha nao desfaz devolucao anterior.
- Controller/routes adicionam endpoints dedicados sob guardas atuais e limite
  critico; servico revalida ACL. Erros novos sanitizados, sem SQL/stack/body.
  Estorno generico de movimento composto continua BLOQUEADO e nao foi alterado.
- FinanceiroBaixasCompostas: bloco compacto de selecao/previa/aceite explicito,
  filtro parcial, historico e fontes devolvidas, estorno restante. Link de
  carteira para grupo em ?grupo=id. Devolucoes simples e outros fluxos mantidos.
- DevolucaoChequesComposta e services: inputs em workspace, leitura atual antes
  de restaurar rascunho, conflito explicito, mudar entrada invalida previa,
  mutex inclusive com estorno integral. Sem sucesso financeiro otimista.
  Falha de confirmacao exige GET antes de outro POST; recibo identifica resposta
  perdida sem reenviar escrita. Erro preserva preenchimento. GET/previa15s,
  confirmacao30s (timeout tambem exige consulta, pois o servidor pode concluir);
  nenhuma tentativa de confirmacao e repetida automaticamente.

## Validacoes

- QA backend dedicado (servicos reais/VM/models em memoria): caso8000,
  selecao multipla/multi-titulo, valor igual distinto, fragmentos de documento,
  devolucoes sucessivas/todos, restante/integral antigos, replay/duas chaves,
  concorrencia serializada, escopo/ACL, schema estrito, data/revisao obsoleta,
  bloqueios bancarios/encargos e rollback tardio de auditoria/sync aprovados.
- Migration aditiva/idempotente e guarda estrutural do runner testadas em
  memoria, sem MySQL. Locks simulados nao substituem concorrencia MySQL real.
- UI dedicada real/CSS/HTTP interceptado1366/390: selecao multipla/rateio,
  DateInputBR real, previa/aceite, editar invalida, workspace, negativa403,
  duplo clique,409/releitura, resposta perdida/recibo sem reenvio, pagina real
  com deep link/filtro/estorno restante e sem loops aprovada.
- Regressoes backend CarteiraChequesBaixaComposta, ComercialChequeQuitacao,
  ChequesLoteContrato, BaixaMassaFormasPagamento, FilaBaixaComposta/BaixaEstorno,
  negociacaoService/Vinculos/Sincronizacao/Pagamento e compartilhadosSync aprovadas.
- UI BaixaCompostaWorkspace e FilaBaixaCompostaUI aprovadas. Suite ampla
  FilaInstrumentosUI aprovada INTEGRALMENTE na repeticao sem edicao concorrente:
  dados/colunas/anexos/copias/paginacao650/13paginas/mutex e estorno desktop/mobile.
  Primeira execucao teve timeout na fixture Anexar mesmo comprovante2 durante
  edicao/HMR concorrente; nenhum QA ou tela de fila foi enfraquecido/alterado.
- Build final636modulos/12,83s aprovado (avisos antigos Browserslist/chunks),
  Node/diff/documentacao603Markdown/19canonicos aprovados. Catalogo sem delta.

## Proximo passo exato

Implementacao e validacoes de publicacao concluidas; ownership liberado para
commit/push na refactor/frontend. Base remota28670b81 e mainfe663151 conferidas.
outputs/ nao entra no commit. Nenhuma aplicacao da migration pelo agente.

Roteiro proprio ops/deploy/atualizar-dev-devolucao-cheques-20261022.sh recebe
SHA completo publicado; exige CONFIRM_DEV_BACKUP=SIM apos conferir backup DEV.
Confere checkout/branch limpos, flock, ancestry/ff-only, dependencias intactas,
.env inalterado, PM2 exclusivo8001/watch desligado, flags e identidade MySQL.
backend/scripts/aplicarMigrationDevolucaoChequesDev.js --verificar/--aplicar
aceita SOMENTE migration202610220002 e UUID DEV60f043e9-4025-11f1-9a61-06d8a063012d;
outra pendencia, inclusive001 anterior, interrompe. Sem backfill; JSON nullable
conferido depois. TLS exigido se CA configurada. Autorizacao estrutural apenas
temporaria no processo do aplicador, restaurada mesmo em erro.
Roteiro executa QAs isolados antes da migration; confere sessao/flags/schema,
reinicia apenas backend-dev sem --update-env nem propagar autorizacao de DDL,
consulta health8001 e repete verificacoes. Reexecucao apos ff-only interrompido
admite somente a pendencia002; nao altera .env, Nginx, main ou processo de producao.
Nao reutilizar o roteiro28670b81, que aceita somente001. Nao rodar migrate geral.

validarDeployDevolucaoChequesDev.js aprovado em memoria/texto: ambiente/caminho,
PM2/porta/watch/flags/UUID, coluna/schema, pendencia anterior/estranha, backup,
TLS quando configurado, idempotencia/restauracao de autorizacao e falha do runner;
ordem de testes/migration/restart e mutacoes negativas do roteiro. Bash -n,
Node/diff e documentacao603/19 aprovados. Backend dedicado e11regressoes repetidos,
UI real1366/390/HTTP interceptado e build636/11,34s repetidos aprovados; avisos
antigos Browserslist/chunks apenas. Sem prova de concorrencia MySQL real.

Proximo passo: publicar SHA, confirmar ref remota e main inalterada, entregar
comandos ao usuario; somente o usuario atualiza EC2 e aplica migration DEV.
Conferir deploy Vercel DEV no mesmo SHA antes de homologar.
Homologar registros de teste (inclusive mais de um cheque e cheque rateado),
saldo do contrato/fluxo de caixa/historico, e confirmar recebimento substituto
antes de qualquer baixa real. Apenas depois decidir promocao para producao.
