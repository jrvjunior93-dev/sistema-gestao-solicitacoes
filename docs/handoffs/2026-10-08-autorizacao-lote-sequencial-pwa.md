# Lotes sequenciais e PWA compacto do autorizador

## Escopo e impacto

Pedido: simplificar o codigo do lote e abrir o PWA do proprietario diretamente
nas autorizacoes, ampliando a area de lotes e dossies. Checkout
C:/Fluxy-refactor-frontend, branch refactor/frontend. Sem publicacao, deploy
ou escrita em banco real nesta etapa.

Criacao do lote usa LOTE-ID depois do insert, na mesma transacao e antes das
copias S3. Codigo temporario unico atende o schema NOT NULL/UNIQUE durante o
insert. IDs podem ter lacunas; nao houve migration nem renumeracao de legado.
Na tela, alias LOTE-ID para todos os lotes; codigo original em Registro do lote.
Datas, snapshots, hashes, eventos, idempotencia e decisoes preservados.

Helper de PWA exige standalone Android/iOS, modulo habilitado e can_decide
nominal. Resolver inicial compartilhado por login e HomeEntry prioriza
autorizacoes somente nesse caso; MFA do login/PrivateRoute permanece antes.
Layout compacto apenas nessa rota: sem topbar/abas, Conta preserva navegacao,
tema e saida. Pagina recolhe modo/avisos/passkey em Opcoes, dispositivos em
disclosure; primeiro cadastro de passkey permanece exposto. Providers de
auditoria e guardas de caixa, prazos e obras continuam envolvendo o Outlet.

## Arquivos

- Backend: pagamentoAutorizacaoService.js e validarAnaliseProprietario.js.
- Frontend: autorizacaoPagamentoResumo.js, autorizacaoPagamentoPwa.js,
  telaInicialRoute.js, Layout.jsx, FinanceiroAutorizacoesPagamento.jsx,
  financeiro-autorizacoes-pagamento.css, package.json e testes de tela inicial,
  convergencia e novo validarAutorizacaoPwa.mjs.
- Financeiro: README, contrato PWA, ownership e este handoff.

## Validacao e continuidade

Testes isolados de tela inicial, convergencia da autorizacao, PWA e suite
backend da fila aprovados. PWA monta shell/pagina/estilos reais, mas simula
sessao, APIs, guardas e biometria; nao e homologacao financeira externa.
Capturas mobile claro/escuro em outputs/autorizacao-pwa-20261008, nao versionar.
Build, documentacao e navegacao/abas aprovados. Diff-check sem erros. Avisos
preexistentes do build: Browserslist desatualizado e chunk acima de 500 kB.
QA claro/escuro inspecionado visualmente; origem legada e data acessiveis.

Autorizacao posterior: usuario pediu commit/push na refactor/frontend junto
com a baixa sem PDF. Continuidade e publicacao registradas em
2026-10-08-fila-pendentes-comprovante.md. Main e producao fora do escopo.
Proximo passo: revisar/publicar nessa branch; atualizar
dev e homologar login/restauracao da sessao, passkey, avisos, decisao/revogacao
em Android/iOS reais. Nao reiniciar backend-solicitacoes em deploy exclusivo
de dev. Nao ha migration nova para este ajuste.
