# Handoff - Catalogacao de itens manuais de Compras

## Estado

Implementacao concluida no codigo em 2026-08-20. A migration foi aplicada e validada exclusivamente no MySQL local `localhost:3306`, banco `fluxy_main_copia`. Nao houve commit, deploy, restart de processo, acesso ao GitHub, EC2 ou banco de producao.

O fluxo atende Solicitacao de Compra e Compra Direta porque ambos usam a mesma tela de detalhe e as mesmas tabelas de itens manuais.

## Comportamento entregue

- lista compacta e expansivel dos itens na tela de detalhes;
- tratamento do item manual somente para usuario com `compras.insumos.catalogar_itens_manuais` ou administrador;
- vinculo a insumo ativo existente ou criacao de insumo oficial;
- codigo automatico transacional `INS-000001`;
- preservacao integral da linha manual original e das referencias de cotacao/pedido;
- alias da descricao original para busca e reconhecimento em importacoes futuras;
- sugestao de cadastro existente em conflito exato de nome ou alias;
- salvamento sem justificativa digitada, mantendo log na solicitacao e auditoria operacional da rota;
- bloqueio de linha e idempotencia para envios concorrentes/repetidos;
- correcao auditavel de vinculo;
- inclusao dos itens catalogados no ultimo preco e nos relatorios por insumo/categoria;
- anexos continuam usando a normalizacao de URL da API.

## Correcao do caminho real da Compra Direta

Em 20/08, a verificacao com o usuario Breno mostrou que a permissao estava salva, mas a tela usada
por ele era `/solicitacoes/:id`. A primeira implementacao exibia a catalogacao apenas em
`/solicitacoes-compra/:id`, por isso nada aparecia na Compra Direta aberta pela lista geral.

A tela `frontend/src/pages/SolicitacaoDetalhe/index.jsx` agora:

- mostra `Itens da compra direta` quando o usuario tem permissao de catalogacao ou de apropriacao;
- permite selecionar item manual pendente ou ja catalogado;
- abre `Catalogar item` com o mesmo `TratamentoItemManual` e o mesmo endpoint protegido;
- mantem `Editar apropriacoes` separado e condicionado a sua permissao propria;
- recarrega a Compra Direta vinculada depois da catalogacao, sem alterar a solicitacao principal;
- informa que itens oficiais nao precisam ser catalogados.

Na SOL-5102, o vinculo local confirmado foi Solicitacao 5137 -> Compra Direta 298, com 11 itens
manuais pendentes. A configuracao efetiva tambem confirmou a chave
`compras.insumos.catalogar_itens_manuais` para o usuario 35.

## Arquivos principais

### Banco e backend

- `backend/migrations/202608200002_catalogacao_itens_manuais.js`
- `backend/src/models/InsumoAlias.js`
- `backend/src/models/InsumoCodigoSequencia.js`
- `backend/src/models/SolicitacaoCompraItemManual.js`
- `backend/src/models/index.js`
- `backend/src/services/insumoManualCatalogacaoService.js`
- `backend/src/controllers/InsumoManualCatalogacaoController.js`
- `backend/src/controllers/InsumoController.js`
- `backend/src/controllers/SolicitacaoCompraController.js`
- `backend/src/services/compraItensPlanilhaService.js`
- `backend/src/services/relatorioComprasService.js`
- `backend/src/services/authorizationService.js`
- `backend/src/validators/operationalValidators.js`
- `backend/src/constants/moduloPermissoes.js`
- `backend/src/routes.js`

### Frontend

- `frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx`
- `frontend/src/modules/solicitacao-compra/components/ItemCompraExpansivel.jsx`
- `frontend/src/modules/solicitacao-compra/components/TratamentoItemManual.jsx`
- `frontend/src/modules/solicitacao-compra/compras-responsive.css`
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/services/compras.js`
- `frontend/src/utils/acessoProduto.js`

### Teste e documentacao

- `backend/scripts/validarCatalogacaoItensManuais.js`
- `backend/scripts/testarCatalogacaoItensManuaisBancoLocal.js`
- `backend/package.json`
- `docs/modulos/compras/README.md`

## Validacoes executadas

- `node --check` nos controllers, services, rotas e teste novos: passou;
- `npm run test:compra-catalogacao-insumos`: passou;
- `npm run test:compra-importacao-itens`: passou;
- `npm run test:compra-catalogacao-insumos:local`: passou no banco `fluxy_main_copia`;
- o teste local validou vinculo existente, duas chamadas simultaneas idempotentes, correcao auditavel, bloqueio de duplicidade, criacao com codigo automatico e reutilizacao por alias;
- depois da leitura de `PROTOCOLO-AGENTES-PARALELOS.md` e `QA-ESTADO-COMPARTILHADO.md`, a criacao de novo insumo passou a rodar em transacao externa e rollback integral;
- os registros temporarios de solicitacao, item, alias e log sao removidos por IDs exatos no `finally`, com conferencia posterior obrigatoria;
- a sequencia `INSUMO_CODIGO_PADRAO` e capturada antes e comparada depois; o sucesso so e impresso apos a limpeza e a restauracao exata serem confirmadas;
- qualquer falha de rollback, limpeza ou restauracao da sequencia reprova a suite;
- `npm run migrate` foi repetido depois da aplicacao e concluiu sem pendencias, comprovando idempotencia;
- `npm run test:ultimo-preco`: 4 cenarios passaram no banco local;
- `relatorioPrecosInsumosFornecedores` e `relatorioCategoriasInsumosCompras` foram executados no banco local sobre 180 itens e 74 pedidos, sem erro de include ou agregacao;
- `npm run test:responsive`: passou, 198 rotas verificadas;
- `npm run build` no frontend: passou, 360 modulos transformados;
- depois da correcao do caminho real, `npm run test:responsive` e `npm run build` passaram novamente;
- `validarCatalogacaoItensManuais.js` agora exige a presenca do formulario tambem em `/solicitacoes/:id`;
- `git diff --check`: sem erro nos arquivos deste fluxo; apontou whitespace preexistente em `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx:235`;
- `npm run test:docs`: falhou por referencias ao ERP legado e metricas de permissoes preexistentes fora deste ownership.

A inspecao visual no browser integrado nao foi concluida porque o runtime local recusou a dependencia do servico por caminho confiavel. O build e a verificacao responsiva passaram.

## Riscos e cuidados

- a primeira tentativa local revelou `ER_TOO_LONG_IDENT` na FK gerada automaticamente pelo Sequelize; a migration foi corrigida para colunas e constraints em etapas separadas, nomes curtos e recuperacao idempotente de estado parcial;
- em cada novo ambiente, aplicar a migration antes de iniciar o backend com este codigo, pois models e includes passam a consultar as novas tabelas/colunas;
- a concorrencia foi validada com duas chamadas simultaneas no banco local; manter o teste local como regressao antes da producao;
- a opcao de transacao externa em `catalogarItemManual` existe para testes rollback-safe; chamadas normais continuam criando, confirmando e revertendo sua propria transacao;
- a suite de Compras nao le nem altera `obra_tipo_apropriacao_padrao`; a duvida sobre a unica linha atual permanece fora deste modulo;
- conceder explicitamente a nova permissao aos usuarios operacionais autorizados; o fallback legado permanece fechado;
- o worktree tambem contem alteracoes nao relacionadas do fluxo de Contratos. Nao selecionar, reverter ou formatar esses trechos ao preparar o commit;
- `backend/src/routes.js`, `backend/src/models/index.js` e `backend/src/constants/moduloPermissoes.js` sao arquivos compartilhados e devem preservar as duas entregas.

## Proximo passo exato

1. revisar e separar os arquivos deste handoff das mudancas de Contratos;
2. revisar visualmente no sistema local a expansao dos itens em Solicitacao de Compra e Compra Direta;
3. conceder `compras.insumos.catalogar_itens_manuais` aos usuarios autorizados na configuracao que sera promovida;
4. no deploy, aplicar a migration antes de reiniciar o backend;
5. reiniciar somente o processo correspondente ao ambiente publicado;
6. publicar o frontend depois que o backend migrado estiver respondendo;
7. executar um smoke test no ambiente publicado antes da liberacao aos usuarios.

## Ajuste visual da lista expansivel de itens

Em 20/08, a lista de itens de `/solicitacoes-compra/:id` deixou de renderizar um card por item e
passou a usar uma tabela operacional compacta.

- cada item ocupa uma unica linha com origem, nome/especificacao, quantidade/unidade, apropriacao,
  data necessaria e situacao do cadastro;
- o botao de expansao fica em coluna propria, com rotulo acessivel e estado anunciado;
- ao expandir, uma segunda linha ocupa todas as colunas e concentra especificacao, anexos, links,
  edicoes permitidas e o formulario de catalogacao;
- o formulario continua condicionado a `compras.insumos.catalogar_itens_manuais`;
- em telas estreitas, a tabela preserva as colunas por rolagem horizontal, sem voltar ao formato de
  cards;
- os estilos antigos do componente em cards foram removidos para nao interferirem na tabela.

Validacoes repetidas apos o ajuste:

- `npm run test:compra-catalogacao-insumos`: passou;
- `npm run test:responsive`: passou, 198 rotas verificadas;
- `npm run build`: passou, 360 modulos transformados;
- `git diff --check` nos arquivos do ajuste: passou;
- nenhuma suite com escrita no banco foi executada e o backend nao foi reiniciado;
- a verificacao visual automatizada continuou bloqueada pela restricao local do controlador do
  navegador; revisar a pagina aberta no Vite apos atualizar.

## Autocomplete para vincular insumo existente

Em 20/08, o campo `Pesquisar cadastro oficial` do tratamento de item manual deixou de depender do
botao Buscar e da lista separada de radios.

- a consulta por nome, codigo ou alias ocorre automaticamente 250 ms apos a digitacao;
- requisicoes anteriores sao canceladas quando o texto muda;
- as sugestoes podem ser percorridas com setas e selecionadas com Enter, mouse ou toque;
- Escape fecha as sugestoes e o botao de limpar remove texto e selecao;
- ao selecionar, o campo recebe `codigo — nome` e o ID correspondente fica pronto para salvar;
- editar o texto depois da selecao limpa o ID, evitando salvar um insumo diferente do exibido;
- unidade e categoria confirmam a selecao sem repetir o nome;
- um vinculo ja existente abre preenchido com o cadastro oficial atual;
- o endpoint, payload, permissao granular e regras de auditoria permaneceram inalterados.

Validacoes repetidas apos o autocomplete:

- `npm run test:compra-catalogacao-insumos`: passou, incluindo verificacoes de combobox, listbox,
  preenchimento da selecao e cancelamento de requisicao;
- `npm run test:responsive`: passou, 198 rotas verificadas;
- `npm run build`: passou, 360 modulos transformados;
- `git diff --check` nos arquivos do ajuste: passou;
- nenhuma suite com escrita no banco foi executada e o backend nao foi reiniciado.

## Salvamento direto e exibicao do cadastro oficial

Em 21/08, o formulario compartilhado por Solicitacao de Compra e Compra Direta passou a concluir a
catalogacao sem exigir justificativa digitada.

- o campo `Motivo da catalogacao` foi removido do modal;
- o backend aceita o motivo apenas como dado opcional para compatibilidade com clientes anteriores;
- o botao fica disponivel depois de selecionar um cadastro existente ou preencher nome e unidade do
  novo insumo, com os rotulos `Salvar vinculo do insumo` e `Salvar novo insumo`;
- o endpoint continua transacional e registra criacao, vinculo ou correcao no log da solicitacao;
- depois da recarga, a relacao da Solicitacao de Compra prioriza nome, descricao e unidade do insumo
  oficial;
- na Compra Direta, a descricao oficial passa a ocupar o titulo exibido na relacao de itens; quando
  estiver vazia, o nome oficial e usado como fallback;
- o nome e a especificacao manuais continuam preservados na linha de origem e no alias.

Validacoes executadas neste ajuste:

- `node --check` no service e no validador alterados: passou;
- o validador aceitou payloads de `VINCULAR_EXISTENTE` e `CRIAR_INSUMO` sem `motivo`;
- `npm run test:compra-catalogacao-insumos`: passou com as verificacoes da ausencia do campo e da exibicao oficial;
- `npm run build`: passou, 362 modulos transformados;
- `git diff --check` nos arquivos do ajuste: passou, restando apenas avisos de normalizacao CRLF;
- nenhuma suite que escreve no banco foi executada e o backend nao foi reiniciado.

## Reset de contexto entre itens manuais

Em 20/08, a tela de catalogacao da Compra Direta mostrou que, ao selecionar outro item manual, o
formulario ainda mantinha nome, modo e busca do item anterior. O componente compartilhado passou a
reinicializar seu contexto pela identidade do item selecionado.

- outro item manual sempre abre em `Vincular existente`;
- para item manual, `Pesquisar cadastro oficial` abre vazio, inclusive depois de criar o insumo;
- ao clicar em `Criar novo`, `Nome oficial` e `Descricao do cadastro` recebem os dados do item manual
  atualmente selecionado, e o nome permanece editavel;
- voltar para `Vincular existente` sempre limpa busca e ID; uma correcao exige pesquisar e
  selecionar explicitamente o novo destino;
- itens ja catalogados continuam identificados pelo status e pelo vinculo exibido no detalhe, sem
  preencher automaticamente a pesquisa;
- nome, descricao, motivo, mensagens, sugestoes e selecao nao vazam de um item para outro;
- uma gravacao em andamento continua bloqueada mesmo que o usuario troque o item, evitando liberar
  um segundo envio antes da conclusao do primeiro;
- depois da criacao, a atualizacao do mesmo item reconhece o novo vinculo e retorna ao modo
  `Vincular existente` com a pesquisa vazia.

Validacoes repetidas apos a correcao:

- `npm run test:compra-catalogacao-insumos`: passou;
- `npm run test:responsive`: passou, 198 rotas verificadas;
- `npm run build`: passou, 360 modulos transformados;
- `git diff --check` nos arquivos do ajuste: passou;
- nenhuma suite com escrita no banco foi executada e o backend nao foi reiniciado.
