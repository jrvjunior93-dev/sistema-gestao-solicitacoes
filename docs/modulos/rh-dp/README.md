# Modulo RH/DP

## Gestao da solicitacao de pagamento pelo DP - 2026-10-15

- Modal oferece Remover da solicitacao por colaborador e Cancelar solicitacao
  completa, sem PATCH livre de status. Exigem DP autorizado a editar apuracao,
  mesmo escopo de obra e privacidade dos rascunhos. Com titulos gerados, exigem
  tambem as permissoes existentes de gerar titulos e preparar a fila.
- Motivo e revisao obrigatorios; transacao bloqueia solicitacao, titulos e fila.
  Remocao conserva a linha no snapshot como CANCELADO/removido, fora da tabela
  ativa e do vinculo de consulta do colaborador; nome/motivo ficam consultaveis.
  PUT/rascunho local nao pode ressuscitar a linha removida.
- Cancela salarios sem baixa e ajusta a parte individual do vale compartilhado,
  preservando os demais. Cancelamento integral valida TODOS antes de alterar
  qualquer um, cancela titulos/fila e marca CANCELADA. Nenhum pagamento ou anexo
  e apagado. Ha auditoria financeira e historico RH na mesma transacao.
- Baixa ativa/parcial, fila processada, bloqueios ou envio bancario impedem a
  acao. Estorno integral ja concluido pode permitir cancelar o saldo reaberto;
  movimentos e filas estornadas permanecem no historico. O fluxo nao estorna
  automaticamente. Repeticao apos sucesso nao duplica cancelamento/historico.
- Listagem mostra Codigo antes de Tipo no padrao (colunas personalizadas
  continuam respeitadas). Contagem de pagamento nao inclui linhas removidas.
- Consulta sem edicao (Obra ou pedido encerrado) nao fica suja por receber
  cadastro atualizado; Fechar nao executa salvar nem pede permissao de edicao.
  Autosave/fechar com edicoes legitimas continuam no fluxo editavel.
- Testes: validarRhPagamentoEnvioParcial.js, validarRhPagamentoSolicitacao.js,
  validarRhPagamentoSolicitacaoUI.mjs e validarRhPessoalAcoesIcones.mjs. Sem
  migrations RH ou escrita em banco real na implementacao local.

## Limite operacional da conferencia de pagamento - 2026-10-15

O autosave e as marcacoes Conferido usam limite dedicado de 300 salvamentos por
minuto, por usuario autenticado, agregado entre solicitacoes. Usuarios na mesma
rede nao disputam o limite de um mesmo IP. O limite generico de 60 operacoes
sensíveis nao e mais consumido pelos endpoints POST `/rh/pagamentos-solicitacao/salvar`
e PUT `/rh/pagamentos-solicitacao/:id`.

ACL, autor/DP, revisao, primeiro save idempotente, transacao, autosave com espera
e preservacao dos inputs permanecem. Envio para fila, revisao e exclusao continuam
com seus controles existentes. Sem bypass geral para DP/SUPERADMIN. Testes:
`validarSaldoCartaoSchemaLimiteDp.js`, `validarRhPagamentoSolicitacao.js` e
`validarRhPagamentoEnvioParcial.js`, todos isolados de banco/rede.

Para o percurso completo da tela Pessoal, suas permissões,
situações, cálculos e integração financeira, consulte o
[Guia operacional de Pessoal](GUIA_OPERACIONAL_PESSOAL.md).

## Papel

RH/DP e dono do cadastro funcional de colaboradores, documentos, vinculos, competencias, importacoes, apuracoes e fechamentos. Financeiro continua dono das obrigacoes monetarias e SST continua dono dos registros de saude e seguranca.

## Regras

- Admissao pela Obra: o formulario consulta GET
  `/rh/solicitacoes/empresas-admissao`, protegido por `rh_dp.solicitacoes.abrir`.
  Lista todas as empresas ativas somente com id/nome/CNPJ, sem filtro por obra.
  Nao concede acesso ao cadastro/gestao de empresas ou a outras areas. As rotas
  administrativas continuam restritas. Consulta sem escrita; falha de carga tem
  tentativa novamente no formulario. Sem migration. Testes locais:
  `node backend/scripts/validarRhAdmissaoCatalogo.js` e, no frontend,
  `node scripts/validarRhPessoalPorLocal.mjs --admissao`.

- Pagamento por solicitacao: previa e reabertura carregam salario/diaria e conta
  salario do cadastro atual, tanto para autor quanto DP, sem escrita na consulta.
  Atualizar cadastro no modal faz nova consulta sem descartar dias/faltas,
  percentuais, ajustes, observacoes ou reembolso. Mudanca cadastral invalida
  conferencia da linha; salvar/enviar revalidam a versao do cadastro sob lock.
  Conta salario sempre vem do servidor; outra conta e PIX personalizado sao
  preservados. PIX legado nao e substituido silenciosamente: Usar Pix do cadastro
  permite adotar a chave atual. Linhas enviadas/canceladas e titulos existentes
  conservam o snapshot. Sem mudar permissao, competencia, historico salarial
  ou antecipar vigencias futuras; usa a base corrente do cadastro.

- No hub de Colaboradores, Solicitacoes globais e um card separado para DP e
  demais usuarios com acesso global autorizado. Obras/Centros de Custo abre os
  cards de locais; abrir um local mostra seus colaboradores e suas solicitacoes.
  Usuarios de OBRA conservam o escopo estrito de suas obras, inclusive se
  acumularem setor DP; nao recebem o card global.
- Rascunho de pagamento por solicitacao e privado do autor, inclusive frente ao
  superadmin. Destaque em colaborador segue a mesma visibilidade da lista e do modal.
  Pagamentos coletivos sao reconhecidos pelas linhas do snapshot; consultas nao
  regravam rascunhos nem normalizam status legados no banco.
- Alteracao salarial pelo fluxo envia novo salario numerico, nao texto BRL.
- SUPERADMIN e DP autorizado podem ajustar salario no cadastro com vigencia e
  motivo obrigatorios, historico salarial e transacao/lock do colaborador.
  DP exige concessao nominal de rh_dp.colaboradores.editar e rh_dp.salario.aprovar;
  perfil administrativo/legado sozinho nao concede esta excecao. Usuario
  operacional OBRA que acumule DP segue bloqueado; demais usam solicitacao salarial.
- Ajuste nao altera titulos existentes; vigencia futura nao antecipa salario atual.
  Data anterior a admissao ou ao inicio do salario vigente e recusada. Correcao na
  mesma vigencia conserva evidencia do valor anterior/autor nas observacoes, sem
  criar intervalo negativo. Reenvio do mesmo valor nao cria historico adicional.

- Transferencias: a aba Todos Colaboradores lista todos os ativos, inclusive sem obra,
  com somente identificacao profissional. O local aberto nao filtra esse diretorio.
- Na lista Transferencias entre obras, os filtros de Situacao permitem marcar
  uma ou mais opcoes: Aberta (aguardando aprovacao), Rascunho, Aprovada, Rejeitada
  e Cancelada. Sem marcas, mostra todas as situacoes. Origem e Destino aceitam
  um local cada, incluindo centros de custo; a busca usa nome/matricula.
  Filtros combinam-se no servidor antes da contagem/paginacao, nunca substituem
  o escopo de acesso nem o local aberto. Alterar filtro volta a pagina 1;
  Atualizar, paginacao e polling conservam o recorte. Etiquetas removiveis e
  Limpar tudo retomam a consulta sem filtros, ainda dentro do acesso autorizado.
  A leitura de notificacoes permanece no escopo global/local existente, nao
  fica limitada apenas aos registros que corresponderam ao filtro visual.
- Destinos incluem Obras e Centros de Custo ativos. Origem em centro de custo
  tambem e aceita; vinculacao/responsavel/aprovacao, autor e escopo seguem iguais.
- Todos os usuarios vinculados a Obra, com rh_dp.solicitacoes.abrir, podem solicitar
  transferencias no diretorio de ativos, sem cadastro de responsavel. Participam
  pela origem quando vinculados a ela; caso contrario pedem para seu proprio destino.
- Na saida de colaborador do local vinculado, todos os destinos ativos ficam
  disponiveis, inclusive centros de custo sem vinculo do usuario. Aprova o
  responsavel/substituto do destino, DP ou SUPERADMIN. Na entrada de outra obra,
  o destino deve ser vinculado e aprova o responsavel da origem ou DP/SUPERADMIN.
  Transferencia entre dois locais de terceiros continua bloqueada. A origem
  vinculada prevalece na definicao do lado solicitante, mesmo quando o usuario
  tambem e responsavel apenas pelo destino.
- Usuario comum nao efetiva a lotacao: aprova o responsavel/substituto vigente da
  outra obra. Sem origem, aprova o responsavel do destino. DP/SUPERADMIN podem decidir
  por bypass administrativo; isso nao libera cancelamento de terceiros para DP.
- DP autorizado a abrir solicitacoes pode solicitar transferencias entre todos
  os locais ativos, com efetivacao automatica no mesmo ato, como SUPERADMIN.
  A excecao e determinada no servidor, nao por flag enviada pelo navegador;
  nao cria responsabilidade ficticia. Usuario operacional OBRA que acumule DP
  continua no escopo estrito, com aprovacao da outra obra.
- Autor nao aprova o proprio pedido pendente. Efetivacao administrativa DP/SUPERADMIN
  na abertura e auditada como automatica. Aprovacao automatica dos responsaveis
  por ambas as obras (ou destino sem origem) permanece. Vigencia na aprovacao,
  justificativa/historico, transacao/lock, duplicacao e datas da admissao preservados.
- Diretorio continua somente profissional; lista/detalhe de transferencias para
  usuarios comuns ficam nas obras vinculadas. Consulta global DP/SUPERADMIN nao
  amplia escopo de usuario operacional OBRA que acumule DP. Nao habilita operacoes
  salariais, documentos ou outras decisoes de RH.

- colaborador deve estar vinculado a empresa e possuir identificadores consistentes;
- lotacao em obra e periodo de vigencia precisam ser rastreaveis;
- documentos privados exigem permissao e URL assinada;
- importacoes registram arquivo, linha, resultado e erro;
- apuracao por competencia possui estados de rascunho, conferencia e fechamento;
- sabados, domingos e feriados usam calendario e local de trabalho documentados;
- fechamento bloqueia edicao direta; correcao cria revisao ou reabertura auditada;
- geracao financeira usa referencia unica por colaborador, competencia e verba;
- desligamento nao apaga historico nem documentos obrigatorios.
- usuario operacional do setor OBRA acessa somente a porta `Pessoal` do modulo;
- para usuario de OBRA, listas, detalhes, solicitacoes e jornada ficam limitados as obras vinculadas em `usuarios_obras`, inclusive quando a API e chamada diretamente;
- o cadastro geral de colaboradores, documentos, importacoes, fechamentos e relatorios permanece restrito ao RH/DP e aos administradores autorizados.

## Pessoal por local e conferencia por solicitacao

- Para usuarios do setor OBRA, o modulo RH/DP aparece no menu como
  `Colaboradores`, com descricao `Solicitações e Pagamentos`. Desde 11/10/2026,
  o DP tambem usa esse nome e a mesma entrada por locais. O id `rhdp`,
  as rotas e as permissoes permanecem os mesmos.
- O menu possui Obras / Centros de Custo, Documentos globais, Relatorios
  globais e Importacoes, conforme permissoes. Cadastro e Fechamentos continuam
  acessiveis por acoes na entrada de locais, URLs antigas e busca Ctrl+K.
- Usuarios do DP e usuarios operacionais entram em
  `Pessoal` pelas obras/centros vinculados. `Abrir` exibe Gestao de Colaboradores
  com Colaboradores, Solicitacoes, Transferencias, Eventos recorrentes,
  Documentos e Relatorios, conforme permissoes. Os tres ultimos nao ampliam
  as autorizacoes existentes: documentos e relatorios continuam restritos
  aos perfis autorizados. Transferencias incluem obras e centros de custo ativos.
- Documentos e Relatorios dentro de um local fixam `obra_id` em todas as
  consultas, inclusive ao limpar/atualizar filtros. Na entrada global nao
  ha local predefinido. Eventos e transferencias tambem aplicam o local no
  servidor, sem substituir o escopo de leitura do usuario; transferencias
  incluem origem ou destino e sua leitura nao marca avisos de outros locais.
- O DP autorizado pode editar o cadastro pelo icone da linha do colaborador,
  no mesmo formulario/endpoint de cadastro, sem sair do local selecionado.
- O primeiro icone de cada colaborador solicita pagamento individual. O botao
  acima da lista abre o envio coletivo do local. Competencia e vinculos
  historicos determinam quem pode ser informado; dias, faltas, acrescimos,
  descontos e observacao usam o mesmo servico de jornada ja existente.
- Os novos modais criam pedidos independentes mesmo no modo legado sem etapas:
  `solicitacao_independente=true` exige chave de idempotencia. Um envio posterior
  nao substitui o pedido de outro colaborador; repeticao da mesma chave/hash
  retorna o envio anterior. Correcoes continuam exigindo autorizacao do DP.
- O DP preserva o acesso legado a Jornada/Apuracao/Fechamentos. Ao abrir uma solicitacao de jornada, consulta
  e prepara explicitamente a apuracao daquela fonte, ajusta, marca Conferido,
  conclui a conferencia e fecha/gera titulos no mesmo modal. Abrir o modal nao
  grava nem recalcula. Permissoes de editar e fechar continuam separadas.
- A preparacao geral exclui linhas ja reservadas por apuracoes independentes.
  Apuracoes legadas compartilhadas sao somente leitura no modal; o atalho
  `Abrir consolidacao geral` preserva o tratamento multiobra, sem reconstruir
  registros ou pagar duas vezes a base mensal. Jornadas exclusivamente multiobra
  continuam exigindo todas as partes e consolidacao antes do fechamento.
- As flags 40/60 e gerencial v2 nao sao ativadas por esta alteracao. Titulos
  continuam sujeitos a empresa, categoria, PIX, conferencia, bloqueios de
  conversao contabil e protecoes financeiras existentes. Gerar nao e baixar.

Testes sem banco/rede externa: `node scripts/validarRhPessoalPorSolicitacao.js`
no backend e `node scripts/validarRhPessoalPorLocal.mjs` no frontend (tambem
com `--etapas` e `--gerencial`).

## Modal independente de pagamento (10/10/2026)

O modal `Solicitar pagamento` / `Conferir pagamento` usa o fluxo
`PAGAMENTO_POR_SOLICITACAO`, separado das apuracoes legadas descritas acima.
O botao da linha abre apenas aquele colaborador. A primeira coluna da tabela
permite marcar colaboradores ativos do mesmo local: o botao geral abre apenas
os marcados, ja selecionados no modal; sem marcacao abre todos do local.
Busca preserva a marcacao; trocar usuario/obra/filtro de obra limpa a selecao.
O rascunho guarda somente o grupo escolhido, tambem na conferencia do DP.
Mesmo usuario/local/grupo reabre seu rascunho sob lock, sem duplicar pedido;
grupos diferentes nao reaproveitam linhas ou edicoes de outro grupo.
Abrir o pagamento agora consulta uma previa em `POST /rh/pagamentos-solicitacao/preparar`,
sem criar registro/codigo/historico. Se ja existir rascunho proprio daquele grupo,
reabre-o apenas para leitura. Antes da primeira persistencia, editar, trocar de
aba ou fechar nao grava solicitacao. Campos podem permanecer na memoria local
do workspace, mas isso nao e um rascunho no banco.

Salvar ou marcar Conferido (na linha ou Aplicar aos selecionados) cria o
primeiro rascunho e salva os campos na mesma transacao, com chave idempotente
por tentativa e lock do local. Falha de validacao nao deixa rascunho vazio;
repeticao/duplo clique nao cria outro registro. Depois disso, o autosave existente
continua protegendo as edicoes. Enviar exige primeiro Salvar ou Conferido;
nao cria registro implicitamente. Campos cadastrais sao revalidados na criacao.

Cada autor, com permissao Abrir solicitacao de pessoal, pode usar Excluir
rascunho dentro do pagamento, com confirmacao. Somente RASCUNHO sem titulos
gerados: pedido enviado/aberto, parcial ou aprovado nao e excluido por essa acao.
Exclusao e logica/auditada: sai das listas e bloqueia detalhe/acoes, mas conserva
historico, autor e snapshot. Nem DP nem SUPERADMIN excluem rascunhos de terceiros.
Repetir a exclusao nao cria outro evento; novo pagamento apos excluir usa outra
chave, sem ressuscitar o rascunho anterior. Titulos/baixas existentes nao mudam.

Frontend e backend precisam ser atualizados juntos. Rotas novas: POST
`/rh/pagamentos-solicitacao/salvar` (primeiro save atomico) e DELETE
`/rh/pagamentos-solicitacao/:id/rascunho`. A rota POST antiga permanece compativel
para clientes legados; a tela atual nao a usa ao abrir. Sem migration.
Rascunhos legados sao preservados: os individuais que continham toda a equipe
nao sao cortados ou regravados; o novo botao cria um rascunho restrito separado.
O ajuste usa dados_json e nao exige migration.

Mensalista: salario base multiplicado pelo percentual 40%, 50%, 60% ou 100%; dias e
faltas sao informativos. Diarista: diaria multiplicada pelos dias informados;
faltas tambem sao informativas. Acrescimos e descontos informados entram no
liquido integralmente. Os controles de dias/faltas avancam de um em um.

50% esta disponivel na linha individual e em Aplicar aos selecionados, tanto
no grupo completo quanto no grupo de colaboradores marcados. Marcar 50% limpa
40/60; escolher 40/60/100% retira 50%. DIARIA nao usa percentuais e conserva
diaria x dias. O percentual fica no snapshot JSON da solicitacao; pagamentos
ja gerados nao mudam. Nao habilita parcelas automaticas 50/50 no cadastro nem
altera jornada/apuracao legadas. Backend e frontend devem ser atualizados juntos:
se o servidor nao confirmar 50% no salvamento, o envio fica bloqueado.
Testes locais: validarRhPagamentoSolicitacao.js (backend),
validarRhPagamento50UI.mjs e validarRhPessoalTransferencias.mjs (frontend).

Acrescimos e descontos usam mascara BRL durante digitacao, seguindo os
formatters compartilhados do sistema (digitos entram como centavos).
Apagar todo o campo mostra `R$ 0,00`; o PUT envia numeros, inclusive ao
normalizar campos vazios de rascunhos antigos, nunca strings com `R$`.
O calculo do liquido e as validacoes financeiras permanecem no dominio.

Reembolso de vale e opcional e solicitado pelo link `Solicitar reembolso`
sob o desconto. Digitar, pausar ou sair do campo nao abre modal, nem o envio
exige uma pergunta para descontos comuns. O link abre diretamente responsavel
e dados para pagamento; confirmar solicita o reembolso, cancelar/Voltar/Escape
conserva o desconto sem nova solicitacao de reembolso. Vales do mesmo
responsavel/empresa continuam agrupados em um titulo com discriminacao.
O modal permite informar o `Valor do reembolso`, em moeda, separado do desconto.
Deve ser positivo e nao ultrapassar o desconto daquele colaborador.
O rodape do editor tem apenas `Cancelar` e `Confirmar`. Cancelar/Voltar/Escape
descartam a edicao do modal sem apagar um reembolso anteriormente confirmado.
O desconto integral continua no liquido salarial. Somente o valor reembolsavel
entra na soma por responsavel/empresa e nas origens discriminadas do titulo.
Escolher o mesmo responsavel reutiliza dados bancarios, nao o valor de outra
pessoa. O DP pode ajustar o reembolso e reconferir a linha antes de enviar.
Pedidos legados sem valor explicito conservam o reembolso integral; titulos
ja gerados nao sao recalculados. Campo guardado em dados_json, sem migration.
Frontend e backend devem ser atualizados juntos. Antes do envio, a tela exige
que a resposta do salvamento confirme o valor; backend antigo que ignora a
parcela parcial bloqueia o envio, em vez de gerar reembolso integral indevido.
O retorno aos cards do local se chama `Voltar para Obras`, mantendo tambem
os centros de custo na mesma lista.

O salvamento automatico e em segundo plano, sem desabilitar campos ou substituir
edicoes em voo. Fechar, salvar manualmente e enviar aguardam a ultima gravacao;
falha conserva o formulario. Pagamentos ja gerados conservam o snapshot aprovado
e os titulos, sem recalculo retroativo. Nenhuma regra da jornada legada muda.
Detalhes e testes: [handoff de dias e salvamento](../../handoffs/2026-10-10-dp-dias-salvamento.md).

## Obra ou centro de custo no cadastro

O campo `Obra / centro de custo principal` usa autocomplete por codigo ou nome,
inclusive sem acentos, consultando `GET /obras?escopo=TODOS`. O filtro da lista
usa o mesmo catalogo e inclui centros de custo. O vinculo continua opcional e
grava o ID em `obra_id`, sem novo campo ou migration. Limpar a pesquisa retira
a selecao no formulario. Esc fecha primeiro as sugestoes, sem fechar o cadastro.

Consulta/edicao, admissao e fluxo formal permanecem para usuarios operacionais.
Na edicao de existente, somente SUPERADMIN altera obra/centro ou remove o local:
vigencia ate hoje e motivo obrigatorios, admissao/vinculo atual respeitados,
historico e autor preservados, sem antecipar lotacao futura nem recalcular titulos.
Transferencia pendente ou historico divergente bloqueia o ajuste. Correcao no
mesmo dia conserva evidencia do local anterior, sem intervalo negativo.
Demais usuarios veem o campo bloqueado e usam Transferencias entre obras.

Teste isolado da tela, catalogo HTTP local e persistencia simulada:
`node scripts/validarRhColaboradorCentroCusto.mjs` no frontend. Nao acessa banco
nem servicos externos.

## Exportacao e reimportacao de colaboradores

Em Colaboradores, `Exportar todos (Excel)` baixa todos os cadastros no escopo autorizado, inclusive inativos, afastados e, quando o acesso e global, colaboradores sem obra. Nao aplica os filtros atuais da tela. Exige a mesma permissao da consulta de colaboradores, aplica o escopo no servidor e registra a exportacao na auditoria de seguranca sem incluir dados pessoais no evento. O arquivo contem dados pessoais e financeiros e deve ser compartilhado somente com pessoas autorizadas.

`Baixar modelo (Excel)` e `Importar massa` exigem a permissao de gerenciar colaboradores. O modelo XLSX vem preenchido com todos os colaboradores cadastrados no escopo autorizado, inclusive inativos, afastados e, para acesso global, sem obra. Ignora os filtros da tela, nao traz cadastros ficticios e inclui uma aba de orientacoes. Modelo e exportacao podem ser ajustados e reimportados, preservando CPF, matricula e codigos como texto para nao perder zeros iniciais.

- `Tipo_Pagamento`: MENSALISTA ou DIARISTA. Modelos antigos com `Forma_Calculo_Gerencial` MENSAL/DIARIA continuam aceitos; informacoes contraditorias nas duas colunas sao rejeitadas.
- `Valor_Diaria`: valor positivo para diarista. O calculo automatico 40/60 fica desativado para esse regime.
- `Calculo_Vigencia_Inicio`: data efetiva da mudanca; obrigatoria quando `RH_JORNADA_40_60_ETAPAS=ON`, seguindo a mesma validacao temporal do cadastro normal.
- Para cadastrados, a importacao localiza pelo CPF e altera somente regime, diaria e pagamento automatico 40/60. Salario, identidade, obra, empresa e banco nao sao sobrescritos. Campos de calculo em branco preservam os valores atuais.
- Novos colaboradores continuam usando o fluxo de criacao. CPF/matricula conflitantes, CPF repetido no arquivo e registros fora das obras autorizadas sao rejeitados por linha.
- O resultado informa importados, atualizados, ignorados e erros. Cada linha usa a transacao do cadastro; erro de vigencia reverte a alteracao da linha. Reenviar uma linha sem mudancas nao cria registro nem historico duplicado.

APIs: `GET /rh/colaboradores/exportar-xlsx`, `GET /rh/colaboradores/modelo-xlsx` e `POST /rh/colaboradores/importar-massa`.

Validacao local, sem banco: `node scripts/validarRhColaboradoresPlanilha.js` no backend e `node scripts/validarRhColaboradoresPlanilha.mjs` no frontend.

## Primeira lotacao em obra

- a movimentacao `Vincular a uma obra` aplica-se ao colaborador ainda sem obra; quem ja esta lotado usa a aba `Transferencias entre obras`;
- para usuario de OBRA, a autorizacao da primeira lotacao e verificada contra a obra de destino vinculada ao usuario; o colaborador sem obra atual nao e rejeitado apenas por nao possuir lotacao anterior;
- o pedido de primeira lotacao e associado a obra de destino para que a lista e o detalhe respeitem o mesmo escopo; o vinculo efetivo do colaborador so muda na aprovacao;
- a acao inicial `Criar rascunho` grava o pedido e permite anexar documentos. Ela nao envia ao DP: o envio e uma etapa explicita na aba `Solicitacoes`. A tela bloqueia novo clique enquanto a criacao esta em andamento;
- a criacao preserva a verificacao de pedido em andamento para o mesmo colaborador, tipo e subtipo, e nao autoriza acesso a destino fora do escopo.

## Pagamento de mao de obra e jornada

- mensalistas podem ter percentuais gerenciais de 40% e 60% vinculados ao cadastro; diaristas usam o valor da diaria;
- o valor mensal do ticket e mantido no colaborador e o DP acompanha por competencia se houve geracao e pagamento;
- na jornada, a obra informa colaborador, empresa, cargo, dias trabalhados, faltas, acrescimos, descontos, observacao e decimo terceiro;
- a grade de envio nao exibe salario/diaria, seletor de empreitada, servico executado ou valor da empreitada. Novas linhas usam `NORMAL`; reenvios autorizados preservam os dados de empreitadas legadas. Historico, modelo Excel, importacao e calculos permanecem inalterados;
- em `Pagamento de Mao de Obra > Jornadas enviadas`, `Abrir jornada` consulta, sem alterar dados, as linhas originais do envio; `Ir para Apuracao` continua separado. A API valida a permissao de RH/DP e o escopo da obra antes de buscar a importacao vinculada;
- faltas sao informativas e nao geram desconto automatico;
- mensalista e calculado pelo salario da parcela aplicavel, acrescido dos valores e reduzido dos descontos informados; acrescimo ou desconto exige justificativa em observacao;
- diarista e calculado por dias trabalhados multiplicados pela diaria, mais acrescimos e menos descontos informados;
- o regime legado `EMPREITADA` continua exigindo servico executado e valor a pagar nos dados preservados; fichas ou fotos podem ser anexadas depois que a jornada existir;
- envio, consolidacao e geracao financeira precisam impedir duplicidade por competencia, colaborador e origem.

## Admissao e contatos adicionais

- o pedido de admissao permite informar, opcionalmente, um segundo telefone e um segundo endereco completo;
- o cadastro direto e a edicao pelo DP dentro do local tambem exibem os dois
  telefones e os dois enderecos, preservando os campos ao reabrir a ficha;
- admissao e cadastro mostram os dois telefones e os dois enderecos desde a
  abertura, sem botoes de adicionar/remover. Os campos secundarios permanecem
  opcionais; limpar seus campos no cadastro remove apenas os dados secundarios;
- DP e administradores podem usar `Usar o mesmo endereco` no cadastro/admissao:
  copia os sete campos e acompanha alteracoes enquanto marcado; desmarcar
  preserva a copia e libera edicao independente;
- Obra operacional nao tem opcao de copiar. Na abertura/reenvio da admissao,
  quando preenchido, o segundo endereco precisa ser diferente do primeiro:
  comparacao dos sete campos ignora caixa, acentos, espacos e pontuacao.
  API usa usuario autenticado e regras de setor existentes (nao flag do payload).
  Pedidos legados ja registrados continuam aprovaveis pelo DP;
- admissao usa FormSecao para identificacao/lotacao, contrato/calculo,
  contato, filiacao, enderecos e dados de pagamento, sem alterar permissoes,
  obrigatoriedade dos campos primarios, anexos ou fluxo de rascunho/checklist;
- os dados adicionais ficam no pedido para conferencia e, apos aprovacao, no cadastro do colaborador; o cadastro exige a migration de esquema `202610020001_rh_colaborador_contatos_adicionais.js` antes de usar esses campos;
- ao informar o segundo endereco, logradouro e municipio sao obrigatorios; o
  segundo telefone, quando preenchido, deve ter DDD e ser diferente do primeiro,
  ignorando mascara e prefixo brasileiro +55. Cadastro, edicao parcial, abertura,
  reenvio e aprovacao da admissao validam no backend; nenhum saneamento automatico
  de dados legados e feito. Edicoes nao relacionadas preservam o legado;
- o ajuste de 11/10/2026 reutiliza as colunas existentes, sem migration nova.
  Validacao isolada: `node scripts/validarRhColaboradorContatos.js` no backend
  e `node scripts/validarRhColaboradorContatos.mjs` no frontend.

## Colaborador em mais de uma obra

- cada obra envia somente a parte da jornada correspondente aos dias em que recebeu o colaborador;
- o DP recebe alerta quando existe vinculo com mais de uma obra na mesma competencia;
- a consolidacao ocorre em modal e une as partes em uma unica apuracao e em um unico titulo, preservando a distribuicao por obra nos detalhes;
- enquanto faltar uma das jornadas esperadas, o registro permanece pendente de consolidacao em vez de presumir dias automaticamente.

## Jornadas em etapas (implementacao em homologacao; desligada por padrao)

O redesenho gerencial v2 esta documentado em
`docs/handoffs/2026-10-03-rhdp-jornada-gerencial-v2.md`. Ele fica atras de
`RH_JORNADA_GERENCIAL_V2=ON` e `VITE_RH_JORNADA_GERENCIAL_V2=ON`, alem das
duas flags de etapas abaixo. O envio passa a escolher 40%, 60%, proporcional
ou diaria por colaborador, dentro da competencia. No proporcional, a base usa
divisor gerencial 30 e teto no salario mensal, reconhecendo mes integral quando
todos os dias do calendario foram informados. Nao ativar sem homologacao
integrada de apuracao, rateio, retorno e fechamento financeiro.
Na v2 mensal, a obra informa quantidades de dias por etapa (ou o total da
competencia/obra no proporcional), limitadas aos dias transcorridos e ao
vinculo. Datas individuais sao exigidas apenas para diarias; assim a protecao
contra dia repetido entre 40% e 60% e por soma de quantidades, nao por data.

- `RH_JORNADA_40_60_ETAPAS=ON` no backend e `VITE_RH_JORNADA_40_60_ETAPAS=ON` no build do frontend habilitam o fluxo. Nao ativar sem a migration `202610020002_rh_jornada_etapas_pagamento.js` e homologacao financeira em dev;
- mensalista com parcelamento automatico envia uma jornada de `ADIANTAMENTO_40` e outra de `SALDO_60` na competencia. O primeiro fechamento gera apenas 40% da base mensal; a segunda apuracao calcula a base mensal uma vez, agrega ajustes das duas jornadas e recorrencias uma vez, desconta os 40% ja fechados e gera apenas o saldo;
- o mesmo dia nao pode integrar as etapas de 40% e 60%. O periodo de cada etapa e derivado da competencia no backend, sem ajuste manual na tela; corrigir envio existente exige retorno autorizado pelo DP;
- cada envio de `DIARIA` e independente, com datas trabalhadas selecionadas por colaborador, importacao, apuracao e numero de titulo proprios. Nenhum dia pode ser reutilizado, e a soma nao pode ultrapassar os dias de vinculo transcorridos ate hoje;
- a planilha modelo reflete os campos editaveis da tela e ja traz a chave PIX cadastrada. Mudanca de chave requer nome e CPF valido do beneficiario, fica auditavel na apuracao e nao altera o cadastro do colaborador;
- enquanto houver retorno de jornada pendente ou autorizado, a apuracao nao pode ser gerada, conferida ou fechada. Fechamento ja concluido exige estorno antes de autorizar correcao, e apuracao conferida volta a rascunho com registro de auditoria;
- cada apuracao fecha com um vencimento unico e a categoria ativa `2.01.02.01 - Salarios e Ordenados`;
- a forma de calculo e o valor da diaria passam a ter vigencia datada. Mudanca durante um periodo exige jornadas separadas antes e depois da data efetiva; envios anteriores preservam o regime registrado na linha;
- na mudanca de mensalista para diarista no meio da competencia, o mensal vale ate a vespera da data efetiva, com divisor fixo de 30 dias (limitado a 30 dias). A partir da data efetiva, cada envio de diaria e independente. A apuracao calcula o proporcional mensal devido, subtrai os pagamentos mensais ja fechados e mostra o saldo ou credito a compensar com diarias da competencia. Um credito restante ao fim do mes nao migra automaticamente: o DP deve fazer acerto manual documentado. Por seguranca, fechamento financeiro com acerto misto ou credito fica bloqueado ate a apropriacao contabil por obra e fora de obra estar implementada e homologada; nao gera titulo incorreto nem negativo;
- a obra informa dias e ajustes somente do seu periodo. Para mensalista multiobra, o DP consolida por etapa; no fechamento dos 60%, os rateios de custo dos dois titulos sao reconciliados pelos dias das duas etapas. A baixa e o valor dos 40% nao mudam. O rateio anterior e registrado no fechamento e restaurado se os 60% forem reabertos;
- enquanto a flag estiver `OFF`, o frontend nao mostra etapas nem campo de vigencia, o backend rejeita envios/geracoes/fechamentos em etapa, e os fluxos legados permanecem disponiveis. O deploy ainda requer a migration antes do backend atualizado, pois o modelo inclui as novas colunas anulaveis. A conversao com compensacao e o rateio contabil dos titulos mistos precisam de homologacao integrada antes de ativar a flag.

## Pagamento por solicitacao: envio parcial e revisao (11/10/2026)

Este fluxo e o modal atual de Solicitar/Conferir pagamento, separado da
apuracao gerencial legada. Nao altera flags de etapas nem titulos de outros fluxos.

- O andamento e registrado por colaborador. Depois de enviar apenas uma parte,
  a solicitacao mostra **Envio parcial para pagamento** (`ENVIO_PARCIAL`) e permite
  selecionar, conferir e enviar os restantes, sem gerar os anteriores novamente.
  Ao enviar todos, permanece `APROVADA`; isso nao significa baixa financeira.
- O DP com permissao de conferir/gerar titulos e preparar a fila pode usar
  **Editar e reenviar** ou **Cancelar pagamento**, informando motivo. Escopo de
  obra/centro de custo e revisao otimista continuam obrigatorios no backend.
- Editar muda a solicitacao para `EM_REVISAO` e as linhas para `EM_EDICAO`.
  O titulo RH/DP recebe o marcador reservado `EM EDICAO DP`; o item da fila
  fica `EM_EDICAO`, destacado e sem baixa, novo envio ou edicao financeira
  generica. O bloqueio permanece ao fechar o modal. Reenvio apos conferencia
  atualiza os mesmos IDs de salario e fila, exige nova conferencia financeira
  e conserva comprovantes. Dados bancarios recebem snapshot independente.
- Revisar um reembolso agrupado bloqueia os salarios dos colaboradores
  envolvidos e o reembolso; todos precisam ser conferidos no reenvio.
  Se o responsavel/agrupamento mudar, o reembolso antigo deixa de ser pagavel
  e um novo pode ser criado, sem duplicar os salarios nem pagar ambos.
- Cancelar tira o pagamento da fila operacional, sem apagar seu registro,
  titulo, comprovantes ou historico. Num vale agrupado, remove somente a parte
  do colaborador cancelado e recalcula o restante; cancela o titulo do vale
  apenas quando nao restar contribuinte. Titulos desta jornada devem ser
  cancelados na solicitacao, nao pela exclusao generica do Financeiro.
- Qualquer baixa, inclusive parcial/estornada, ou pagamento bancario ativo
  impede revisao/cancelamento. Locks seguem titulo -> fila, com transacao,
  controle de revisao, replay e auditoria financeira/RH atomicos.
- Legados `APROVADA` com colaboradores sem titulo sao projetados como parciais
  na leitura/lista/filtro; nao ha reconciliacao ou escrita automatica na consulta.
  A Obra envia ao DP apenas os colaboradores selecionados no pedido novo.
  O contador de pedidos em aberto inclui parciais e em revisao. O recorte
  `EM_ANDAMENTO` da consulta agrega esses estados e `ABERTA`, sem ser status gravado.
- Estados cabem nas colunas STRING existentes; esta alteracao nao requer
  migration. `EM_EDICAO` conta como pendente no resumo da fila e possui filtro
  proprio. O indice gerado legado de fila ativa nao inclui esse estado;
  a reserva durante revisao e garantida pelo lock do titulo e a busca de
  estados ativos na API canonica, nao por uma promessa de novo indice SQL.
- Validacoes isoladas: `npm run test:rhdp-envio-parcial`,
  `node scripts/validarRhPagamentoSolicitacao.js`,
  `node scripts/validarRhPessoalPorSolicitacao.js` (backend), testes reais de UI
  `validarRhPagamentoSolicitacaoUI.mjs` e `validarFilaInstrumentosUI.mjs`.

## Ticket de beneficio

- o DP seleciona colaboradores ativos com valor de ticket configurado e ainda sem lote na competencia;
- o lote calcula o total e permite escolher Boleto ou Pix, mantendo categoria, vencimento e conferencia normal pelo GEO;
- Boleto exige fornecedor e arquivo: gera um titulo para o fornecedor com rateio gerencial pelas lotacoes e anexo `BOLETO`, disponivel no modal de documentos da fila;
- Pix exige revisao explicita das chaves dos colaboradores selecionados e gera um titulo e snapshot de favorecido por colaborador, com sua empresa e lotacao. A chave revisada nao altera o cadastro nem pagamentos anteriores;
- a operacao exige `rh_dp.ticket.gerar`, chave de idempotencia e protecao contra multiplos envios;
- o status individual usa o titulo vinculado ao item; lotes antigos continuam consultando o titulo do lote. A liberacao GEO abrange todos os titulos; cancelar/rejeitar nao cancela o lote quando algum titulo ja recebeu baixa;
- a migration `202610130001_rh_ticket_pix_colaboradores.js` acrescenta apenas colunas anulaveis e indice, sem backfill de registros. Deve preceder a atualizacao do backend; nesta entrega foi somente preparada e testada com adaptadores isolados;
- testes locais: `backend/scripts/validarRhTicketPix.js` e `frontend/scripts/validarRhTicketPix.mjs`, alem das regressoes de pagamento, escopo RH/DP, Pix, fila e contatos. Handoff: `docs/handoffs/2026-10-13-ticket-boleto-pix-colaboradores.md`.

## Eventos recorrentes

- a obra solicita inclusao ou alteracao pelo fluxo de solicitacoes; o DP decide e cadastra o evento que passa a compor a gestao recorrente;
- usuario de obra consulta apenas eventos aprovados de colaboradores vinculados as obras às quais possui acesso;
- a gestao completa, edicao e desativacao permanecem condicionadas às permissoes de RH/DP;
- a API repete o filtro de obras e permissoes, sem depender apenas de ocultacao na interface.

## Integracoes

Empresas e Obras fornecem lotacao. Financeiro recebe obrigacoes homologadas. SST recebe colaborador, funcao e ambiente de trabalho, mas administra riscos, exames, EPI e acidentes em seu proprio dominio.

## Seguranca

Dados pessoais, documentos e remuneracao exigem menor privilegio. Exportacoes precisam respeitar escopo e ser auditadas. Logs nao devem expor conteudo sensivel.

## Mudanca segura

Testar cadastro, vinculos temporais, documentos, importacao, jornada mensalista/diarista/empreitada, faltas informativas, acrescimos e descontos, decimo terceiro, consolidacao multiobra, ticket, eventos recorrentes, apuracao, fechamento, reabertura, geracao financeira, SST, escopo por obra e relatorios.

## Recebimento em dinheiro e relatorio de envios (2026-10-15)

- No pagamento por solicitacao (individual, todos ou selecionados), DINHEIRO
  conserva nome/CPF-CNPJ e nao exige nem inventa Pix, banco, agencia ou conta.
  Exige forma financeira DINHEIRO ativa ao enviar ao financeiro. Nao cadastra
  formas automaticamente, nao cria favorecido bancario falso e nao altera as
  permissoes, revisao/conferencia, geracao atomica/idempotente ou regra de baixa.
  Tambem compativel com o editor de reembolso, mantendo sua identificacao.
- Relatorios > Titulos enviados pelo DP: GET /rh/relatorios/titulos-enviados.
  Requer acesso ao dashboard/relatorios do RH/DP e rh_dp.relatorios.visualizar,
  mantendo bypass administrativo e escopo de obras existentes. Obra nao ganha
  acesso ao relatorio global por abrir solicitacao. Consulta nao libera titulos,
  solicitacoes, documentos ou baixa de outros modulos.
- Lista todos os titulos RH_DP/RH_DP_TICKET com registro real na fila (sem corte
  de 500), preservando a exclusao logica normal dos titulos. Mostra codigo,
  solicitacao DP quando identificada, competencia, credor, empresa/obra,
  recebimento, valor/baixado/saldo, status financeiro e situacao atual da fila.
  Registros de fila anteriores/cancelados/estornados ficam consultaveis; data de
  entrada nao e auditoria completa de cada revisao sobre a mesma linha de fila.
- Filtros: competencia, empresa, local, recebimento, status financeiro, situacao
  atual da fila, busca e somente possiveis duplicidades.
- Alerta de duplicidade: titulos salariais ativos distintos com mesmo colaborador,
  competencia, empresa, percentual e valor. Nao trata 40% e 60%, empresas distintas,
  vales/pensao ou repeticao do mesmo id como duplicidade. Outros casos exigem
  conferencia manual. Exibe codigos relacionados sem cancelar ou bloquear nada.
- SQL/GET nao grava. Usa tabelas/JSON existentes, sem nova migration/backfill;
  legado sem modo identificavel fica nao informado. O relatorio nao devolve conta,
  CPF, chave Pix ou JSON bancario da baixa.
- Validar com test:rhdp-titulos-enviados, validarRhTitulosEnviadosUI.mjs e suites
  de pagamento/fila. Homologar com dados reais em dev antes de publicar producao.
