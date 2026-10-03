# Handoff - Custos e Recebiveis + Contas Bancarias TotalBank

## Estado

Planejamento e mockups em refinamento. O mockup de Custos e Recebiveis v2 foi
aprovado. Nenhum arquivo de runtime, rota, banco ou permissao de producao foi
alterado.

Em 2026-07-13, os 14 PDFs `Planejamento Mensal de Custos e Recebiveis - Obras Publicas` foram analisados como sequencia unica e cruzados com o codigo atual do Fluxy. Foi criado um mockup visual v2 sem editar o runtime.

## Decisoes confirmadas

- Custos e Recebiveis sera um modulo novo e independente.
- Provisionamento atual permanece intacto e nao e dependencia do novo modulo.
- Obras > Gerenciamento de Obra permanece como orçamento macro.
- O novo modulo armazena a planilha micro propria, versionada e vinculada ao macro somente por referencia.
- Contas Bancarias normaliza TotalBank/BB; Custos e Recebiveis nao chama provedores diretamente.
- Permissao de acao nunca amplia visibilidade de obra, empresa ou conta.
- Bloqueio global so pode ser ativado depois de periodo de observacao e aceite do negocio.
- Usuario operacional ve somente obras vinculadas em `UsuarioObra`.
- Acesso transversal de Diretoria e Financeiro sera uma permissao explicita do
  novo modulo, nunca uma liberacao automatica por setor.
- SUPERADMIN possui escopo total e nao fica sujeito ao bloqueio global.
- Movimento financeiro ativo e a fonte oficial do pago/recebido; solicitacao e
  pedido permanecem como origem/comprometido, nao como prova de caixa.
- Rateios do titulo devem ser aplicados antes de qualquer agregacao por obra ou
  apropriacao.

## Inventario funcional incorporado

- Dashboard, obras/workspace, orçamento micro, importacao/reimportacao e versionamento.
- Assistente mensal, previsao de medicao/recebivel e custo.
- Medicao consolidada, historico, comparativos, solicitacoes/titulos e realizados.
- Competencia fechada, solicitacao de abertura e acao ADM.
- Exportacoes de medicao, custo, comparativo, realizado, solicitacoes/titulos e resumo.
- Contas, saldos, extratos, cobrancas/DDA, PIX, pagamentos, folha, favorecidos, guias, conciliacao, integracao e auditoria bancaria.

## TotalBank confirmado em homologacao

- Usuario gateway criado.
- Base `https://api.totalbank.com.br/hmg-api/`.
- Swagger `https://api.totalbank.com.br/hmg-api/swagger.html`.
- Token em `POST /rest/token`, com duracao informada de 5 minutos.
- Tipos de webhook visiveis: Cobranca, Pagamento, PIX Recebivel, Notificacao Cob, Conciliacao Titulo Liquidado e Conciliacao Titulo Tarifa.
- Pagamento permite filtrar convenio, forma e meios GATEWAY/REMESSA/SITE.
- OAuth 2.0 opcional exige callback proprio.

## Artefatos

- Plano: `docs/modulos/custos_recebiveis_totalbank_plano.md`.
- Matriz detalhada: `docs/modulos/custos_recebiveis_matriz_fontes_permissoes.md`.
- Mockup Custos e Recebiveis: `.codex-previews/custos-recebiveis-fluxy.html`.
- Mockup Custos e Recebiveis v2, baseado nos 14 PDFs: `.codex-previews/custos-recebiveis-fluxy-v2.html`.
- Mockup Contas Bancarias: `.codex-previews/contas-bancarias-totalbank-fluxy.html`.

## Validacoes executadas

- Inventario do `index (1).html` e do PDF funcional.
- Inventario visual e funcional de todos os 14 PDFs do diretor.
- Cruzamento com `ObraGestao.jsx`, `obraGestaoService.js` e permissao granular atual.
- Cruzamento com `PageHeader.jsx`, `FinanceiroResultadoObras.jsx` e `moduloPermissoes.js`.
- Cruzamento visual com o portal TotalBank de homologacao.
- Mockup de Custos e Recebiveis validado em desktop sem overflow global.
- Navegacao validada nas abas Planejamento mensal, Obrigacoes e prazos, Importacoes e Configuracoes.
- Mockup de Contas Bancarias validado em desktop sem overflow global.
- Navegacao bancaria validada em Contas, Pagamentos, Conciliacao e Integracao.
- Acao simulada `Testar entrega` validada com retorno visual por toast.
- Mockup bancario validado em viewport movel de 390 x 844 sem overflow global.
- Nenhum endpoint real, webhook, credencial, migration ou regra de bloqueio foi ativado.
- Mockup v2 possui as telas Dashboard, Comparativo, Custo realizado, Obras, workspace da obra, assistente mensal em duas etapas, Importacoes, Exportacoes e Obrigacoes/prazos.
- Navegacao interna do mockup v2 foi verificada estruturalmente: todos os destinos apontam para telas existentes e nao ha IDs duplicados.
- A nomenclatura do prototipo foi adaptada: `Pedidos` virou `Solicitacoes e titulos`, e `Puxar pedidos finalizados` virou `Atualizar realizacoes`.
- O navegador integrado bloqueou a abertura local por politica de seguranca de `file://`; nao foi usado servidor local nem outro contorno. A validacao final no navegador comum fica a cargo do usuario.
- O mockup v2 foi aprovado pelo usuario e segue como contrato visual da Fase 0.
- Foram mapeadas as fontes reais `Obra`, `EmpresaGrupo`, `Apropriacao`,
  `UsuarioObra`, `Solicitacao`, `SolicitacaoCompra`, `PedidoCompra`,
  `PedidoCompraItem`, `TituloFinanceiro`, `TituloFinanceiroRateio`,
  `MovimentoFinanceiro`, `ObraCustoHistorico`, `ContaBancaria`,
  `CategoriaFinanceira` e `Parceiro`.
- Foi identificado que `ResultadoObrasController` agrega por `obra_id` sem o
  escopo/rateio final exigido e que `obraGestaoService` nao resolve todos os
  rateios necessarios. Eles nao devem ser reutilizados como contrato final do
  novo modulo.
- A matriz detalhada cobre todas as telas aprovadas do mockup, inclusive
  importacoes versionadas, exportacoes autorizadas, obrigacoes/prazos e
  auditoria append-only.

## Proximo passo exato

1. Validar com o usuario a matriz de fontes e responsabilidades em
   `docs/modulos/custos_recebiveis_matriz_fontes_permissoes.md`.
2. Definir quais campos manuais candidatos sao obrigatorios por tipo de obra.
3. Definir responsavel, substituto, prazo, tolerancia, aprovacao, reabertura e
   bypass antes de desenhar o guard de bloqueio.
4. Extrair do Swagger a matriz de endpoints/payloads sem registrar credenciais.
5. Homologar autenticacao, contas, saldos, extratos e webhooks em uma prova tecnica isolada.
6. Somente depois criar uma branch da Fase 0, limitada a feature flags, permissoes e migrations de fundacao.

## Riscos

- Reutilizar Provisionamento criaria acoplamento e migracao destrutiva; decisao atual evita isso.
- Sobrescrever orçamento macro a partir do micro pode alterar relatorios existentes; nao permitido sem acao futura explicita.
- Ativar guard antes de observar as obrigacoes pode bloquear usuarios indevidamente.
- Assumir endpoints TotalBank nao documentados pode gerar desenho incorreto; cada capacidade permanece `a homologar` ate prova no Swagger.

## Atualizacao 2026-07-23 - trilhas publica e privada

- Confirmado que `Obra.classificacao` permanece como discriminador do modulo.
- Confirmado que permissao funcional nao amplia escopo de obra.
- Identificada lacuna do mockup v2: a experiencia estava orientada a obras
  publicas e medicoes.
- Definida a trilha privada sem medicao:
  - planejamento geral de Obras como referencia macro;
  - previsao por contratos de venda, parcelas e titulos a receber;
  - realizado pelas baixas ativas;
  - TotalBank somente como saldo/conciliacao/evidencia.
- Definida prioridade de fontes para impedir dupla contagem.
- Acrescentadas permissoes especificas de recebiveis, inadimplencia e consulta
  contextual de contratos.

## Proximo passo exato atualizado

1. Validar o mockup v3 nas jornadas PUBLICA e PRIVADA.
2. Confirmar quais obrigacoes privadas exigem apenas revisao e quais permitem
   ajuste manual.
3. Confirmar se usuarios de obra privada visualizam dados por cliente/unidade ou
   somente totais por competencia.
4. Depois da aprovacao, transformar o mockup e a matriz em contratos de API e
   migrations da Fase 0, ainda protegidos por feature flag.

## Mockup v3 validado estruturalmente

- Artefato: `.codex-previews/custos-recebiveis-fluxy-v3.html`.
- Mantem selecao explicita entre obras PUBLICAS e PRIVADAS.
- Jornada publica preserva planejamento micro, medicoes e recebiveis.
- Jornada privada nao simula medicao e usa a cadeia:
  contrato de venda -> parcela contratual -> titulo financeiro -> baixa ativa.
- Inclui planejamento geral, recebiveis, custos, realizado, inadimplencia e
  auditoria para obras privadas.
- Registra que o backend deve reaplicar escopo de obra, permissao e
  classificacao antes de consultar, agregar, exportar ou salvar.
- JavaScript incorporado validado sintaticamente e todos os marcos semanticos
  das duas jornadas foram encontrados no arquivo.
- Nenhum controller, service, model, migration, rota ou regra de runtime foi
  alterado nesta etapa.

## Atualizacao 2026-07-23 - v3 navegavel

### Escopo concluido

- adicionada navegacao operacional aos botoes do mockup v3;
- adicionados formularios simulados para previsao mensal, planejamento,
  medicoes, custos, recebiveis, cobranca, obrigacoes e auditoria;
- preservada a separacao visual e funcional entre obra publica e privada;
- adicionados resumo de atividade, confirmacoes e toasts;
- exportacao simulada gera CSV local;
- nenhuma chamada real ao backend foi introduzida.

### Validacoes

- os scripts incorporados passaram por validacao sintatica;
- o mockup abriu no navegador local;
- o fluxo `Novo mes` abriu o formulario operacional;
- os marcadores das jornadas publica e privada foram conferidos.

### Limite de seguranca

Este artefato continua sendo um prototipo. Ele nao altera permissoes,
visibilidade, classificacao de obra, titulos, medicoes, contratos, baixas ou
movimentos bancarios.

### Proximo passo exato

Validar com o usuario cada formulario e, depois da aprovacao, documentar
endpoint, payload, resposta, permissao granular, escopo de obra, idempotencia,
transacao e evento de auditoria de cada acao antes de iniciar o runtime.
