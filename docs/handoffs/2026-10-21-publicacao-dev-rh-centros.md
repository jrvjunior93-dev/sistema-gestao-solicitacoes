# Publicacao DEV: demissao e destinos gerenciais

## Autorizacao e pacote

- Usuario autorizou commit/push refactor/frontend e comandos para EC2 DEV.
- Dois pacotes locais ja validados: conclusao DP das novas demissoes/RH-000235
  e centros de custo como destinos da distribuicao gerencial. Main fora do push.
- Remotos conferidos em 21/10: DEV828ed2ec e main80df6534. Base instalada minima
  aceita pelo roteiro:93f75d67, mesma do roteiro DEV anterior de autorizacao unica.
- Nenhuma migration/dependencia nova; package.json altera so dois scripts de QA.
- Excluir outputs privados, anexos/logs brutos e arquivos de outros checkouts.

## Roteiro e validacoes

- ops/deploy/atualizar-dev-rh-centros-20261021.sh: SHA fixado pelo operador,
  caminho/branch/checkout limpo, lock exclusivo, PM2 DEV online/8001/sem watch,
  automaticas desligadas no processo e .env, identidade/schema somente leitura,
  ancestralidade/ff-only, runtime limitado, migrations/locks imutaveis, pacotes
  comparados semanticamente antes do merge, testes isolados antes de reiniciar
  exclusivamente backend-dev, health e .env preservado. Nao altera memoria.
- backend/scripts/validarDeployRhCentrosDev.js: QA textual do roteiro e guarda
  de package.json. Casos negativos para dependencias/scripts antigos/postinstall.
  Modo --pacotes tambem roda por stdin antes do checkout ser atualizado.
- QA funcional backend dos dois pacotes e regressoes RH/documentos/pagamentos/
  adiantamento reaprovadas nesta publicacao. UI390/1366 dos dois pacotes e lista
  inativa repetidas e aprovadas; build repetido10,61s/631 modulos. Sem novo delta funcional. Sintaxe Node/Bash,
  docs e diff conferidos antes do commit.
- Publicar sem force, exclusivamente HEAD:refs/heads/refactor/frontend, e
  conferir SHA remoto depois. Operador executa roteiro na EC2; agente nao acessa.
- Ownership liberado para publicacao apos validacoes; docs595/19 aprovadas.
- Homologar DEV: colaboracao/ateste/conclusao RH, inativo ate concluir, escopo;
  Administrativo origem e centros/obras destinos, valores/100%/TODAS e relatorio.

## Logs de producao recebidos / memoria

- Evidencia fornecida pelo usuario: tres falhas fatais JavaScript heap out of
  memory, heaps aproximadamente1900MiB, PIDs diferentes. PM2 aparece online
  depois; contador247 e acumulado, nao prova quantos reinicios ocorreram hoje.
- O trecho nao inclui timestamps/correlacao da requisicao. OOM esta confirmado,
  mas o gatilho exato PC-00271 ainda nao esta comprovado. Queries de cotacao
  com varias colecoes e rollback pos-commit sao riscos encontrados em leitura
  do codigo; nenhuma correcao de pedidos foi incorporada a esta publicacao.
- Demais mensagens sao404 de titulo ausente, VAPID_NOT_CONFIGURED e validacao
  salarial400. Nao atribuir OOM a essas mensagens sem evidencia adicional.
- Diagnosticos recebidos: RAM3,7GiB, disponivel2,7GiB no snapshot, sem swap;
  tres processos Node com RSS aproximado415/368/164MiB. Snapshot nao e pico.
  Tipo da instancia/IP elastico ainda pendentes. Usuario priorizou finalizar
  DP/Nova Solicitacao e adiou memoria. Producao/DEV/Experience dividem a maquina.
  Aumento e contencao, nao substitui otimizar a consulta causadora.
- Nao configurar heap, swap, reinicio, resize, banco, .env ou producao pelo agente.

## Continuacao

- Conferir retorno do push (autenticar pelo GitHub se necessario; nunca pedir
  senha/token no chat) e fornecer SHA completo com os comandos do roteiro DEV.
- Mudanca de memoria depende dos dados da EC2 e planejamento de manutencao.
  Resize exige avaliar indisponibilidade, backup, IP fixo e compatibilidade.
