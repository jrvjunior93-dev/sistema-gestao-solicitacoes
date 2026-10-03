# Handoff - Custos e Recebiveis - Mockup Final para implantacao

## Objetivo

Consolidar os mockups anteriores (v1, v2, v3, v3-completo e contas-bancarias) e o
contrato funcional dos planos em um unico mockup final, ja no shell nativo do
Fluxy, pronto para virar especificacao de implementacao apos aprovacao, sem
quebrar nem causar regressao no sistema atual.

## Artefato

- `.codex-previews/custos-recebiveis-fluxy-final.html`

Prototipo navegavel, autocontido, sem backend e sem persistencia. Abrir em
navegador comum (o navegador integrado bloqueia `file://`).

## O que muda em relacao aos mockups anteriores

| Aspecto | Mockups anteriores (v1..v3-completo) | Mockup final |
| --- | --- | --- |
| Estilo visual | Estilo "codex" compacto, standalone | Shell nativo Fluxy: sidebar, topbar, PageHeader, context bar |
| Tokens | Cores proprias do prototipo | Tokens reais de `frontend/src/index.css` (subconjunto fiel) |
| Tema | Claro apenas | Claro + escuro com toggle (mesma paleta `.dark` do Fluxy) |
| Publica/Privada | Telas separadas | Discriminador unico `Obra.classificacao` no context bar altera campos/indicadores |
| Bancario | Mockup separado | Secao "Contas Bancarias (resumido)" integrada ao mesmo shell |

## Cobertura funcional

### Custos e Recebiveis (completo)

1. Visao geral - KPIs (obras no escopo, pendentes, planejado custos/recebiveis,
   comprometido, incorrido, pago/recebido, saldo bancario), camadas de valor
   (Previsto -> Comprometido -> Incorrido -> Realizado), alertas de prazo e obras
   pendentes.
2. Obras - lista respeitando escopo; obra sem vinculo aparece esmaecida e sem
   acesso ao detalhe; criacao/edicao continua pertencendo ao modulo Obras.
3. Workspace da obra - abas Estrutura micro, Registrar competencia, Historico
   mensal, Comparativos, Realizados e solicitacoes, Auditoria.
4. Planejamento mensal - assistente em 3 etapas; etapa 1 muda conforme a
   classificacao (medicao para publica, contratos/parcelas/titulos para privada);
   etapa 2 custos comum; etapa 3 revisao com snapshot.
5. Comparativo - base selecionavel (Medido previsto / Realizado consolidado),
   indicadores e tabela macro com desvio.
6. Custo realizado - solicitacao -> pedido -> titulo -> baixa; realizado apenas
   por baixa ativa; item nao mapeado vai para fila de reconciliacao.
7. Obrigacoes e prazos - modo observacao, contagem regressiva D-7/D-3/D-1/vencido,
   campos candidatos a obrigatorios, bypass auditado.
8. Importacoes - versionamento da planilha micro; validar antes de publicar.
9. Exportacoes - relatorios independentes (CSV simulado local + XLSX simulado).
10. Configuracoes - catalogo granular `custos_recebiveis.*` com toggles.

### Contas Bancarias (resumido)

- Posicao bancaria - saldos normalizados com provedor, timestamp e estado de sync.
- Conciliacao - movimento externo x baixa, regra anti-dupla-contagem.
- Integracao TotalBank - estado, token, webhooks marcados "a homologar",
  preservacao do fluxo Banco do Brasil.

## Regras de negocio preservadas no mockup (do plano e da matriz)

- Realizado usa exclusivamente baixas ativas; pedido/solicitacao sao origem.
- Permissao de acao nunca amplia escopo de obra/empresa/conta.
- Escopo por `UsuarioObra`; `escopo.todas_obras` e permissao explicita; Financeiro
  e Diretoria nao recebem escopo amplo por setor.
- Planilha micro versionada; nunca sobrescreve o orcamento macro de Obras.
- Competencia fechada e imutavel; reimportacao cria nova versao.
- Bloqueio global sempre em modo observacao neste protótipo.
- Falha de integracao bancaria nunca bloqueia o usuario.
- Privada: contrato -> parcela -> titulo -> baixa, sem medicao e sem dupla contagem.
- Auditoria append-only.

## Garantia de nao-regressao

- Nenhum arquivo de runtime (backend/frontend), rota, migration, model, service,
  controller ou permissao foi criado ou alterado nesta etapa.
- O artefato e um unico HTML em `.codex-previews/`, fora do build do frontend.
- Nao ha chamada a API, webhook, credencial ou banco.
- Provisionamento atual permanece intacto e nao e dependencia.

## Validacoes executadas

- `node --check` do script incorporado: aprovado.
- Conferidas as 13 telas (`VIEWS.*`) definidas e roteadas pela navegacao.
- Tokens claro/escuro derivados de `frontend/src/index.css` (`:root` e `.dark`).
- Estrutura do shell alinhada a `Layout.jsx` e `PageHeader.jsx`.

## Proximo passo exato (apos aprovacao visual)

1. Congelar o inventario de telas deste mockup como contrato da Fase 0.
2. Fechar as decisoes de negocio pendentes (secao 8 do plano e secao 11 da matriz):
   campos obrigatorios por classificacao, prazos, responsavel/substituto, bypass.
3. Transformar cada acao aprovada em contrato de API (endpoint, payload, resposta,
   permissao granular, escopo, idempotencia, transacao e evento de auditoria).
4. Somente entao iniciar a Fase 1 em branch propria, protegida por feature flag:
   models, migrations, permissoes e vinculo somente leitura com Obras.

## Referencias

- Plano: `docs/modulos/custos_recebiveis_totalbank_plano.md`
- Matriz campo a campo: `docs/modulos/custos_recebiveis_matriz_fontes_permissoes.md`
- Mockup v3 completo (predecessor): `docs/modulos/custos_recebiveis_mockup_v3_completo.md`
- Handoffs anteriores: `HANDOFF_CUSTOS_RECEBIVEIS_V3_COMPLETO.md`,
  `HANDOFF_CUSTOS_RECEBIVEIS_TOTALBANK.md`
