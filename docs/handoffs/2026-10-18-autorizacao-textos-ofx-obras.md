# Dados para autorizacao e selecao de obras no OFX - 2026-10-18

## Pedido e autoridade

- Usuario pediu trocar os rotulos de dossie por Dados para autorizacao e
  Valor enviado para autorizacao, mantendo regras, na refactor/frontend.
- Pediu diagnostico da selecao vazia de obras/centros no Novo titulo + baixa
  pela conferencia manual OFX. Identificou Helida Pirovani em producao e
  confirmou que SUPERADMIN funciona, com print. Depois autorizou alinhar
  o carregamento ao cadastro normal de titulos e pediu TODAS as obras/centros.
- Agente unico, worktree performance-fila-dp; branch local
  codex/autorizacoes-textos-ofx-diagnostico-20261018, base remota 96483366.
- Sem commit/push/deploy autorizado nesta etapa. Nao alterar a main, ambiente
  de producao, permissoes da Helida, .env, PM2 ou dados. Outputs preservados.

## Diagnostico confirmado em codigo e fixture

- O frontend do modal OFX usava getMinhasObras({escopo:'TODOS'}).
  FinanceiroTituloNovo ja usa modo FINANCEIRO junto com escopo TODOS.
- ObraController.minhas retorna todas para SUPERADMIN por caminho proprio.
  Para demais usuarios, o caminho financeiro depende de modo FINANCEIRO e
  canAccessFinanceiro. Sem modo, retorna apenas UsuarioObra. A divergencia
  tambem esta no codigo da origin/main 8f1b2c85, inspecionado sem modifica-lo.
- Erros eram convertidos em [] pelos catchs do Promise.all, escondendo falha.
- Backend real/ACL reais em VM com models em memoria reproduzem: usuario
  financeiro granular sem vinculos recebe [] sem modo; SUPERADMIN recebe
  obra+centro; modo financeiro recebe ambos; nao-financeiro continua restrito.
- Nao houve consulta ao cadastro/sessao real da Helida ou ao banco produtivo.
  Isso confirma a causa estrutural, nao audita quais concessoes ela tem hoje.

## Alteracoes e invariantes

- AutorizacoesPorObra/AutorizacaoTituloDetalhe: rotulos/resumo/erro de consulta,
  dados para autorizacao, documentos e total com linguagem de autorizacao.
- FinanceiroTitulos/MedicaoValorPagamento: somente textos do preparo/envio e
  invalidacao da autorizacao anterior. Nenhum payload/condicional financeiro.
- Nao renomear dossie_hash, snapshot_json, schema, rotas ou trilhas tecnicas.
  Nao alterar dossies de RH ou juridicos, assinaturas, valor enviado, saldo,
  POST/passkey, permissao nominal, anexos ou registros historicos existentes.
- FinanceiroConciliacao.NovoTituloRapidoModal passa modo FINANCEIRO + TODOS.
  Novos estados locais de carregamento/falha/retry; bloqueio da selecao e
  envio enquanto base indisponivel; vazio explicito e descarte apos desmontar.
  Conta/empresa/sinal/valor/DRE/parceiro e POST atomico existentes preservados.
- services/obras.getMinhasObras usa o handleJsonResponse ja existente para
  conservar a mensagem sanitizada do servidor, em vez do erro com encoding.
- Nenhuma mudanca em ObraController/authorizationService/rotas/migrations.
  Nao dar perfil SUPERADMIN, nao criar UsuarioObra e nao ampliar solicitacoes.

## Validacao

- Backend npm run test:ofx-obras: controller e ACL reais com models em memoria;
  SUPERADMIN, financeiro granular e negativo sem acesso financeiro/vinculos.
- Frontend npm run test:ofx-obras: modal/services reais, HTTP interceptado;
  modo/escopo, obra+centro, payload unico de criacao+baixa, DRE, 403/500,
  retry, vazio, loading e fechar durante consulta; telas390/1366.
- Frontend test:autorizacoes-obras: novos textos e ausencia de termo antigo
  no detalhe; viewport320/390/768/1366, navegacao, selecao, passkey/POST,
  pago/invalido, anexo/foco e retorno existentes.
- Frontend test:medicao-valor-pagamento: destinos futuro/definitivo, conferencia,
  cancelamento, chave idempotente, pago protegido e permissao/403 preservados.
- Build614 modulos, test:autorizacao-pwa e test:docs backend tambem aprovados.
  Avisos preexistentes de Browserslist e chunk maior que500KB permanecem.
  Revisao visual dos rotulos320px e modal OFX390px sem cortes. Skill
  frontend-design aplicada somente a clareza dos textos/checagem responsiva,
  sem redesenhar o sistema ou alterar fluxo financeiro.

## Proximo passo

- Entregar local; usuario deve autorizar commit/push na refactor/frontend.
  Sem migration nova. Quando publicado e homologado, promover para main
  somente mediante pedido e fluxo normal de producao.
- Testar no DEV com usuario financeiro comum sem vinculos e com SUPERADMIN:
  OFX -> Conferir manualmente -> Novo titulo + baixa -> todas as obras/centros.
  Confirmar falha/retry e valores/conta antes de qualquer criacao de teste.
- A correcao ainda NAO esta aplicada em producao; nao afirmar que a conta da
  Helida foi alterada ou que a selecao produtiva ja esta corrigida.

## Autorizacao posterior de publicacao - 2026-10-18

- Usuario confirmou backup cifrado/timer ativo e testes manuais do pacote
  publicado (passkey/diaria). Ao separar este delta local, respondeu Pode
  promover tudo, autorizando inclui-lo na promocao integral para main.
- Testes OFX backend/controller/ACL e UI real com HTTP simulado repetidos e
  aprovados; textos e fluxo de ajuste de medicao tambem revalidados.
  Este delta OFX nao foi homologado manualmente na EC2 DEV pelo usuario.
- Nenhuma permissao individual ou registro real foi alterado. Roteiro e riscos
  da publicacao estao no handoff de promocao integral de 18/10/2026.
