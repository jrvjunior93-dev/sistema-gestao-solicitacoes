# Usuarios, justificativa do lote e retorno - 08/10/2026

## Pedido e escopo

Na refactor/frontend: incluir centros de custo no vinculo de usuarios;
justificativa clicavel entre Status e Motivo no lote, com modal e voltar do
aparelho; revisar Atualizar; renomear a devolucao apos retorno aprovado e
notificar aprovadores com pop-up abaixo do sino. Publicacao na refactor/frontend
autorizada posteriormente pelo usuario, junto com instrucoes para EC2 dev;
main e execucao de deploy nao fazem parte deste pedido.

## Implementacao e impactos

- UsuarioNovo/Usuarios: consulta existente com escopo TODOS, identifica tipo,
  preserva payload/guardas, impede save sem dados carregados e duplo envio.
- pagamentoAutorizacaoService: somente lotInclude adiciona leitura limitada
  da justificativa atual. LEFT JOIN e snapshots/hashes legados preservados.
- FinanceiroAutorizacoesPagamento/CSS/OverlayModal: preview limitado, texto
  seguro/integral no modal; parametro de historico para voltar. Clique fora
  opcional e inativo por padrao para os demais modais.
- Atualizar: revisado, sem mudar regra; GET, selecao/lote e protecao de
  resposta obsoleta testados. Nao envia titulos nem decide pagamentos.
- RetornoSolicitacaoBar: rótulo Devolver solicitacao; destino original,
  confirmacao, transacao, financeiro e permissoes permanecem existentes.
- NotificacaoController/solicitacaoRetornoService/services-notificacoes:
  consulta opcional para avisos nao lidos, destinatario autenticado e pedido
  ainda aprovavel; nao altera o historico normal do sino.
- NotificacoesBell/RetornoNotificacaoPopup: Alert/portal, polling e foco,
  dedupe por usuario/sessao, dismiss sem leitura, abrir com protecao de clique.
- Testes SQL, UI de vinculo/modal/convergencia/PWA/devolucao/pop-up e docs.

## Validacoes

Testes de vinculo, convergencia/justificativa, SQL e instrumentos da fila,
devolucao backend/UI e pop-up aprovados com persistencia/transporte simulados.
QA visual mobile dos tres ajustes verificada; imagens locais em outputs/.
Build, navegacao/abas, PWA Android/iOS simulado e docs aprovados ao encerrar.
Build mostra apenas avisos existentes de Browserslist e chunk acima de 500 kB.
Provas adicionais de isolamento do portal e Esc sem clique fora aprovadas
(8 verificacoes). O harness legado precisou usar Chrome instalado e JSX
automatico em memoria; nenhum arquivo de prova/componente foi alterado por
essa adaptacao. A execucao padrao nao encontrou Chromium e a tentativa com
JSX classico nao montou o componente; o fluxo real via Vite ja estava aprovado.
Nenhuma escrita em banco real, ativacao, migration, restart ou deploy.
Na preparacao da publicacao, SQL, devolucao backend, documentacao e UI de
vinculos/pop-up/justificativa-convergencia foram executados novamente e aprovados.

## Riscos e proximo passo

A justificativa e contexto ATUAL, nao conteudo novo do snapshot assinado.
Sem origem/justificativa disponivel, nao inventar texto a partir da descricao.
O aviso chega por polling em ate 30 segundos quando a tela esta ativa, nao
por push; respeita o evento configurado e destinatarios existentes.
Homologar em dev com usuario vinculado somente a centro de custo, proprietario
no PWA real iOS/Android e dois usuarios de setores distintos no ciclo de retorno.
Revisar diff e commitar/publicar somente arquivos desta tarefa, preservando
outputs/ e evidencias fora do Git. Na EC2, usuario deve atualizar somente o
checkout dev e backend-dev, conferir preflight:schema sem aplicar migrations
automaticamente e testar health na porta 8001. Main exige pedido separado.
