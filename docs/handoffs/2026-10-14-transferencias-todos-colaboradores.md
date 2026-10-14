# Transferencias: todos os ativos e colaboradores sem obra

## Escopo concluido

Pedido do usuario: mudar o diretorio para Todos Colaboradores, listar todos os ativos independentemente da obra aberta e permitir solicitacao para colaborador sem obra.

Frontend deixa de enviar filtro local ao diretorio, altera rotulo/ARIA, permite abrir formulario sem origem e apresenta o fluxo de responsabilidade do destino. Backend mantem projecao profissional minima e acesso autenticado existente; remove filtro de obra apenas do diretorio, nao da lista de transferencias. Sem obra atual, exige responsavel vigente do destino (ou SUPERADMIN segundo regra existente), confirma automaticamente a alocacao e registra justificativa/vigencia/historico. Nao inventa obra de origem. Transferencias entre obras continuam bilaterais conforme regras existentes.

Historico de lotacao inicial pode ser criado sem vinculo aberto. Vinculo divergente, admissao futura, desligamento anterior e colaborador inativo continuam bloqueados. Origem sem obra e registrada explicitamente para reconhecer o pedido sem confundir primeira_lotacao legada. Lock do colaborador/transacao e protecao contra pedidos pendentes permanecem; reenvio para mesmo destino nao cria nova lotacao.

## Arquivos

- backend/src/services/rhTransferenciaService.js
- backend/src/services/rhPessoalDomain.js
- frontend/src/pages/RhDpTransferencias.jsx
- backend/scripts/validarRhPessoalFluxo.js
- frontend/scripts/validarRhPessoalTransferencias.mjs
- docs/modulos/rh-dp/README.md

## Validacoes

Build frontend aprovado. Teste backend --transferencias aprovado com fixtures sem banco: diretorio global, privacidade, fluxo bilateral, responsabilidade, sem origem, inativo e repeticao. Teste de escopo RH/DP aprovado. Teste UI atualizado para rotulo/diretorio/formulario sem origem, busca, paginacao e desktop/mobile, com API simulada. Documentacao e diff --check aprovados.

Suite antiga completa validarRhPessoalFluxo possui fixture desatualizada de jornada (dependencia crypto nao simulada); validacao desta tarefa usa opcao --transferencias para isolar o fluxo afetado. Fixtures de transferencias modernizadas para notificacoes/codigos/fluxo automatico ja existentes. Nenhum comportamento de jornada foi alterado.

## Proximo passo

Publicacao na refactor/frontend autorizada pelo usuario. Integrar avancos remotos e publicar apenas este escopo. Atualizacao da EC2 dev sera executada exclusivamente pelo usuario em /home/ubuntu/sistema-gestao-solicitacoes-dev, reiniciando apenas backend-dev. Sem migration ou mudanca de dependencias. Alteracoes concorrentes e outputs ficam fora do commit.
