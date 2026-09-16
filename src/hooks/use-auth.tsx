"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
  type AccountRole,
} from "@/lib/auth/roles";
import { DEFAULT_CURRENCY } from "@/lib/currency";

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  beta_features: string[];
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface ZenithContextResponse {
  user: { id: string; email: string; name: string | null };
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    role: string | null;
    beta_features: string[];
    account_id: string;
    account_role: string;
  };
  account: { id: string; name: string; default_currency: string };
}

export type AccountStatus = "loading" | "ready" | "unlinked" | "error";

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
  accountStatus: AccountStatus;
  accountStatusDetail: string | null;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    setProfileLoading(true);
    setStatusDetail(null);

    try {
      const response = await fetch("/api/auth/zenith/context", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        setUser(null);
        setProfile(null);
        setAccount(null);
        if (response.status !== 401) {
          setStatusDetail(`account context returned HTTP ${response.status}`);
        }
        return false;
      }

      const data = (await response.json()) as ZenithContextResponse;
      const accountRole = isAccountRole(data.profile.account_role)
        ? data.profile.account_role
        : null;

      if (!accountRole) {
        setStatusDetail("invalid account role");
        return false;
      }

      setUser({ id: data.user.id, email: data.user.email, created_at: "" });
      setProfile({
        ...data.profile,
        beta_features: data.profile.beta_features ?? [],
        account_role: accountRole,
      });
      setAccount({
        ...data.account,
        default_currency: data.account.default_currency ?? DEFAULT_CURRENCY,
      });
      return true;
    } catch (error) {
      console.error("[ZenithAuth] context request failed", error);
      setUser(null);
      setProfile(null);
      setAccount(null);
      setStatusDetail("account context request failed");
      return false;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadContext().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadContext]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/zenith/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setProfile(null);
    setAccount(null);
    window.location.href = "/zenith-login";
  }, []);

  const derived = useMemo(() => {
    const role = profile?.account_role ?? null;
    return {
      accountRole: role,
      accountId: profile?.account_id ?? null,
      isOwner: role === "owner",
      isAdmin: role === "admin",
      isAgent: role === "agent",
      isViewer: role === "viewer",
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [profile]);

  const accountStatus: AccountStatus = loading
    ? "loading"
    : !user
      ? "loading"
      : profileLoading
        ? "loading"
        : !profile
          ? "error"
          : derived.accountId && derived.accountRole
            ? "ready"
            : "unlinked";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileLoading,
        signOut,
        refreshProfile: loadContext,
        account,
        defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
        accountStatus,
        accountStatusDetail: statusDetail,
        ...derived,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
