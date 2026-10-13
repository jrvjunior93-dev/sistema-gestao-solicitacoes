# Fila de pagamentos: colunas por usuario

## Estado e escopo

Implementacao na refactor/frontend; sem commit/push, main, EC2, migration ou
banco real. Base df39348f80f39e4a8909a5d0efb577027ba93130. Preserva as pendencias
anteriores de fila/local/massa/comprovantes (handoff separado).

## Mapeamento e alteracoes

- FinanceiroFilaPagamentos: catalogo de colunas com IDs estaveis; o botao Colunas
  permite escolher visibilidade e ordem. Arrasto no cabecalho/painel e setas
  para teclado/celular. Selecao, identificacao e status/acoes ficam visiveis
  para manter referencia e acesso operacional. Todas podem ser reordenadas.
- useColunasOperacionais.jsx: opt-in para tabela operacional com inputs; mapeia
  cabecalho/celulas/colgroup pela mesma ordem. A origem das celulas deve seguir
  o catalogo originais; Children.toArray trata celulas condicionais/arrays.
  Chaves por coluna preservam os inputs na reordenacao. Ocultar nao apaga drafts.
- TabelaPadrao: somente export nomeado do PainelColunas existente; sem alterar
  seu comportamento global. Redimensionamento independente continua existente.
- PreferenciasContext e endpoints existentes: chave financeiro-fila-pagamentos,
  tipo colunas (ordem/visiveis/ocultas), espelho local, gravacao com debounce,
  descarga ao sair e recuperacao na sessao. Backend usa dono req.user.id.
  Restaurar padrao remove apenas colunas, nao larguras/filtros/outros usuarios.
- Motivo/Justificativa continua respeitando o recorte da fila. Configuracao nao
  altera busca, status, permissoes ou elegibilidade. Validacao de baixa revela
  coluna oculta ao voltar para corrigir; instrumento tambem recebe campo-alvo.

## Validacoes

- node frontend/scripts/validarFilaInstrumentosUI.mjs: tela/painel/contexto reais,
  APIs simuladas. Arrasto de cabecalho/painel, setas, ocultacao, alinhamento de
  32 linhas, selecao e valores preservados, recortes, erro de campo oculto,
  reload/outro navegador/usuario separado, reset sem apagar larguras.
  Regressao de instrumentos, cheques/cartoes, encargos, lote/duplo clique,
  permissoes e rolagem de arquivos tambem incluida.
- node backend/scripts/validarListaPreferencias.js: validadores e regras de
  ownership/rotas existentes, sem conexao ao banco.
- npm run build no frontend: aprovado. Avisos preexistentes de Browserslist
  e tamanho de chunk; nenhuma dependencia atualizada.
- Capturas em outputs/fila-colunas-1366.png e fila-colunas-390.png,
  verificadas visualmente; outputs nao deve ser versionado. Sem dispositivo fisico.

## Proximo passo e risco

Conferir diff e revalidar antes de eventual commit/push autorizado. Este ajuste
e frontend e utiliza persistencia ja existente; nao ha nova migration/backend.
Nao incluir DP na main sem nova autorizacao. As pendencias da tarefa anterior
incluem backend e devem seguir seu proprio handoff ao publicar.
