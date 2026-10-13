# Colaboradores - dois enderecos e telefones

## Pedido e estado

Usuario autorizou implementar dois enderecos/telefones no cadastro, checkbox
para repetir endereco no pedido de admissao e segundo telefone distinto.
Implementado em C:/Fluxy-refactor-frontend, branch refactor/frontend, base
df669fa7. Usuario autorizou commit/push somente na refactor/frontend em
2026-10-11. Sem main, EC2, banco real ou integracoes externas.
Sem migration nova; reutiliza colunas da migration existente
202610020001_rh_colaborador_contatos_adicionais.js.

## Mapeamento e implementacao

- Cadastro e edicao local do DP usam RhDpColaboradores.jsx e os endpoints
  POST/PATCH /rh/colaboradores. Criacao tem transacao; edicao tem lock do
  colaborador. Controller, permissao granular e escopo permanecem inalterados.
- RhDpPessoal.jsx cria pedido de ADMISSAO. Os campos secundarios ja existiam
  no formulario/model; o cadastro direto nao os aceitava/exibia. Mostrar,
  abrir, reenviar e aprovar mantem o fluxo/checklists existentes.
- RhColaboradorEnderecos e RhColaboradorTelefone reutilizam CampoForm/FormSecao:
  padrao compacto Fluxy, fieldsets com legenda, labels, erro apos sair do campo,
  readonly de consulta e responsividade existente. A skill frontend orientou
  o uso dos componentes comuns, foco/labels e revisao desktop/mobile, sem redesign.
- Checkbox na admissao copia logradouro, numero, complemento, bairro,
  municipio, UF e CEP. Enquanto marcado, atualiza junto ao primeiro endereco;
  desmarcar preserva a copia e libera edicao. Nao persiste flag operacional,
  mas os sete campos reais; remover segundo endereco limpa somente esses campos.
- Cadastro inicializa/carrega/envia os campos primarios e secundarios; vazio
  explicito envia null para limpeza. Campo ausente na API PATCH e preservado.
- rhColaboradorContatosDomain.js centraliza limites existentes, normalizacao
  de UF, DDD secundario e comparacao ignorando mascara/prefixo +55. rhValidators
  aceita os campos novos no cadastro e normaliza PATCH sem presumir endereco
  completo. rhService valida o estado resultante sob lock, inclusive mudanca
  de apenas um telefone. rhSolicitacaoService valida abertura/reenvio e revalida
  contatos na aprovacao, gravando ambos no colaborador.
- Mensagens de validacao da admissao usam avisar.erro, corrigindo chamadas
  antigas a setRetorno inexistente na tela (CPF/Pix e novos contatos).
- Nenhuma transferencia, regra salarial, permissao ou dado financeiro alterado.

## Arquivos

- frontend/src/pages/RhDpColaboradores.jsx e RhDpPessoal.jsx;
- frontend/src/components/rh/RhColaboradorEnderecos.jsx e RhColaboradorTelefone.jsx;
- frontend/src/utils/rhColaboradorContatos.js;
- backend/src/services/rhService.js, rhSolicitacaoService.js e
  rhColaboradorContatosDomain.js; backend/src/validators/rhValidators.js;
- validarRhColaboradorContatos.js/.mjs (backend/frontend), mock de dependencia
  pura em backend/scripts/validarRhColaboradoresPlanilha.js;
- README RH/DP, ownership e este handoff. outputs/ fora do Git.

## Validacoes

Sem .env ou banco/rede externa; navegador exclusivamente contra servidor local:

- Backend validarRhColaboradorContatos.js: cadastro, leitura, atualizacao
  parcial, normalizacao, limpeza/null, negativas de mascara/+55/tamanho/campo
  indevido, legado nao relacionado, admissao/reenvio/aprovacao e dupla aprovacao.
- Backend validarRhColaboradoresPlanilha.js: importacao/exportacao legado,
  regime/historico, escopo, reimportacao e rollback preservados.
- Backend test:rhdp-envio-parcial, validarRhPagamentoSolicitacao.js,
  validarRhPessoalPorSolicitacao.js e test:pix-copia-cola aprovados.
- Frontend validarRhColaboradorContatos.mjs: edicao, reabertura, limpeza,
  negativa antes da API, checkbox/copia sincronizada/edicao independente,
  admissao com payload real, consulta sem edicao e viewport 1366/390.
- Frontend validarRhColaboradorCentroCusto.mjs e validarRhPessoalPorLocal.mjs
  aprovados: cadastro, local/global, permissoes e pagamento/conferencia legado.
- Build frontend aprovado; avisos conhecidos de Browserslist e chunk >500KB.
- Sintaxe backend, documentacao e git diff --check conferidos.
- Capturas outputs/rh-contatos/admissao-{1366,390}.png inspecionadas;
  sao fixture sintetica, sem dados reais. Nao simulam aparelho fisico.

## Riscos e proximo passo

Publicacao autorizada somente na refactor/frontend. Ownership liberado apos
revisao. Homologar apenas dev quando solicitado: criar/editar ficha,
admissao com endereco igual e diferente, telefones distintos e negativa de
duplicacao; aprovar e reabrir cadastro. Verificar preflight com a migration
existente aplicada antes do deploy. Publicar backend/frontend juntos.
Nao promover pacote DP a main sem pedido explicito; nao sanear dados legados
automaticamente. Nenhuma prova em MySQL real ou dispositivo fisico nesta tarefa.
