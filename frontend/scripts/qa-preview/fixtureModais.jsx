import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OverlayModal from '../../src/components/ui/OverlayModal.jsx';
import ModalPortal from '../../src/components/ui/ModalPortal.jsx';

const params = new URLSearchParams(window.location.search);
const tipo = params.get('tipo') || 'padrao';
const defeito = params.get('d') || '';

function Cabecalho(props) {
  return (
    <header {...props} className="modal-header">
      <div>
        <h2 className="modal-title">Modal de prova</h2>
        <p className="modal-subtitle">Cabeçalho e ações devem permanecer acessíveis.</p>
      </div>
      <button type="button" className="btn btn-outline btn-sm">Fechar</button>
    </header>
  );
}

function Corpo() {
  return (
    <main data-prova-corpo className="modal-body">
      <p>Conteúdo operacional completo, com rolagem vertical e horizontal próprias.</p>
      <div style={{ minWidth: 980 }}>
        <table className="table" style={{ minWidth: 980 }}>
          <thead><tr><th>Documento</th><th>Fornecedor</th><th>Obra</th><th>Vencimento</th><th>Valor</th></tr></thead>
          <tbody>
            {Array.from({ length: 30 }, (_, indice) => (
              <tr key={indice}>
                <td>TIT-{String(indice + 1).padStart(6, '0')}</td>
                <td>Fornecedor de teste com descrição completa</td>
                <td>Obra usada na validação responsiva</td>
                <td>30/09/2026</td>
                <td>R$ 10.000,00</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Rodape(props) {
  return (
    <footer {...props} className="modal-footer">
      <button type="button" className="btn btn-outline">Cancelar</button>
      <button type="button" className="btn btn-primary">Confirmar</button>
    </footer>
  );
}

function ModalPadrao() {
  return (
    <OverlayModal aberto rotulo="Modal padrão de prova" largura="960px">
      <Cabecalho data-modal="cabecalho" />
      <Corpo />
      <Rodape data-modal="rodape" />
    </OverlayModal>
  );
}

function ModalLegado() {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Modal legado de prova"
      style={defeito === 'rodape' ? { alignItems: 'flex-end' } : undefined}
    >
      <section data-prova-painel className="modal-dialog modal-dialog--lg" style={{ maxHeight: 'min(80dvh, 650px)' }}>
        <Cabecalho data-modal="cabecalho" />
        <Corpo />
        <Rodape data-modal="rodape" />
      </section>
    </div>
  );
}

function ModalPortalCustomizado() {
  return (
    <ModalPortal closeOnEscape={false}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-label="Modal customizado com portal">
        <section data-prova-painel className="app-modal-surface app-modal-surface--wide">
          <Cabecalho data-modal="cabecalho" />
          <Corpo />
          <Rodape data-modal="rodape" />
        </section>
      </div>
    </ModalPortal>
  );
}

function ModalFixoLegado() {
  return (
    <div className="layout-main">
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Modal fixo legado"
      >
        <section
          data-prova-painel
          className="card"
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            width: 'min(960px, calc(100vw - 2rem))',
            maxHeight: 'min(80dvh, 650px)',
            overflow: 'clip',
            padding: 0
          }}
        >
          <Cabecalho data-modal="cabecalho" />
          <Corpo />
          <Rodape data-modal="rodape" />
        </section>
      </div>
    </div>
  );
}

function ModalCustos() {
  return (
    <div className="cr-page">
      <div className="cr-import-modal-backdrop" role="dialog" aria-modal="true" aria-label="Modal de importação de custos">
        <section data-prova-painel className="cr-import-modal">
          <header data-modal="cabecalho" className="cr-import-modal__header">
            <div><span>Prévia da importação</span><h2>Custos planejados</h2><p>Confira todas as linhas antes de confirmar.</p></div>
            <button type="button" className="btn btn-outline btn-sm">Fechar</button>
          </header>
          <div data-prova-corpo className="cr-import-modal__table"><Corpo /></div>
          <footer data-modal="rodape" className="cr-import-modal__footer">
            <div data-state="valid"><span>Todos os itens passaram na validação.</span></div>
            <div><button type="button" className="btn btn-outline">Cancelar</button><button type="button" className="btn btn-primary">Confirmar</button></div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function App() {
  if (tipo === 'legado') return <ModalLegado />;
  if (tipo === 'portal') return <ModalPortalCustomizado />;
  if (tipo === 'fixo') return <ModalFixoLegado />;
  if (tipo === 'custos') return <ModalCustos />;
  return <ModalPadrao />;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
