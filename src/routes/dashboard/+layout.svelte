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

  // Navigation items with corrected paths
  const navItems = [
    { 
      href: '/dashboard', 
      label: 'Dashboard', 
      icon: '📊',
      description: 'Overview & Analytics'
    },
    { 
      href: '/dashboard/members', 
      label: 'Members', 
      icon: '👥',
      description: 'Membership Management'
    },
    { 
      href: '/dashboard/walk-ins', 
      label: 'Walk-ins', 
      icon: '🚶',
      description: 'Day Pass Records'
    },
    { 
      href: '/dashboard/inventory', 
      label: 'Inventory', 
      icon: '📦',
      description: 'Products & Supplies'
    },
    { 
      href: '/dashboard/cashflow', 
      label: 'Cashflow', 
      icon: '💰',
      description: 'Income Tracking'
    },
    { 
      href: '/dashboard/expenses', 
      label: 'Expenses', 
      icon: '💸',
      description: 'Expense Management'
    },
    { 
      href: '/dashboard/reports', 
      label: 'Reports', 
      icon: '📈',
      description: 'Analytics & Reports'
    }
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
    const result = await authStore.signOut();
    if (result.success) {
      goto('/', { replaceState: true });
    }
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

  // Get current page title
  function getPageTitle(pathname: string): string {
    const item = navItems.find(nav => nav.href === pathname);
    return item ? item.label : 'Alpha Forge';
  }

  // Check if current route matches nav item
  function isActiveRoute(href: string, currentPath: string): boolean {
    if (href === '/dashboard') {
      return currentPath === '/dashboard';
    }
    return currentPath.startsWith(href);
  }

  $: currentPath = $page.url.pathname;
  $: pageTitle = getPageTitle(currentPath);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $authStore.loading}
  <!-- Loading state -->
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p class="mt-4 text-gray-600 font-medium">Loading Alpha Forge...</p>
    </div>
  </div>
{:else if $authStore.user}
  <!-- Authenticated layout -->
  <div class="min-h-screen bg-gray-50 flex">
    
    <!-- Mobile sidebar backdrop -->
    {#if sidebarOpen}
      <div 
        class="fixed inset-0 z-40 bg-gray-900 bg-opacity-50 lg:hidden transition-opacity duration-300" 
        role="button"
        tabindex="0"
        on:click={closeSidebar}
        on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeSidebar()}
        aria-label="Close sidebar"
      ></div>
    {/if}

    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl transform {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0">
      
      <!-- Sidebar header -->
      <div class="flex items-center justify-between h-16 px-6 bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span class="text-blue-600 font-bold text-lg">🏋️</span>
          </div>
          <div>
            <h1 class="text-xl font-bold text-white">Alpha Forge</h1>
            <p class="text-blue-100 text-xs">Gym Management</p>
          </div>
        </div>
        <button 
          on:click={closeSidebar}
          class="text-white lg:hidden hover:bg-blue-800 p-2 rounded-md transition-colors duration-200"
          aria-label="Close sidebar"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {#each navItems as item}
          <a
            href={item.href}
            class="group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 {
              isActiveRoute(item.href, currentPath)
                ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700 shadow-sm' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }"
            on:click={closeSidebar}
          >
            <span class="mr-4 text-xl group-hover:scale-110 transition-transform duration-200" aria-hidden="true">
              {item.icon}
            </span>
            <div class="flex-1">
              <div class="font-semibold">{item.label}</div>
              <div class="text-xs opacity-75">{item.description}</div>
            </div>
            {#if isActiveRoute(item.href, currentPath)}
              <div class="w-2 h-2 bg-blue-600 rounded-full"></div>
            {/if}
          </a>
        {/each}
      </nav>

      <!-- User info and logout -->
      <div class="p-4 border-t border-gray-200 bg-gray-50">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span class="text-blue-600 font-semibold text-sm">
              {$authStore.user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900">Admin User</p>
            <p class="text-xs text-gray-500 truncate">{$authStore.user.email}</p>
          </div>
          <button
            on:click={handleSignOut}
            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
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

    <!-- Main content area -->
    <div class="flex-1 lg:pl-0 flex flex-col min-w-0">
      
      <!-- Top navigation bar for mobile -->
      <div class="lg:hidden bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div class="px-4 py-3 flex items-center justify-between">
          <button
            on:click={toggleSidebar}
            class="text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-100 transition-colors duration-200"
            aria-label="Open sidebar"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          <div class="flex items-center space-x-2">
            <span class="text-blue-600 text-xl">🏋️</span>
            <h2 class="text-lg font-semibold text-gray-900">{pageTitle}</h2>
          </div>
          <div class="w-10 h-10"></div>
        </div>
      </div>

      <!-- Desktop header -->
      <div class="hidden lg:block bg-white border-b border-gray-200 px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{pageTitle}</h1>
            <p class="text-sm text-gray-600 mt-1">
              {navItems.find(item => isActiveRoute(item.href, currentPath))?.description || 'Gym management dashboard'}
            </p>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </div>

      <!-- Page content -->
      <main class="flex-1 overflow-auto">
        <slot />
      </main>
    </div>
  </div>
{:else}
  <!-- Not authenticated - redirect handled in onMount -->
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p class="mt-2 text-gray-600">Redirecting to login...</p>
    </div>
  </div>
{/if}