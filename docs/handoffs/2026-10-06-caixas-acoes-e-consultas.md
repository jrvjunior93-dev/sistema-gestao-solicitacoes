# Caixas e Contas — acoes primeiro, consultas recolhidas

Nota de continuidade: a regra de bloqueio financeiro descrita neste registro
foi substituida, a pedido do proprietario, pelo bloqueio geral com fechamento
de hoje liberando o restante do dia. Consulte
`2026-10-06-caixa-bloqueio-geral-dia-operacional.md` para a implementacao posterior
e orientacao atual de ativacao. Este handoff preserva o historico da tarefa de UI.

## Pedido e escopo

Reorganizar a pagina, reunindo abertura e fechamento no mesmo bloco superior,
com consultas abaixo recolhidas ao acessar. Remover a indicacao visual de
bloqueio ativo/desativado, sem ativar a regra. Implementacao local, sem commit,
push, deploy, reinicio ou escrita em banco.

## Arquivos

- `frontend/src/pages/FinanceiroCaixas.jsx`: um bloco primario para selecionar
  conta e operar abertura/fechamento; duas colunas no desktop, empilhadas no
  celular. Registro manual, painel diario, livro e historico abaixo e recolhidos.
  Resumo da sessao integrado ao livro. Historico inclui aberturas, fechamentos
  e status, sem inventar saldo contado para sessoes ainda abertas.
- `frontend/scripts/validarCaixasLayout.mjs`: fixture local da pagina, componentes
  e estilos reais; API, identidade, preferencias e gates de permissao simulados.
- `docs/workspace/OWNERSHIP_ATIVO.md`: reserva e liberacao desta tarefa.

## Comportamento preservado

Mapeados os endpoints de contas, painel, sessoes, abertura, fechamento,
movimentos, estorno, confirmacao OFX e decisao de divergencia. Nenhuma mudanca
em endpoints ou payloads. Mantidas permissoes de visualizar, abrir, fechar,
movimentar, estornar, confirmar conciliacao e decidir divergencia; restricao
de responsaveis e impedimento de aprovar a propria divergencia.

Comprovantes de saida, justificativas, limite de data de fechamento e saldo
contado inicialmente vazio preservados. Preparar ajuste agora abre o formulario
manual antes de rolar ate ele e exige a permissao de movimentar. Uma trava
sincrona em `executar` evita dois envios concorrentes antes do re-render do botao.

## Validacoes

- `node backend/scripts/validarCaixaFisico.js`: aprovado, somente validador local.
- `node frontend/scripts/validarCaixasLayout.mjs`: aprovado no Edge headless;
  abertura/fechamento, duplo submit, ajuste e comprovante, estorno/modal,
  consulta sem acoes, restricao operacional, divergencia e segregacao,
  confirmacao OFX, erro de API, conta ausente, teclado e recolhimento ao F5.
- `npm run build` em `frontend`: aprovado; avisos preexistentes de Browserslist
  desatualizado e bundle grande, sem atualizar dependencias.
- `git diff --check`: aprovado.
- Capturas claro/escuro e celular em
  `qa/evidencias/caixas-layout-2026-10-06/` (pasta ignorada). Sem sessao real ou
  gravacao de preferencias. Fixture isola a topbar e corrige apenas o offset
  sticky desta ausencia para as capturas.

## Bloqueio — orientacao, nao ativacao

Configuracao persistida em `FINANCEIRO_CAIXA_DIARIO_CONFIG`, nao em `.env`.
SUPERADMIN usa Configuracoes > Controle Diario de Contas
(`/configuracoes-controle-diario-contas`), escolhe os usuarios em
"Opera e fica sujeito ao bloqueio", marca
"Bloquear acoes financeiras enquanto houver contas pendentes" e salva.
Confirmar antes que somente a conta pretendida possui
`exige_abertura_fechamento=true` nos Cadastros Financeiros.

Usuarios precisam das permissoes de visualizar/abrir/fechar caixas; movimentar
apenas se registrarem entradas/saidas manuais. Divergencias exigem outro usuario
com `financeiro.caixas.decidir_divergencia` (na matriz granular).

A regra exige abertura ABERTO no dia operacional de Sao Paulo e ausencia de
sessao anterior aberta ou aguardando aprovacao para todas as contas ativas
marcadas. Impede baixas da fila e acesso a carteira de cheques de terceiros.
Consultas, comprovantes, conciliacao e regularizacao do caixa ficam disponiveis.
SUPERADMIN nao fica sujeito ao bloqueio. Depois de fechar o caixa do dia,
ele deixa de estar aberto e as acoes protegidas ficam bloqueadas novamente.
Nenhuma configuracao foi alterada nesta tarefa.

## Pendencias e proximo passo

Mudanca somente frontend para esta tarefa. Ha tambem uma correcao anterior,
independente e ainda sem commit, de PIX/endereco no cadastro de credor (backend
e frontend), descrita em `2026-10-05-credor-pix-endereco.md`; preservada.
Proximo passo: aguardar autorizacao de commit/push; conferir o conjunto pendente
antes de publicar. Homologar no ambiente publicado com os usuarios/conta reais,
sem ativar o bloqueio sem orientacao do proprietario.

## Publicacao autorizada — 06/10/2026

Pedido seguinte autorizou commit e push das alteracoes pendentes e retorno a
main. Worktree ja em main e sincronizado com origin/main antes da publicacao.
Incluir tambem a correcao pendente de credor. Build e testes locais aprovados;
EC2, reinicio de processos e ativacao do bloqueio continuam fora desta etapa.
