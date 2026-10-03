import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState
} from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { resolverAtalhos } from './navigationConfig';
import { getListaPreferencias, salvarListaPreferencias } from '../services/listasPreferencias';
import { getAtalhosSetor, sugestoesPadraoPara, tokenSetorDe } from '../services/atalhos';

// =====================================================================
// ATALHOS DO USUÁRIO — estado único para a barra do topo, a seção
// "Seus atalhos" da Home e a estrela de fixar de cada tela.
// ---------------------------------------------------------------------
// Composição, nesta ordem:
//   1. OBRIGATÓRIOS do setor (admin; cadeado, não removíveis);
//   2. lista PESSOAL do usuário (banco, lista 'atalhos');
//   3. antes da primeira gravação do usuário: sugeridos do setor
//      (admin) ou SUGESTOES_PADRAO — removíveis.
// Atalho sem permissão é descartado na resolução (nunca quebra).
// SEM LIMITE de quantidade: quem corta a exibição é cada superfície.
// =====================================================================

const AtalhosContext = createContext(null);

export function AtalhosProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [pessoais, setPessoais] = useState([]);        // ids na ordem do usuário
  const [padroesSetor, setPadroesSetor] = useState([]); // linhas do admin p/ o setor
  const [carregando, setCarregando] = useState(true);
  // Enquanto o usuário nunca salvou, a lista pessoal é a sugestão — a
  // primeira mutação grava e a partir daí só vale o banco.
  const jaSalvouRef = useRef(false);

  useEffect(() => {
    let ativo = true;
    if (!user?.id) {
      setPessoais([]);
      setPadroesSetor([]);
      setCarregando(false);
      return undefined;
    }
    setCarregando(true);
    const setor = tokenSetorDe(user);
    Promise.all([
      getListaPreferencias('atalhos').catch(() => null),
      setor ? getAtalhosSetor(setor).catch(() => []) : Promise.resolve([])
    ]).then(([prefs, padroes]) => {
      if (!ativo) return;
      const linhas = (Array.isArray(padroes) ? padroes : []).filter((linha) => linha.ativo);
      setPadroesSetor(linhas);
      const salvos = Array.isArray(prefs?.itens) ? prefs.itens : null;
      if (salvos) {
        jaSalvouRef.current = true;
        setPessoais(salvos);
      } else {
        jaSalvouRef.current = false;
        const sugeridosAdmin = linhas
          .filter((linha) => !linha.obrigatorio)
          .sort((a, b) => a.posicao - b.posicao)
          .map((linha) => linha.destino_id);
        setPessoais(sugeridosAdmin.length > 0 ? sugeridosAdmin : sugestoesPadraoPara(user));
      }
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [user?.id]);

  const persistir = useCallback((itens) => {
    jaSalvouRef.current = true;
    salvarListaPreferencias('atalhos', { itens }).catch(() => {
      // melhor manter o estado em memória do que perder a ação do usuário
    });
  }, []);

  const obrigatoriosIds = useMemo(() => (
    padroesSetor
      .filter((linha) => linha.obrigatorio)
      .sort((a, b) => a.posicao - b.posicao)
      .map((linha) => linha.destino_id)
  ), [padroesSetor]);

  // Resolução final: ids → destinos visíveis (permissão filtrada aqui).
  const atalhos = useMemo(() => {
    const pessoaisSemObrigatorios = pessoais.filter((id) => !obrigatoriosIds.includes(id));
    const obrigatorios = resolverAtalhos(user, obrigatoriosIds)
      .map((item) => ({ ...item, obrigatorio: true }));
    const doUsuario = resolverAtalhos(user, pessoaisSemObrigatorios)
      .map((item) => ({ ...item, obrigatorio: false }));
    return [...obrigatorios, ...doUsuario];
  }, [user, pessoais, obrigatoriosIds]);

  const fixados = useMemo(() => new Set(atalhos.map((item) => item.id)), [atalhos]);

  const fixar = useCallback((id) => {
    setPessoais((atuais) => {
      if (atuais.includes(id)) return atuais;
      const novos = [...atuais, id];
      persistir(novos);
      return novos;
    });
  }, [persistir]);

  const remover = useCallback((id) => {
    if (obrigatoriosIds.includes(id)) return; // cadeado
    setPessoais((atuais) => {
      const novos = atuais.filter((item) => item !== id);
      persistir(novos);
      return novos;
    });
  }, [persistir, obrigatoriosIds]);

  const alternar = useCallback((id) => {
    if (fixados.has(id)) remover(id);
    else fixar(id);
  }, [fixados, fixar, remover]);

  // Reordena a PARTE PESSOAL (os obrigatórios ficam sempre à esquerda).
  const reordenar = useCallback((idsPessoaisNaNovaOrdem) => {
    setPessoais(() => {
      const novos = idsPessoaisNaNovaOrdem.slice();
      persistir(novos);
      return novos;
    });
  }, [persistir]);

  const value = useMemo(() => ({
    atalhos,
    fixados,
    carregando,
    fixar,
    remover,
    alternar,
    reordenar
  }), [atalhos, fixados, carregando, fixar, remover, alternar, reordenar]);

  return <AtalhosContext.Provider value={value}>{children}</AtalhosContext.Provider>;
}

export function useAtalhos() {
  const contexto = useContext(AtalhosContext);
  if (!contexto) {
    // Fora do provider (ex.: tela de login) — sem atalhos, sem quebrar.
    return {
      atalhos: [],
      fixados: new Set(),
      carregando: false,
      fixar: () => {},
      remover: () => {},
      alternar: () => {},
      reordenar: () => {}
    };
  }
  return contexto;
}
