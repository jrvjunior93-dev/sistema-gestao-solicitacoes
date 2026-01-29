function calcularSLA(historicos) {
  const slaPorStatus = {};
  let ultimoEvento = null;

  historicos
    .filter(h => h.acao === 'STATUS_ALTERADO')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach(evento => {
      if (ultimoEvento) {
        const inicio = new Date(ultimoEvento.createdAt);
        const fim = new Date(evento.createdAt);
        const diffHoras = (fim - inicio) / 1000 / 60 / 60;

        const status = ultimoEvento.status_novo;

        slaPorStatus[status] =
          (slaPorStatus[status] || 0) + diffHoras;
      }

      ultimoEvento = evento;
    });

  // tempo atual no status atual
  if (ultimoEvento) {
    const inicio = new Date(ultimoEvento.createdAt);
    const agora = new Date();
    const diffHoras = (agora - inicio) / 1000 / 60 / 60;

    slaPorStatus[ultimoEvento.status_novo] =
      (slaPorStatus[ultimoEvento.status_novo] || 0) + diffHoras;
  }

  return slaPorStatus;
}

module.exports = { calcularSLA };
