# Distribuicao gerencial salva no detalhe - 23/10/2026

## Escopo e isolamento

Usuario autorizou implementar/testar na refactor/frontend bloco somente
consulta com rateio salvo na criacao, preservando permissoes/calculos e sem
producao. Agente unico, branch codex/solicitacao-distribuicao-gerencial-20261023
criada de origin/refactor/frontend fee28b6d em checkout de trabalho existente.
Sem commit/push/deploy, EC2/banco/Redis/S3 reais, migration ou dependencias.
Outputs privados excluidos. Main4922ebad e DEV remoto nao alterados.

Skill frontend-design usada para integracao compacta/recolhivel/responsiva,
mantendo identidade operacional Fluxy e reutilizando BlocoConteudo/catalogo.

## Mapeamento antes da alteracao

NovaSolicitacao valida distribuicao_centro_custo usando centroCustoDistribuicaoService;
persistencia em solicitacao_centro_custo_distribuicoes ocorre na criacao,
associada por solicitacao_id. Campos:centro_custo_id/obra_id/abrangencia/criterio/
percentual/valor_distribuido. Para TODAS, uma linha100% e valor total salvo.
Valores informativos gerenciais nao alimentam custo real/titulos nos destinos.
Adiantamentos nao recebem essa distribuicao na abertura, mantendo sua regra.

GET /solicitacoes/:id ja inclui distribuicoesCentroCusto e obraGerencial; ACL
verificarAcessoDetalheSolicitacao permite ou nega o retorno integral existente.
Nome/codigo/tipo do destino sao cadastrais atuais, nao snapshot historico;
percentuais/valores/criterio sao os registros persistidos na criacao. Include
nao filtra ativos nem revalida elegibilidade atual, evitando sumir rateio antigo.

## Implementacao

- Novo helper puro distribuicaoGerencialSalva.mjs le apenas a associacao salva,
  converte valores decimais em centavos para total informativo, sem redistribuir
  nem usar valor atual/valor pago/titulos/historico/configuracao. Preserva zero
  salvo, precisao percentual6casas e sinaliza valores ausentes sem inventar0.
- Novo DistribuicaoGerencial.jsx mostra criterio, destinos, percentuais, valores
  e total salvo, com nota sobre natureza gerencial e nao recalc pelo valor atual.
  TODAS unica linha; destino cadastral ausente usa ID, nao busca/adivinha nome.
  Sem dados:nenhum bloco. Sem inputs, links de destino ou acao de edicao.
- Integrado no catalogo de blocos do detalhe e espelho DetalheLayoutController;
  condicao:existir distribuicao na resposta autorizada, nao capacidade de editar
  ou acessar financeiro. Aba mobile Detalhes. Layout antigo nao esconde bloco
  novo automaticamente; preferencias explicitas seguem respeitadas.
- SolicitacaoController.show acrescenta somente tipo_centro_custo aos atributos
  da obraGerencial ja incluida. Sem joins/endpoints novos nem consultas extras.
- Bloco usa tabela nativa curta com largura100% explicita para neutralizar
  regra mobile legada width:max-content que recortava colunas no card. Nao
  alterar CSS global, tabela financeira ou componentes compartilhados.
- Abrir/recolher nao produz rede/escrita. Efeito preexistente marcarAtencaoLida
  no GET do detalhe permanece intacto; nenhum historico financeiro reescrito.

## Arquivos

Runtime: backend/src/controllers/SolicitacaoController.js,
backend/src/controllers/DetalheLayoutController.js,
frontend/src/pages/SolicitacaoDetalhe/index.jsx e blocosDetalhe.js,
novo DistribuicaoGerencial.jsx e frontend/src/utils/distribuicaoGerencialSalva.mjs.
QAs:backend/scripts/validarSolicitacaoDistribuicaoGerencial.js,
frontend/scripts/validarDistribuicaoGerencialSalva.mjs e
frontend/scripts/validarSolicitacaoDistribuicaoGerencialUI.mjs.
Scripts npm test:solicitacao-distribuicao-gerencial em ambos os packages,
sem mudanca de dependencias/lockfiles. Canonico Solicitacoes/ownership/handoff.

## Validacoes e limites

Backend show real em VM:modelos/servicos simulados, read-only user/SUPERADMIN,
ACL403/404 sem dados, include/atributos/snapshot/inativo e fonte intacta; sem
nova escrita financeira/consulta. Helper puro com fonte congelada testa
PERCENTUAL/VALOR/TODAS, centavos/zero, limites, precisao6, destinos ausentes e
dados incompletos; valor atual da solicitacao deliberadamente diferente.

UI real do detalhe em Chrome1366/390, Administrativo/Comercial/Marketing,
criterios, TODAS/SUPERADMIN, consultivo sem financeiro/edicao, legado sem dados,
destino ausente/precisao, ACL403, layout antigo e hide explicito, Enter/recolher,
nenhum input/link/acao de editar ou consulta extra/escrita. Assertiva geometrica
de todas as celulas dentro da tela; capturas desktop/mobile inspecionadas.
Regressoes backend:criacao/distribuicao gerencial destinos e regras de acesso,
adiantamento e medicao/recarga, seguranca2304comparacoes/48rotas aprovadas.
Navegacao/catalogos front-back aprovados. Regressoes UI de criacao/distribuicao/
relatorio e de edicao da solicitacao (lista/cards/mobile/detalhe, permissoes,
cancelamento/retry) aprovadas. Build final639modulos/12,67s; apenas avisos
preexistentes de Browserslist/chunk. Documentacao607Markdown/19canonicos,
Node/diff e escopo sem migrations/locks/dependencias/motores alterados conferidos.
Testes isolados nao equivalem a homologacao MySQL/DEV real.

## Proximo passo

Implementacao/testes locais concluidos; entregar ajuste local. Publicacao exclusiva
DEV precisa de autorizacao posterior de commit/push. Sem migration nova.
Homologar solicitacao com rateio salvo e total atual diferente, confirmar valores
originais/TODAS, usuario consultivo e mobile. Nao editar dados reais para testar.

## Publicacao DEV autorizada com os filtros da fila

Proprietario autorizou commit/push conjunto dos dois ajustes em refactor/frontend.
Roteiro exclusivo atualizar-dev-filtros-distribuicao-20261023.sh parte de fee28b6d,
sem migration/dependencias, preserva ambiente/sessao/schema e reinicia apenas
backend-dev/8001. Inventario fechado17runtimes e QAs isolados antes do restart;
validacao do roteiro em VM/Bash sem EC2 real. Detalhes e limite de homologacao
no handoff 2026-10-23-fila-filtros-pesquisa.md. Outputs privados fora do commit.
