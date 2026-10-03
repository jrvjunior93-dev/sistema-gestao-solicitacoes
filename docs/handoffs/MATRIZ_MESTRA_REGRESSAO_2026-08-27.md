# Handoff — Matriz mestra e execucao visivel — 27/08/2026

## Objetivo

Montar e executar, no navegador interno visivel, a matriz completa do fluxo novo de contratos,
Despesa Eventual, Recarga de Cartao, ADM Local de Obra, Locacao de Maq. e Eq. e regressao das
alteracoes entre `C:\Fluxy` e a V4.

## Estado

- Matriz: `MATRIZ-MESTRA-REGRESSAO-FLUXY-V4.md`.
- 227 casos: 184 APROVADO, 43 PENDENTE, 0 BLOQUEADO e 0 FALHOU.
- Browser interno entregue ao usuario, usando uma aba separada e os perfis MATRIZ.
- Backend 8100 reiniciado de forma coordenada e saudavel com o fonte atual.
- Nao ha fixture R2 de medicao ativa. As massas `4465/8119` e `4466/8120` foram removidas
  nominalmente, com ausencia conferida e sequencias recalculadas para contrato 24/titulo 7336.

## Arquivos desta sessao

- `MATRIZ-MESTRA-REGRESSAO-FLUXY-V4.md` — matriz e diario de execucao.
- `backend/scripts/dados/configurarDespesaEventual.js` — correcao idempotente da lista fechada GEO.
- `backend/scripts/dados/LEIA-ANTES-DE-RODAR.md` — documentacao do script.
- `backend/src/services/formasPagamentoMedicaoService.js` — FOPAG nao se passa por Transferencia
  Bancaria na Despesa Eventual.
- `backend/scripts/validarDespesaEventual.js` — prova nominal de FOPAG.
- `frontend/src/utils/formaPagamento.js` — mesmo filtro no frontend.
- `frontend/src/utils/pendingAttachments.js` — lista e validacao previa dos formatos de anexo
  alinhadas ao middleware do backend.
- `frontend/src/services/uploads.js` e `frontend/src/pages/NovaSolicitacao.jsx` — token restrito
  para concluir os anexos da propria criacao e validacao previa de formatos.
- `frontend/src/pages/SolicitacaoDetalhe/AcoesContrato.jsx` — confirmacao nominal da aprovacao
  juridica final antes da chamada que cria titulos e move a solicitacao; na coleta da assinatura,
  passou a oferecer o anexo proprio do contrato assinado e a reutilizar o upload confirmado em
  caso de repeticao, sem duplicar o arquivo.
- `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx` — limite juridico passou a estar
  visivel/editavel junto das cores e formas, usando o GET/PATCH que ja existiam no backend.
- `backend/src/services/solicitacaoCriacaoUploadTokenService.js`,
  `backend/src/controllers/SolicitacaoController.js` e `backend/src/controllers/AnexoController.js`
  — token assinado de dez minutos, limitado a solicitacao, usuario e tipos esperados.
- `backend/src/services/contratoFluxoNovoService.js` — a etapa `assinado` passou a exigir no backend
  um anexo `CONTRATO` do ciclo atual, posterior a minuta; anexo antigo ou chamada direta sem
  documento nao consegue mais devolver o contrato ao Juridico.
- `backend/src/middlewares/resourceAccess.js` — `visualizar_todas` passou a liberar somente GET/HEAD
  dos dados do contrato vinculado a solicitacao, sem ampliar PATCH/POST/DELETE.
- `qa/medicao/67-fixture-visualizar-todas.js` e
  `qa/medicao/68-visualizar-todas-contrato-segura.js` — perfil isolado e prova de leitura 200,
  mutacao 403 e estado preservado.
- `qa/medicao/69-retorno-aditivo-permissoes-segura.js` — bloqueio 409 com aditivo pendente,
  negativas 403 sem permissoes e limpeza exata do pedido temporario.
- `qa/medicao/71-fixture-medicao-visual.js` — fixture nominal e modos autenticados para criacao,
  duplicidade, saldo, aprovacao por perfil, upload efetivo e limpeza conferida.
- `qa/medicao/72-financeiro-parcelas-seguro.js` — baixa parcial, estorno, diferencas, arquivos do
  titulo e titulo manual, com IDs nominais e restauracao das duas sequencias.
- `qa/medicao/73-aditivos-encerramento-seguro.js` — aditivos de valor/prazo, teto acumulado,
  rejeicao/cancelamento, ultima medicao e encerramento, com limpeza nominal e sequencias restauradas.
- `qa/medicao/74-gestao-contratos-documentos-seguro.js` — negociacao detalhada, autorizacao por
  obra/permissao e substituicao concorrente dos tres documentos juridicos, com limpeza nominal.
- `backend/scripts/dados/configurarModelosContratosComerciais.js` — carregador idempotente dos
  modelos comerciais existentes na pasta `Contratos/`, sem substituir modelo ativo por padrao.
- `qa/comercial/01-pdf-piemonte-d4sign-local-seguro.js` — PDF real do Piemonte e falha fechada da
  D4Sign local, sem chamada externa e com limpeza exata de banco e arquivos.
- `backend/src/services/comercialContratoDocumentoService.js` — conversao do LibreOffice passou a
  usar perfil temporario isolado, evitando travamento por perfil compartilhado.
- `docs/comercial/CONTRATOS_VENDA.md` — operacao dos modelos e requisito do LibreOffice documentados.
- `MIGRACAO-PARA-PRODUCAO.md` — passos de implantacao da Despesa Eventual.
- `docs/workspace/OWNERSHIP_ATIVO.md` — ownership temporario desta sessao.

## Alteracoes no banco compartilhado

### Configuracao permanente — modelos de contratos comerciais

- cadastrados os pares Contrato Padrao/Quadro Resumo de EDIFICIO PIEMONTE (modelos 1/2), EDIFICIO
  PEDRA MENINA (3/4) e EDIFICIO AREIA PRETA (5/6), usando os DOCX da pasta `Contratos/`;
- a segunda execucao do carregador nao criou duplicatas nem substituiu os seis modelos ativos;
- os arquivos de Residencial Costa do Mar foram identificados, mas nao cadastrados porque esse
  empreendimento ainda nao existe no banco local; nenhuma associacao aproximada foi criada.

### Preparacao permanente de QA — Recarga de Cartao

- cartao existente id 3 (`Jose Ricardo / V-7596`): mantido o vinculo do superadmin e acrescentado
  o usuario id 336 (`MATRIZ OBRA`);
- cartao de QA id 6: `MATRIZ QA RECARGA`, identificador `QA-MATRIZ-0827`, final `0827`, fornecedor
  id 823 e somente o usuario id 336 vinculado;
- cartao QA adicional `MATRIZ QA REFRESH`, identificador `QA-REFRESH-0828`, final `0828`, fornecedor
  Flash e somente o usuario id 336 vinculado;
- `SOL-5138`, titulo id 9329/codigo `TIT-007335`, R$ 100,00, e `SOL-5139`, titulo id 9330/codigo
  `TIT-007336`, R$ 25,00, foram criadas visualmente uma unica vez e liberadas pela Gerencia;
- o titulo id 9330 recebeu uma unica baixa parcial PIX de R$ 10,00, movimento id 1953; o ciclo
  encerrou o titulo como QUITADO pelo valor efetivamente pago e abriu prestacao por R$ 10,00;
- a prestacao foi enviada e validada com rateio id 2075, obra id 23, apropriacao id 6592,
  percentual 100% e valor R$ 10,00; o titulo ficou `considera_dre=1`/`possui_rateio=1`;
- o usuario id 336 passou a ter tambem a obra id 1/OBRA MODELO para o teste de rateio multiplo;
- o titulo id 9329 recebeu baixa integral PIX de R$ 100,00, movimento id 1954, e prestacao
  validada com rateios id 2077 (obra 23/apropriacao 6592, R$ 60,00/60%) e id 2076
  (obra 1/apropriacao 1, R$ 40,00/40%);
- o usuario id 337 `MATRIZ GERENCIA` foi alterado de `USUARIO` para `ADMIN` e recebeu as permissoes
  individuais `solicitacoes.acoes.aprovar` e `solicitacoes.retorno.decidir`, passando de 39 para
  41 permissoes exibidas na tela.

### Escritas visuais permanentes de QA — ADM/Locacao

- `SOL-5140`, R$ 1,00, ADM LOCAL DE OBRA, OBRA MODELO, apropriacao `01.01.01.01`, vencimento
  30/08/2026, credor/favorecido MERCADAO DO GESSO e forma Transferencia bancaria;
- `SOL-5141`, R$ 1,00, LOCACAO DE MAQ. EQ., OBRA MODELO, apropriacao `02.02.02.02`, vencimento
  31/08/2026, mesmo credor/favorecido e forma;
- `SOL-5142`, R$ 0,01, ADM LOCAL DE OBRA, criada com payload adulterado `apropriacao_id=6631`;
  o backend substituiu pelo vinculo autoritativo id 1 / `01.01.01.01`;
- nenhuma das tres possui titulo financeiro neste momento.

### Escritas visuais de QA — Despesa Eventual

- `SOL-5143`/ID 8093, R$ 100,00, permanece PENDENTE e possui boleto id 12000 e comprovante id
  12001 em registros distintos;
- `SOL-5144`/ID 8094, R$ 150,00, foi criada no valor exato do limite temporario, recebeu o
  comprovante PDF id 12002 e foi CANCELADA visualmente por `MATRIZ GERENCIA`;
- apos o cancelamento, o comprometido da obra caiu de R$ 250,00 para R$ 100,00;
- as configuracoes temporarias IDs 857/858 foram removidas por ID e conferidas; os limites
  voltaram aos padroes de R$ 5.000,00 por solicitacao e R$ 30.000,00 por obra.
- a tentativa negativa correta com `MATRIZ OBRA` na obra 2, fora dos vinculos 1/23, retornou 403
  e zero gravacao. O JURIDICO nao foi usado como negativo porque consta deliberadamente em
  `SETORES_CRIACAO_TODAS_OBRAS`; a `SOL-5145` criada durante essa descoberta foi removida por ID,
  junto de historico e visibilidade, e a ausencia foi conferida.
- a prova concorrente criou configuracoes temporarias IDs 859/860 e disparou dois pedidos de
  R$ 50,00 contra somente R$ 50,00 restantes: exatamente um criou a solicitacao temporaria ID
  8096 e o outro recebeu recusa por saldo zero. Solicitacao/configs foram removidas por ID; zero
  residuos, limites padrao e saldo R$ 29.900,00 foram conferidos.

### Correcao intencional

O script `configurarDespesaEventual.js` acrescentou o tipo 35 e o modo `TODOS_VISIVEIS` a lista
fechada GEO da configuracao `TIPOS_SOLICITACAO_POR_SETOR`, linha 16. O restante do JSON foi
preservado. A repeticao visual mostrou o tipo na Nova Solicitacao.

### QA transacional limpo

`npm run test:recarga-cartao` criou cartao, solicitacao, titulo, prestacao e rateio dentro de uma
transacao; fez rollback e conferiu ausencia dos registros e restauracao da sequencia.

### Escrita visual nao planejada — NAO esconder nem desfazer manualmente

No perfil MATRIZ JURIDICO, o clique em `Conferido — aprovar contrato` nao abriu confirmacao e
executou a acao imediatamente em `SOL-5136 / CT-0024` (`solicitacoes.id=7614`,
`contratos.id=4030`). Resultado em 27/08/2026 20:17:06 local:

- solicitacao `APROVADA`, devolvida para OBRA;
- quatro titulos ABERTO:
  - `TIT-007331`, id 9324, R$ 12.500,00;
  - `TIT-007332`, id 9325, R$ 12.500,00;
  - `TIT-007333`, id 9326, R$ 12.500,00;
  - `TIT-007334`, id 9327, R$ 12.500,01;
- sequencia global de titulo: 7334.

Nao tentar apagar/reverter esses registros com SQL avulso: a acao gerou historico, mudou setor,
contrato e sequencia. Se o usuario decidir restaurar o caso, criar antes uma rotina transacional que
prove a fotografia anterior e confira cada tabela. CT-045 permanece APROVADO. A ausencia de
confirmacao nominal que havia reprovado CT-101 foi corrigida e repetida em `SOL-5117 / CT-0006`:
codigo errado manteve o botao final desabilitado, codigo exato habilitou e a tela voltou sem
executar. Contrato/solicitacao permaneceram na revisao juridica e zero titulos foram criados.

## Validacoes aprovadas

- frontend build: 372 modulos;
- rotas backend carregam;
- 205 migrations/205 registros;
- health 200;
- sequencias alinhadas antes e depois da acao visual;
- `npm run test:solicitacao-vencimento`;
- `npm run test:obra-gestao-apropriacoes`;
- `npm run test:importacao-apropriacoes`;
- `npm run test:despesa-eventual`;
- `npm run test:recarga-cartao` com rollback;
- validador de anexos de contrato executado somente em memoria: macro, objeto incorporado e
  extensao falsa recusados; DOCX/PDF validos aceitos; zero persistencia;
- `node qa/medicao/60-negociacao-obrigatoria-segura.js`: contratos temporarios abaixo/acima do
  limite recusados sem negociacao, estado preservado e limpeza nominal por IDs confirmada;
- `CT-0004`/`SOL-5115`: GEO sem botao Cancelar apos minuta e defesa do backend retornando 403.
  Uma chamada interna inicial sem `area` nao reproduziu `req.user` e alterou o caso; contrato,
  solicitacao e timestamps foram restaurados sob locks, a repeticao fiel preservou o estado e o
  vinculo temporario `usuarios_obras.id=1541` foi removido e conferido;
- repeticao de `conferido` no `CT-0024` ativo retornou 409, preservou o estado e manteve quatro
  parcelas vinculadas a titulos antes/depois;
- configuracoes de Contratos: limite juridico R$ 50.000,00, cores e nove formas carregaram no
  navegador; faixas invalidas 10%/20% foram recusadas e zero configuracao foi gravada; build 372;
- valores de contrato zero/negativo/vazio e soma de parcelas divergente recusados com 400 antes da
  transacao; zero contrato QA gravado; frontend redistribui a soma e bloqueia parcela sem centavo;
- `node qa/medicao/61-criacao-idempotente-concorrente-segura.js`: replay da mesma chave devolveu
  o mesmo par contrato/solicitacao e duas chaves concorrentes geraram codigos unicos; um quarto
  caso de R$ 50.000,01 preservou a fotografia juridica; todos nasceram PENDENTE/PREVISAO sem titulo,
  foram removidos por IDs e a sequencia voltou a 24;
- `node qa/medicao/62-aprovacao-limite-segura.js`: sem categoria recusou sem pedir vencimento;
  abaixo do limite ativou/dois titulos ABERTO/voltou a OBRA; acima foi PENDENTE/JURIDICO sem titulo;
  limpeza por IDs e sequencias contrato 24/titulo 7336 conferidas;
- `node qa/medicao/63-rejeicao-reenvio-segura.js`: rejeicao sem motivo recusada; rejeicao juridica
  devolveu para OBRA em PENDENTE DE AJUSTE; o Juridico nao recebeu a acao nem conseguiu reenviar;
  comentario ou arquivo posterior a rejeicao reenviaram como ATENDIDO ao JURIDICO; arquivo antigo
  foi recusado; parcelas voltaram a PREVISAO, nenhum titulo foi criado e a limpeza nominal fechou
  em zero, com sequencia do contrato novamente alinhada em 24;
- `node qa/medicao/64-minuta-assinatura-segura.js`: minuta ausente e link inseguro recusados;
  minuta apenas por link ou apenas por arquivo voltou para OBRA em NEC. DE ASSINATURA; somente a
  origem recebeu a acao de assinatura; sem documento assinado a API respondeu 400; com anexo
  `CONTRATO` novo voltou PENDENTE/destacado ao JURIDICO, ainda sem titulo e com parcelas PREVISAO;
  a limpeza nominal fechou em zero e a sequencia permaneceu alinhada em 24. A primeira execucao
  funcional encontrou apenas uma expectativa errada no proprio QA (`JURIDICO_MINUTA_ENVIADA` em
  vez do nome canonico `JURIDICO_MINUTA`); apos o ajuste, a repeticao passou integralmente;
- validacao visual em `SOL-5145`/`CT-0025` temporarios: MATRIZ OBRA viu o novo seletor compacto,
  recebeu o bloqueio sem arquivo, selecionou `AQUISICAO E PERMUTA DE BENS.docx` e acionou
  Solicitar revisao; a tela mudou para PENDENTE/JURIDICO, exibiu o historico do anexo e da etapa,
  manteve duas parcelas PREVISAO e zero titulos. Contrato 4463, solicitacao 8117, anexo 12007 e o
  arquivo local correspondente foram removidos nominalmente; sequencia 24 = maior contrato 24;
- perfil temporario neutro, sem obra e com somente `solicitacoes.lista.visualizar_todas`, listou
  5.039 solicitacoes e abriu `SOL-5113`/`CT-0001` com cabecalho, apropriacoes e parcelas. A API
  respondeu 200 para solicitacao/parcelas, 403 para aprovacao e preservou o contrato; nenhum botao
  financeiro, comentario, anexo ou decisao foi liberado;
- `SOL-5116` com aditivo 130 PENDENTE recusou a aprovacao do retorno com 409; pedido, solicitacao e
  aditivo ficaram inalterados. MATRIZ JURIDICO, sem as duas chaves de retorno, recebeu 403 ao
  solicitar e decidir. O unico pedido QA foi removido por ID e a ausencia foi conferida;
- `SOL-5113`/`CT-0001` aberto visualmente: OBRA somente acompanha e nao ve as tres decisoes;
  GERENCIA ve categoria/Aprovar/Rejeitar/Cancelar. Vinculos temporarios 1542/1543 removidos;
- auditoria de 338 permissoes: zero chave invalida/duplicada, zero somente frontend e zero sem uso;
- contratos: abertura, limiar juridico, conjuge, parcelas, cabecalho/detalhe, Financeiro, etapa
  Juridica e aprovacao final;
- medicao: parcelas elegiveis, PIX/Boleto condicionais e anexo;
- medicao negativa no navegador: sem arquivo geral, PIX sem favorecido, PIX sem chave e Boleto
  sem boleto foram recusados com mensagens nominais. A consulta final confirmou zero medicao e
  zero solicitacao do usuario MATRIZ OBRA no contrato 3477;
- medicao positiva e aprovacao: medicao 817 criada visualmente com parcela/anexo; duplicidade 409,
  excesso sobre saldo 400 com orientacao de aditivo, OBRA sem permissao 403 e Gerencia 200. A
  solicitacao chegou a `LIBERADO/FINANCEIRO`, com situacoes `LIBERADA/ABERTO`. Em fixture separado,
  a medicao 818 sem upload efetivo foi recusada na aprovacao com 400 e preservou
  `NEC. DE MEDICAO/OBRA`; ambas as massas foram removidas por IDs e as sequencias restauradas;
- repeticao da aprovacao da medicao 819 retornou 409, preservou timestamp e contagem do historico.
  A transicao `PREVISAO -> ABERTO -> LIBERADA` foi comprovada no servico e exibida no navegador,
  em `SOL-5145`, com zero erro/aviso no console. A terceira massa tambem foi removida por IDs e as
  sequencias voltaram a contrato 24/titulo 7336;
- financeiro do contrato: `SOL-5113/CT-0001` provou PREVISAO sem titulo antes de aprovar. A suite
  segura 72 confirmou baixa parcial, redistribuicao, idempotencia, estorno e pagamento acima/abaixo
  preservando o total. A rota de arquivos reuniu ANEXO/COMPROVANTE da solicitacao e explicou titulo
  manual sem solicitacao. Solicitacoes 8122/8123, medicoes 820–823, titulos 9349–9357 e demais
  dependentes temporarios foram removidos por IDs; sequencias voltaram a 24/7336;
- aditivos e encerramento: a suite segura 73 aprovou CT-080 a CT-090, incluindo permissoes,
  motivo obrigatorio, teto de 25%, idempotencia, aditivo de prazo, sobra da ultima medicao e
  encerramento. Contrato 4472, solicitacao 8126, medicoes 830–835, aditivos 490–493, parcelas
  13306–13311 e titulos 9368–9373 foram removidos por IDs; sequencias voltaram a 24/7336;
- legado/Gestao de Contratos: `SOL-4678` e `CT/EP001-33` confirmaram fluxo e medicao historicos;
  a suite segura 74 aprovou CT-095 a CT-097 e removeu contrato/anexos temporarios nominalmente;
- comercial: PDF temporario do Piemonte foi gerado com 46 paginas; a ausencia de D4Sign foi
  tratada sem corromper documento/status e toda a massa temporaria foi removida com zero residuo;
- Compras: a SC-00161 comprovou tabela compacta, expansivel e catalogacao disponivel para item
  legado; autocomplete e `Criar novo` foram exercitados sem salvar. As provas locais aprovaram
  vinculo, descricao oficial, concorrencia, novo insumo, alias e limpeza/sequencia exatas;
- permissao de catalogacao: numa fixture propria, `MATRIZ OBRA` recebeu leitura de Compras sem a
  chave de Insumos; viu o item sem formulario e recebeu 403 na API. Compra/item temporarios foram
  removidos e a configuracao voltou a 30 usuarios e seis permissoes individuais originais;
- permissoes: a auditoria read-only repetida encontrou 338 chaves, zero invalida/duplicada/somente
  frontend/sem uso literal; RG-SOL-010 foi aprovado;
- aditivo: modal, saldo de 25% e bloqueio visual acima do teto;
- Despesa Eventual, ADM/Locacao e Recarga negativa sem cartao.
- Recarga visual: criacao atomica, previsao fora do DRE, liberacao pela Gerencia, titulo ABERTO,
  bloqueio de nova recarga com pagamento pendente e atualizacao dos paineis sem F5.
- Recarga negativa/concorrente: apropriações somadora, inativa e de outra obra recusadas sem
  resíduo; envio e validação duplicados protegidos por reserva atômica de estado, com um único
  rateio final; suíte transacional fez rollback e conferiu a sequência.
- ADM/Locação: vínculos distintos e filtros conferidos na tela; seletor limitado a apropriações
  válidas; obra sem vínculo bloqueada antes da gravação; PIX/Boleto/Transferência e credor como
  favorecido conferidos; criação automática de apropriações `1`/`2`, CENTRO_CUSTO sem padrões,
  falha posterior e rollback aprovados. `SOL-5140` e `SOL-5141` confirmaram detalhes sem card
  automático e apropriações distintas no histórico.
- Retorno por setor: bloqueio de interacao, pedido unico/retry, decisao, rejeicao, cancelamento,
  notificacoes e historico passaram; a suite conferiu zero residuos de usuarios, solicitacoes,
  pedidos e notificacoes.
- Contrato: campos configuraveis do fluxo novo foram publicados sem duplicidade. A documentacao
  juridica confirmou limiar, qualificacao, conjuge condicional, tres anexos nominais e preservacao
  de status; o contrato temporario 4435 e anexos foram removidos, com zero resto.
- A protecao contra payload adulterado foi provada por `SOL-5142`: o id de Locacao enviado em
  ADM foi ignorado e o vinculo ADM da obra foi persistido. `SOL-4625` confirmou que o legado
  conserva contrato, apropriacao e titulo historicos sem conversao retroativa.
- Despesa Eventual recusou R$ 5.000,01 contra limite configurado de R$ 5.000,00 no frontend e
  no serviço do backend; a consulta após o alerta confirmou zero solicitação QA persistida.
- Despesa Eventual: PIX sugeriu chave 2 e permitiu edicao; Transferencia manteve favorecido sem
  campos PIX/Boleto e foi aceita pelo validador backend. Boleto e comprovante foram exigidos
  separadamente, com alertas nominais nos dois cenarios inversos.
- Despesa Eventual recusou justificativa vazia pelo campo obrigatorio e, depois, comprovante
  ausente por alerta nominal; a consulta confirmou zero solicitacao QA persistida.
- Despesa Eventual recusou as tres declaracoes desmarcadas antes do envio, com alerta nominal
  `Confirme todas as declarações obrigatórias da Despesa Eventual.`.
- O primeiro positivo de Despesa Eventual criou `SOL-5143`/ID 8092 sem anexos: o endpoint aplicava
  a trava de setor posterior entre a criacao e os uploads. Foi adicionado token assinado de 10
  minutos, restrito a solicitacao/usuario/tipos iniciais. A solicitacao QA incompleta, seu historico
  e sua visibilidade foram removidos por ID em transacao, com verificacao final zero. O reteste
  criou uma unica `SOL-5143`/ID 8093, com boleto 12000 e comprovante 12001 em tipos/caminhos
  distintos; lista, detalhe e saldo comprometido de R$ 100,00 foram conferidos.
- Com limites temporarios de R$ 150,00 por solicitacao/obra, o saldo de R$ 50,00 foi exibido e
  uma tentativa de R$ 100,00 foi recusada nominalmente; zero registro QA foi persistido.
- Campos da Nova Solicitacao: o ciclo visual salvou e recarregou configuracoes por area/tipo
  (`GEO/CONTRATO` e `GEO/ADM LOCAL DE OBRA`) e pela chave composta de subtipo `GEO/33:25`.
  A Nova Solicitacao obedeceu a obrigatoriedade do Objeto do contrato e ocultou o Titulo de ADM;
  o resolvedor do backend confirmou as mesmas regras. A fotografia original de
  `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` foi restaurada exatamente, com SHA-256 final igual a
  `7F4C85E22A3F35F39C8C470F8BBC8E49600596FA91BBAFFB4856F1B806D19B93`.
- Concorrencia de apropriacao padrao: a nova suite segura disparou seis PATCH simultaneos na
  mesma chave temporaria, recebeu seis respostas 200 e encontrou uma unica linha final. Obra,
  apropriacoes e vinculo foram removidos somente pelos IDs criados e a ausencia foi conferida.
- Lista de Solicitacoes: filtro exato de codigo retornou uma linha, paginacao de 50 itens avancou
  de `1-50` para `51-100` e a exportacao CSV filtrada concluiu sem alerta; nenhuma escrita ocorreu.
- Permissoes: o mesmo usuario real sem configuracao foi permitido pela compatibilidade legada e,
  com `areas_permissoes_configuradas=true`/lista vazia, foi negado. A prova visual anterior de
  `MATRIZ OBRA` versus `MATRIZ GERENCIA` ja confirmou a mesma separacao nos botoes da fila GEO.
- Biblioteca: com somente `biblioteca.geral.visualizar`, MATRIZ OBRA abriu a lista e teve apenas
  Visualizar/Baixar; upload, exclusao e seletor de arquivo permaneceram ausentes.
- Comunicacao: com somente `comunicacao.geral.visualizar` e o envio explicitamente bloqueado, a
  pagina ficou sem criar conversa, responder ou alterar mensagens, e o POST foi recusado com 403.
  O unico escape visual encontrado era o botao superior `+ Nova`; ele passou a obedecer
  `podeEnviarComunicacao`, e o build de 372 modulos foi aprovado.
- Obras: com `obras.cadastro.visualizar` e `obras.gestao.visualizar`, o portfolio e o dashboard
  abriram sem campos de escrita; o acesso direto a Gestao de Apropriacoes foi redirecionado para
  Solicitacoes por ausencia de `obras.gestao.apropriacoes`.
- A fotografia temporaria de `PERMISSOES_AREAS_USUARIOS` foi restaurada byte a byte. O registro
  voltou a 29.630 bytes e ao SHA-256 original
  `13F0BDD97A3C13793D272A41BD84C65DF23C7524AE884F5E9275B56F75D2CCE6`; MATRIZ OBRA terminou com
  suas seis permissoes originais e a lista original vazia de bloqueios.
- Espelho de pedido: o teste granular encontrou que o controlador repetia uma checagem ampla de
  gerenciamento e ainda exigia, indevidamente, registrar frete. A acao passou a validar somente
  `compras.pedidos.anexar_espelho`, preservando o escopo do pedido. Em `PC-00071`, somente leitura
  abriu o pedido sem campo de arquivo e o PATCH devolveu 403; apos conceder apenas a chave de
  espelho, o campo apareceu e um payload vazio chegou ao validador (400 `Arquivo e obrigatorio.`),
  sem alterar o pedido. A linha temporaria 864 foi apagada pelo proprio ID e a configuracao efetiva
  voltou exatamente a linha 848/hash original.
- Auditoria de permissoes repetida depois da correcao: 338 chaves, zero invalida/duplicada, zero
  somente frontend e zero sem uso literal fora do registro.
- ADM/Locacao, alterar/remover vinculo: no FÓRUM CARANGOLA, a tela alterou ADM da apropriacao
  `00.001.001` para `00.002.001`, refletiu imediatamente a nova descricao e depois removeu o
  vinculo, atualizando de 9 para 8 definidos. O controlador reversivel recriou exatamente a linha
  original ID 113, inclusive criador, atualizador e timestamps; o reload voltou a mostrar
  `00.001.001 - ADMINISTRAÇÃO LOCAL` e 9 de 174 vinculos.
- Ambiente: limites resolvidos, formas ativas e hashes de campos/permissoes foram registrados sem
  expor valores sensiveis em `docs/qa/FOTOGRAFIA_CONFIGURACOES_E_INVENTARIO_TELAS_2026-08-28.md`.
  O inventario comparou 243 caminhos de pagina/modulo em `C:\Fluxy` com 260 na V4 e classificou
  os 17 caminhos funcionais novos nos blocos da matriz; a unica copia `.orig` foi excluida do
  inventario funcional e preservada por pertencer ao worktree compartilhado.
- Notificacoes: o teste isolado do broker SSE confirmou conexao, entrega e limpeza do stream. A
  central visivel carregou o historico sem escrita, o frontend confirmou polling de 30 segundos e
  recarga em `focus`/`visibilitychange`, e a notificacao ja lida `SOL-4096` abriu o detalhe correto
  (rota interna `/solicitacoes/4131`, cabecalho `SOL-4096`).
- Compras: validadores read-only de cotacao, fechamento excedente, frete por item/global,
  remanejamento e performance passaram. A prova visual mostrou `SC-00248` em fechamento parcial e
  `PC-00074` com mercadorias de R$ 793,00 + frete global embutido de R$ 169,90 = aquisicao de
  R$ 962,90, inclusive rateio R$ 140,33/R$ 29,57. Em viewport de notebook (914x698), documento e
  corpo ficaram sem overflow global; tabelas mantiveram suas regioes horizontais dedicadas e o
  layout usa quebras responsivas para mobile.
- Compras, mutacao segura: `qa/compras/01-fechamento-remanejamento-seguro.js` usou a SC-00096
  dentro de transacao, gerou fechamento PARCIAL, confirmou replay idempotente com um unico pedido
  e remanejou duas vezes ao mesmo fornecedor, preservando um unico pedido e um unico item destino
  (1,5 destino + 0,5 origem = 2). Os 18 registros temporarios receberam IDs negativos; rollback,
  fotografia integral do escopo e AUTO_INCREMENT ficaram identicos ao estado inicial e nenhum ID
  negativo permaneceu. O navegador voltou a mostrar a SC-00096 intacta como LIBERADO PARA COMPRA.
- Financeiro: importacao de apropriacoes foi comparada com `C:\Fluxy` e validada; importacao de
  titulos, baixas por formas de pagamento, cheques, DDA, calculos/CNAB/retorno Caixa e conciliacao
  exata passaram nos validadores. Resultado de Obras coincidiu com o controlador e Financeiro de
  Obras carregou os dados reais, inclusive fretes e titulos de recarga. Contas a Pagar mostrou os
  caminhos de modelo/importacao e a criacao manual abriu com rateios, impostos e formas combinadas.
- OFX: `qa/financeiro/01-estorno-ofx-seguro.js` confirmou valor exato e sinal oposto, janela PIX,
  restauracao do titulo para ABERTO, baixa original ESTORNADA, conciliacao original preservada,
  estorno CONFIRMADO e replay com um unico movimento. IDs negativos, rollback integral e
  AUTO_INCREMENT identico foram conferidos. A primeira estrategia recusou corretamente executar
  ao detectar que a tabela compartilhada nao tinha lacuna positiva; nenhum registro foi criado.
- Caixa Fisico: o validador revelou documentacao operacional ausente. Foi criado
  `docs/modulos/financeiro/CAIXA_FISICO_ABERTURA_FECHAMENTO.md`; o validador passou depois da
  correcao, junto dos validadores de boleto Caixa. Cheques, DDA e Boletos abriram no navegador sem
  tela interrompida nem overflow global.
- Custos e Recebiveis: as fases 0 a 4 e a prontidao operacional passaram. A instalacao local mantem
  `CUSTOS_RECEBIVEIS` desabilitado, portanto a rota visual redireciona ao inicio por regra tanto
  para superadmin quanto para usuarios comuns. TotalBank permanece documentado como fase de
  homologacao, sem chamada externa durante este QA.
- DRE/caixa: a fotografia real encontrou uma unica PREVISAO, de Recarga de Cartao, com
  `considera_dre=0`; nenhum valor pendente contaminou o realizado. O titulo manual e a importacao
  preservaram os caminhos necessarios a conciliacao.
- RH/DP: inicio, Pessoal, Jornada, Colaboradores, Documentos, Importacoes, Apuracao, Fechamentos e
  Relatorio Operacional abriram no navegador sem tela interrompida ou overflow global. A base real
  exibiu 137 colaboradores, quatro solicitacoes legadas, dois lotes de importacao e uma apuracao;
  a movimentacao aprovada #256 abriu no modal com seus dados e documentos. Regras puras de
  afastamento, transferencia, alteracao salarial, competencia e calculo de adicionais passaram.
  O banco apresentou zero salario vigente duplicado e zero evento recorrente duplicado por
  apuracao. As quatro suites antigas de RH foram verificadas sintaticamente, mas nao executadas:
  elas usam limpeza por prefixo e IDs automaticos sem restaurar sequencias, incompatível com o
  protocolo do banco compartilhado; a cobertura foi feita por navegador, regras puras e
  invariantes read-only da base atual.
- Seguranca: login autenticado respondeu 200; rotas protegidas responderam 401 sem token e com
  token invalido, e 200 com sessao valida. As regras puras de MFA confirmaram politica explicita,
  perfis administrativos, bypass de usuario comum e segredo ilegivel sem exposicao. O presign
  aceitou somente anexo registrado e autorizado, rejeitou travessia, bucket incorreto, URL
  `javascript:` e SVG; o mesmo anexo foi negado com 403 ao perfil sem acesso a solicitacao.
  `validarSecurityHardening.js` e `validarLiveUpdates.js` passaram.
- Regressao visual global: 111 rotas unicas do menu lateral foram abertas no navegador interno,
  cobrindo Solicitacoes, Compras, Financeiro, Fiscal, CRM, Comercial, Provisionamento, RH/DP, SST,
  Cadastros, Contratos, Governanca e Configuracoes. Resultado consolidado: zero tela interrompida,
  zero pagina inexistente, zero overflow global, zero erro de navegacao e zero erro/warning no
  console. Claro/escuro e largura de notebook (914x698) foram exercitados; as regioes densas
  mantiveram rolagem propria e os breakpoints responsivos preservaram formularios/tabelas.
- O alerta `Failed to fetch` visto ao sair de Delegacao de Compras foi isolado como efeito do salto
  de pagina completa do controlador de QA enquanto as duas consultas anteriores ainda estavam em
  voo. A pagina de Relatorios de Compras carregou, os endpoints de solicitacoes/delegacao e usuarios
  responderam 200 com dados reais, e o alerta nao reapareceu na navegacao interna nem nas 96 rotas
  seguintes.
- Fechamento: a matriz terminou com 227 casos APROVADOS e zero PENDENTE. `git diff --check` passou,
  o novo QA de estorno OFX passou em `node --check` e o build de producao do frontend transformou
  372 modulos com sucesso. O primeiro build foi bloqueado apenas pela fronteira de leitura do
  sandbox do esbuild; a repeticao autorizada fora dessa fronteira concluiu sem erro de compilacao.

## Bloqueios

1. A entrada automatizada em `<input type=date>` nao atualiza o estado React no navegador interno;
   as duas criacoes positivas usaram entrada manual da data pelo usuario.
2. Tres usuarios ativos ainda estao em compatibilidade legada irrestrita: Renan Leal, Jose Ricardo
   (BRAPE) e Fisco CSC.

## Proximo passo exato

1. Executar build final, `git diff --check` e conferir a contagem da matriz.
2. Preservar os tres usuarios em compatibilidade legada para decisao administrativa separada.
3. Na migracao, aplicar migrations na ordem registrada e repetir os smokes no ambiente de destino.
