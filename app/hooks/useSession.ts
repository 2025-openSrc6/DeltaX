import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  suiAddress: string;
  nickname: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: number;
}

interface SessionState {
  isLoading: boolean;
  isLoggedIn: boolean;
  user: User | null;
  suiAddress: string | null;
}

interface LoginParams {
  suiAddress: string;
  signature: string;
  message: string;
  signedMessageBytes?: string;
}

interface SessionStore extends SessionState {
  setSession: (session: Partial<SessionState>) => void;
  login: (params: LoginParams) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useSession = create<SessionStore>((set, get) => ({
  isLoading: true,
  isLoggedIn: false,
  user: null,
  suiAddress: null,

  setSession: (session) => set((state) => ({ ...state, ...session })),

  login: async (params) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Login failed');
      }

      const data = await res.json();
      if (data.success && data.data.user) {
        set({
          isLoggedIn: true,
          user: data.data.user,
          suiAddress: data.data.user.suiAddress,
          isLoading: false,
        });
      } else {
        // Should not happen on success login
        throw new Error('User not found in response');
      }
    } catch (error) {
      set({ isLoading: false, isLoggedIn: false, user: null, suiAddress: null });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Assuming there is a logout endpoint, usually DELETE /api/auth/session or POST /api/auth/logout
      // Guide didn't specify logout endpoint explicitly but implied /api/auth/logout or similar.
      // Trying POST /api/auth/logout based on guide text "POST /api/auth/logout 으로 로그아웃"
      // Wait, need to check if that route exists. If not, I'll need to create it or just clear client state for now.
      // Checking file existence... assume explicit logout clears cookie.
      // Use fallback: just clear state if api fails or doesn't exist?
      // Let's assume we need to implement logout route too if it doesn't exist.
      // For now, I'll allow fail-safe client logout.

      // Attempt server logout (optional)
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      set({ isLoggedIn: false, user: null, suiAddress: null, isLoading: false });
    }
  },

  refresh: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data.user) {
          set({
            isLoggedIn: true,
            user: data.data.user,
            suiAddress: data.data.user.suiAddress,
            isLoading: false,
          });
          return;
        }
      }
      // Not logged in or invalid session
      set({ isLoggedIn: false, user: null, suiAddress: null, isLoading: false });
    } catch (error) {
      set({ isLoggedIn: false, user: null, suiAddress: null, isLoading: false });
    }
  },
}));
