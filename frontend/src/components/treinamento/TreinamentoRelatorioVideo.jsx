import { useEffect, useRef, useState } from 'react';
import { BarraFiltros, BlocoConteudo, TabelaPadrao, CelulaDupla } from '../padrao';
import { getTreinamentoRelatorioVideo } from '../../services/treinamento';
import { useAuth } from '../../contexts/AuthContext';
import { canViewTreinamentoRelatorios } from '../../utils/acessoProduto';

export function tempoVideo(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const dataHora = value => value ? new Date(value).toLocaleString('pt-BR') : '—';

export default function TreinamentoRelatorioVideo() {
  const { user } = useAuth(), permitido = canViewTreinamentoRelatorios(user);
  const [dados, setDados] = useState({ items: [], total: 0 }), [loading, setLoading] = useState(false), [erro, setErro] = useState('');
  const [busca, setBusca] = useState(''), [soSaltos, setSoSaltos] = useState(false), [pagina, setPagina] = useState(1), [revisao, setRevisao] = useState(0), [detalhe, setDetalhe] = useState(null);
  const geracao = useRef(0);
  useEffect(() => {
    const token = ++geracao.current;
    setDados({ items: [], total: 0 }); setDetalhe(null);
    if (!permitido) return;
    setLoading(true); setErro('');
    const timer = setTimeout(() => {
      getTreinamentoRelatorioVideo({ busca: busca.trim(), pulou_final: soSaltos ? 'true' : undefined, pagina })
        .then(data => { if (token === geracao.current) setDados(data); })
        .catch(e => { if (token === geracao.current) setErro(e.message || 'Não foi possível consultar o relatório.'); })
        .finally(() => { if (token === geracao.current) setLoading(false); });
    }, busca ? 350 : 0);
    return () => { clearTimeout(timer); ++geracao.current; };
  }, [permitido, user?.id, busca, soSaltos, pagina, revisao]);
  if (!permitido) return null;
  const colunas = [
    { id: 'usuario', titulo: 'Usuário', tipo: 'texto', noCard: 'titulo', render: p => <CelulaDupla principal={p.usuario?.nome || `Usuário #${p.usuario_id}`} sub={p.ator_id ? `Sessão assumida por ${p.ator?.nome || `#${p.ator_id}`}` : 'Sessão própria'} /> },
    { id: 'video', titulo: 'Vídeo / versão', tipo: 'texto', render: p => <CelulaDupla principal={p.titulo} sub={`Versão ${p.versao.slice(0, 10)} · ${p.sessoes} sessão(ões)`} /> },
    { id: 'tempo', titulo: 'Tempo reproduzido', tipo: 'texto', render: p => tempoVideo(p.segundos) },
    { id: 'cobertura', titulo: 'Trechos únicos', tipo: 'texto', render: p => p.duracao ? `${Number(p.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% de ${tempoVideo(p.duracao)}` : 'Ainda não reproduziu' },
    { id: 'saltos', titulo: 'Avanços / retornos', tipo: 'texto', render: p => `${p.saltos}${p.pulou_final ? ' · avançou ao final' : ''}` },
    { id: 'conclusao', titulo: 'Conclusão manual', tipo: 'texto', render: p => <CelulaDupla principal={p.concluido_manual ? 'Concluído pelo botão' : 'Não concluído'} sub={p.concluido_manual ? dataHora(p.concluido_em) : 'Independente da reprodução'} /> },
    { id: 'ultima', titulo: 'Última visualização', tipo: 'texto', render: p => dataHora(p.ultima_visualizacao) }
  ];
  return <BlocoConteudo titulo="Relatório de reprodução" contagem={loading ? 'Consultando...' : `${dados.total} registro(s) de reprodução`}>
    <p className="text-sm text-[var(--c-muted)] mb-3">Rastreio do player interno a partir desta atualização; não comprova atenção. Pausas, buffering e aba oculta não contam. Concluir continua manual e vale para o conteúdo, não para uma versão específica.</p>
    <BarraFiltros busca={{ valor: busca, aoMudar: v => { setBusca(v); setPagina(1); }, placeholder: 'Buscar usuário ou vídeo' }}
      filtros={[{ id: 'saltos', rotulo: 'Reprodução', unico: true, opcoes: [{ valor: 'final', rotulo: 'Avançou ao final' }] }]}
      ativos={{ saltos: new Set(soSaltos ? ['final'] : []) }} aoAlternar={() => { setSoSaltos(v => !v); setPagina(1); }}
      aoLimpar={() => { setBusca(''); setSoSaltos(false); setPagina(1); }} />
    <div className="app-actionbar my-3"><button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => setRevisao(v => v + 1)}>Atualizar relatório</button></div>
    {erro && <p role="alert" className="text-sm text-[var(--c-danger)] mb-3">{erro}</p>}
    <TabelaPadrao storageKey="tabela:treinamento:rastreio" semIdentidade colunasConfiguraveis colunas={colunas} itens={dados.items || []} carregando={loading}
      vazio="Nenhuma reprodução registrada neste recorte. Abra um vídeo no player interno para iniciar o rastreio."
      acoesLinha={p => <button type="button" className="btn btn-outline btn-sm" onClick={() => setDetalhe(p)}>Ver trechos</button>} />
    <div className="app-actionbar mt-3">
      <button type="button" className="btn btn-outline btn-sm" disabled={loading || pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
      <span className="text-sm">Página {pagina} de {Math.max(1, Math.ceil(dados.total / 50))}</span>
      <button type="button" className="btn btn-outline btn-sm" disabled={loading || pagina * 50 >= dados.total} onClick={() => setPagina(p => p + 1)}>Próxima</button>
    </div>
    {detalhe && <section className="mt-4 border-t border-[var(--c-border)] pt-3" aria-label="Detalhes da reprodução">
      <div className="app-actionbar"><h3 className="font-semibold">{detalhe.usuario?.nome} · {detalhe.titulo}</h3><button type="button" className="btn btn-outline btn-sm" onClick={() => setDetalhe(null)}>Fechar detalhes</button></div>
      <p className="text-sm mt-2">Primeira abertura: {dataHora(detalhe.primeira_visualizacao)}</p>
      <p className="text-sm mt-2">Trechos reproduzidos: {detalhe.trechos.length ? detalhe.trechos.map(([a, b]) => `${tempoVideo(a)}–${tempoVideo(b)}`).join('; ') : 'Nenhum trecho registrado.'}</p>
      <p className="text-sm mt-2">Últimos avanços/retornos (até 100): {detalhe.ultimos_saltos.length ? detalhe.ultimos_saltos.map(([a, b]) => `${tempoVideo(a)} → ${tempoVideo(b)}`).join('; ') : 'Nenhum salto registrado.'}</p>
    </section>}
  </BlocoConteudo>;
}
