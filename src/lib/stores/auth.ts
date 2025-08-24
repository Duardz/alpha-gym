// src/lib/stores/auth.ts
import { writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User 
} from 'firebase/auth';
import { browser } from '$app/environment';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

interface SignInResult {
  success: boolean;
  error?: string;
}

const createAuthStore = () => {
  const { subscribe, update } = writable<AuthState>({
    user: null,
    loading: true,
    error: null,
    initialized: false
  });

  // Initialize auth state listener (only in browser)
  if (browser) {
    let unsubscribe: (() => void) | null = null;
    
    // Set up auth state listener
    unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      console.log('🔥 Auth state changed:', user ? `${user.email} (verified: ${user.emailVerified})` : 'No user');
      
      update(state => ({
        ...state,
        user,
        loading: false,
        initialized: true,
        error: null
      }));
    }, (error) => {
      console.error('❌ Auth state change error:', error);
      update(state => ({
        ...state,
        loading: false,
        initialized: true,
        error: 'Authentication service error. Please refresh the page.'
      }));
    });

    // Clean up listener on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (unsubscribe) {
          unsubscribe();
        }
      });
    }
  }

  return {
    subscribe,
    
    // Sign in with email and password
    signIn: async (email: string, password: string): Promise<SignInResult> => {
      if (!email?.trim() || !password?.trim()) {
        const error = 'Email and password are required';
        update(state => ({ ...state, error }));
        return { success: false, error };
      }

      try {
        console.log('🔥 Attempting to sign in:', email.toLowerCase());
        update(state => ({ ...state, loading: true, error: null }));
        
        // Sign in with Firebase
        const result = await signInWithEmailAndPassword(
          auth, 
          email.toLowerCase().trim(), 
          password
        );
        
        console.log('✅ Sign in successful:', result.user.email);
        console.log('📧 Email verified:', result.user.emailVerified);

        // Check if email is verified (recommended for production)
        if (!result.user.emailVerified) {
          console.warn('⚠️ Email not verified, but allowing access');
          // In production, you might want to enforce email verification:
          // await firebaseSignOut(auth);
          // const error = 'Please verify your email before signing in.';
          // update(state => ({ ...state, user: null, loading: false, error }));
          // return { success: false, error };
        }

        // Success - user state will be updated by onAuthStateChanged
        update(state => ({ 
          ...state, 
          loading: false,
          error: null 
        }));
        
        return { success: true };
        
      } catch (error: any) {
        console.error('❌ Sign in error:', error);
        const errorMessage = getAuthErrorMessage(error.code);
        
        update(state => ({ 
          ...state, 
          user: null,
          loading: false, 
          error: errorMessage 
        }));
        
        return { success: false, error: errorMessage };
      }
    },
    
    // Sign out
    signOut: async (): Promise<SignInResult> => {
      try {
        console.log('🔥 Signing out...');
        update(state => ({ ...state, loading: true }));
        
        await firebaseSignOut(auth);
        
        // User state will be updated by onAuthStateChanged
        console.log('✅ Sign out successful');
        return { success: true };
        
      } catch (error: any) {
        console.error('❌ Sign out error:', error);
        const errorMessage = 'Failed to sign out. Please try again.';
        
        update(state => ({ 
          ...state, 
          loading: false,
          error: errorMessage 
        }));
        
        return { success: false, error: errorMessage };
      }
    },
    
    // Send password reset email
    resetPassword: async (email: string): Promise<SignInResult> => {
      if (!email?.trim()) {
        const error = 'Email is required';
        update(state => ({ ...state, error }));
        return { success: false, error };
      }

      try {
        console.log('🔥 Sending password reset email to:', email.toLowerCase());
        update(state => ({ ...state, loading: true, error: null }));
        
        await sendPasswordResetEmail(auth, email.toLowerCase().trim());
        
        update(state => ({ ...state, loading: false, error: null }));
        console.log('✅ Password reset email sent');
        
        return { success: true };
        
      } catch (error: any) {
        console.error('❌ Password reset error:', error);
        const errorMessage = getAuthErrorMessage(error.code);
        
        update(state => ({ 
          ...state, 
          loading: false, 
          error: errorMessage 
        }));
        
        return { success: false, error: errorMessage };
      }
    },
    
    // Clear error message
    clearError: () => {
      update(state => ({ ...state, error: null }));
    },

    // Check if user is admin (based on email domain or specific emails)
    isAdmin: (user: User | null): boolean => {
      if (!user) return false;
      
      // Add your admin email addresses here
      const adminEmails = [
        'admin@alphagym.com',
        // Add more admin emails as needed
      ];
      
      // Check if user email is in admin list
      if (adminEmails.includes(user.email?.toLowerCase() || '')) {
        return true;
      }
      
      // Alternatively, check for specific domain
      // return user.email?.endsWith('@alphagym.com') || false;
      
      return false;
    },

    // Get user display name
    getDisplayName: (user: User | null): string => {
      if (!user) return 'Guest';
      
      if (user.displayName) return user.displayName;
      if (user.email) return user.email.split('@')[0];
      
      return 'User';
    },

    // Force refresh auth state
    refreshAuthState: async (): Promise<void> => {
      try {
        if (auth.currentUser) {
          await auth.currentUser.reload();
          // onAuthStateChanged will automatically trigger with updated user info
        }
      } catch (error) {
        console.error('❌ Error refreshing auth state:', error);
      }
    }
  };
};

// Enhanced error message mapping for better UX
function getAuthErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    // Authentication errors
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/invalid-login-credentials': 'Invalid email or password. Please check your credentials.',
    
    // Rate limiting
    'auth/too-many-requests': 'Too many failed attempts. Please try again later or reset your password.',
    
    // Network errors
    'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
    
    // Configuration errors
    'auth/configuration-not-found': 'Authentication service configuration error. Please contact support.',
    'auth/api-key-not-valid': 'Authentication service configuration error. Please contact support.',
    
    // Password reset errors
    'auth/expired-action-code': 'This password reset link has expired. Please request a new one.',
    'auth/invalid-action-code': 'This password reset link is invalid. Please request a new one.',
    
    // Email verification
    'auth/email-already-verified': 'Your email is already verified.',
    
    // Weak password
    'auth/weak-password': 'Password is too weak. Please choose a stronger password.',
    
    // Email already in use
    'auth/email-already-in-use': 'An account with this email already exists.'
  };

  return errorMessages[errorCode] || `Authentication error: ${errorCode}. Please try again or contact support if the problem persists.`;
}

// Validation helpers
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Export the auth store instance
export const authStore = createAuthStore();