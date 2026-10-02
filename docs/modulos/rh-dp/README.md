# Modulo RH/DP

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
