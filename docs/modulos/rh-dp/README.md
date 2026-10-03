# Modulo RH/DP

Para o percurso completo das sete abas da tela Pessoal, suas permissões,
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
- em `Pagamento de Mao de Obra > Jornadas enviadas`, `Abrir jornada` consulta, sem alterar dados, as linhas originais do envio; `Ir para Apuracao` continua separado. A API valida a permissao de RH/DP e o escopo da obra antes de buscar a importacao vinculada;
- faltas sao informativas e nao geram desconto automatico;
- mensalista e calculado pelo salario da parcela aplicavel, acrescido dos valores e reduzido dos descontos informados; acrescimo ou desconto exige justificativa em observacao;
- diarista e calculado por dias trabalhados multiplicados pela diaria, mais acrescimos e menos descontos informados;
- o regime `EMPREITADA` exige servico executado e valor a pagar; fichas ou fotos podem ser anexadas depois que a jornada existir;
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
