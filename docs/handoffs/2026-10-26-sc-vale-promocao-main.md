# Promocao SC reversivel e Vale - 26/10/2026

Usuario autorizou migracao main e comandos manuais de producao, sem cancelar nenhuma SC ou acessar EC2 pelo agente. Base main98d04a2177c2f0b54b46c30c18c6e79f614970d4; preservar acesso a apropriacoes ja publicado. Nao promover refactor/frontend inteira.

SC: delta funcional de e6dc38d4 com migration/exports exatamente da versao homologada6618f6ca. DEV homologado nas SC67/68, pedido28/item50, lote4d36256c-0d60-4333-803e-d8bbc2c90b54, duas operacoes revertidas; pedido10/R$100/4recebidos/saldo6 e historicos conferidos. Teste live foi SUPERADMIN sem titulos/baixas; nao alegar live negativo financeiro. Testes locais cobrem guards e conflitos.

Vale: sete arquivos do checkout compras-criacao-main/Fluxy-refactor-frontend (handoff2026-10-26-pagamento-vale.md). Somente coluna Vale, valor independente de salario/diaria, identificacao no JSON/titulo/consulta. Categoria/permissoes/biometria/baixas preservadas; nao ha migration de Vale. Nenhum fonte alheio editado; ownership da origem avisado para nao duplicar promocao. Cheques fora do pacote.

Atualizador PROD exclusivo: preparar -> aplicar (arquivos/QA -> migration002 -> conferir -> restart somente backend-solicitacoes) -> conferir. Novo doctor TLS/UUIDPROD/canal dedicado, allowlist de CREATE TABLE journal e indice unico, unica insercao na ledger. Repeticao e recuperacao entre CREATE/indice testadas; MySQLDDL pode autocommit, nunca usar down destrutivo. Nao importa models/index nem runner geral.

Guarda Nodes PROD/DEV/Experience24.22.1, daemon/dumps/systemd/.env/politicas, automatico NSDOCSOFF, planos/historico privados e carga pausada. Recusa capturas/locks ativos, outras migrations pendentes, outras bases e fontes divergentes. Nao cancela SCs, nao muda financeiro, nao executa CLI de operacoes de lote nem consulta externa. API nova e reutilizavel/autenticada; lote real continua restrito aos95alvos da planilha revisada e depende de autorizacao/executar separado pelo usuario.

Validacoes:23testes SC dominio/servicos/cliente/permissoes;7doctor PROD;servico Vale real em memoria;UI Vale desktop/mobile e demais fluxos RH;buildfrontend. Regressoes compras/entregas/titulos/baixas/ACL/biometria/autorizacao. Teste antigo de escopo RH tinha mock transaction semLOCK.UPDATE; corrigido SOMENTE o harness, com assert do lock real, sem alterar rhSolicitacaoService. Aplicador com testes de inventario/hash, fases, bloqueio de falha de migration, retomada e preservacao de pares. Consultar resultado final registrado no ownership.

Publicacao em duas etapas: commit backend/doctor/operador primeiro, sem frontend; quatro arquivos frontend Vale/teste em commit local separado apos backend. Nao publicar frontend antes do usuario enviar SC_VALE_BACKEND_PROD_PRONTO. Nao executar SSH, SQL remoto, migration, restart, captura NSDOCS ou cancelamento pelo agente. Backups atuais/timer/janela confirmados pelo usuario nos comandos; nao usar confirmacoes antigas implicitamente.

- QA de promocao concluido:30testes SC/doctor PROD,7testes do aplicador,servico Vale em memoria,UI desktop/mobile,buildfrontend,16regressoes e documentacao651MD/19canonicos aprovados. Corrigido somente mock de lock no teste antigo de escopo RH. Ownership de implementacao liberado; publicacao backend autorizada, frontend aguarda retorno EC2.
