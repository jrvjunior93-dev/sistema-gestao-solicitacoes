# Mapa de datas e plano de padronizacao

## Escopo desta etapa

Pedido do usuario2026-10-18: primeiro mapear, antes de modificar os muitos
campos do sistema. Nenhum componente global, obrigatoriedade antiga, coluna,
registro ou importacao foi migrado/corrigido automaticamente. O relatorio novo
de permutas usa o modo segmentado ja existente, sem mudar seu default global.

Inventario integral do codigo analisado:

- [Lista por arquivo e linha](INVENTARIO_CAMPOS_DATAS.md).
- [Dados estruturados, rotulos, handlers e conversoes](inventario-campos-datas.json).
- Geracao: `node frontend/scripts/mapearCamposDatas.mjs`.
- Prova: `node frontend/scripts/validarMapaCamposDatas.mjs`.

Na primeira etapa concluida:1821arquivos,160declaracoes de controles
compartilhados,19controles nativos,83configuracoes dinamicas de data e14inputs
de tipo dinamico a revisar.875declaracoes DATE/DATEONLY:370nos modelos e505nas
migrations historicas; nao representam875colunas distintas do banco atual.
2262referencias de conversao foram identificadas; nenhum erro de parser.
Esses numeros sao de declaracoes estaticas, nao uma contagem de inputs em uso
ou de registros. Configuracoes podem gerar multiplos campos. createdAt/updatedAt
implicitos do ORM e campos externos/importados exigem cruzamento do contrato.

## Padroes encontrados

| Camada | Padrao existente | Risco / proxima verificacao |
|---|---|---|
| DateInputBR | Exibe DD/MM/AAAA, emite ISO, limita8digitos; calendario e min/max no cliente | Edicao segmentada e opt-in; fora dela a mascara reconcatena digitos. Quatro digitos nao impedem o ano0226 |
| editarDataBR | Substitui posicoes de dia/mes/ano sem deslocar os outros segmentos | Apenas os dois campos de filtros PWA anteriores usavam o opt-in; novo relatorio adiciona dois. Testar selecao, colagem, teclado nativo e exclusao antes de ampliar |
| CompetenciaInputBR / month | Mes/ano, nao uma data de um dia | Preservar competencia; nao substituir indiscriminadamente por DD/MM/AAAA |
| date nativo | Tres declaracoes remanescentes | RH/DP e adiantamento, formato/comportamento depende do navegador |
| datetime-local | Tres declaracoes | CRM, liberacao temporaria e prazos. Tem hora/fuso, nao equivale a DATEONLY |
| BarraFiltros / formularios dinamicos | Configuracoes tipo=date e controles gerados | Preservar nome/value/onChange/min/max/required e submit. Conferir por tela, nao so no componente generico |
| dateLocal.js | parseDateSmart, Date local ao meio-dia para DATEONLY | Valida existencia do Date, mas pode normalizar dia/mes impossivel. Display nao prova valor original recebido |
| dataOperacional.js | Hoje em America/Sao_Paulo | Ha outros usos de toISOString().slice(0,10), que usam dia UTC. Nao substituir timestamps reais por dia operacional |
| validators financeiros | parseDateOnly por regex e Date valido | Nem todos fazem round-trip de calendario/limites do ano; cliente/API/importacao podem divergir |
| importadores | ISO, BR, serial Excel e conversao UTC/local | Nunca truncar/normalizar automaticamente a data invalida; definir erro por linha e preservar origem |
| modelos/schema | DATEONLY e DATE, nullable variados | Separar data civil de instante. Obrigatoriedade do banco nao substitui regra de cada fluxo |

## Caminhos criticos ja cruzados

| Operacao | Campo / controle | API / gravacao | Regra a preservar |
|---|---|---|---|
| Baixa no detalhe do titulo | FinanceiroTituloDetalhe, baixaForm.data_movimento, DateInputBR | POST /financeiro/titulos/:id/baixas, validateFinanceTituloBaixaBody, baixarTitulo -> MovimentoFinanceiro.data_movimento e TituloFinanceiro.data_quitacao | Escopo, titulo aberto/parcial, data da baixa efetiva; nao trocar por emissao/vencimento |
| Baixa em massa | FinanceiroTitulos, baixaMassaForm.data_movimento | Servicos de baixa simples/parcelada atuais | Preservar parcela/cartao/cheque e vencimentos individuais |
| Fila | FinanceiroFilaPagamentos e BaixaMassaFilaModal, data_baixa | validateManualPaymentQueueProcessBody, processarItemFila -> payload data_movimento | Encargos, data do pagamento, status, comprovantes, idempotencia e estorno |
| Multiplas fontes | BaixaCompostaModal, dataMovimento | /financeiro/baixas-compostas, chequeTerceiroService.dataOnly -> baixas do grupo | Uma transacao, alocacoes e estorno integral |
| Filtros do proprietario | AutorizacoesPorObra, vencimento_inicio/fim e data_tipo | pagamentoAutorizacaoConsultaService | Emissao/vencimento/pagamento independentes; sem datas todo periodo, datas isoladas validas |
| Novas permutas | FinanceiroPermutas, data_inicio/fim | /financeiro/permutas/relatorio -> MovimentoFinanceiro.data_movimento | Consulta por data da baixa, legado0226 visivel sem correcao; sem limite de acordo |
| Pedido de admissao | Formularios RH e configuracoes dinamicas do inventario | rhValidators, colaborador/solicitacao de pessoal | Admissao opcional; inicio efetivo obrigatorio no pedido, sem inventar data ao aprovar |
| Compras | NovaSolicitacaoCompra/PedidoCompraFinanceiro, necessario para, frete e vencimentos | Pedido/solicitacao/titulos, contratos de cada servico | Nao confundir previsao de entrega, data da compra e vencimento financeiro |
| Contratos/medicao | BlocoContratoFluxoNovo/BlocoMedicaoContrato/ModalAditivoContrato | Contratos, medicoes e titulos vinculados | Vigencia, competencia e parcela sao datas distintas; preservar reprogramacao |

Os demais controles, configuracoes, campos de modelo e conversores estao no
inventario, incluindo RH, fiscal, comercial, provisoes, custos/recebiveis, CRM,
SST e configuracoes. O cruzamento manual de TODOS os endpoints e formularios
dinamicos continua necessario antes da padronizacao global. O inventario
estatico nao confirma quais campos foram preenchidos em uma sessao real.

## Registro0226 da auditoria

A saida fornecida pelo usuario mostrou MovimentoFinanceiro2602,
TIT-003834, data_movimento0226-05-22. O usuario informou que a data pretendida
e2026. A consulta usou dateStrings e retornou esse valor do banco; nao e
suficiente atribuir o problema apenas a formatacao da tela ou afirmar que o
operador digitou errado. Sao necessarios historico/origem/importacao para
determinar onde houve a alteracao. Nenhum dado foi corrigido nesta tarefa.

## Padrao proposto para a etapa seguinte

1. Data civil: exibir DD/MM/AAAA, guardar AAAA-MM-DD, sem conversao de fuso.
   Edicao posicional, ano com quatro digitos, colagem BR/ISO, teclado mobile,
   texto parcial sem submit e validacao de calendario completa no servidor.
2. Limite de ano por dominio, nao um corte arbitrario global: financeiro/RH
   devem rejeitar ano0226 em novos lancamentos operacionais, sem reescrever
   legado nem impedir sua consulta. Confirmar intervalos com os responsaveis.
3. Competencia continua mes/ano. Instantes preservam hora/fuso e sao exibidos
   no fuso operacional definido. Nao usar slice de timestamp como regra civil.
4. Migrar por fluxo: baixas/fila/recebimentos; emissao/vencimento; RH; compras/
   contratos; demais modulos. Validar permissoes, submit, filtros, anexos,
   rascunho, autoaplicacao, navegacao e integracoes a cada lote.
5. Testes: limites do ano, ano bissexto,31/02, exclusao/substituicao de um
   segmento, colagem, limpar parcial, BR/ISO/Excel, fuso/proximidade da meia-noite,
   datas opcionais, obrigatorias e historicas. Nao executar teste com escrita
   em producao ou corrigir dados com migration de estrutura.
