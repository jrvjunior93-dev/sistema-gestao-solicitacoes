# Nova Solicitação: dados e pagamento — 2026-10-12

## Pedido e escopo

- Contrato da medição no card Dados da solicitação. Valor, credor, forma,
  favorecidos, Pix/dados bancários e boletos no card Informações para pagamento.
- Valor antes das instruções financeiras. Sem divisão, manter o fluxo anterior;
  ao usar + Favorecido, aproveitar o valor informado na primeira parte e
  calcular o total pela soma das partes, em centavos.
- Na medição, somar por parcela selecionada. Não tocar parcelas anteriores,
  baixas, registros reais, regras de visibilidade ou status.
- Base refactor/frontend 739b9c1b. Commit/push desta etapa autorizados pelo usuário
  em 12/10; publicação limitada aos nove arquivos frontend e este handoff.
  Nenhum deploy, banco ou processo EC2 operado pelo agente.

## Mapa de dependências preservadas

| Trecho | Ações/dados | Dependência e proteção |
| --- | --- | --- |
| Dados | Origem, tipo/subtipo, contrato/referência, identificação e prazos | Mesmas consultas de obras/tipos disponíveis, campos configurados, vínculos e bloqueio de medição fora do setor; retorno continua no mesmo handler |
| Pagamento simples | Valor, buscar/cadastrar credor/favorecido, forma, Pix/banco/boletos | Mesmos endpoints e requisitos por forma; cadastro rápido conserva configuração e validação do backend |
| Divisão | +, editar/remover partes, usar apenas primeiro | Componente existente; total readonly evita divergência; partes positivas, pessoa/forma obrigatórias, anexos distintos e chave longa continuam validados |
| Medição | Selecionar parcela, valor/vencimento, pagamento/aceite | Mesmo endpoint de medição; somas por parcela e saldo do contrato; durante divisão o valor da parcela deriva das partes e a seleção fica estável |
| Recarga | Selecionar cartões, valores, prestação anterior | Mesmo fluxo por cartão; total readonly acima, sem duplicar total abaixo; fora desta tela o componente mantém total padrão |
| Apropriação/rateio | Distribuir e conferir total | Mesmos handlers e validações; adiantamento não solicita distribuição antecipada e GEO segue definindo categoria |
| Envio | Criar solicitação, medição ou contrato e anexos | Mesmo submit, mutex/idempotência, APIs e uploads existentes; navegação/restauração não envia automaticamente |

Nenhum controller, endpoint, migration, política de acesso ou DTO foi alterado.
Nenhuma chamada nova foi adicionada à edição de valores: as somas são locais.

## Arquivos desta tarefa

- frontend/src/pages/NovaSolicitacao.jsx: reorganização de JSX sem recriar campos;
  contrato e período nos dados; pagamento/valor antes de apropriações.
- frontend/src/components/solicitacoes/PagamentosFavorecidos.jsx: soma em centavos
  com filtro opcional de parcela; componentes/validações anteriores preservados.
- frontend/src/components/contratos/BlocoMedicaoContrato.jsx: soma por parcela,
  opção semCard e slot de credor, ambos compatíveis com demais consumidores.
- frontend/src/components/recarga-cartao/RecargasCartoesFields.jsx: mostrarTotal
  opcional (default true); Nova Solicitação usa total superior somente leitura.
- scripts frontend validarPagamentoMedicaoLegada, validarNovaSolicitacaoAdiantamento,
  validarRecargasMultiplasUI e validarValoresFormasTituloSolicitacao: organização,
  soma, centavos, remoção, formas, anexos e payloads.
- validarCredorNovaSolicitacao.mjs: somente harness atualizado com dependências
  Pix e tipo/comportamento já existentes no controller; nenhuma regra relaxada.
- docs/workspace/OWNERSHIP_ATIVO.md: seção exclusiva desta tarefa. Outras seções
  e arquivos de auditoria/importação no worktree pertencem a outros trabalhos.

## Validações executadas

APIs/modelos interceptados ou em memória; sem carregar .env, banco, EC2 ou S3:

- validarPagamentoMedicaoLegada.mjs: medição legada/fluxo novo e pagamento comum
  em 1366/390 px, configuração de campos, contrato/período nos dados, valor antes
  da forma, soma com centavos, total readonly, remoção, valor zero recusado,
  saldo excedido na medição, boletos cumulativos/remoção e payload por favorecido.
- validarNovaSolicitacaoAdiantamento.mjs: página/componentes reais; simples e
  dividido, valor inicial preservado, soma 1000 + 200, Pix por pessoa, sem
  distribuição antecipada/residual; despesa normal mantém distribuição.
- validarRecargasMultiplasUI.mjs: total, soma/edição/remoção, troca de origem,
  prestação/anexos independentes e mobile; checks da integração do total na página.
- validarValoresFormasTituloSolicitacao.mjs: soma decimal por parcela e composição
  real dos valores/dados dos títulos, parcelas, formas e frete.
- validarCredorNovaSolicitacao.mjs: cadastro, CPF/PJ/endereço/Pix, obrigatoriedade,
  representante opcional, configuração negativa e bloqueio de múltiplo clique.
- validarPixCopiaCola.mjs: catálogo em 8 telas, 8192 caracteres, preparo Pix e
  payload intacto em desktop/mobile.
- validarMedicaoRecargaEnvioUI.mjs: modal/FinanceiroCard, aprovação, negativos,
  envio idempotente, retry, título medido, recarga e fila existente.
- validarWorkspacePiloto.mjs integral: páginas reais preservadas nas abas,
  Nova Solicitação sem GET extra ao retornar, filtros, identidade, 403/404,
  conflitos, sem replay de escrita; desktop/mobile. Medição local de troca:
  baseline P95 32,1 ms e piloto 32,0 ms (não é benchmark de produção).
- backend validarSolicitacaoFavorecidos.js, validarMedicaoFavorecidos.js,
  validarAdiantamentoFavorecidos.js: soma/escopo, títulos, ciclos, concorrência e
  rollback em memória, sem alteração dos serviços.
- backend validarSegurancaAcessoDireto.js: 2304 comparações de visibilidade,
  ACL negativas, identidade/auth, 66 casos de escopo e 47 rotas HTTP locais.
- npm run build e git diff --check frontend: passaram. Warnings existentes de
  Browserslist desatualizado e chunk acima de 500 kB permanecem, sem dependências novas.

Inspeção visual das capturas desktop/mobile simples e divididas em
outputs/qa-nova-solicitacao-dados-pagamento-20261012: separação operacional clara,
campos legíveis, sem rolagem horizontal; mantém padrão corporativo compacto.

## Limites e próximo passo

- Não garante configurações/dados de todas as instalações reais; homologar DEV
  com contratos/credores configurados antes de promover para produção.
- Esta reorganização não exige migration adicional. A estrutura financeira do
  commit anterior segue exigindo as migrations descritas no handoff anterior.
- Próximo passo: homologação DEV pelo usuário após deploy do frontend na Vercel.
  Arquivos alheios de auditoria/importação e docs compartilhados ficam fora.
  Este commit não modifica o backend; uma EC2 DEV já atualizada em 739b9c1b
  precisa apenas atualizar o checkout, sem migration adicional/reinício de PM2.
