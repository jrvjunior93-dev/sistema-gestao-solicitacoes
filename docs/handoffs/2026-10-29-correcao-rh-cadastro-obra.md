# Correcao do cadastro limitado do colaborador pela obra - 29/10/2026

## Escopo e base
Usuario solicitou corrigir erro500 na abertura do cadastro limitado noDEV,
preservando edicao apenas de observacoes e envio de documentos. Branch
codex/rh-cadastro-obra-correcao sobre origin/refactor/frontend72c0cc47.
Nenhuma EC2, banco real, S3, .env ou credencial acessados. Sem migration/deploy.

## Causa reproduzida
RhDocumento pertence a RhDocumentoTipo pelo alias tipoDocumento no models/index.
O servico usava include as tipo, causando SequelizeEagerLoadingError antesSQL,
inclusive sem documentos. O mock antigo de findAll nao validava associacoes.

## Arquivos alterados
- backend/src/services/rhColaboradorObraService.js: include/DTO usam tipoDocumento.
- backend/scripts/validarRhCadastroObraAssociacao.cjs: modelos e associacao do
  registro reais, geradorSQL real com query em memoria e conexao proibida;
  casos com/sem documentos e reproducao negativa do alias antigo.
- frontend/src/components/rh/RhColaboradorObraModal.jsx: falha de carga substitui
  loading por erro com retry; cleanup impede resposta antiga apos fechar/trocarid.
- frontend/scripts/validarRhPrivacidadeObraUI.mjs: regressao erro500/retry em
 1366/390 alem dos fluxos anteriores de salvar/upload/privacidade/duploclique.
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff.

## Validacoes
- node --test backend/scripts/validarRhCadastroObraAssociacao.cjs:2casos PASS.
- validarRhPrivacidadeObra.js com semRedeQa: escopo,campos permitidos,arquivos
  privadosDP/outraobra negados,idempotencia concorrente e rollback PASS.
- validarRhConsultaSalario.js com semRedeQa: ACL/privacidadeDP/obra PASS.
- validarRhPrivacidadeObraUI.mjs: desktop/mobile,save,upload,mutex,retry PASS.
- node --check e git diff --check PASS.

## Limites e proximo passo
Correcao local ainda nao commitada/publicada. Continuar apenas estes arquivos.
Publicar na refactor/frontend quando solicitado; exige atualizacao do servico
backendDEV e frontend. Main e deploys anteriores preservados. Sem mudanca de
schema/permissoes/campos financeiros. O erro visto e compativel com a causa
reproduzida; confirmacao operacional somente apos deploy pelo usuario.

Build frontend aprovado em15,72s; avisos existentes de Browserslist/chunks grandes. Nenhuma dependencia alterada.

## Publicacao autorizada
Usuario autorizou commit/push refactor/frontend e comandosEC2DEV.
Novo aplicador atualizar-dev-rh-cadastro-obra-20261029.cjs/test/manifesto/README
base72c0cc47,1runtime,QA restrito e snapshot sem indice bruto.10testes aplicador
PASS,2associacao reais PASS e2suites privacidade/salarioPASS com rede bloqueada.
UI1366/390 e build15,72s aprovados. Nenhum testeDB/S3/EC2 real pelo agente.
Proximo: usuario executa --backend e --conferir pelo NodeDEV isolado;
aguardar RH_CADASTRO_OBRA_BACKEND_DEV_PRONTO e validar tela com usuarioOBRA.
Publicacao frontendVercelDEV segue commit; main inalterada. Ownership de edicao
liberado aposcommit. Nao reutilizar operador de destaques para esta correcao.
