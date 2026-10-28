# RH: salario restrito e cadastro limitado da obra

## Pedido e decisoes confirmadas

Usuario pediu salario restrito por colaborador e edicao da obra somente observacoes/documentos. Confirmou ocultar bruto, liquido e totais calculados, mantendo percentuais e ajustes para OBRA e valores completos para DP. Documentos da obra limitam-se aos enviados pela propria obra. Confirmou manter valores para quem possui permissao expressa no Financeiro; esta entrega protege Pessoal/RH, nao revoga o acesso financeiro autorizado.

Somente implementacao/testes LOCAIS. Sem EC2, SQL/banco/S3 reais, migration real, commit/push ou publicacao. Base a645d6a3. Preservar alteracoes anteriores nao commitadas de transferencia operacional e pagamento na obra da solicitacao, documentadas em handoff separado.

## Arquivos e funcionamento

- RhColaborador.js: booleano salario_restrito_obra, padrao false. rhValidators/rhService: criacao/edicao dessa marcacao somente DP autorizado a editar colaboradores ou SUPERADMIN; guarda de servico rejeita cadastro geral por usuario operacional OBRA, inclusive se acumular DP.
- routes.js: middleware exclusivo do prefixo /rh apos autenticacao/modulo; novas portas GET cadastro-obra, PATCH observacoes, POST documentos e GET link. Mantem portas/ACL gerais; adiciona auditoria de sucesso de cadastro e operacoes limitadas. Nenhuma rota de Financeiro/Compras alterada.
- rhPrivacidadeObraDomain.js: projecao sem mutacao do objeto persistido; remove salario/base/diaria/bruto/liquido/derivados/tributos/totais/hashes, inclusive JSON legado. Preserva entradas conhecidas da obra, percentuais/ajustes/reembolso, identificacao e paginacao. Documento interno nao passa pelo cadastro limitado.
- rhPrivacidadeObra.js: regra obtida do servidor, consulta indexada apenas IDs/obra e sem cache entre requisicoes. DP global nao recebe a consulta/filtro. Bloqueia historico salarial, exportacoes e anexos internos; calculos/relatorios RH legados com restritos ficam no DP. Considera tambem vinculo/titulo antigo no local anterior para nao liberar agregados historicos apos transferencia. Consultas historicas condicionais LIMIT1, somente ID. Falha de verificacao e503 antes do handler, sem abrir acesso. Header no-store.
- rhPagamentoSolicitacaoService/Domain: salario nao depende do navegador; obra restrita confere percentuais/ajustes, sem hash salarial. A validacao de desconto contra liquido e adiada SOMENTE nesse preenchimento, evitando oraculo de salario por tentativa/erro. DP mantem validacao financeira canonica antes de titulo/fila. OBRA+DP permanece operacional OBRA. Demais pagamentos mantem regra anterior. Fonte de obra do titulo e s.obra_id (alteracao anterior preservada).
- rhColaboradorObraService/Controller: escopo atual do colaborador e permissao de abrir solicitacoes para escrita; corpo aceita somente observacoes ou metadados de envio. Documentos exigem origem de obra permitida, colaborador correspondente e ativo antes do presign. Usuario nao muda salario/CPF/empresa/banco/lotacao, nao valida documento como DP nem le arquivos internos. Upload usa lock do colaborador, chave idempotente e hash de arquivo/metadados; replay concorrente nao duplica registro/S3, mesma chave com corpo distinto e409.
- Frontend RhDpColaboradores: checkbox DP, payload opcional por permissao. RhDpPessoal: salario Restrito ao DP e editor limitado para OBRA; cadastro geral somente pelos acessos anteriores. RhDpPagamentoModal: nao calcula/mostra valores restritos nem totais mistos, preserva percentuais e ajustes. Novo RhColaboradorObraModal: observacoes e documentos da obra, mutex/preview comum, guarda do workspace, confirmacao ao descartar e notas pendentes preservadas ao anexar. rhDp.js inclui cliente das novas portas.

## Schema preparado, nao aplicado

Migration 202610280001_rh_privacidade_obra.js: salario_restrito_obra BOOLEAN NOT NULL DEFAULT false em rh_colaboradores; obra_origem_id nullable e chave_envio_obra nullable em rh_documentos; indice cobrindo flag/obra/id e indice unico colaborador/chave de envio. Up aditivo/idempotente sem DML/backfill. Down recusa remocao automatica. Documentos legados continuam sem origem de obra e privados do DP.

Backend novo depende desse schema. Publicacao separada: operador confere backup/ambiente, aplica somente migration aditiva aprovada e backend DEV, envia PRONTO; depois frontend DEV. O pacote novo foi preparado apos autorizacao de commit/push, conforme handoff2026-10-28-publicacao-rh-privacidade-dev.md. Nao usar aplicadores antigos nem migrations gerais para enviar estes arquivos. Producoes/main/limite Node4096 e ambientes nao foram tocados.

## Validacoes executadas

- validarRhPrivacidadeObra.js: projecao pura/JSON/escalares/base/tributos/agrupados/hashes, privacidade API/lista/paginacao, DP sem filtro extra, OBRA+DP, alteracao de regra sem cache, negativas de historico/exportacao/anexos e relatorios historicos por vinculo/titulo, falha fechada; observacoes com campos forjados negados; arquivos DP/outra obra bloqueados; presign apenas autorizado; replay concorrente; schema aditivo/idempotente e down sem destruicao. PASS com rede bloqueada.
- validarRhPagamentoSolicitacao.js: servico real e modelos transacionais em memoria; 40/60/ajustes sem salario/base/hash/total na resposta, base real preservada, mudanca cadastral sem expor salario, desconto excessivo aceito apenas para conferencia, DP impede titulo ate corrigir e depois gera valor correto. Mais casos anteriores de transferencia, conferencia, escopo, vale/dinheiro, rascunho, fila, replay/rollback. PASS.
- validarRhConsultaSalario.js: campo booleano/ACL DP e SUPERADMIN, negacao OBRA/OBRA+DP e cadastro geral, salario e historico salarial intocados ao mudar privacidade; regressoes salariais/consulta. PASS.
- validarRhColaboradoresPlanilha.js, validarRhColaboradorContatos.js, validarRhPagamentoEnvioParcial.js, validarRhLotacaoCadastro.js, validarEscopoRhDpUsuarioObra.js, validarColaboradoresLocaisEscopos.js e auditoria granular401 permissoes PASS. Mocks de autorizacao da planilha/lotacao/envio parcial atualizados somente para a nova verificacao obrigatoria do servico.
- validarRhPrivacidadeObraUI.mjs: componentes/HTTP reais com respostas ficticias e projecao real do backend;1366/390, salario/bruto/liquido/totais ausentes,60% e ajustes numericos no payload, DP com valores e checkbox persistido, edicao somente observacoes, corpo restrito, upload unico por duplo clique e notas preservadas. Capturas inspecionadas em outputs/rh-privacidade-obra.
- validarRhColaboradorContatos.mjs e validarRhPagamentoSolicitacaoUI.mjs reaprovados em desktop/mobile, com workspace, retorno, edicao/cadastro, envio parcial, dinheiro/vale e conferencia.
- Build frontend final17.27s aprovado (avisos preexistentes Browserslist/chunks). Sintaxe e diff aprovados. Documentacao validada:693 arquivos Markdown e19 documentos canonicos PASS.

## Limites/proximo passo

Regra de sigilo aplicada na proxima leitura; nao retira conhecimento ou arquivos ja recebidos anteriormente. Dados livres de observacoes e documentos enviados pela propria obra seguem visiveis conforme autorizado. Financeiro explicitamente autorizado continua fora desta restricao, por decisao do usuario.

Usuario autorizou posteriormente commit/push DEV e comandos manuais, registrados no handoff de publicacao. Backend/schema DEV antes do frontend; homologar os casos documentados antes de promover a main. Nao alterar artefatos de deploy anteriores, dados legados, documentos internos, NSDOCS/flags ou limites de memoria.
