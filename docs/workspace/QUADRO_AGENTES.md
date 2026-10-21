# Quadro de Agentes

## Publicacao DEV lista unica da fatura - 2026-10-21

- Agente unico, validado para publicacao; usuario autorizou commit/push DEV deste ajuste.
- Reservar delta/QA/docs e roteiro especifico com guardas antes do merge,
  sem migration/dependencias/reinicio. Excluir permutas/outputs; sem main/EC2.
- Guardas/Node/Bash/unidade/regressao/build/docs/diff aprovados; UI1366/390
  repetida apos build e aprovada. Ownership liberado para publicacao/homologacao.

## Lista unica da fatura - 2026-10-21

- Agente unico, finalizado local; reserva da tela, helper de leitura, QA e docs.
- Mostrar data da compra, parcela e valor nesta fatura para os dois vinculos,
  sem alterar totais/ACL/baixa. Sem banco/EC2/main/publicacao. Reservas no ownership.
- Unidade/UI1366/390, faturas/parcelamento/permissoes, build/navegacao/abas,
  docs/Node/diff aprovados; layout global127->125, sem falha nesta tela.
  Ownership liberado e handoff salvo; aguarda publicacao autorizada.

## Publicacao DEV motivo encerramento - 2026-10-20

- Agente unico, finalizado local, commit/push DEV autorizado; reservas no ownership.
  Revalidar motivo/historico/replay/ACL/rollback e incluir QA no roteiro DEV
  apos merge e antes do restart; sem DDL/EC2/main ou backfill.
- Usuario refinou para somente motivo no texto; data/autor/status preservados.
  QA completo do roteiro, cotacao/motivo/replay/ACL/rollback, Node/Bash/docs/diff
  aprovados; ownership liberado para publicacao autorizada.

## Motivo encerramento sem pedido - 2026-10-20

- Agente unico, finalizado local, baseDEVf835. Incluir justificativa ja salva na
  descricao exibida no historico principal. Preservar autor/status/transaction/
  metadados, ACL, idempotencia e pedidos existentes; reservas no ownership.
- Somente backend/teste/docs, sem UI/EC2/DDL/main/publicacao ou backfill.
- Novo QA reproduz ausencia antiga e confirma texto completo, autor/status,
  metadata/limites/ACL/escopo/replay/rollback. Regressao cotacao/Node/docs/diff
  aprovados; ownership liberado, delta local sem commit/push.

## Publicacao DEV imagens comprovantes - 2026-10-20

- Agente unico, finalizado local; commit/push DEV autorizado. Reservas no ownership.
  Revalidar delta e adicionar testes isolados do upload/servico/schema/parser
  ao roteiro existente, depois do merge e antes do restart exclusivo backend-dev.
- Sem DDL/EC2/banco/main; outputs privados nao serao publicados.
- Roteiro/QAs backend, UI imagens1366/390, build, guardas/Node/Bash/docs/diff
  aprovados. Ownership liberado para publicar delta conhecido; EC2 pelo operador.

## Imagens comprovantes fila - 2026-10-20

- Agente unico, finalizado, baseDEV1f02. Separar upload manual PDF/JPG/JPEG/PNG
  do importador PDF; mesma permissao/escopo e seguranca binaria/antivirus.
  Preservar historico/replay/rollback e preview de imagens, sem baixa automatica.
  Reservas no ownership. Sem EC2/DDL/main/publicacao, frontend compacto existente.
- Backend/seguranca HTTP loopback, parser/schema/cheques, historico/ACL/replay/
  rollback, UI imagens/completa/rolagem, build/docs586/19/Node/diff aprovados.
  Ownership liberado, handoff salvo; sem commit/push ou alteracao de producao.

## Publicacao DEV cheques/contrato - 2026-10-20

- Usuario autorizou commit/push DEV. Agente unico, finalizado local,
  validado delta homologavel
  na basee01, preservando main e9df. Incluir QA do contrato no roteiro existente
  antes do restart; sem DDL/configuracao/EC2. Reservas no ownership.
- Runtime/guardas/Bash/Node/docs585/19/diff aprovados novamente; UI/build
  anteriores aprovados, ownership liberado para publicacao Git autorizada.

## Contrato e cheques de lote - 2026-10-20

- codex-cheques-contrato-lote-20261020, finalizado local, agente unico, baseDEVe01.
  Adiar sincronizacao de contrato/solicitacao durante os componentes, concluir
  no estado completo da transacao; preservar estorno/ACL/replay/rollback.
  Reservas no ownership, sem banco/EC2/migration/main ou publicacao.
- Reproducao antiga4499,99 e novo lote real em memoria aprovados, contratos,
  carteira/estorno/replay/rollback/escopo, UI direcionada/build/docs585/19 e
  sintaxe/diff aprovados. Ownership liberado; delta local sem commit/push.

## Publicacao DEV moeda cheques - 2026-10-19

- Usuario autorizou commit/push para refactor/frontend e comandos DEV. Agente
  unico, QA finalizado e ownership liberado para publicacao autorizada.
  Somente BRL/testes/docs, sem backend/migration/main/EC2.
- Reutilizar roteiro pinado existente de datas dos cheques, guardas antes do
  merge e .env/schema/12h/flags; operador atualiza DEV e confere moeda/payload.

## Moeda nos cheques - 2026-10-19

- codex-cheques-moeda-20261019, finalizado local, agente unico, baseDEV7198d786.
  Somente formato BRL no valor dos cheques, mantendo numero em estado/API e
  todas as regras de soma/carteira/envio. Reutilizar formatadores do Fluxy.
- Sem backend, EC2, migration, main ou publicacao. QA desktop/mobile e build.
- Datas/BRL/payload, UI completa da fila/carteira/mutex/ACL, build, docs584/19
  e diff aprovados. Ownership liberado, delta sem commit/push.

## Publicacao DEV datas de cheques - 2026-10-19

- Usuario autorizou commit/push para refactor/frontend e roteiro DEV. Agente
  unico, finalizado local; preservar main9e4faf4e e outputs privados. Sem EC2/SQL.
- Validar delta/roteiro, publicar fast-forward e fornecer SHA pinado para
  operador. Sem migration, configuracao ou teste financeiro real automatico.
- Testes backend/guardas/UI/build/docs/sintaxe/diff aprovados, ownership
  liberado para publicacao Git autorizada; DEV real somente pelo operador.

## Datas dos cheques na baixa - 2026-10-19

- Sessao codex-cheques-datas-20261019, finalizado local, agente unico.
- Padronizar emissao/vencimento em DD/MM/AAAA com edicao segmentada; ano
  de quatro digitos/calendario, ISO na API. Erro apenas apos confirmar/enviar,
  identificando cheque/campo. Preservar preenchimento no erro de baixa em massa.
- Base refactor/frontend1393a446 em branch isolada; sem main, banco/EC2,
  migration, commit/push ou deploy. ACL/locks/transacoes/idempotencia intactos.
- Backend, UI direcionada e completa da fila, build, docs583/19, sintaxe/diff
  aprovados. Dados mantidos no erro; ownership liberado, homologacao DEV futura.

## Autorizacao alerta/reenvio - 2026-10-19

- Publicacao DEV agora autorizada: roteiro, prontidao MySQL somente leitura e
  push real opcional com guardas preparados/validados. Ownership liberado para
  commit/push refactor/frontend. Main72 preservada; EC2 somente pelo operador.
- Sessao codex-autorizacao-reenvio-20261019, finalizado local, sem delegacao.
  Mapear falha apos commit da decisao, notificar proprietario com acao segura,
  reenvio individual na lista/detalhe e lote sem reautorizar ou duplicar fila.
  Produto na base refactor/frontend; sem EC2/SQL real/deploy/commit/push.
  Evidencia recebida: deploy main72 concluido, migration190001 e health200.
  Novo pacote QA backend/DOM/PWA/filtros/historico/build/docs/sintaxe/diff
  aprovado; ownership liberado, publicacao e DEV real pendentes.

## Promocao main Compra Direta/admissao - 2026-10-15

- Integracao autorizada main1341e1a3/devd72a9c93, sem delegacao; backup/timer
  e schema real de producao confirmados. Tres conflitos apenas documentais.
- Runtime homologado preservado, validacoes integradas aprovadas, ownership
  liberado para PR/merge. Sem EC2, banco, migration ou restart pelo agente.
- Handoff: docs/handoffs/2026-10-15-promocao-compra-direta-admissao-main.md.

## Promocao main cadastro no pagamento RH - 2026-10-15

- Sessao codex-promocao-rh-cadastro-main-20261015: finalizado, sem delegacao,
  ownership liberado para publicacao autorizada. Usuario aprovou dev/backup/timer.
- Main 6af7b192 + dev b9ef16e4; schema real producao conferido sem pendencias.
- Snapshot/bundle verificado, historicos preservados, conflitos apenas documentais;
  backend/ACL/UI/workspace/50%/navegacao/build/docs/scripts de deploy aprovados.
- Sem banco/EC2/migrations/flags alterados. Operador executa deploy exclusivo
  backend-solicitacoes8000; handoff 2026-10-15-promocao-rh-cadastro-main.md.

## Promocao DP global e salario - 2026-10-14

- Sessao codex-promocao-dp-global-salario-main-20261014: finalizado, sem delegacao,
  ownership liberado; testes backend/ACL, UI desktop/mobile, build e docs aprovados.
- Plano: preservar main 4fd60afc e incorporar refactor/frontend 208ae8e2;
  revalidar consulta/salario/hub, ACL e fluxos RH; publicar PR e comandos EC2.
- Backup/timer e homologacao dev confirmados pelo usuario. Sem banco/migrations
  ou deploy pelo agente; caixa/obra ainda local e outputs/ nao incluidos.
- Handoff: docs/handoffs/2026-10-14-promocao-dp-global-salario-main.md.

## Promocao operacional para main em 08/10/2026

- Sessao: codex-promocao-operacional-main-20261008; status: finalizado;
  ownership liberado para publicacao Git autorizada.
- Plano: integrar main 0c164d7c e refactor/frontend 27220d13 preservando
  vigencia contratual e ambos os historicos documentais. Conflitos previstos
  somente nos registros; codigo de contratos identico entre as duas pontas.
- Backup de producao confirmado pelo usuario; snapshot Git local completo
  verificado. Integracao validada: backend financeiro/retorno/contratos,
  UI de fila/justificativa/vinculos/pop-up/contratos, PWA, navegacao e build.
- Registros dos dois agentes preservados; contratos e demais arquivos de
  runtime conferidos sem diferenca contra suas bases corretas.
- Sem banco, migration aplicada ou deploy; publicar somente Git autorizado.
- Handoff: docs/handoffs/2026-10-08-promocao-operacional-main.md.
## DP cancelamento/comprovantes - 2026-10-15

- Agente unico, sem delegacao; implementacao e testes locais concluidos.
- Remocao/cancelamento auditados, comprovante por destino/lote, codigo DP e
  fechar consulta sem PUT. Permissoes e visibilidade preservadas.
- Migration estrutural criada, nao aplicada. Sem commit/push/EC2/banco real.
  Ownership liberado; handoff 2026-10-15-dp-cancelamento-comprovante-compartilhado.md.
- Publicacao autorizada posteriormente: script DEV com migration unica e teste
  isolado de guardas aprovados. Sem EC2/banco real/main pelo agente.

## Regularizacao GEO global e visibilidade - 2026-10-15

- Agente unico, sem delegacao. Usuario autorizou excecao apenas na regularizacao.
- Setor/status e ACLs genericas preservados; auditoria isolada nao concede
  leitura. Backend/UI/isolamento aprovados; sem migration/publicacao/banco real.
- Handoff 2026-10-15-recarga-geo-global-visibilidade.md registrado.

## Regularizacao de recarga excluida - 2026-10-15

- Agente unico, sem delegacao. Implementacao local e testes isolados concluidos.
- GEO/SUPERADMIN regulariza sem pagamento ou recupera a original paga, com
  escopo, auditoria e bloqueios financeiros. Sem novo bypass operacional.
- Handoff especifico registrado; sem migration/commit/push/EC2/banco real.
- Publicacao dev agora autorizada; delta e script seguro preparados para
  commit/push refactor/frontend, com repeticao das validacoes locais.

## Contexto recarga excluida - 2026-10-15

- codex-recarga-contexto-excluida-20261015: concluido local, agente unico.
- Corrigida falsa ausencia de historico/404 da recarga excluida, com protecao
  das obrigacoes financeiras e POST. Loading/erro/retry explicitos na UI.
- Backend adaptado, UI desktop/mobile/regressoes e build aprovados. Sem nova
  migration, banco real, commit/push/EC2. Handoff especifico registrado.

## Publicacao DEV saldo cartoes / DP - 2026-10-15

- Commit/push refactor/frontend e script EC2 dev com migration unica autorizados.
- Agente unico: staging do delta, testes backend/UI/build e preflight de deploy
  com adaptadores isolados. Sem EC2 pelo agente ou alteracao na main/producao.
- Script protege processo/porta8001/banco/flags, bloqueia outras migrations e
  preserva repeticao segura. Operador homologa apos publicacao.
- Backend/UI/build/docs e deploy isolado aprovados; ownership liberado para
  staging/commit/publicacao solicitados. Nenhum comando remoto executado.

## Saldo cartoes e conferencia DP - 2026-10-15

- codex-cartao-saldo-dp-20261015: concluido local, sem delegacao;
  ownership liberado, sem commit/push/deploy.
- Prestacao pelos gastos reais, sobra por cartao e ajuste auditado GEO;
  salvamento RH isolado do limite de operacoes criticas por IP.
- Sem banco real/publicacao/deploy. Ownership no documento correspondente.
- Testes services/middleware/migration isolados, regressao RH/financeiro,
  UI desktop/mobile, build e docs aprovados; handoff registrado.

## Publicacao DEV frete financeiro - 2026-10-15

- Validado para publicacao, sem delegacao: commit/push autorizados na refactor/frontend,
  script DEV com preflight de identidade/schema/flags e testes isolados.
- Publicar somente delta funcional/documental da tarefa; main e outputs/
  preservados. EC2 sera atualizada pelo operador, sem migration.
- Backend, preflight/health isolados, UI desktop/mobile e build aprovados.
  Evidencias no handoff 2026-10-15-compra-direta-frete-financeiro.md.

## Sincronizacao financeira do frete Compra Direta - 2026-10-15

- Sessao codex-compra-direta-frete-financeiro-20261015: finalizado local,
  ownership liberado, sem delegacao.
- Plano: mapear geracao/fila/baixa; sincronizar somente frete na transacao da
  compra; complemento para pago; terceiro separado; bloquear reducao paga e
  titulos protegidos; testes de replay, concorrencia, rollback e negativas.
- Sem commit/push/deploy, migration ou banco real autorizado nesta etapa.
- Services/geracao reais com adaptadores isolados, replay/rollback/concorrencia,
  ACL/negativas, UI desktop/mobile, regressao SSE/modal, build, docs e sintaxe/diff
  aprovados. Handoff: 2026-10-15-compra-direta-frete-financeiro.md.

## Publicacao DEV Compra Direta/admissao - 2026-10-15

- Commit/push refactor/frontend autorizado; staging exclusivo dos ajustes e do
  script/teste de deploy dev. Validacoes locais aprovadas; ownership liberado.
- Sem main, EC2 pelo agente, alteracao de .env ou migration. Operador homologa.

## Compra Direta e catalogo admissao - 2026-10-15

- codex-compra-direta-admissao-20261015: finalizado local, sem delegacao;
  ownership liberado. Quantidade/frete com recalculo autorizado, titulos
  preservados, duas permissoes nominais e catalogo minimo de admissao.
- Backend/ACL, UI, visual/build/diff aprovados; pendencias de testes legados
  no handoff 2026-10-15-compra-direta-admissao. Sem banco real/deploy/Git.

## Pagamento RH cadastro atual - 2026-10-15

- Sessao codex-rh-pagamento-cadastro-atual-20261015: finalizado local, sem delegacao,
  ownership liberado. Usuario autorizou commit/push na continuacao; homologacao
  EC2 dev permanece com o operador, sem main ou migration nova.
- Plano: hidratar cadastro no backend sem escrita em GET; proteger save/envio;
  preservar formulario/workspace, testar autor/DP, parcial e historico financeiro.
- Sem banco real, migration, publicacao Git ou deploy.
- Backend/calculos/ACL/revisao/idempotencia, UI desktop/mobile/workspace/50%, build
  e diff aprovados; handoff 2026-10-15-pagamento-rh-cadastro-atual.md.

## Base e piloto Solicitacoes 2026-10-11

- codex-workspace-piloto-20261011: finalizado local, ownership liberado,
  sem delegacao. Isolamento/ACL, desempenho e QA de paginas reais conferidos.
- Publicacao Git na refactor/frontend autorizada em 12/10/2026; sem main,
  backend runtime, banco, migration ou deploy executado. Preservar
  auditoria financeira. Handoff: 2026-10-11-piloto-navegacao-solicitacoes.md.
- Nao anunciar E2 integral: modais financeiros/status e E3-E8 ficam posteriores.

## Mapa de navegacao e estado das abas 2026-10-11

- codex-mapa-navegacao-estado-20261011: finalizado, ownership liberado, sem delegacao.
- Plano: inventario estatistico rastreavel das rotas/fontes/APIs, diagnostico
  de desmontagem/historico, etapas e criterios de homologacao. Sem runtime.
- Reserva detalhada em OWNERSHIP_ATIVO.md. Auditoria financeira preservada.
- Entrega: 221 rotas/fontes rastreadas, diagnostico isolado e plano E0-E8,
  incluindo orcamento de desempenho. Aguardar autorizacao do piloto.

## Interacoes de solicitacoes - 2026-10-11
- Sessao codex-interacoes-solicitacoes-20261011: finalizado, ownership liberado, sem delegacao.
- Plano: armazenamento idempotente por evento/usuario, balão agrupado,
  leitura na visualizacao real, atalhos e testes isolados. Sem banco/EC2.

## Fila e publicacao dev 08/10/2026

- codex-fila-comprovante-pendente-2026-10-08: finalizado, sem delegacao;
  ownership liberado. Baixa sem PDF, recorte de pendencias e upload tardio
  validados sem banco real. PWA/LOTE-ID anteriores incluidos na publicacao
  autorizada apenas da refactor/frontend; main e deploy fora do escopo.
- Handoff: docs/handoffs/2026-10-08-fila-pendentes-comprovante.md.

## Lotes e PWA do autorizador 08/10/2026

- Sessao: codex-autorizacao-pwa-2026-10-08; status: finalizado; sem delegacao.
- LOTE-ID dentro da transacao, legado preservado, inicio direto e shell compacto
  somente no PWA instalado do autorizador nominal habilitado.
- Validacoes: fila backend, UI/convergencia, tela inicial, PWA/QA mobile,
  navegacao/abas, build e docs aprovados. Sem banco real ou publicacao.
  Ownership liberado; handoff em docs/handoffs/2026-10-08-autorizacao-lote-sequencial-pwa.md.

## Autorizacao sem expiracao e resumo do proprietario - 08/10/2026

- Sessao: codex-autorizacao-resumo-2026-10-08; status: finalizado.
- Plano: retirar prazo do lote sem alterar schema/snapshots; manter passkey curta; reorganizar identificacao e motivo sem mudar acoes. Compra Direta e Solicitacao de Compra mostram somente tipo, sem itens na descricao.
- Validacao: testes isolados do backend, UI/QA responsiva claro/escuro, build, sintaxe e documentacao aprovados. Sem banco real ou publicacao. Ownership liberado; handoff em docs/handoffs/2026-10-08-autorizacao-sem-expiracao-identificacao.md.


## Consulta de autorizacoes de pagamento 08/10/2026

- Sessao: codex-autorizacoes-consulta-2026-10-08.
- Status: finalizado.
- Plano: tornar opcional a associacao do titulo no lote, preservando soft delete e paginação dos lotes; testar SQL real, filtros, detalhes e negativa de permissao sem conexao de banco.
- Validacao: consulta SQL/hidratacao reais, regressao negativa, suite da fila, sintaxe, diff-check e documentacao aprovados.
- Pendencias: homologacao em dev apos commit/publicacao autorizados pelo usuario. Handoff: docs/handoffs/2026-10-08-autorizacoes-consulta-sql.md. Ownership liberado; sem banco real ou EC2 nesta etapa.

## Trabalho em andamento

- id: 2026-10-02-rhdp-jornadas-40-60
  sessao: codex-rhdp-jornadas-40-60-2026-10-02
  responsavel: Codex / sessao atual
  status: em_andamento
  escopo: separar envios e pagamentos 40%/60% de mensalistas, jornadas independentes de diaristas, rateio multiobra e vigencia do regime.
  pendencias: apropriacao contabil do acerto misto, integracao em banco dev e homologacao antes de ativar as flags; commit/push do codigo inativo autorizados, sem migration ou deploy.

## Trabalho planejado aguardando inicio

Nao ha nova implementacao planejada aguardando inicio nesta sessao.

## Trabalho concluido aguardando publicacao

- id: 2026-09-30-autorizacao-proprietario-pagamentos-pwa
  sessao: codex-autorizacao-proprietario-pagamentos-2026-09-30
  responsavel: Codex / sessao atual
  status: implementado localmente, inativo e aguardando commit/publicacao autorizados
  escopo: PWA, passkeys, push, dossie isolado e gate seguro antes da fila de pagamentos.
  validacao: teste especifico, sintaxe backend, build frontend e diff-check aprovados.
  pendencias: migration/configuracao em dev e homologacao `PILOT`; `ENFORCED` bloqueado.
  handoff: `docs/handoffs/2026-09-30-autorizacao-proprietario-pagamentos-pwa.md`.

- id: 2026-09-03-aditivo-direto-juridico
  sessao: codex-aditivo-direto-juridico-2026-09-03
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Encaminhar diretamente ao Juridico o aditivo de contrato cujo valor original ultrapassa o limite configuravel.
  feito:
    - Regra restrita ao termo aditivo; aprovacao inicial do contrato permaneceu inalterada.
    - Somente o valor original decide o destino; valores de aditivos nao entram na soma.
    - Exatamente no limite permanece GEO; contrato original acima segue para JURIDICO.
    - Historicos registram limite, valor original e destino calculado.
  pendencias:
    - Atualizar e reiniciar somente o backend dev para homologacao funcional.
  validacao:
    - Sintaxe, carregamento do servico, prova pura em quatro cenarios e diff check aprovados.

- id: 2026-08-27-auditoria-permissoes-granulares
  sessao: codex-auditoria-permissoes-granulares-2026-08-27
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Auditar e corrigir permissoes granulares entre cadastro, backend e frontend.
  feito:
    - `visualizar_todas` corrigida no detalhe sem conceder escrita.
    - Estado configurado vazio separado da compatibilidade legada.
    - Obras, Biblioteca, Comunicacao e espelho de pedido alinhados entre UI e API.
    - Catalogo de producao e auditor automatizado adicionados.
  pendencias:
    - Reinicio coordenado da porta 8100 e smoke autenticado no processo local.
  validacao:
    - Build aprovado, 338 chaves auditadas e provas somente de leitura aprovadas.
    - Ver `docs/handoffs/AUDITORIA_PERMISSOES_GRANULARES_2026-08-27.md`.

- id: 2026-08-26-aditivo-aprovado-volta-obra
  sessao: codex-aditivo-aprovado-volta-obra-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Devolver para OBRA a solicitacao vinculada ao aditivo aprovado.
  feito:
    - Aprovacao move a solicitacao para `OBRA / APROVADA` na mesma transacao.
    - Historicos de aprovacao e envio ao setor registrados.
    - Fluxos novo e legado contemplados.
  pendencias:
    - Nenhuma.
  validacao:
    - Suite QA reversivel e health check aprovados.
    - Ver `docs/handoffs/CONTRATO_ADITIVO_APROVADO_VOLTA_OBRA_2026-08-26.md`.

- id: 2026-08-26-remover-pagamentos-detalhe
  sessao: codex-remover-pagamentos-detalhe-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Remover selo Somente leitura, card Pagamentos e baixa parcial da tela de detalhes.
  feito:
    - Selo removido sem alterar a protecao interna da Obra.
    - Card Pagamentos e acao de baixa parcial deixaram de ser montados para todos os usuarios.
    - Dados, endpoints e telas do modulo Financeiro foram preservados.
  pendencias:
    - Nenhuma.
  validacao:
    - Build aprovado, 365 modulos transformados.
    - Ver `docs/handoffs/SOLICITACAO_DETALHE_REMOVER_PAGAMENTOS_2026-08-26.md`.

- id: 2026-08-26-financeiro-obra-somente-leitura
  sessao: codex-financeiro-obra-somente-leitura-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Exibir aba Financeiro para setor Obra sem acoes e respeitando o escopo de obras.
  feito:
    - Aba financeira liberada como leitura operacional da solicitacao.
    - Acoes financeiras, links de edicao e abertura da medicao removidos para Obra.
    - Resposta backend reduzida aos dados necessarios e protegida pelo escopo de obras.
  pendencias:
    - Nenhuma no ambiente local.
  validacao:
    - Build, teste com usuario real de Obra e health check aprovados.
    - Ver `docs/handoffs/SOLICITACAO_FINANCEIRO_OBRA_SOMENTE_LEITURA_2026-08-26.md`.

- id: 2026-08-26-fluxo-novo-pedido-aditivo
  sessao: codex-fluxo-novo-pedido-aditivo-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Encaminhar solicitacao do contrato do fluxo novo para GEO com status PED. ADITIVO.
  feito:
    - Encaminhamento e status gravados na mesma transacao do pedido.
    - Historicos de status e mudanca de setor registrados.
    - Status operacional cadastrado por migration idempotente.
  pendencias:
    - Nenhuma dentro da abertura do pedido de aditivo.
  validacao:
    - Migration local, teste reversivel e health check aprovados.
    - Ver `docs/handoffs/CONTRATO_FLUXO_NOVO_PEDIDO_ADITIVO_2026-08-26.md`.

- id: 2026-08-26-remover-numero-pedido-detalhe
  sessao: codex-remover-numero-pedido-detalhe-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Remover o Numero do Pedido da tela de detalhes sem apagar dados ou integracoes legadas.
  feito:
    - Componente e acao de edicao removidos da tela para todos os usuarios.
    - Campo no banco, endpoint, busca e historicos legados preservados.
  pendencias:
    - Nenhuma.
  validacao:
    - `npm run build`: aprovado, 364 modulos.

- id: 2026-08-26-ocultar-trava-parcelas
  sessao: codex-ocultar-trava-parcelas-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Ocultar a coluna Trava da montagem de parcelas, preservando a logica interna.
  feito:
    - Cabecalho, coluna e botao removidos da apresentacao.
    - Fixacao automatica ao editar valor preservada.
  pendencias:
    - Nenhuma.
  validacao:
    - `npm run build`: aprovado, 365 modulos.

- id: 2026-08-26-formas-pagamento-nova-solicitacao
  sessao: codex-formas-pagamento-nova-solicitacao-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Corrigir a tela interrompida, explicitar a configuracao global de formas e validar o salvamento dos campos.
  feito:
    - Correcao de forma nula e atalhos de configuracao implementados.
    - Backend local reiniciado; catalogo atual de 24 campos carregado.
    - Persistencia temporaria confirmada e estado original restaurado.
  pendencias:
    - Nenhuma no ambiente local.
  validacao:
    - Build e navegador autenticado aprovados.
    - Ver `docs/handoffs/FORMAS_PAGAMENTO_NOVA_SOLICITACAO_2026-08-26.md`.

- id: 2026-08-26-adm-pagamento
  sessao: codex-adm-pagamento-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Credor como favorecido, chave PIX automatica/editavel, boleto obrigatorio e ocultacao
    visual da apropriacao automatica.
  feito:
    - Implementacao e migration local concluidas.
    - Ver `docs/handoffs/NOVA_SOLICITACAO_FAVORECIDO_PIX_BOLETO_2026-08-26.md`.
  pendencias:
    - Reiniciar o backend com aviso previo e executar teste visual controlado.
  validacao:
    - build, sintaxe, regras puras e banco aprovados.


- id: 2026-08-20-compras-catalogacao-itens-manuais
  sessao: codex-compras-catalogacao-2026-08-20
  responsavel: Codex / fluxo de Compras
  status: concluido_e_validado_localmente
  escopo: Permitir tratar itens manuais na tela de detalhe, vinculando ou criando insumo oficial com permissao granular, auditoria e reutilizacao futura.
  arquivos:
    - ver docs/workspace/OWNERSHIP_ATIVO.md
  feito:
    - Escopo e dependencias existentes auditados em modo leitura.
    - Arquitetura nao destrutiva definida.
    - Migration, modelos, endpoint transacional e permissao granular implementados.
    - Interface expansivel, aliases, ultimo preco e relatorios integrados.
    - Testes especificos, responsividade e build de producao aprovados.
    - Migration aplicada em localhost/fluxy_main_copia e repetida com sucesso.
    - Integracao local aprovada, inclusive concorrencia, aliases, ultimo preco e relatorios.
  pendencias:
    - Separar commit das mudancas simultaneas de Contratos.
    - Revisar visualmente a tela no navegador local.
    - Conceder a nova permissao aos usuarios autorizados.
  validacao:
    - Ver docs/handoffs/COMPRAS_CATALOGACAO_ITENS_MANUAIS_2026-08-20.md
  observacoes:
    - Modulo de Contratos esta fora deste ownership.
    - Migration executada somente no banco local fluxy_main_copia.
    - Nenhum acesso a GitHub, EC2 ou producao foi realizado.
- id: 2026-08-31-data-resposta-pagamento
  sessao: codex-data-resposta-pagamento-2026-08-31
  responsavel: Codex / sessao atual
  status: implementado_aguardando_commit
  escopo: Separar a Data Resposta/Pagamento da solicitacao dos vencimentos das parcelas do CONTRATO.
  feito:
    - Campo habilitado no fluxo novo de CONTRATO conforme configuracao por tipo.
    - Rotulo alinhado na criacao, lista, detalhe, filtros, exportacao, historico e validacoes.
    - Backend grava a data informada na solicitacao sem deriva-la da primeira parcela.
    - Build, sintaxe e teste de vencimento aprovados.
  pendencias:
    - Commit e validacao funcional no ambiente dev.
  validacao:
    - Ver `docs/handoffs/DATA_RESPOSTA_PAGAMENTO_SOLICITACOES_2026-08-31.md`.
- id: 2026-08-31-projecao-reajuste-parcelas-medicao
  sessao: codex-data-resposta-pagamento-2026-08-31
  responsavel: Codex / sessao atual
  status: implementado_aguardando_commit
  escopo: Mostrar na medicao os valores projetados das parcelas reajustadas pela edicao.
  feito:
    - Projecao visual alinhada a redistribuicao em cascata do backend.
    - Previsto preservado e parcelas afetadas identificadas.
    - Build e quatro cenarios de calculo aprovados.
  pendencias:
    - Commit e validacao visual no ambiente dev.
  validacao:
    - Ver `docs/handoffs/PROJECAO_REAJUSTE_PARCELAS_MEDICAO_2026-08-31.md`.

## Promocao isolada da vigencia - 2026-10-08

- Sessao: codex-contrato-vigencia-main; estado: em_andamento; worktree compras-criacao-main, branch codex/contrato-vigencia-main.
- Base: origin/main ba8c9816. Origem da correcao: f5ba51f3, sem incorporar seu pai financeiro 3a470ece.
- Arquivos reservados: ContratoController.js, operationalValidators.js, contratoVigenciaEdicao.js, validarContratoVigenciaEdicao.js, GestaoContratos.jsx, validarContratoVigenciaEdicao.mjs, docs/modulos/contratos/README.md e docs/handoffs/2026-10-08-edicao-vigencia-contrato.md.
- Somente edicao da vigencia, testes e documentacao. Usuario autorizou integrar isoladamente na main. Nenhum acesso a EC2/banco ou deploy backend.

Sessao codex-contrato-vigencia-main: finalizado; testes backend/UI, build e documentacao aprovados na base isolada da main. Ownership liberado. Handoff: docs/handoffs/2026-10-08-edicao-vigencia-contrato.md. Sem EC2/banco; somente publicacao Git autorizada.

## Edicao de vigencia contratual - 2026-10-08

- Sessao: codex-contrato-vigencia-2026-10-08; responsavel: agente desta conversa.
- Estado: em_andamento.
- Reservados: frontend/src/pages/GestaoContratos.jsx; backend/src/controllers/ContratoController.js; backend/src/validators/operationalValidators.js; backend/src/services/contratoVigenciaEdicao.js; backend/scripts/validarContratoVigenciaEdicao.js; frontend/scripts/validarContratoVigenciaEdicao.mjs; docs/modulos/contratos/README.md; docs/handoffs/2026-10-08-edicao-vigencia-contrato.md.
- Escopo: editar inicio/fim da vigencia com validacao e historico, preservando parcelas, medicoes, titulos e pagamentos. Sem banco real, EC2, migration, commit, push ou deploy.
- Colaboracao: usuario informou outro agente em autorizacao/fila de pagamentos. Esses fluxos, routes.js e package.json ficam fora desta reserva. Registros do painel apenas acrescentados, preservando os anteriores.

Sessao codex-contrato-vigencia-2026-10-08: finalizado. Edicao e validacoes locais concluidas; ownership integralmente liberado. Handoff: docs/handoffs/2026-10-08-edicao-vigencia-contrato.md. Sem banco real, EC2, commit, push ou deploy desta tarefa. Autorizacao/fila de pagamentos preservadas.
