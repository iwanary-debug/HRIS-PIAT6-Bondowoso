import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { convex, getStoredToken, setStoredToken } from "@/lib/convex";
import { type Permission, ROLE_LABELS, type Role } from "@/domain/permissions";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
}

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  roleLabel: string | null;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => getStoredToken());
  // Bumped whenever the browser holds a NEW token so the Convex client is
  // re-driven (setAuth) without a page reload — otherwise the `session`
  // subscription keeps running as a guest until the user refreshes manually.
  const [authEpoch, setAuthEpoch] = React.useState(0);
  const session = useQuery(api.auth.session, token ? {} : "skip");
  const loginMutation = useMutation(api.auth.login);
  const registerMutation = useMutation(api.auth.register);
  const logoutMutation = useMutation(api.auth.logout);

  React.useEffect(() => {
    if (token && session === undefined) setStoredToken(token);
  }, [token, session]);

  React.useEffect(() => {
    convex.setAuth(async () => getStoredToken() ?? "");
  }, [token, authEpoch]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await loginMutation({ email, password });
      setStoredToken(result.token);
      setToken(result.token);
      setAuthEpoch((epoch) => epoch + 1);
    },
    [loginMutation],
  );

  const register = React.useCallback(
    async (name: string, email: string, password: string) => {
      await registerMutation({ name, email, password });
    },
    [registerMutation],
  );

  const logout = React.useCallback(async () => {
    if (token) {
      try {
        await logoutMutation({ token });
      } catch {
        // Session may already be gone — clearing locally is enough.
      }
    }
    setStoredToken(null);
    setToken(null);
    setAuthEpoch((epoch) => epoch + 1);
  }, [logoutMutation, token]);

  const rawUser = session?.user as AuthUser | undefined;

  const value = React.useMemo<AuthContextValue>(() => {
    const user = rawUser ?? null;
    return {
      user,
      status: !token ? "unauthenticated" : session === undefined ? "loading" : user ? "authenticated" : "unauthenticated",
      login,
      register,
      logout,
      can: (permission) => !!user?.permissions.includes(permission),
      canAny: (...permissions) => permissions.some((p) => !!user?.permissions.includes(p)),
      roleLabel: user ? (ROLE_LABELS[user.role] ?? user.role) : null,
    };
  }, [rawUser, token, session, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** Require a permission in the UI. The backend check remains authoritative. */
export function usePermission(permission: Permission): boolean {
  return useAuth().can(permission);
}
