# Protocolo de agentes paralelos

Este nome de arquivo foi preservado para links antigos. O protocolo vigente nao usa
mais uma divisao fixa entre Contratos e Compras.

Leia e siga, nesta ordem:

1. `AGENTS.md`;
2. `docs/COLABORACAO_CODEX.md`;
3. `docs/workspace/PROTOCOLO_AGENTES.md`;
4. `docs/workspace/SESSOES_ATIVAS.md`;
5. `docs/workspace/OWNERSHIP_ATIVO.md`;
6. `docs/workspace/QUADRO_AGENTES.md`.

Regras essenciais:

- todo agente pode atuar em qualquer modulo dentro da tarefa autorizada;
- ownership e por arquivo e temporario, nao por modulo permanente;
- nenhum arquivo pode ter dois editores simultaneos;
- arquivos centrais exigem ownership exclusivo e integracao por turnos;
- banco, migrations, reinicio, deploy e integracao externa exigem autorizacao da tarefa;
- antes de pausar trabalho sensivel nao commitado, atualizar um handoff;
- `outputs/`, segredos e artefatos temporarios nao devem ser apropriados nem commitados.

Em caso de divergencia, os documentos de `docs/workspace/` sao a fonte operacional
mais recente e este arquivo funciona apenas como redirecionamento seguro.
