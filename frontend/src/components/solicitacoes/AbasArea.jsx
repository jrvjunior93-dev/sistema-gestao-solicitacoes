const AREAS = ['TODAS', 'FINANCEIRO', 'COMPRAS', 'JURIDICO', 'RH'];

export default function AbasArea({ areaAtiva, setAreaAtiva }) {
  return (
    <div className="flex gap-2 mb-6 flex-wrap">
      {AREAS.map(area => (
        <button
          key={area}
          onClick={() => setAreaAtiva(area)}
          className={`px-4 py-2 rounded border
            ${areaAtiva === area
              ? 'bg-slate-900 text-white'
              : 'bg-white hover:bg-gray-100'
            }`}
        >
          {area}
        </button>
      ))}
    </div>
  );
}
