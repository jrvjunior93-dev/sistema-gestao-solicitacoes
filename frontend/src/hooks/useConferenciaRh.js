import { useEffect, useRef, useState } from 'react';
import { camposAlterados } from '../utils/rhApuracaoConferencia';

// Fila por tela: as respostas integrais da API chegam na mesma ordem e nao
// apagam rascunhos de outras linhas. O servidor tambem serializa por apuracao.
export default function useConferenciaRh(detalhe, setDetalhe, toEditState, atualizar, avisar) {
  const [edicoes, setEdicoes] = useState({});
  const [estados, setEstados] = useState({});
  const detalheRef = useRef(detalhe);
  const edicoesRef = useRef({});
  const basesRef = useRef({});
  const estadosRef = useRef({});
  const tentativas = useRef({});
  const fila = useRef(Promise.resolve());
  const montado = useRef(true);
  detalheRef.current = detalhe;

  function estado(id, valor) {
    estadosRef.current = { ...estadosRef.current, [id]: valor };
    if (montado.current) setEstados(estadosRef.current);
  }
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  function reiniciar(novo = detalheRef.current) {
    basesRef.current = Object.fromEntries((novo?.itens || []).map((item) => [item.id, item]));
    edicoesRef.current = Object.fromEntries((novo?.itens || []).map((item) => [item.id, toEditState(item)]));
    estadosRef.current = {};
    tentativas.current = {};
    setEdicoes(edicoesRef.current);
    setEstados({});
  }
  useEffect(() => {
    reiniciar();
  }, [detalhe?.id]);
  useEffect(() => {
    const prevenir = (event) => {
      if (Object.values(estadosRef.current).some((value) => ['pendente', 'salvando', 'erro'].includes(value))) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevenir);
    const impedirSaida = (event) => {
      if (event.target.closest?.('a, button[role="tab"]') && temPendencias()) {
        event.preventDefault(); event.stopPropagation();
        avisar.alerta('Aguarde o salvamento ou resolva os ajustes pendentes antes de sair da conferencia.');
      }
    };
    document.addEventListener('click', impedirSaida, true);
    return () => {
      window.removeEventListener('beforeunload', prevenir);
      document.removeEventListener('click', impedirSaida, true);
    };
  }, []);

  function editar(id, campo, valor) {
    delete tentativas.current[id];
    const anterior = edicoesRef.current[id];
    edicoesRef.current = { ...edicoesRef.current, [id]: { ...anterior, [campo]: valor,
      ...(campo !== 'status' ? { status: 'PENDENTE' } : {}) } };
    setEdicoes(edicoesRef.current);
    estado(id, 'pendente');
  }

  function salvar(id, status) {
    if (estadosRef.current[id] === 'salvando') return fila.current;
    const recuperandoErro = estadosRef.current[id] === 'erro';
    const apuracaoId = detalheRef.current?.id;
    const antes = { ...edicoesRef.current[id] };
    const estadoSolicitado = status || tentativas.current[id];
    const rascunho = { ...edicoesRef.current[id], ...(estadoSolicitado ? { status: estadoSolicitado } : {}) };
    const linhaAtual = basesRef.current[id];
    if (!linhaAtual) return fila.current;
    const payload = camposAlterados(toEditState(linhaAtual), rascunho);
    if (!Object.keys(payload).length) {
      if (estadosRef.current[id] === 'pendente') estado(id, 'salvo');
      return fila.current;
    }
    if (estadoSolicitado) tentativas.current[id] = estadoSolicitado;
    estado(id, 'salvando');
    fila.current = fila.current.then(async () => {
      if (detalheRef.current?.id !== apuracaoId || !montado.current) return;
      try {
        const resposta = await atualizar(apuracaoId, id, { ...payload, revisao_conferencia: linhaAtual.revisao_conferencia });
        if (!montado.current || detalheRef.current?.id !== apuracaoId) return;
        detalheRef.current = resposta;
        setDetalhe(resposta);
        const alteradoEnquantoSalvava = JSON.stringify(edicoesRef.current[id]) !== JSON.stringify(antes);
        // Linhas sem rascunho acompanham o servidor; linhas em edicao mantem
        // tambem a revisao original, para detectar conflitos em vez de sobrescrever.
        for (const linha of resposta.itens) {
          if (linha.id !== id && !['pendente', 'salvando', 'erro'].includes(estadosRef.current[linha.id])) {
            basesRef.current[linha.id] = linha;
            edicoesRef.current = { ...edicoesRef.current, [linha.id]: toEditState(linha) };
          }
        }
        if (!alteradoEnquantoSalvava) {
          const linha = resposta.itens.find((linha) => linha.id === id);
          basesRef.current[id] = linha;
          edicoesRef.current = { ...edicoesRef.current, [id]: toEditState(linha) };
        }
        setEdicoes(edicoesRef.current);
        estado(id, alteradoEnquantoSalvava ? 'pendente' : 'salvo');
        delete tentativas.current[id];
        if (recuperandoErro && !alteradoEnquantoSalvava) avisar.sucesso('Alterações da linha salvas.');
      } catch (error) {
        if (!montado.current || detalheRef.current?.id !== apuracaoId) return;
        estado(id, 'erro');
        avisar.erro(error?.message || 'Nao foi possivel salvar esta linha. Seus ajustes continuam na tela.');
      }
    });
    return fila.current;
  }

  function temPendencias() {
    return Object.values(estadosRef.current).some((value) => ['pendente', 'salvando', 'erro'].includes(value));
  }
  return { edicoes, estados, editar, salvar, temPendencias, reiniciar };
}
