# Mapa de validacao de CPF e CNPJ

## Objetivo

Impedir que cadastros e alteracoes gravem CPF ou CNPJ com quantidade de digitos incorreta, sequencia repetida ou digitos verificadores invalidos. A regra vale para a interface e para o backend, inclusive quando a requisicao nao parte da tela oficial.

## Regra adotada

- CPF: exatamente 11 digitos e dois digitos verificadores validos.
- CNPJ: exatamente 14 digitos e dois digitos verificadores validos.
- Campo CPF/CNPJ: aceita um dos dois formatos, sempre com validacao completa.
- Chave PIX declarada como CPF ou CNPJ: obedece a mesma validacao do documento correspondente.
- Pontuacao digitada na tela e aceita, mas o backend persiste somente os digitos.
- Campo opcional vazio continua permitido.
- Um documento invalido impede o envio na tela e tambem e rejeitado pelo backend com HTTP 400.
- Registros legados invalidos podem receber alteracoes em outros campos. A correcao passa a ser obrigatoria quando o proprio documento for alterado.

## Cadastros e telas cobertos

| Area | Tela ou fluxo | Campo | Regra |
| --- | --- | --- | --- |
| Cadastros | Parceiros | CPF/CNPJ | CPF ou CNPJ |
| Cadastros | Parceiros e qualificacao juridica | CPF do representante legal | somente CPF |
| Cadastros | Empresas do grupo | CNPJ | somente CNPJ |
| Solicitacoes | Nova solicitacao, cadastro rapido de credor | CPF/CNPJ | CPF ou CNPJ |
| Solicitacoes | Detalhe, cadastro e complemento de credor | CPF/CNPJ e CPF do representante | conforme o campo |
| Contratos | Contrato do fluxo novo | CPF do representante e do conjuge | somente CPF |
| Contratos comerciais | Compradores, conjuges e testemunhas | CPF/CNPJ ou CPF | conforme o papel |
| Contratos comerciais | Parcelas em cheque | CPF/CNPJ do titular | CPF ou CNPJ |
| Financeiro | Contas de pagamento | CNPJ pagador | somente CNPJ |
| Financeiro | Favorecidos de pagamento | CPF/CNPJ | CPF ou CNPJ |
| Financeiro | Favorecidos de pagamento | Chave PIX CPF/CNPJ | conforme o tipo selecionado |
| Financeiro | Novo titulo, edicao e detalhe da solicitacao | CPF/CNPJ do favorecido | CPF ou CNPJ |
| Financeiro | Convenios bancarios e Caixa | CPF/CNPJ da empresa ou beneficiario | CPF ou CNPJ |
| Financeiro | Cheques e baixas | CPF/CNPJ do titular | CPF ou CNPJ |
| Compras | Fornecedores | CPF/CNPJ | CPF ou CNPJ |
| Compras | Nova solicitacao de compra | CPF/CNPJ do credor | CPF ou CNPJ |
| Compras | Cotacao interna e cotacao publica | CPF/CNPJ do fornecedor ou transportador | CPF ou CNPJ |
| Compras | Pedido de compra e frete | CPF/CNPJ do favorecido ou transportador | CPF ou CNPJ |
| CRM | Novo lead e detalhe do lead | CPF/CNPJ | CPF ou CNPJ |
| RH/DP | Colaborador e admissao | CPF | somente CPF |
| RH/DP | Dados bancarios do colaborador | CPF/CNPJ do favorecido | CPF ou CNPJ |
| RH/DP | Admissao, dados bancarios | Chave PIX CPF/CNPJ | conforme o tipo selecionado |
| RH/DP | Importacao de colaboradores | CPF | somente CPF |
| Fiscal | Empresas fiscais | CNPJ | somente CNPJ |
| SST | Exposicao ocupacional | CPF do responsavel tecnico | somente CPF |

## Protecao central de persistencia

Os seguintes atributos possuem validacao no hook `beforeValidate` do Sequelize, alem das validacoes especificas dos endpoints:

- `Parceiro.cpf_cnpj` e `Parceiro.representante_cpf`;
- `EmpresaGrupo.cnpj` e `RhEmpresaGrupo.cnpj`;
- `RhColaborador.cpf` e `RhColaboradorPagamento.favorecido_documento`;
- `ContratoComercial.testemunha_1_cpf` e `testemunha_2_cpf`;
- `FornecedorCompra.cnpj`;
- `SolicitacaoCompraFornecedor.frete_transportador_cpf_cnpj` e `PedidoCompra.frete_transportador_cpf_cnpj`;
- `PaymentAccount.cnpj_pagador` e `PaymentBeneficiary.cpf_cnpj`;
- `BoletoCaixaConvenio.beneficiario_cpf_cnpj` e `CaixaPagamentoConvenio.empresa_cpf_cnpj`;
- `ChequeTerceiro.titular_documento`, `BaixaFinanceiraComponente.cheque_titular_documento` e `MovimentoFinanceiro.cheque_titular_documento`;
- `CrmLead.documento`;
- `FiscalCompany.cnpj`;
- `SstExposicao.responsavel_tecnico_cpf`.

Quando o tipo da chave PIX e `CPF` ou `CNPJ`, a mesma protecao tambem cobre as tres chaves de `Parceiro` e `PaymentBeneficiary.pix_chave`.

Essa camada protege criacoes e alteracoes realizadas por telas, importadores, integracoes e chamadas diretas aos services que usem os models.

## Contextos que nao sao bloqueados

Campos usados apenas para busca ou filtro por CPF/CNPJ nao gravam documentos e, por isso, nao passam pela barreira cadastral (cada busca preserva sua regra atual de texto completo ou parcial). Documentos recebidos de fontes externas e imutaveis, como XML fiscal, OFX, DDA e resultados de leitura documental, tambem sao preservados como foram recebidos; eles nao criam um CPF/CNPJ cadastral confiavel no sistema.

## Verificacao tecnica

O comando abaixo testa CPFs e CNPJs validos, digitos verificadores incorretos, sequencias repetidas, normalizacao e a compatibilidade com registros legados:

```bash
npm --prefix backend run test:cpf-cnpj
```
