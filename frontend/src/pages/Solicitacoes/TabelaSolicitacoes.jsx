import { useMemo } from 'react';
import TabelaPadrao from '../../components/padrao/TabelaPadrao';
import Avisos from '../../components/padrao/Avisos';
import { useAvisos } from '../../components/padrao/Avisos';
import { useConfirmacao } from '../../components/padrao/Confirmacao';
import { acoesDaLinha, construirColunas, permissoesDeLinha } from './LinhaSolicitacao';
import { useAuth } from '../../contexts/AuthContext';
import { userHasSetorCapability } from '../../utils/setor';
import { hasEnabledModule } from '../../utils/acessoProduto';

/**
 * A TABELA DE SOLICITAÇÕES — migrada para a `TabelaPadrao`.
 *
 * ## O que saiu daqui, e por que não faz falta
 *
 * A versão anterior tinha, à mão: a `<table>` crua (reprovada pela R1 em tela
 * do manifesto), o redimensionamento de coluna por `pointermove` com as
 * larguras em `localStorage`, a leitura de `window.innerWidth` para decidir
 * quais colunas cabem em tablet e celular, e a ordenação local das três
 * colunas ordenáveis. Todos os quatro são capacidade da `TabelaPadrao` —
 * ResizableTable, cartões no celular, ordenação opt-in, largura por `tipo`.
 * Reescrever isso na tela era exatamente o que a R16b chama de exceção
 * acumulada.
 *
 * **E o corte por viewport sumiu de propósito**: ele existia porque a tabela
 * crua não tinha para onde ir num celular, então escondia colunas — o dado
 * simplesmente não aparecia, sem dizer que estava faltando. Na `TabelaPadrao`
 * as MESMAS colunas viram cartões no celular; nenhuma coluna é escondida por
 * causa do tamanho da tela, e quem quiser esconder coluna continua com o
 * `visibleColumns` (a escolha do usuário), que segue valendo.
 *
 * ## Ordenação (R14b), registrada porque tem limite
 *
 * As três colunas ordenáveis (data, valor, data resposta/pagamento) ordenam
 * **o que a tela recebeu** — era assim antes desta migração também. Se a
 * lista estiver paginada no servidor, ordenar a página mente sobre o
 * conjunto: por isso a prop OPCIONAL `aoOrdenar` está exposta e repassada.
 * Quem montar a tela paginada passa `aoOrdenar` e a ordenação vai ao
 * servidor; sem ela o comportamento é o mesmo de sempre.
 */
export default function TabelaSolicitacoes({
  solicitacoes,
  onAtualizar,
  setoresMap,
  permissaoUsuario,
  mostrarArquivadas = false,
  selecionadasIds = [],
  onToggleSelecionada,
  onToggleSelecionarTodas,
  visibleColumns = null,
  // Aditivo, opcional: com ele a ordenação vai ao servidor (R14b); sem ele,
  // o componente ordena a página recebida, como esta tela sempre fez.
  aoOrdenar
}) {
  const { user } = useAuth();
  // R19/R21 — faixa de aviso e modal de confirmação do sistema no lugar de
  // `alert()`/`confirm()`; o retorno do `confirmar` se desestrutura em quem
  // chama (ver `AcoesSolicitacao`).
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const isSetorObra = userHasSetorCapability(user, 'eh_setor_obra');
  const moduloContratosHabilitado = hasEnabledModule(user, 'CONTRATOS');
  const selecaoHabilitada = typeof onToggleSelecionada === 'function';

  const permissoes = useMemo(
    () => permissoesDeLinha(user, permissaoUsuario),
    [user, permissaoUsuario]
  );

  const idsSelecionados = useMemo(
    // Os ids chegam da tela em tipos mistos; o componente compara com o que
    // `getId` devolve — os dois lados normalizam para número.
    () => new Set((selecionadasIds || []).map(Number)),
    [selecionadasIds]
  );

  const visibleSet = useMemo(() => {
    if (!Array.isArray(visibleColumns) || visibleColumns.length === 0) return null;
    return new Set(visibleColumns);
  }, [visibleColumns]);

  const colunas = useMemo(() => {
    const todas = construirColunas({
      permissoes,
      setoresMap,
      mostrarRefContrato: isSetorObra,
      mostrarContrato: moduloContratosHabilitado,
      mostrarArquivadas,
      onAtualizar,
      avisar,
      confirmar
    });
    if (!visibleSet) return todas;
    /*
      A coluna de identidade não se esconde (R16b): sem ela a linha deixa de
      dizer de qual solicitação se está falando.
    */
    return todas.filter((coluna) => coluna.tipo === 'identidade' || visibleSet.has(coluna.id));
  }, [
    permissoes,
    setoresMap,
    isSetorObra,
    moduloContratosHabilitado,
    mostrarArquivadas,
    onAtualizar,
    avisar,
    confirmar,
    visibleSet
  ]);

  const acoes = useMemo(
    () => acoesDaLinha({
      permissoes,
      setoresMap,
      mostrarArquivadas,
      onAtualizar,
      avisar,
      confirmar
    }),
    [permissoes, setoresMap, mostrarArquivadas, onAtualizar, avisar, confirmar]
  );

  return (
    <>
      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      <TabelaPadrao
        colunas={colunas}
        itens={solicitacoes || []}
        getId={(item) => Number(item.id)}
        storageKey="solicitacoes:tabela"
        rotuloRolagem="Rolar a tabela de solicitações"
        vazio="Nenhuma solicitação encontrada"
        larguraAcoes={320}
        acoesLinha={acoes}
        aoOrdenar={aoOrdenar}
        {...(selecaoHabilitada ? {
          selecao: {
            selecionados: idsSelecionados,
            aoAlternar: (id) => onToggleSelecionada?.(id),
            // O contrato desta tela é "alternar todas" sem argumento; o
            // componente oferece (marcar, ids) e a tela ignora — quem sabe
            // quais são "todas" aqui é quem montou a página.
            aoAlternarTodos: () => onToggleSelecionarTodas?.()
          },
          // A1 — a linha continua acionável (e alcançável por teclado: a
          // TabelaPadrao dá tabIndex e Enter/Espaço na linha clicável).
          aoClicarLinha: (item) => onToggleSelecionada?.(item.id)
        } : {})}
      />

      {elementoConfirmacao}
    </>
  );
}
