# Auditoria de cadastros, setores e formulários de solicitações

> Relatório gerado a partir de uma extração somente leitura do banco de produção e do mapeamento das regras atuais do frontend e backend.

## 1. Identificação da auditoria

| Item | Valor |
| --- | --- |
| Ambiente | production |
| Banco de dados | gestao_solicitacoes |
| Versão do esquema da auditoria | 1.0.0 |
| Gerado em | 06/08/2026, 17:12:20 |
| Execução somente leitura | Sim |
| Arquivo-fonte | `auditoria-cadastros-solicitacoes-main.json` |
| SHA-256 do arquivo-fonte | `FF383CC40BAB692D41A83C9B58005D9A102B2FA0F71B5FFF1DC845F3598DE892` |
| Privacidade | Nao inclui usuarios, solicitacoes, credores, descricoes, anexos ou outros dados pessoais. |
| Objetivo | Auditar todos os setores, tipos de solicitacao e campos disponiveis/obrigatorios nas tres entradas de criacao. |

## 2. Resumo executivo

| Indicador | Quantidade |
| --- | --- |
| Setores cadastrados | 22 |
| Setores ativos | 19 |
| Tipos de solicitação cadastrados | 29 |
| Tipos de solicitação ativos | 25 |
| Combinações ativas entre setor e tipo | 303 |

### Leitura principal

- A disponibilidade de tipos na Nova Solicitação é definida por setor e pode usar uma regra específica ou o fallback de todos os tipos ativos.
- A visibilidade e a obrigatoriedade dos campos da Nova Solicitação variam conforme a combinação setor + tipo e podem ser alteradas por configuração gravada no banco.
- Solicitação de Compra e Compra Direta possuem formulários próprios; seus campos e validações estão documentados separadamente neste relatório.
- Os pontos de atenção ao final distinguem inconsistências cadastrais e divergências entre as validações do frontend e do backend.

## 3. Módulos habilitados na produção

| Módulo | Habilitado |
| --- | --- |
| SOLICITACOES | Sim |
| COMUNICACAO_INTERNA | Sim |
| BIBLIOTECA_MODELOS | Sim |
| TREINAMENTO | Sim |
| COMPRAS | Sim |
| COTACOES | Sim |
| FINANCEIRO | Sim |
| BOLETOS | Não |
| FISCAL | Não |
| OBRAS | Sim |
| PROVISOES | Não |
| CUSTOS_RECEBIVEIS | Não |
| CONTRATOS | Sim |
| COMERCIAL | Sim |
| CRM | Não |
| RH_DP | Sim |
| SST | Não |
| Integracao com ERP legado | Não |

## 4. Inventário de setores

| ID | Código | Nome | Status | Capacidades | Regra própria de tipos | Fallback | Tipos ativos disponíveis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADMINISTRATIVO | ADMINISTRATIVO | Ativo | ADMINISTRATIVO | Sim | Não | 3 |
| 11 | BRAPE | BRAPE | Ativo | Nenhum | Sim | Não | 7 |
| 12 | BRAPE-CSC | BRAPE-CSC | Ativo | Nenhum | Não | Sim | 25 |
| 9 | COMERCIAL | COMERCIAL | Ativo | Nenhum | Não | Sim | 25 |
| 19 | COMPRAS-1 | COMPRAS | Ativo | COMPRAS | Sim | Sim | 25 |
| 16 | COMPRAS-NORTE | COMPRAS NORTE | Inativo | Nenhum | Não | Sim | 25 |
| 4 | COMPRAS | COMPRAS SUL | Inativo | COMPRAS | Sim | Sim | 25 |
| 10 | DP | DEPARTAMENTO PESSOAL | Ativo | Nenhum | Sim | Não | 5 |
| 15 | DIRETORIA | DIRETORIA | Ativo | Nenhum | Não | Sim | 25 |
| 20 | DIR_ADMIN | DIRETORIA ADMINISTRATIVA | Ativo | Nenhum | Não | Sim | 25 |
| 21 | DIR_OBRAS_PRIVADAS | DIRETORIA DE OBRAS PRIVADAS | Ativo | Nenhum | Não | Sim | 25 |
| 22 | DIR_OBRAS_PUBLICAS | DIRETORIA DE OBRAS PUBLICAS | Ativo | Nenhum | Não | Sim | 25 |
| 3 | FINANCEIRO | FINANCEIRO | Ativo | FINANCEIRO | Sim | Não | 9 |
| 13 | FISCAL | FISCAL | Inativo | Nenhum | Não | Sim | 25 |
| 17 | FISCAL | FISCAL | Ativo | Nenhum | Não | Sim | 25 |
| 2 | GEO | GERENCIA DE PROCESSOS  | Ativo | GEO | Sim | Não | 11 |
| 6 | JURIDICO | JURIDICO | Ativo | Nenhum | Sim | Não | 2 |
| 8 | MARKETING | MARKETING | Ativo | Nenhum | Sim | Não | 3 |
| 7 | OBRA | OBRA | Ativo | OBRA | Sim | Não | 10 |
| 5 | RH | RH | Ativo | Nenhum | Sim | Não | 3 |
| 14 | SESMT | SESMT | Ativo | Nenhum | Não | Sim | 25 |
| 18 | SUPORTE | SUPORTE | Ativo | Nenhum | Não | Sim | 25 |

## 5. Matriz de tipos disponíveis por setor

A matriz abaixo representa os tipos efetivamente ativos disponibilizados para abertura em cada setor no momento da auditoria. Referências inválidas ou inativas aparecem na seção de pontos de atenção.

| Setor | Status | Tipos disponíveis |
| --- | --- | --- |
| ADMINISTRATIVO — ADMINISTRATIVO | Ativo | DESPESA_ADMINISTRATIVA (#12), OUTROS_ASSUNTOS (#8), SOLICITACAO_DE_COMPRA (#5) |
| BRAPE — BRAPE | Ativo | ADM_LOCAL_DE_OBRA (#1), COMPRA_DIRETA (#7), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), PAGAMENTO_DE_MAO_DE_OBRA (#10), SOLICITACAO_DE_COMPRA (#5) |
| BRAPE-CSC — BRAPE-CSC | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| COMERCIAL — COMERCIAL | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| COMPRAS-1 — COMPRAS | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| COMPRAS-NORTE — COMPRAS NORTE | Inativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| COMPRAS — COMPRAS SUL | Inativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| DP — DEPARTAMENTO PESSOAL | Ativo | ADMISSAO (#9), ATESTADO (#19), DEMISSAO (#18), OUTROS_ASSUNTOS (#8), PAGAMENTO_DE_MAO_DE_OBRA (#10) |
| DIRETORIA — DIRETORIA | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| DIR_ADMIN — DIRETORIA ADMINISTRATIVA | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| DIR_OBRAS_PRIVADAS — DIRETORIA DE OBRAS PRIVADAS | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| DIR_OBRAS_PUBLICAS — DIRETORIA DE OBRAS PUBLICAS | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| FINANCEIRO — FINANCEIRO | Ativo | ASSISTENCIA_MEDICA (#23), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PIS_COFINS (#28), SIMPLES_NACIONAL (#25), TICKET_ALIMENTACAO (#22) |
| FISCAL — FISCAL | Inativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| FISCAL — FISCAL | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| GEO — GERENCIA DE PROCESSOS  | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), COMPRA_DIRETA (#7), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), RECARGA_DE_CARTAO (#6), SOLICITACAO_DE_COMPRA (#5) |
| JURIDICO — JURIDICO | Ativo | ASSUNTOS_JURIDICOS (#20), OUTROS_ASSUNTOS (#8) |
| MARKETING — MARKETING | Ativo | DESPESAS_DE_MARKETING (#15), OUTROS_ASSUNTOS (#8), SOLICITACAO_DE_COMPRA (#5) |
| OBRA — OBRA | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), COMPRA_DIRETA (#7), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), PAGAMENTO_DE_MAO_DE_OBRA (#10), RECARGA_DE_CARTAO (#6), SOLICITACAO_DE_COMPRA (#5) |
| RH — RH | Ativo | ADMISSAO (#9), OUTROS_ASSUNTOS (#8), PAGAMENTO_DE_MAO_DE_OBRA (#10) |
| SESMT — SESMT | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |
| SUPORTE — SUPORTE | Ativo | ABERTURA_DE_CONTRATO (#2), ADM_LOCAL_DE_OBRA (#1), ADMISSAO (#9), ASSISTENCIA_MEDICA (#23), ASSUNTOS_JURIDICOS (#20), ATESTADO (#19), COMPRA_DIRETA (#7), DEMISSAO (#18), DESPESA_ADMINISTRATIVA (#12), DESPESA_COMERCIAL (#16), DESPESAS_DE_MARKETING (#15), FGTS (#21), GERACAO_BOLETOS (#31), INSS (#24), LOCACAO_DE_MAQ_EQ (#3), MEDICAO (#4), OUTROS_ASSUNTOS (#8), OUTROS_ASSUNTOS_FINANCEIROS (#32), OUTROS_IMPOSTOS (#29), PAGAMENTO_DE_MAO_DE_OBRA (#10), PIS_COFINS (#28), RECARGA_DE_CARTAO (#6), SIMPLES_NACIONAL (#25), SOLICITACAO_DE_COMPRA (#5), TICKET_ALIMENTACAO (#22) |

## 6. Catálogo completo de tipos de solicitação

| ID | Código | Nome | Status | Subtipos cadastrados |
| --- | --- | --- | --- | --- |
| 2 | ABERTURA_DE_CONTRATO | ABERTURA DE CONTRATO | Ativo | Nenhum |
| 1 | ADM_LOCAL_DE_OBRA | ADM LOCAL DE OBRA | Ativo | 	DESPESAS COM VEICULOS (#4; Ativo), ÁGUA (#8; Ativo), ALIMENTAÇÃO (#3; Ativo), ALUGUEL DE IMOVEL (#2; Ativo), COMBUSTÍVEL (#1; Ativo), ENERGIA (#9; Ativo), ENSAIOS TÉCNICOS (#21; Ativo), EXAMES/ASO (#14; Ativo), HOSPEDAGEM (#5; Ativo), INTERNET/TELEFONIA (#10; Ativo), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20; Ativo), MANUTENÇÃO DE EQUIPAMENTOS (#7; Ativo), MATERIAIS DE ESCRITORIO (#17; Ativo), REEMBOLSO (#11; Ativo), SUPERMERCADO (#18; Ativo), TAXAS/IMPOSTOS (#13; Ativo), TRANSPORTE DE COLABORADORES (#19; Ativo) |
| 9 | ADMISSAO | ADMISSÃO | Ativo | Nenhum |
| 23 | ASSISTENCIA_MEDICA | ASSISTÊNCIA MÉDICA | Ativo | Nenhum |
| 20 | ASSUNTOS_JURIDICOS | ASSUNTOS JURIDICOS | Ativo | Nenhum |
| 19 | ATESTADO | ATESTADO | Ativo | Nenhum |
| 7 | COMPRA_DIRETA | COMPRA DIRETA | Ativo | Nenhum |
| 18 | DEMISSAO | DEMISSÃO | Ativo | Nenhum |
| 27 | DESPESA_ADMINISTRATIVA | DESPESA ADMINISTRATIVA | Inativo | DESPESAS COM VEICULOS (#24; Ativo) |
| 12 | DESPESA_ADMINISTRATIVA | DESPESA ADMINISTRATIVA | Ativo | 	DESPESAS COM VEICULOS (#22; Inativo), DESPESA COM VEICULOS (#23; Ativo) |
| 16 | DESPESA_COMERCIAL | DESPESA COMERCIAL | Ativo | Nenhum |
| 15 | DESPESAS_DE_MARKETING | DESPESAS DE MARKETING | Ativo | Nenhum |
| 30 | EMPRESTIMO_MATERIAIS | EMPRÉSTIMO MATERIAIS | Inativo | Nenhum |
| 21 | FGTS | FGTS | Ativo | Nenhum |
| 31 | GERACAO_BOLETOS | GERAÇÃO DE BOLETOS | Ativo | Nenhum |
| 24 | INSS | INSS | Ativo | Nenhum |
| 3 | LOCACAO_DE_MAQ_EQ | LOCAÇÃO DE MAQ. EQ. | Ativo | Nenhum |
| 4 | MEDICAO | MEDIÇÃO | Ativo | Nenhum |
| 8 | OUTROS_ASSUNTOS | OUTROS ASSUNTOS | Ativo | Nenhum |
| 32 | OUTROS_ASSUNTOS_FINANCEIROS | OUTROS ASSUNTOS FINANCEIROS | Ativo | Nenhum |
| 29 | OUTROS_IMPOSTOS | OUTROS IMPOSTOS | Ativo | Nenhum |
| 10 | PAGAMENTO_DE_MAO_DE_OBRA | PAGAMENTO DE MAO DE OBRA | Ativo | Nenhum |
| 28 | PIS_COFINS | PIS/COFINS | Ativo | Nenhum |
| 14 | PRE_OBRA | PRÉ OBRA | Inativo | Nenhum |
| 13 | PROJETOS | PROJETOS | Inativo | Nenhum |
| 6 | RECARGA_DE_CARTAO | RECARGA DE CARTÃO | Ativo | Nenhum |
| 25 | SIMPLES_NACIONAL | SIMPLES NACIONAL | Ativo | Nenhum |
| 5 | SOLICITACAO_DE_COMPRA | SOLICITAÇÃO DE COMPRA | Ativo | Nenhum |
| 22 | TICKET_ALIMENTACAO | TICKET ALIMENTAÇÃO | Ativo | Nenhum |

### 6.1 Regras de negócio por tipo

| Tipo | Valor | Descrição | Apropriação principal | Contrato | Subtipo | Período de medição | Ref. abertura | Itens de apropriação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO (#2) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Visível e obrigatório | Visível e obrigatório |
| ADM_LOCAL_DE_OBRA (#1) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto |
| ADMISSAO (#9) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| ASSISTENCIA_MEDICA (#23) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| ASSUNTOS_JURIDICOS (#20) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| ATESTADO (#19) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| COMPRA_DIRETA (#7) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| DEMISSAO (#18) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| DESPESA_ADMINISTRATIVA (#27) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| DESPESA_ADMINISTRATIVA (#12) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| DESPESA_COMERCIAL (#16) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| DESPESAS_DE_MARKETING (#15) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| EMPRESTIMO_MATERIAIS (#30) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| FGTS (#21) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| GERACAO_BOLETOS (#31) | Oculto | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| INSS (#24) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| LOCACAO_DE_MAQ_EQ (#3) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto |
| MEDICAO (#4) | Visível e obrigatório | Visível e opcional | Visível e obrigatório | Visível e obrigatório | Oculto | Visível e obrigatório | Oculto | Oculto |
| OUTROS_ASSUNTOS (#8) | Oculto | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| OUTROS_ASSUNTOS_FINANCEIROS (#32) | Oculto | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| OUTROS_IMPOSTOS (#29) | Visível e obrigatório | Visível e opcional | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| PAGAMENTO_DE_MAO_DE_OBRA (#10) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| PIS_COFINS (#28) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| PRE_OBRA (#14) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| PROJETOS (#13) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| RECARGA_DE_CARTAO (#6) | Visível e obrigatório | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto |
| SIMPLES_NACIONAL (#25) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| SOLICITACAO_DE_COMPRA (#5) | Oculto | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |
| TICKET_ALIMENTACAO (#22) | Visível e obrigatório | Visível e obrigatório | Oculto | Oculto | Oculto | Oculto | Oculto | Oculto |

## 7. Nova Solicitação — catálogo geral de campos

Rota: `/nova-solicitacao`

A visibilidade e a obrigatoriedade efetivas estao detalhadas em setores[].tipos[].campos.

| Campo | Descrição | Fixo | Pode ser obrigatório |
| --- | --- | --- | --- |
| Obra (`obra`) | Vincula a solicitacao a uma obra. | Sim | Sim |
| Area responsavel (`area_responsavel`) | Define o setor que recebe a solicitacao. | Sim | Sim |
| Credor (`credor`) | Pessoa ou empresa vinculada como credor. | Não | Sim |
| Cadastro de credor (`cadastro_credor`) | Permite cadastrar um novo credor durante a abertura da solicitacao. | Não | Não |
| Apropriacao principal (`apropriacao_principal`) | Apropriacao da solicitacao na obra. | Não | Sim |
| Subtipo (`subtipo`) | Subtipo de contrato ou classificacao complementar. | Não | Sim |
| Contrato (`contrato`) | Referencia e contrato vinculado. | Não | Sim |
| Apropriacoes do contrato (`apropriacoes_contrato`) | Rateio entre apropriacoes vinculadas ao contrato selecionado. | Não | Sim |
| Valor (`valor`) | Valor da solicitacao. | Não | Sim |
| Data de vencimento (`data_vencimento`) | Prazo ou vencimento esperado. | Não | Sim |
| Data de demissao (`data_demissao`) | Data efetiva de desligamento do colaborador. | Não | Sim |
| Periodo de medicao (`periodo_medicao`) | Data inicial e final da medicao. | Não | Sim |
| Ref. contrato abertura (`ref_contrato_abertura`) | Referencia usada para abertura de contrato. | Não | Sim |
| Itens de apropriacao (`itens_apropriacao`) | Itens de apropriacao usados na abertura de contrato. | Não | Sim |
| Descricao (`descricao`) | Descricao textual da solicitacao. | Não | Sim |
| Anexos (`anexos`) | Arquivos anexados na abertura da solicitacao. | Não | Não |

## 8. Nova Solicitação — configuração efetiva por setor e tipo

Esta é a seção operacional principal: mostra exatamente quais campos aparecem e quais são obrigatórios em cada combinação atualmente disponível na produção.

### 8.1 ADMINISTRATIVO — ADMINISTRATIVO

- **Status do setor:** Ativo
- **Capacidades:** ADMINISTRATIVO
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 3

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.11 BRAPE — BRAPE

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 7

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.12 BRAPE-CSC — BRAPE-CSC

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.9 COMERCIAL — COMERCIAL

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.19 COMPRAS-1 — COMPRAS

- **Status do setor:** Ativo
- **Capacidades:** COMPRAS
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.16 COMPRAS-NORTE — COMPRAS NORTE

- **Status do setor:** Inativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.4 COMPRAS — COMPRAS SUL

- **Status do setor:** Inativo
- **Capacidades:** COMPRAS
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.10 DP — DEPARTAMENTO PESSOAL

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 5

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Data de demissao _(visibilidade configurada)_, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.15 DIRETORIA — DIRETORIA

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.20 DIR_ADMIN — DIRETORIA ADMINISTRATIVA

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.21 DIR_OBRAS_PRIVADAS — DIRETORIA DE OBRAS PRIVADAS

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.22 DIR_OBRAS_PUBLICAS — DIRETORIA DE OBRAS PUBLICAS

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.3 FINANCEIRO — FINANCEIRO

- **Status do setor:** Ativo
- **Capacidades:** FINANCEIRO
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 9

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.13 FISCAL — FISCAL

- **Status do setor:** Inativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.17 FISCAL — FISCAL

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.2 GEO — GERENCIA DE PROCESSOS

- **Status do setor:** Ativo
- **Capacidades:** GEO
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 11

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Cadastro de credor _(visibilidade configurada)_, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Cadastro de credor _(visibilidade configurada)_, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Cadastro de credor _(visibilidade configurada)_, Subtipo _(visibilidade configurada)_, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Cadastro de credor _(visibilidade configurada)_, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Contrato, Apropriacoes do contrato _(obrigatoriedade configurada)_, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Contrato, Apropriacoes do contrato _(obrigatoriedade configurada)_, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Cadastro de credor _(visibilidade configurada)_, Valor _(visibilidade configurada)_, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | ADMIN_PRIMEIRO | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | REDIRECIONAMENTO<br>`/solicitacoes-compra/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.6 JURIDICO — JURIDICO

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 2

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.8 MARKETING — MARKETING

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 3

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.7 OBRA — OBRA

- **Status do setor:** Ativo
- **Capacidades:** OBRA
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 10

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Credor _(obrigatoriedade configurada)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |

### 8.5 RH — RH

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Sim
- **Fallback para todos os tipos ativos:** Não
- **Total de tipos efetivamente disponíveis:** 3

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |

### 8.14 SESMT — SESMT

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

### 8.18 SUPORTE — SUPORTE

- **Status do setor:** Ativo
- **Capacidades:** Nenhum
- **Regra específica de tipos:** Não
- **Fallback para todos os tipos ativos:** Sim
- **Total de tipos efetivamente disponíveis:** 25

| Tipo | Entrada/rota | Modo de recebimento | Campos visíveis | Campos obrigatórios | Subtipos ativos |
| --- | --- | --- | --- | --- | --- |
| ABERTURA_DE_CONTRATO — ABERTURA DE CONTRATO (#2) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Ref. contrato abertura, Itens de apropriacao, Descricao | Nenhum |
| ADM_LOCAL_DE_OBRA — ADM LOCAL DE OBRA (#1) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Subtipo, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Subtipo, Contrato, Valor, Data de vencimento, Descricao | 	DESPESAS COM VEICULOS (#4), ÁGUA (#8), ALIMENTAÇÃO (#3), ALUGUEL DE IMOVEL (#2), COMBUSTÍVEL (#1), ENERGIA (#9), ENSAIOS TÉCNICOS (#21), EXAMES/ASO (#14), HOSPEDAGEM (#5), INTERNET/TELEFONIA (#10), MANUTENÇÃO CANTEIRO/ESCRITORIO (#20), MANUTENÇÃO DE EQUIPAMENTOS (#7), MATERIAIS DE ESCRITORIO (#17), REEMBOLSO (#11), SUPERMERCADO (#18), TAXAS/IMPOSTOS (#13), TRANSPORTE DE COLABORADORES (#19) |
| ADMISSAO — ADMISSÃO (#9) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ASSISTENCIA_MEDICA — ASSISTÊNCIA MÉDICA (#23) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| ASSUNTOS_JURIDICOS — ASSUNTOS JURIDICOS (#20) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| ATESTADO — ATESTADO (#19) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| COMPRA_DIRETA — COMPRA DIRETA (#7) | REDIRECIONAMENTO<br>`/solicitacoes-compra-direta/nova` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DEMISSAO — DEMISSÃO (#18) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESA_ADMINISTRATIVA — DESPESA ADMINISTRATIVA (#12) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | DESPESA COM VEICULOS (#23) |
| DESPESA_COMERCIAL — DESPESA COMERCIAL (#16) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| DESPESAS_DE_MARKETING — DESPESAS DE MARKETING (#15) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| FGTS — FGTS (#21) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| GERACAO_BOLETOS — GERAÇÃO DE BOLETOS (#31) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| INSS — INSS (#24) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| LOCACAO_DE_MAQ_EQ — LOCAÇÃO DE MAQ. EQ. (#3) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Descricao | Nenhum |
| MEDICAO — MEDIÇÃO (#4) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Contrato, Apropriacoes do contrato, Valor, Data de vencimento, Periodo de medicao, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Contrato, Valor, Data de vencimento, Periodo de medicao | Nenhum |
| OUTROS_ASSUNTOS — OUTROS ASSUNTOS (#8) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Data de vencimento, Descricao | Nenhum |
| OUTROS_ASSUNTOS_FINANCEIROS — OUTROS ASSUNTOS FINANCEIROS (#32) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| OUTROS_IMPOSTOS — OUTROS IMPOSTOS (#29) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento | Nenhum |
| PAGAMENTO_DE_MAO_DE_OBRA — PAGAMENTO DE MAO DE OBRA (#10) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| PIS_COFINS — PIS/COFINS (#28) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| RECARGA_DE_CARTAO — RECARGA DE CARTÃO (#6) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Apropriacao principal, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Apropriacao principal, Valor, Data de vencimento, Descricao | Nenhum |
| SIMPLES_NACIONAL — SIMPLES NACIONAL (#25) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |
| SOLICITACAO_DE_COMPRA — SOLICITAÇÃO DE COMPRA (#5) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Data de vencimento, Descricao | Nenhum |
| TICKET_ALIMENTACAO — TICKET ALIMENTAÇÃO (#22) | NOVA_SOLICITACAO_GERAL<br>`/nova-solicitacao` | TODOS_VISIVEIS | Obra _(fixo)_, Area responsavel _(fixo)_, Credor, Valor, Data de vencimento, Descricao, Anexos | Obra _(fixo)_, Area responsavel _(fixo)_, Valor, Data de vencimento, Descricao | Nenhum |

## 9. Solicitação de Compra — campos e obrigatoriedades

- **Rota:** `/solicitacoes-compra/nova`
- **Endpoint:** `POST /api/compras/solicitacoes`

| Nível | Campo | Visível | Obrigatório no frontend | Obrigatório no backend | Somente leitura | Regra/condição |
| --- | --- | --- | --- | --- | --- | --- |
| cabecalho | Obra (`obra_id`) | Sim | Sim | Sim | Não | Deve existir e estar no escopo de criacao do usuario. |
| cabecalho | Solicitante (`solicitante`) | Sim | Não | Não | Sim | Obtido da sessao autenticada; nao e enviado como escolha do usuario. |
| cabecalho | Necessario para (cabecalho) (`necessario_para`) | Sim | Não | Não | Não | Valor padrao opcional para os itens. |
| cabecalho | Observacoes (`observacoes`) | Sim | Não | Não | Não | Texto opcional, limitado a 5.000 caracteres pelo backend. |
| colecao | Itens da solicitacao (`itens`) | Sim | Sim | Sim | Não | Minimo de 1 e maximo de 300 itens. |
| item | Origem do item (cadastrado ou manual) (`item_tipo`) | Sim | Sim | Sim | Não | Item cadastrado exige insumo; item manual exige nome e unidade. |
| item | Insumo cadastrado (`insumo_id`) | Sim | Condicional | Condicional | Não | Obrigatorio quando o item nao for manual. |
| item | Nome do item manual (`nome_manual`) | Sim | Condicional | Condicional | Não | Obrigatorio quando o item for manual. |
| item | Unidade (`unidade`) | Sim | Condicional | Condicional | Não | Obrigatoria para item manual; para item cadastrado pode vir do cadastro do insumo. |
| item | Quantidade (`quantidade`) | Sim | Sim | Sim | Não | Deve ser maior que zero. |
| item | Especificacao (`especificacao`) | Sim | Não | Não | Não | — |
| item | Apropriacoes do item (`apropriacoes`) | Sim | Sim | Sim | Não | Ao menos uma apropriacao analitica da obra; sem repeticao; quantidades positivas; soma deve fechar a quantidade do item. |
| item | Necessario para (item) (`necessario_para_item`) | Sim | Sim | Não | Não | A tela bloqueia item sem data; o backend atualmente aceita nulo. |
| item | Link do produto (`link_produto`) | Sim | Não | Não | Não | — |
| item | Arquivo do item (`arquivo_item`) | Sim | Não | Não | Não | — |
| acao_auxiliar | Modelo e importacao em massa de itens (`modelo_importacao`) | Sim | Não | Não | Não | A importacao alimenta os mesmos campos dos itens e respeita o limite de 300. |

## 10. Compra Direta — campos e obrigatoriedades

- **Rota:** `/solicitacoes-compra-direta/nova`
- **Endpoint:** `POST /api/compras/solicitacoes-diretas`

| Nível | Campo | Visível | Obrigatório no frontend | Obrigatório no backend | Somente leitura | Regra/condição |
| --- | --- | --- | --- | --- | --- | --- |
| cabecalho | Obra (`obra_id`) | Sim | Sim | Sim | Não | Deve existir e estar no escopo de criacao do usuario. |
| cabecalho | Solicitante (`solicitante`) | Sim | Não | Não | Sim | Obtido da sessao autenticada. |
| cabecalho | Data de vencimento (`necessario_para`) | Sim | Não | Não | Não | — |
| cabecalho | Formas de pagamento (`forma_pagamento_ids`) | Sim | Sim | Sim | Não | Ao menos uma forma ativa cadastrada no Financeiro; maximo de 20. |
| cabecalho | Credor (`parceiro_id`) | Sim | Não | Não | Não | Quando informado, precisa existir, estar ativo e marcado como fornecedor/credor. |
| cabecalho | Observacoes (`observacoes`) | Sim | Não | Não | Não | Texto opcional, limitado a 5.000 caracteres. |
| cabecalho | Dados para pagamento (`dados_pagamento`) | Sim | Não | Não | Não | Texto opcional, limitado a 1.500 caracteres. |
| cabecalho | Desconto concedido (`desconto_total`) | Sim | Não | Não | Não | Maior ou igual a zero e nao pode superar o valor bruto dos itens. |
| cabecalho | Nota fiscal, guia ou boleto (`anexos_cabecalho`) | Sim | Condicional | Condicional | Não | Boleto e obrigatorio quando qualquer forma de pagamento selecionada for boleto; nota fiscal/guia permanece opcional. |
| colecao | Itens da compra direta (`itens`) | Sim | Sim | Sim | Não | Minimo de 1 e maximo de 300 itens. |
| item | Origem do item (cadastrado ou manual) (`item_tipo`) | Sim | Sim | Sim | Não | Item cadastrado exige insumo; item manual exige nome e unidade. |
| item | Insumo cadastrado (`insumo_id`) | Sim | Condicional | Condicional | Não | Obrigatorio quando o item nao for manual. |
| item | Nome do item manual (`nome_manual`) | Sim | Condicional | Condicional | Não | Obrigatorio quando o item for manual. |
| item | Unidade (`unidade`) | Sim | Condicional | Condicional | Não | Obrigatoria para item manual; para item cadastrado pode vir do cadastro do insumo. |
| item | Quantidade (`quantidade`) | Sim | Sim | Sim | Não | Deve ser maior que zero. |
| item | Valor unitario (`valor_unitario`) | Sim | Sim | Parcial | Não | A tela exige valor positivo em cada item; o backend exige apenas valor total liquido positivo para a compra. |
| item | Valor total do item (`valor_total`) | Sim | Não | Não | Sim | Calculado por quantidade x valor unitario e ajustado pelo rateio do desconto. |
| item | Apropriacoes do item (`apropriacoes`) | Sim | Sim | Sim | Não | Ao menos uma apropriacao analitica da obra; sem repeticao; quantidades positivas; soma deve fechar a quantidade do item. |
| acao_auxiliar | Modelo e importacao Excel (`modelo_importacao`) | Sim | Não | Não | Não | A importacao alimenta os mesmos campos dos itens e respeita o limite de 300. |

## 11. Inconsistências e pontos de atenção

| Nível | Código | Detalhe |
| --- | --- | --- |
| ALERTA | `TIPO_INATIVO_REFERENCIADO` | O setor GEO referencia o tipo inativo PROJETOS (#13). |
| ALERTA | `TIPO_INATIVO_REFERENCIADO` | O setor GEO referencia o tipo inativo PRÉ OBRA (#14). |
| ERRO | `TIPO_REFERENCIADO_INEXISTENTE` | O setor GEO referencia o tipo 17, que nao existe no cadastro. |
| ALERTA | `TIPO_INATIVO_REFERENCIADO` | O setor OBRA referencia o tipo inativo EMPRÉSTIMO MATERIAIS (#30). |
| ERRO | `TIPO_REFERENCIADO_INEXISTENTE` | O setor MARKETING referencia o tipo 11, que nao existe no cadastro. |
| ALERTA | `TIPO_INATIVO_REFERENCIADO` | O setor FINANCEIRO referencia o tipo inativo DESPESA ADMINISTRATIVA (#27). |
| ALERTA | `SC_DATA_ITEM_APENAS_FRONTEND` | Na Solicitacao de Compra, Necessario para por item e obrigatorio na tela, mas o backend aceita o campo nulo. |
| ALERTA | `CD_VALOR_ITEM_VALIDACAO_DIFERENTE` | Na Compra Direta, a tela exige valor unitario positivo em cada item; o backend exige valor liquido total positivo, sem repetir a mesma obrigatoriedade por item. |
| ATENCAO | `CD_TIPO_INFORMADO_NAO_REVALIDADO_POR_CODIGO` | Quando tipo_solicitacao_id e enviado na Compra Direta, o backend aceita o cadastro encontrado pelo ID sem confirmar que seu codigo interno seja COMPRA_DIRETA. |

### 11.1 Interpretação dos achados de validação

- **Solicitação de Compra — data por item:** o frontend impede o envio sem “Necessário para”, mas o backend aceita valor nulo. Uma chamada direta à API pode contornar a regra da tela.
- **Compra Direta — valor unitário:** a tela exige valor unitário positivo por item, enquanto o backend concentra a validação no total líquido da compra. As duas camadas não repetem a mesma garantia.
- **Compra Direta — tipo informado:** quando um `tipo_solicitacao_id` é enviado, o backend deve também confirmar que o código interno corresponde a `COMPRA_DIRETA`.
- **Configurações cadastrais:** setores ainda referenciam tipos inativos ou IDs inexistentes. Essas referências não entram nas 303 combinações ativas, mas devem ser saneadas para evitar manutenção confusa.

## 12. Configurações de sistema consideradas

| Chave | ID | Última atualização | Conteúdo auditado |
| --- | --- | --- | --- |
| `MODULOS_HABILITADOS` | 43 | 22/06/2026, 10:57:50 | Sim |
| `NOVA_SOLICITACAO_AUTOMACAO_DESTINO` | 39 | 22/06/2026, 06:01:09 | Sim |
| `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` | 38 | 06/07/2026, 11:41:54 | Sim |
| `TIPOS_SOLICITACAO_POR_SETOR` | 16 | 03/07/2026, 11:24:01 | Sim |
| `AREAS_POR_SETOR_ORIGEM` | 14 | 03/07/2026, 11:21:43 | Sim |
| `AREAS_OBRA_VISIVEIS` | 12 | 19/06/2026, 14:13:16 | Sim |

## 13. Fontes de código usadas no cruzamento

- `backend/src/services/novaSolicitacaoCamposConfig.js`
- `backend/src/services/tipoSolicitacaoBehaviorService.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/validators/operationalValidators.js`
- `backend/src/controllers/SolicitacaoCompraController.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`
- `frontend/src/modules/solicitacao-compra/utils/apropriacoes.js`

## 14. Conclusão

A produção possui 22 setores cadastrados, 29 tipos de solicitação e 303 combinações ativas entre setor e tipo. O relatório registra a configuração efetiva de cada combinação, além dos formulários especializados de Solicitação de Compra e Compra Direta.

Antes de alterar qualquer campo, obrigatoriedade ou disponibilidade, deve-se conferir simultaneamente: configuração no banco, comportamento do tipo, validação do frontend, validação do backend, destino da solicitação e permissões do setor. Essa verificação evita que uma mudança visual deixe a API permissiva ou que uma regra do backend bloqueie um fluxo aparentemente disponível na tela.
