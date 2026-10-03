# Custos e Recebiveis - Matriz de fontes, responsabilidades e permissoes

## 1. Objetivo e estado

Este documento e o contrato funcional da proxima etapa de refinamento do modulo
`Custos e Recebiveis`. O mockup visual v2 esta aprovado. Esta etapa define, antes
de qualquer implementacao:

- de onde vem cada informacao exibida;
- quais dados sao automaticos, calculados ou manuais;
- quem pode visualizar, preencher, revisar e aprovar;
- como o escopo de obras deve ser aplicado;
- quais campos podem futuramente gerar obrigacao e bloqueio.

Nenhuma regra descrita aqui esta ativa no runtime. O documento nao altera tabelas,
rotas, permissoes nem o modulo Provisionamento atual.

## 2. Convencoes da matriz

| Codigo | Significado |
| --- | --- |
| `AUTO` | Copiado de uma fonte existente do Fluxy; nao editavel no modulo |
| `CALC` | Calculado pelo projetor do novo modulo; nao editavel diretamente |
| `MAN-OBR` | Entrada manual candidata a obrigatoria |
| `MAN-OPC` | Entrada manual opcional |
| `SNAP` | Snapshot gravado ao finalizar/publicar uma competencia |
| `EXT` | Origem externa normalizada pelo modulo Contas Bancarias |

Uma informacao automatica nunca deve ser transformada em campo manual apenas para
permitir uma correcao. Divergencias devem ser tratadas na fonte ou por uma acao de
reconciliacao auditada.

## 3. Regra de escopo de obras

### 3.1 Regra aprovada

O escopo do novo modulo deve ser resolvido de forma propria e conservadora:

1. `SUPERADMIN`: todas as obras.
2. Usuario com `custos_recebiveis.escopo.todas_obras`: todas as obras permitidas
   pelo ambiente.
3. Demais usuarios: somente obras existentes em `UsuarioObra` para o usuario.
4. Usuario sem obra vinculada e sem escopo amplo: lista vazia e acesso ao detalhe
   negado.

Pertencer aos setores Financeiro ou Diretoria nao concede acesso amplo por si so.
Os usuarios desses setores que precisarem de visao transversal devem receber a
permissao explicita `custos_recebiveis.escopo.todas_obras`.

### 3.2 Separacao obrigatoria entre escopo e acao

- Permissao de acao nao amplia escopo.
- Ter permissao para editar planejamento nao libera uma obra nao vinculada.
- Ter permissao para ver saldo bancario nao libera uma empresa/conta nao autorizada.
- Listas, indicadores, exportacoes, notificacoes e downloads devem usar o mesmo
  resolvedor de escopo.
- A API deve filtrar o escopo antes de agregar valores; nao deve buscar tudo e
  esconder apenas no frontend.
- Toda rota de detalhe ou mutacao deve validar novamente `obra_id` no backend.

### 3.3 Cuidado com a regra legada

O helper atual `getUserObraScopeIds` pode retornar todas as obras para setores
configurados em `SETORES_ACESSO_TODAS_OBRAS`. O novo modulo nao deve herdar essa
ampliacao implicitamente. O policy do dominio deve usar:

- excecao de `SUPERADMIN`;
- a nova permissao explicita de escopo amplo;
- `getUserObraIds`/`UsuarioObra` para o restante.

Isso evita que uma configuracao criada para outro fluxo amplie a visibilidade de
custos, recebiveis ou saldos bancarios.

## 4. Hierarquia das fontes de verdade

| Camada | Fonte de verdade | Regra |
| --- | --- | --- |
| Cadastro da obra | `Obra` + `EmpresaGrupo` | Somente leitura no novo modulo |
| Orcamento macro | `Apropriacao` e referencias de Obras | Nao sobrescrever automaticamente |
| Estrutura micro | Novas tabelas `cr_planos_*` | Versionada e publicada por obra |
| Planejamento | Novas tabelas `cr_previsoes_*` | Manual, mensal e auditado |
| Comprometido | `PedidoCompra` + `PedidoCompraItem` | Apenas pedido valido/nao cancelado |
| Incorrido | `TituloFinanceiro` ativo | Titulo criado, ainda nao e caixa realizado |
| Pago/recebido | `MovimentoFinanceiro` ativo | Fonte oficial do realizado financeiro |
| Rateio | `TituloFinanceiroRateio` | Aplicar antes de agregar por obra/apropriacao |
| Historico legado | `ObraCustoHistorico` ativo | Exibir com origem destacada |
| Origem operacional | `Solicitacao`/`SolicitacaoCompra` | Rastreabilidade; nao prova pagamento |
| Saldo/extrato bancario | Read model do modulo Contas Bancarias | Sempre com data, provedor e estado de sync |

## 5. Matriz campo a campo

### 5.1 Contexto, filtros e cabecalho

| Informacao | Modo | Fonte tecnica | Regra de preenchimento | Permissao |
| --- | --- | --- | --- | --- |
| Obra | `AUTO` | `Obra.id`, `codigo`, `nome` | Lista limitada pelo resolvedor de escopo | `custos_recebiveis.obras.visualizar` |
| Empresa | `AUTO` | `Obra.empresa_grupo_id` -> `EmpresaGrupo` | Derivada da obra; nao selecionada livremente | mesma da obra |
| Classificacao publica/privada | `AUTO` | `Obra.classificacao` | Define regras e indicadores aplicaveis | mesma da obra |
| Cidade/UF | `AUTO` | `Obra` | Somente contexto visual | mesma da obra |
| Competencia | `MAN-OBR` | `cr_competencias` | Mes/ano; unica por obra e tipo de ciclo | `planejamento.visualizar` |
| Estado da competencia | `CALC` | `cr_competencias.status` | Maquina de estados controlada | `planejamento.visualizar` |
| Responsavel principal | `AUTO` | `cr_responsaveis_obra` + `User` | Vigencia valida na competencia | `obrigacoes.visualizar` |
| Substituto | `AUTO` | `cr_responsaveis_obra` | So atua dentro da vigencia configurada | `obrigacoes.visualizar` |
| Ultima atualizacao | `CALC` | maior `updatedAt` das fontes projetadas | Mostrar data/hora e origem | permissao da tela |
| Integridade dos dados | `CALC` | validacoes do projetor | OK, divergente, incompleto ou desatualizado | permissao da tela |

### 5.2 Dashboard do portfolio

| Indicador | Modo | Fonte/calculo | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Obras no escopo | `CALC` | `Obra` filtrada pelo policy | Somente ativas por padrao; filtro para inativas | `dashboard.visualizar` |
| Obras pendentes | `CALC` | `cr_obrigacoes_usuario`/competencias | Contar apenas obrigacoes do escopo | `dashboard.visualizar` |
| Planejado de custos | `CALC` | soma `cr_previsoes_custo` | Competencia e obras filtradas | `dashboard.visualizar` |
| Planejado de recebiveis | `CALC` | soma `cr_previsoes_receita` | Competencia e obras filtradas | `dashboard.visualizar` |
| Comprometido | `CALC` | pedidos validos e itens nao removidos | Valor liquido do pedido, rateado por obra/item | `dashboard.visualizar` |
| Incorrido | `CALC` | titulos ativos PAGAR/RECEBER | Valor liquido/saldo conforme indicador | `dashboard.visualizar` |
| Pago | `CALC` | movimentos ativos de titulos PAGAR | Principal realizado; ajustes em colunas proprias | `dashboard.visualizar` |
| Recebido | `CALC` | movimentos ativos de titulos RECEBER | Principal realizado | `dashboard.visualizar` |
| Saldo bancario | `EXT/CALC` | `bank_balance_snapshots` | Agregado apenas para contas autorizadas; mostrar timestamp | `saldos_bancarios.visualizar` |
| Desvio previsto x realizado | `CALC` | previsto menos realizado | Preservar sinal e base selecionada | `comparativo.visualizar` |
| Alertas de prazo | `CALC` | calendario + obrigacoes | D-7, D-3, D-1 e vencido, configuraveis | `obrigacoes.visualizar` |

### 5.3 Estrutura macro e planilha micro

| Campo | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Codigo macro | `AUTO` | `Apropriacao.codigo` | Snapshot da referencia ao publicar versao | `estrutura_micro.visualizar` |
| Descricao macro | `AUTO` | `Apropriacao.descricao` | Snapshot para preservar historico | mesma |
| Pai/somadora macro | `AUTO` | `apropriacao_pai_id`, `somadora` | Mantem hierarquia existente | mesma |
| Valor orcado macro | `AUTO` | `Apropriacao.valor_orcado` | Referencia; nunca sobrescrito pelo micro | mesma |
| Orcamento geral da obra | `AUTO` | `Obra.planilha_geral` | Indicador de referencia atual | mesma |
| Margem esperada | `AUTO` | `Obra.margem_custo_esperada` | Contexto, sem recalcular o cadastro | mesma |
| Codigo micro | `MAN-OBR` | `cr_plano_itens.codigo` | Unico dentro da versao/pai | `estrutura_micro.editar` |
| Descricao micro | `MAN-OBR` | `cr_plano_itens.descricao` | Texto obrigatorio | `estrutura_micro.editar` |
| Unidade | `MAN-OBR` | `cr_plano_itens.unidade` | Lista controlada + opcao manual auditada | `estrutura_micro.editar` |
| Quantidade base | `MAN-OBR` | `cr_plano_itens.quantidade` | Decimal positivo ou zero justificado | `estrutura_micro.editar` |
| Custo unitario base | `MAN-OBR` | `cr_plano_itens.custo_unitario` | Moeda BRL; precisao definida na migration | `estrutura_micro.editar` |
| Total micro | `CALC` | quantidade x custo unitario | Arredondamento monetario centralizado | `estrutura_micro.visualizar` |
| Vinculo macro | `MAN-OBR` | `cr_plano_macro_vinculos` | Obrigatorio antes de publicar | `estrutura_micro.editar` |
| Divergencia macro/micro | `CALC` | soma micro versus referencia macro | Exige justificativa para publicar se fora da tolerancia | `estrutura_micro.publicar_versao` |
| Versao do plano | `CALC` | `cr_planos_obra.versao` | Incremental; reimportacao cria nova versao | `estrutura_micro.visualizar` |
| Arquivo importado | `AUTO` | `cr_importacoes` + storage | Hash, nome, usuario, resultado e data | `estrutura_micro.importar` |
| Justificativa da versao | `MAN-OBR` | `cr_planos_obra.justificativa` | Obrigatoria ao substituir versao publicada | `estrutura_micro.publicar_versao` |

### 5.4 Assistente mensal - previsao de recebiveis/medicao

| Campo | Modo | Fonte tecnica | Responsavel/frequencia | Validacao | Permissao |
| --- | --- | --- | --- | --- | --- |
| Competencia planejada | `MAN-OBR` | `cr_competencias` | Responsavel da obra; mensal | Nao duplicar obra/competencia | `planejamento.preencher_recebiveis` |
| Item micro | `AUTO` | versao publicada de `cr_plano_itens` | Carregado no inicio do ciclo | Versao fica congelada no snapshot | mesma |
| Quantidade prevista | `MAN-OBR` | `cr_previsoes_receita.quantidade` | Mensal | Nao negativa; respeita regra de saldo definida pelo negocio | mesma |
| Valor unitario | `SNAP` | plano micro ou medicao vigente | Mensal | Edicao apenas se regra de negocio permitir | mesma |
| Valor previsto | `CALC/SNAP` | quantidade x valor unitario | Mensal | Centralizar arredondamento | mesma |
| Data prevista de medicao | `MAN-OBR` | `cr_previsoes_receita.data_prevista` | Mensal | Dentro da janela permitida | mesma |
| Data prevista de recebimento | `MAN-OBR` | `cr_previsoes_receita.data_recebimento` | Mensal | Nao anterior a medicao sem justificativa | mesma |
| Observacao | `MAN-OPC` | `cr_previsoes_receita.observacao` | Conforme necessidade | Limite e sanitizacao | mesma |
| Declaracao sem recebivel | `MAN-OBR` candidata | competencia | Quando todos os valores forem zero | Exigir justificativa | mesma |
| Total previsto | `CALC` | soma das linhas validas | Tempo real + snapshot ao finalizar | Deve coincidir com linhas | `planejamento.visualizar` |

### 5.5 Assistente mensal - previsao de custos

| Campo | Modo | Fonte tecnica | Responsavel/frequencia | Validacao | Permissao |
| --- | --- | --- | --- | --- | --- |
| Item micro | `AUTO` | versao publicada de `cr_plano_itens` | Carregado por competencia | Snapshot da versao | `planejamento.preencher_custos` |
| Descricao do custo | `AUTO/MAN-OBR` | item micro ou subitem novo | Mensal | Novo subitem exige vinculo micro | mesma |
| Quantidade prevista | `MAN-OBR` | `cr_previsoes_custo.quantidade` | Mensal | Nao negativa | mesma |
| Custo unitario previsto | `MAN-OBR` | `cr_previsoes_custo.custo_unitario` | Mensal | Moeda/precisao centralizada | mesma |
| Valor previsto | `CALC/SNAP` | quantidade x custo unitario | Mensal | Total das linhas | mesma |
| Data prevista | `MAN-OBR` | `cr_previsoes_custo.data_prevista` | Mensal | Janela valida | mesma |
| Parceiro previsto | `MAN-OPC` | `Parceiro` | Quando conhecido | Escopo de busca nao concede acesso financeiro | mesma |
| Categoria prevista | `MAN-OPC` | `CategoriaFinanceira` ativa | Quando conhecida | Compatibilidade PAGAR | mesma |
| Observacao/justificativa | `MAN-OPC` | previsao | Conforme necessidade | Sanitizacao e limite | mesma |
| Declaracao sem custo | `MAN-OBR` candidata | competencia | Quando todos os valores forem zero | Exigir justificativa | mesma |
| Total previsto | `CALC` | soma das linhas | Tempo real + snapshot | Deve coincidir com linhas | `planejamento.visualizar` |

### 5.6 Medicao consolidada

| Campo | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Item/descricao/unidade | `SNAP` | versao micro da competencia | Imutavel apos fechamento | `medicao.visualizar` |
| Quantidade prevista | `SNAP` | `cr_previsoes_receita` | Base de comparacao | `medicao.visualizar` |
| Quantidade consolidada | `MAN-OBR` | `cr_medicoes_consolidadas` | Informada por item | `medicao.consolidar` |
| Valor consolidado | `CALC/SNAP` | quantidade consolidada x valor | Snapshot ao consolidar | `medicao.consolidar` |
| Data da medicao | `MAN-OBR` | medicao consolidada | Obrigatoria candidata | `medicao.consolidar` |
| Documento/evidencia | `MAN-OPC` candidata | storage + `cr_auditoria` | Tipos e tamanho controlados | `medicao.consolidar` |
| Desvio previsto x consolidado | `CALC` | consolidado - previsto | Exibir valor e percentual | `comparativo.visualizar` |
| Justificativa do desvio | `MAN-OBR` candidata | consolidacao | Obrigatoria acima da tolerancia | `medicao.consolidar` |

### 5.7 Solicitacoes, pedidos, titulos e realizado

| Informacao | Modo | Fonte tecnica | Regra de projecao | Permissao |
| --- | --- | --- | --- | --- |
| Solicitacao de origem | `AUTO` | `Solicitacao.codigo/id` | Rastreabilidade; nao soma como realizado | `realizados.visualizar` |
| Solicitacao de compra | `AUTO` | `SolicitacaoCompra` | Contexto do fluxo de compras | mesma |
| Pedido | `AUTO` | `PedidoCompra` | Excluir cancelado; usar itens ativos | mesma |
| Valor comprometido | `CALC` | `PedidoCompraItem.valor_total - desconto_rateado` | Nao confundir com pagamento | mesma |
| Titulo | `AUTO` | `TituloFinanceiro` | Excluir soft-deleted, cancelado e estornado | mesma |
| Valor incorrido | `CALC` | valor liquido/original conforme contrato do indicador | Regra unica documentada no projetor | mesma |
| Saldo a pagar/receber | `CALC` | `TituloFinanceiro.valor_saldo` | Apenas status financeiro elegivel | mesma |
| Movimento/baixa | `AUTO` | `MovimentoFinanceiro` | Apenas `status=ATIVO` | mesma |
| Pago/recebido principal | `CALC` | soma `MovimentoFinanceiro.valor` | Nao usar pedido nem solicitacao | mesma |
| Valor de quitacao | `CALC` | `valor_quitacao` | Exibir separado quando inclui ajustes | mesma |
| Juros/multa/desconto | `AUTO/CALC` | campos do movimento | Colunas proprias; nao distorcer principal | mesma |
| Data realizada | `AUTO` | `data_movimento` | Base temporal do caixa | mesma |
| Parceiro | `AUTO` | titulo -> `Parceiro` | Snapshot visual quando necessario | mesma |
| Categoria financeira | `AUTO` | titulo -> `CategoriaFinanceira` | Dimensao gerencial/DRE | mesma |
| Apropriacao | `AUTO/CALC` | titulo/rateio | Aplicar rateio antes da agregacao | mesma |
| Origem historica | `AUTO` | `ObraCustoHistorico` | Somar separadamente com selo `HISTORICO_LEGADO` | mesma |
| Estado de conciliacao | `AUTO` | Financeiro/Contas Bancarias | Informativo; nao muda o principal realizado | `realizados.reconciliar` para acao |
| Item nao mapeado | `CALC` | projetor sem vinculo micro | Fila de reconciliacao; nao descartar valor | `realizados.reconciliar` |

### 5.8 Rateio financeiro obrigatorio

Para cada titulo/movimento:

1. Se houver `TituloFinanceiroRateio` valido, distribuir o valor pelas linhas de
   rateio usando `valor_rateio` ou `percentual` conforme o tipo cadastrado.
2. Se nao houver rateio, usar `TituloFinanceiro.obra_id` e
   `TituloFinanceiro.apropriacao_id`.
3. Aplicar o mesmo criterio ao principal, juros, multa, desconto e quitacao,
   mantendo as naturezas em colunas separadas.
4. Centralizar arredondamento; eventual residuo de centavos vai para a ultima linha.
5. Um movimento pode ser contado uma unica vez pelo seu ID. Reprocessamento deve
   ser idempotente.
6. Movimento estornado e titulo cancelado/excluido nao participam do realizado.

### 5.9 Dados bancarios exibidos no modulo

| Informacao | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Conta bancaria | `AUTO` | `ContaBancaria` + `bank_external_accounts` | Conta previamente mapeada para empresa | `saldos_bancarios.visualizar` |
| Saldo contabil inicial | `AUTO` | `ContaBancaria.saldo_inicial` | Cadastro; nao e saldo em tempo real | mesma |
| Saldo disponivel externo | `EXT` | ultimo `bank_balance_snapshots` | Mostrar provedor, data e idade | mesma |
| Saldo agregado da obra | `CALC` | contas/empresas autorizadas | Somente se regra de vinculo empresa/obra estiver aprovada | mesma |
| Ultima sincronizacao | `AUTO` | `bank_sync_cursors/jobs` | Sempre visivel ao lado do saldo | mesma |
| Estado da integracao | `CALC` | job/webhook/dead letter | OK, atrasado, erro ou homologacao | `integracao.visualizar_status` |
| Movimento bancario | `EXT` | `bank_external_transactions` | Nao vira realizado sem conciliacao financeira definida | `saldos_bancarios.visualizar` |

Saldo bancario nunca e entrada manual e nunca deve bloquear o usuario quando a
integracao estiver indisponivel ou desatualizada.

### 5.10 Importacoes e versoes da planilha micro

| Informacao | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Obra de destino | `MAN-OBR` | obra escolhida dentro do escopo do usuario | Validar escopo novamente no backend | `estrutura_micro.importar` |
| Arquivo original | `MAN-OBR` | upload armazenado em S3 + `cr_importacoes` | Preservar nome, tamanho, hash e chave; nunca substituir versao anterior | mesma |
| Motivo da versao | `MAN-OBR` | `cr_importacoes.motivo` | Obrigatorio em reimportacao | mesma |
| Usuario/data da importacao | `AUTO` | sessao autenticada + horario do servidor | Imutavel | `estrutura_micro.visualizar` |
| Linhas lidas, validas e rejeitadas | `CALC` | parser da importacao | Validar antes de publicar | mesma |
| Erros por linha/campo | `CALC` | resultado estruturado do parser | Disponivel para consulta e exportacao | mesma |
| Versao | `AUTO` | sequencia por obra | Incremental, sem sobrescrever competencias fechadas | mesma |
| Situacao da versao | `AUTO/MAN-OBR` | rascunho, validada, publicada ou substituida | Publicacao exige permissao separada | `estrutura_micro.publicar_versao` |
| Vinculos macro/micro gerados | `CALC` | linhas validadas + mapeamento de apropriacoes | Publicar em transacao e com idempotencia | mesma |

O arquivo importado e uma entrada operacional. Totais, codigos normalizados e
vinculos derivados sao calculados pelo backend e nao podem ser aceitos do
frontend como fonte confiavel.

### 5.11 Exportacoes

| Informacao | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Tipo de relatorio | `MAN-OBR` | medicao, custos, comparativo, realizado, solicitacoes/titulos ou resumo | Somente opcoes liberadas para o usuario | `relatorio.exportar` |
| Filtros e competencia | `MAN-OBR` | filtros da tela | Revalidar escopo e permissao no backend | mesma |
| Obras exportadas | `CALC` | policy de escopo do modulo | Nunca confiar em IDs enviados pelo frontend sem intersecao com o escopo | mesma |
| Conteudo | `CALC` | mesma consulta/projetor da tela correspondente | Resultado deve coincidir com a tela e respeitar rateios | mesma + permissao de leitura da origem |
| Formato | `MAN-OPC` | CSV ou XLSX conforme relatorio | Valores monetarios e datas tipados | mesma |
| Gerado por/em | `AUTO` | usuario autenticado + horario do servidor | Registrar auditoria | `auditoria.visualizar` para consulta posterior |
| Arquivo gerado | `AUTO` | storage temporario/assinado | Expiracao e download somente apos nova autorizacao | mesma |

Exportar nao concede visibilidade adicional. O usuario precisa ter tanto
`relatorio.exportar` quanto a permissao de leitura da informacao exportada.

### 5.12 Obrigacoes, prazos e futura regularizacao

| Informacao | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Obrigacao mensal | `CALC` | configuracao + obra ativa + competencia + responsavel vigente | Gerada por job idempotente | `obrigacoes.visualizar` |
| Competencia exigida | `CALC` | calendario configurado | Regra ainda depende de decisao de negocio | mesma |
| Prazo | `CALC` | configuracao de dia/hora/fuso/feriado | Horario do servidor; nunca do navegador | mesma |
| Responsavel | `AUTO` | `cr_responsaveis_obra` + `UsuarioObra` | Um responsavel principal vigente por obra/competencia | mesma |
| Substituto | `AUTO` | `cr_responsaveis_obra` | Atuar somente na vigencia configurada | mesma |
| Situacao | `CALC` | pendente, em preenchimento, finalizada, vencida, dispensada ou reaberta | Derivada de registros, prazo e finalizacao | mesma |
| Pendencias | `CALC` | checklist dos campos obrigatorios aprovados | Mostrar campo, tela e acao necessaria | mesma |
| Declaracao de valor zero | `MAN-OBR` candidata | planejamento mensal | Exigir justificativa se a regra for aprovada | `planejamento.finalizar` |
| Notificacao | `AUTO/MAN-OPC` | fila de notificacoes | Respeitar configuracoes de notificacao e evitar duplicidade | `obrigacoes.visualizar` |
| Bypass/dispensa | `MAN-OBR` controlada | solicitacao, aprovador, motivo, inicio e fim | Nunca permanente e sempre auditada | `obrigacoes.conceder_bypass` |
| Reabertura | `MAN-OBR` controlada | solicitante, aprovador, motivo e versao | Preservar versao anterior | `reabertura.solicitar` / `reabertura.aprovar` |

Esta secao somente define os dados. A restricao de acesso global continua
desativada ate que as decisoes da secao 11 sejam aprovadas e testadas em ciclo
proprio.

### 5.13 Auditoria operacional

| Informacao | Modo | Fonte tecnica | Regra | Permissao |
| --- | --- | --- | --- | --- |
| Evento | `AUTO` | action/service do dominio | Nome estavel por acao | `auditoria.visualizar` |
| Usuario e contexto | `AUTO` | sessao autenticada, perfil, setor e request ID | Nao aceitar identidade enviada pelo frontend | mesma |
| Obra e competencia | `AUTO` | registro afetado | Validar escopo antes de exibir | mesma |
| Estado anterior/posterior | `AUTO` | snapshot transacional dos campos relevantes | Ocultar segredos e dados bancarios sensiveis | mesma |
| Motivo | `MAN-OBR` quando exigido | formulario da acao | Obrigatorio em reabertura, substituicao e bypass | mesma |
| Correlacao/idempotencia | `AUTO` | request/correlation/idempotency key | Permitir rastrear retries sem eventos duplicados | mesma |
| Data/hora | `AUTO` | servidor | Imutavel e com fuso preservado | mesma |
| Origem | `AUTO` | web, importacao, job, webhook ou integracao | Diferenciar acao humana de automatica | mesma |

Auditoria e append-only. Correcao gera novo evento; nao altera nem apaga o
registro anterior.

## 6. Matriz de papeis e acesso sugerido

Os papeis abaixo sao templates de configuracao, nao regras fixas por setor.

| Papel | Escopo | Leitura | Escrita/acao sugerida |
| --- | --- | --- | --- |
| Responsavel da obra | Obras de `UsuarioObra` | Dashboard, estrutura, planejamento, medicao, realizado da propria obra | Preencher custos/recebiveis, salvar rascunho e finalizar se permitido |
| Substituto da obra | Obras e vigencia de `cr_responsaveis_obra` | Mesma leitura do responsavel durante a vigencia | Mesmas acoes explicitamente concedidas |
| Diretoria | `escopo.todas_obras` explicito | Portfolio, comparativos, obrigacoes e auditoria | Aprovar/reabrir conforme permissoes; edicao operacional desmarcada por padrao |
| Financeiro selecionado | `escopo.todas_obras` explicito ou obras vinculadas | Titulos, realizados e saldos autorizados | Atualizar projecao/reconciliar; nao editar planejamento por padrao |
| SUPERADMIN | Todas as obras | Todas as telas | Configurar, reabrir e administrar; nao sujeito ao bloqueio global |
| Auditor | Obras explicitamente autorizadas | Somente leitura e exportacao | Nenhuma mutacao |

## 7. Catalogo granular proposto

### 7.1 Entrada e escopo

- `custos_recebiveis.modulo.acessar`
- `custos_recebiveis.escopo.todas_obras`
- `custos_recebiveis.saldos_bancarios.visualizar`

### 7.2 Visibilidade

- `custos_recebiveis.dashboard.visualizar`
- `custos_recebiveis.comparativo.visualizar`
- `custos_recebiveis.obras.visualizar`
- `custos_recebiveis.estrutura_micro.visualizar`
- `custos_recebiveis.planejamento.visualizar`
- `custos_recebiveis.medicao.visualizar`
- `custos_recebiveis.realizados.visualizar`
- `custos_recebiveis.obrigacoes.visualizar`
- `custos_recebiveis.auditoria.visualizar`

### 7.3 Mutacoes

- `custos_recebiveis.estrutura_micro.importar`
- `custos_recebiveis.estrutura_micro.editar`
- `custos_recebiveis.estrutura_micro.publicar_versao`
- `custos_recebiveis.planejamento.preencher_custos`
- `custos_recebiveis.planejamento.preencher_recebiveis`
- `custos_recebiveis.planejamento.finalizar`
- `custos_recebiveis.planejamento.reabrir`
- `custos_recebiveis.medicao.consolidar`
- `custos_recebiveis.realizados.atualizar`
- `custos_recebiveis.realizados.reconciliar`
- `custos_recebiveis.reabertura.solicitar`
- `custos_recebiveis.reabertura.aprovar`
- `custos_recebiveis.obrigacoes.conceder_bypass`
- `custos_recebiveis.configuracoes.gerenciar`
- `custos_recebiveis.relatorio.exportar`

## 8. Regras de autorizacao por endpoint

Cada endpoint do novo dominio deve seguir esta ordem:

1. autenticar usuario;
2. exigir `custos_recebiveis.modulo.acessar`;
3. resolver escopo de obras;
4. filtrar ou validar a obra solicitada;
5. exigir a permissao especifica da acao;
6. validar estado da competencia e ownership funcional;
7. executar em transacao/idempotencia quando houver mutacao;
8. registrar auditoria com antes/depois, motivo e correlacao.

Aplicacoes obrigatorias:

- `GET lista`: filtro SQL pelo escopo antes de totalizar/paginar.
- `GET detalhe`: 404/403 sem revelar dados fora do escopo.
- `POST/PATCH`: validar escopo e permissao novamente no backend.
- `EXPORT`: exportar somente dados que a consulta equivalente permite ver.
- `DASHBOARD`: agregar somente obras do escopo.
- `ANEXO`: assinar URL somente depois de validar obra/registro.
- `JOB/NOTIFICACAO`: gerar destinatarios a partir dos responsaveis autorizados.

## 9. Campos candidatos a obrigatorios

Esta lista alimentara o desenho do bloqueio, mas ainda nao ativa nenhuma trava:

- obra com responsavel e substituto validos;
- versao micro publicada para a competencia;
- previsao de custos do periodo exigido;
- previsao de recebiveis/medicao do periodo exigido;
- declaracao e justificativa quando o total for zero;
- medicao consolidada do mes atual, se aplicavel;
- justificativa de desvio acima da tolerancia;
- finalizacao formal da competencia pelo responsavel.

Dados automaticos, bancarios, sincronizacoes e falhas de integracao nunca podem
ser requisito de preenchimento manual nem causa direta de bloqueio.

## 10. Pontos do codigo atual que nao devem ser reutilizados como contrato final

- `ResultadoObrasController` lista obras ativas sem aplicar o novo escopo e agrega
  titulos diretamente por `obra_id`.
- `obraGestaoService` usa movimentos ativos, mas seus buckets atuais nao resolvem
  todos os rateios de titulo/apropriacao exigidos pelo novo modulo.
- O fallback permissivo das permissoes legadas nao deve conceder automaticamente
  acesso ao novo modulo sensivel.

Esses componentes podem orientar conceitos visuais e comparacoes, mas o novo
dominio precisa de policy e projetor proprios.

## 11. Decisoes de negocio ainda necessarias antes do bloqueio

1. Quais campos da secao 9 sao obrigatorios para obras publicas e privadas.
2. Se o ciclo exige mes seguinte, consolidado atual ou os dois.
3. Dia/hora limite, fuso, feriados e tolerancia.
4. Quem e sujeito ao bloqueio: responsavel, substituto, gerente ou outro papel.
5. Se declaracao de zero e aceita e qual justificativa minima.
6. Quem finaliza, quem aprova e quem pode reabrir.
7. Como tratar obra inativa, suspensa, encerrada ou sem movimento.
8. Duracao e aprovadores de bypass.
9. Quais telas continuam liberadas durante a regularizacao.
10. Se responsavel de obra pode ver algum saldo bancario ou somente indicadores
    gerenciais sem conta/saldo detalhado.

## 12. Matriz por classificacao e origem

| Informacao | Obra publica | Obra privada | Entrada | Fonte oficial |
|---|---|---|---|---|
| Classificacao | `PUBLICA` | `PRIVADA` | Automatica | `Obra.classificacao` |
| Orcamento macro | Referencia | Referencia | Automatica | Gestao de Obras |
| Planejamento micro de custos | Detalhado | Detalhado | Manual/versionado | Novo modulo |
| Previsao de receita | Medicao | Parcelas de venda | Automatica + revisao | Medicao ou contrato |
| Vencimento operacional | Titulo da medicao | Titulo da parcela | Automatica | `TituloFinanceiro` |
| Receita realizada | Baixa do titulo | Baixa do titulo | Automatica | Baixa ativa |
| Evidencia bancaria | Conciliacao | Conciliacao | Automatica | TotalBank/conta |
| Inadimplencia | Titulo vencido | Titulo vencido por contrato/unidade | Automatica | Titulo e saldo |

## 13. Jornada privada detalhada

### 13.1 Planejamento geral

- origem: planilha geral existente em Obras > Gerenciamento de Obra;
- uso: referencia macro e comparativo;
- comportamento: somente leitura no novo modulo;
- proibido: sobrescrever a planilha existente por edicao do planejamento micro.

### 13.2 Recebiveis previstos

- `ContratoComercial`: contrato, cliente, unidade, obra e valor total;
- `ContratoComercialParcela`: valor e vencimento comercial;
- `TituloFinanceiro` do tipo `RECEBER`: vencimento, saldo e status operacional;
- regra: havendo `titulo_financeiro_id`, a parcela nao soma novamente;
- ajustes manuais criam versao/justificativa e nao alteram silenciosamente o
  contrato ou o titulo de origem.

### 13.3 Recebiveis realizados

- fonte exclusiva: baixas ativas dos titulos a receber;
- data gerencial: data efetiva da baixa;
- estorno: retira o valor do realizado sem apagar historico;
- TotalBank: confirma conciliacao e saldo, mas nao duplica a baixa.

### 13.4 Visao operacional

- filtros por obra, empreendimento, contrato, unidade, cliente, competencia e
  status;
- totais de previsto, faturado, recebido, vencido e a vencer;
- rastreabilidade contrato -> parcela -> titulo -> baixa -> movimento bancario;
- pendencias separadas para parcela sem titulo, titulo vencido e baixa ainda nao
  conciliada.

## 14. Permissoes adicionais por trilha

| Permissao | Publica | Privada | Observacao |
|---|---:|---:|---|
| `custos_recebiveis.medicoes.visualizar` | Sim | Nao | Backend rejeita uso em obra privada |
| `custos_recebiveis.medicoes.editar` | Sim | Nao | Nao amplia escopo |
| `custos_recebiveis.recebiveis.visualizar` | Sim | Sim | Fonte varia pela classificacao |
| `custos_recebiveis.recebiveis.revisar` | Sim | Sim | Confirma competencia sem alterar origem |
| `custos_recebiveis.recebiveis.ajustar_previsao` | Sim | Sim | Exige motivo e versao |
| `custos_recebiveis.inadimplencia.visualizar` | Opcional | Sim | Respeita escopo de obra |
| `custos_recebiveis.contratos_venda.visualizar` | Nao | Sim | Consulta contextual, sem liberar Comercial |

As permissoes acima controlam capacidades dentro de uma obra ja autorizada. A
policy de escopo deve ser executada primeiro e nao pode ser satisfeita por uma
permissao funcional.

## 15. Casos negativos obrigatorios

- usuario com `recebiveis.editar`, mas sem vinculo com a obra: 403/404;
- usuario vinculado a obra privada tentando endpoint de medicao: 400/403;
- usuario vinculado a obra publica tentando origem contrato de venda: 400;
- parcela e titulo vinculados: somar apenas o titulo;
- baixa e movimento TotalBank conciliados: somar apenas a baixa;
- usuario sem obras e sem `escopo.todas_obras`: dashboard zerado e lista vazia;
- exportacao nunca inclui obra fora do escopo.
