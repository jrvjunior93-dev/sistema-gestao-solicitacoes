# Plano de navegacao e preservacao do trabalho nas abas

As abas do Fluxy devem funcionar como espacos de trabalho: alternar para uma
consulta nao pode apagar preenchimento, filtros, selecoes ou a posicao de
leitura. Voltar deve respeitar a origem e a sequencia daquela aba, sem saltar
diretamente ao inicio do modulo. A estabilizacao exige uma base transversal
e adesao testada por fluxo, sem alterar permissoes ou operacoes de negocio.

Este plano cobre a branch refactor/frontend no commit
ade1d5acf4eb9cfe47a5e625d13bac2d3ca7fbbc. A implementacao ainda nao esta
autorizada nesta etapa documental. Main, banco e EC2 permanecem fora do escopo.

Atualizacao posterior: o proprietario autorizou base e piloto Solicitacoes.
A execucao local, cobertura efetiva e limites estao no
[contrato do piloto](2026-10-11-piloto-navegacao-solicitacoes.md).
O inventario/hashes abaixo permanecem evidencia do baseline, nao da arvore
apos a implementacao; E3-E8 nao foram implicitamente autorizadas.

## Cobertura do inventario

O [inventario por rota](2026-10-11-inventario-navegacao.md) relaciona 221
declaracoes do App: 216 entradas privadas, quatro publicas e um shell.
Inclui aliases, redirecionamentos e o indice; nao significa 221 paginas
distintas. O catalogo de navegacao existente tem 217 destinos, inclusive
variantes com query. Ambas as contagens foram conferidas por validadores.

O scanner analisou 502 fontes de codigo frontend e 918 backend, sem erros
de parse. O JSON em outputs/mapa-navegacao-estado-20261011/inventario.json
registra hashes, estados nomeados, campos, handlers, efeitos, storage,
links, navegacoes imperativas, chamadas HTTP candidatas, componentes,
dependencias, guardas e registros de routers. Conserva inclusive as fontes
fora do fechamento das rotas. Pode ser regenerado e conferido com:

```bash
node frontend/scripts/mapearNavegacaoEstado.mjs
node frontend/scripts/mapearNavegacaoEstado.mjs --check
```

Esta e cobertura integral do inventario estatico dessas fontes, nao prova
de 100% dos comportamentos. URLs dinamicas, variantes por permissao,
modais e encadeamentos de servicos precisam do contrato executavel na E0
de cada fluxo. Contagens de chamadas incluem dependencias compartilhadas,
nao endpoints efetivamente usados numa visita. Ha uma importacao local
nao resolvida em backend/src/modules/sst/logs/sstOperationalLogService.js,
linha 14; classificar alcance/legado na etapa SST, sem consertar fora de escopo.

## Causas verificadas no codigo

| Achado | Evidencia | Efeito |
| --- | --- | --- |
| A aba persiste apenas id, route, title e preferredTitle | frontend/src/navigation/useWorkspaceTabs.js, sanitizeStoredTab e persistencia em sessionStorage | Restaurar a faixa de abas nao restaura formulario, modal ou selecao |
| Alternar chama navigate e existe somente um Outlet ativo | useWorkspaceTabs.activateTab e frontend/src/layout/Layout.jsx | Componentes de rotas diferentes desmontam; estados locais podem ser perdidos sem recarregar o documento inteiro |
| Navegacao comum substitui o destino da aba ativa | useWorkspaceTabs, efeito de currentRoute | Nao ha uma pilha de paginas propria da aba |
| Alternancia e abertura entram no historico global | activateTab e openTab usam navigate sem classificacao de intencao | Historico mistura trocas de abas, telas e modais |
| Mudar pathname zera a rolagem | Layout.jsx, efeito window.scrollTo | O usuario perde a referencia da linha/registro ao retornar |
| Voltar pode ser um destino fixo | SolicitacaoDetalhe/index.jsx envia voltar.to=/solicitacoes; PageHeader padrao executa o destino | Detalhe aberto de Delegacao pode retornar a lista geral e nao a Delegacao |
| Helper de voltar existe, mas nao cobre a intencao de todas as telas | frontend/src/utils/navigation.js, useSafeNavigateBack/hasSafeBrowserHistory | Ter idx do router maior que zero nao resolve historico por aba ou estado da origem |
| Abrir na Delegacao usa navigate comum | modules/solicitacao-compra/pages/ComprasDelegacao.jsx, abrirSolicitacao | Troca o conteudo da aba da Delegacao, inclusive suas edicoes locais |
| Codigo do registro nao atualiza titulo da aba | resolveWorkspaceTitle usa menu ou segmento da URL; hook nao expoe updateTitle | SOL conhecida no detalhe nao e publicada na faixa de abas |
| Ha protecoes parciais que nao devem ser descartadas | comprasDraftStorage, planningDraftStorage, PreferenciasContext, filtros de Solicitacoes e useConferenciaRh | A solucao deve integrar formatos, escopos, revisoes, autosave e negativos existentes |

Nao se pode concluir que todo usuario perde todo campo em toda tela:
algumas telas ja recuperam rascunhos ou dados do servidor. O defeito
transversal e a ausencia de um contrato unico para preservar o trabalho.
Queries/parametros tambem podem reutilizar um componente sem desmonta-lo;
isso requer isolamento por registro para nao exibir estado do registro anterior.

## Comportamento proposto

- Alternar aba preserva trabalho e contexto; nao executa salvar, aprovar,
  gerar titulo, baixar ou reenviar. Operacoes continuam explicitas.
- Navegar dentro da aba cria uma etapa; Voltar percorre essas etapas em
  ordem inversa, mantendo filtros, pagina, itens expandidos e rolagem.
- A trilha Inicio, Modulo e Tela continua sendo acesso hierarquico.
  Clicar nela nao deve ser confundido com a acao Voltar.
- Delegacao, filas, listas de trabalho e pesquisas abrem detalhes em nova
  aba interna preservando a origem. A nova aba e ativada; a origem continua
  aberta. Uma variante em segundo plano pode ser oferecida sem mudar esse padrao.
- Links de etapas de um mesmo formulario continuam na propria aba;
  configuracao de nova aba e declarada por intencao, nao por troca global
  indiscriminada de todos os links. Downloads, externos, S3 e portal publico
  permanecem fora das abas autenticadas.
- Uma solicitacao carregada mostra seu codigo real, por exemplo SOL-6278.
  Nao deduzir o codigo pelo id do banco. Antes da carga: Solicitacao; em
  erro/sem acesso: titulo neutro, sem vazar dados armazenados de outro usuario.
- Abrir um registro ja aberto ativa a aba existente sem apagar seu
  rascunho. Queries de filtro/modal nao geram uma aba por alteracao; contextos
  distintos como Contas a Pagar e Contas a Receber permanecem distintos.
- Fechar aba com alteracoes nao protegidas oferece permanecer ou descartar
  explicitamente; rascunho protegido pode sobreviver ao fechamento conforme
  a politica daquele fluxo. Nunca expulsar aba com trabalho ao atingir o
  limite atual de 12: informar o limite e pedir fechamento voluntario.
- Atualizacao de dados em consulta nao sobrescreve campos editados.
  Conflito com outra sessao exige conferencia, nao prevalencia silenciosa
  do snapshot antigo nem sobrescrita automatica do usuario atual.
- Navegador e celular fecham primeiro o modal superior, depois voltam uma
  etapa da aba. Deep link sem origem usa fallback seguro e autorizado.

## Arquitetura recomendada

### Separar estado de trabalho de dados do servidor

| Camada | Conteudo | Politica |
| --- | --- | --- |
| Workspace em memoria | Aba, identidade da pagina/registro, historico por aba, cursor, origem, selecao, modal, foco e rolagem | Isolamento por usuario efetivo, sessao, tabId e entryId |
| Rascunho recuperavel | Campos editaveis ainda nao enviados, com schema/versionamento e revisao base | Adapters por fluxo; aproveitar formatos existentes e definir TTL por sensibilidade |
| Preferencias | Colunas, larguras, exibicao e preferencias de filtro expressamente persistentes | Reusar PreferenciasContext e espelho atual; nao guardar rascunho no endpoint de preferencias |
| Dados de negocio | Registro atualizado, permissoes, saldo, status, comprovantes, itens e versoes | Servidor continua autoridade; revalidar antes de operacoes criticas |
| Arquivos | File/Blob ainda local e metadados de anexos ja enviados | File apenas em memoria; F5 pode exigir reanexar. Nunca prometer recuperar binario com JSON nem persistir URL assinada como anexo definitivo |

Recomenda-se um controlador compartilhado de navegacao/estado e adapters
por pagina. Reter componentes vivos pode ser avaliado em piloto, mas nao
montar todas as 12 telas indiscriminadamente: hooks de rota, listeners,
polling, autosave, auditoria e leitura de interacoes podem continuar
executando em abas invisiveis. Adotar snapshots restauraveis como base,
com retencao em memoria apenas onde o ciclo de vida foi auditado.

Componentes eventualmente retidos precisam de contexto de location/params
proprio, ativo/inativo, suspensao de efeitos e isolamento de portals. Nao
renderizar varios Outlets ligados ao mesmo location global: uma aba antiga
poderia buscar/salvar o id da aba nova. Modal inativo nao pode aparecer sobre
a ativa, capturar Escape ou marcar comentario como lido.

A fachada deve distinguir abrir registro, navegar etapa, ativar aba,
voltar/avancar, fechar modal, substituir apos sucesso e renomear aba. A
ponte com o historico do navegador deve usar identificadores de aba/entrada
e tratar POP/PUSH/REPLACE; nao combinar uma pilha privada com navigate(-1)
cego. Alternar abas nao deve inserir etapas artificiais nem destruir o
Avancar do navegador. Essa ponte precisa de prova no piloto antes da adesao.

Nao salvar genericamente toda a arvore useState em localStorage. Dados de
RH, CPF, Pix e banco precisam de escopo, minimizacao, TTL e limpeza em
logout/troca de usuario efetivo. Credenciais, passkeys, desafios, tokens,
assinaturas e payloads de baixa nao sao rascunhos recuperaveis. Quota,
storage bloqueado e navegador privado nao podem impedir a operacao.

### Politica de atualizacao

- Ao reativar: mostrar imediatamente o contexto preservado e conferir
  dados do servidor em segundo plano quando necessario, sem piscar/zerar.
- Campos nao editados podem acompanhar a nova versao. Campos alterados
  mantem o rascunho e a revisao base para detectar conflito.
- Selecao de operacao em lote deve ser revalidada contra elegibilidade
  atual. Nao manter selecionado invisivelmente um titulo quitado/cancelado.
- Realtime invalida dados por entidade, nao redefine todo o formulario.
- Ler anexos, comentario ou item depende de visibilidade real na aba ativa;
  nao consumir destaques/notificacoes em abas de consulta escondidas.
- Flush local ao trocar/fechar aba protege o ultimo caractere. O debounce
  de Compras atual e de 800 ms e seu cleanup cancela o timer: trocar rapido
  pode perder a ultima janela. Separar flush de rascunho de gravacao de negocio.
- Apos sucesso, limpar somente o rascunho correspondente ao registro e
  ciclo, preservando outras abas. Apos erro/403/409 manter o preenchimento
  recuperavel, mas bloquear operacao proibida; 401 encerra escopo protegido.

## Usabilidade sem tornar o sistema pesado

Preservar o trabalho nao significa manter todas as paginas, tabelas e PDFs
montados. A base deve guardar apenas o contexto necessario para reconstruir
a tela. Retencao de componente vivo e excecao auditada no piloto, nao o padrao.

- Manter lazy imports e carregar somente a pagina utilizada. Nao buscar
  dados de todas as abas ao iniciar, restaurar a sessao ou receber realtime.
- Limitar snapshots por tamanho e quantidade. Descartar cache de consulta
  reconstruivel antes de rascunhos; nunca expulsar trabalho nao protegido.
  Listas completas, respostas HTTP e binarios nao devem ser duplicados no draft.
- Suspender polling, listeners de pagina e leitura de interacoes nas abas
  inativas. Reusar a conexao global de eventos; a restauracao nao cria outra
  conexao nem reaplica autosave ou operacoes de negocio.
- Atualizar campos em memoria imediatamente; persistencia compacta e
  agrupada evita serializar tabelas a cada tecla. Ao sair, flush local do
  ultimo caractere sem transformar a troca de aba em gravacao no servidor.
- Revalidar somente consultas afetadas ou vencidas, sem busca global a
  cada alternancia. Saldos, permissao e elegibilidade continuam sendo
  conferidos antes da operacao, mesmo quando a tela usa cache.
- Fechar preview libera recursos de PDF/imagem e URLs locais quando nao
  forem mais utilizados; nunca manter documentos pesados invisiveis por aba.

### Medicao e criterios de aprovacao

E0 deve registrar baseline no mesmo aparelho, dados e perfil de rede:
tempo de interacao/troca de aba (mediana e p95), memoria apos ciclos,
numero de GET/escritas/conexoes/timers, tamanho do bundle inicial e custo
de restaurar/persistir rascunhos. Nao ha medida de desempenho de producao
nesta entrega; o teste isolado abaixo comprova comportamento, nao velocidade.

Definir os limites numericos com o baseline antes de implementar. Proposta
inicial: nao aceitar regressao superior a 10% no p95 da interacao ou carga
inicial, alem da variacao repetivel do ensaio; exigir ausencia de novas
escritas causadas por alternancia e de multiplicacao de conexoes/polling.
Caso o baseline ja seja lento, definir tambem uma meta absoluta de resposta
com o proprietario, sem considerar a simples ausencia de regressao suficiente.

Repetir os ensaios com uma, seis e 12 abas e 30 ciclos de abrir/fechar,
incluindo modal PDF, formulario grande, lista filtrada e aparelho mobile.
O uso de memoria deve permanecer limitado e voltar proximo do baseline
apos liberar as abas e a coleta de recursos. Persistencia nao pode travar
a digitacao nem aumentar o payload de preferencias a cada campo editado.
Sem passar esses criterios, interromper a expansao e revisar o piloto.

## Etapas de execucao

Cada etapa exige autorizacao de implementacao, ownership exclusivo,
commit isolavel quando solicitado, teste de fluxo e criterio de aceite.
Nao promover automaticamente a main e nao incluir Pessoal/DP em promocao
que o exclua. Nenhuma migration ou alteracao de endpoint e prevista como
necessaria a base; uma necessidade nova exige decisao separada.

| Etapa | Escopo | Entrega | Condicao para avancar |
| --- | --- | --- | --- |
| E0 | Contrato e provas da base e de cada fluxo | Resolver entradas/aliases/queries, estados, actions, permissoes e APIs efetivamente acionadas; testes que reproduzem perda e salto de origem | Nenhum caminho dinamico relevante sem responsavel/contrato; baseline documentado |
| E1 | Navegacao transversal | Controle de aba/entrada, historico/origem, renomeacao por codigo, ciclo ativo/inativo, estado por usuario e protecao de fechamento, com ativacao gradual | Testes de router/abas/POP/REPLACE/limite/identidade e negativos aprovados; paginas nao aderidas inalteradas |
| E2 | Piloto Solicitacoes | Lista, arquivadas, Nova Solicitacao, detalhe, comentario/item, formularios/modal e rascunho seguro | A alternar A para B e voltar mantem ultimo caractere, filtros, selecao e scroll; APIs de negocio nao repetidas |
| E3 | Compras | Delegacao em nova aba, solicitacao/compra direta e revisao, cotacao, pedido, entregas e cadastros vinculados | Preserva edicoes da delegacao e rascunhos; ida/volta de wizard, compras/fornecedor e duplo envio testados |
| E4 | Financeiro | Titulos, edicao, fila, autorizacoes/PWA, baixas, conciliacao, bancos, cartoes, provisoes e relatorios | Nenhuma baixa/envio reaplicado; saldos/permissoes/conflitos/juros e dados de pagamento revalidados; passkey/desafios fora do draft |
| E5 | Colaboradores e RH DP | Locais, admissao/cadastro, pagamento/conferencia/reembolso/parcial, transferencias, eventos, documentos/importacoes/relatorios | Autosave/revisao/fila atual preservados; Obra e DP nao compartilham draft; sem vazamento de dados pessoais |
| E6 | Custos, Obras, Contratos, Comercial e CRM | Planejamento e drafts existentes, rateio/apropriacoes, medicao, adiantamento/prestacao, contratos/unidades, funil e documentos | Mantem competencia/revisao/origem; ajuste de uma entidade nao contamina outra; custos nao reconhecidos antes da conferencia |
| E7 | Demais modulos e portas especiais | Configuracoes/cadastros, dashboards/hubs, comunicacao/biblioteca/treinamento, Fiscal/SST/governanca/suporte e aliases/publicas | Todas as linhas do inventario com teste ou exclusao justificada; redirecionamentos e permissao preservados |
| E8 | Homologacao e promocao controlada | Ensaio integrado em dev, usuarios reais de teste autorizados, aparelhos, memoria/rede e rollback | Aceite do proprietario por fluxo; backup/protecao e pedido separado para producao |

O inventario atribui E2 a E7 a todas as entradas; E0 e E1 sao transversais.
Routes publicas e shell aparecem em E7 para testar exclusao e redirecionamento,
nao para persistir formularios autenticados nelas. Em cada modulo, a ordem
e listas/consultas, detalhes, formularios, uploads e finalmente operacoes criticas.

## Contrato obrigatorio por pagina e modal

Para cada entrada do inventario, registrar em checklist versionado:

1. Rota/alias/query, pagina e dono da origem; quais cliques navegam na mesma
   aba, abrem registro em nova aba, abrem modal ou executam uma operacao.
2. Permissoes de visualizacao/escrita, setor, obra/centro e usuario efetivo;
   todos os endpoints de leitura/escrita do caminho e seus guards.
3. Campos editaveis e revisao base, filtros, pagina/tamanho, ordenacao,
   selecoes, expansoes, aba local e scroll vertical/horizontal.
4. O que fica em memoria, o que pode persistir, TTL e versao; File/Blob,
   anexos ja enviados, chaves de draft atuais e politica de descarte.
5. Effects/timers/realtime/autosave/listeners/portals ao montar, ocultar,
   reativar, trocar entidade, fechar aba, sair e mudar usuario.
6. Carregar/restaurar/atualizar sem sobrescrever alteracoes; tratar respostas
   atrasadas, conflitos, registros removidos e permissao revogada.
7. Idempotencia e bloqueio de clique/envio; o estado de ocupado termina
   corretamente em sucesso/erro sem induzir uma segunda operacao.
8. Testes positivos/negativos com evidencias e resultado; nenhuma pagina
   marcada como aprovada somente por ter aderido ao componente compartilhado.

## Matriz de testes por etapa

| Caso | Resultado esperado |
| --- | --- |
| Digitar e alternar em menos de 800 ms | Ultimo caractere preservado, sem depender do debounce |
| Lista com filtro/pagina/scroll e abrir detalhe | Retorno a mesma lista, recorte, linha e rolagem, inclusive horizontal |
| Modulo, lista, detalhe, consulta auxiliar e Voltar repetido | Uma etapa por vez, origem correta, sem ir direto a Home nem criar loop |
| Alternar abas existentes e usar navegador Voltar/Avancar | Pilhas coerentes; ativacao nao vira uma etapa de negocio |
| Abrir da Delegacao e usar codigo da solicitacao | Delegacao permanece aberta/inalterada e aba nova mostra codigo real |
| Duas entidades ou contextos diferentes | Nenhum campo/parametro/chave de draft compartilhado indevidamente |
| Mesmo registro ja aberto e limite de 12 abas | Reutiliza aba sem reset; nao substitui silenciosamente trabalho no limite |
| Fechar aba limpa, alterada ou salvando | Politica clara e segura; cancelar fechamento nao perde trabalho |
| Modal de arquivo, submodal, Escape, fora e celular Voltar | Fecha apenas o topo; mantem contexto, foco e scroll; sem modal de aba inativa |
| F5, queda de rede, storage negado/quota e reinicio mobile | Recuperacao conforme contrato; arquivos locais nao prometidos; falha nao apaga formulario |
| Resposta atrasada apos mudar aba, registro ou usuario | Ignorada no escopo novo; nao restaura permissao ou estado antigo |
| Outra sessao altera saldo/status/revisao durante a edicao | Conflito/revalidacao visivel antes de operar; nenhuma sobregravacao silenciosa |
| 401, 403, perfil Obra, DP, GEO, Financeiro, proprietario e superadmin | Negativas iguais as atuais; dados protegidos ausentes de outro escopo |
| Leitura de interacoes em aba escondida | Nenhum destaque consumido ate efetiva visualizacao |
| Duplo clique e alternar durante envio/baixa/upload/aprovacao | Uma operacao; nenhuma repeticao ao restaurar ou reconectar |
| 12 abas com telas pesadas e 30 ciclos de abertura/fechamento | Memoria estabiliza apos fechar; listeners/portals retornam ao baseline; timers/polling inativos nao se multiplicam |

Automacao em desktop 1366/1440 e mobile 390/360; complementar em Android e
iPhone reais para voltar nativo, multitarefa, memoria e retomada do WebView.
Testes de escrita usam fixtures isoladas; banco dev so mediante autorizacao
com dados identificados e restauracao. Nunca usar baixa/proprietario real
em producao para testar navegacao.

Antes de qualquer commit de implementacao: testes novos do fluxo,
regressoes aplicaveis, build, test:docs, diff --check e negativa de permissao.
Para esta entrega documental, os validadores de navegacao/abas conferem a
base existente; o teste antigo de abas e estrutural. O script
frontend/scripts/diagnosticarAbasEstado.mjs executou o hook real de abas com
Outlet e um formulario simulado em 1366 px e 390 px: confirmou duas abas
mantidas, mas campo local vazio ao retornar e storage apenas de metadados.
Nao executa a pagina real de Solicitacoes nem endpoints de negocio; nao
representa homologacao de todos os fluxos ou teste em aparelho real.
E0 acrescentara provas por pagina e os ensaios de desempenho definidos acima.

## Rollout e reversao

Ativacao gradual por rota/fluxo em dev, com mecanismo reversivel e sem
trocar URLs ou catalogo publico. Primeiro piloto, depois modulo a modulo.
As rotas ainda nao aderidas continuam no comportamento atual; nao afirmar
protecao global antes de concluir a matriz inteira.

Nao excluir chaves antigas de preferencias/rascunhos na primeira versao.
Usar migracao de formato local reversivel, metadata de versao e validacao
da identidade. Reversao do codigo nao deve apagar drafts nem gerar replay
de uma operacao. Entregar notas sobre recuperacao, validade e anexos locais
quando um rascunho nao puder ser restaurado automaticamente.

O primeiro pacote executavel proposto e E0/E1/E2: base e piloto de
Solicitacoes, sem reforma visual nem mudanca dos fluxos financeiros. Os
modulos seguintes so avancam depois do aceite dos criterios do piloto.
