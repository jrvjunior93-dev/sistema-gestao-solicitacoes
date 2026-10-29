import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { cadastroRhObra } from '../../services/rhDp';
import { Avisos, useAvisos, useConfirmacao } from '../padrao';
import useVisualizadorArquivo from '../../hooks/useVisualizadorArquivo';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';

export default function RhColaboradorObraModal({ id, onFechar, onSalvo }) {
  const [dados, setDados] = useState(null), [observacoes, setObservacoes] = useState('');
  const [ocupado, setOcupado] = useState(false), [tipo, setTipo] = useState('');
  const [validade, setValidade] = useState(''), [file, setFile] = useState(null);
  const [erroCarregamento, setErroCarregamento] = useState(''), [tentativa, setTentativa] = useState(0);
  const chave = useRef(crypto.randomUUID()), trava = useRef(false), arquivoRef = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  useWorkspaceWork(Boolean(file) || Boolean(dados && observacoes !== (dados.colaborador.observacoes || '')), ocupado, `cadastro-obra:${id}`);
  async function carregar() {
    const result = await cadastroRhObra(id); setDados(result);
  }
  async function fecharCadastro() {
    if (trava.current) return;
    if (file || (dados && observacoes !== (dados.colaborador.observacoes || ''))) {
      const result = await confirmar({ titulo: 'Fechar cadastro', mensagem: 'Há alterações não salvas. Deseja descartá-las?', rotuloConfirmar: 'Descartar e fechar' });
      if (!result.ok) return;
    }
    onFechar();
  }
  useEffect(() => {
    let ativo = true;
    setDados(null); setErroCarregamento(''); setObservacoes('');
    cadastroRhObra(id).then(result => { if (ativo) { setDados(result); setObservacoes(result.colaborador.observacoes || ''); } })
      .catch(error => { if (ativo) setErroCarregamento(error.message || 'Não foi possível carregar o cadastro.'); });
    return () => { ativo = false; };
  }, [id, tentativa]);
  async function executar(fn) {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try { await fn(); } catch (error) { avisar.erro(error.message); }
    finally { trava.current = false; setOcupado(false); }
  }
  return <><OverlayModal rotulo="Cadastro do colaborador" largura="760px" onFechar={fecharCadastro}>
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{dados?.colaborador.nome || 'Cadastro do colaborador'}</h2>
        <button className="btn btn-outline btn-sm" disabled={ocupado} onClick={fecharCadastro}>Fechar</button></div>
      <Avisos avisos={avisos} aoFechar={fechar} />
      {!dados ? erroCarregamento ? <div className="space-y-2">
        <p role="alert">{erroCarregamento}</p>
        <button className="btn btn-outline btn-sm" onClick={() => { setErroCarregamento(''); setTentativa(v => v + 1); }}>Tentar novamente</button>
      </div> : <p role="status">Carregando cadastro…</p> : <>
        <label className="form-group"><span className="form-label">Observações</span><textarea aria-label="Observações" className="form-control" rows={4} maxLength={4000}
          value={observacoes} disabled={ocupado || !dados.pode_editar} onChange={e => setObservacoes(e.target.value)} /></label>
        {dados.pode_editar && <button className="btn btn-primary btn-sm" disabled={ocupado || observacoes === (dados.colaborador.observacoes || '')} onClick={() => executar(async () => {
          const result = await cadastroRhObra(id, '/observacoes', { method: 'PATCH', data: { observacoes } });
          setDados(result); setObservacoes(result.colaborador.observacoes || ''); await onSalvo?.(); avisar.sucesso('Observações salvas.');
        })}>Salvar observações</button>}
        <section className="space-y-3 border-t pt-3"><h3 className="text-sm font-semibold">Documentos enviados pela obra</h3>
          {dados.documentos.length ? <ul className="divide-y">{dados.documentos.map(doc => <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 break-words">{doc.nome_original}<small className="block">{doc.tipo_nome} · {doc.status}</small></span>
            <button className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => executar(async () => {
              await abrirPreview(() => cadastroRhObra(id, `/documentos/${doc.id}/link`), { nome: doc.nome_original });
            })}>Abrir</button></li>)}</ul> : <p className="text-sm">Nenhum documento enviado pela obra.</p>}
          {dados.pode_editar && <div className="space-y-2">
            <label className="form-group"><span className="form-label">Tipo de documento</span><select aria-label="Tipo de documento" className="form-control" value={tipo} disabled={ocupado}
              onChange={e => { setTipo(e.target.value); chave.current = crypto.randomUUID(); }}><option value="">Selecione</option>
              {dados.tipos_documento.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
            {dados.tipos_documento.find(t => String(t.id) === tipo)?.exige_validade && <label className="form-group"><span className="form-label">Validade</span>
              <input aria-label="Validade" type="date" className="form-control" value={validade} disabled={ocupado} onChange={e => { setValidade(e.target.value); chave.current = crypto.randomUUID(); }} /></label>}
            <label className="form-group"><span className="form-label">Arquivo</span><input aria-label="Arquivo" ref={arquivoRef} type="file" disabled={ocupado} onChange={e => {
              setFile(e.target.files?.[0] || null); chave.current = crypto.randomUUID();
            }} /></label>
            <button className="btn btn-outline btn-sm" disabled={ocupado || !tipo || !file} onClick={() => executar(async () => {
              const data = new FormData(); data.append('file', file); data.append('tipo_documento_id', tipo);
              data.append('chave_idempotencia', chave.current); if (validade) data.append('validade', validade);
              await cadastroRhObra(id, '/documentos', { method: 'POST', data });
              setFile(null); if (arquivoRef.current) arquivoRef.current.value = ''; chave.current = crypto.randomUUID();
              await carregar(); avisar.sucesso('Documento enviado.');
            })}>Enviar documento</button>
          </div>}
        </section>
      </>}
    </div>
  </OverlayModal>{modalPreview}{elementoConfirmacao}</>;
}
