# Pessoal por local e conferencia por solicitacao - 2026-10-08

## Estado e autorizacao

Implementacao na branch `refactor/frontend`, sobre
`c7e3d31a8f69bc2caf638e5bbd947d5a3fc4a44f`. Apos a entrega local, o usuario
autorizou commit e push somente nesta branch; publicacao em andamento.
Usuario confirmou a reorganizacao grande e pediu conferencia, ajustes e
geracao de titulos por solicitacao no mesmo modal. Nenhum banco real,
migration, ambiente, EC2, reinicio ou deploy foi acessado nesta tarefa.
Preservar `outputs/` sem versionar.

## Fluxo implementado

- Usuario operacional entra pelos locais vinculados, incluindo centros de
  custo. Cada local abre Gestao de Colaboradores com Colaboradores,
  Solicitacoes e Transferencias entre obras.
- Primeira acao da linha solicita pagamento individual; acao do topo abre
  envio coletivo daquele local. Reutiliza jornada legada, etapas e gerencial,
  com dias, faltas, acrescimos, descontos e detalhes existentes.
- DP abre a jornada em Solicitacoes. O mesmo modal consulta/prepara a
  apuracao, persiste ajustes e caixas de conferencia, revisa o fechamento e
  gera os titulos. Reabrir consulta o fechamento existente, sem nova geracao.
- DP e administradores preservam as ferramentas globais. Links anteriores
  continuam disponiveis. Apuracoes antigas compartilhadas e multiobra nao
  sao separadas automaticamente: modal somente leitura e encaminhamento
  explicito para consolidacao geral, preservando protecao de salario.

## Impactos e arquivos

- `RhDpPessoal.jsx`, `RhDpPessoalSolicitacoes.jsx`, `RhDpPagamentoModal.jsx`
  e `rh-pessoal-locais.css`: navegacao, escopo local, modal e protecao de
  fechamento durante gravacao. Filtro usa catalogo `escopo=TODOS` somente
  dentro dos vinculos e permissoes existentes.
- `RhDpJornada.jsx`, `RhDpJornadaGerencial.jsx/.css`: reutilizacao dos envios,
  roster historico, selecao individual/coletiva, controles financeiros e
  protecao contra cliques simultaneos/respostas atrasadas. Nenhuma flag
  de fluxo foi ativada.
- `RhDpApuracao.jsx`: reutilizacao das rotas de contexto, ajustes, conferencia
  e fechamento; mesma validacao, controle de revisao, PIX e permissoes.
- `RhSolicitacaoController.js`: filtro opcional `obra_id`, positivo e dentro
  do escopo autorizado; local nao autorizado retorna lista vazia.
- `rhJornadaFormularioService.js`: novos modais criam solicitacoes
  independentes tambem com etapas desligadas. Chave e hash de idempotencia
  existentes previnem duplicidade; fluxo legado nao substitui esses pedidos.
- `rhApuracaoService.js`: preparacao mensal isolada pela fonte da solicitacao;
  mutex da obra antes da leitura transacional; retomada de apuracoes antigas;
  consolidacao global exclui colaborador/fonte ja reservado numa apuracao
  independente aberta, sem descartar o restante de um envio misto.
- Testes isolados novos no backend/frontend, ajuste da fixture de conferencia,
  scripts em ambos `package.json` e guias de RH atualizados. Sem dependencias
  novas ou alteracao de lockfile.

## Validacoes

- `npm run test:rhdp-pessoal-solicitacao`: aprovado sem banco/rede. Cobertura
  de fontes, repeticao simultanea, hash, escopo, exclusao na preparacao global,
  persistencia, conflito, retorno e fechamento protegido.
- Validadores backend de escopo RH, regras de pagamento, pagamento gerencial,
  periodos/edicao de jornada e etapas 40/60 aprovados, sem banco real.
- UI real com servicos em memoria: locais, tres abas, envio individual e
  coletivo, centro de custo, ajuste persistido, conferencia, fechamento no
  modal, retomada sem duplicidade, compartilhada somente leitura,
  permissoes e largura mobile. Testado nos modos legado, etapas e gerencial.
- Build de producao aprovado. Avisos existentes de Browserslist e tamanho
  de chunks, sem erro de compilacao.
- Testes anteriores de icones do Pessoal e conferencia guiada aprovados.
  Conferencia guiada valida reload, autosave, rascunhos, erro/retry,
  invalidacao, permissoes, preparacao explicita, fechamento e responsividade.
- `git diff --check` e validacao de documentacao aprovados.
- Limitacao conhecida: `validarRhPessoalFluxo.js` tem fixture antiga sem mock
  de `./notificacoes` exigido pelo servico de transferencias, nao modificado
  nesta tarefa. Nao foi considerado aprovacao da suite inteira.
- Fixtures Vite apresentaram timeout de inicializacao; os testes de Pessoal
  e conferencia usam cache exclusivo, espera de montagem e execucao
  sequencial. As assercoes funcionais foram preservadas. Nenhum erro
  JavaScript da tela foi registrado nesses timeouts.

## Proximo passo

Concluir a publicacao autorizada na `refactor/frontend` e confirmar o SHA no
remoto. Homologar como usuario vinculado a obra, centro de custo e DP.
Conferir solicitacao individual/coletiva e a excecao multiobra/legada.
Nao promover para main ou executar deploy automaticamente.
