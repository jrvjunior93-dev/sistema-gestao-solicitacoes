# Mapa de Modulos e Dependencias

Este documento define as dependencias que precisam ser avaliadas antes de alterar um modulo.

## Nucleo operacional

| Modulo | Recebe de | Entrega para | Risco principal |
|---|---|---|---|
| Solicitacoes | usuarios, setores, obras, parceiros, contratos | compras, financeiro, historico, notificacoes | visibilidade, destino e duplicidade de efeitos |
| Obras | empresas, contratos e apropriacoes | solicitacoes, compras, financeiro, provisionamento, SST | custo ou rateio incorreto |
| Contratos | parceiros e obras | solicitacoes, comercial, arquivos | perda de contexto contratual |
| Compras | solicitacoes, itens, parceiros/credores e apropriacoes | cotacoes, pedidos, fiscal e financeiro | compra duplicada, credor incorreto ou apropriacao invalida |
| Cotacoes e Pedidos | compras, fornecedores e matriz de itens por fornecedor | links publicos, comparativo, pedidos, PDFs, fiscal e financeiro | item enviado ao fornecedor errado, vencedor incorreto ou pedido duplicado |
| Financeiro | solicitacoes, compras, comercial, RH/DP e obras | conciliacao, relatorios, governanca | saldo, baixa ou realizado incorreto |
| Custos e Recebiveis | obras, financeiro, compras, contratos e RH/DP | bloqueios operacionais, relatorios, painel | bloquear obra indevida ou liberar operacao vencida |

## Modulos especializados

| Modulo | Dependencias | Efeitos externos |
|---|---|---|
| Provisionamento | Financeiro e Obras | previsao gerencial; nao cria realizado |
| Comercial | Parceiros, Obras e Financeiro | contratos de venda e titulos a receber |
| CRM | Parceiros e Comercial | leads, oportunidades e conversoes controladas |
| RH/DP | Empresas, Obras e Financeiro | colaboradores, apuracoes e obrigacoes |
| SST | Empresas, colaboradores, obras e arquivos | PCMSO, PGR, exames, ASO, EPI, treinamentos, LTCAT e validades |
| Fiscal | Parceiros, Compras, Financeiro, certificados e S3 | documentos, divergencias e vinculos fiscais |
| Boletos | Financeiro e Comercial | emissao, remessa, retorno e liquidacao controlada |

## Modulos institucionais

- Comunicacao Interna consome usuarios, anexos e notificacoes.
- Biblioteca de Modelos fornece arquivos padrao sem assumir regras dos modulos consumidores.
- Treinamento organiza conteudos e leituras por usuario.
- Governanca agrega auditoria, saude tecnica e indicadores sem alterar registros operacionais.
- Configuracoes define modulos, permissoes e regras parametrizaveis.
- Painel do Gestor agrega resultados e saldos, mas nao e dono dos calculos de origem.

## Regras de dependencia

- `SOLICITACOES` e o modulo base e permanece habilitado.
- `COTACOES` depende de `COMPRAS`.
- `BOLETOS` depende de `FINANCEIRO`.
- `PROVISOES` depende de `FINANCEIRO` e `OBRAS`.
- solicitacao de compra normal nasce `PENDENTE` em GEO para revisao de itens e apropriacoes e somente fica disponivel para cotacao depois do encaminhamento explicito para Compras;
- integracao externa e aprovacao da diretoria nao sao pre-requisitos vigentes para novas solicitacoes de compra;
- `fornecedores[].itens` define o escopo de cada link de cotacao e todo item precisa pertencer a mesma solicitacao de compra;
- SST pode referenciar colaboradores de RH/DP e obras, sem sincronizacao ou automacao entre os modulos.
- Um modulo consumidor nunca passa a ser dono do dado apenas porque o proprietario esta desabilitado.
- Cadastro de Obra e uma excecao explicita da Nova Solicitacao: nasce sem obra/centro de
  custo preexistente e so cria a obra definitiva depois da etapa autorizada.
- Contratos operacionais legado e novo coexistem; qualquer consolidacao precisa preservar
  titulos, medicoes e pagamentos historicos.
- Bloqueios de Custos e Recebiveis devem ser revalidados no backend de cada operacao
  consumidora, inclusive Compras, jornada/ticket e aditivo quando configurados.

## Checklist de impacto

Ao alterar um modulo, validar os consumidores indicados nas tabelas, as permissoes, relatorios, notificacoes, anexos, auditoria e qualquer geracao de registro em outro dominio.
