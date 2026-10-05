# Handoff — Financeiro: leitura versus operações

## Pedido e decisão funcional

O usuário confirmou que a divisão entre GEO e FINANCEIRO deve ser feita **por permissões granulares, não por setor**. Cada página do módulo Financeiro precisa de permissão própria de leitura, e cada operação precisa de permissão de ação independente. Em particular, `financeiro.titulos.visualizar` não pode autorizar baixa, edição, negociação ou parcelamento. O operador da fila poderá registrar baixa somente pela fila quando receber `financeiro.fila_pagamentos.baixar`; não deve obter baixa direta do título por consequência disso. Ver a aba Financeiro de uma solicitação também não deve liberar seus botões.

O controle diário discutido na mesma sessão incide na conta marcada COFRE CSC (única marcada na consulta de produção apresentada pelo usuário), bloqueando baixa na fila e carteira de cheques de terceiros quando faltar fechamento anterior/abertura de hoje; upload de comprovantes permanece disponível. Não executar escrita no banco de produção.

## Estado local após implementação

Implementação preparada na branch `codex/controle-diario-permissoes-financeiro`, base `origin/main` em `ad3fc809`. Em 05/10/2026, o usuário autorizou commit, push e promoção para `main`. Essa promoção não inclui alteração de banco de produção nem atualização/reinício da EC2. O frontend pode ser implantado automaticamente pela Vercel após o push da `main`, conforme a configuração do projeto.

Arquivos alterados: `backend/package.json`, `backend/src/constants/moduloPermissoes.js`, `backend/src/generated/navegacaoFonteUnica.cjs`, `backend/src/middlewares/controleDiarioFinanceiro.js`, `backend/src/routes.js`, `backend/src/services/{authorizationService,caixaDiarioConfigService,caixaFinanceiroService,financeiroRotaPermissoesService}.js`, `backend/scripts/validarPermissoesFinanceiroRota.js`, `frontend/src/App.jsx`, `frontend/src/navigation/navigationConfig.jsx`, `frontend/src/utils/acessoProduto.js`, `frontend/src/pages/{ComprovantesPendentes,FinanceiroBancos,FinanceiroBoletos,FinanceiroCadastros,FinanceiroConciliacao,FinanceiroFaturaCartaoDetalhe,FinanceiroFilaPagamentos,FinanceiroFinanciamentosBancarios,FinanceiroObras,FinanceiroTituloDetalhe,FinanceiroTitulos}.jsx`, `frontend/src/pages/SolicitacaoDetalhe/{FinanceiroCard,index}.jsx`, este handoff, `docs/workspace/OWNERSHIP_ATIVO.md` e `docs/modulos/financeiro/CAIXA_FISICO_ABERTURA_FECHAMENTO.md`.

- As 72 rotas financeiras legadas que usavam somente `allowFinanceiro` têm agora mapeamento explícito por método e ação, com negação para rotas sem mapeamento. A política cobre título, conciliação, transferências, cadastros, cartões, financiamentos e o sub-roteador bancário. As demais rotas que já possuíam middleware específico conservam sua chave granular.
- Novas chaves no registro central: leitura/ação de comprovantes; editar título, cobrança e status interno; transferências; cartões; financiamentos; baixas realizadas; importação histórica de obras; gerenciamento de atalhos da conciliação; operação da aba Financeiro de Solicitações.
- Menu e guardas de rota passaram a exigir a chave exata nas telas de títulos, cadastros, conciliação, cartões, financiamentos, comprovantes e configurações de status interno. Telas de listagem/detalhe escondem ou desabilitam ações sem a chave correspondente. `financeiro.titulos.visualizar` não concede criação, baixa, negociação, exclusão ou estorno; a fila não cria link para título sem essa leitura.
- A aba Financeiro da solicitação pode ser vista com `solicitacoes.acoes.ver_aba_financeiro` e só operada com `solicitacoes.acoes.operar_aba_financeiro`; criar título ali exige também `financeiro.titulos.criar`. A obra permanece somente leitura.
- O controle diário usa apenas contas ativas com `exige_abertura_fechamento=true` e data operacional de São Paulo. Para responsáveis configurados e flag ativa, falta de fechamento anterior ou abertura atual bloqueia baixa na fila e acesso à carteira de cheques (HTTP 423), sem bloquear upload de comprovantes, outras consultas ou conciliação.

## Validações locais

Passaram: `npm run test:permissoes-financeiro-rotas` (72 rotas + exemplos do controle diário), `npm run test:permissoes-granulares` (registro sem chaves inválidas/duplicadas), `npm run test:caixa-fisico`, `npm run test:fila-pagamentos`, `npm run test:navegacao`, `npm run build` no frontend e `git diff --check`. Os testes locais não substituem um ensaio autenticado com perfis reais nem demonstram o estado da EC2.

## Configuração e próximo passo

O registro central já alimenta a mesma matriz `PERMISSOES_AREAS_USUARIOS`, com padrão por setor/perfil e concessões/bloqueios individuais. Antes de ativar o bloqueio, definir explicitamente os responsáveis em `FINANCEIRO_CAIXA_DIARIO_CONFIG` e conferir que só a conta pretendida está marcada. Configurar em homologação pelo menos: usuário Financeiro com fila/cheques (sem baixa direta de título); usuário GEO com leitura/edição/conciliação; usuário somente consulta; exceção individual; superadmin. Verificar respostas 403/423 e a rotina de abertura/fechamento com conta de teste. Não alterar registros de produção para fazer esses ensaios. Após a promoção da `main`, a atualização do backend na EC2 e a ativação/configuração da rotina são passos separados.
