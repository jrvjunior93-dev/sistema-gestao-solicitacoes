# Promocao main: Compra Direta quantidade/frete e catalogo de admissao

## Autorizacoes e gates

- Usuario aprovou os ajustes em DEV e autorizou promocao para main/comandos
  EC2 producao. Backup recente no Drive cifrado e timer ativo confirmados
  nesta janela. Sem autorizacao para executar EC2/banco/restart pelo agente.
- Consulta real do operador confirmou UUID de producao
  5ed4b970-009f-11f1-809c-0ad0e0c90c53, banco gestao_solicitacoes, EC2 em
  1341e1a352be4f6882278f60867e4f9c2408d372, nenhuma migration pendente.
- Main congelada: 1341e1a352be4f6882278f60867e4f9c2408d372.
- Dev homologada: d72a9c9372dd33cbdf342b922d0a59534a472456, unico commit
  pendente. Nao ha delta de migrations, dependencias ou configuracao de ambiente.

## Recuperacao e integracao

- Tag anotada publicada: codex/snapshot-main-compra-direta-admissao-20261015-1341e1a3.
- Bundle completo verificado, fora da EC2 e fora dos commits:
  outputs/releases/main-pre-compra-direta-admissao-20261015.bundle.
- SHA256: 8F550A94BE71B7AB4E87BE50825FCC2215B262726A3051DD96E8A62E9998CBD3.
  Copia local na estacao do operador; nao afirmar envio deste bundle ao Drive.
- Branch codex/promocao-compra-direta-admissao-main-20261015 criada da main.
  Merge preserva historicos. Tres conflitos somente documentais nos registros
  workspace; mantidos ambos os lados e removidos somente marcadores.
- Runtime backend/src e frontend/src igual ao homologado. Scripts/documentos e
  hotfixes exclusivos de main preservados, sem reset/force/cherry-pick em massa.
- Outros checkouts sujos e outputs/ preservados. Sem delegacao.

## Escopo

Quantidade editavel em Gerenciar todos os itens e Editar; recalculo por preco
unitario, preservando desconto total e proporcoes dos rateios/formas. Titulos,
pagamentos e baixas existentes nao sao recalculados ou criados pela edicao.
Frete sem/embutido/terceiro, global/por item, com credor/favorecido/forma/PIX/boleto
e auditoria atomica. Revisao de conteudo e locks protegem concorrencia/repeticao.

Novas permissoes nominais: compras.compra_direta.editar_quantidade e
compras.compra_direta.gerenciar_frete. Apropriacoes nao concedem essas acoes.
Nao atribuir automaticamente. Leitura, modulo, setor atual e escopo permanecem.

Admissao usa catalogo minimo id/nome/CNPJ das empresas ativas, autorizado por
rh_dp.solicitacoes.abrir, sem liberar gestao de empresas ou outras areas.
Detalhes: 2026-10-15-compra-direta-admissao.md e READMEs canonicos.

## Deploy

ops/deploy/atualizar-prod-compra-direta-admissao-20261015.sh: exige checkout main
limpo e ancestrais fixados, npm ci, testes em memoria e preflight somente leitura
de ambiente, processo exclusivo backend-solicitacoes, caminho main, porta8000,
host/UUID/banco e schema. Qualquer migration pendente bloqueia o restart.
Nao roda migrations/seeds/backfills nem altera .env ou flags. Compara flags
booleanas pelo valor efetivo; AUSENTE/false equivalentes nao causam falso
bloqueio como no preflight DEV. Divergencia funcional continua bloqueada.
Troca exclusiva de DEV deve permanecer false em producao; troca de producao
e autorizacao financeira mantem seus valores existentes, sem ativacao.
Reinicia somente backend-solicitacoes, verifica health8000. DEV8001 intocado.

validarDeployCompraDiretaAdmissaoProducao.js executa blocos reais em VM com
PM2/config/banco/health simulados e negativas de ambiente, processo duplicado,
caminho, porta, identidade, flags e migrations. Nenhuma consulta real pelo agente.

## Validacao e limites

- Especificos backend: validarCompraDiretaGestao.js (fracao, desconto/rateio,
  titulos historicos, frete/PIX/boleto, ACL, concorrencia, rollback),
  validarCompraDiretaGeoAcesso.js e validarRhAdmissaoCatalogo.js.
- Regressao: validarRhPagamentoSolicitacao.js e validarRhPagamentoEnvioParcial.js.
- UI: validarCompraDiretaGestao.mjs e validarRhPessoalPorLocal.mjs --admissao,
  com API em memoria, mesmos caminhos de autor/DP/Obra do homologado.
- Script producao/DEV e preflight anterior, Bash/node --check, documentacao,
  auditoria granular, navegacao e build integrados; git diff --check.
- Build com avisos preexistentes de Browserslist/chunk grande. Relatorio npm
  do operador em DEV: 3 vulnerabilidades moderadas e 1 critica, sem analise de
  explorabilidade nesta promocao. Nao inclui atualizacao de dependencia nem
  npm audit fix --force. Pendencia separada da homologacao funcional.
- Duas verificacoes legadas com fixtures/marcador desatualizados continuam
  registradas no handoff de implementacao; testes especificos atuais separados.

## Proximo passo e rollback

Publicar branch/PR, confirmar base/head e checks antes do merge normal para main.
Conferir SHA/tree final e entregar comandos fixados ao operador. Aguardar
backend saudavel e deploy Vercel Production/Ready no mesmo SHA; smoke em prod:
quantidade e frete preservando titulos, negativo de permissao e admissao Obra.
Conceder as duas novas permissoes somente a usuarios autorizados.

Em incidente, parar o fluxo e, em janela autorizada, retornar codigo/artefato
Vercel ao base 1341e1a3. Sem down, restore, exclusao de dados ou alteracao de
flags automatica. Preservar novos registros/historicos.
