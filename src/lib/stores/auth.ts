// src/lib/stores/auth.ts
import { writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { browser } from '$app/environment';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const createAuthStore = () => {
  const { subscribe, update } = writable<AuthState>({
    user: null,
    loading: true,
    error: null
  });

  // Listen to auth state changes (only in browser)
  if (browser) {
    onAuthStateChanged(auth, (user: User | null) => {
      console.log('🔥 Auth state changed:', user ? user.email : 'No user');
      
      // For admin-only app, we might want to skip email verification check initially
      // and just check if user exists
      update(state => ({
        ...state,
        user,
        loading: false,
        error: null
      }));
    });
  }

  return {
    subscribe,
    
    signIn: async (email: string, password: string) => {
      try {
        console.log('🔥 Attempting to sign in:', email);
        update(state => ({ ...state, loading: true, error: null }));
        
        const result = await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Sign in successful:', result.user.email);
        console.log('📧 Email verified:', result.user.emailVerified);
        
        // For debugging - let's NOT block unverified emails initially
        // We can add this check back once basic auth is working
        update(state => ({ 
          ...state, 
          user: result.user, 
          loading: false,
          error: null 
        }));
        
        return { success: true };
      } catch (error: any) {
        console.error('❌ Sign in error:', error);
        const errorMessage = getAuthErrorMessage(error.code);
        update(state => ({ 
          ...state, 
          loading: false, 
          error: errorMessage 
        }));
        return { success: false, error: errorMessage };
      }
    },
    
    signOut: async () => {
      try {
        console.log('🔥 Signing out...');
        await firebaseSignOut(auth);
        update(state => ({ ...state, user: null, error: null }));
        console.log('✅ Sign out successful');
        return { success: true };
      } catch (error: any) {
        console.error('❌ Sign out error:', error);
        update(state => ({ ...state, error: error.message }));
        return { success: false, error: error.message };
      }
    },
    
    clearError: () => {
      update(state => ({ ...state, error: null }));
    }
  };
};

function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/user-disabled':
      return 'This admin account has been disabled.';
    case 'auth/user-not-found':
      return 'No admin account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password for admin account.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/invalid-credential':
      return 'Invalid login credentials. Please check your email and password.';
    case 'auth/configuration-not-found':
      return 'Firebase configuration error. Please contact administrator.';
    default:
      return `Login failed: ${errorCode}. Please check your credentials.`;
  }
}

export const authStore = createAuthStore();