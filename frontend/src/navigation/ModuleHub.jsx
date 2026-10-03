import { useContext, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { getVisibleModule, resolveLabel } from './navigationConfig';
import { Pagina, PageHeader, BlocoConteudo } from '../components/padrao';
import NavCard from './NavCard';

// NÍVEL 2 — Hub do módulo: grid de subitens no mesmo padrão visual do
// hub principal. Só renderiza subitens permitidos; módulo sem acesso
// devolve o usuário ao início (sem tela branca).
//
// MIGRADA PARA O PADRÃO DA CASA EM 05/09, no mesmo commit da Home (que
// documenta a decisão inteira): a casca própria (`.hub-page`/`.hub-header`
// com `h1.hub-title`) virou `Pagina`/`PageHeader` — a faixa fixa presa à
// topbar que C1/C2/X2 esperam — e a grade de subitens passou a morar
// dentro de um `BlocoConteudo` primário. Ela é a ÚNICA pergunta desta
// tela ("o que existe aqui dentro?"), então é o único bloco (B1/B2).
export default function ModuleHub() {
  const { moduleId } = useParams();
  const { user } = useContext(AuthContext);

  const mod = useMemo(() => getVisibleModule(user, moduleId), [user, moduleId]);

  if (!mod) {
    return <Navigate to="/" replace />;
  }

  if (mod.children.length === 1) {
    return <Navigate to={mod.children[0].to} replace />;
  }

  return (
    <Pagina className="hub-page">
      <PageHeader
        titulo={resolveLabel(mod, user)}
        contagem={`${mod.children.length} tela(s)`}
        descricao={mod.desc}
      />

      <BlocoConteudo variante="primario" cor={`var(--module-${mod.id})`}>
        <nav aria-label={`Telas do módulo ${mod.label}`}>
          {/* A zeragem da lista ja mora na propria `.hub-grid`, com a mesma
              explicacao: medida, mesmo 0, nao se escreve na tela (R10). O
              `style` inline aqui repetia o que a classe ja fazia. */}
          <ul className="hub-grid">
            {mod.children.map((item) => (
              <li key={item.id}>
                <NavCard
                  to={item.to}
                  icon={item.icon}
                  label={resolveLabel(item, user)}
                  desc={item.desc}
                  accentVar={`--module-${mod.id}`}
                />
              </li>
            ))}
          </ul>
        </nav>
      </BlocoConteudo>
    </Pagina>
  );
}
