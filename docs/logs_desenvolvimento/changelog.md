# Changelog Documental e Operacional

## 2026-10-07 - Cartao opcional ao criar titulo pela solicitacao

- cartao de credito/debito pode ser informado somente na baixa posterior;
- sem cartao, titulo ABERTO sem movimento ou fatura; com cartao, quitacao automatica existente preservada;
- campo identificado como opcional e ajuda contextual na aba Financeiro;
- lancamento manual, escolha de PREVISAO, permissoes e validacoes da baixa preservados;
- testes locais com servico real isolado e formulario real com APIs simuladas; sem banco real ou deploy.

## 2026-10-07 - Recargas multiplas por obra e centro de custo

- preparado fluxo de recarga em subtipo do tipo fixo do Centro de Custo;
- cartoes vinculados a varias origens, acessiveis a quem possui acesso normal a origem;
- uma solicitacao com valores, titulos, prestacoes e anexos separados por cartao;
- agregado PARCIALMENTE PAGO ate todos os cartoes serem integralmente pagos;
- retorno financeiro somente depois dos pagamentos do conjunto, preservando o setor criador do Centro de Custo;
- migration exclusivamente estrutural, sem seed ou atribuicao automatica de cartoes;
- entrega local validada com mocks e browser isolado, ainda sem deploy.

## 2026-07-20 - Importacao em massa de contas a pagar

- implementados modelo XLSX versionado, referencias por escopo, preview persistido e erros por linha;
- modelo atualizado para a versao `1.3`, usando `empresa_codigo`, `obra_codigo`, `credor_cpf_cnpj`, `categoria_nome` e `apropriacao_codigo`, sem expor IDs internos;
- implementada confirmacao atomica com idempotencia, revalidacao e auditoria;
- adicionados os comandos `Exportar modelo` e `Importar planilha` em Contas a Pagar;
- definida a obra como origem da empresa e do custo, permitindo colaborador credor cadastrado em outra empresa;
- adicionada `financeiro.titulos.importar`, elevando o catalogo para 270 permissoes;
- registrada a migration obrigatoria `202607200001_financeiro_titulos_importacao.js`.

## 2026-07-20 - Alinhamento do runtime e plano de importacao financeira

- atualizadas as metricas para 18 grupos, 80 areas e 269 permissoes;
- documentado que novas solicitacoes e compras seguem diretamente para o setor operacional, mantendo o fluxo de diretoria somente como compatibilidade de registros antigos;
- documentadas rodadas de fechamento parcial/final de cotacoes, saldo remanescente, idempotencia e vinculo dos pedidos ao fechamento;
- alinhado o motor de pagamentos a uma aprovacao por usuario diferente do criador do lote;
- registrado o plano seguro para importacao em massa de contas a pagar, sem implementacao de runtime nesta etapa.

## 2026-07-13 - Revalidacao documental contra o runtime

- catalogo de modulos, registro de permissoes, rotas, controladores, guards do frontend e mudancas recentes foram confrontados com os documentos canonicos;
- corrigido o fluxo de Compras para remover integracao externa e liberacao manual como pre-requisitos de cotacao;
- documentados compra direta, cadastro de credor, rateio por quantidade, cancelamento logico e preservacao historica;
- documentados itens por fornecedor, validacao de pertencimento, rascunho/resposta interna, comparativo e finalizacao transacional das cotacoes;
- atualizada a autorizacao para 18 grupos, 80 areas e 268 permissoes, incluindo padroes por setor/perfil e bloqueios individuais;
- criado inventario unico de codigo descontinuado ainda presente no runtime e do SST em transicao;
- validador documental passou a confrontar o catalogo de modulos e as metricas do registro de permissoes com a documentacao canonica.

## 2026-07-12 - Redefinicao do modulo SST

- SST redefinido como modulo documental simples;
- escopo limitado a PCMSO, PGR, exames, ASO, EPI, treinamentos ocupacionais, LTCAT e avaliacoes quantitativas;
- anexos previstos para todas as entidades do novo escopo;
- removida da documentacao a conexao com sistemas governamentais;
- removidos documentos antigos de fases, IA, automacoes e operacao enterprise;
- criado plano obrigatorio de inventario, migracao, simplificacao e remocao segura do codigo legado;
- nenhuma remocao de runtime ou banco executada nesta etapa.

## 2026-07-12 - Consolidacao documental

- removidos documentos ligados a estrategias e integracoes descontinuadas;
- removidos materiais de posicionamento e distribuicao do produto;
- definida documentacao canonica por modulo;
- criado mapa de dependencias e propriedade dos dados;
- documentadas regras transversais de idempotencia e transacoes;
- documentos de fase, sprint e relatorio passaram a ser tratados apenas como historico;
- corrigida a descricao do runtime para migrations controladas, sem `sync({ alter: true })` normal.

## Regra de manutencao

Mudancas futuras devem atualizar o documento canonico do modulo no mesmo commit. Este arquivo registra apenas alteracoes percebidas na operacao ou na governanca documental.
