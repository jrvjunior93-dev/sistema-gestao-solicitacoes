import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import {
  getAprovacaoDiretoria,
  salvarAprovacaoDiretoria
} from '../services/configuracoesSistema';

const CLASSIFICACOES = [
  { value: 'PUBLICA', label: 'Obras públicas' },
  { value: 'PRIVADA', label: 'Obras privadas' }
];

export default function AprovacaoDiretoria() {
  const [setores, setSetores] = useState([]);
  const [diretorias, setDiretorias] = useState({ PUBLICA: '', PRIVADA: '' });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [setoresData, configuracao] = await Promise.all([
          getSetores(),
          getAprovacaoDiretoria()
        ]);
        setSetores(Array.isArray(setoresData) ? setoresData.filter(item => item?.ativo !== false) : []);
        setDiretorias({
          PUBLICA: String(configuracao?.diretorias?.PUBLICA || configuracao?.diretorias_por_classificacao?.PUBLICA || ''),
          PRIVADA: String(configuracao?.diretorias?.PRIVADA || configuracao?.diretorias_por_classificacao?.PRIVADA || '')
        });
      } catch (error) {
        console.error(error);
        alert('Erro ao carregar configuracao de aprovacao por diretoria.');
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const setoresOrdenados = useMemo(() => (
    [...setores].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'))
  ), [setores]);

  async function salvar() {
    try {
      setSalvando(true);
      await salvarAprovacaoDiretoria({ diretorias });
      alert('Configuracao salva com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao salvar configuracao de aprovacao por diretoria.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <p>Carregando configurações...</p>;
  }

  return (
    <div className="page max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Aprovação por Diretoria</h1>
        <p className="page-subtitle">
          Define qual diretoria recebe a solicitação primeiro conforme a classificação da obra.
          A area responsavel escolhida na Nova Solicitacao permanece como destino final apos a aprovacao.
        </p>
      </div>

      <div className="card space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CLASSIFICACOES.map(item => (
            <label key={item.value} className="form-field">
              <span className="form-label">{item.label}</span>
              <select
                className="input"
                value={diretorias[item.value] || ''}
                onChange={event => setDiretorias(prev => ({
                  ...prev,
                  [item.value]: event.target.value
                }))}
              >
                <option value="">Sem diretoria configurada</option>
                {setoresOrdenados.map(setor => {
                  const codigo = String(setor.codigo || '').trim().toUpperCase();
                  return (
                    <option key={setor.id} value={codigo}>
                      {setor.nome} ({codigo})
                    </option>
                  );
                })}
              </select>
              <span className="form-help">
                Obras com essa classificação entram primeiro na diretoria definida aqui.
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--c-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--c-muted)]">
          Fluxo aplicado: usuário cria a solicitação, seleciona a área responsável final e o sistema envia primeiro para a diretoria da obra.
          Depois da aprovacao, a solicitacao segue automaticamente para a area responsavel escolhida.
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar configuracao'}
          </button>
        </div>
      </div>
    </div>
  );
}
