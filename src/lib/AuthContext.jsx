import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import db from '@/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const me = await db.auth.me();
      setUser(me);
      if (me && !me.role) {
        setAuthError({ type: 'user_not_registered' });
      } else {
        setAuthError(null);
      }
    } catch {
      setUser(null);
      setAuthError(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const navigateToLogin = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [navigate, location]);

  const logout = useCallback(async () => {
    try {
      await db.auth.logout();
    } finally {
      setUser(null);
      setAuthError(null);
      navigate('/');
    }
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      // No hosted app settings to fetch — kept for interface compatibility.
      isLoadingPublicSettings: false,
      authChecked,
      authError,
      setAuthError,
      checkUserAuth,
      navigateToLogin,
      logout,
    }),
    [user, isLoadingAuth, authChecked, authError, checkUserAuth, navigateToLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
