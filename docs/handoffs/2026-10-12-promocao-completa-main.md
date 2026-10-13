# Promocao completa para main incluindo DP — 2026-10-12

## Autorizacao e referencias

Usuario autorizou migrar todas as alteracoes publicadas para main, agora
incluindo DP. Backup recente conferido no Drive cifrado e timer ativo confirmados.
Main: 528e8c838a383c71be76f00b21fa8fe54d6c4e8d; refactor/frontend:
1d7951b9da9abf41c0b7dfab0b685ae55b76b53c. Integracao isolada em
codex/promocao-completa-main-20261012. Nao substituir historico da main.

## Schema e ordem de publicacao

Consulta somente leitura na EC2 confirmou identidade de producao esperada e
259 migrations registradas frente a 264 do alvo. Pendentes:

- 202610090001_pix_copia_cola_texto.js
- 202610110001_adiantamento_prestacao.js
- 202610110002_solicitacao_interacoes_usuario.js
- 202610120001_solicitacao_favorecidos.js
- 202610120002_adiantamento_favorecidos.js

O primeiro comando de preflight fornecido tinha path Git relativo incorreto e
produziu lista vazia. Resultado descartado; comando corrigido exige 264 arquivos.
Nao confundir o falso zero com aprovacao do schema.

Main nao publicada nesta preparacao. Ordem: validar integracao local; testar
migrations em copia isolada; aplicar expansoes compativeis com backup/janela;
backend integrado e health; somente entao publicar main/frontend e smoke real.
Nao copiar .env entre ambientes nem executar down destrutivo.

## Preservacao

Tag local backup/main-pre-completa-20261012-528e8c83 e bundle completo
verificado em outputs/promocao-completa-20261012/main-528e8c83.bundle.
Bundle local nao substitui copia externa; nenhuma credencial foi copiada.
Preservar tres arquivos locais de auditoria da EC2 e alteracoes de outros
trabalhos no checkout refactor. Outputs fora de commit.

## Estado

Preparacao iniciada. Conflitos detectados por merge-tree; ainda requer resolucao
por dominio e testes do resultado completo. Nenhuma migration/banco, restart,
main remota ou Vercel de producao alterados por esta etapa.
