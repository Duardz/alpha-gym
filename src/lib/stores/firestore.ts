import { writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { browser } from '$app/environment';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const createAuthStore = () => {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    loading: true,
    error: null
  });

  // Listen to auth state changes
  if (browser) {
    onAuthStateChanged(auth, (user) => {
      update(state => ({
        ...state,
        user,
        loading: false
      }));
    });
  }

  return {
    subscribe,
    signIn: async (email: string, password: string) => {
      try {
        update(state => ({ ...state, loading: true, error: null }));
        const result = await signInWithEmailAndPassword(auth, email, password);
        update(state => ({ ...state, user: result.user, loading: false }));
        return { success: true };
      } catch (error: any) {
        update(state => ({ 
          ...state, 
          loading: false, 
          error: error.message || 'Login failed' 
        }));
        return { success: false, error: error.message };
      }
    },
    signOut: async () => {
      try {
        await firebaseSignOut(auth);
        update(state => ({ ...state, user: null, error: null }));
        return { success: true };
      } catch (error: any) {
        update(state => ({ ...state, error: error.message }));
        return { success: false, error: error.message };
      }
    },
    clearError: () => {
      update(state => ({ ...state, error: null }));
    }
  };
};

export const authStore = createAuthStore();