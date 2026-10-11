# Modulo RH/DP

Para o percurso completo da tela Pessoal, suas permissões,
situações, cálculos e integração financeira, consulte o
[Guia operacional de Pessoal](GUIA_OPERACIONAL_PESSOAL.md).

## Papel

RH/DP e dono do cadastro funcional de colaboradores, documentos, vinculos, competencias, importacoes, apuracoes e fechamentos. Financeiro continua dono das obrigacoes monetarias e SST continua dono dos registros de saude e seguranca.

## Regras

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
  `Colaboradores`, com descricao `Solicitações e Pagamentos`. O id `rhdp`,
  as rotas e as permissoes permanecem os mesmos; demais setores conservam
  o nome RH/DP. Rotulo/descricao sao resolvidos na fonte unica de navegacao.
- Usuarios operacionais fora do DP e dos perfis administrativos entram em
  `Pessoal` pelas obras/centros vinculados. `Abrir` exibe Gestao de Colaboradores
  com Colaboradores, Solicitacoes e Transferencias entre obras, nessa ordem.
- O primeiro icone de cada colaborador solicita pagamento individual. O botao
  acima da lista abre o envio coletivo do local. Competencia e vinculos
  historicos determinam quem pode ser informado; dias, faltas, acrescimos,
  descontos e observacao usam o mesmo servico de jornada ja existente.
- Os novos modais criam pedidos independentes mesmo no modo legado sem etapas:
  `solicitacao_independente=true` exige chave de idempotencia. Um envio posterior
  nao substitui o pedido de outro colaborador; repeticao da mesma chave/hash
  retorna o envio anterior. Correcoes continuam exigindo autorizacao do DP.
- O DP preserva suas abas globais. Ao abrir uma solicitacao de jornada, consulta
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
Rascunhos legados sao preservados: os individuais que continham toda a equipe
nao sao cortados ou regravados; o novo botao cria um rascunho restrito separado.
O ajuste usa dados_json e nao exige migration.

Mensalista: salario base multiplicado pelo percentual 40%, 60% ou 100%; dias e
faltas sao informativos. Diarista: diaria multiplicada pelos dias informados;
faltas tambem sao informativas. Acrescimos e descontos informados entram no
liquido integralmente. Os controles de dias/faltas avancam de um em um.

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

As permissoes de consulta/edicao, datas de admissao/vigencia e o fluxo formal
de transferencia permanecem inalterados: selecionar outro destino na edicao
nao dispensa a solicitacao de transferencia exigida pelo backend.

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
- os dados adicionais ficam no pedido para conferencia e, apos aprovacao, no cadastro do colaborador; o cadastro exige a migration de esquema `202610020001_rh_colaborador_contatos_adicionais.js` antes de usar esses campos;
- ao informar o segundo endereco, logradouro e municipio sao obrigatorios; o segundo telefone, quando preenchido, deve ter DDD.

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

## Ticket de beneficio

- o DP seleciona colaboradores ativos com valor de ticket configurado e ainda sem lote na competencia;
- o lote calcula o total, recebe fornecedor, categoria, vencimento e boleto e cria a solicitacao normal para o fluxo do GEO;
- o custo permanece associado a lotacao de cada colaborador para rateio gerencial;
- a operacao exige `rh_dp.ticket.gerar`, chave de idempotencia e protecao contra multiplos envios;
- o status do ticket e derivado do titulo financeiro: pendente, pago ou cancelado conforme o estado efetivo da obrigacao.

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
