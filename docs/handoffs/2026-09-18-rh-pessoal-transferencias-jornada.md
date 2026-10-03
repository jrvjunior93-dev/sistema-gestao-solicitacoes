# DP/RH Pessoal — jornada, transferências e atividade

Implementação local na `refactor/frontend`, autorizada em 18/09/2026.
Sem commit, push, deploy ou alteração em banco externo.

## Regras implementadas

- Jornada do formulário/individual: dias trabalhados + faltas limitados à união
  dos intervalos de vínculo com a obra no período, considerando admissão e demissão.
  Não altera divisor/cálculo salarial. Mantém o limite da base informado (1–31),
  usando o menor dos limites. Evita duplicar colaborador ao retornar à mesma obra.
  Tela mostra dias na obra e preenche o máximo permitido. Servidor revalida na
  transação, bloqueando colaboradores durante o envio.
- Transferência bilateral na aba `Pessoal → Transferências entre obras`:
  origem solicita/destino aprova OU destino solicita/origem aprova. Quem solicita
  precisa ser responsável/substituto vigente da obra solicitante; outro usuário,
  responsável/substituto vigente da obra aprovadora, decide. Sem exceção de
  autoaprovação mesmo se um usuário for responsável pelas duas obras.
- Reutiliza `cr_responsaveis_obra`, sem duplicar a configuração nem conceder
  automaticamente acesso financeiro. Exige acesso existente ao Pessoal.
- Aprovação: revalida status, origem atual e vínculo; fecha origem no dia anterior
  e abre destino na data local de São Paulo da aprovação. Cliente não escolhe
  vigência. Mudanças no mesmo dia ajustam o intervalo iniciado naquele dia para
  não criar intervalo negativo; trajetória intradiária permanece nos históricos.
- Pedido pendente por colaborador, transação e locks; repetição de decisão não
  repete transferência. Rejeição/cancelamento não mudam vínculo. Comentários de
  acompanhamento disponíveis aos responsáveis das duas obras.
- Transferências saem da fila DP e dos contadores de pedidos dos colaboradores;
  endpoints antigos não permitem decidir/alterar essas transferências. Pendências
  legadas de transferência passam à aba própria (origem solicitante, destino
  aprovador por padrão; rascunhos podem ser enviados/cancelados). Primeira lotação
  de colaborador sem obra continua com DP, marcada pelo servidor.
- Diretório global paginado: somente id, nome, matrícula, função, obra (id/nome/
  código). Usuário precisa ter vínculo com uma obra ou ser responsável vigente.
  Sem salários, CPF, dados bancários ou documentos, inclusive no servidor.
- Solicitações DP e transferências: ordenação por última interação, cor da linha
  e selo de novidade. Leitura individual pelo maior id do histórico exibido;
  requisição atrasada não regride leitura, interação posterior continua inédita.
  Atualização das listas a cada 30 segundos quando visíveis e ao recuperar foco.
  Respeita filtros existentes. Comentários, decisões, anexos, validações e mudanças
  do checklist registradas em histórico. Primeira implantação destaca históricos
  ainda sem leitura registrada.

## Configurar responsáveis

Novo atalho: **Configurações → Responsáveis por obra**.
É o MESMO componente/cadastro de **Custos e Recebíveis → Configurações →
Responsáveis e substitutos**. Alterações têm efeito nos dois módulos.

1. Vincular usuário à obra no cadastro de usuários.
2. Selecionar obra e cadastrar responsável/substituto com vigência válida.
3. Repetir para origem/destino; é necessário outro usuário na aprovação.
4. Garantir acesso ao Pessoal para operar transferências.

O administrador da configuração precisa das permissões existentes de Custos e
Recebíveis: acesso ao módulo habilitado, visualizar obras e gerenciar configurações.
Atalho não amplia permissões. A responsabilidade, sozinha, não libera telas financeiras.

## Arquivos deste escopo

Backend:
- `src/services/rhPessoalDomain.js` (novo)
- `src/services/rhTransferenciaService.js` (novo)
- `src/services/rhSolicitacaoAtividadeService.js` (novo)
- `src/controllers/RhTransferenciaController.js` (novo)
- `src/controllers/RhSolicitacaoController.js`
- `src/services/rhSolicitacaoService.js`, `rhJornadaFormularioService.js`,
  `rhVinculoObraService.js`, `rhService.js`
- `src/routes.js` (somente hunks RH; possui negociação financeira prévia)
- `src/generated/navegacaoFonteUnica.cjs` (gerado pelo compilador da navegação)
- `migrations/202609180003_rh_solicitacoes_leituras.js` (somente CREATE TABLE)
- `scripts/validarRhPessoalFluxo.js` (novo; dependências simuladas, sem banco)

Frontend:
- `src/pages/RhDpTransferencias.jsx`, `ResponsaveisObra.jsx` (novos)
- `src/pages/RhDpPessoal.jsx`, `RhDpPessoalSolicitacoes.jsx`, `RhDpJornada.jsx`
- `src/services/rhDp.js`, `src/styles/rh-pessoal-atividade.css` (novo)
- `src/App.jsx`, `src/navigation/navigationConfig.jsx`
- `src/modules/custosRecebiveis/utils/access.js`
- `scripts/validarRhPessoalTransferencias.mjs` (novo; serviços simulados)

## Validações

- `node backend/scripts/validarRhPessoalFluxo.js`: passou. União de dias, limites
  admissão/demissão/retorno, formulário recusando excedente e base adulterada,
  transferência nos dois sentidos, autoaprovação recusada, responsável revogado,
  duplicidade, origem obsoleta, rejeição/cancelamento, mudança no mesmo dia,
  projeção restrita do diretório, fila DP e detalhe sem acesso a transferências,
  leitura individual/monotônica e interação concorrente. SQL/banco simulados.
- `validarJornadaPeriodosEdicao.js` e `validarEscopoRhDpUsuarioObra.js`: passaram.
- `node frontend/scripts/validarRhPessoalTransferencias.mjs`: passou em Chrome
  headless local, serviços simulados, rede externa bloqueada. Testa cancelar a
  confirmação sem executar aprovação, pesquisa, seleção/envio e modal a 1366/390px.
  Imagens inspecionadas em `outputs/rh-pessoal-transferencias/`.
- `npx vite build --logLevel error`: passou.
- Compilação do catálogo e `validarNavegacao.mjs`: passaram; catálogo front/back alinhado.
- Syntax checks e `git diff --check`: passaram.
- Varredura ampla de cancelamento aponta duas heurísticas em código prévio:
  `RhDpJornada` confirma `substituicoes.length` e envia `preenchidas` (coleção que
  contém as substituições e os novos registros); `PedidoEntrega.jsx` confirma
  itens e envia recebimento. Sem mudança nesses fluxos nesta rodada. Teste de
  cancelamento do novo fluxo passou no navegador.

## Pendências de homologação e próximo passo

Não executado contra MySQL real nem EC2. Aplicar a migration estrutural pelo
runner protegido ANTES de subir o backend deste escopo. Validar em dev com
responsáveis distintos nas duas obras, vigências, permissões reais, uma jornada
com transferência no meio do período e duas sessões para o destaque individual.
Testes simulados não substituem homologação de SQL/locks reais.

Não migrar para main nem commitar sem pedido. O worktree já contém negociação
financeira e comparativo Cards não commitados, além do guia do usuário e outputs.
Separar os hunks de `routes.js` e ownership ao preparar commit deste escopo.
Há outra migration pendente de negociação (`202609180002`): não aplicar todas
às cegas numa publicação isolada de RH; conferir o plano do runner/commits antes.
