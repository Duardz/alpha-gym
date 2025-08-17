<script lang="ts">
  import { onMount } from 'svelte';
  
  // Dummy data for now - will be replaced with Firebase data
  let stats = {
    totalMembers: 0,
    activeMembers: 0,
    todayWalkIns: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netProfit: 0,
    membershipBreakdown: {
      warrior: 0,
      gladiator: 0,
      alphaElite: 0
    }
  };

  let isLoading = true;

  onMount(async () => {
    // Simulate loading - replace with actual Firebase calls
    setTimeout(() => {
      stats = {
        totalMembers: 45,
        activeMembers: 42,
        todayWalkIns: 8,
        monthlyIncome: 85000,
        monthlyExpenses: 32000,
        netProfit: 53000,
        membershipBreakdown: {
          warrior: 28,
          gladiator: 12,
          alphaElite: 5
        }
      };
      isLoading = false;
    }, 1000);
  });

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }
</script>

<svelte:head>
  <title>Dashboard - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
    <p class="text-gray-600 mt-1">Welcome back! Here's what's happening at Alpha Forge today.</p>
  </div>

  {#if isLoading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {#each Array(4) as _}
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div class="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Total Members -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span class="text-blue-600 text-lg">👥</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Total Members</p>
            <p class="text-2xl font-bold text-gray-900">{stats.totalMembers}</p>
          </div>
        </div>
      </div>

      <!-- Active Members -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <span class="text-green-600 text-lg">✅</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Active Members</p>
            <p class="text-2xl font-bold text-gray-900">{stats.activeMembers}</p>
          </div>
        </div>
      </div>

      <!-- Today's Walk-ins -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <span class="text-purple-600 text-lg">🚶</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Today's Walk-ins</p>
            <p class="text-2xl font-bold text-gray-900">{stats.todayWalkIns}</p>
          </div>
        </div>
      </div>

      <!-- Monthly Net Profit -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <span class="text-yellow-600 text-lg">💰</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Net Profit</p>
            <p class="text-2xl font-bold text-gray-900">{formatCurrency(stats.netProfit)}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Financial Summary Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Monthly Income vs Expenses -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Monthly Financial Summary</h3>
        <div class="space-y-4">
          <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
            <span class="text-sm font-medium text-green-800">Total Income</span>
            <span class="text-lg font-bold text-green-600">{formatCurrency(stats.monthlyIncome)}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-red-50 rounded-lg">
            <span class="text-sm font-medium text-red-800">Total Expenses</span>
            <span class="text-lg font-bold text-red-600">{formatCurrency(stats.monthlyExpenses)}</span>
          </div>
          <div class="border-t pt-3">
            <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span class="text-sm font-medium text-blue-800">Net Profit</span>
              <span class="text-xl font-bold text-blue-600">{formatCurrency(stats.netProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Membership Breakdown -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Membership Breakdown</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
            <span class="text-sm font-medium text-orange-800">🥉 Warrior Pass</span>
            <span class="text-lg font-bold text-orange-600">{stats.membershipBreakdown.warrior}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span class="text-sm font-medium text-gray-800">🥈 Gladiator Pass</span>
            <span class="text-lg font-bold text-gray-600">{stats.membershipBreakdown.gladiator}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
            <span class="text-sm font-medium text-yellow-800">🥇 Alpha Elite Pass</span>
            <span class="text-lg font-bold text-yellow-600">{stats.membershipBreakdown.alphaElite}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <a 
          href="/members" 
          class="flex flex-col items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-200"
        >
          <span class="text-2xl mb-2">👥</span>
          <span class="text-sm font-medium text-blue-800">Add New Member</span>
        </a>
        <a 
          href="/walk-ins" 
          class="flex flex-col items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors duration-200"
        >
          <span class="text-2xl mb-2">🚶</span>
          <span class="text-sm font-medium text-purple-800">Record Walk-in</span>
        </a>
        <a 
          href="/inventory" 
          class="flex flex-col items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors duration-200"
        >
          <span class="text-2xl mb-2">📦</span>
          <span class="text-sm font-medium text-green-800">Update Inventory</span>
        </a>
        <a 
          href="/expenses" 
          class="flex flex-col items-center p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors duration-200"
        >
          <span class="text-2xl mb-2">💸</span>
          <span class="text-sm font-medium text-red-800">Add Expense</span>
        </a>
      </div>
    </div>
  {/if}
</div>