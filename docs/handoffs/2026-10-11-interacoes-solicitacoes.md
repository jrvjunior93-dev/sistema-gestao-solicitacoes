# Interacoes pendentes nas solicitacoes - 2026-10-11

## Escopo e seguranca

Implementacao autorizada nesta conversa: balao agrupado com motivos,
quantidades, atalhos, leitura independente e destaque/prioridade da lista.
Sem delegacao, banco real, EC2, migration executada, commit/push ou main.
Preservadas pendencias anteriores de Pix/motivo de ajuste e auditoria
financeira da outra conversa; nao incluir estas ultimas numa publicacao
automaticamente. Skill frontend-design aplicada em direcao utilitaria,
compacta, reutilizando modal/tokens existentes sem trocar fontes/layout global.

## Arquivos funcionais

- Backend: novo SolicitacaoInteracaoUsuario, migration
  202610110002_solicitacao_interacoes_usuario.js, solicitacaoInteracoesService;
  Historico/index dos modelos, solicitacaoAtencaoService,
  SolicitacaoController e routes.js.
- Frontend: AtencaoPendente, Solicitacoes/index e LinhaSolicitacao;
  SolicitacaoDetalhe/index, Timeline e CompraEtapas; novo
  services/solicitacaoInteracoes e hooks/useInteracoesVisiveis.
- QA: validarInteracoesSolicitacao.js, validarInteracoesSolicitacao.mjs,
  interacoesPaginasQA.mjs; fixtures de validarBloqueioRetornoObra e
  validarCompraDetalheCards adaptadas sem retirar negativas.
- Canonico: docs/modulos/solicitacoes/README.md; registros deste escopo
  no painel de colaboracao. Outputs de QA fora do commit.

## Contratos preservados

- Mesma autorizacao dos detalhes/itens, sem ampliar visibilidade nem conceder
  escrita. Atalho da conversa do item somente leitura. IDs do usuario nunca
  aceitos do cliente. Leitura em lotes de ate 100 IDs, sequenciada no cliente.
- Chave primaria usuario/historico, ignoreDuplicates, captura apos commit.
  Sem recontar comentario compartilhado, reabrir leitura em replay ou criar
  destaque em rollback. Autor excluido pelo fan-out existente.
- SQL com prioridade antes de limit/offset, sem JSON SQL (evita regressao
  charset MySQL). Consulta em lote apenas para solicitacoes ja autorizadas.
- Eventos posteriores nao sao reconhecidos por leitura antiga. Falha 403/
  rede preserva pendencia; resposta de lista iniciada antes da leitura nao
  restaura destaque. Retorno/entrega sao resolvidos por negocio, nao por abrir.
- Nenhum valor/status/setor/titulo, baixa, anexo, documento ou preferencia
  e alterado pelo reconhecimento. Historico ja persistido nao e reescrito.

## Validacao e limites

Resultado final: backend de interacoes, BloqueioRetornoObra,
DevolucaoRetornoSolicitacao, CompraEtapasResumoPedido e AcessoAnexos;
frontend Interacoes (incluindo paginas completas/realtime), CompraDetalheCards,
EdicaoDadosSolicitacao, RemocaoAnexosHistorico e DevolucaoRetorno;
build, sintaxe, documentacao e diff-check aprovados. 403 simulado no QA de
leitura gera log esperado, sem apagar destaque. Fixture de CompraDetalheCards
atualizada para cursor, cards recolhidos, toast em portal, negociacao financeira
atual e datas BR, sem remover casos de erro/duplo clique/permissao.
Revisao final frontend-design: foco inicial no aviso, Tab/Shift+Tab restritos
ao aviso, Escape/clique fora e restauracao do foco ao balao validados em
desktop e celular emulado, usando o portal padrao sem alterar modais globais.

Realtime novo envia apenas identidade da solicitacao aos destinatarios ativos;
recarrega a janela para trazer registro fora da pagina, com agrupamento de
avisos central/especifico. Leitura notifica somente sessoes do proprio usuario.
Headers fixados no inicio da leitura e respostas identificam usuario; a UI
ignora respostas de outro usuario. Aviso legado nao e duplicado quando o hook
ja capturou o evento, evitando destaque fantasma apos leitura/remocao.

Testes de eventos/replay/rollback/concorrencia/autoria/leitura por usuario,
negativas, idempotencia da migration e guarda schema-only executados com
modelos/SQL isolados. UI real do balao, Timeline e CompraEtapas e paginas
completas de lista/detalhe validadas com HTTP simulado em 1366 e 390 px:
agrupamento, Enter sem abrir linha, Escape, erro/retry, texto literal, blocos
ocultos, aba mobile, leitura, retorno persistente e voltar sem mutacao de
negocio/layout. Capturas outputs/interacoes-1366.png e interacoes-390.png.

Homologacao MySQL/usuarios reais em dev pendente: testes locais nao provam
desempenho/entrega com volume real. Migration deve preceder restart. Sem
backfill geral: acervo anterior mantem aviso legado, contagem por evento
passa a valer na implantacao. Fan-out apos commit e best-effort, como o
destaque anterior: monitorar log de falha; nao induzir repeticao de uma
operacao de negocio ja gravada. Nenhuma operacao externa foi executada.

## Proximo passo

Implementacao local concluida; ownership liberado. Commit/push autorizado
pelo usuario em 2026-10-11 na refactor/frontend, junto de Pix/dados da fila
e motivos de ajuste. Backend, UI real desktop/mobile, build, docs e diff
revalidados antes da publicacao. Auditoria financeira e outputs excluidos.
Depois fornecer deploy exclusivo de dev com preflight e migration somente
quando solicitado. Nao promover automaticamente a main; manter segregacao do DP.
Na homologacao usar dois usuarios: criar comentario/anexo/item, validar
ordem fora da primeira pagina, ler apenas um grupo, retornar a lista,
resolver retorno e testar leitura com rede interrompida.
