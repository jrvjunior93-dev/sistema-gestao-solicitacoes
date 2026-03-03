import { createContext, useContext, useEffect, useState } from 'react';
import { getTemaSistema, salvarTemaSistema } from '../services/configuracoesSistema';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

const TEMA_PADRAO = {
  palette: {
    bg: '#f5f7fb',
    surface: '#ffffff',
    border: '#e3e7ef',
    text: '#0f172a',
    muted: '#64748b',
    primary: '#2563eb',
    primary600: '#1d4ed8',
    secondary: '#0f766e',
    warning: '#d97706',
    danger: '#dc2626',
    success: '#16a34a'
  },
  actions: {
    ver: '#2563eb',
    assumir: '#16a34a',
    atribuir: '#7c3aed',
    enviar: '#f97316',
    ocultar: '#6b7280'
  },
  status: {
    global: {
      PENDENTE: '#64748b',
      EM_ANALISE: '#0ea5e9',
      AGUARDANDO_AJUSTE: '#f59e0b',
      APROVADA: '#16a34a',
      REJEITADA: '#dc2626',
      CONCLUIDA: '#059669'
    },
    setores: {}
  }
};

function mergeTema(base, override) {
  if (!override) return base;
  return {
    palette: { ...base.palette, ...(override.palette || {}) },
    actions: { ...base.actions, ...(override.actions || {}) },
    status: {
      global: { ...base.status.global, ...(override.status?.global || {}) },
      setores: { ...base.status.setores, ...(override.status?.setores || {}) }
    }
  };
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(TEMA_PADRAO);
  const { user } = useAuth();

  function aplicarPaletteConformeModo(modoEscuroAtivo, palette) {
    const root = document.documentElement;
    const chaves = [
      '--c-bg',
      '--c-surface',
      '--c-border',
      '--c-text',
      '--c-muted',
      '--c-primary',
      '--c-primary-600',
      '--c-secondary',
      '--c-warning',
      '--c-danger',
      '--c-success'
    ];

    if (modoEscuroAtivo) {
      // Em modo escuro, deixa as variáveis definidas no CSS da classe `.dark`
      // para evitar mistura de tema claro + utilitários dark.
      chaves.forEach(chave => root.style.removeProperty(chave));
      return;
    }

    root.style.setProperty('--c-bg', palette.bg);
    root.style.setProperty('--c-surface', palette.surface);
    root.style.setProperty('--c-border', palette.border);
    root.style.setProperty('--c-text', palette.text);
    root.style.setProperty('--c-muted', palette.muted);
    root.style.setProperty('--c-primary', palette.primary);
    root.style.setProperty('--c-primary-600', palette.primary600);
    root.style.setProperty('--c-secondary', palette.secondary);
    root.style.setProperty('--c-warning', palette.warning);
    root.style.setProperty('--c-danger', palette.danger);
    root.style.setProperty('--c-success', palette.success);
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    carregar();
  }, [user?.id, user?.email]);

  useEffect(() => {
    function recarregarAoFocar() {
      carregar();
    }

    window.addEventListener('focus', recarregarAoFocar);
    document.addEventListener('visibilitychange', recarregarAoFocar);
    return () => {
      window.removeEventListener('focus', recarregarAoFocar);
      document.removeEventListener('visibilitychange', recarregarAoFocar);
    };
  }, []);

  useEffect(() => {
    if (!tema?.palette) return;
    const root = document.documentElement;

    const aplicar = () => {
      const darkAtivo = root.classList.contains('dark');
      aplicarPaletteConformeModo(darkAtivo, tema.palette);
    };

    aplicar();

    const observer = new MutationObserver(aplicar);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [tema]);

  async function carregar() {
    try {
      const data = await getTemaSistema();
      setTema(mergeTema(TEMA_PADRAO, data));
    } catch (error) {
      console.error(error);
      setTema(TEMA_PADRAO);
    }
  }

  async function atualizarTema(novoTema) {
    const merged = mergeTema(TEMA_PADRAO, novoTema);
    await salvarTemaSistema(merged);
    setTema(merged);
  }

  return (
    <ThemeContext.Provider value={{ tema, atualizarTema, recarregarTema: carregar }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
