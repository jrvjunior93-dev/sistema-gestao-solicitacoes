# DP - envio parcial e revisao de pagamentos

## Pedido

Usuario autorizou implementacao na refactor/frontend. Rotulo pedido:
Envio parcial para pagamento. Acoes separadas de revisar/reenviar e cancelar
definitivamente, apenas sem qualquer baixa. Preservar agrupamento de vales.

## Plano e ownership

Ownership ativo registrado em docs/workspace/OWNERSHIP_ATIVO.md.
Mapear solicitacao/linhas/titulos/fila/permissoes. Estado por colaborador,
compatibilidade com APROVADA legada, bloqueio financeiro persistente durante
revisao, reenviar mesmos titulos, cancelar sem apagar historico. Validar
reembolsos compartilhados, negativas de acesso, baixa parcial e duplicacoes.

## Estado

Implementado na C:/Fluxy-refactor-frontend, branch refactor/frontend, base
7c76ea77. Commit/push autorizados pelo usuario somente na refactor/frontend.
Sem main, EC2, banco real ou integracoes externas.
Nenhuma migration criada/aplicada. Ownership liberado ao concluir a revisao.

## Arquivos e comportamento

- Backend: rhPagamentoSolicitacaoService/Domain, novo
  rhPagamentoSolicitacaoRevisaoService e rhPagamentoRevisaoPolicy; controller
  de pagamentos, RhSolicitacaoController (projecao/filtro legado), routes.js.
- Financeiro: pagamentoManualFilaService, tituloBloqueioRetornoObraPolicy,
  tituloFinanceiroService, analiseProprietarioService,
  statusInternoContasPagarService, paymentValidators. Guardas canonicas cobrem
  fila, baixa direta/conciliacao e elegibilidade bancaria. Status DP reservado.
- rhFechamentoService: favorecido bancario isolado para este fluxo; chamadas
  legadas mantem default anterior. Evita editar dados de outro pagamento.
- UI: RhDpPagamentoModal, RhDpPessoal/Solicitacoes, FinanceiroFilaPagamentos e
  rh-pagamento-solicitacao.css. Mesmo padrao corporativo compacto. Skill de
  frontend orientou estados por linha, confirmacoes com motivo e revisao
  desktop/mobile. Fieldset tem largura minima zero para limitar scroll a tabela.
- Validadores: novo validarRhPagamentoEnvioParcial.js; cobertura expandida em
  validarCartaoOpcionalSolicitacao.js, validarRhPessoalPorSolicitacao.js,
  validarRhPagamentoSolicitacaoUI.mjs e validarFilaInstrumentosUI.mjs.
  backend/package.json inclui test:rhdp-envio-parcial.
- Documentacao: README e GUIA_OPERACIONAL_PESSOAL RH/DP, ownership e handoff.

Estados: solicitacao ENVIO_PARCIAL (rotulo pedido) / EM_REVISAO / APROVADA;
linhas PENDENTE / ENVIADO / EM_EDICAO / CANCELADO; fila EM_EDICAO e titulo
RH_DP com status_interno_pagar EM EDICAO DP. Cancelado sai da listagem
operacional, mas permanece no banco, historico e auditoria do titulo.

Reenvio atualiza salario/fila originais e conserva comprovantes. Mudanca no
responsavel/agrupamento do vale pode cancelar o vale antigo e gerar outro.
Cancelamento individual subtrai apenas sua parte do vale compartilhado.
Baixas, inclusive parcial ou estornada, fila BAIXADO/RESOLVIDO, renegociacao,
retorno Obra, exclusao e intent bancario ativo impedem alteracao. Fechar modal
nao desbloqueia o pagamento; motivo, ator e antes/depois ficam auditados na
mesma transacao. Exclusao generica nao contorna cancelamento especifico RH.

## Validacoes executadas

Todos os testes abaixo usam modelos/APIs em memoria ou analise de codigo.
Navegador limitado ao servidor local; nao carregam .env nem escrevem banco:

- npm run test:rhdp-envio-parcial: parcial, legado, restantes, negativas de
  escopo/role/permissoes, baixa/intent, replay simultaneo, rollback de governanca
  e auditoria, revisao agrupada, reenvio IDs originais, cancelamento de partes.
- node backend/scripts/validarRhPagamentoSolicitacao.js: dominio e fluxo anterior.
- node backend/scripts/validarRhPessoalPorSolicitacao.js: legado no filtro
  parcial/aprovada sem escrita, escopo local, outras solicitacoes preservadas.
- npm run test:fila-juros-multa: servico real de fila/baixa, guardas DP em
  fila pendente/desatualizada e edicao generica, encargos/instrumentos/replay.
- npm run test:fila-comprovante-pendente: historico, comprovantes e rollback.
- node backend/scripts/validarBloqueioRetornoObra.js: bloqueio anterior preservado.
- node backend/scripts/validarAnaliseProprietario.js: convergencia, escopo,
  auditoria e negativas esperadas (logs de falha fazem parte do teste).
- node frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs: componente real,
  selecao restantes, motivo, fila bloqueada apos fechar, reenvio mesmo ID,
  cancelamento, baixa parcial e desktop/mobile; mascaras/autosave anteriores.
- node frontend/scripts/validarFilaInstrumentosUI.mjs: fila real com destaque
  de edicao, sem selecao/baixa/conta editavel, instrumentos e anexos anteriores.
  Neste host requer PLAYWRIGHT_EXECUTABLE_PATH para o Chrome local existente.
- node frontend/scripts/validarRhPessoalPorLocal.mjs: estrutura local/global,
  permissoes DP/Obra, edicao cadastro, selecao de colaboradores e fluxo anterior.
- npm run build (frontend): aprovado; avisos conhecidos Browserslist e chunk >500KB.
- Capturas conferidas em outputs/rh-pagamento-solicitacao e
  outputs/fila-edicao-dp-{1366,390}.png. outputs/ permanece fora do commit.

Tentativa adicional validarRhPessoalFluxo.js falhou no mock antigo de
rhTransferenciaService: Dependencia nao simulada ./notificacoes. Script e
servico de transferencia nao foram alterados nesta tarefa. Nao declarar essa
suite ampla aprovada; cobertura dirigida acima aprovada, transferencia fora
do escopo. Chromium headless ausente foi contornado com Chrome ja instalado,
sem baixar runtime ou mudar dependencias.

## Riscos e proximo passo exato

- Homologacao MySQL/EC2 ainda nao executada; concorrencia/rollback simulados,
  nao um teste de carga real. Locks no codigo seguem titulo -> fila.
- Colunas atuais comportam estados, sem migration. Indice SQL legado ativo
  nao inclui EM_EDICAO; API reserva titulo com lock e estados ativos ampliados.
- Preservar governanca da fila: envio continua podendo ser recusado se pausado
  ou se autorizacao for exigida. Falha reverte alteracoes e conserva bloqueio.
- Publicar backend e frontend juntos para obter revisao/novos filtros.
- Publicacao autorizada: dominio, envio parcial/revisao, filtro legado e fila
  financeira revalidados em memoria, branch conferida com remoto antes do commit.
- Depois do commit/push atualizar apenas dev quando solicitado, validar
  com dois navegadores: enviar parte, abrir restante, editar e tentar baixar
  pelo Financeiro durante bloqueio, reenviar e cancelar sem baixa; verificar
  vale compartilhado e negativa apos baixa parcial. Nao promover DP para main
  sem pedido explicito; restricao anterior do usuario permanece.
