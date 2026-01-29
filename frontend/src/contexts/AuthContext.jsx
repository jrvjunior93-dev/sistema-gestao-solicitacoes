import { createContext, useContext, useState } from 'react';

export const AuthContext = createContext();

export function AuthProvider({ children }) {

  function getStoredUser() {
    try {
      const value = localStorage.getItem('usuario');
      if (!value || value === 'undefined') return null;
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function getStoredToken() {
    const value = localStorage.getItem('token');
    if (!value || value === 'undefined') return null;
    return value;
  }

  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(getStoredToken);

  const isAuthenticated = !!token;

  function login(data) {
    setUser(data.user);
    setToken(data.token);

    localStorage.setItem('usuario', JSON.stringify(data.user));
    localStorage.setItem('token', data.token);
  }

  function logout() {
    setUser(null);
    setToken(null);

    localStorage.removeItem('usuario');
    localStorage.removeItem('token');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
