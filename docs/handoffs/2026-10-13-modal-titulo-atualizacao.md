# Modal de criacao de titulo e atualizacao automatica

## Pedido e escopo

Usuario relatou perda de preenchimento no modal financeiro da solicitacao e
autorizou a correcao. Branch local codex/fix-titulo-modal-atualizacao, baseada
na refactor/frontend 31490a0d. Nao misturar com a candidata de promocao da main
que aguarda preflight/health reais de producao.

Arquivos: FinanceiroCard.jsx, validarTituloSolicitacaoAtualizacao.mjs, este
handoff e OWNERSHIP_ATIVO.md. Sem backend, schema, dependencias, banco real,
restart ou deploy pelo agente. Usuario autorizou commit/push na refactor/frontend
e comandos da EC2 dev em 13/10/2026.

## Causa e correcao

Detalhe escuta SSE da propria solicitacao e usa fallback de 45 segundos quando
a conexao nao esta aberta. Cada GET substitui o objeto solicitacao. O efeito
dependente desse objeto executava resetModalState mesmo com o modal aberto,
apagando parcelas, referencias, categoria e demais campos. Evento de outra
solicitacao e filtrado; nao afirmar que novas solicitacoes causam esse refresh.

Mesmo ID e modal aberto/em envio: preservar rascunho. Troca de ID: fechar modais
e reconstruir campos para o novo registro. Descarte/sucesso: manter limpeza
existente; reabertura usa dados atuais. Se o valor da solicitacao mudar enquanto
o rascunho esta aberto, bloquear envio e pedir fechar/reabrir para revisao, sem
apagar silenciosamente os campos. Backend continua revalidando ACL e negocio.

Nao desabilitar SSE/fallback, congelar sessao ou restaurar DTO como autoridade.
Nao ampliar acesso, botoes, permissoes, visibilidade ou endpoints.

## Validacoes

- validarTituloSolicitacaoAtualizacao --baseline: componente real da versao
  31490a0d reproduz perda da referencia e da quantidade de parcelas apos SSE.
- validarTituloSolicitacaoAtualizacao: componente e assinatura SSE reais,
  servicos simulados, desktop 1366 e mobile 390. Eventos de outro ID ignorados;
  SSE/fallback preservam campos, foco e data parcial; nenhum envio automatico;
  valor atual invalida envio antigo; reabrir usa novo total; erro preserva;
  sucesso limpa; trocar registro nao vaza rascunho; somente leitura e ausencia
  de permissao nao ganham botoes de criacao.
- validarValoresFormasTituloSolicitacao: parcelas, Boleto/Pix/Cheque/Outros,
  Cartao/Transferencia, frete e multiplos favorecidos.
- validarTituloNegociacaoModal: desktop/mobile, preflight, valores, aceite,
  idempotencia, troca de aba, conflitos, falhas/retry e negativas.
- validarSegurancaAcessoDireto: 2304 comparacoes de visibilidade, exclusao,
  ACL por ID, identidade/token e 47 rotas sem banco/rede externa.
- validarPermissoesFinanceiroRota: 74 rotas financeiras granulares preservadas.
- Build, documentacao e diff conferidos. Avisos conhecidos Browserslist/chunk.

Primeiras tentativas da nova fixture exigiram corrigir seletores de labels,
flag permite_parcelamento do cadastro simulado e seletores dos avisos portais.
Uma execucao foi interrompida por ERR_NETWORK_IO_SUSPENDED do navegador local.
Repeticao final estavel aprovada; nao confundir falhas da fixture com fluxo real.

## Proximo passo e limites

Publicacao autorizada: commitar/publicar somente os quatro arquivos na
refactor/frontend apos conferir estado remoto e repetir validacoes; homologar refresh
durante preenchimento na sessao dev real. Nao promover main antecipadamente.
Este ajuste protege atualizacoes do mesmo detalhe; nao promete persistencia
desse modal apos fechar aba, recarregar navegador ou desmontar a pagina.

Deploy desta correcao e somente frontend. Vercel deve publicar a branch
refactor/frontend; EC2 dev pode sincronizar checkout por fast-forward ao SHA
publicado. Sem migrations, instalacao de dependencias ou restart necessario
para este delta. Nao tocar main, backend-solicitacoes nem produzir dados reais.
