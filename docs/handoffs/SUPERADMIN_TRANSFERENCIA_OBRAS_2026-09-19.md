# Handoff — acesso global do SUPERADMIN e transferência entre obras

Data: 2026-09-19  
Branch: `refactor/frontend`  
Estado: implementado e validado, ainda não commitado.

## Escopo implementado

- `SUPERADMIN` passou a ignorar restrições centrais de perfil, obra, setor e permissões granulares estritas.
- O diretório global e as transferências de colaboradores ficaram acessíveis ao `SUPERADMIN` sem vínculo de obra.
- A obra atual do colaborador é fixa no fluxo de transferência.
- O campo de destino apresenta todas as obras ativas; quando o usuário não responde pela origem, destinos fora da responsabilidade dele aparecem desabilitados.
- O servidor determina qual obra está solicitando, sem confiar em escolha enviada pelo navegador.
- Responsável somente pela origem: destino aprova.
- Responsável somente pelo destino: origem aprova.
- Mesmo responsável nas duas obras: aprovação e mudança de vínculo automáticas, na data da solicitação.
- A efetivação automática ocorre na mesma transação, atualiza o vínculo histórico e a obra atual do colaborador e registra `ABERTURA` e `APROVACAO_AUTOMATICA` no histórico.

## Arquivos alterados

- `backend/src/middlewares/permissions.js`
- `backend/src/services/authorizationService.js`
- `backend/src/services/rhTransferenciaService.js`
- `backend/src/constants/moduloPermissoes.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `backend/src/services/rhSolicitacaoService.js`
- `backend/src/routes.js`
- `backend/scripts/validarEscopoRhDpUsuarioObra.js`
- `frontend/src/pages/RhDpTransferencias.jsx`

## Validações executadas

- `npm run test:rhdp-escopo-obra`: aprovado.
- `npm run test:roteamento-aditivo-juridico`: aprovado.
- `npm run build` no frontend: aprovado.
- `node --check` nos arquivos backend alterados: aprovado.
- `git diff --check`: aprovado.
- `npm run test:responsive`: interrompido por 3 falhas preexistentes e fora deste escopo em `FinanceiroFilaPagamentos.jsx`, `FinanceiroTitulos.jsx` e na cobertura de duas telas de configuração. Nenhuma falha apontou `RhDpTransferencias.jsx`.

## Observações e próximo passo

- Não há migration: os novos metadados ficam em `rh_solicitacoes.dados_json`.
- A pasta não rastreada `outputs/` não pertence a este trabalho e deve continuar fora do commit.
- Próximo passo exato: validar o diff, executar novamente `npm run test:rhdp-escopo-obra` e, quando solicitado, commitar apenas os arquivos listados acima e este handoff.
