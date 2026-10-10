# Modulo FINANCEIRO

## Papel e propriedade

Financeiro e dono de titulos a pagar/receber, parcelas financeiras, movimentos, baixas, estornos, contas bancarias, categorias, conciliacao e calculos de previsto/realizado. Modulos de origem nao podem criar movimentos diretamente.

## Titulos

Tipos Pix incluem `COPIA_COLA` (rotulo **Copia e Cola**) nos cadastros,
criacao/edicao de titulo, preparar Pix da solicitacao, RH/DP e fretes. Aceita
texto livre ate 8192 caracteres, preservando caixa, simbolos e espacos internos;
apenas espacos nas extremidades sao removidos como nos campos existentes.
Nao validar esse texto como CPF/CNPJ/email/UUID nem corta-lo. Os tipos antigos
mantem as validacoes existentes. A fila manual usa o dado cadastrado; o lote
automatico BB atual por chave Pix rejeita Copia e Cola antes de gerar intents.

Migration `202610090001_pix_copia_cola_texto.js`: expansao de 12 colunas para
TEXT, preservando nulabilidade, dados e indice Pix com prefixo MySQL; nenhum
backfill ou mudanca de status. Aplicar antes de usar codigos longos. Cadastro
simplificado usa SHA-256 do texto em `pix_chave_canonica` apenas para este novo
tipo, preservando unicidade sem reduzir ou alterar o codigo armazenado.
Validacoes locais: `npm run test:pix-copia-cola` em backend e frontend.

- tipo obrigatorio `PAGAR` ou `RECEBER`;
- origem pode ser solicitacao, compra, comercial, RH/DP ou lancamento manual;
- parceiro, empresa, categoria, vencimento e valor devem ser consistentes;
- referencia de origem deve impedir titulo duplicado;
- status e saldo derivam dos movimentos ativos;
- edicao de titulo movimentado possui restricoes e auditoria.

## Recarga de cartao e envio independente

Novas recargas criam um titulo `ABERTO` por cartao, com a obra/centro de custo
da solicitacao como origem. Reabrir uma recarga ainda sem baixa preserva essa
origem e o estado aberto. A obrigacao a pagar e o movimento de caixa continuam
visiveis; nao sao custos apropriados antes da prestacao validada por cartao.
`considera_dre=false`, sem rateios financeiros, ate a validacao existente.

Resultado de Obras exclui a recarga do agregado direto; o custo entra somente
pelos rateios classificados da prestacao, sem somar a origem outra vez. Gestao
de Obras tambem nao usa a origem nem rateios da solicitacao como fallback de
custo antes dessa classificacao. O relatorio Financeiro Obras tambem exclui
recargas ainda sem essa classificacao, preservando filtros de obra, periodo e
busca. Pagamentos e anexos separados por cartao, status parcialmente pago/PAGA
e regras de prestacao permanecem existentes.

No card Financeiro dos detalhes, preparar autorizacao e enviar para fila sao
botoes separados. Cada permissao habilita apenas sua acao; a fila nao exige
permissao de preparar autorizacao, mesmo em PILOT/ENFORCED. A autorizacao
digital precisa estar disponivel, conforme regras do modulo. Selecoes e
destino sao congelados antes da confirmacao; trava e chave de idempotencia
sao compartilhadas com o modal de medicao e preservadas ao repetir uma falha.

## Juros e multa na edicao e na fila

Juros e multa sao valores em reais, nao percentuais. Na edicao do titulo ficam
em campos distintos e o total previsto e o valor liquido/base mais esses dois
encargos. O principal, os impostos e os rateios nao sao capitalizados pelos
encargos. Na Fila de Pagamentos ha uma coluna para cada encargo; o valor pago
e o desembolso total. A baixa abate apenas o principal do saldo e grava juros
e multa separadamente no movimento financeiro existente.

Exemplo: saldo de R$ 200,00, juros de R$ 10,00 e multa de R$ 3,00 esperam
pagamento de R$ 213,00, sem divergencia. Valor pago acima/abaixo desse total
continua seguindo o fluxo de divergencia justificada. Cartao de credito
continua exigindo quitacao integral, e sua fatura inclui os encargos efetivos.
Cheque de terceiro cobre o desembolso total, nao somente o principal.

Salvar uma edicao sincroniza saldo, vencimento e encargos com itens ativos da
fila ainda sem movimento, na mesma transacao (lock titulo antes de fila).
Nao altera pagamentos anteriores, comprovantes, valor pago informado, motivo
ou status de divergencia. Corrigir um titulo divergente nao autoriza sua baixa
automaticamente: a aprovacao existente permanece obrigatoria. Titulos ja
movimentados continuam sujeitos aos bloqueios de edicao anteriores.

Atualizar a tela busca o saldo/encargos novos, preservando valores de pagamento
digitados manualmente. Encargos configurados no titulo so sao copiados na
entrada/reabertura sem baixa anterior, evitando repeti-los numa segunda baixa
parcial. O dossie digital inclui encargos nao zerados no total e na revalidacao
material; titulos sem encargos mantem o formato/hash legado.

Reutiliza as rotas/permissoes de edicao de titulos, registro de baixas e
aprovacao de divergencias; nenhuma permissao nova. Requer aplicar a migration
estrutural `202610080002_fila_pagamentos_juros_multa.js` antes de iniciar o
backend atualizado. Adiciona `juros`/`multa` DECIMAL(14,2), default zero, em
`titulos_financeiros` e `pagamentos_manuais_fila`, sem DML/backfill. Os dados
ficam separados para evolucao dos relatorios; layouts de relatorios nao foram
alterados nesta entrega.

Validacoes isoladas no backend: `test:fila-juros-multa`,
`test:fila-instrumentos`, `test:fila-comprovante-pendente`.
No frontend: `test:fila-instrumentos-ui`, `test:titulo-juros-multa-ui` e build.
Os testes UI usam a pagina real com APIs simuladas, em desktop/mobile.

## Relatorio PDF de titulos

O botao Gerar relatorio em Contas a Pagar gera somente os titulos selecionados
quando ha selecao. Sem selecao, gera todos os titulos dos filtros aplicados,
incluindo todas as paginas da consulta. O botao indica a quantidade selecionada.
Ambos os casos preservam os filtros e o escopo financeiro autorizado.

Sem selecao, usa `GET /financeiro/titulos/relatorio.pdf`. Com selecao, usa `POST`
na mesma rota, com `titulo_ids` no JSON e os filtros na query. A permissao
continua sendo `financeiro.titulos.exportar`. O POST aceita ate 5000 IDs e nao
altera registros. Se algum titulo selecionado nao estiver mais disponivel nos
filtros ou no acesso atual, retorna erro e pede nova selecao; nunca gera todos
os filtrados como alternativa silenciosa. O bloqueio operacional de obras
mantem esse POST disponivel como consulta, sem liberar escritas. O controle
diario de caixa permanece inalterado para GET e POST.

A coluna Solicitacao fica imediatamente apos Titulo e mostra
`solicitacao.codigo` (por exemplo, `SOL-6240`), nunca o ID interno. Sem codigo
vinculado, mostra `-`. O renderer compartilhado de Contas a Receber segue a mesma
ordem. Totais, datas e filtros permanecem inalterados.

Validacao isolada: `npm run test:relatorio-titulos-solicitacao` no backend.
Selecao, filtros e acesso: `npm run test:relatorio-titulos-selecao` no backend;
handler, botao e HTTP reais com APIs simuladas: comando de mesmo nome no frontend,
com Playwright e Chrome disponiveis.
Nao requer migration ou nova permissao.

## Cartao na geracao pela solicitacao

Na aba Financeiro dos detalhes da solicitacao, o cartao utilizado e opcional
para as formas Cartao de Credito e Cartao de Debito. Sem cartao informado,
o titulo nasce em `ABERTO`, sem baixa, movimento, fatura ou quitacao automatica.
Com cartao informado, continuam as validacoes de atividade, tipo e conta
pagadora e a quitacao automatica existente (credito com fatura ou debito).
A escolha explicita de `PREVISAO` preserva o comportamento de previsao.

A baixa posterior pelo Financeiro exige informar o cartao efetivamente
utilizado e registra o pagamento no titulo original. Parcelamento, datas,
rateios, empresa e permissoes existentes permanecem inalterados. Esta
dispensa pertence somente ao servico `criarTituloPorSolicitacao`, chamado
por `POST /solicitacoes/:id/gerar-conta` com `financeiro.titulos.criar`;
nao e flag de payload e nao dispensa cartao no lancamento manual nem na baixa.
Nao requer nova permissao, variavel ou migration.

Validacao sem banco: `npm run test:cartao-opcional-solicitacao` no backend.
Formulario real com APIs simuladas: `npm run test:cartao-opcional-solicitacao-ui`
no frontend, com Playwright e Chrome disponiveis.

## Recargas de cartoes

Uma solicitacao de recarga pode conter varios cartoes. Cada cartao gera seu
proprio titulo PAGAR em PREVISAO, com fornecedor, empresa e categoria do
cadastro do cartao. A liberacao da solicitacao abre todos os titulos ainda em
previsao; baixa e prestacao de contas continuam separadas por cartao.

O status agregado fica `PARCIALMENTE PAGO` enquanto houver cartao com valor
pendente e muda para `PAGA` quando todos estiverem integralmente pagos. A
regra anterior de recarga parcial permanece: a baixa encerra o titulo pelo
valor efetivamente pago e registra o valor nao recarregado no ciclo; esse caso
mantem o agregado parcial. Estornos nao foram ampliados nesta entrega e devem
seguir as restricoes financeiras existentes.

A primeira baixa nao retira do Financeiro uma solicitacao com outros cartoes
aguardando pagamento. Quando todos os ciclos estiverem pagos ou cancelados,
o retorno ocorre para OBRA ou, em Centro de Custo, para o setor criador.
Prestacao validada grava somente os rateios do titulo daquele cartao e libera
sua classificacao de custo. Repetir a sincronizacao sem nova baixa nao desfaz
o status ATENDIDO/APROVADA da prestacao.

Configuracao, documentos e escopo:
[Recarga de cartoes por origem](../solicitacoes/README.md#recarga-de-cartoes-por-obra-e-centro-de-custo).
Implementacao: `recargaCartaoService` e `solicitacaoFinanceiroStatusService`.
Validacao sem banco: `npm run test:recargas-multiplas` no backend.

## Importacao em massa de contas a pagar

A importacao em massa esta implementada no repositorio e depende da migration `202607200001_financeiro_titulos_importacao.js` no ambiente de destino. O fluxo e exclusivo para `PAGAR`: o usuario exporta o modelo versionado em Contas a Pagar, envia o `.xlsx`, revisa o preview persistido e confirma a criacao atomica.

- permissao especifica `financeiro.titulos.importar`;
- `empresa_codigo` + `obra_codigo` identificam a obra pela referencia operacional conhecida pelo usuario; `apropriacao_codigo`, quando informado, identifica a apropriacao dentro dessa obra; o backend resolve os IDs internos e deriva da obra a empresa e a DRE do titulo;
- `credor_cpf_cnpj` identifica o parceiro pelo documento visivel na tela, com ou sem mascara, e `categoria_nome` usa o nome exibido no cadastro;
- o modelo de importacao nao expoe IDs internos de obra, credor, categoria ou apropriacao e bloqueia referencias inexistentes, ambiguas, inativas ou fora do escopo;
- o credor e global e pode representar colaborador cadastrado em outra empresa;
- em Contas a Pagar, o filtro de credor pesquisa todos os parceiros ativos do cadastro central, incluindo credores e fornecedores de Compras ja vinculados; a lupa abre a listagem completa com busca por nome ou CPF/CNPJ e rolagem responsiva;
- o modelo `1.4` separa as referencias em `EMPRESAS`, `OBRAS`, `APROPRIACOES`, `CREDORES`, `CATEGORIAS`, `FORMAS_PAGAMENTO` e `DOMINIOS`, todas com filtro e pesquisa do Excel; `CREDORES` informa se o favorecido bancario/PIX esta pronto;
- as listas suspensas usam essas abas, mas a planilha representa um retrato dos cadastros no momento da exportacao; para incluir referencias criadas depois, o usuario deve exportar um novo modelo;
- referencias sao revalidadas no preview e na confirmacao;
- parcelas, rateios e impostos usam abas relacionadas por `chave_importacao`;
- formulas, macros, linhas ocultas e colunas ocultas com dados sao rejeitadas;
- confirmacao exige `Idempotency-Key`, bloqueio transacional e rollback integral em erro;
- titulos recebem origem `IMPORTACAO` e nao criam baixas, movimentos, intents, faturas ou vinculos operacionais.

Detalhes tecnicos e cenarios de aceite estao em [`PLANO_IMPORTACAO_TITULOS_PAGAR.md`](./PLANO_IMPORTACAO_TITULOS_PAGAR.md).

## Baixa e estorno

- baixa pode ser parcial ou total;
- a baixa em massa lista somente formas ativas de `financeiro_formas_pagamento` e grava
  `forma_pagamento_id` no movimento, preservando `forma_recebimento` como classificacao
  tecnica retrocompativel;
- o tipo cadastrado dirige as regras existentes: `CARTAO_CREDITO` e `CARTAO_DEBITO`
  executam a regra `CARTAO`; formas como `FOPAG` podem permanecer distintas no cadastro
  e executar a regra `TRANSFERENCIA`;
- movimentos legados sem `forma_pagamento_id` continuam validos e as APIs antigas ainda
  podem enviar apenas a classificacao tecnica aceita;
- exige conta, data, valor base e ajustes de juros, multa ou desconto;
- transacao bloqueia pagamento acima do saldo;
- estorno marca o movimento como `ESTORNADO` e recalcula o titulo;
- estorno nunca remove a trilha;
- nova baixa depois do estorno e uma nova operacao auditada;
- comprovantes e conciliacoes vinculados precisam ser revistos.

## Fila manual de pagamentos

A Fila de Pagamentos separa a preparacao da carteira da execucao no banco. Em Contas a Pagar, quem possui `financeiro.fila_pagamentos.preparar` seleciona titulos abertos e os encaminha para a fila; o operador pode ter acesso somente a essa tela pelas permissoes do grupo `financeiro.fila_pagamentos`.

- a tela operacional e uma tabela responsiva com rolagem horizontal, sem modal de baixa;
- cada linha mostra titulo, credor/favorecido, documento, PIX ou codigo do boleto, vencimento, saldo e forma de pagamento;
- o operador informa a forma efetiva, data da baixa, conta pagadora e valor pago; a empresa e derivada da conta e as regras existentes de caixa e intercompany continuam aplicadas;
- valor exato registra baixa total, valor menor registra baixa parcial e cria alerta de divergencia, valor maior nao baixa e permanece divergente;
- `NAO_PAGO` mantem o titulo aberto e exige motivo;
- a grade de Contas a Pagar mostra na propria linha os estados `Em fila de pagamento`, `Pagamento nao realizado` e `Pagamento divergente`;
- previsao de pagamento por cartao sem vinculo a fatura pode entrar na fila: o cartao e informado ao registrar a baixa. Credito quita o titulo e vincula a compra a uma fatura aberta; debito usa a conta vinculada. Titulos ja vinculados a fatura continuam no fluxo da fatura, sem segunda baixa;
- credito exige quitacao integral sem baixa anterior, pois a fatura soma o valor integral do titulo. Cartao, conta e forma devem ser compativeis;
- cheque proprio registra numero, emitente e demais dados do documento. Cheque de terceiro consome um cheque disponivel da carteira, com valor exato e empresa compativel, sem duplicar saida bancaria;
- rejeicoes atuais do proprietario aparecem em Nao pagos com motivo, somente para consulta; nao viram pagamentos executaveis nem permitem reabrir pela fila;
- o lote usa uma unica transacao e locks por titulo/item: se uma linha falhar, nenhuma baixa do lote e confirmada;
- uma chave de idempotencia protege criacao e processamento contra clique ou envio repetido.

Na tabela, trocar a forma de pagamento limpa a conta pagadora, que volta a
Selecione. Escolher um cartao continua preenchendo sua conta vinculada.
Cheque proprio usa modal com os campos compartilhados: Confirmar aplica os
dados ao rascunho da linha; Cancelar/Escape descartam somente a edicao do
modal, sem efetuar baixa. O botao de editar reabre os dados confirmados.
Cheque de terceiro continua sendo selecionado da carteira por empresa.
Acoes de abrir solicitacao/arquivos, consultar e anexar comprovantes usam
icones com tooltip e nomes acessiveis, preservando rotas e permissoes.

Permissoes independentes: `visualizar`, `preparar`, `baixar`, `reportar` e `resolver`. Elas nao liberam as demais telas do Financeiro.

Autorizadores nominais com `financeiro.autorizacoes_pagamento.decidir` podem revogar itens ou todas as autorizacoes de um lote, com motivo e passkey. A revogacao retira as entradas ativas da fila e retorna os itens a pendentes, preservando comprovantes, dossie e eventos. Baixa parcial/total, movimento financeiro registrado, pagamento bancario ativo ou ciclo mais recente impedem a operacao. Nao e um estorno.

A migration `202610080001_fila_pagamentos_instrumento.js` adiciona o instrumento efetivo na fila e a revisao da autorizacao no lote. Deve ser aplicada antes do backend atualizado. Nao insere cadastros ou pagamentos e nao deve ter suas colunas removidas depois do uso.

### Baixa com comprovante posterior

Registrar a baixa de um item pendente nao exige PDF. Conta, data, valor,
instrumento e justificativa de divergencia continuam obrigatorios conforme
as regras existentes. A baixa registra o movimento e atualiza o titulo e a
solicitacao pelo fluxo financeiro normal; faltar comprovante nao deixa o
pagamento aberto nem cria outro movimento.

O card Pendentes de comprovante fica imediatamente apos Pendentes. E um
recorte virtual `PENDENTE_COMPROVANTE`, nao um status gravado no banco:
lista itens BAIXADO, DIVERGENTE ou RESOLVIDO com movimento registrado e sem
hash/URL do primeiro PDF. O card pode sobrepor Baixados ou Divergentes;
os numeros nao devem ser somados como categorias exclusivas. Divergencia
acima do saldo sem movimento nao entra nessa pendencia. Uma baixa parcial
continua sendo divergente e aparece tambem na pendencia de comprovante.

O usuario pode anexar o primeiro PDF depois da baixa, pela linha com
`financeiro.fila_pagamentos.baixar` ou pela importacao com
`financeiro.fila_pagamentos.importar_comprovantes`. Esses caminhos gravam
somente o anexo: nao mudam valor, data, conta, instrumento, saldo, fatura ou
movimento ja registrado. O importador identifica o valor pago para itens
baixados, em vez de mostrar apenas o saldo zerado. Locks, hash de arquivo
e revalidacao do estado impedem vinculos repetidos; rejeicoes somente
consulta nao recebem anexos nem nova baixa. Consultar a fila continua
exigindo `financeiro.fila_pagamentos.visualizar`.

Anexar o comprovante retira o item desse recorte, sem remover o historico.
O PDF tambem e vinculado ao historico e aos anexos da solicitacao do titulo,
reutilizando a URL permanente no S3. Isso ocorre na transacao da baixa
quando o comprovante ja existe, ou na transacao de upload/importacao tardia.
Cada arquivo tem uma entrada `COMPROVANTE_ADICIONADO`, com IDs da fila,
titulo e movimento. Baixa parcial tambem recebe comprovante; divergencia
sem movimento so publica o arquivo quando a baixa for de fato autorizada.
Titulos sem solicitacao continuam somente na fila. Replay nao duplica
historico/anexo nem ressuscita arquivos removidos.

Registros antigos nao recebem backfill durante o deploy. O script
`backend/scripts/reconciliarHistoricoComprovantesFila.js` prepara conferencia
somente leitura por padrao, em lotes de ate 100 itens. A aplicacao separada
exige IDs revisados, hash da conferencia, superadmin ativo e opt-in
`ALLOW_PAYMENT_RECEIPT_HISTORY_RECONCILIATION=true`. Revalida sob locks e
registra auditoria na mesma transacao; nao altera valores, saldos, status,
datas ou movimentos. A execucao de escrita precisa de autorizacao propria.

Reabrir uma divergencia cria outro ciclo para o saldo, preservando o
pagamento e eventual pendencia de comprovante do ciclo anterior. A aprovacao
de baixa divergente acima do saldo continua exigindo comprovante; esta
entrega dispensa PDF apenas no registro regular dos itens pendentes.

Nao requer migration, variavel ou permissao nova. Testes sem banco:
`npm run test:fila-instrumentos` e `npm run test:fila-comprovante-pendente`
no backend; `npm run test:fila-instrumentos-ui` no frontend (Chrome/Playwright,
APIs simuladas). Homologar PDF real e baixa no ambiente dev antes de producao.

### Analise do proprietario e envio independente

Solicitar autorizacao exige `financeiro.autorizacoes_pagamento.preparar`.
Enviar para pagamento exige somente `financeiro.fila_pagamentos.preparar`,
em OFF, PILOT, ENFORCED e PAUSED. As permissoes sao independentes: quem
possui ambas ve os dois botoes. O envio direto usa a confirmacao habitual,
sem declaracao de autorizacao em papel ou permissao adicional. A auditoria
registra o responsavel pelo envio, sem simular assinatura do proprietario.

O status interno nativo `EM ANÁLISE DO PROPRIETÁRIO` pode ser aplicado
individualmente ou em massa com `financeiro.titulos.status_interno`.
Preparar um dossie digital aplica o mesmo status e atualiza as solicitacoes
vinculadas, sem mudar o setor, saldo ou status financeiro. Analise nao
significa autorizacao nem baixa. O ingresso efetivo na fila muda o status
interno para `ENVIADO PARA PAGAMENTO` e encaminha a solicitacao ao Financeiro.
Rejeicao ou invalidacao digital sinaliza ajuste; estados finais sao preservados.

A camada digital usa PWA, passkey, dossie isolado, segregacao entre preparador
e autorizador, revalidacao material e reuso transacional da fila atual.
Dossie ativo nao impede o envio direto pela permissao da fila. Os dois
caminhos reutilizam a entrada ativa do titulo, sem duplicar fila, baixa ou
comprovantes. Na mesma transacao do envio, o item do dossie recebe
`ENFILEIRADO` e `fila_item_id`; a auditoria distingue `ENVIO_DIRETO` de
`AUTORIZACAO_DIGITAL`, sem atribuir uma decisao por passkey ao envio direto.
Lotes com pendencias continuam `AGUARDANDO`; sem pendencias nem itens
autorizados por enfileirar, ficam `CONCLUIDO` quando existe item na fila.

A tela de autorizacoes mostra `Na fila de pagamento` e a referencia da fila.
Atualiza pelo botao Atualizar, ao retornar a janela e a cada 30 segundos
enquanto visivel e sem operacao em andamento. A atualizacao preserva as
desmarcacoes dos itens ainda pendentes e descarta respostas antigas. O aviso
do envio direto informa quantos titulos foram criados, ja estavam na fila
ou ja foram processados no replay da mesma chave, sem anunciar novo envio.

Validacoes isoladas: `npm run test:fila-autorizacao-convergencia` no backend
e `npm run test:fila-autorizacao-convergencia-ui` no frontend (Playwright e
Chrome). Nao requer migration, variavel ou permissao nova.
O contrato, configuracoes e limites estao em
[`AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`](./AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md).

Em OFF ou PAUSED, o botao de solicitar autorizacao permanece visivel para
quem tem a permissao, mas desabilitado. A marcacao manual de analise e o
envio direto continuam disponiveis pelas suas proprias permissoes. Este
ajuste nao exige migration, variavel nova ou seed de status em producao.

### Consulta dos lotes de autorizacao

Os lotes novos recebem `LOTE-<id>` na mesma transacao da criacao, usando o ID
auto-incrementado, sem contador paralelo ou `MAX+1`. Replay conserva o lote;
rollback pode deixar lacunas naturais na sequencia. A tela tambem usa esse
rotulo para legados, sem reescrever seus codigos, documentos ou hashes. Data,
criador e codigo persistido ficam acessiveis em Registro do lote.

No PWA instalado (standalone Android ou iOS), um autorizador nominal com
`enabled` e `can_decide` entra diretamente nas autorizacoes, tanto apos login
como ao acessar Inicio. O preparo de MFA continua prioritario. Navegador
comum e usuarios somente preparadores conservam a preferencia de tela inicial.
Somente essa rota usa o shell compacto: Conta mantem tema, perfil, notificacoes,
busca, modulos e saida; Opcoes mantem avisos e passkey. Sem passkey, o cadastro
fica visivel e a assinatura continua bloqueada. Dispositivos ficam recolhidos.
Guardas operacionais e auditoria continuam ativos; nenhuma permissao mudou.
Validar com `test:tela-inicial`, `test:autorizacao-pwa` e a suite da fila.

Lotes nao expiram operacionalmente: pendencias continuam aguardando decisao,
inclusive lotes antigos cujo `expira_em` esteja no passado. Esse campo e o TTL
de lote permanecem apenas como metadados de compatibilidade, sem migration ou
atualizacao em massa. A passkey continua exigindo um challenge valido de cinco
minutos, de uso unico; saldo, documentos, hash e elegibilidade sao revalidados.

A tabela destaca o codigo SOL e mantem TIT como referencia secundaria (ou
principal para titulo avulso). JUSTIFICATIVA fica apos STATUS e antes de
MOTIVO. Titulos de Solicitacao
de Compra e Compra Direta mostram somente o tipo no resumo, nao seus itens;
snapshots, documentos e descricoes originais nao sao alterados. A lista mostra
data de criacao em vez de expiracao. Mobile preserva as colunas por rolagem.

A lista limita os 100 lotes mais recentes, nao seus itens ou documentos. A
associacao do titulo e opcional e preserva o filtro de exclusao logica: quando
o titulo deixa de existir na consulta, o item e seu snapshot continuam no
historico. Isso evita uma juncao invalida na subquery paginada do Sequelize.
Lista e detalhe mantem as permissoes e regras de decisao existentes.

A justificativa e o texto atual da solicitacao de origem, consultado somente
para leitura pelo proprio endpoint de lotes, inclusive nos lotes antigos.
Nao usa a descricao do titulo nem revela itens de compra como alternativa.
Sem justificativa/origem disponivel, mostra `-`. Nao altera snapshots,
hashes, documentos, assinaturas, revisoes, status ou elegibilidade.

O trecho clicavel abre um modal com o texto integral e quebras de linha, sem
interpretar HTML. Fechar, Escape, clique no fundo e voltar do navegador/PWA
retornam a lista no mesmo lote e preservam a selecao. A entrada de historico
e temporaria na mesma rota; link direto sem historico fecha por substituicao
da query, sem sair da tela. O modal compartilhado nao muda o comportamento
de clique fora para seus outros consumidores.

Atualizar faz somente consultas e preserva lote/selecao ainda disponiveis.
O controle de sequencia ignora respostas antigas; nao prepara, autoriza ou
reenvia pagamentos. Revisao com `test:fila-autorizacao-convergencia-ui` e
`test:autorizacao-pwa` no frontend, com APIs simuladas. A consulta SQL real
simulada valida LEFT JOIN da solicitacao sem perder titulos avulsos/historico.

Validacao isolada com gerador SQL MySQL e hidratacao reais do Sequelize:
`npm run test:autorizacao-consulta-sql` no backend, tambem incluido em
`test:fila-instrumentos`. O transporte de banco e simulado, sem conexao ou
escrita. Nao requer migration ou mudanca de configuracao.

## Cheques de terceiros e baixa com multiplas fontes

Cheques recebidos de terceiros sao controlados em carteira de custodia, sem simular uma conta bancaria. O financeiro pode registrar/importar saldo legado, transferir a custodia entre empresas, depositar em conta da mesma empresa ou utilizar o cheque integralmente como um componente de uma baixa composta.

A baixa composta permite combinar Pix, transferencia, dinheiro, cartao e cheque conforme as formas ativas cadastradas, distribuindo cada fonte entre titulos `PAGAR` do mesmo credor e empresa. Preview, confirmacao e estorno sao atomicos, idempotentes e auditados. A baixa simples e a baixa em massa anteriores continuam disponiveis.

Regras, endpoints, permissoes e limites: [`CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md`](./CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md). Matriz operacional: [`MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md`](./MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md).

## Relatorios

- previsto: titulos `PREVISAO`, `ABERTO` ou `PARCIAL`, conforme periodo e data de corte;
- realizado: movimentos ativos;
- movimentos estornados nao compoem realizado;
- DRE por competencia e fluxo de caixa por movimento nao podem usar a mesma data sem regra explicita;
- Resultado de Obras deve refletir estorno imediatamente;
- toda agregacao deve permitir rastrear o lancamento de origem.

### Fluxo de caixa previsto x realizado

- historico planejado preserva o valor original do titulo para datas ja alcancadas;
- projecao futura usa o saldo ainda aberto e nao repete titulo quitado;
- realizado usa `data_movimento` e nunca trata data futura como baixa;
- comparativo limita previsto e realizado a mesma data de corte;
- datas futuras do realizado aparecem como indisponiveis, nao como zero acumulado;
- seletor oferece periodos historicos, atuais, futuros e intervalo personalizado;
- nas visoes por natureza, entradas sao verdes e saidas vermelhas; no comparativo,
  as cores distinguem previsto e realizado.

## Contrato de venda recebido por cheque

Quando a forma efetiva do contrato de venda e cheque, o titulo a receber deve nascer
quitado e o cheque permanece em carteira/custodia. A quitacao e o cadastro do cheque
sao atomicos e idempotentes. Devolucao do cheque reabre a obrigacao vinculada, sem
apagar a baixa ou a trilha anterior; os novos cheques podem compor nova baixa conforme
as regras da baixa composta.

## Conciliacao OFX

OFX serve para conferencia. Importacao bloqueia arquivo/transacao duplicada, sugere candidatos e exige confirmacao humana. Nao cria titulo nem baixa automaticamente.

Na conciliacao de transferencias, o sinal do OFX define o sentido financeiro: debito na conta atual significa conta atual para contraparte; credito significa contraparte para conta atual. Quando existir um unico lancamento pendente na outra conta, com mesma data e valor exatamente oposto, o sistema preseleciona a conta e vincula os dois OFX a uma unica transferencia. Empates permanecem manuais para evitar associacao indevida.

Conciliacoes podem ser estornadas pelo relatorio de Conciliacao bancaria quando o usuario possui `financeiro.conciliacao.estornar`. O fluxo reabre o lancamento OFX para conferencia manual e registra o motivo na auditoria. Transferencias sao canceladas, tarifas criadas pela conciliacao sao estornadas e vinculos com titulos, faturas ou movimentos preexistentes sao desfeitos sem apagar o registro financeiro original. O relatorio aceita filtros por periodo, conta, status, natureza, tipo de vinculo e texto do extrato.

Liberacoes e amortizacoes de credito rotativo sao registradas diretamente a partir do lancamento OFX pendente. Nao existe cadastro de linha de credito nesta fase: credito na conta gera `LIBERACAO_CREDITO_ROTATIVO` e debito gera `AMORTIZACAO_CREDITO_ROTATIVO`, sempre com valor e data derivados do extrato. Esses movimentos alteram o caixa, compoem o saldo de endividamento e aparecem nos relatorios de movimentacao, conciliacao e endividamento, mas nao recebem categoria financeira e nao compoem a DRE. O estorno devolve o OFX para `PENDENTE` e retira o movimento ativo dos saldos e relatorios.

Quando o banco credita a devolucao de uma tarifa ja registrada, o usuario usa `Acoes rapidas > Estorno de tarifa bancaria`. O sistema lista somente tarifas ativas da mesma conta, empresa e valor integral, com data igual ou anterior ao credito. A confirmacao cria `ESTORNO_TARIFA_BANCARIA` vinculado ao movimento original, reaproveita a categoria financeira e neutraliza caixa e DRE sem apagar nenhum dos dois registros. Uma tarifa nao pode receber dois estornos ativos; se houver mais de uma candidata, a escolha permanece manual e auditavel.

## Dependencias e risco

Recebe dimensoes de Parceiros, Empresas, Obras e Apropriacoes; recebe origens de Solicitacoes, Compras, Comercial e RH/DP; alimenta Obras, Provisionamento, Boletos, relatorios e Governanca. Qualquer mudanca em saldo, status ou movimento exige reconciliacao de todos esses consumidores.

## Idempotencia

Geracao de titulo, baixa, estorno, importacao OFX e conciliacao sao transacionais e protegidos contra repeticao. O frontend bloqueia duplo clique e o backend garante unicidade e estado valido.
