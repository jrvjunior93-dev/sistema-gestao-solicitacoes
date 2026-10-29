export default function LegendaDestaques() {
  return <details className="sol-legenda">
    <summary>Legenda de destaques e ordem da fila</summary>
    <ul>
      <li><span className="sol-legenda-cor sol-legenda-cor--amarelo" /> <strong>Amarelo:</strong> atividade pendente para você. Aprovar ou recusar o retorno encerra essa pendência; ler ou comentar não encerra.</li>
      <li><span className="sol-legenda-cor sol-legenda-cor--vermelho" /> <strong>Vermelho:</strong> sua atividade ultrapassou o prazo existente. Sem prazo definido, não indicamos atraso.</li>
      <li><span className="sol-legenda-cor sol-legenda-cor--azul" /> <strong>Azul + contador:</strong> interações não lidas. Ler remove apenas esse marcador; ele pode coexistir com uma atividade.</li>
      <li><span className="sol-legenda-cor sol-legenda-cor--neutro" /> <strong>Aguardando outro setor:</strong> acompanhamento, sem prioridade só por estar vinculado.</li>
    </ul>
    <p>Ordem: atividades atrasadas → aprovações de retorno → demais atividades → interações não lidas → acompanhamento. Dentro do grupo, prazo mais próximo ou pendência mais antiga. Ordenar uma coluna desempata dentro desses grupos; ao agrupar, a fila é distribuída pelos grupos escolhidos.</p>
    <p>O tempo “aguardando” mede a espera e não define atraso. O vencimento financeiro da solicitação não é usado como prazo da atividade. Atividades aparecem conforme as regras já identificadas pelo sistema.</p>
  </details>;
}
