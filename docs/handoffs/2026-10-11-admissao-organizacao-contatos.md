# Admissao - organizacao e contatos visiveis

## Pedido e estado

Pedido: aproximar organizacao da admissao ao cadastro; dois telefones/enderecos
visiveis sem botoes adicionais; DP pode copiar o endereco, Obra deve informar
enderecos diferentes quando preencher o segundo. Implementado na
refactor/frontend, base 8d2bde07. Usuario autorizou commit/push somente nesta
branch em 2026-10-11. Sem main, EC2, migration nova, banco real ou integracao externa.

## Mapeamento e implementacao

- RhDpPessoal usa POST /rh/solicitacoes para criar rascunho de ADMISSAO. Anexos,
  checklist e envio ao DP continuam separados. Reenvio usa servico existente;
  controller transmite usuario autenticado e setor. Permissoes/escopos intactos.
- FormSecao agrupa identificacao/lotacao, contrato/calculo, contato, filiacao,
  enderecos e pagamento. Campos, tipos de contrato, datas, gerencial e PIX
  preservados. Skill frontend orientou reutilizacao do formulario corporativo,
  grupos acessiveis e QA responsivo; sem novo tema, CSS global ou redesign.
- Dois telefones e enderecos visiveis na admissao e no cadastro, inclusive ficha
  vazia. Campos secundarios opcionais; se endereco parcialmente preenchido,
  logradouro e municipio continuam obrigatorios. Limpar todos permite remover.
- RhColaboradorEnderecos recebe permitirMesmoEndereco para DP/admin. Checkbox
  copia sete campos, sincroniza primeiro para segundo, libera edicao ao desmarcar.
  Flag operacional nao vai ao backend. Consulta permanece desabilitada.
- Frontend e dominio backend comparam sete campos de endereco ignorando caixa,
  acentos, espacos e pontuacao. Obra nao recebe checkbox e a abertura/reenvio
  recusa enderecos iguais. API usa isRhDpUsuarioObra/userBelongsToDpSetor, com
  excecao administrativa existente; nao amplia permissao. Contextos internos
  sem usuario usam setor informado pelo chamador (nao pelo body HTTP).
- Nova restricao nao bloqueia aprovacao de admissoes legadas ja gravadas, nem
  altera automaticamente contatos existentes. Cadastro direto permanece DP/admin.
- Guardas de envio unico, estados e transacoes existentes preservadas.

## Arquivos

RhDpPessoal.jsx, RhDpColaboradores.jsx, RhColaboradorEnderecos.jsx,
rhColaboradorContatos.js, rhColaboradorContatosDomain.js, rhSolicitacaoService.js,
validarRhColaboradorContatos.js/.mjs, README RH/DP, ownership e este handoff.
validarRhColaboradorCentroCusto.mjs teve seletor tolerante a espaco entre spans
e diagnostico de falha; nenhuma alteracao no autocomplete do produto.

## Validacao e proximo passo

Testes em memoria/navegador local, sem .env, banco real ou rede externa:

- validarRhColaboradorContatos.js aprovado: cadastro/patch/limpeza/legado,
  telefone, endereco igual com formatacao distinta, abertura/reenvio Obra,
  flag falsa no body, DP/admin e usuario multissetor, segundo opcional,
  aprovacao de pedido legado e dupla aprovacao preservados.
- validarRhColaboradoresPlanilha.js e validarRhPessoalPorSolicitacao.js aprovados.
- test:rhdp-envio-parcial aprovado (revisao, bloqueio, reenvio, cancelamento,
  auditoria e idempotencia sem banco/rede).
- UI validarRhColaboradorContatos.mjs aprovado: campos visiveis, DP nao admin,
  copia/reedicao, Obra sem checkbox e negativa antes da API, payload distinto,
  cadastro/copiar/limpar, readonly, ausencia de erro JS/rede externa. Fixture
  passou a carregar config Tailwind real para capturas representativas.
- UI validarRhPessoalPorLocal.mjs (legado) e validarRhColaboradorCentroCusto.mjs
  aprovados. Timeout do centro veio do seletor que exigia espaco entre spans,
  nao de falta de dados ou erro no produto; corrigido e reexecutado.
- Build aprovado (554 modulos); avisos conhecidos Browserslist/chunk >500KB.
- Capturas admissao-topo/admissao/admissao-obra em 1366/390 inspecionadas;
  dados sinteticos, sem aparelho fisico. Sintaxe backend, diff e documentacao OK.

Ownership liberado. Nao houve teste MySQL real/dispositivo fisico. Proximo passo:
apos publicacao autorizada, homologar DEV quando solicitado com usuario DP/Obra:
abrir admissao, conferir visibilidade, copiar/desmarcar, negativas de telefone
e endereco igual, segundo endereco distinto, criar rascunho, anexar e enviar
pelo fluxo existente. Nao promover pacote DP a main por inferencia.
