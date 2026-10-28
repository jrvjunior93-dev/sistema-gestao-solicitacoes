# Promoção isolada de precisão de compras para main

Usuário autorizou migrar somente o arredondamento e fornecer os comandos para produção, sem acessar EC2 e sem ajustar PC-00299. Fonte DEV a35a2139608ad26133ef65c73dc50a0e5dc9b4d8 homologada pelo operador: duas colunas ampliadas, QA e restart backend-dev concluídos e conferidos, zero gravações de negócio.

## Base e integração

Base main d6e3cc1e9b2028f746ad75a2a0fbf4981bc69722, branch isolada codex/compras-precisao-main. Patch seletivo somente da funcionalidade, seus testes e migration; não houve merge geral da dev.

Main ainda usa quantidade solicitada na proposta normal e quantidade da nova oferta no modo saldo. Essas regras e a reabertura financeira da main foram preservadas. Não promover disponibilidade/favorecido/paginação/RH adicionais da dev. Conflitos nos dois formulários resolvidos combinando a base de quantidade da main com o núcleo decimal homologado. Ajustado o assert de cotação para verificar a mesma base no novo cálculo.

## Conteúdo

Núcleo BigInt CJS e ESM gerado, validação sem coerção intermediária para Number, preços com10casas em pedido/alocação, edição e PDFs, total HALF_UP e resíduo distribuído nas linhas. Modelos, controllers e services somente de precisão. Preços já gravados não são substituídos e eventos históricos não são reescritos.

Migration nomeada altera duas colunas e registra o ledger técnico. Nenhum recálculo, UPDATE/INSERT/DELETE de negócio, título, baixa ou chamada de integração externa. PC-00299 não consta de executor financeiro ou plano aplicável no pacote. Simulador e dados da auditoria continuam fora da publicação.

Aplicador PROD/manifesto/schema doctor derivados dos procedimentos PROD já verificados: revisão exata, snapshot completo de processos, heap4096/ambientes, daemon e dumps, planos/histórico/XMLs e automático OFF. Banco/UUID/TLS PROD, timer/backup/manutenção obrigatórios. Somente restart backend-solicitacoes, sem tocar DEV. DDL sem promessa de rollback; repetição reconhece colunas ampliadas e não repete restart incerto.

## Validação local e operação

Validação aprovada: oito cenários núcleo/API/modelos/migration em memória e21casos de schema/aplicador; regressões de cotação/remanejamento/financeiro/reabertura/paginação (oito cenários SQL SQLite) aprovadas. UI real de edição com10casas no blur/PATCH, status, ACL/GEO/repetição/recuperação de falha, desktop1366/mobile390 aprovada, API isolada e sem chamadas inesperadas. Build13,60s aprovado com avisos preexistentes. Hashes do inventário conferidos antes da publicação. Não confundir construtor Sequelize/SQLite em memória com consulta MySQL: nenhuma conexão a EC2/banco/S3 foi aberta.

README: ops/deploy/README-precisao-compras-prod-20261028.md. Operador executar preparar/aplicar/conferir com o commit completo publicado e enviar os resultados sanitizados. main e frontend seguem pipeline normal; nenhuma operação financeira autorizada implicitamente pelo deploy.
