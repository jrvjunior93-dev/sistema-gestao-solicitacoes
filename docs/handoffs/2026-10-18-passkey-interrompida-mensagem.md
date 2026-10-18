# Passkey interrompida: mensagem amigavel - 2026-10-18

## Pedido e escopo

- Usuario mostrou mensagem tecnica em ingles/W3C ao voltar da passkey sem
  concluir a aprovacao e pediu texto amigavel. Implementacao LOCAL sobre
  76b4b907. Usuario autorizou agora commit/push deste pacote na
  refactor/frontend e comandos DEV. Sem migration nova, backend, banco ou
  deploy real pelo agente.
- Preservar todo pacote anterior OFX/textos e outputs. Agente unico.
- Skill frontend-design e referencia UX writing orientaram texto curto,
  neutro e acionavel. Nao houve mudanca visual ou de regras financeiras.

## Alteracoes

- utils/webauthn.js usa normalizarErroPasskey somente no catch de
  startAuthentication local. NotAllowedError pode significar voltar, timeout
  ou recusa; nao alegar uma causa que o navegador nao distingue. AbortError,
  codigo ERROR_CEREMONY_ABORTED, cause do SDK e autenticacao sem resultado
  recebem codigo interno PASSKEY_NAO_CONCLUIDA. Outros erros ficam intactos.
- passkeyInterrompida.js gera aviso: Confirmacao por passkey nao concluida.
  Nenhuma decisao foi enviada. Voce pode tentar novamente. Com lotes anteriores
  confirmados, informa a quantidade e que os demais nao foram alterados.
- AutorizacoesPorObra preserva selecao, resultados parciais e mutex; nao exibe
  cauda de erro tecnico/atualizacao obrigatoria para esse aviso.
- AutorizacaoTituloDetalhe usa aviso, nao setErro que impediria nova tentativa.
- FinanceiroAutorizacoesPagamento usa alerta no decidir/revogar por lote.
  Registro de passkey, permissoes, challenges, POSTs e erros reais mantidos.

## Validacoes

- validarPasskeyInterrompida.mjs aprovado: nomes/codigos/cause, ciclos,
  timeout sem causa presumida, erros de configuracao/servidor preservados.
- validarAutorizacoesPorObra.mjs aprovado com wrapper real e SDK simulado:
  cancelar antes do POST, selecao preservada, tentar novamente, detalhe sem
  bloqueio, primeiro lote confirmado/segundo interrompido sem nova decisao;
  suite existente de cursor/historico/ACL/motivo/duplo clique preservada.
- Build aprovado (619 modulos; avisos preexistentes browserslist/chunk).
- Teste geral validarAutorizacaoPwa aprovado (Android/iOS/browser, shell,
  historico nativo e ACL). Usa Chrome local por
  PLAYWRIGHT_EXECUTABLE_PATH; Chromium bundled nao esta instalado aqui.
- Nenhum servico real de biometria, banco, EC2 ou producao usado nos testes.

## Publicacao e teste DEV

- Publicar exclusivamente este pacote, separado do OFX. Nao requer migration
  nova. Roteiro atualizar-dev-pwa-saldo-20261018.sh pode receber o SHA novo;
  somente migration anterior 202610180002 e autorizada se ainda pendente, com
  backup DEV conferido. Nenhuma outra migration e aplicada automaticamente.
- A correcao da diaria ja integra 6cee2949: frontend envia numero, backend
  aceita/normaliza BRL na abertura, reenvio e aprovacao. Rodar novamente
  validarRhAdmissaoDiaria.js e testar Obra e DP no DEV, nao na producao do print.
- Homologar no celular DEV cancelando a biometria, preservando selecao e
  repetindo aprovacao; varios lotes devem informar resultados ja confirmados.
  Passkey exige login nominal, fora de Testar usuario.
- Diaria: com Luana e usuario Obra separadamente, Obra -> Colaboradores ->
  Pedir admissao; calculo Por diaria, R$ 100,00, preencher obrigatorios e
  criar/enviar pedido sem erro indevido. Usar cadastros de teste distintos;
  conferir diaria no pedido e no cadastro apos aprovacao regular.
