# Handoff - remediacao de dependencias do backend

Estado da preparacao em 02/10/2026: implementacao validada em worktree isolado.
O historico Git registra separadamente o commit e a publicacao posteriores.

Arquivos alterados: `backend/package.json`, `backend/package-lock.json`,
`backend/scripts/validarDependenciasBackend.js`,
`docs/seguranca/REMEDIACAO_DEPENDENCIAS_BACKEND_2026-10-02.md` e
`docs/workspace/OWNERSHIP_ATIVO.md`.

O plano, a matriz de testes, os tres alertas moderados residuais e os comandos
condicionais para a EC2 dev estao no documento de seguranca acima. Nenhum banco,
EC2, SMTP externo ou ambiente de producao foi alterado. O teste
`test:security-hardening` possui falha preexistente de permissao granular
(`Botao Cadastros ...`) e nao foi modificado nesta tarefa.

Proximo passo operacional apos a publicacao: preservar a alteracao local
`backend/package-lock.json` identificada na EC2 dev, atualizar por fast-forward
e executar o roteiro da EC2 dev. Conferir o HEAD remoto e parar diante de
qualquer falha de instalacao, teste ou preflight.
