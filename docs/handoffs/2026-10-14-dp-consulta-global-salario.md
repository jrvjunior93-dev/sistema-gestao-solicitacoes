# DP: consulta global, rascunhos e ajuste salarial

## Estado e pedidos

- Data do cliente: 14/10/2026, America/Sao_Paulo.
- Branch local `codex/rhdp-solicitacoes-globais-20261014` sobre refactor/frontend
  `3a1b2300`; worktree reutilizado promocao-dp-main-20261014/Fluxy.
- Usuario pediu lista global das solicitacoes ao entrar em Colaboradores/DP,
  investigacao da Jornada destacada mas ausente das listas, correcao do erro
  salarial e edicao direta exclusiva do SUPERADMIN com vigencia informada.
- Implementacao local concluida. Usuario autorizou commit e push do conjunto
  na refactor/frontend; comandos para EC2 dev serao executados pelo usuario.

## Caso real, somente leitura executada pelo usuario

- Colaborador 218: solicitacao 8, codigo RH-000008, tipo JORNADA,
  subtipo PAGAMENTO_POR_SOLICITACAO, RASCUNHO, obra 14, autor 41,
  competencia 2026-10. Nenhum periodo de jornada informado no snapshot.
- Rascunho privado do autor: oculto na lista da Luana e do superadmin por regra
  existente. O defeito era o destaque na linha, que nao aplicava essa regra.
- Nenhum rascunho foi enviado, cancelado ou alterado. Autor pode concluir/enviar
  o registro existente para disponibiliza-lo ao DP; nao criar outro para contornar.

## Implementacao

- RhDpPessoal: entrada global em solicitacoes para DP/admin; acesso explicito
  a Obras/Centros de Custo e retorno a lista global a partir de local aberto.
  Lista local/ativos, pagamento individual/coletivo, documentos e relatorios
  continuam com recorte local. Sem alteracoes de menu/rotas/permissoes centrais.
- RhSolicitacaoController e rhPagamentoSolicitacaoService: DP consulta todos os
  locais com as permissoes funcionais existentes. Escopo estrito OBRA prevalece,
  inclusive em usuario que acumule DP. Demais setores sem ver_todas permanecem
  limitados. Rascunho privado segue a mesma regra, inclusive para superadmin.
- rhSolicitacaoConsultaDomain: regra comum de privacidade, situacao efetiva de
  pagamentos legados e pertencimento por linhas de pagamentos coletivos.
  RhSolicitacaoController consulta coletivos com AND preservando OR de escopo;
  snapshot filtra o colaborador solicitado. Linha nao selecionada nao vira pedido.
- Destaque em rhSolicitacaoService/rhService recebe usuario/escopo autenticado
  do RhColaboradorController. Query nao pode falsificar autor ou obras visiveis.
  Inclui envio parcial/em revisao; exclui aprovadas completas e transferencias.
  Consultas nao alteram situacao ou registros no banco.
- Novo salario no formulario de solicitacao passa como numero 1881, nao texto
  R$ 1.881,00 (Number do texto formatado causava a rejeicao).
- RhDpColaboradores/rhValidators/rhService: ajuste direto salarial exclusivo
  de SUPERADMIN validado no backend, com vigencia/motivo obrigatorios. Outros
  perfis continuam com solicitacao salarial; campo de edicao fica desabilitado.
- Historico via rhSalarioService na transacao/lock do colaborador; mesmo valor
  nao duplica historico. Mesma vigencia administrativa conserva evidencia do
  valor anterior, usuario e horario nas observacoes, sem intervalo negativo.
  Data invalida/anterior a admissao ou ao salario vigente e recusada. Vigencia
  futura nao antecipa cache atual. Nenhum titulo e recalculado, alterado ou criado.

## Validacoes locais

- Novo validarRhConsultaSalario.js: controllers/services reais e modelos em memoria,
  DP global/OBRA/outros setores, coletivo, privacidade inclusive superadmin, caso
  RH-000008, spoof de identidade/escopo, salario permitido/negado, vigencia,
  concorrencia, historico, ajuste na mesma data, cache futuro e rollback.
- validarRhPessoalPorSolicitacao.js, validarRhPessoalFluxo.js --transferencias,
  validarRhPrimeiraLotacao.js, validarEscopoRhDpUsuarioObra.js,
  validarRhColaboradorContatos.js, validarRhColaboradoresPlanilha.js,
  validarEventosRecorrentesDp.js, validarRhDpRegrasPagamento.js,
  validarRhPagamentoSolicitacao.js e validarRhPagamentoEnvioParcial.js aprovados.
- validarSegurancaAcessoDireto.js: 2304 comparacoes, ACL/ID, 66 casos de compras,
  token/revogacao e 47 rotas reais em HTTP local sem banco/rede externa.
- validarRhPessoalPorLocal.mjs: desktop/mobile, entrada global, dois locais,
  negativos OBRA, navegacao, modal de jornada, moeda numerica, cadastro direto
  SUPERADMIN com vigencia/motivo, negativas DP e duplo envio aprovados.
- Syntax checks, build frontend, diff check e documentacao aprovados.
- Ajustes nas fixtures para novas dependencias; erros de local reutilizado,
  labels com hint/asterisco e mock IN foram corrigidos e suites reexecutadas.
- Avisos existentes no build: Browserslist antigo e bundle acima de 500 kB.
- Evidencias visuais em outputs/rh-pessoal-locais/ nao versionar. Padrao visual
  existente preservado com skill frontend-design; sem redesenho estetico.

## Proximo passo e limites

- Commit/push na refactor/frontend autorizado. Conferir delta e stagear somente
  estes arquivos; preservar outputs/ e outras alteracoes locais.
- Homologar DP/Luana, superadmin e autor do rascunho em dev antes de promover main.
- Sem migration/dependencia/flag nova, .env, banco real ou EC2 tocados pelo agente.
- Obra obrigatoria em caixa continua em outro worktree, fora deste ajuste.
- Vigencia historica pode alterar consultas baseadas no historico salarial, como
  esperado; apuracoes/fechamentos/titulos ja gravados nao sao recalculados.
- Nao executar seed, backfill, script de ajuste salarial ou envio automatico do
  rascunho para corrigir sintomas. Operacoes reais somente pela UI autorizada.

## Conferencia antes da publicacao

- Remoto refactor/frontend ainda em 3a1b2300, sem novos commits concorrentes.
- Reexecutados validarRhConsultaSalario, validarRhPagamentoEnvioParcial e
  validarSegurancaAcessoDireto; aprovados. Build/documentacao e diff check conferidos.
- Sem nova migration, dependencia ou flag; comandos dev devem validar UUID
  60f043e9-4025-11f1-9a61-06d8a063012d, banco gestao_solicitacoes e schema pronto.
- Reiniciar somente backend-dev apos validacao; nunca backend-solicitacoes.
