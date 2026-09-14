import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  enviarHeartbeatSessao,
  getModulosSistema,
  getTimeoutInatividade
} from '../services/configuracoesSistema';
import {
  assumeDevUserRequest,
  getCurrentSession,
  getDevUserSwitchStatus,
  restoreDevUserRequest,
  logoutRequest
} from '../services/auth';
import { clearAuthToken, getAuthToken, setAuthToken } from '../services/api';

export const AuthContext = createContext();
const DEFAULT_IDLE_TIMEOUT_MINUTES = 20;
const IDLE_TIMEOUT_STORAGE_KEY = 'timeout_inatividade_minutos';
const SESSION_RESTORE_DELAYS_MS = [0, 300, 900];

function wait(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authRestoreError, setAuthRestoreError] = useState(null);
  const [devUserSwitch, setDevUserSwitch] = useState(null);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(() => {
    const value = Number(localStorage.getItem(IDLE_TIMEOUT_STORAGE_KEY));
    return Number.isNaN(value) || value <= 0 ? DEFAULT_IDLE_TIMEOUT_MINUTES : value;
  });

  const idleTimerRef = useRef(null);
  const tokenExpireTimerRef = useRef(null);
  const sessionHeartbeatTimerRef = useRef(null);
  const tokenExpireHandledRef = useRef(false);

  const isAuthenticated = !!user;

  function applySession(data) {
    const nextUser = data?.user || null;
    const nextToken = data?.token || getAuthToken() || null;
    const nextExpiresAt = Number(data?.session_expires_at || 0) || null;

    setUser(nextUser);
    setToken(nextToken);
    setSessionExpiresAt(nextExpiresAt);
    setAuthToken(nextToken);
    if (Object.prototype.hasOwnProperty.call(data || {}, 'dev_user_switch')) {
      setDevUserSwitch(data?.dev_user_switch || { enabled: false });
    }
    tokenExpireHandledRef.current = false;
  }

  async function login(data) {
    setAuthRestoreError(null);
    applySession(data);
  }

  async function refreshSession() {
    const data = await getCurrentSession();
    setAuthRestoreError(null);
    applySession({
      ...data,
      token: data?.token || token
    });
    return data;
  }

  function updateUser(patch) {
    setUser((current) => {
      if (!current) return current;
      return {
        ...current,
        ...(patch || {})
      };
    });
  }

  async function loadDevUserSwitch() {
    const data = await getDevUserSwitchStatus();
    setDevUserSwitch(data || { enabled: false });
    return data;
  }

  async function assumeDevUser(userId) {
    const data = await assumeDevUserRequest(userId);
    applySession(data);
    return data;
  }

  async function restoreDevUser() {
    const data = await restoreDevUserRequest();
    applySession(data);
    return data;
  }

  async function logout({ skipRequest = false } = {}) {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (tokenExpireTimerRef.current) {
      clearTimeout(tokenExpireTimerRef.current);
      tokenExpireTimerRef.current = null;
    }
    if (sessionHeartbeatTimerRef.current) {
      clearInterval(sessionHeartbeatTimerRef.current);
      sessionHeartbeatTimerRef.current = null;
    }

    if (!skipRequest) {
      try {
        await logoutRequest();
      } catch {
        // o objetivo principal e limpar a sessao local mesmo se a API falhar
      }
    }

    setUser(null);
    setToken(null);
    setSessionExpiresAt(null);
    setAuthToken(null);
    clearAuthToken();
    tokenExpireHandledRef.current = false;
    setAuthRestoreError(null);
    setDevUserSwitch(null);
  }

  function handleTokenExpired() {
    if (tokenExpireHandledRef.current) return;
    tokenExpireHandledRef.current = true;
    alert('Sua sessao expirou. Faca login novamente.');
    void logout();
  }

  useEffect(() => {
    let cancelado = false;

    async function restoreSession() {
      let lastError = null;

      for (const delay of SESSION_RESTORE_DELAYS_MS) {
        if (cancelado) return;
        await wait(delay);

        try {
          const data = await getCurrentSession();
          if (cancelado) return;
          setAuthRestoreError(null);
          applySession(data);
          setAuthReady(true);
          return;
        } catch (error) {
          lastError = error;
          const status = Number(error?.status || 0);
          if ([401, 403].includes(status)) {
            break;
          }
        }
      }

      if (cancelado) return;

      const status = Number(lastError?.status || 0);
      if ([401, 403].includes(status)) {
        setUser(null);
        setToken(null);
        setSessionExpiresAt(null);
        clearAuthToken();
        setDevUserSwitch(null);
        setAuthRestoreError(null);
        tokenExpireHandledRef.current = false;
      } else {
        setAuthRestoreError(lastError || new Error('Nao foi possivel restaurar a sessao.'));
      }
      setAuthReady(true);
    }

    void restoreSession();

    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelado = false;
    (async () => {
      try {
        const [timeoutData, modulesData] = await Promise.all([
          getTimeoutInatividade().catch(() => null),
          getModulosSistema().catch(() => null)
        ]);

        const minutos = Number(timeoutData?.minutos);
        if (!cancelado && !Number.isNaN(minutos) && minutos > 0) {
          setIdleTimeoutMinutes(minutos);
          localStorage.setItem(IDLE_TIMEOUT_STORAGE_KEY, String(minutos));
        }

        const modules = Array.isArray(modulesData?.modules) ? modulesData.modules : null;
        if (!cancelado && modules) {
          setUser((current) => {
            if (!current) return current;
            return {
              ...current,
              modulos_habilitados: modules
            };
          });
        }
      } catch {
        // fallback silencioso para valor atual/default
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const reiniciarTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = setTimeout(() => {
        alert('Sessao encerrada por inatividade. Faca login novamente.');
        void logout();
      }, Math.max(1, Number(idleTimeoutMinutes || DEFAULT_IDLE_TIMEOUT_MINUTES)) * 60 * 1000);
    };

    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach((evento) => window.addEventListener(evento, reiniciarTimer, { passive: true }));
    reiniciarTimer();

    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, reiniciarTimer));
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [idleTimeoutMinutes, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !sessionExpiresAt) return undefined;

    if (tokenExpireTimerRef.current) {
      clearTimeout(tokenExpireTimerRef.current);
      tokenExpireTimerRef.current = null;
    }
    tokenExpireHandledRef.current = false;

    const msUntilExpire = sessionExpiresAt - Date.now();
    if (msUntilExpire <= 0) {
      handleTokenExpired();
      return undefined;
    }

    tokenExpireTimerRef.current = setTimeout(() => {
      handleTokenExpired();
    }, msUntilExpire);

    return () => {
      if (tokenExpireTimerRef.current) {
        clearTimeout(tokenExpireTimerRef.current);
        tokenExpireTimerRef.current = null;
      }
    };
  }, [isAuthenticated, sessionExpiresAt, token]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let cancelado = false;

    const enviarHeartbeat = async () => {
      try {
        await enviarHeartbeatSessao();
      } catch (error) {
        if (!cancelado && Number(error?.status || 0) === 401) {
          await logout({ skipRequest: true });
        }
      }
    };

    void enviarHeartbeat();

    sessionHeartbeatTimerRef.current = setInterval(() => {
      void enviarHeartbeat();
    }, 60 * 1000);

    return () => {
      cancelado = true;
      if (sessionHeartbeatTimerRef.current) {
        clearInterval(sessionHeartbeatTimerRef.current);
        sessionHeartbeatTimerRef.current = null;
      }
    };
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        sessionExpiresAt,
        idleTimeoutMinutes,
        isAuthenticated,
        authReady,
        authRestoreError,
        login,
        refreshSession,
        logout,
        updateUser,
        devUserSwitch,
        loadDevUserSwitch,
        assumeDevUser,
        restoreDevUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
