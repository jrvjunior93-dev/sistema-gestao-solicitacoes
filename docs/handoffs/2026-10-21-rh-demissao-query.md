# Hotfix DEV: consulta de colaboradores com demissoes pendentes

## Autorizacao e diagnostico

- Usuario reportou400 ao testar demissao em DEV, depois autorizou corrigir,
  testar, commitar/push refactor/frontend e comandos de atualizacao EC2 DEV.
- Base DEVba4a41b2; main80df6534 somente leitura. Branch local isolada
  codex/rh-demissao-query-20261021. Agente unico; outputs privados excluidos.
- Mensagem reproduzida localmente: Consulta de colaboradores RH/DP contem
  campos nao permitidos: incluir_demissoes_pendentes. Causa: nova flag existia
  em frontend/servico, mas faltava em whitelist e DTO da query normalizada.
- Teste anterior chamava o servico com flag diretamente e nao cobria essa
  fronteira. Teste novo deu400 antes da correcao; passou200 depois.

## Mudanca minima

- Runtime alterado somente backend/src/validators/rhValidators.js, funcao
  validateRhColaboradorQuery: permitir a chave, validar estritamente string0/1
  quando presente e preservar a flag no resultado. Ausente nao ativa o opt-in.
- Rejeitar bool/numero/null/array/objeto/string invalida ou vazia; nao aceitar
  escopo interno, mantendo todos os campos/regras da query anterior.
- Nenhuma alteracao em middleware/rota/ACL/controller/servicos runtime, frontend,
  cadastro, vinculos, historico, financeiro, banco/storage reais ou producao.

## QA e deploy

- validarRhDemissaoConclusao.js agora conecta middleware/validador reais ao
  controller da listagem e servico real, com modelos/persistencia em memoria.
- Positivos: nova/RH-000235 pendentes, opt-in preservado ate o servico, flag0
  e ausente com comportamento antigo, busca, query exata obra3/statusATIVO/1,
  DP e retirada depois da conclusao. Sem obra/statusATIVO nao amplia a regra.
- Negativos: formatos invalidos/arrays/objetos, status/obra invalidos, campos
  internos de escopo, fora da obra403, escopo vazio. Comparacao dos stores antes/
  depois comprova consulta sem escrita. Rota conserva guarda de leitura existente.
- Regressoes backend aprovadas: admissao diaria, contatos, consulta salario,
  documentos, pagamento/envio parcial, performance DP, pedido/reabertura/logs e
  distribuicao gerencial. Suite UI de demissao/lista390/1366 aprovada novamente.
- Sem alteracao de frontend, package.json/lockfiles ou dependencias; build
  frontend anterior continua aplicavel. Nenhuma migration necessaria.
- Reusar roteiro ops/deploy/atualizar-dev-pedido-reabertura-20261021.sh e guarda:
  incluir rhValidators no allowlist/sintaxe, mantendo SHA fixo, ancestrais/ff-only,
  branch/caminho/checkout limpos, lock, PM2DEV online/8001/sem watch, schema e
  identidade DEV readonly, .env preservado, so restart backend-dev apos testes.
- Roteiro aceita checkout desde828ed2ec com demais pacotes DEV ja publicados;
  nenhuma dependencia, flag, memoria ou migracao e modificada. Agente nao executa EC2.
- Node/Bash, guardas, documentacao e diff conferidos antes de publicar; verificar
  SHA remoto apos push exclusivamente HEAD:refs/heads/refactor/frontend.
- Guardas/Node/Bash/docs597/19/diff aprovados. Ownership liberado para publicacao;
  enviar SHA completo do commit ao operador e conferir retorno do push.

## Homologacao pelo operador

- Atualizar apenas DEV com o novo SHA e recarregar a pagina ja publicada.
- Entrar com usuario de obra autorizado (mesmo modo de teste reportado), abrir
  Colaboradores da obra3: consulta nao deve retornar400. Nao ampliar permissoes
  nem refazer vinculos como contorno. Testar usuario fora da obra: manter negacao.
- Na obra correspondente conferir RH-000235/new: pendente visivel inativo,
  comentarios/anexos/ateste, DP concluir e retirada da lista sem apagar historico.
- Se interromper o roteiro, enviar saida sem contornar guardas; sem deploy main.
