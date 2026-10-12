# Base e piloto de navegacao em Solicitacoes

Implementacao local iniciada em 11/10 e validada em 12/10/2026, na
refactor/frontend, a partir de ade1d5acf4eb9cfe47a5e625d13bac2d3ca7fbbc.
Autorizacao: base e piloto Solicitacoes, com testes por etapa, desempenho
e preservacao das regras de visibilidade. Sem publicacao, banco ou deploy.
O [plano geral](2026-10-11-plano-navegacao-estado.md) continua orientando a
expansao; seu inventario e os hashes representam o baseline anterior.
O visual operacional compacto foi preservado, sem redesenho de telas.

## Contrato implementado

| Superficie | Estado preservado | Leituras e acoes existentes | Fronteira |
| --- | --- | --- | --- |
| Shell autenticado | Ate 12 abas, origem, cursor e ate 64 etapas por aba; scroll | Rotas/guardas do App e auditoria de navegacao existentes | Trocar aba nao salva, aprova, baixa ou gera registros; downloads/publicas fora da interceptacao de links internos |
| Nova Solicitacao | Um unico formulario vivo, campos, escolhas e File pendentes | Obras/minhas, tipos/disponiveis, catalogos e consultas condicionais do tipo; POST solicitacoes, contratos e uploads somente pelos handlers originais | Rota/params proprios; sem polling/SSE/autosave adicionados; nao refazer GET apenas para alternar; limpar ao sucesso inclusive criacao com upload parcialmente falho |
| Solicitacoes e arquivadas | Consulta, busca, filtros, pagina, janela acumulada, selecao, scroll horizontal | GET solicitacoes, contadores, filtros, preferencias e atualizacoes existentes; acoes em lote originais | Nao guardar linhas/DTOs no snapshot; selecao continua cruzada com itens autorizados atuais; dados recarregados |
| Detalhe numerico | Aba mobile, blocos abertos, origem e scroll; codigo SOL real na aba | GET solicitacoes/:id e consultas condicionais ja existentes | Nao restaurar registro, status, saldos, anexos ou permissoes como DTO antigo; ignorar respostas de carga tardias |
| Conversa e comentarios de itens | Texto, mencoes selecionadas e File locais da Conversa; texto/mencoes por item | Endpoints originais de comentarios, anexos, compra-etapas e leitura de interacoes | Somente item autorizado atual abre editor; sem leitura automatica de aba inativa nem envio ao restaurar |
| Editar valor/vencimento | Alvo id/campo, entrada e revisao base minima em memoria | PATCH isolada de valor ou vencimento, com ACL original | Modal exige registro atual do GET; conflito bloqueia sobregravacao; trava existente evita reenvio |
| Preview e modal compartilhado | Pilha, foco e portal da pagina ativa | Presign/download e autorizacoes de anexo originais | Modal da unica pagina retida inativa nao sobrepoe a aba ativa nem captura Escape |

O contrato conserva as permissoes, payloads, limites de upload e ordem
das operacoes dos handlers originais. Adapters nao tornam uma selecao,
rascunho ou modal uma autorizacao. Lista e detalhe desmontam normalmente;
nao existem 12 tabelas, PDFs ou conexoes de pagina vivas em segundo plano.

Os dados de sessao informados por AuthController foram conferidos para
invalidation: usuario efetivo, perfil, setores, setores visiveis, permissoes,
modulos e capacidades. Mudanca desse escopo limpa memoria e remonta o
piloto antes de reapresentar campos; nao cria nem amplia permissao.

## Isolamento e backend

- Nenhum arquivo de backend/src, migration, autenticação, SQL de
  visibilidade ou contrato de endpoint foi alterado nesta implementacao.
  O unico ajuste backend e no mock do validador de edicao, para simular
  a dependencia de adiantamentos ja existente, sem banco/rede.
- Memoria de trabalho pertence ao usuario/escopo, aba e identidade da
  pagina/registro. Query de interacao nao cria outro draft da mesma SOL.
  Uma solicitacao nao recebe texto, arquivo ou valor de outra.
- Dados pessoais dos formularios, File e revisoes nao sao serializados
  pelo workspace em localStorage/sessionStorage nem enviados a preferencias.
  Apenas metadados de abas/historico ficam no sessionStorage por usuario;
  preferencias e filtros persistentes anteriores nao foram removidos.
- Lista/detalhe dependem de resposta atual autorizada. GET lento ou 403
  nao pode reapresentar o DTO antigo em um modal de edicao. Alteracao do
  valor por outra sessao bloqueia salvar o rascunho sobre a versao nova.
  Lista limpa registros/alvos/modais ao receber 401/403 e ignora cargas
  tardias de consultas anteriores; erros comuns de rede nao apagam drafts.
- A reconstituicao de rolagem acumulada usa o mesmo GET e filtros,
  paginando em limites aceitos pelo backend (25/50/100/200). Corrige a
  tentativa anterior de enviar 75/150/300, que era reduzida a 25 pelo
  servidor. Nao pede acesso a outras obras/setores ou modo privilegiado.
- Troca de usuario, logout/desmontagem e mudanca de escopo informado pela
  sessao descartam a memoria anterior. Backend continua sendo a autoridade
  em toda escrita e leitura. Revogacao ainda nao informada ao navegador
  nao e detectada por um snapshot: o formulario novo retido nao faz polling
  de permissao; seus envios continuam submetidos a ACL vigente do servidor.

## Ciclo de vida e protecoes

Trocar/abrir abas usa substituicao no historico do navegador. Navegar uma
etapa comum guarda a sequencia da propria aba. POP/Forward reconhecem a
entrada; Voltar usa etapa anterior, depois origem e por ultimo fallback.
SOL aberta pela lista ganha nova aba, mantendo lista e filtro de origem.
Uma SOL ja aberta e ativada, nao duplicada. No limite, nao expulsar trabalho.

Nova Solicitacao conserva uma etapa acessivel mesmo se uma consulta
legada usar replace. Sucesso explicito limpa o formulario e substitui a
etapa; nao ressuscitar uma criacao enviada. Fechar aba com draft pede
confirmacao de descarte; cancelar a confirmacao conserva o trabalho.

Operacoes registradas como busy impedem troca/fechamento/Voltar, inclusive
tentativa por navigate/POP: criacao, novo parceiro, Conversa, comentarios/
acoes de CompraEtapas, edicao de valor/data, lote/exportacao da lista e
salvamentos da pagina pai do detalhe. Isso nao substitui travas/idempotencia
dos handlers/backend. Modais internos ainda nao aderidos nao devem ser
anunciados como cobertos por essa protecao em todos os fluxos.

Rolagem e listeners das paginas desmontadas sao liberados. Portals e
listeners das sugestoes/modais da pagina nova retida sao suspensos quando
inativa. A location congelada usa a API de contexto do React Router atual;
reexecutar o contrato de QA antes de atualizar essa dependencia.

F5/fechar o navegador nao recupera os drafts deste piloto: o browser recebe
aviso de trabalho pendente, mas pode ignorar o aviso, sobretudo em mobile.
File fica somente em memoria. Nao prometer recuperacao apos encerrar sessao.

Snapshots limpos sem entrada de historico sao liberados; rascunhos pendentes
nao sao expulsos silenciosamente. O limite de 12 abas/64 etapas e de
metadados, nao um teto absoluto de bytes para arquivos/rascunhos. Trabalhos
pendentes de muitas etapas podem ocupar memoria ate fechar a aba/sessao;
homologar cargas reais antes de ampliar retencao para outros fluxos.

## Evidencias executadas

QA nova: node frontend/scripts/validarWorkspacePiloto.mjs. Router, hook,
Layout, Nova, lista, detalhe, Conversa, edicao e CompraEtapas reais;
API inteiramente interceptada em localhost, sem banco ou rede externa.
Viewports 1366 e 390 px, nao aparelhos Android/iPhone reais.

- Ultimo caractere, query/codigo, origem, PUSH/REPLACE/POP/Forward, 12 abas,
  formulario unico, scroll, busca, pagina, selecao, texto e File pendentes.
- Identidade e mudanca de escopo no mesmo usuario; item/registro distintos;
  403/carga lenta, revisao alterada, quota indisponivel e limpeza ao sucesso.
- Zero escrita de negocio nos ensaios de alternancia. Auditoria existente
  permanece uma chamada por transicao real, sem repeticao ao marcar historico.
- ConsultarJanela: 25/50/75/150/300/450 linhas, sem IDs duplicados, mesmas
  restricoes de consulta e limites validos, sem mudar escopo de visibilidade.
- Comparacao ABBA controlada do mesmo formulario/DOM: ultima rodada p95
  31,75 ms no legado e 31,95 ms no piloto; 40 alternancias por rodada. Apos 30 ciclos e
  GC, delta de heap do piloto aproximadamente 0,34 MiB, abaixo de 8 MiB.
  Gate: p95 <= baseline * 1,1 + um frame (17 ms), variacao explicita do ensaio.
- Build do HEAD exportado e build novo: pacote JS inicial gzip de 143,50 kB
  para 149,64 kB (+4,28%), abaixo de +10%. Imports diretos no shell
  evitam antecipar ListaAvancada e componentes de tabelas. Lazy routes mantidas.

Validadores existentes de navegacao/abas, edicao, interacoes, Nova
adiantamento/cartao e 27 visualizadores PDF/imagem tambem executados.
Backend isolado: acompanhamento GEO/Compras, edicao/ACL, fila/acesso,
anexos, interacoes, troca de usuario dev e adiantamento financeiro.
Nenhuma migration real foi executada (saida do teste de adiantamento e mock).

Limites preexistentes, comparados com HEAD e nao introduzidos pelo piloto:
validarLayout registra 86 pendencias globais em 211 telas;
validarSecurityHardening exige botao antigo de cadastros financeiros
removido antes desta tarefa. A rota ainda exige financeiro.cadastros.visualizar.
Nao afrouxar o runtime nem apagar essas negativas para tornar testes verdes.
Build conserva avisos de chunk >500 kB e Browserslist antigo do baseline.

## Rollback e proxima etapa

VITE_WORKSPACE_PILOT=off no build seleciona o controlador legado e desliga
snapshots/retencao/contexto de trabalho. Metadata v2 e legivel pelo legado.
Nao desligar no meio de preenchimentos sem orientar usuarios: drafts sao
locais. Nao precisa migration, reconciliacao ou mudanca de permissao.

Ainda nao e adesao completa de todos os modais da Solicitacao: criar titulo,
medicao, adiantamento/prestacao, mudanca de setor/status e cadastros internos
mantem seu comportamento anterior e precisam de adapters/testes por fluxo.
Delegacao recebeu adesao restrita em 12/10: abrir em nova aba e restaurar
filtro/edicoes nao salvas com nova consulta autorizada. Demais telas de
Compras/Financeiro/DP continuam etapas futuras.

Proximo gate: homologar em dev com rede/dados reais, perfis GEO/Obra/DP,
rascunhos longos, anexos/PDFs e aparelhos mobile, incluindo conflito/403 e
duplo envio. Publicacao/deploy e ampliacao exigem pedido separado. A ausencia
de regressao nos ensaios locais nao garante latencia/memoria de producao.

## Correcao apos homologacao DEV - 12/10/2026

O app usa BrowserRouter com v7_startTransition; a fixture anterior nao
ativava esse contrato. Atualizado o ensaio e adicionada rota lazy/Suspense:
o controlador do commit 0fb4822d falha na sincronizacao URL/aba ativa nesse
cenario. A correcao separa transicao pendente do ultimo render confirmado,
e somente confirma refs em layout effect, nao em render interrompido.
Nao reaproveitar o namespace antigo para o Outlet novo durante a transicao.

Abrir/trocar aba usa PUSH; back interno/fechamento conservam REPLACE. O
login apos sucesso tambem usa REPLACE, normal ou MFA. Entrada antiga de
login com sessao ativa redireciona ao destino inicial autorizado/perfil
MFA; restauracao pendente mostra loading. Nao inferir sessao de token em
disco, nem alterar AuthProvider/PrivateRoute/ACL para evitar tela de login.

Rascunhos continuam apenas em memoria: navegar realmente para fora do
shell (logout/entrada publica) pode desmonta-los; nao prometer recuperacao
apos F5/logout ou retorno a paginas publicas anteriores ao login.

Revalidacao ampliada aprovada em 1366/390 px (inclui +/busca reais,
principal/fallback da Delegacao, reaproveitamento de aba aberta, filtro,
edicao, 12 abas, 403 e casos de login). P95 baseline 31,75 ms / piloto
31,50 ms; heap delta ~0,34 MiB. Build 569 modulos, inicial gzip 149,82 kB
versus 149,64 kB no piloto publicado (+0,12%). Ensaios isolados nao
substituem homologacao na rede/aparelhos reais do DEV.
