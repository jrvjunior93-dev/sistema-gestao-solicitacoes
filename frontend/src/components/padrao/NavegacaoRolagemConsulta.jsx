import { useEffect, useRef } from 'react';
import { HiOutlineArrowsRightLeft, HiOutlineArrowsUpDown, HiOutlineListBullet } from 'react-icons/hi2';

export function AlternadorPaginacaoConsulta({ numerada, ocupado, aoAlternar }) {
  const acao = numerada ? 'Alternar para rolagem infinita' : 'Alternar para páginas';
  return <button type="button" className="btn btn-outline btn-sm inline-flex items-center gap-1"
    disabled={ocupado} title={acao} aria-label={`Modo atual: ${numerada ? 'paginação numerada' : 'rolagem infinita'}. ${acao}`}
    onClick={aoAlternar}>
    {numerada ? <HiOutlineListBullet aria-hidden="true" /> : <HiOutlineArrowsUpDown aria-hidden="true" />}
    {numerada ? 'Páginas' : 'Rolagem'}<HiOutlineArrowsRightLeft aria-hidden="true" />
  </button>;
}

export default function NavegacaoRolagemConsulta({ pagina, paginas, quantidade, total, carregando, bloqueado, erro, aoCarregar, aoRepetir, rotulo = 'pagamentos' }) {
  const sentinela = useRef(null), pedido = useRef(false);
  const temMais = pagina < paginas;
  useEffect(() => { if (!carregando) pedido.current = false; }, [carregando, pagina, erro]);
  useEffect(() => {
    if (!temMais || carregando || bloqueado || erro || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => {
      if (!pedido.current && entries.some(entry => entry.isIntersecting)) {
        pedido.current = true;
        aoCarregar();
      }
    }, { rootMargin: '200px' });
    if (sentinela.current) observer.observe(sentinela.current);
    return () => observer.disconnect();
  }, [temMais, carregando, bloqueado, erro, pagina, aoCarregar]);
  return <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" aria-label="Navegação por rolagem">
    <span role="status">{carregando ? `Carregando ${rotulo}…` : erro ? `Não foi possível carregar os ${rotulo}.`
      : temMais ? `${quantidade} de ${total} registro(s) carregados` : `Fim da lista · ${total} registro(s)`}</span>
    <div ref={sentinela} data-rolagem-sentinela aria-hidden="true" className="h-px w-full" />
    {(temMais || erro) && <button type="button" className="btn btn-outline btn-sm"
      disabled={carregando || bloqueado} onClick={() => {
        if (pedido.current) return;
        pedido.current = true;
        if (erro) aoRepetir(); else aoCarregar();
      }}>{erro ? 'Tentar carregar novamente' : `Carregar mais ${rotulo}`}</button>}
  </div>;
}
