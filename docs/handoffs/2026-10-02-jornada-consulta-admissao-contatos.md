# Consulta da jornada enviada e contatos adicionais na admissao

## Escopo

- `RH/DP > Pessoal > Pagamento de Mao de Obra > Jornadas enviadas` ganhou `Abrir jornada`, com leitura das linhas originais submetidas. `Ir para Apuracao` permanece como acao distinta.
- O modal `Pedir admissao` permite adicionar, opcionalmente, segundo telefone e segundo endereco. O pedido mostra esses dados na conferencia e a aprovacao os grava no colaborador.
- Endpoint de consulta: `GET /rh/solicitacoes/:id/jornada`, protegido pela permissao de visualizacao de solicitacoes RH/DP e pelo escopo de obras do usuario. A importacao deve ser do tipo `JORNADA` e pertencer a mesma obra da solicitacao.

## Arquivos da tarefa

- `frontend/src/pages/RhDpJornada.jsx`, `frontend/src/pages/RhDpPessoal.jsx`, `frontend/src/pages/RhDpPessoalSolicitacoes.jsx`, `frontend/src/services/rhDp.js`;
- `backend/src/controllers/RhSolicitacaoController.js`, `backend/src/routes.js`, `backend/src/models/RhColaborador.js`, `backend/src/services/rhSolicitacaoService.js`;
- `backend/migrations/202610020001_rh_colaborador_contatos_adicionais.js` e `docs/modulos/rh-dp/README.md`.

## Validacao local

- `node --check` nos arquivos backend alterados: aprovado;
- `frontend/npm run build`: aprovado;
- `backend/npm run test:rhdp-jornada-periodos`: aprovado;
- `backend/npm run test:rhdp-escopo-obra`: aprovado;
- `backend/npm run test:rhdp-regras-pagamento`: aprovado;
- `git diff --check`: aprovado.

## Implantacao e riscos

- Nao foi executada migration, escrita em banco, reinicio ou deploy. Antes de utilizar os novos campos no ambiente, aplicar a migration schema-only no banco correto; backend deve ser publicado antes do frontend que chama o novo endpoint.
- As jornadas anteriores sem `dados_json.importacao_id` nao possuem linhas vinculadas para essa consulta e recebem mensagem de indisponibilidade; a apuracao atual permanece intacta.
- Confirmar em homologacao com usuarios de OBRA e DP: leitura de uma jornada permitida, negativa de leitura em obra nao vinculada, conferencia do segundo telefone/endereco no pedido e persistencia apos aprovar uma admissao de teste.
- O commit desta tarefa deve conter apenas os arquivos de RH/DP, a migration e este handoff; nao incluir os arquivos de auditoria/outputs de outra atividade presentes no checkout.
