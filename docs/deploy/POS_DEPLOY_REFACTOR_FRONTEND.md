# Pós-deploy da `refactor/frontend`

Guia operacional para comparar a produção atual (`main`) com a linha de homologação
(`refactor/frontend`), promover o código, configurar a produção e treinar os usuários.

> Este documento descreve mudanças funcionais e ações operacionais. Ele não autoriza o
> deploy por si só. Backup, revisão das migrations e janela de implantação continuam
> obrigatórios.

## 1. Fotografia usada nesta revisão

Documento atualizado em **14/09/2026** com as referências remotas disponíveis naquele
momento:

| Referência | Commit |
|---|---|
| Base comum entre `main` e `refactor/frontend` | `6e62031018c82bd4f6e539a9829c64d098243dd6` |
| Alvo revisado de `refactor/frontend` | `0f264e61` — `feat: adicionar abas internas de navegacao` |
| Intervalo auditado | `6e620310..0f264e61` |

No intervalo existem **387 commits** e **950 arquivos alterados**: 520 adicionados,
383 modificados e 47 removidos, com aproximadamente 216 mil inserções e 59 mil
remoções. Esses números incluem a transformação ampla do frontend, testes e
documentação; não representam 950 funcionalidades independentes.

Antes do deploy, atualize as referências e confira se a fotografia ainda é válida:

```bash
git fetch origin --prune
git rev-parse origin/main
git rev-parse origin/refactor/frontend
git merge-base origin/main origin/refactor/frontend
git log --oneline --reverse origin/main..origin/refactor/frontend
git diff --stat origin/main..origin/refactor/frontend
```

Se o commit de destino não for mais `0f264e61`, revise os commits posteriores e registre
o novo SHA neste documento antes de promover.

## 2. Resumo executivo: produção atual versus novo comportamento

| Área | Em `main` na base comparada | Em `refactor/frontend` | Ação após deploy |
|---|---|---|---|
| Interface | Telas e modais com padrões variados | Design operacional unificado, responsivo e mais compacto | Treinar navegação, filtros, colunas, blocos e modais |
| Navegação | Cada abertura ocupa a página atual ou uma aba do navegador | Abas internas persistidas durante a sessão | Demonstrar `+`, Ctrl/Cmd+clique, clique do meio e fechamento |
| Solicitações | Regras mais dependentes de perfil e fluxos pontuais | Permissões granulares, retorno formal, aprovação e destino configuráveis | Revisar permissões, tipos, campos, setores, status e ações principais |
| Contratos e medições | Fluxos parciais/legados | Contrato operacional com parcelas, aditivos, jurídico, medições e auditoria | Configurar tipos, categorias, limites, responsáveis e permissões |
| Compras | Gestão parcial dos itens e financeiro do pedido | Catalogação, unidade, apropriação, cotação e previsão parcelada integradas | Validar catálogo, permissões de Compras e fluxo GEO → Compras |
| Financeiro | Criação e baixa pelos fluxos já existentes | Favorecido por título, PIX, fila manual e tratamento de divergências | Separar perfis de preparação, baixa e aprovação de divergência |
| RH/DP | Cadastros e rotinas anteriores | Solicitações de pessoal, vínculos, documentos, salários, jornada e eventos | Configurar permissões e treinar DP, gestores e Obras |
| Comercial | Contrato/venda sem o novo fluxo de importação multiunidade | Importação do legado comercial e contratos multiunidade | Liberar permissão apenas para operadores responsáveis |
| Preferências | Parte das escolhas ficava no navegador ou não existia | Filtros, colunas, larguras e blocos persistidos por usuário no banco | Explicar personalização e como restaurar a visualização |

## 3. Alterações globais de interface e navegação

### 3.1 Padrão visual responsivo

- páginas administrativas e operacionais foram migradas para componentes comuns de
  cabeçalho, blocos, filtros e tabelas;
- o layout passou a priorizar densidade operacional, leitura rápida e adaptação a zoom,
  notebook e celular;
- tabelas extensas mantêm rolagem horizontal sem cortar ações;
- filtros podem ser mostrados ou ocultados sem alterar o resultado da consulta;
- o usuário pode escolher colunas e, nas tabelas compatíveis, ajustar larguras;
- blocos do detalhe e da página inicial podem ser organizados por configuração e por
  preferência do usuário;
- a busca global por `Ctrl+K` passou a consultar o backend e respeitar o acesso do usuário;
- o usuário pode escolher a página inicial disponível para seu perfil.

### 3.2 Modais

O padrão de modal agora prevê:

- centralização no viewport;
- altura limitada à área visível;
- rolagem vertical e horizontal quando conteúdo ou zoom exigirem;
- cabeçalho e rodapé preservados durante a rolagem;
- área útil ampliada para Gerenciar itens e outros fluxos densos;
- autocomplete, seletor e camada flutuante acima do modal que os abriu;
- fechamento consistente por botão, `Esc` e, quando seguro, clique fora.

No smoke test, abra pelo menos um modal simples, um com tabela larga, um autocomplete
dentro de modal, o visualizador de PDF e o Gerenciar itens com zoom de 100%, 125% e 150%.

### 3.3 Abas internas do Fluxy

A barra de abas fica logo abaixo do cabeçalho principal.

- `+` abre a busca no modo de nova aba interna;
- Ctrl/Cmd+clique ou clique do meio em uma navegação compatível abre uma aba interna;
- links internos com intenção de nova aba também são capturados pelo sistema;
- a aba ativa é destacada e pode ser fechada pelo `x`;
- há rolagem horizontal quando a barra não comporta todas as abas;
- atalhos de teclado permitem navegar e fechar a aba ativa;
- o limite atual é de 12 abas;
- as abas são preservadas em `sessionStorage`, separadas por usuário e sessão;
- não há cadastro administrativo necessário.

Treinamento: deixar claro que uma aba interna não cria outro login nem outro processo no
navegador. Ela mantém contextos do Fluxy dentro da mesma sessão. Ao encerrar a sessão do
navegador, a lista pode ser reiniciada.

### 3.4 Novas configurações de experiência

As seguintes páginas passam a compor a central de Configurações:

| Página | Finalidade |
|---|---|
| Ação Principal por Setor | Define qual ação ganha destaque no detalhe da solicitação |
| Atalhos por Setor | Define atalhos sugeridos e obrigatórios de cada setor |
| Layout do Detalhe por Setor | Organiza blocos da Home e do detalhe por setor |
| Formas da Nova Solicitação | Controla formas de pagamento e alertas exibidos na abertura |

As configurações são persistidas no banco. Não copie dados do ambiente de desenvolvimento
para produção: refaça conscientemente as escolhas na interface de produção.

### 3.5 Home, hubs e comunicação

- a Home passou a carregar blocos opcionais sob demanda e respeitar configuração por setor;
- módulos possuem hubs mais consistentes, com uma única fonte de navegação compartilhada
  pelo frontend e pelo backend;
- ações sem rota alcançável foram removidas ou receberam uma entrada válida;
- Conversa e Histórico no detalhe nascem abertos, e o usuário pode escolher a ordem do
  histórico;
- a Comunicação Interna passou a aceitar o identificador da conversa pela URL e ganhou
  ações alcançáveis de concluir, reabrir e adicionar participantes;
- páginas compartilhadas, públicas e sem o shell principal receberam regras próprias de
  responsividade e navegação.

Bookmarks antigos precisam ser incluídos no smoke. Entradas consolidadas podem redirecionar
para o novo hub em vez de manter uma página duplicada.

### 3.6 Troca rápida de usuário — somente desenvolvimento

O SUPERADMIN do ambiente de desenvolvimento pode definir até 20 usuários em
**Configurações → Usuários para Teste Rápido**. O seletor exibido no topo permite assumir
temporariamente as permissões, o setor e a visibilidade reais de um desses usuários, trocar
diretamente para outro perfil configurado e retornar ao SUPERADMIN sem conhecer ou alterar a
senha do usuário testado.

O recurso é uma ferramenta de QA e **não pode ser habilitado em produção**. O backend só o
expõe quando as duas condições abaixo são verdadeiras ao mesmo tempo:

```text
DEPLOYMENT_ENV=development
DEV_USER_SWITCH_ENABLED=true
```

Com qualquer outro valor, as rotas recusam a operação, a tela de configuração fica
inacessível e o seletor não aparece. A sessão assumida também deixa de ser aceita se a
funcionalidade for desativada, se o SUPERADMIN original for inativado ou se as sessões dele
forem revogadas. A auditoria preserva o usuário simulado e registra separadamente o
SUPERADMIN que iniciou o teste.

## 4. Solicitações

### 4.1 Permissões, leitura e interação

- permissões granulares de área prevalecem sobre restrições legadas de perfil na lista e
  no detalhe;
- menção libera leitura do detalhe, mas não autoriza movimentar registro fora do setor do
  usuário;
- assumir, alterar status ou enviar continua condicionado ao setor atual, salvo exceções
  administrativas explícitas;
- o fluxo de pedido de retorno registra solicitação, decisão, histórico e notificação;
- foram adicionadas as permissões `solicitacoes.retorno.solicitar` e
  `solicitacoes.retorno.decidir`.

### 4.2 Tipos, campos e destino de abertura

As três configurações abaixo têm responsabilidades diferentes:

| Configuração | O que controla |
|---|---|
| Tipos de Solicitação / Subtipos | Cadastro e comportamento do tipo macro e dos subtipos |
| Campos da Nova Solicitação | Campos visíveis e obrigatórios por tipo |
| Tipos por Obra/Centro de Custo | Catálogo comum disponível nas Obras e tipos permitidos em cada Centro de Custo |

Na nova regra, toda abertura normal nasce no GEO com status inicial previsto pelo fluxo.
“Tipos por Obra/Centro de Custo” não substitui automação de status nem aprovação: ele só
determina quais tipos o solicitante pode escolher para aquele destino.

### 4.3 Aprovação por Tipo

Caminho: **Configurações → Aprovação por Tipo**
(`/aprovacao-solicitacao-por-tipo`).

Para cada tipo que deve seguir após análise do GEO, informe:

1. setor de destino;
2. status de chegada escolhido entre os status ativos do GEO.

O botão **Aprovar solicitação** aparece no detalhe quando:

- o tipo possui regra válida;
- a solicitação está no GEO;
- a solicitação não está cancelada;
- o usuário é administrador de negócio, pertence a um setor marcado como GEO ou possui
  `solicitacoes.acoes.aprovar`.

Solicitação de Compra sugere o setor **COMPRAS**. O destino e o catálogo de status têm
funções distintas: o destino define para onde o registro segue e o status aplicado é uma
decisão do GEO. O fallback histórico usa `LIBERADO` somente quando esse status está ativo
no GEO. Uma regra padrão inválida não bloqueia mais o salvamento das outras configurações.
O salvamento é parcial: somente os tipos efetivamente alterados na tela são validados e
gravados. Uma regra antiga não editada, cujo status tenha sido desativado depois, é
preservada e identificada como **inativa no GEO**, sem impedir a atualização dos demais
tipos. Para excluir essa regra antiga, limpe a configuração daquele tipo e salve novamente.

Tipos sem configuração continuam sem aprovação automática por esse mecanismo. Automação
por Status permanece separada e só deve ser usada quando a movimentação depender da troca
de status, não do botão de aprovação.

### 4.4 Campos, credor, pagamento e anexos

- CPF/CNPJ de credor e favorecido têm validação e normalização;
- tipos autorizados podem oferecer cadastro rápido de novo credor;
- a chave PIX informada na solicitação é reaproveitada na criação do título;
- tipos configurados com o campo Forma de pagamento aplicam a regra de anexo:
  - `BOLETO`: anexo visível e opcional;
  - demais formas: anexo obrigatório, com indicação visual e validação no envio;
- o rótulo geral passou a ser **Valor**; o texto auxiliar que vinculava visualmente valor e
  apropriação foi removido;
- data e finalidade são exibidas conforme o comportamento configurado do tipo.

### 4.5 Despesa Eventual

Para funcionar em produção:

1. cadastre ou ajuste o tipo macro em **Tipos de Solicitação**;
2. habilite o comportamento `usa_fluxo_despesa_eventual`;
3. cadastre seus subtipos em **Subtipos de Contrato** quando a operação exigir
   classificação subordinada;
4. habilite em **Campos da Nova Solicitação** os campos usados pelo processo, em especial
   valor, obra/centro de custo, credor, forma de pagamento, data e apropriação conforme a
   política interna;
5. libere o tipo em **Tipos por Obra/Centro de Custo**;
6. configure, se aplicável, **Aprovação por Tipo**;
7. revise os limites `DESPESA_EVENTUAL_LIMITE_SOLICITACAO` e
   `DESPESA_EVENTUAL_LIMITE_OBRA` na configuração do sistema;
8. conceda as permissões necessárias aos usuários do GEO/Gerência de Processos.

O detalhe passa a mostrar e permitir manutenção das apropriações da Despesa Eventual para
quem tem autorização.

### 4.6 Recarga de Cartão

- cartão, usuários autorizados, título de previsão, valor efetivamente recarregado,
  prestação de contas e rateios passam a formar um fluxo único;
- a aprovação da solicitação abre o título financeiro de previsão;
- a abertura decorre do evento de aprovação e não depende de o status de chegada se chamar
  `LIBERADO` ou `APROVADA`;
- empresa e categoria financeira passam a ser definidas no cadastro do cartão e copiadas
  automaticamente para cada novo título;
- a obra e a apropriação do custo permanecem para a prestação de contas, sem usar a obra
  inicial da solicitação como classificação financeira definitiva;
- baixa integral, parcial ou divergente pode devolver a solicitação ao setor criador;
- o envio da prestação libera a próxima recarga e retorna a solicitação ao GEO com
  `PENDENTE` para validação;
- o GEO pode corrigir obra, centro de custo e apropriação antes da validação, sem alterar
  valores;
- uma recarga devolvida sem baixa/prestação pode ser corrigida e reenviada no mesmo
  registro.

Configurar em produção:

- **Configurações → Cartões de Recarga**;
- empresa, categoria financeira e usuários autorizados por cartão;
- tipo de solicitação e campos necessários;
- destino/status em Aprovação por Tipo;
- permissões financeiras e de solicitação dos participantes.

## 5. Contratos e medições

### 5.1 Contrato de obra

O novo fluxo inclui:

- código sequencial por obra;
- credor/favorecido e conclusão cadastral;
- categoria financeira permitida por obra;
- parcelas e cronograma;
- responsáveis;
- documentação, negociação e tramitação jurídica;
- limite para análise jurídica;
- assinatura, rejeição, reenvio, cancelamento e encerramento auditados;
- aditivo de valor, prazo e cronograma;
- alertas de vigência e de saldo;
- bloqueios de concorrência e idempotência nas ações críticas.

Configurar em produção:

1. **Categorias do Contrato de Obra**;
2. **Alertas e Limites do Contrato**;
3. tipos/subtipos do fluxo contratual, incluindo abertura, solicitação e aditivo;
4. campos obrigatórios por tipo;
5. responsáveis e setores do fluxo;
6. permissões de Contratos;
7. modelos e requisitos documentais usados pelo processo.

### 5.2 Medição

Na Nova Solicitação do tipo Medição:

- o contrato é pesquisável por autocomplete com lista rolável;
- código e título aparecem juntos na opção do contrato;
- o antigo campo isolado “Título do Contrato” foi removido;
- o credor foi levado para o card do contrato e é carregado pelo vínculo contratual;
- a antiga nomenclatura “Vínculo e pagamento” deixou de ser usada;
- o card **Medição — títulos do contrato** é responsivo;
- a coluna antes identificada apenas por `#` passou a ser **Parcela**;
- valor, vencimento, saldo e situação da parcela são apresentados de forma operacional;
- parcelas já comprometidas/medidas respeitam os bloqueios do fluxo;
- aprovação, devolução e anexos integram o histórico.

### 5.3 Permissões novas de Contratos

- `contratos.geral.encerrar`
- `contratos.credor.completar_cadastro`
- `contratos.solicitacao.cancelar`
- `contratos.fluxo.reenviar`
- `contratos.juridico.tramitar`
- `contratos.medicao.editar_valor`
- `contratos.aprovacao.aprovar`

## 6. Compras, itens e cotações

### 6.1 Gerenciar itens

A mesma gestão foi aplicada à Compra Direta e à Solicitação de Compra:

- selecionar item e revisar quantidade;
- editar apropriações;
- catalogar item manual vinculando cadastro existente ou criando novo;
- cadastrar unidade pendente;
- manter a descrição original para auditoria;
- mostrar descrição da apropriação, não apenas o código;
- suportar compras diretas legadas quando houver vínculo suficiente.

Em Solicitações de Compra legadas sem os vínculos estruturados exigidos pelo novo modelo,
o sistema não inventa dados nem regrava o histórico. A interface deve mostrar a mensagem
simples de indisponibilidade e preservar a consulta do registro.

O card geral de Apropriações foi ocultado para Compra Direta e Solicitação de Compra,
porque a manutenção acontece por item no Gerenciar itens.

### 6.2 Inclusão de item

- ao escolher um item oficial, sua unidade vem preenchida;
- o usuário pode alterar a unidade;
- também pode informar uma unidade ainda não cadastrada;
- a apropriação do item manual foi levada para o próprio modal de inclusão;
- GEO ou usuário autorizado pode catalogar o item e sua unidade posteriormente.

### 6.3 Cotação

- o valor das mercadorias é `quantidade solicitada × preço unitário`;
- quantidade disponível é informação do fornecedor e não altera o valor total;
- frete e impostos permanecem componentes separados da composição;
- saldo remanescente pode receber nova oferta do mesmo fornecedor;
- PDFs de Solicitação de Compra e Compra Direta exibem a descrição da apropriação.

### 6.4 Financeiro do pedido

- o GEO pode criar previsões financeiras parceladas para o pedido;
- títulos ficam vinculados ao pedido e à origem do novo fluxo;
- confirmação do fornecedor registra tipo, documento, observação e arquivo;
- a liberação para pagamento ocorre somente depois da confirmação;
- há pedido e aprovação de reabertura do fluxo financeiro.

### 6.5 Permissões novas de Compras

- `compras.insumos.catalogar_itens_manuais`
- `compras.pedidos.financeiro.visualizar`
- `compras.pedidos.financeiro.anexar_documentos`
- `compras.pedidos.financeiro.gerar_previsao`
- `compras.pedidos.financeiro.liberar_pagamento`
- `compras.pedidos.financeiro.aprovar_reabertura`

Revisar também as permissões existentes `compras.solicitacoes.encaminhar_compras` e
`compras.solicitacoes.editar_itens`, cujas telas e responsabilidades ficaram mais claras.

## 7. Financeiro

### 7.1 Criação de títulos

- “Gerar Conta” passou a ser apresentado como **Criar Título**;
- o formulário aceita mais de uma forma de pagamento e múltiplos títulos;
- cada título pode ter credor/favorecido, categoria e dados de pagamento próprios;
- é possível usar o próprio credor como favorecido;
- a chave PIX cadastrada ou informada na solicitação é sugerida;
- em múltiplos títulos, o usuário pode escolher entre chaves cadastradas ou digitar outra
  diretamente;
- apropriações podem ser informadas no título;
- a competência DRE usa automaticamente a data de criação do título e deixou de ser
  exibida nos modais de criação.

### 7.2 Consultas de títulos

- Contas a Receber reconhece e filtra títulos `ABERTO - VENCIDO`;
- filtros de valor e vencimento foram corrigidos/validados;
- relatórios financeiros não ficam mais limitados a uma janela anual fixa;
- alertas de retorno da Obra e de divergência aparecem diretamente na linha do título.

### 7.3 Fila de Pagamentos

Caminho: **Financeiro → Fila de Pagamentos** (`/financeiro/fila-pagamentos`).

Fluxo:

1. usuário com acesso completo a Contas a Pagar seleciona títulos e usa **Enviar para
   pagamento**;
2. operador da fila visualiza somente os títulos preparados para sua atividade;
3. na tabela, informa data da baixa, conta pagadora e valor pago;
4. a empresa é derivada da conta bancária e não é escolhida separadamente;
5. registra individualmente ou em massa;
6. processamento em massa é atômico: uma falha de validação impede gravação parcial do
   lote;
7. “Não pago” e divergências voltam para análise conforme o status da fila.

Os cards **Pendentes**, **Não pagos**, **Divergentes**, **Baixados** e **Resolvidos** são
filtros clicáveis.

Regras de divergência:

- pagamento parcial exige justificativa e é tratado como divergente;
- pagamento acima do saldo exige justificativa e aguarda autorização;
- a justificativa original fica visível na coluna própria;
- gestor pode autorizar uma divergência individual ou aprovar selecionados em massa;
- reabrir uma divergência não exige nova justificativa; a explicação original é preservada;
- Contas a Pagar mostra o alerta do título divergente e permite a ação do usuário
  autorizado;
- erros ao registrar baixa aparecem em modal com **O que aconteceu** e **Como corrigir**,
  conduzindo o foco ao campo inválido.

Permissões da fila:

| Permissão | Uso esperado |
|---|---|
| `financeiro.fila_pagamentos.visualizar` | Entrar na tela e consultar a fila |
| `financeiro.fila_pagamentos.preparar` | Selecionar títulos em Contas a Pagar e enviar à fila |
| `financeiro.fila_pagamentos.baixar` | Informar dados e registrar a baixa |
| `financeiro.fila_pagamentos.reportar` | Marcar pagamento não realizado/divergente conforme o fluxo |
| `financeiro.fila_pagamentos.resolver` | Autorizar, resolver ou reabrir divergências |

Para o operador restrito, conceda somente o módulo/tela e as ações necessárias. Não é
preciso liberar todo o Financeiro.

### 7.4 Conciliação e estornos

Foi aplicada uma correção isolada no alerta de estorno bancário:

- mesmo quando o estorno encontra match, o card do lançamento Fluxy mantém os atalhos de
  associação manual, transferência e demais ações permitidas;
- descrições como taxa de devolução de cheque deixam de bloquear o lançamento da taxa por
  terem sido classificadas como estorno;
- o fluxo principal de revisão do estorno continua disponível.

Essa correção entrou no commit `ae0f32ed` e deve ser incluída no smoke de conciliação.

## 8. RH/DP

O conjunto novo inclui:

- vínculo do colaborador com Obra/Centro de Custo e histórico de movimentação;
- solicitações de admissão, movimentação, demissão e alteração salarial;
- rascunho, anexos, envio, decisão do DP e histórico;
- catálogo de cargos e exigências documentais;
- validação de anexos/documentos;
- histórico salarial e aprovação específica;
- eventos recorrentes e adicionais por período;
- jornada por obra e período, com controle de edição;
- limitação do gestor da Obra aos colaboradores vinculados ao seu escopo;
- pesquisa de obra de destino por autocomplete.

Permissões novas:

- `rh_dp.solicitacoes.abrir`
- `rh_dp.solicitacoes.anexar`
- `rh_dp.solicitacoes.decidir`
- `rh_dp.solicitacoes.ver_todas`
- `rh_dp.salario.aprovar`

Antes de liberar, cadastre cargos, exigências documentais e responsáveis. Treine o gestor
para salvar rascunho e enviar formalmente; treine o DP para conferir anexos, decidir,
registrar movimentações e manter salário/jornada.

## 9. Comercial, Custos e Recebíveis

### Comercial

- contratos comerciais passaram a suportar múltiplas unidades;
- foi adicionada importação do legado comercial com rastreabilidade de lote, linha e
  resultado;
- a nova permissão `comercial.vendas.importar` deve ficar restrita aos responsáveis pela
  carga e conferência;
- qualquer backfill/importação de produção deve começar em modo de simulação e ter
  aprovação separada antes da escrita.

### Custos e Recebíveis

- custos planejados foram generalizados além do recorte exclusivo de Obras;
- telas, tabelas e filtros receberam o mesmo padrão responsivo e de preferências;
- validar relatórios por Obra, Centro de Custo e período após a promoção.

### Demais módulos alcançados pela reforma visual

Financeiro completo, Fiscal, CRM, Provisionamento, Governança, SST, relatórios e páginas
públicas/compartilhadas também foram migrados para os componentes e verificadores comuns.
Onde não há uma regra funcional registrada neste documento, a intenção é preservar a regra
de negócio existente e alterar somente apresentação, densidade, navegação, acessibilidade,
filtros, tabelas e mensagens. Por isso, cada responsável deve validar pelo menos uma tela de
lista, uma tela de detalhe e uma ação de gravação de seu módulo.

### Governança e auditoria

- operações novas registram eventos de aprovação, movimentação e ações críticas;
- a auditoria operacional exibe status/setor de destino e tipo da interação quando
  aplicável;
- conteúdo de comentários e anexos não é copiado para o log;
- o enriquecimento vale para eventos novos; o sistema não inventa detalhes para históricos
  antigos.

## 10. Permissões granulares adicionadas

Conferir em **Configurações → Permissões de Áreas por Usuário**. A lista abaixo é o delta
de ações encontrado no código em relação à base de `main`:

```text
comercial.vendas.importar
compras.insumos.catalogar_itens_manuais
compras.pedidos.financeiro.anexar_documentos
compras.pedidos.financeiro.aprovar_reabertura
compras.pedidos.financeiro.gerar_previsao
compras.pedidos.financeiro.liberar_pagamento
compras.pedidos.financeiro.visualizar
contratos.aprovacao.aprovar
contratos.credor.completar_cadastro
contratos.fluxo.reenviar
contratos.geral.encerrar
contratos.juridico.tramitar
contratos.medicao.editar_valor
contratos.solicitacao.cancelar
financeiro.fila_pagamentos.baixar
financeiro.fila_pagamentos.preparar
financeiro.fila_pagamentos.reportar
financeiro.fila_pagamentos.resolver
financeiro.fila_pagamentos.visualizar
rh_dp.salario.aprovar
rh_dp.solicitacoes.abrir
rh_dp.solicitacoes.anexar
rh_dp.solicitacoes.decidir
rh_dp.solicitacoes.ver_todas
solicitacoes.retorno.decidir
solicitacoes.retorno.solicitar
```

Além delas, a aprovação configurável utiliza a permissão já existente
`solicitacoes.acoes.aprovar`.

Após alterar permissões, encerre e refaça a sessão do usuário para evitar testar com uma
sessão que ainda carrega a fotografia anterior.

## 11. Migrations estruturais pendentes no delta

Há **53 migrations JavaScript** adicionadas entre a base comum e o alvo revisado:

```text
202608160050_obra_tipo_apropriacao_padrao.js
202608160051_contrato_fluxo_novo.js
202608160052_contratos_codigo_obra_unico.js
202608160053_contrato_parcelas.js
202608170050_contrato_categoria_financeira.js
202608170051_medicao_parcelas.js
202608180050_contrato_parcelas_valor_previsto.js
202608180051_medicao_parcelas_devolucao.js
202608180052_contrato_favorecido.js
202608180053_contrato_justificativa.js
202608180054_contrato_aditivos.js
202608190050_contrato_solicitacao.js
202608190051_contrato_medicoes.js
202608190052_anexo_historico_medicao.js
202608200050_contrato_anexo_tipo.js
202608200051_catalogacao_itens_manuais.js
202608200052_contrato_link_assinatura.js
202608200053_contrato_rejeitado_na_etapa.js
202608210050_contrato_aditivo_tipo_parcelas.js
202608230050_parceiro_fantasia_representante.js
202608230051_medicao_pagamento_e_aprovacao.js
202608250050_rh_colaborador_vinculos.js
202608250051_rh_solicitacoes.js
202608250052_rh_solicitacao_anexos.js
202608260050_rh_eventos_recorrentes.js
202608260051_solicitacao_justificativa_favorecido_forma.js
202608260052_solicitacao_chave_pix.js
202608260053_rh_colaborador_salarios.js
202608260054_rh_importacao_origem.js
202608260055_rh_anexo_validacao.js
202608260056_status_pedido_aditivo_geo.js
202608260057_contrato_documentacao_juridica.js
202608270050_solicitacao_pedidos_retorno.js
202608270051_rh_catalogo_cargos_e_documentos.js
202608270052_rh_colaborador_cadastro_completo.js
202608270053_despesa_eventual.js
202608270054_rh_pagamento_adicionais_e_periodo.js
202608270055_recarga_cartao_fluxo.js
202608280001_compras_oferta_saldo_mesmo_fornecedor.js
202609020050_lista_preferencias_filtros.js
202609020051_indices_busca.js
202609020052_configuracao_por_setor.js
202609030050_favorecido_simplificado.js
202609030051_contrato_aditivo_cronograma.js
202609030052_titulo_bloqueio_retorno_obra.js
202609030053 — importação comercial multiunidade (consulte o nome técnico no diretório de migrations)
202609050050_lista_preferencias_tipo.js
202609070050_pedido_compra_gestao_financeira_geo.js
202609070051_tipos_solicitacao_por_destino.js
202609070052_rh_jornada_periodos_edicao.js
202609100050_titulo_favorecido_pagamento.js
202609100051_fila_pagamentos_manuais.js
202609140001_cartao_recarga_classificacao_financeira.js
```

Depois da migration, complete **Empresa responsável** e **Categoria financeira** em todos
os cartões existentes antes de liberar novas recargas. Ciclos antigos continuam
preservados; ao validar uma prestação legada, o sistema usa a classificação atual do
cartão quando o título ainda não a possui.

Arquivos SQL auxiliares antigos foram removidos do repositório. Isso é limpeza de fontes
legadas e **não** autoriza desfazer estruturas existentes no banco.

### Proteção do runner

O boot do backend apenas verifica migrations pendentes. A execução estrutural é explícita
e exige autorização transitória:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes/backend
npm run preflight:schema
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
npm run preflight:schema
```

Não grave `ALLOW_SCHEMA_MIGRATIONS=true` no `.env`, no ecosystem do PM2 ou no serviço. A
flag deve existir somente no comando aprovado da janela de implantação.

O preflight é somente leitura. Se acusar divergência de tipo, engine, chave ou migration
incompatível, interrompa o deploy e corrija a causa; não force constraints manualmente sem
analisar o schema real.

## 12. Variáveis de ambiente

O delta de `backend/.env.example` inclui variáveis de proteção para DEV/QA:

```text
DEV_TEST_ALLOWED_DB_HOST
DEV_TEST_ALLOWED_DB_NAME
DEPLOYMENT_ENV
DEV_USER_SWITCH_ENABLED
```

As duas primeiras protegem scripts com escrita. Para a troca rápida de usuário, configure
`DEPLOYMENT_ENV=development` e `DEV_USER_SWITCH_ENABLED=true` somente no processo
`backend-dev`. Em produção, mantenha `DEPLOYMENT_ENV` com identificação de produção (ou em
branco) e `DEV_USER_SWITCH_ENABLED=false`. Não há nova variável obrigatória de runtime de
produção neste intervalo.

Preserve integralmente os `.env` atuais da EC2 e da Vercel. Nunca copie `.env` do ambiente
de desenvolvimento para produção.

## 13. Sequência segura de deploy

### 13.1 Antes da janela

- [ ] congelar alterações na branch de destino;
- [ ] registrar SHA atual de `main` e SHA exato que será promovido;
- [ ] revisar `git log` e `git diff` do intervalo final;
- [ ] gerar backup verificável do MySQL;
- [ ] confirmar espaço, saúde do PM2, Nginx, S3 e Vercel;
- [ ] exportar/fotografar configurações atuais de tipos, status, permissões e automações;
- [ ] definir responsáveis pelos smokes de Solicitações, Compras, Financeiro, Contratos,
  RH/DP e Comercial;
- [ ] comunicar janela e plano de reversão.

### 13.2 Backend na EC2 de produção

Use o diretório real da produção e reinicie somente `backend-solicitacoes`:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes
git fetch origin --prune
git status --short
git pull --ff-only origin main
cd backend
npm install
npm run preflight:schema
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
npm run preflight:schema
npm run test:fila-pagamentos
npm run test:competencia-dre-titulos
npm run test:solicitacao-pix-apropriacoes
npm run test:compra-catalogacao-insumos
npm run test:compra-unidade-item
npm run test:despesa-eventual
npm run test:recarga-cartao
npm run test:pedido-financeiro-geo
pm2 restart backend-solicitacoes --update-env
pm2 status
pm2 logs backend-solicitacoes --lines 100
```

Confirme os nomes de scripts em `backend/package.json` no SHA final. Se algum script tiver
outro nome, use o nome versionado; não improvise um comando em produção.

Nunca reinicie `backend-dev` numa implantação exclusiva de produção.

### 13.3 Frontend

- antes da promoção, executar em ambiente de build:

```bash
cd frontend
npm install
npm run verificar
```

- promover o mesmo conjunto aprovado para `main`;
- aguardar o deploy da Vercel;
- se necessário, executar redeploy sem cache;
- conferir a variável de origem da API e os domínios oficiais;
- abrir a aplicação em janela anônima e fazer login real de teste;
- fazer hard refresh após o backend estar saudável.

## 14. Configuração de produção após o código

Executar nesta ordem para evitar botões sem destino, tipos sem campos ou usuários sem
ação:

1. **Setores e Status por Setor** — confirme códigos, capacidades e status ativos.
2. **Permissões de Áreas por Usuário** — atribua apenas as novas ações necessárias.
3. **Tipos e Subtipos** — revise comportamentos de Contrato, Medição, Despesa Eventual,
   Recarga e Solicitação de Compra.
4. **Tipos por Obra/Centro de Custo** — defina o catálogo de abertura.
5. **Campos da Nova Solicitação** — visibilidade e obrigatoriedade por tipo.
6. **Formas da Nova Solicitação** — opções de pagamento oferecidas.
7. **Aprovação por Tipo** — setor e status de chegada; salve somente combinações válidas.
8. **Automação por Status** — mantenha apenas movimentações que realmente dependem do
   status, evitando duplicar a aprovação por tipo.
9. **Ação Principal, Atalhos e Layout por Setor** — organize o detalhe operacional.
10. **Contratos** — categorias, alertas/limites, responsáveis e documentação.
11. **Cartões de Recarga** — cartões e usuários autorizados.
12. **RH/DP** — cargos, documentos exigidos e responsáveis.
13. **Compras** — catálogo/unidades e permissões financeiras do pedido.
14. **Fila de Pagamentos** — separar quem prepara, quem baixa e quem resolve divergência.

Não configure usuários para teste rápido em produção e não habilite as variáveis exclusivas
de desenvolvimento no processo `backend-solicitacoes`.

Registre em evidência a configuração final de cada item e o responsável pela validação.

## 15. Matriz mínima de smoke pós-deploy

| Área | Caminho feliz obrigatório | Exceção obrigatória |
|---|---|---|
| Login/permissões | Login, menu e página inicial corretos | Usuário sem permissão não vê/não executa ação |
| Navegação | Abrir, alternar e fechar aba interna | Limite/rolagem com várias abas |
| Modal | Abrir modal com autocomplete | Zoom 150% sem corte de conteúdo/ação |
| Solicitação | Criar tipo configurado e chegar ao GEO | Anexo obrigatório fora de Boleto |
| Aprovação por Tipo | Aprovar e chegar ao setor/status configurados | Regra incompleta não pode ser salva/usada |
| Compra | Item oficial + item manual + unidade + apropriação | Registro legado mostra tratamento claro |
| Cotação | Total por quantidade solicitada | Quantidade disponível diferente não altera total |
| Pedido | Gerar parcelas, confirmar fornecedor e liberar | Solicitar/revisar reabertura |
| Criar Título | Um título e múltiplos títulos com favorecido/PIX | PIX editado e soma das formas inválida |
| Fila | Enviar, preencher e baixar individual/em massa | Parcial/maior exige justificativa e autorização |
| Conciliação | Conciliar lançamento comum | Estorno com match mantém atalhos; taxa é lançável |
| Contrato | Criar contrato e parcelas | Tramitação jurídica/aditivo/rejeição |
| Medição | Selecionar contrato e parcela | Parcela comprometida respeita bloqueio |
| Recarga | Aprovar, abrir título, baixar e prestar contas | Baixa parcial/divergente e retorno ao setor |
| RH/DP | Abrir, anexar, enviar e decidir solicitação | Gestor de Obra não acessa colaborador fora do vínculo |
| Comercial | Consultar contrato multiunidade | Importação inválida não grava parcialmente |

Além do caminho feliz, confira auditoria, histórico, notificação e proteção contra duplo
clique nas ações que criam ou movimentam registros.

## 16. Roteiro de treinamento

### Todos os usuários

- nova organização visual;
- busca global `Ctrl+K`;
- abas internas;
- filtros visíveis, colunas e larguras;
- modais com rolagem;
- página inicial e blocos personalizados;
- diferença entre ler uma solicitação mencionada e poder movimentá-la.

### GEO/Gerência de Processos

- conferir campos, anexos e apropriações;
- Aprovar solicitação e entender setor/status de destino;
- pedido de retorno;
- catalogação de itens manuais;
- Despesa Eventual, Recarga, Contrato e Medição.

### Compras

- Gerenciar itens em Compra Direta e Solicitação de Compra;
- unidade oficial versus unidade pendente;
- apropriação por item;
- quantidade solicitada versus disponível;
- cotação, saldo de oferta e financeiro do pedido.

### Financeiro — preparação

- selecionar títulos em Contas a Pagar;
- enviar para a fila;
- interpretar alertas de não pago e divergência.

### Financeiro — operador da fila

- usar cards como filtros;
- preencher data, conta e valor na tabela;
- baixa individual e em massa;
- justificativa para parcial/maior;
- corrigir erros apresentados no modal.

### Financeiro — aprovador

- revisar justificativa;
- autorizar individualmente ou em massa;
- reabrir sem apagar a justificativa original;
- acompanhar reflexo em Contas a Pagar.

### Contratos/Jurídico

- novo contrato, parcelas e documentação;
- tramitação, assinatura, rejeição e reenvio;
- aditivos e alertas;
- edição excepcional de medição por permissão.

### RH/DP e gestores de Obra

- vínculo do colaborador;
- rascunho versus envio formal;
- anexos e exigências documentais;
- decisão, salário, jornada e eventos;
- limites de acesso por Obra.

### Administradores

- diferença entre tipos, campos, catálogo de destino, aprovação e automação;
- configuração de status válidos por setor;
- permissões granulares e necessidade de novo login;
- ações principais, atalhos e layout;
- evidências de configuração e auditoria.

## 17. Rollback

Se o problema for apenas de frontend, reverta o deploy da Vercel para o artefato anterior.

Se for necessário voltar o backend:

1. registre logs e o erro observado;
2. volte o código ao SHA anterior aprovado;
3. instale dependências compatíveis;
4. reinicie somente `backend-solicitacoes`;
5. repita os smokes essenciais.

Não execute `down`, `DROP`, restauração ou remoção de colunas automaticamente. As
migrations desta leva são majoritariamente aditivas e podem permanecer durante rollback
de código, mas isso deve ser confirmado migration por migration. Dados já criados pelos
novos fluxos precisam ser preservados.

## 18. Evidências a guardar

- SHAs implantados de backend e frontend;
- saída do preflight antes e depois das migrations;
- relação de migrations aplicadas;
- backup e teste de restauração;
- configuração final de setores, status, tipos, campos, aprovação e automações;
- matriz de permissões por grupo/usuário;
- capturas dos smokes e dos principais modais em zoom;
- resultados dos scripts de validação;
- lista de usuários treinados e material apresentado;
- incidentes, decisão de rollback ou aceite final.

## 19. Fontes técnicas para auditoria detalhada

- `MIGRACAO-PARA-PRODUCAO.md`: histórico da consolidação V4;
- `ALTERACOES-POR-PAGINA.md`: inventário anterior por tela;
- `docs/arquitetura/fluxos_principais.md`: fluxos centrais atuais;
- `docs/regras_negocio/compras.md`: regras operacionais de Compras;
- `docs/modulos/compras/README.md`: fluxo de Solicitação de Compra;
- `docs/modulos/governanca/AUDITORIA_OPERACIONAL.md`: eventos e auditoria;
- `backend/src/constants/moduloPermissoes.js`: fonte de verdade das permissões;
- `frontend/src/navigation/navigationConfig.jsx`: fonte de verdade da navegação;
- `backend/migrations/`: fonte de verdade do schema;
- `backend/package.json` e `frontend/package.json`: scripts de validação disponíveis.

Para confrontar uma tela específica entre as branches:

```bash
git diff origin/main..origin/refactor/frontend -- frontend/src/pages/NOME_DA_PAGINA.jsx
git log --oneline origin/main..origin/refactor/frontend -- frontend/src/pages/NOME_DA_PAGINA.jsx
```

Para confrontar uma regra de backend:

```bash
git diff origin/main..origin/refactor/frontend -- backend/src
git log --oneline origin/main..origin/refactor/frontend -- backend/src
```

## 20. Fila de Pagamentos — leitura de comprovantes PDF

Foi adicionada uma primeira etapa assistida para importar comprovantes diretamente na
Fila de Pagamentos. O sistema lê PDFs com texto pesquisável, identifica os principais
dados do pagamento, sugere o título pendente e exige que o usuário confirme o vínculo.
Essa confirmação apenas anexa o comprovante e preenche data, valor e conta sugerida; ela
não registra a baixa automaticamente.

### Formatos validados nesta primeira versão

- Banco do Brasil: PIX;
- CAIXA: PIX, boleto, TEV e DARF;
- Sicredi: PIX.

Os modelos entregues em 14/09/2026 foram usados como contratos de leitura. Outros bancos,
mudanças de layout e PDFs somente como imagem devem cair em revisão manual. OCR e IA não
fazem parte desta versão.

### Segurança e limites

- aceita somente arquivos `.pdf` com MIME de PDF;
- até 500 arquivos selecionados em uma importação pela interface;
- processamento automático em lotes internos de até 10 arquivos por requisição;
- até 12 MB por arquivo e 50 MB por lote interno;
- um pagamento por arquivo;
- hash SHA-256 impede reutilização do mesmo comprovante;
- um título recebe no máximo um comprovante por item pendente da fila;
- arquivos ficam no S3 e os metadados extraídos são registrados na fila;
- o usuário sempre confirma o título antes do vínculo;
- a baixa continua usando as validações e permissões já existentes.

### Permissão e configuração

A nova ação granular é `financeiro.fila_pagamentos.importar_comprovantes`. Conceda-a ao
grupo que fará a preparação dos pagamentos. Administradores de negócio e a compatibilidade
legada do setor Financeiro continuam cobertos pela regra existente de acesso à fila.

### Alteração estrutural

A migration `202609140002_fila_pagamentos_comprovantes_pdf.js` acrescenta à tabela
`pagamentos_manuais_fila` os dados do arquivo, hash, banco, tipo, identificador, conteúdo
extraído e auditoria do usuário que vinculou. Ela também cria índice único para o hash e
chave estrangeira para `users.id`.

Na implantação:

1. instalar as dependências do backend;
2. executar o preflight de schema;
3. aplicar a migration com a autorização explícita prevista para o ambiente;
4. executar `npm run test:fila-comprovantes-pdf` e `npm run test:fila-pagamentos`;
5. reiniciar somente o processo correspondente ao ambiente;
6. conceder a permissão granular aos usuários responsáveis;
7. validar um PDF de cada banco/tipo na fila sem concluir a baixa;
8. confirmar no detalhe da fila o nome do arquivo e os dados pré-preenchidos.

Dependências relacionadas: `pdf-parse@2.4.5` e `multer@2.3.0`. O Multer foi atualizado
para a versão corrigida da linha 2.x antes de liberar a nova entrada de arquivos.

## 21. Comercial — vencimento do título e tela de Contratos de Venda

Quando um título a receber vinculado a uma parcela comercial tem o vencimento editado no
Financeiro, o título passa a ser a fonte operacional para os indicadores do contrato. A
data também é sincronizada na parcela comercial e o contrato alterna automaticamente entre
`ATIVO`, `INADIMPLENTE` e `QUITADO` conforme o conjunto de títulos. Estados comerciais
terminais ou preparatórios (`DISTRATADO`, `CANCELADO` e `RASCUNHO`) não são sobrescritos.

Na tela `Comercial > Contratos de Venda`:

- o formulário de novo contrato pode ser recolhido e preserva a preferência do usuário;
- empreendimento/comprador e unidades usam uma grade que se adapta sem comprimir os campos;
- unidades e situação financeira ficam organizadas lado a lado apenas quando há largura;
- dados de corretagem foram consolidados em uma faixa compacta;
- ações operacionais e documentos ocupam a largura total no celular;
- a tabela de parcelas exibe primeiro o vencimento vigente no título financeiro.

Não existe migration para esta correção. Execute no backend:

```bash
npm run test:comercial-titulo-vencimento
npm run test:comercial-importacao-sienge
npm run test:filtro-valor-titulos
```

Depois do deploy em desenvolvimento, edite um título comercial levando o vencimento de uma
data passada para futura e faça o caminho inverso. Confirme data da parcela, valor vencido,
status do contrato, sugestão financeira e evento no histórico.

### Recorte futuro para produção

O commit funcional de multiunidade `727093e8` toca predominantemente o Comercial, mas não é
um cherry-pick autônomo: o frontend atual depende dos componentes padrão criados na série de
refatoração, inexistentes em `main`. Os commits visuais posteriores também abrangem centenas
de telas e não devem ser promovidos como hotfix comercial.

O caminho seguro é criar uma branch a partir de `origin/main`, portar somente o modelo,
migration, serviços, rotas, permissões e telas do Comercial necessários, adaptar a tela ao
shell existente em produção e então gerar um único commit de release. A migration de
multiunidade e o backfill continuam sujeitos a autorização operacional separada.
