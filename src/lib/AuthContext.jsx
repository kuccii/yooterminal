import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth as useClerkAuth, useUser, useClerk } from '@clerk/react';
import db, { setAuthTokenProvider } from '@/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (isSignedIn && getToken) {
      setAuthTokenProvider(() => getToken());
    } else {
      setAuthTokenProvider(null);
    }
    return () => setAuthTokenProvider(null);
  }, [isSignedIn, getToken]);

  const checkUserAuth = useCallback(async () => {
    if (!clerkLoaded) return;
    setIsLoadingAuth(true);
    try {
      if (!isSignedIn) {
        setUser(null);
        setAuthError(null);
        return;
      }
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
  }, [clerkLoaded, isSignedIn]);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const navigateToLogin = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [navigate, location]);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Clerk sign-out can throw if the session is already gone; fall through to reset state.
    }
    setUser(null);
    setAuthError(null);
    navigate('/');
  }, [signOut, navigate]);

  const value = useMemo(
    () => ({
      user: user || (clerkUser ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || '',
        role: 'user',
        full_name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' '),
      } : null),
      setUser,
      isAuthenticated: Boolean(user || clerkUser),
      isLoadingAuth: !clerkLoaded || isLoadingAuth,
      // No hosted app settings to fetch — kept for interface compatibility.
      isLoadingPublicSettings: false,
      authChecked: !clerkLoaded ? false : authChecked,
      authError,
      setAuthError,
      checkUserAuth,
      navigateToLogin,
      logout,
    }),
    [user, clerkUser, clerkLoaded, isLoadingAuth, authChecked, authError, checkUserAuth, navigateToLogin, logout],
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
