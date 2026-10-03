# Custos e Recebiveis

## Objetivo

Custos e Recebiveis e um modulo independente para planejamento mensal, acompanhamento
de custos realizados, previsao de recebiveis e governanca por obra.

O modulo usa Obras e Financeiro como fontes de leitura, mas grava exclusivamente em
tabelas com prefixo `cr_`. Ele nao substitui o Provisionamento, nao altera a planilha
orcamentaria macro de Obras e nao modifica registros dos modulos que consulta.

## Estado do runtime

A fundacao tecnica da Fase 0 e os fluxos funcionais das Fases 1, 2, 3 e 4 estao
implementados no codigo:

- entrada `CUSTOS_RECEBIVEIS` no catalogo de modulos;
- feature desabilitada por padrao;
- dependencia obrigatoria de `OBRAS` e `FINANCEIRO`;
- 14 tabelas proprias `cr_*`;
- models Sequelize e associacoes de leitura;
- permissoes granulares;
- policy propria de escopo por obra;
- listagem das obras do escopo do usuario;
- workspace de consulta da estrutura micro e de suas versoes;
- modelo XLSX por obra, com referencias macro somente para consulta;
- validacao previa da planilha sem gravacao;
- importacao transacional, versionada, idempotente e auditada;
- publicacao de uma versao e substituicao atomica da versao anteriormente publicada;
- planejamento mensal com etapas adaptadas a classificacao publica ou privada;
- medicao consolidada exclusiva de obras publicas;
- recebiveis privados provenientes de contrato/titulo sem dupla contagem;
- competencia finalizada imutavel, com reabertura temporaria aprovada;
- dashboard e comparativo operacional com cinco estados;
- custo realizado mensal calculado pelos titulos `PAGAR` emitidos na competencia,
  independentemente de vencimento, parcelamento ou pagamento;
- projetor idempotente de baixas mantido apenas para mapeamento micro e rastreabilidade;
- rateio resolvido por titulo, apropriacao e solicitacao, na ordem canonica;
- fila de valores nao mapeados, sem descarte do total financeiro;
- reconciliacao manual auditada por item micro;
- estornos neutralizados na projecao sem apagar o historico registrado;
- exportacoes CSV e XLSX limitadas ao mesmo escopo de obras;
- obrigacoes de custos e recebiveis calculadas a partir da competencia inicial do
  responsavel, sem cobranca retroativa anterior a esse marco;
- alertas D-7, D-3, D-1 e vencido calculados pelo horario do servidor;
- reabertura da competencia vencida ou finalizada e bypass temporario de usuario
  implementados como mecanismos distintos;
- bypass (liberacao temporaria) limitado a 48 horas desde 29/09/2026, sem
  autoconcessao, sem ocultar ou cumprir a obrigacao;
- guard frontend e backend com kill-switch `CR_GUARD_MODE`, entregue em `observe`;
- pagina frontend responsiva em `/custos-recebiveis`, com navegacao operacional por
  `Visao geral`, `Planejamento mensal` e `Obrigacoes e prazos`; comparativo e custo
  realizado ficam dentro do mes da obra, enquanto importacoes estruturais,
  exportacoes, auditoria e configuracoes dependem de permissoes administrativas;
- item unico de menu, exibido somente quando a feature estiver habilitada e o usuario
  possuir a permissao explicita de acesso.

A migration foi executada com sucesso apenas no ambiente de desenvolvimento em
28/07/2026, pelo responsavel do ambiente. A feature permanece desabilitada e o modulo
ainda nao esta disponivel aos usuarios. `CR_GUARD_MODE` nao foi configurado; portanto,
o fallback continua em `observe` e nao bloqueia ou redireciona nenhum usuario.

## Fronteiras de dados

O modulo pode ler:

- `Obra.classificacao` e os demais dados cadastrais da obra;
- `apropriacoes`, apenas para vinculo logico com a etapa macro;
- contratos e parcelas comerciais, apenas como origem de recebiveis privados;
- titulos e movimentos financeiros, apenas como fontes financeiras oficiais;
- parceiros e usuarios, apenas como referencias.

O modulo nao pode:

- criar ou editar obras;
- alterar `apropriacoes`;
- alterar contratos, parcelas, titulos ou movimentos financeiros;
- gravar em tabelas sem o prefixo `cr_`;
- ampliar o escopo de obra por setor, cargo ou acesso financeiro.

## Modelo de dados

Estrutura micro:

- `cr_planos_obra`;
- `cr_plano_itens`;
- `cr_plano_macro_vinculos`;
- `cr_importacoes`.

Ciclo mensal:

- `cr_competencias`;
- `cr_previsoes_custo`;
- `cr_previsoes_receita`;
- `cr_medicoes_consolidadas`;
- `cr_realizados`.

Governanca:

- `cr_responsaveis_obra`;
- `cr_obrigacoes_usuario`;
- `cr_reaberturas`;
- `cr_guard_bypass`;
- `cr_auditoria`.

`cr_auditoria` e append-only no ORM. Importacoes usam o hash do arquivo por obra como
base de idempotencia. Competencias sao unicas por obra e mes.

## Permissoes e escopo

O acesso ao modulo exige `custos_recebiveis.modulo.acessar` de forma explicita, exceto
para `SUPERADMIN`.

O escopo de obras segue somente esta precedencia:

1. `SUPERADMIN` acessa todas as obras;
2. `custos_recebiveis.escopo.todas_obras` acessa todas as obras;
3. os demais usuarios acessam apenas obras presentes em `usuarios_obras`.

Lista vazia de permissoes nao concede acesso implicito ao modulo novo. Obra fora do
escopo nao deve aparecer em listas, totais ou exportacoes. Acesso direto deve retornar
403 e registrar evento de seguranca.

As demais permissoes separam visualizacao, importacao e publicacao da estrutura micro,
planejamento, medicao, realizados, reabertura, bypass, configuracao e exportacao.

## Feature flag e rota tecnica

A feature nasce com:

```text
enabled: false
requiresAll: OBRAS, FINANCEIRO
```

O prefixo `/custos-recebiveis` usa a validacao central de modulos sem bypass quando a
feature esta desligada. O endpoint tecnico da fundacao e:

```text
GET /custos-recebiveis/status
```

Com a feature desligada, a resposta deve ser 403 inclusive para `SUPERADMIN`.

## Fase 1 - leitura e planilha micro

### Rotas

Todas as rotas abaixo passam, nesta ordem, pela feature flag do prefixo, pela permissao
geral `custos_recebiveis.modulo.acessar`, pela permissao da acao e, quando existe obra
em contexto, pela policy de escopo:

```text
GET  /custos-recebiveis/obras
GET  /custos-recebiveis/obras/:obraId/plano
GET  /custos-recebiveis/obras/:obraId/plano/modelo
POST /custos-recebiveis/obras/:obraId/plano/importar/validar
POST /custos-recebiveis/obras/:obraId/plano/importar
POST /custos-recebiveis/planos/:planoId/publicar
```

O upload somente e processado depois das validacoes de permissao e escopo.

### Contrato da planilha

A aba `ESTRUTURA_MICRO` possui exatamente estas colunas:

```text
codigo
descricao
unidade
quantidade
custo_unitario
etapa_macro_codigo
codigo_pai
```

O modelo tambem contem as abas `MACRO_REFERENCIA`, alimentada em modo somente leitura
com as apropriacoes ativas da obra, e `INSTRUCOES`.

A validacao rejeita cabecalho incompleto, codigos duplicados, valores negativos,
referencias a pais inexistentes, ciclos hierarquicos e codigo macro inexistente ou
inativo. O limite atual e de 10 MB e 10.000 linhas.

### Versionamento, idempotencia e publicacao

- Validar um arquivo nao grava dados.
- A primeira importacao cria a versao 1 em `RASCUNHO`.
- Uma reimportacao diferente exige motivo e cria nova versao; nunca sobrescreve a
  anterior.
- O mesmo hash SHA-256 para a mesma obra retorna a importacao existente e nao duplica
  plano, itens ou auditoria.
- A importacao grava somente `cr_planos_obra`, `cr_plano_itens`,
  `cr_plano_macro_vinculos`, `cr_importacoes` e `cr_auditoria`.
- A publicacao exige vinculo macro em todos os itens de custo.
- Divergencia absoluta superior a 5% entre micro e macro exige justificativa.
- Ao publicar, a versao publica anterior passa para `SUBSTITUIDA` e a nova passa para
  `PUBLICADA` dentro da mesma transacao.
- Nenhum fluxo cria, edita ou remove registros em `apropriacoes`.

### Frontend

- Rota unica `/custos-recebiveis`.
- Contexto preservado na URL pelos parametros `aba`, `obra`, `plano`, `competencia` e
  `sub`.
- Tabelas compactas em desktop/notebook e registros empilhados em tablet/mobile.
- Acoes de validacao, importacao e publicacao ficam bloqueadas enquanto a requisicao
  esta em andamento.
- A interface mostra apenas as abas e acoes autorizadas pelas permissoes granulares.

## Fase 2 - planejamento, medicao, dashboard e comparativo

### Rotas

```text
GET  /custos-recebiveis/dashboard?competencia=AAAA-MM&obra_id=
GET  /custos-recebiveis/obras/:obraId/competencias
POST /custos-recebiveis/obras/:obraId/competencias
GET  /custos-recebiveis/obras/:obraId/plano/itens?competencia=AAAA-MM&q=&page=&limit=
GET  /custos-recebiveis/obras/:obraId/competencias/:competencia
PUT  /custos-recebiveis/obras/:obraId/competencias/:competencia/custos
PUT  /custos-recebiveis/obras/:obraId/competencias/:competencia/receitas
POST /custos-recebiveis/obras/:obraId/competencias/:competencia/finalizar
POST /custos-recebiveis/obras/:obraId/competencias/:competencia/medicao
GET  /custos-recebiveis/obras/:obraId/comparativo?competencia=AAAA-MM
POST /custos-recebiveis/competencias/:competenciaId/reabertura
POST /custos-recebiveis/reaberturas/:reaberturaId/aprovar
```

Todas seguem a ordem feature flag, acesso geral, permissao da acao e escopo da obra.
As mutacoes usam transacao, bloqueio pessimista quando aplicavel e gravam
`cr_auditoria`.

### Planejamento publico e privado

- A entrada do planejamento e uma lista mensal por obra. Ela apresenta custo
  planejado, medicao prevista, medicao aprovada, glosa, custo realizado e receita
  efetivamente recebida.
- `Novo mes` cria somente a competencia atual ou a seguinte, com
  `Idempotency-Key`, unicidade por obra/competencia e snapshot da versao publicada.
- Em obra publica, o assistente de criacao possui tres etapas: custos planejados,
  medicao prevista e revisao/finalizacao. A medicao aprovada e registrada depois,
  como acao propria do card da competencia, quando o orgao devolver a medicao.
- Em obra privada, o assistente possui duas etapas: custos planejados e recebiveis do
  periodo. A finalizacao fica no rodape operacional da segunda etapa e nao existe
  etapa de medicao ou confirmacao manual dos recebiveis.
- O plano completo nao e materializado na tela. Itens folha sao pesquisados no
  backend por codigo, descricao ou etapa macro, com paginacao, e somente linhas
  selecionadas com valores relevantes ficam persistidas.
- Os seletores de itens em custos planejados e medicao prevista usam autocomplete
  incremental com debounce; a lista e atualizada pelos caracteres digitados sem
  exigir clique no botao de busca. Custos planejados tambem exibem a quantidade
  orcada congelada do item para comparacao com a quantidade prevista.
- Custos e recebiveis publicos aceitam somente itens folha da versao micro publicada.
- O custo/valor por item e calculado no backend; o frontend apresenta o mesmo calculo
  apenas como retorno imediato ao usuario.
- Obra publica usa previsao e medicao por item micro.
- Em obra publica, `cr_previsoes_receita` representa a medicao prevista pelo
  responsavel e `cr_medicoes_consolidadas` representa a medicao aprovada pelo orgao.
- A glosa e a diferenca positiva entre o valor previsto e o aprovado. Glosa exige
  justificativa auditavel e o aprovado nao pode superar o previsto.
- A medicao aprovada possui acao propria, posterior a medicao prevista, e pode ser
  registrada depois da finalizacao do planejamento, sem alterar o snapshot planejado.
- O saldo disponivel para uma nova medicao prevista e calculado pela quantidade
  orcada menos a quantidade efetivamente aprovada em competencias anteriores. Uma
  previsao anterior nao consome saldo ate ser aprovada pelo orgao.
- Custos planejados e medicoes possuem modelo XLSX e importacao com preview editavel.
  O modal permite incluir, remover ou ajustar linhas, possui rolagem independente e
  mantem a confirmacao acessivel. Somente quantidades maiores que zero sao aplicadas
  e nenhuma linha pode ultrapassar o saldo orcamentario aplicavel.
- Receita recebida nao e digitada no modulo: vem exclusivamente de baixas ativas de
  titulos `RECEBER`, rateadas para a obra. O comparativo por item separa `Medicao
  prevista` e `Medicao aprovada`. O custo realizado mensal vem do valor dos titulos
  `PAGAR` emitidos na competencia e alocados a obra, ainda que estejam abertos,
  parcelados ou com vencimento em outro mes.
- A carteira consolidada e os cards por obra usam exatamente as competencias
  selecionadas no filtro executivo. A competencia de referencia permanece como
  contexto para alertas e detalhes, mas nao limita o somatorio multicompetencia.
- Obra privada lista automaticamente parcelas contratuais e os respectivos titulos
  a receber com vencimento na competencia. Nao existe marcacao ou confirmacao manual:
  ao finalizar, as fontes oficiais do periodo sao sincronizadas no snapshot.
- Quando uma parcela privada possui `titulo_financeiro_id` de Contas a Receber, ela e
  apresentada e gravada como uma unica origem vinculada ao titulo; a parcela nao e
  somada novamente.
- Vencimento, inadimplencia, baixa e cobranca dos recebiveis privados continuam sendo
  regras do Financeiro; o modulo apenas consulta e consolida esses registros.
- Obra privada nao recebe interface nem endpoint funcional de medicao.
- O planejamento mensal nao cria itens dentro do plano publicado e nunca altera
  `apropriacoes`.

### Finalizacao e reabertura

- `Idempotency-Key` e obrigatoria ao finalizar.
- A primeira finalizacao grava o snapshot da versao publicada, totais, usuario e data.
- Repetir a finalizacao retorna o estado existente e nao cria auditoria ou registro
  adicional.
- Uma competencia `FINALIZADA` rejeita alteracao de custos e recebiveis.
- Reabertura exige motivo e decisao por permissao separada; a reabertura aprovada vale 24 horas e depois o mes fecha de novo (planejamento e medicao aprovada).
- Ao aprovar, a competencia passa a `REABERTA`; qualquer usuario autorizado da obra
  pode editar durante a janela.
- Expirada a janela, novas mutacoes sao rejeitadas mesmo que o estado continue
  `REABERTA`.
- Uma nova finalizacao preserva o snapshot original da competencia.

### Comparativo

Os cinco estados sao determinados no backend:

```text
NEUTRO        previsto = 0 e realizado = 0
SEM_PREVISAO  previsto = 0 e realizado > 0
A_REALIZAR    previsto > 0 e realizado = 0
DENTRO        realizado <= previsto
ESTOURO       realizado > previsto
```

Na interface, a Visao Geral e executiva e sempre consolida todas as obras autorizadas
ao usuario na competencia escolhida. Abaixo do consolidado, cada obra aparece em um
card mensal proprio, com nome em destaque, custo planejado e realizado, desvio,
recebivel ou medicao prevista, valor reconhecido, recebido, saldo e glosa quando
aplicavel. Obras com alertas ficam primeiro para antecipar a tomada de decisao; o card
abre o planejamento da respectiva obra sem alterar qualquer regra de preenchimento.

Os filtros executivos atuam na secao `Decisao por obra` e na `Carteira consolidada`. O
usuario pode combinar uma obra, a classificacao publica ou privada e mais de uma das
seis competencias disponiveis; nesse recorte, a mesma obra aparece em um card para cada
competencia selecionada e seus valores compoem o consolidado superior. Tendencias e
pontos de atencao continuam calculados na competencia de referencia.

No grupo de recebiveis do consolidado, o indicador generico `Reconhecido` nao e
exibido. Obras privadas usam diretamente a previsao financeira da competencia. Quando
o recorte contem somente obras publicas, o indicador especifico `Medicao aprovada`
permanece visivel porque sustenta o calculo de glosa e saldo a receber.

Tanto a lista do filtro quanto os cards aceitam apenas cadastros cujo
`tipo_centro_custo = OBRA`. Centros de custos nao participam desta tela. Se um cadastro
administrativo ainda aparecer como obra, o tipo do proprio cadastro deve ser corrigido;
o frontend nao infere o tipo pelo nome para evitar ocultar uma obra valida.

O endpoint continua aceitando `obra_id` para consumidores que precisem do recorte de
uma obra, incluindo a serie historica de seis competencias e o detalhamento somente
das macros com movimento. Sem `obra_id`, consolida todas as obras autorizadas e retorna
tambem `obras_resumo`, sem misturar as estruturas micro entre obras.

Na aba Planejamento mensal, as competencias sao apresentadas em cards responsivos com
os mesmos indicadores do resumo executivo. Ao abrir uma competencia, a barra interna
oferece planejamento, medicao aprovada (somente obra publica), custo realizado e
comparativo conforme as permissoes do usuario. Assim, as analises permanecem no
contexto do mes e da obra sem poluir a navegacao principal.

O antigo painel de status de todas as obras foi substituido por pontos de atencao
acionaveis: custo acima do planejado, glosa, movimento sem mapeamento, medicao
aguardando aprovacao, recebivel privado vencido, planejamento ausente e obrigacao
mensal vencida. Cada alerta direciona para a aba operacional correspondente.

Os indicadores sao adaptados a classificacao da obra. Obras publicas exibem medicao
apresentada, aprovada, glosa, receita recebida e saldo. Obras privadas exibem
recebivel previsto, recebido, saldo e quantidade de titulos vencidos. No consolidado,
o valor reconhecido combina medicao publica aprovada e recebiveis privados previstos,
sem somar a receita recebida ao reconhecimento.

O comparativo mensal de obras publicas detalha por item e macro a medicao prevista,
o valor aprovado pelo orgao, a glosa, o percentual de aprovacao e o estado. O custo
realizado financeiro permanece na visao propria e continua alimentando os indicadores
executivos sem ser confundido com aprovacao de medicao. Acima do detalhamento, os
indicadores de recebiveis nao somam medicao aprovada com entrada financeira.

## Fase 3 - custo realizado, reconciliacao e exportacoes

### Rotas

```text
GET  /custos-recebiveis/obras/:obraId/realizados?competencia=AAAA-MM
POST /custos-recebiveis/obras/:obraId/realizados/reprocessar
POST /custos-recebiveis/realizados/:id/reconciliar
GET  /custos-recebiveis/exportacoes/:tipo?competencia=AAAA-MM&obra_id=&formato=
```

As permissoes de visualizar, atualizar, reconciliar e exportar sao independentes.
Todas as rotas respeitam a feature, o acesso geral, a permissao da acao e o escopo da
obra. A exportacao sem `obra_id` percorre somente as obras devolvidas pela mesma policy
de escopo.

### Fonte oficial e idempotencia

- A visao `Custo realizado`, aberta dentro da competencia mensal, usa exclusivamente
  titulos financeiros `PAGAR` como razao de custos alocados a obra. Ela nao consulta
  nem lista pedidos de compra ou solicitacoes.
- A visao principal lista todos os titulos da obra, independentemente do status de
  pagamento, e inicia filtrada pelos titulos emitidos dentro da competencia
  selecionada. A opcao `Todos da obra` preserva a consulta historica completa.
- Cada titulo apresenta valor alocado a obra, valor pago, saldo, credor, categoria,
  apropriacao e status financeiro. Titulos rateados usam somente a parcela destinada
  a obra; os valores pago e saldo sao proporcionais ao rateio.
- Os titulos sao agrupados pela etapa macro resolvida pelos vinculos do plano e pelas
  apropriacoes. Um titulo que alcance mais de uma etapa aparece uma unica vez no grupo
  de rateio multiplo, impedindo duplicacao dos totais; vinculos ainda nao resolvidos
  permanecem visiveis em `Sem etapa macro identificada`.
- Titulos cancelados ou estornados permanecem visiveis para rastreabilidade, mas nao
  compoem os totais ativos de custo.
- O resumo separa total alocado, saldo em aberto, valor pago e valor emitido na
  competencia selecionada. A competencia do custo usa `data_emissao`; para titulo
  legado sem essa data, usa a data de cadastro (`createdAt`) no fuso de Sao Paulo.
- Cada parcela financeira e um titulo proprio e entra uma unica vez pelo respectivo
  `valor_original`. Se houver rateio, somente `valor_rateio` destinado a obra compoe
  o custo. Data de vencimento, baixa e status de pagamento nao mudam a competencia do
  custo realizado.
- Titulos cancelados ou estornados continuam visiveis para auditoria, mas sao
  excluidos dos totais. Os demais estados financeiros entram normalmente.
- A projecao `cr_realizados` nao define mais o total mensal do custo realizado. Ela e
  mantida como indice tecnico de mapeamento das baixas aos itens micro e segue as
  regras abaixo.
- Somente `MovimentoFinanceiro` do tipo `BAIXA`, com `status = ATIVO`, vinculado a
  titulo `PAGAR`, entra nessa projecao tecnica.
- O valor da projecao usa `valor_quitacao`, com fallback para `valor`, e sua
  competencia tecnica e o mes de `data_movimento`.
- O rateio do titulo e preferencial. Sem ele, o projetor tenta apropriacao do titulo,
  rateio da solicitacao e apropriacao direta da solicitacao, nessa ordem.
- A divisao proporcional preserva os centavos e a soma exata da baixa.
- A chave logica continua sendo `movimento_financeiro_id + plano_item_id`.
- Reprocessar sem mudanca nao grava novamente e retorna `idempotente: true`.

### Nao mapeados, reconciliacao e estorno

- Se nenhuma apropriacao resolver um unico item micro, o valor fica em
  `NAO_MAPEADO`, permanece visivel e continua compondo o total realizado.
- A reconciliacao exige item micro da obra e motivo. A decisao e registrada em
  `cr_auditoria` e reaplicada nos proximos reprocessamentos.
- Quando uma baixa deixa de estar ativa, a projecao e neutralizada com valor zero e um
  evento de correcao e anexado a auditoria. O registro historico nao e apagado.
- Consultas do dashboard e comparativo exigem movimento ainda ativo, evitando que um
  estorno continue no total antes do proximo reprocessamento.
- Nenhuma operacao da Fase 3 cria ou altera movimento, titulo, pedido, solicitacao ou
  apropriacao.

### Exportacoes

Os tipos disponiveis sao:

- `medicao-recebiveis`;
- `custos-previstos`;
- `comparativo`;
- `custo-realizado`;
- `solicitacoes-titulos`;
- `resumo-executivo`.

Cada tipo aceita `csv` ou `xlsx`. O CSV usa UTF-8 com BOM, separador por ponto e
virgula e protecao contra interpretacao de formulas. O XLSX reutiliza
`utils/excelWorkbook.js`.

## Fase 4 - obrigacoes, reabertura, bypass e guard

### Regras de obrigacao

- Somente responsaveis ou substitutos ativos, vinculados a obra ativa e com plano
  micro publicado, entram no calculo.
- O usuario precisa possuir acesso ao modulo. Cada obrigacao somente e gerada quando
  ele tambem possui a permissao da acao correspondente; configuracao incompleta de
  acesso nao pode prende-lo.
- O ponto de partida e `cr_responsaveis_obra.competencia_inicial`. Nenhum mes anterior
  gera pendencia.
- Em obras publicas, custos planejados e medicao prevista geram obrigacoes
  separadas.
- Em obras privadas, somente custos planejados geram obrigacao manual. Os recebiveis
  contratuais sao sincronizados automaticamente com o Financeiro e nao geram
  pendencia de preenchimento.
- A medicao aprovada de obra publica pode ser registrada depois da finalizacao,
  quando o orgao responder, e nao integra a obrigacao mensal de preenchimento.
- O contador de pendencias e vencimentos aparece no cabecalho do modulo em qualquer
  aba autorizada e direciona para `Obrigacoes e prazos`.
- Finalizar a competencia cumpre as obrigacoes aplicaveis ao tipo da obra. Reabrir
  torna essas obrigacoes visiveis novamente ate uma nova finalizacao.
- O prazo padrao e o ultimo dia util do mes, as 18h no horario do servidor. Sabados e
  domingos sao antecipados automaticamente. Feriados opcionais podem ser informados
  em `CR_FERIADOS`, como lista CSV de datas `AAAA-MM-DD`.

### Guard seguro

`CR_GUARD_MODE` aceita:

```text
observe  calcula e alerta, sem bloquear ou redirecionar
enforce  bloqueia chamadas e redireciona somente pendencias vencidas legitimas
```

Valor ausente ou invalido sempre resulta em `observe`. A avaliacao ocorre na ordem:
modo de observacao, `SUPERADMIN`, bypass vigente, rota liberada e, por ultimo,
pendencia vencida. Falha inesperada no calculo e fail-open para evitar indisponibilidade
geral.

O backend responde `403` com `MONTHLY_REQUIREMENT_PENDING` em chamadas diretas quando
o modo `enforce` estiver explicitamente ativo. O frontend usa o mesmo estado da sessao
para levar o usuario ao planejamento. Perfil, logout, ajuda/suporte e o proprio modulo
permanecem acessiveis.

### Reabertura e bypass

- Reabertura tem como alvo uma competencia da obra e libera qualquer usuario
  autorizado durante a janela aprovada.
- Mes vencido ainda sem registro pode criar sua competencia de forma idempotente ao
  solicitar reabertura.
- Bypass tem como alvo uma pessoa e, opcionalmente, uma obra.
- Bypass exige justificativa, expiracao futura, permissao administrativa e
  `Idempotency-Key`; e proibida a autoconcessao.
- Concessao e revogacao escrevem na auditoria append-only. A expiracao ja nasce
  registrada no evento de concessao e passa a valer automaticamente pelo horario do
  servidor.
- A pendencia continua listada e contada durante o bypass.

### Rotas

```text
GET    /custos-recebiveis/obrigacoes/minhas
GET    /custos-recebiveis/obrigacoes/bypass
POST   /custos-recebiveis/obrigacoes/bypass
DELETE /custos-recebiveis/obrigacoes/bypass/:id
POST   /custos-recebiveis/obras/:obraId/competencias/:competencia/reabertura
```

## Fechamento de prontidao operacional

Antes da ativacao controlada em dev foi concluido o fluxo que alimenta
`cr_responsaveis_obra`, fonte obrigatoria do motor de obrigacoes:

- configuracao por obra de um responsavel e de substitutos;
- somente usuarios ativos previamente vinculados em `usuarios_obras` sao elegiveis;
- competencia inicial igual ou posterior ao mes corrente, impedindo cobranca
  retroativa;
- somente um papel ativo por usuario e apenas um responsavel principal por obra;
- troca do responsavel encerra o vinculo anterior sem apagar o historico;
- encerramento manual exige justificativa;
- criacao e encerramento exigem `Idempotency-Key`, transacao e auditoria;
- consulta da auditoria append-only por obra, limitada ao mesmo escopo operacional.

Rotas:

```text
GET   /custos-recebiveis/obras/:obraId/responsaveis
POST  /custos-recebiveis/obras/:obraId/responsaveis
PATCH /custos-recebiveis/responsaveis/:id/encerrar
GET   /custos-recebiveis/obras/:obraId/auditoria
```

O frontend possui as abas `Configuracoes` e `Auditoria`, exibidas somente pelas
permissoes `custos_recebiveis.configuracoes.gerenciar` e
`custos_recebiveis.auditoria.visualizar`.

## Reforma 2026-09 - prazos e tela do engenheiro (Fase 1)

Regras fechadas pelo proprietario em 29/09/2026 (detalhe e decisoes em
`docs/handoffs/2026-09-29-custos-recebiveis-reforma.md`):

- Janela de planejamento da competencia M: dia 25 do mes anterior (00:00) ate o
  dia 5 de M (23:59:59), horario de Brasilia, sem antecipar por fim de semana ou
  feriado.
- Medicao aprovada (somente obra publica): 40 dias contados do dia 1o da
  competencia (marco -> ate 10/04 23:59:59).
- Os dois prazos sao o padrao; a configuracao por obra entra na Fase 2.
- Calculo em `services/prazoService.js` (Brasilia = UTC-3 fixo, sem depender do
  fuso do servidor). `GET /obras` devolve `prazos` por obra:
  `planejamento` (`ABERTO`, `VENCIDO`, `AGUARDANDO_JANELA`, `SEM_ESTRUTURA`),
  `medicao` (`ABERTO`, `VENCIDO`, `EM_DIA`; `null` em obra privada) e `travada`
  (sempre `false` ate a Fase 3).
- "Novo mes" libera as competencias atrasadas ainda sem registro e a competencia
  cuja janela ja abriu (`competencias_permitidas`); `POST /competencias` recusa
  as demais com `CR_COMPETENCIA_FORA_JANELA`.
- `GET /obras/:obraId/competencias` devolve `planejamento_editavel` por mes: so
  e verdadeiro com planejamento aberto (ou reaberto com reabertura vigente) e
  nao finalizado.
- Planejamento atrasado e registrado sem reabertura (decisao de 29/09): mes nao
  finalizado continua editavel depois do prazo; finalizado nunca e editavel;
  reabertura so para mes finalizado ou reaberto com janela expirada.

## Reforma 2026-09 - Fase 2: prazos por obra, medicao aprovada e dilatacao

- Migration `202609290001_custos_recebiveis_prazos_dilatacao.js` (tabelas novas,
  `cr_competencias` nao muda): `cr_prazos_obra`, `cr_dilatacoes`,
  `cr_medicao_sem_registro`. O backend nao sobe com migration pendente
  (`assertMigrationsUpToDate`): rodar a migration no deploy do backend-dev.
- Prazos por obra: `GET /prazos` e `PUT /obras/:obraId/prazos` (Configuracoes;
  `{ padrao: true }` volta ao padrao). Limites: dias 1 a 28; medicao 1 a 120.
- Obrigacoes passam a usar a janela da obra; nova obrigacao `MEDICAO_CONSOLIDADA`
  (medicao aprovada, obra publica, permissao `medicao.consolidar`), cumprida com
  medicao registrada ou "sem medicao".
- Medicao aprovada: registro atrasado aceito; alterar depois do prazo (com
  dilatacao) exige reabertura (`CR_MEDICAO_ENCERRADA`). "Sem medicao neste mes"
  com justificativa (`sem_medicao: true`). Medicao so de itens da planilha (linha
  antiga ligada a custo so se ja gravada). Aprovado anterior somado pelo codigo
  do item, atravessando versoes da planilha.
- Dilatacao: `POST /obras/:obraId/competencias/:competencia/dilatacoes`
  (`medicao.consolidar`; 2 a 5 dias; somente depois do vencimento; um pendente
  por mes), `POST /dilatacoes/:id/decidir` (`reabertura.aprovar`),
  `GET /dilatacoes`. Prazo novo = data da aprovacao + dias, ate 23:59 de
  Brasilia (nunca menor que o prazo vigente); enquanto o pedido aguarda, a obra
  segue travada.
- Custo realizado do Comparativo: a consulta sincroniza as baixas do mes (mes
  existente e iniciado; no maximo a cada 5 minutos por obra/mes).

## Reforma 2026-09 - Fase 3: bloqueio por obra

- Substitui o guard global. Decisao do proprietario (29/09): a OBRA atrasada
  nao recebe solicitacao NOVA, de nenhum usuario (SUPERADMIN inclusive).
  Solicitacoes ja abertas, titulos, pagamentos, baixas e compras em andamento
  seguem normais para todos.
- Trava com planejamento vencido e nao entregue, ou medicao aprovada vencida
  (prazo com dilatacao) sem registro nem "sem medicao", em obra com
  RESPONSAVEL/SUBSTITUTO vigente que tenha permissao para regularizar.
  Dilatacao aguardando decisao nao destrava. Mes reaberto para correcao nao
  trava.
- Rotas de abertura barradas (403 `OBRA_TRAVADA_SOLICITACAO_NOVA`):
  `POST /solicitacoes`, `/compras/solicitacoes`, `/compras/solicitacoes-diretas`,
  `/compras/cotacoes/avulsa`, `/contratos/fluxo-novo` (a "Nova solicitacao" abre
  contrato por ela), `/rh/solicitacoes` e `/rh/transferencias` (sem diferenca de
  caixa no caminho, como o Express). Obra lida de `obra_id`, `dados.obra_id`,
  `obra_origem_id`/`obra_destino_id`, `distribuicao_centro_custo.itens` e do
  colaborador (RH). Distribuicao "todas as obras" e custo do centro de custo e
  nao trava. Revisto em 29/09 pelo proprietario: jornada (`/rh/jornada`,
  `/rh/jornada/individual`, e a importacao, checada no controller), tickets
  de RH (`/rh/tickets`, obra dos colaboradores, checada no controller por ser
  multipart) e aditivo de contrato (`/contratos/:id/aditivos` e
  `/contratos/fluxo-novo/:id/aditivos`, obra do contrato) tambem sao barrados
  — a trava serve para pressionar a regularizacao. Em `observe`, a abertura que seria barrada
  vai para o log (`observe: abertura seria barrada`).
- `GET /obras/minhas?modo=CRIACAO` mantem a obra e acrescenta
  `bloqueio_solicitacao_nova.motivo`; Nova Solicitacao e Nova Solicitacao de
  Compra mostram o motivo no campo da obra e nao enviam.
- Dentro de `/custos-recebiveis`, o engenheiro responsavel pela obra travada so
  acessa o que regulariza (403 `OBRA_TRAVADA_CUSTOS_RECEBIVEIS` em comparativo,
  realizados, auditoria, estrutura e exportacoes).
- Excecao unica: liberacao temporaria do administrador, ate 48 horas, que
  libera a obra para todos (liberacao antiga com prazo maior vale ate
  concedido_em + 48h tambem na listagem e na concessao). Responsavel com
  usuario desativado nao conta para travar.
- Sessao (`/auth/me`) leva `custos_recebiveis_pendencia.obras_travadas` (obras
  em que o usuario e responsavel); faixa fixa no topo com "Regularizar". O
  redirecionamento global deixou de existir (`bloqueado` e sempre `false`).
- `CR_GUARD_MODE=observe` (padrao) so avisa ("seria travada");
  `enforce` bloqueia. Cache de 30s (por usuario e por obra), limpo a cada
  gravacao do modulo.
- Reabertura aprovada vale 24 horas; depois o mes fecha sozinho (primeira
  consulta apos o vencimento).

## Reforma 2026-09 - Fase 4: consultas do administrador

Consultas gerais para a tela do administrador abrir Importacoes, Auditoria,
Configuracoes, Obrigacoes e a fila de decisoes sem escolher obra antes. Todas
sao `GET`, somente leitura, recortadas pelo escopo de obras do usuario
(`resolverEscopoObras`, o mesmo das rotas por obra). `obra_id` fora do escopo
responde 403 `CR_OBRA_FORA_ESCOPO`; `obra_id`, `situacao`, data ou periodo
invalidos respondem 400 com mensagem legivel. Paginacao onde indicado:
`limit` padrao 50, maximo 200 (acima disso vale 200; invalido vale 50),
`offset` padrao 0; a resposta ecoa `limit` e `offset`. Datas em ISO 8601.
Servicos: `services/filaDecisoesService.js` e `services/consultaAdminService.js`.
As rotas por obra (`/obras/:obraId/auditoria`, `/obras/:obraId/plano`,
`/obras/:obraId/responsaveis`) e `/obrigacoes/minhas` nao mudaram.

| Rota | Permissao | Resposta |
| --- | --- | --- |
| `GET /custos-recebiveis/decisoes/pendentes?obra_id=&limit=&offset=` | `REOPEN_APPROVE` | `{ items: [{ tipo: 'REABERTURA'\|'DILATACAO', id, obra: {id,codigo,nome}, competencia, motivo, dias, prazo_vigente, solicitado_por: {id,nome}, solicitado_em }], total }` |
| `GET /custos-recebiveis/reaberturas?situacao=&obra_id=&limit=&offset=` | `REOPEN_APPROVE` ou `OBRIGACOES_VIEW` | `{ items: [{ id, obra, competencia, motivo, situacao, solicitado_por, solicitado_em, decidido_por\|null, decidido_em\|null, justificativa\|null, expira_em\|null }], total }` |
| `GET /custos-recebiveis/auditoria?obra_id=&acao=&de=&ate=&limit=&offset=` | `AUDITORIA_VIEW` | `{ items: [{ id, criado_em, obra\|null, competencia\|null, acao, descricao, usuario: {id,nome}\|null }], total, acoes }` |
| `GET /custos-recebiveis/planos` | `ESTRUTURA_VIEW` | `{ items: [{ obra: {id,codigo,nome,classificacao}, vigente: {id,versao,publicado_em,total_itens}\|null, rascunhos: [{id,versao,criado_em}], total_versoes, ultima_importacao_em\|null }] }` |
| `GET /custos-recebiveis/responsaveis` | `CONFIG_MANAGE` | `{ items: [{ obra: {id,codigo,nome}, responsaveis: [{ id, usuario: {id,nome}, papel, vigencia_inicio, vigencia_fim, ativo }] }] }` |
| `GET /custos-recebiveis/obrigacoes?situacao=&obra_id=&limit=&offset=` | `OBRIGACOES_VIEW` | `{ items: [{ id, tipo, obra, competencia, usuario: {id,nome}, prazo_em, cumprida_em\|null, situacao }], total }` |

- Fila de decisoes: reaberturas e dilatacoes com situacao `SOLICITADA` (o
  model de reabertura nao tem `PENDENTE`), do pedido mais antigo para o mais
  novo (`solicitado_em` ASC; empate por tipo e id). `dias` e `prazo_vigente`
  so na dilatacao (senao `null`); `prazo_vigente` e o prazo efetivo atual da
  medicao aprovada daquele mes (com dilatacao ja aprovada). Sem a tabela
  `cr_dilatacoes` (migration 202609290001 pendente) a fila traz so as
  reaberturas, sem 500.
- Reaberturas: mais recente primeiro (`createdAt` DESC, id DESC);
  `situacao` em `SOLICITADA`, `APROVADA` ou `NEGADA`. `decidido_por`/
  `decidido_em` vem de `aprovado_por`/`aprovado_em` (preenchidos tambem na
  negacao). `justificativa` vem do campo `observacao` do evento de auditoria
  da decisao (a tabela nao tem coluna propria).
- Decisao de reabertura: continua em `POST /reaberturas/:reaberturaId/aprovar`
  (`REOPEN_APPROVE`), que ja aprova e nega. Body
  `{ decisao: 'APROVADA'|'NEGADA', observacao?: string }`; `justificativa`
  e aceito como sinonimo de `observacao`. Aprovada vale 24 horas e leva mes
  `FINALIZADA` a `REABERTA`; transacional, auditada
  (`CR_REABERTURA_APROVADA`/`CR_REABERTURA_NEGADA`) e idempotente: pedido ja
  decidido devolve `{ idempotente: true, reabertura }` sem gravar. Nao foi
  criada rota `/decidir` para reabertura.
- Auditoria: mais recente primeiro (`criado_em` DESC, id DESC). `acao` filtra
  o evento exato; `de`/`ate` em AAAA-MM-DD, dias de Brasilia, `ate`
  inclusivo. `acoes` e a lista distinta de eventos do escopo (sem os demais
  filtros). Eventos sem obra so aparecem para quem tem escopo total.
- Planos e responsaveis: uma linha por obra ativa (`tipo_centro_custo`
  `OBRA`) do escopo, por nome, inclusive sem plano ou sem responsavel.
  `vigente` e a versao `PUBLICADA`; `total_versoes` conta todas as versoes.
- Obrigacoes: lista geral de `cr_obrigacoes_usuario` por `prazo_em` DESC, id
  DESC. `situacao` segue a tela de obrigacoes: `CUMPRIDA` depois do prazo
  vira `CUMPRIDA_COM_ATRASO`; `PENDENTE` com prazo ja passado vira `VENCIDA`
  (a situacao gravada so e recalculada quando o responsavel consulta). Filtro
  aceita `PENDENTE`, `VENCIDA`, `CUMPRIDA`, `CUMPRIDA_COM_ATRASO`;
  `DISPENSADA` so aparece sem filtro. A lista reflete o que ja foi gravado
  pelas consultas dos responsaveis.
- Bloqueio por obra (Fase 3): em `CR_GUARD_MODE=enforce`, a auditoria e os
  planos gerais tiram do resultado a obra travada do proprio usuario e o
  filtro direto por ela responde 403 `OBRA_TRAVADA_CUSTOS_RECEBIVEIS`, como as
  rotas por obra.
- Teste: `tests/validarFase4Admin.js`.

## Reforma 2026-09 - Fase 5: planilhas e saldo provavel

- Modelo de custo planejado: livre para editar (linhas 2 em diante nas 4
  colunas; inserir/excluir linhas permitido); so o cabecalho fica protegido.
- Modelos de medicao prevista e aprovada: so `quantidade` editavel; a protecao
  permite selecionar, formatar, arrastar/colar, autofiltro e ordenar; validacao
  de dados do Excel (0 ate o saldo disponivel da linha) em modo aviso.
- Importacao aceita formula e usa o valor calculado (inclusive formula
  compartilhada de arrasto); formula sem valor calculado ->
  `CR_PLANILHA_FORMULA_SEM_RESULTADO` ("abra e salve no Excel/LibreOffice");
  formula com erro -> `CR_PLANILHA_FORMULA_ERRO`. O teto vale sobre o valor
  resultante. Colunas lidas pelo nome do cabecalho; `versao_modelo` 3.
- Saldo provavel (regra aprovada em 29/09, "A + B"): cada item da medicao
  prevista traz `quantidade_aprovada_anterior`, `quantidade_prevista_pendente`
  (previsto de meses anteriores sem medicao aprovada nem "sem medicao"),
  `competencias_pendentes`, `saldo_disponivel` (teto que bloqueia) e
  `saldo_provavel`. Acima do provavel so avisa (`avisos` na resposta do
  salvar); acima do disponivel continua bloqueado. O modelo de medicao
  prevista ganha `previsto_aguardando_aprovacao` e `saldo_provavel`.
- Registrar a medicao aprovada do mes M devolve `ajuste_previsao` quando a
  previsao de M+1 passou do saldo; o detalhe de M+1 traz
  `ajuste_previsao_pendente`. `POST /obras/:obraId/competencias/:competencia/
  previsao/ajustar-saldo` (`medicao.consolidar` ou
  `planejamento.preencher_recebiveis`; `Idempotency-Key`) reduz os itens ao
  saldo, mesmo com o mes finalizado, sem aumentar nada; auditoria
  `CR_PREVISAO_AJUSTADA_SALDO`.

## Regras de evolucao

- Cada fase funcional deve ser entregue e aceita separadamente.
- Nao executar migrations em ambiente compartilhado sem confirmacao explicita.
- Nao habilitar a feature antes da homologacao.
- Nao criar fallback de permissao ou escopo legado.
- Nao alterar os calculos existentes de Provisionamento, Obras, DRE, Resultado de Obras,
  Compras ou Financeiro.
- Toda mutacao futura deve ser transacional, idempotente quando aplicavel e auditada.

## Validacao das Fases 0, 1, 2, 3 e 4

Executar:

```powershell
cd C:\Fluxy\backend
node src/modules/custosRecebiveis/tests/validarFase0.js
node src/modules/custosRecebiveis/tests/validarFase1.js
npm.cmd run test:custos-recebiveis-fase2
npm.cmd run test:custos-recebiveis-fase3
npm.cmd run test:custos-recebiveis-fase4
npm.cmd run test:custos-recebiveis-prontidao
npm.cmd run test:custos-recebiveis-prazos
npm.cmd run test:custos-recebiveis-bloqueio
npm.cmd run test:docs
npm.cmd run test:compra-cotacao-envio
npm.cmd run test:compra-remanejamento
npm.cmd run test:security-hardening
npm.cmd run test:importacao-titulos
npm.cmd run test:payments
npm.cmd run test:smoke-sst

cd C:\Fluxy\frontend
npm.cmd run build
```

Antes da homologacao visual em dev, a feature deve ser habilitada somente mediante
confirmacao explicita. A migration de desenvolvimento ja foi executada; nenhuma
migration foi executada em producao.
