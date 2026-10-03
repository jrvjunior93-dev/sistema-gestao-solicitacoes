import { useEffect, useState } from 'react';
import { BlocoConteudo, Pagina, PageHeader, Avisos, useAvisos } from '../components/padrao';
import { criarStatusInternoContasPagar, getStatusInternosContasPagar } from '../services/financeiro';

export default function ConfiguracoesStatusInternosPagar() {
  const [status, setStatus] = useState([]);
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    getStatusInternosContasPagar()
      .then((dados) => setStatus(Array.isArray(dados) ? dados : []))
      .catch((error) => avisar.erro(error?.message || 'Não foi possível carregar os status.'))
      .finally(() => setCarregando(false));
  }, []);

  async function adicionar(event) {
    event.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      setStatus(await criarStatusInternoContasPagar(nome.trim()));
      setNome('');
      avisar.sucesso('Status interno cadastrado.');
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível cadastrar o status.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      <PageHeader titulo="Status internos do Contas a Pagar" descricao="Classificações de acompanhamento. Não alteram a situação contábil nem a baixa dos títulos." />
      <Avisos avisos={avisos} aoFechar={fechar} />
      <BlocoConteudo titulo="Cadastrar status" variante="secundario">
        <form className="flex flex-wrap items-end gap-2" onSubmit={adicionar}>
          <label className="min-w-56 flex-1 text-sm font-medium">
            Nome do status
            <input className="input mt-1 w-full" value={nome} onChange={(event) => setNome(event.target.value)} maxLength={80} required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nome.trim()}>{salvando ? 'Salvando...' : 'Adicionar'}</button>
        </form>
      </BlocoConteudo>
      <BlocoConteudo titulo="Status disponíveis" contagem={`${status.length} status`} variante="neutro">
        {carregando ? <p className="text-sm text-[var(--c-muted)]">Carregando...</p> : status.length ? (
          <ul className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
            {status.map((item) => <li key={item} className="py-2 text-sm">{item}</li>)}
          </ul>
        ) : <p className="text-sm text-[var(--c-muted)]">Nenhum status cadastrado. Crie o primeiro acima.</p>}
      </BlocoConteudo>
    </Pagina>
  );
}
