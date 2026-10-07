# Cadastro de credor na abertura de solicitacao de contrato

## Correcao

O endpoint de cadastro resolvia os campos com comportamento vazio, tornando
`cadastro_credor` oculto por padrao mesmo quando o formulario reconhecia
`usa_fluxo_contrato_novo`. Agora busca o tipo ativo, normaliza o comportamento
e aplica a configuracao de area, tipo e subtipo. O formulario envia
`tipo_sub_id`; o contexto e removido antes de criar o parceiro.

A configuracao explicita de bloqueio continua sendo respeitada. Tipos
inativos/inexistentes retornam 404; subtipo malformado retorna 400.
Endereco completo, documento, primeira chave PIX, nome fantasia e vinculo
ao contrato preservam suas regras. As permissoes da rota e a protecao do
formulario contra clique duplo nao foram alteradas.

## Arquivos alterados

- `backend/src/controllers/ParceiroController.js`.
- `frontend/src/pages/NovaSolicitacao.jsx`, apenas contexto do payload.
- `backend/scripts/validarCadastroCredorTipoSubtipo.js` e comando no package.
- README de Solicitacoes, ownership e este handoff.

## Validacoes

- `npm run test:cadastro-credor-tipo-subtipo`: aprovado. Controller,
  normalizador, resolvedor e handler reais com modelos/persistencia e
  validadores auxiliares do frontend simulados. Testa padrao de contrato,
  bloqueio explicito, habilitacao explicita, precedencia de subtipo/area,
  tipos inativos, contexto removido, endereco/PIX, vinculo ao contrato e
  payload/clique duplo. Sem banco ou rede.
- `npm run test:solicitacao-pix-apropriacoes`: aprovado, sem consultas ao banco.
- `node --check src/controllers/ParceiroController.js`: aprovado.
- Frontend `npm run build`: aprovado; avisos existentes de Browserslist e
  tamanho de chunks, sem erro.
- `git diff --check`: aprovado.

## Publicacao e proximo passo

Implementado localmente na `refactor/frontend`, sobre `6e095403`.
Sem commit, push, deploy, migration ou escrita em banco real.
Publicar somente mediante autorizacao. Atualizar backend para a correcao
do padrao de contrato e frontend para transmitir o subtipo; nao mudar
configuracoes de producao para contornar o erro.

Homologar em dev o cadastro no modal de uma solicitacao de contrato, com
configuracao padrao e desabilitada, e repetir usando regra de subtipo.
Nao inserir registros de teste diretamente no banco de producao.
