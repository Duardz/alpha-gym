<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { User } from 'firebase/auth';

  let sidebarOpen = false;

  interface AuthState {
    user: User | null;
    loading: boolean;
    error: string | null;
  }

  // Navigation items - updated paths without (app)
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/members', label: 'Members', icon: '👥' },
    { href: '/walk-ins', label: 'Walk-ins', icon: '🚶' },
    { href: '/inventory', label: 'Inventory', icon: '📦' },
    { href: '/cashflow', label: 'Cashflow', icon: '💰' },
    { href: '/expenses', label: 'Expenses', icon: '💸' },
    { href: '/reports', label: 'Reports', icon: '📈' }
  ];

  onMount(() => {
    // Redirect to login if not authenticated
    const unsubscribe = authStore.subscribe(({ user, loading }: AuthState) => {
      if (!loading && !user) {
        goto('/', { replaceState: true });
      }
    });

    return unsubscribe;
  });

  async function handleSignOut() {
    await authStore.signOut();
    goto('/', { replaceState: true });
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function closeSidebar() {
    sidebarOpen = false;
  }

  // Close sidebar on escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && sidebarOpen) {
      closeSidebar();
    }
  }

  $: currentPath = $page.url.pathname;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $authStore.loading}
  <!-- Loading state -->
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p class="mt-4 text-gray-600">Loading Alpha Forge...</p>
    </div>
  </div>
{:else if $authStore.user}
  <!-- Authenticated layout -->
  <div class="min-h-screen bg-gray-50 flex">
    <!-- Mobile sidebar backdrop -->
    {#if sidebarOpen}
      <div 
        class="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden" 
        role="button"
        tabindex="0"
        on:click={closeSidebar}
        on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeSidebar()}
        aria-label="Close sidebar"
      ></div>
    {/if}

    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0">
      <!-- Sidebar header -->
      <div class="flex items-center justify-between h-16 px-6 bg-blue-600">
        <h1 class="text-xl font-bold text-white">🏋️ Alpha Forge</h1>
        <button 
          on:click={closeSidebar}
          class="text-white lg:hidden hover:bg-blue-700 p-1 rounded"
          aria-label="Close sidebar"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="mt-8 flex-1">
        <div class="px-4 space-y-2">
          {#each navItems as item}
            <a
              href={item.href}
              class="flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors duration-150 {
                currentPath === item.href 
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }"
              on:click={closeSidebar}
            >
              <span class="mr-3 text-lg" aria-hidden="true">{item.icon}</span>
              {item.label}
            </a>
          {/each}
        </div>
      </nav>

      <!-- User info and logout -->
      <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div class="flex items-center">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">Admin User</p>
            <p class="text-xs text-gray-500 truncate">{$authStore.user.email}</p>
          </div>
          <button
            on:click={handleSignOut}
            class="ml-3 p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md transition-colors duration-150"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="flex-1 lg:pl-0">
      <!-- Top bar for mobile -->
      <div class="lg:hidden bg-white shadow-sm border-b border-gray-200">
        <div class="px-4 py-3 flex items-center justify-between">
          <button
            on:click={toggleSidebar}
            class="text-gray-600 hover:text-gray-900 p-1 rounded"
            aria-label="Open sidebar"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          <h2 class="text-lg font-semibold text-gray-900">Alpha Forge</h2>
          <div class="w-8"></div>
        </div>
      </div>

      <!-- Page content -->
      <main class="flex-1">
        <slot />
      </main>
    </div>
  </div>
{/if}