import { useCallback, useEffect, useRef, useState } from 'react';
import VisualizadorArquivoModal from '../components/ui/VisualizadorArquivoModal';
import useRolagemModal from './useRolagemModal';

// O chamador continua escolhendo o endpoint autorizado. O hook so coordena
// apresentacao, concorrencia, foco, rolagem e descarte de resposta atrasada.
export default function useVisualizadorArquivo() {
  const [arquivo, setArquivo] = useState(null);
  const ativo = useRef(true);
  const abertura = useRef(null);
  const disparador = useRef(null);
  const atual = useRef(null);
  const guardarRolagem = useRolagemModal(Boolean(arquivo));
  const liberarBlob = useCallback(() => {
    if (atual.current?.revogarUrl && String(atual.current.url).startsWith('blob:')) URL.revokeObjectURL(atual.current.url);
    atual.current = null;
  }, []);
  useEffect(() => {
    ativo.current = true;
    return () => { ativo.current = false; abertura.current = null; liberarBlob(); };
  }, [liberarBlob]);
  const fecharPreview = useCallback(() => {
    abertura.current = null;
    liberarBlob();
    setArquivo(null);
    const alvo = disparador.current;
    requestAnimationFrame(() => { if (alvo?.isConnected) alvo.focus({ preventScroll: true }); });
  }, [liberarBlob]);
  const abrirPreview = useCallback(async (resolver, dados = {}) => {
    if (abertura.current) return;
    const token = Symbol('preview');
    abertura.current = token;
    disparador.current = document.activeElement;
    guardarRolagem(disparador.current);
    liberarBlob();
    setArquivo({ ...dados, carregando: true });
    try {
      const resultado = typeof resolver === 'function' ? await resolver() : resolver;
      const pronto = { ...dados, ...(typeof resultado === 'string' ? { url: resultado } : resultado), carregando: false };
      if (!ativo.current || abertura.current !== token) {
        if (pronto.revogarUrl && String(pronto.url).startsWith('blob:')) URL.revokeObjectURL(pronto.url);
        return;
      }
      if (!pronto.url) {
        const erro = 'Link seguro indisponível para este arquivo.';
        if (typeof resolver === 'function') throw new Error(erro);
        // Links ja devolvidos pela listagem nao possuem um catch de API.
        // Exibir a indisponibilidade evita uma rejeicao nao tratada no clique.
        setArquivo({ ...pronto, erro });
        return;
      }
      atual.current = pronto;
      setArquivo(pronto);
    } catch (error) {
      if (!ativo.current || abertura.current !== token) return;
      fecharPreview();
      throw error;
    } finally {
      if (abertura.current === token) abertura.current = null;
    }
  }, [guardarRolagem, liberarBlob, fecharPreview]);
  return { abrirPreview, fecharPreview, modalPreview: arquivo ? <VisualizadorArquivoModal arquivo={arquivo} onClose={fecharPreview} /> : null };
}
