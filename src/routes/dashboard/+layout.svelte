<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { User } from 'firebase/auth';

  let sidebarOpen = false;
  let hoveredItem = '';
  let timeString = '';

  interface AuthState {
    user: User | null;
    loading: boolean;
    error: string | null;
  }

  // Enhanced navigation items with futuristic design data
  const navItems = [
    { 
      href: '/dashboard', 
      label: 'Dashboard', 
      icon: '⚡',
      description: 'Command Center',
      color: 'from-blue-500 to-cyan-500',
      glowColor: 'shadow-blue-500/25'
    },
    { 
      href: '/dashboard/members', 
      label: 'Members', 
      icon: '👤',
      description: 'User Matrix',
      color: 'from-purple-500 to-indigo-500',
      glowColor: 'shadow-purple-500/25'
    },
    { 
      href: '/dashboard/renewals', 
      label: 'Renewals', 
      icon: '🔄',
      description: 'Cycle Manager',
      color: 'from-green-500 to-emerald-500',
      glowColor: 'shadow-green-500/25'
    },
    { 
      href: '/dashboard/walk-ins', 
      label: 'Walk-ins', 
      icon: '🎯',
      description: 'Access Portal',
      color: 'from-orange-500 to-amber-500',
      glowColor: 'shadow-orange-500/25'
    },
    { 
      href: '/dashboard/store', 
      label: 'Store', 
      icon: '🛒',
      description: 'Commerce Hub',
      color: 'from-pink-500 to-rose-500',
      glowColor: 'shadow-pink-500/25'
    },
    { 
      href: '/dashboard/inventory', 
      label: 'Inventory', 
      icon: '📦',
      description: 'Stock Matrix',
      color: 'from-teal-500 to-cyan-500',
      glowColor: 'shadow-teal-500/25'
    },
    { 
      href: '/dashboard/cashflow', 
      label: 'Cashflow', 
      icon: '💎',
      description: 'Finance Grid',
      color: 'from-emerald-500 to-green-500',
      glowColor: 'shadow-emerald-500/25'
    },
    { 
      href: '/dashboard/expenses', 
      label: 'Expenses', 
      icon: '⚡',
      description: 'Cost Analytics',
      color: 'from-red-500 to-pink-500',
      glowColor: 'shadow-red-500/25'
    },
    { 
      href: '/dashboard/reports', 
      label: 'Reports', 
      icon: '📊',
      description: 'Data Nexus',
      color: 'from-violet-500 to-purple-500',
      glowColor: 'shadow-violet-500/25'
    }
  ];

  // Update time every second for futuristic feel
  onMount(() => {
    const updateTime = () => {
      const now = new Date();
      timeString = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    // Redirect to login if not authenticated
    const unsubscribe = authStore.subscribe(({ user, loading }: AuthState) => {
      if (!loading && !user) {
        goto('/', { replaceState: true });
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
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

  function getPageDescription(pathname: string): string {
    const item = navItems.find(nav => nav.href === pathname);
    return item ? item.description : 'Command Center';
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
  $: pageDescription = getPageDescription(currentPath);
  $: activeNavItem = navItems.find(item => isActiveRoute(item.href, currentPath));
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $authStore.loading}
  <!-- Enhanced Loading state -->
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
    <div class="text-center">
      <div class="relative">
        <div class="w-20 h-20 border-4 border-cyan-500/30 rounded-full animate-pulse"></div>
        <div class="absolute inset-0 w-20 h-20 border-4 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
        <div class="absolute inset-2 w-16 h-16 border-4 border-t-transparent border-r-purple-400 border-b-transparent border-l-transparent rounded-full animate-spin animation-delay-75"></div>
      </div>
      <div class="mt-8 space-y-2">
        <div class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          ALPHA FORGE
        </div>
        <div class="text-sm text-gray-400 tracking-widest">INITIALIZING SYSTEM...</div>
        <div class="flex justify-center space-x-1 mt-4">
          <div class="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
          <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce animation-delay-100"></div>
          <div class="w-2 h-2 bg-pink-400 rounded-full animate-bounce animation-delay-200"></div>
        </div>
      </div>
    </div>
  </div>
{:else if $authStore.user}
  <!-- Futuristic authenticated layout -->
  <div class="h-screen flex overflow-hidden bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900">
    
    <!-- Mobile sidebar backdrop with blur effect -->
    {#if sidebarOpen}
      <div 
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-all duration-300" 
        role="button"
        tabindex="0"
        on:click={closeSidebar}
        on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeSidebar()}
        aria-label="Close sidebar"
      ></div>
    {/if}

    <!-- Futuristic Sidebar -->
    <div class="fixed inset-y-0 left-0 z-50 w-80 transform {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col">
      
      <!-- Sidebar background with glass effect -->
      <div class="absolute inset-0 bg-gradient-to-b from-slate-800/95 via-slate-900/95 to-black/95 backdrop-blur-xl border-r border-cyan-500/20"></div>
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent"></div>
      
      <!-- Header Section -->
      <div class="relative flex items-center justify-between h-20 px-6 border-b border-cyan-500/20">
        <div class="flex items-center space-x-4">
          <!-- Futuristic Logo -->
          <div class="relative">
            <div class="w-12 h-12 bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <span class="text-white font-bold text-xl">⚡</span>
            </div>
            <div class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          
          <div class="flex flex-col">
            <h1 class="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              ALPHA FORGE
            </h1>
            <div class="flex items-center space-x-2 text-xs">
              <span class="text-green-400 animate-pulse">●</span>
              <span class="text-gray-400 font-mono">{timeString}</span>
            </div>
          </div>
        </div>
        
        <!-- Close button for mobile -->
        <button 
          on:click={closeSidebar}
          class="text-gray-400 lg:hidden hover:text-cyan-400 p-2 rounded-lg hover:bg-cyan-500/10 transition-all duration-200"
          aria-label="Close sidebar"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Current Status Display -->
      <div class="relative px-6 py-4 border-b border-cyan-500/10">
        <div class="bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-4 border border-cyan-500/20">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-cyan-400 font-mono tracking-wider">ACTIVE MODULE</span>
            <div class="flex space-x-1">
              <div class="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
              <div class="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-75"></div>
            </div>
          </div>
          <div class="text-white font-semibold">{pageTitle}</div>
          <div class="text-xs text-gray-400 mt-1">{pageDescription}</div>
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="relative flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
        {#each navItems as item}
          <a
            href={item.href}
            class="group relative flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300 hover:scale-105 {
              isActiveRoute(item.href, currentPath)
                ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-xl ' + item.glowColor 
                : 'text-gray-300 hover:text-white hover:bg-slate-800/50'
            }"
            on:click={closeSidebar}
            on:mouseenter={() => hoveredItem = item.href}
            on:mouseleave={() => hoveredItem = ''}
          >
            <!-- Background glow effect -->
            {#if isActiveRoute(item.href, currentPath)}
              <div class="absolute inset-0 bg-gradient-to-r {item.color} rounded-xl opacity-20 blur-sm"></div>
            {/if}
            
            <!-- Icon container -->
            <div class="relative flex items-center justify-center w-10 h-10 rounded-lg {
              isActiveRoute(item.href, currentPath)
                ? 'bg-white/20 shadow-inner' 
                : 'bg-slate-700/50 group-hover:bg-slate-600/50'
            } transition-all duration-300">
              <span class="text-lg group-hover:scale-110 transition-transform duration-200">
                {item.icon}
              </span>
            </div>
            
            <!-- Text content -->
            <div class="ml-4 flex-1">
              <div class="font-semibold tracking-wide">{item.label}</div>
              <div class="text-xs opacity-75 {
                isActiveRoute(item.href, currentPath) ? 'text-white/80' : 'text-gray-400'
              }">{item.description}</div>
            </div>

            <!-- Active indicator -->
            {#if isActiveRoute(item.href, currentPath)}
              <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <div class="w-6 h-0.5 bg-gradient-to-r from-transparent to-white/50 rounded-full"></div>
              </div>
            {:else if hoveredItem === item.href}
              <div class="w-1 h-6 bg-gradient-to-b from-transparent via-gray-400 to-transparent rounded-full opacity-50"></div>
            {/if}

            <!-- Hover effect -->
            <div class="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-xl"></div>
            </div>
          </a>
        {/each}
      </nav>

      <!-- User Profile Section -->
      <div class="relative p-6 border-t border-cyan-500/20">
        <div class="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/20">
          <div class="flex items-center space-x-4">
            <!-- User Avatar -->
            <div class="relative">
              <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                <span class="text-white font-bold text-lg">
                  {$authStore.user.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-slate-800 rounded-full"></div>
            </div>

            <!-- User Info -->
            <div class="flex-1 min-w-0">
              <div class="text-white font-semibold truncate">Admin User</div>
              <div class="text-xs text-gray-400 truncate">{$authStore.user.email}</div>
              <div class="flex items-center mt-1 space-x-2">
                <span class="text-xs text-green-400">●</span>
                <span class="text-xs text-green-400 font-mono">ONLINE</span>
              </div>
            </div>

            <!-- Sign out button -->
            <button
              on:click={handleSignOut}
              class="group p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all duration-200"
              title="Sign out"
              aria-label="Sign out"
            >
              <svg class="w-5 h-5 group-hover:rotate-12 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Decorative Elements -->
      <div class="absolute top-20 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
      <div class="absolute bottom-32 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-w-0 lg:ml-0">
      
      <!-- Futuristic top navigation bar for mobile -->
      <div class="lg:hidden bg-slate-900/95 backdrop-blur-xl border-b border-cyan-500/20 sticky top-0 z-30 flex-shrink-0">
        <div class="px-4 py-4 flex items-center justify-between">
          <!-- Mobile menu button -->
          <button
            on:click={toggleSidebar}
            class="text-gray-400 hover:text-cyan-400 p-2 rounded-lg hover:bg-cyan-500/10 transition-all duration-200"
            aria-label="Open sidebar"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>

          <!-- Mobile header info -->
          <div class="flex items-center space-x-4">
            {#if activeNavItem}
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-gradient-to-br {activeNavItem.color} rounded-lg flex items-center justify-center shadow-lg {activeNavItem.glowColor}">
                  <span class="text-white text-sm">{activeNavItem.icon}</span>
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-white">{pageTitle}</h2>
                  <div class="text-xs text-gray-400">{pageDescription}</div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Mobile time display -->
          <div class="text-xs font-mono text-gray-400">
            {timeString}
          </div>
        </div>
      </div>

      <!-- Desktop header with futuristic design -->
      <div class="hidden lg:block bg-slate-900/50 backdrop-blur-xl border-b border-cyan-500/10 px-8 py-6 flex-shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-6">
            {#if activeNavItem}
              <div class="flex items-center space-x-4">
                <div class="w-12 h-12 bg-gradient-to-br {activeNavItem.color} rounded-xl flex items-center justify-center shadow-lg {activeNavItem.glowColor}">
                  <span class="text-white text-xl">{activeNavItem.icon}</span>
                </div>
                <div>
                  <h1 class="text-2xl font-bold text-white tracking-wide">{pageTitle}</h1>
                  <div class="text-sm text-gray-400 mt-1">{pageDescription}</div>
                </div>
              </div>
            {/if}
          </div>
          
          <!-- Desktop status indicators -->
          <div class="flex items-center space-x-6">
            <!-- System status -->
            <div class="flex items-center space-x-3 text-sm">
              <div class="flex items-center space-x-2 bg-slate-800/50 rounded-full px-3 py-2 border border-green-500/20">
                <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span class="text-green-400 font-mono">SYSTEM ONLINE</span>
              </div>
              <div class="text-gray-400 font-mono">
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
      </div>

      <!-- Main content with subtle background -->
      <main class="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <slot />
      </main>
    </div>
  </div>
{:else}
  <!-- Not authenticated fallback -->
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      <p class="mt-2 text-gray-400">Redirecting to login...</p>
    </div>
  </div>
{/if}

<style>
  /* Custom scrollbar for sidebar */
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(6, 182, 212, 0.3) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(6, 182, 212, 0.3);
    border-radius: 2px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(6, 182, 212, 0.5);
  }

  /* Animation delays */
  .animation-delay-75 {
    animation-delay: 75ms;
  }

  .animation-delay-100 {
    animation-delay: 100ms;
  }

  .animation-delay-200 {
    animation-delay: 200ms;
  }

  /* Enhanced transitions */
  .transition-all {
    transition-property: all;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 300ms;
  }

  /* Glow effects */
  .shadow-cyan-500\/25 {
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.25);
  }

  .shadow-purple-500\/25 {
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.25);
  }

  .shadow-green-500\/25 {
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.25);
  }

  .shadow-orange-500\/25 {
    box-shadow: 0 0 20px rgba(249, 115, 22, 0.25);
  }

  .shadow-pink-500\/25 {
    box-shadow: 0 0 20px rgba(236, 72, 153, 0.25);
  }

  .shadow-teal-500\/25 {
    box-shadow: 0 0 20px rgba(20, 184, 166, 0.25);
  }

  .shadow-emerald-500\/25 {
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
  }

  .shadow-red-500\/25 {
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.25);
  }

  .shadow-violet-500\/25 {
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.25);
  }

  /* Glass morphism effects */
  .backdrop-blur-xl {
    backdrop-filter: blur(24px);
  }

  /* Hover scale effect */
  .hover\:scale-105:hover {
    transform: scale(1.05);
  }

  /* Gradient text */
  .bg-clip-text {
    -webkit-background-clip: text;
    background-clip: text;
  }

  /* Focus states for accessibility */
  button:focus,
  a:focus {
    outline: 2px solid rgba(6, 182, 212, 0.5);
    outline-offset: 2px;
  }

  /* Custom pulse animation */
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  /* Mobile responsive adjustments */
  @media (max-width: 1024px) {
    .lg\:hidden {
      display: block;
    }
    
    .lg\:block {
      display: none;
    }
  }

  /* Prevent scrolling when sidebar is open on mobile */
  @media (max-width: 1024px) {
    .sidebar-open {
      overflow: hidden;
    }
  }

  /* Enhanced border gradients */
  .border-cyan-500\/20 {
    border-color: rgba(6, 182, 212, 0.2);
  }

  .border-cyan-500\/10 {
    border-color: rgba(6, 182, 212, 0.1);
  }

  /* Background opacity utilities */
  .bg-slate-800\/95 {
    background-color: rgba(30, 41, 59, 0.95);
  }

  .bg-slate-900\/95 {
    background-color: rgba(15, 23, 42, 0.95);
  }

  .bg-slate-800\/50 {
    background-color: rgba(30, 41, 59, 0.5);
  }

  .bg-slate-700\/50 {
    background-color: rgba(51, 65, 85, 0.5);
  }
</style>