# Regularizacao GEO de recarga excluida

Atualizacao posterior: o escopo global GEO, a preservacao de setor/status e a
auditoria isolada estao em 2026-10-15-recarga-geo-global-visibilidade.md.
O mapa abaixo registra a implementacao original anterior a essa mudanca.

## Pedido e estado

- Usuario autorizou implementar o caminho de regularizacao que faltava ao aviso.
  Depois confirmou que o fluxo publicado em refactor/frontend funciona nos
  testes normais; a excecao era a solicitacao excluida com obrigacao pendente.
- Base cfd2dd0f; branch local codex/recarga-regularizacao-geo-20261015.
- Usuario autorizou agora commit/push na refactor/frontend e comandos DEV.
  Sem EC2, escrita em banco real ou aplicacao de migration pelo agente.
  Nenhuma migration nova. outputs/ de QA preservado e fora do Git.
- Nao foi consultado o banco DEV para inferir se o cartao Joao tem titulo
  aberto ou pagamento/prestacao. Nova tela determina isso pelos vinculos reais.

## Mapa e implementacao

- Novo recargaCartaoRegularizacaoService: listar/consultar/regularizar;
  controller e tres rotas em /recargas-cartao/regularizacao, fora dos caminhos
  operacionais barrados por solicitacaoDisponivel. Guardas GEO/SUPERADMIN e
  hasObraAccess, parametros numericos, rate limit critico e guarda de prazo
  operacional por obra persistida, sem confiar no obra_id do corpo.
- Consulta limitada a solicitacoes com recarga, codigo exato, cursor de 30,
  dados minimos de cartao mascarado. Conferencia traz todos os cartoes,
  situacao/IDs dos titulos, valor pago, saldo, prestacao e tratamento.
- Sem pagamento: CANCELADO/valor_saldo0 no titulo elegivel, ciclo CANCELADA,
  sem remover solicitacao/anexo/log nem alterar valor_original/valor_baixado.
- Com pagamento: recupera a solicitacao original (cancelada=false) no GEO,
  sem criar titulo e sem alterar o pago. Reutiliza prestacao existente em
  PENDENTE/REJEITADA/ENVIADA/VALIDADA, com rateios e decisoes intactos.
  FindOrCreate apenas se faltar formulario de prestacao. Status de conjunto
  PAGA/ATENDIDO/APROVADA deriva das prestacoes preservadas, nao e aprovacao nova.
- Solicitacoes mistas: cancela/encerra cartoes nao pagos e recupera pagos em
  uma transacao, com aviso e tabela de todos antes de confirmar.
- Transacao com locks por cartao crescente antes da solicitacao e recargas/
  titulos/prestacoes. Revisao SHA256 invalida tela obsoleta. Historico atomico
  guarda antes, motivo, autor, chave, fingerprint e resultado para replay;
  mesma chave com corpo diferente falha. Sem pagamentos/ajustes automaticos.
- Bloqueia vinculo ausente/duplicado, titulo de outra origem, pagamento/saldo
  inconsistente, titulo pago excluido, prestacao processando e vinculos externos
  ativos. Cancelamento de banco/fila/cobranca continua com Financeiro.
- Frontend RecargasRegularizacao com Pagina/PageHeader/BlocoConteudo/TabelaPadrao,
  conferencia inline, motivo e confirmacao obrigatorios, trava de envio/retry,
  filtro por codigo, cursor e link para a prestacao original recuperada.
  Menu/rota usam canRegularizarRecarga; nao abrem outras areas. Aviso da Nova
  Solicitacao recebe atalho condicionado pelo backend. Navegacao gerada atualizada.
- Manifestos estatico e QA preview incluem a pagina. Nao foi executado QA em
  preview publicado nem homologacao em banco real da nova regularizacao.

## Validacoes executadas

- validarRecargaRegularizacao: servico/controller reais com modelos isolados,
  GET sem escrita, ACL negativa antes de DB, escopo de obra e SUPERADMIN,
  encerramento sem baixa, preservacao de titulo/valor original, corpo forjado,
  recuperacao paga e mista, prestacoes existentes preservadas, formulario ausente,
  estados reais BAIXADO/SUCESSO, filas protegidas, revisao obsoleta, replay,
  simulacao serial de concorrencia, erro500 sanitizado e rollback da auditoria.
- Regressoes backend: validarRecargasMultiplosCartoes,
  validarMedicaoRecargaFluxoPagamento, validarSaldoCartaoSchemaLimiteDp,
  validarPrazosOperacionais e validarSuperadminInteracaoExclusao aprovados.
  Todos usam doubles/simulacoes, sem banco/rede real.
- UI Playwright/Vite com APIs interceptadas: abrir nao salva, motivo/conferencia,
  erro preserva formulario, retry com mesma chave, clique duplo bloqueado,
  impeditivo do Financeiro, recuperacao/link original, filtro, ACL frontend,
  desktop1366/mobile390 sem overflow. Capturas outputs/qa-recarga-regularizacao
  inspecionadas. Regressoes contexto excluido, saldo e multicartoes aprovadas.
- Build e navegacao aprovados; avisos preexistentes Browserslist e chunk500KB.
- Validador global de layout continua com 88 falhas anteriores em outros
  arquivos. Comparacao em memoria com fontes/manifestos HEAD: baseline89,
  atual88, nenhuma falha nova. A nova pagina nao teve falha especifica.

## Riscos e proximo passo

- Publicacao DEV autorizada. Script
  ops/deploy/atualizar-dev-recarga-regularizacao-20261015.sh repete testes novos
  e regressoes e confere processo/porta8001, flags sem sobrescrita, identidade
  staging e schema somente leitura antes de reiniciar apenas backend-dev.
  validarDeployRecargaRegularizacaoDev.js valida os blocos reais com doubles,
  inclusive recusas de producao, porta, processo, banco, schema e flags.
- Atualizacao EC2 sera executada pelo usuario. Nao reiniciar producao,
  aplicar migrations, executar seeds/backfills ou mudar flags.
- Homologar com GEO real: titulo sem baixa, recarga paga com prestacao pendente,
  solicitacao mista, fila em processamento, tentativa OBRA/DP e nova recarga
  apos regularizacao. Nao inflar gastos nem liberar pendencias artificialmente.
- Somente exclusao logica e recuperavel por esta tela. Registro fisicamente
  ausente ou vinculo inconsistente requer investigacao, nao reconstrucao cega.
- Leitura/edicao operacional do registro continua indisponivel enquanto ele
  permanecer excluido. Pagamento recuperado exige conferencia normal posterior.
