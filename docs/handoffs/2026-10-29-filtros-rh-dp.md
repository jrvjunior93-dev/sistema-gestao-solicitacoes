# Filtros do RH/DP - revisao e correcao de posicionamento - 29/10/2026

## Pedido e escopo
Usuario relata DP sem abertura dos filtros em Transferencias/Solicitacoes;
SUPERADMIN aparentemente normal. Revisao na branch codex/rh-dp-filtros sobre
refactor/frontend6aa7d0fa. Sem alteracao de permissoes,backend,schema ou dados.

## Achado
FiltroRapido/BarraFiltros nao possuem restricao por perfil para abrir menus.
No DEV existente, sem troca de usuario, observou-se menu Situação com
aria-expanded=true e caixa emy70,botao emy653: menu abrindo longe da ancora.
Inspecao do DOM/logs pela aba ja aberta; sem login/tokens/credenciais/EC2.
Pagina restaurada paraColaboradores apos inspecao. Nao alterados cadastros.

Causa reproduzida localmente com paginas reais,DPusuario eAPI simulada:
duas medicoes de scroll antes de commit React leem DOM antigo contra ref
escrito.current novo. O delta inventado desloca o menu. Prova antes da
correcao reprovou Menu afastado da ancora:30px. Portanto nao exige liberar
permissoes para abrir filtros; tambem nao prova inexistencia de outro problema
especifico no navegador afetado. Homologacao operacional apos publicacao.

## Mudanca
frontend/src/hooks/usePosicaoFlutuante.js le left/top inline ja pintados noDOM
para medir o desvio,em vez da proxima posicao solicitada ainda nao commitada.
Preserva virada acima/abaixo,tetos,rolagem,modais e escolhas. Mesmo helper
usado por filtros de outras telas,portanto teste de camadas compartilhadas.
frontend/scripts/validarRhFiltrosDP.mjs monta Pessoal real com transferencias,
solicitacoes,documentos eeventosrecorrentes; perfisDP USUARIOeSUPERADMIN,1366/390.
Simula deslocamento da ancora+duplo scroll; verifica alinhamento,cobertura,
Escape,abertura de todas dimensoes e consultas de selecao quando remotas.
Eventosrecorrentes filtra localmente,sem exigir nova requisicaoAPI.

## Mapa de consumidores RH revisados no codigo
BarraFiltros/FiltroRapido: RhDpTransferencias,RhDpPessoalSolicitacoes,
RhDpDocumentos,RhDpEventosRecorrentes,RhDpPessoal,RhDpColaboradores,
RhDpApuracao,RhDpJornada,RhDpFechamentos,RhDpImportacoes,
RhDpRelatorioOperacional. Quatro primeiras com prova integrada explicita;
as demais compartilham o componente,sem alteracoes emACL/fluxos individuais.
Colaboradores local vazio nao tem menusdimensionais; isso nao e bloqueioDP.

## Validacoes e estado
Prova integrada16combinacoes perfil/tela/largura passou com alinhamento apos
reposicionamento. Prova compartilhada provaCamadasCabem.mjs passou1920/1366/390,
ancoras nas bordas,scroll,selecoes eautocomplete emmodal,incluindo provas negativas.
Buildfrontend aprovado14,26s,avisos antigos Browserslist/chunks.
Sem commit/push/deploy. Proximo:fechar regressao selecao de todas dimensoes,
publicarDEV somente se solicitado e homologar no navegador doDP afetado.
Nao executar comandoEC2:correcao exclusivamentefrontend.

Regressao final concluida:16combinacoes passaram,abertura/alinhamento apos duplo scroll/selecoes remotas/cliqueforaESC sem errosJS. Ainda sem commit/push/deploy; pronto para publicacaoDEV sob autorizacao.

Usuario autorizou incluir filtrosDP no mesmo commit/pushDEV doscomprovantes. Sem comandosEC2 especificos para ofiltro; backendDEV e atualizado apenas pelo pacotecomprovantes.
