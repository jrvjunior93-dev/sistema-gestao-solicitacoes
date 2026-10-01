# Handoff Global

Nao ha handoff multirrepositorio ativo.

Quando houver uma sessao explicitamente autorizada, registrar data, repositorios, arquivos, validacoes, riscos e proximo passo. Handoffs concluidos permanecem no historico do Git e nao devem continuar como estado ativo.

## 2026-09-03 — Aditivo acima do limite segue direto ao Juridico

- Sessao: `codex-aditivo-direto-juridico-2026-09-03`
- Status: finalizado e validado sem escrita no banco
- Handoff: `docs/handoffs/CONTRATO_ADITIVO_DIRETO_JURIDICO_2026-09-03.md`
- Regra exclusiva do termo aditivo: somente o valor original do contrato decide entre `GEO / PED. ADITIVO` e
  `JURIDICO / PENDENTE`, usando `CONTRATO_LIMITE_JURIDICO`; os aditivos nao entram na soma.
- Validacoes: sintaxe, fronteira monetaria e independencia do valor do aditivo aprovadas.
- Proximo passo: atualizar e reiniciar somente o backend dev para homologacao funcional.

## 2026-08-26 — Nova Solicitacao: favorecido, PIX e boleto

- Sessao: `codex-adm-pagamento-2026-08-26`
- Status: finalizado localmente
- Handoff: `docs/handoffs/NOVA_SOLICITACAO_FAVORECIDO_PIX_BOLETO_2026-08-26.md`
- Validacoes: build, sintaxe, regras puras e migration local aprovados.
- Proximo passo: reiniciar o backend com aviso previo e validar visualmente sem executar suites de
  QA concorrentes.

## 2026-08-26 — Formas de pagamento e persistencia dos campos

- Sessao: `codex-formas-pagamento-nova-solicitacao-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/FORMAS_PAGAMENTO_NOVA_SOLICITACAO_2026-08-26.md`
- Validacoes: build, navegador autenticado e persistencia reversivel pela API aprovados.
- Observacao: backend local da porta 8100 reiniciado para carregar o catalogo atual de 24 campos.

## 2026-08-26 — Coluna Trava das parcelas ocultada

- Sessao: `codex-ocultar-trava-parcelas-2026-08-26`
- Status: finalizado e validado localmente
- Arquivo: `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- Alteracao: coluna e botao Trava removidos da tabela; fixacao automatica de valores editados foi preservada.
- Validacao: `npm run build` aprovado, 365 modulos transformados.
- Backend e banco nao foram alterados.

## 2026-08-26 — Numero do Pedido removido da tela de detalhes

- Sessao: `codex-remover-numero-pedido-detalhe-2026-08-26`
- Status: finalizado e validado localmente
- Arquivo: `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- Alteracao: componente de exibicao e edicao do Numero do Pedido removido da tela para todos os usuarios.
- Compatibilidade: dados existentes, endpoint, busca e historicos legados foram preservados.
- Validacao: `npm run build` aprovado, 364 modulos transformados.
- Backend e banco nao foram alterados.

## 2026-08-26 — Pedido de aditivo encaminhado para a Gerencia de Processos

- Sessao: `codex-fluxo-novo-pedido-aditivo-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/CONTRATO_FLUXO_NOVO_PEDIDO_ADITIVO_2026-08-26.md`
- Regra: contrato do fluxo novo encaminha sua solicitacao-mae para `GEO / PED. ADITIVO` ao solicitar aditivo.
- Validacoes: migration local, teste reversivel com limpeza conferida e health check 200.
- Backend local iniciado na porta 8100.

## 2026-08-26 — Financeiro da solicitacao visivel para Obra

- Sessao: `codex-financeiro-obra-somente-leitura-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/SOLICITACAO_FINANCEIRO_OBRA_SOMENTE_LEITURA_2026-08-26.md`
- Regra: setor Obra acompanha o resumo financeiro das solicitacoes das obras vinculadas, sem
  acoes financeiras nem acesso ao modulo Financeiro.
- Seguranca: resposta somente leitura reduzida e validacao backend mantida por escopo de obra.
- Validacoes: build, consulta real somente de leitura e health check aprovados.

## 2026-08-26 — Card Pagamentos removido do detalhe da solicitacao

- Sessao: `codex-remover-pagamentos-detalhe-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/SOLICITACAO_DETALHE_REMOVER_PAGAMENTOS_2026-08-26.md`
- Alteracao: selo Somente leitura, card Pagamentos e acao Informar pagamento parcial removidos da
  tela de detalhes para todos os usuarios.
- Compatibilidade: dados, endpoints e telas proprias do Financeiro preservados.
- Validacao: build aprovado, 365 modulos transformados.

## 2026-08-26 — Aditivo aprovado devolve a solicitacao para Obra

- Sessao: `codex-aditivo-aprovado-volta-obra-2026-08-26`
- Status: finalizado e validado localmente
- Handoff: `docs/handoffs/CONTRATO_ADITIVO_APROVADO_VOLTA_OBRA_2026-08-26.md`
- Regra: aprovacao do termo aditivo move a solicitacao de `GEO / PED. ADITIVO` para
  `OBRA / APROVADA`, na mesma transacao das parcelas.
- Validacoes: suite QA reversivel, limpeza e health check aprovados.

## 2026-08-27 — Fluxo de Recarga de Cartao

- Sessao: `codex-recarga-cartao-2026-08-27`.
- Status: implementado e validado localmente.
- Handoff: `docs/handoffs/RECARGA_CARTAO_2026-08-27.md`.
- Regra: titulo nasce como previsao sem custo de obra; pagamento parcial encerra pelo valor pago;
  prestacao e rateio independem da conciliacao; custo entra nas obras somente apos validacao GEO.
- Validacoes: build, QA transacional com rollback, relatorios de obras e rota autenticada.

## 2026-09-30 — Autorização do proprietário para pagamentos

- Sessão: `codex-planejamento-autorizacao-proprietario-2026-09-30`.
- Status: implementação local concluída e inativa; sem commit/push/deploy nesta tarefa.
- Documento canônico: `docs/modulos/financeiro/AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`.
- Handoff: `docs/handoffs/2026-09-30-autorizacao-proprietario-pagamentos-pwa.md`.
- Regra de segurança: o código permanece desativado com
  `PAYMENT_OWNER_APPROVAL_MODE=OFF`; valor ausente ou inválido também significa `OFF`.
- Entrega: schema-only, domínio idempotente, reuso da fila, dossiê isolado, passkeys,
  revogação, PWA responsiva, push genérico, preflight e testes de contrato.
- Próximo passo: promoção em dev ainda em `OFF`, migration, preflight e homologação
  controlada em `PILOT`; `ENFORCED` continua bloqueado até aceite.
- Ambientes externos: nenhum acesso, deploy, migration ou ativação realizado.

## 2026-09-30 — Revisao completa da documentacao

- Sessao: `codex-revisao-documentacao-completa-2026-09-30`.
- Status: concluida localmente; sem commit ou push nesta etapa.
- Handoff: `docs/handoffs/2026-09-30-revisao-documentacao-completa.md`.
- Escopo: entradas raiz, contexto, arquitetura, modulos, seguranca, colaboracao,
  deploy e classificacao do historico reconciliados com `ca6ac22a`.
- Validacoes: 438 Markdown sem links locais quebrados, `npm run test:docs` aprovado
  com 19 canonicos e `git diff --check` aprovado.
- Ambientes externos: nenhum banco, migration, deploy, API ou processo PM2 acionado.
