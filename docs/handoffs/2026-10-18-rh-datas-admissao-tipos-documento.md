# RH: datas da admissao e tipos de documento no pedido - 2026-10-18

## Pedido e autoridade

- Usuario pediu retirar obrigatoriedade da admissao no modal do pedido e
  tornar inicio efetivo obrigatorio. Confirmou manter admissao vazia ao aprovar
  e informar depois, em vez da regra anterior que preenchia o dia da aprovacao.
- Tambem enviou print da Luana com pedido RH-000240 rascunho e seletor de tipo
  oferecendo apenas Sem classificacao. Nao forneceu resposta HTTP/catalogo real.
- Agente unico; base publicada 762370cf. Branch local de trabalho
  codex/rh-admissao-datas-20261018 neste worktree. Destino futuro refactor/frontend.
  Sem autorizacao de commit/push/deploy nesta etapa; nao alterar main/producao.

## Diagnostico e mapa do fluxo

- RhDpPessoal.jsx marcava admissao required e inicio efetivo opcional.
  RhSolicitacaoService abre/reenvia e aprova sob transacao/auditoria;
  aplicarEfeito usava admissao || hoje para o campo formal e data_inicio.
- API ja admite NULL no campo data_admissao; nenhuma migration necessaria.
- RhDpPessoalSolicitacoes preenchia tipos apenas por checklist.itens e
  convertia falha em itens vazios. Um checklist sem exigencias ocultava os
  tipos ja cadastrados; vazio e erro eram indistinguiveis visualmente.
- Isto confirma o defeito estrutural no codigo, nao demonstra que o catalogo
  ou as regras produtivas estejam preenchidos. Nenhuma consulta real a Luana.
- Upload existente usa /rh/solicitacoes/:id/anexos com permissao de visualizar
  pedido, escopo por obra/controller e restricoes de estado/vinculo no servico.
  DP atesta e a aprovacao transfere documentos classificados para a pasta.

## Implementacao e invariantes

- Formulario: rotulo admissao opcional; inicio efetivo required. Datas em ISO
  no payload; validacao completa tambem backend, incluindo admissao se informada.
- Backend exige inicio efetivo na abertura/reenvio de admissao; aprovacao de
  legado sem esse campo continua possivel, sem inferir dados historicos.
- Aprovacao conserva data_admissao NULL quando ausente; data_inicio e inicio
  operacional dos vinculos/calculo continuam com fallback anterior para hoje.
  Inicio efetivo nao substitui nem recalcula diaria, folha ou vinculos.
- Catalogo minimo em GET /rh/solicitacoes/:id/tipos-documento, com
  allowRhDpSolicitacaoVer e exigirSolicitacaoNoEscopoDoUsuario antes de ler tipos.
  Ativos, filtro CLT/NAO_CLT pelo pedido/colaborador e nomes/codigos apenas.
  obrigatorio deriva das exigencias do tipo/subtipo, nao do default do cadastro.
- Nao alterar /rh/documentos/tipos ou conceder acesso geral a documentos,
  configuracoes, usuarios ou outras obras. Nenhuma alteracao no cadastro da Luana.
- Modal usa catalogo novo, estado de loading/falha/vazio, retry e descarte de
  resposta antiga por pedido+versao (inclusive fechar/reabrir o mesmo pedido).
- Mutex bloqueia submit duplicado em voo; fechar aguarda upload; arquivo e
  limpo apos sucesso. Sem classificacao permanece opcao explicita existente.
- Nenhuma alteracao em seeds, schema, valores financeiros, checklist, ateste,
  comprovantes, calculos ou registros ja aprovados. Sem EC2/PM2/.env/banco/S3 real.
- Skill frontend-design aplicada a rotulos/obrigatoriedade/erro acessiveis no
  formulario operacional existente, sem redesenho visual ou novos padroes.

## Arquivos e validacoes

- RhDpPessoal, RhDpPessoalSolicitacoes, services/rhDp e scripts npm/testes UI.
- rhSolicitacaoService/Controller/routes e testes backend de diaria/catalogo.
- validarRhAdmissaoDiaria: Obra/DP/admin com admissao ausente/vazia/null,
  inicio obrigatorio/validade, reenvio, legado aprovado, moeda e concorrencia.
- validarRhPedidoTiposDocumento backend: catalogo sem checklist, ativos,
  vinculos, DTO minimo, regras obrigatorias, escopo403/404 e erro500 explicito.
- validarRhColaboradorContatos UI: admissao opcional/inicio required, bloqueio
  sem inicio, payload diaria numerico; DP sem admissao e Obra com data informada,
  cadastro normal, contatos/reabertura/403 e desktop1366/mobile390.
- validarRhPedidoTiposDocumento UI: pagina/cliente reais com HTTP interceptado,
  DP/Obra, classificacao no multipart, duplo submit, loading/erro/retry/vazio,
  resposta antiga apos fechar/reabrir e screenshots390/1366 revisados.
- Suites RH/documentos/transferencias, pessoal por solicitacao, escopo/salario,
  primeira lotacao e movimentacoes documentais verificadas com E/S simuladas.
- Build 619 modulos, regressao Pessoal por Local e documentacao565/19 aprovados.
  Avisos Browserslist/chunk preexistentes nao tratados nesta tarefa.

## Proximo passo

- Entrega local, sem commit/publicacao automatica. Aguardar pedido do usuario
  para publicar em refactor/frontend e fornecer atualizacao exclusiva DEV.
- Nao requer migration nova, mas ambientes devem ter o schema do release
  762370cf (incluindo inicio efetivo) atualizado previamente.
- Homologar com DP/Luana e Obra: pedido sem admissao, inicio preenchido,
  criar/anexar/classificar, enviar/conferir/aprovar e verificar admissao vazia.
  Depois informar admissao no cadastro com permissao atual.
- Se tipos continuarem vazios com mensagem explicita, conferir catalogo ativo
  e vinculo no ambiente; nao semear/exigir documentos automaticamente nem
  ampliar permissao para mascarar a ausencia de cadastro.
