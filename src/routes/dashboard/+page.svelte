<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
  import type { Member, WalkIn, CashflowEntry, InventoryItem } from '$lib/types';

  interface DashboardStats {
    totalMembers: number;
    activeMembers: number;
    expiredMembers: number;
    expiringSoon: number;
    todayWalkIns: number;
    thisWeekWalkIns: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netProfit: number;
    totalRevenue: number;
    membershipBreakdown: {
      'Day Pass': number;
      'Warrior Pass': number;
      'Gladiator Pass': number;
      'Alpha Elite Pass': number;
    };
    lowStockItems: number;
    outOfStockItems: number;
    recentTransactions: number;
  }

  // State
  let stats: DashboardStats = {
    totalMembers: 0,
    activeMembers: 0,
    expiredMembers: 0,
    expiringSoon: 0,
    todayWalkIns: 0,
    thisWeekWalkIns: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netProfit: 0,
    totalRevenue: 0,
    membershipBreakdown: {
      'Day Pass': 0,
      'Warrior Pass': 0,
      'Gladiator Pass': 0,
      'Alpha Elite Pass': 0
    },
    lowStockItems: 0,
    outOfStockItems: 0,
    recentTransactions: 0
  };

  let isLoading = true;
  let loadingProgress = 0;
  let recentActivity: Array<{
    id: string;
    type: 'member' | 'walk-in' | 'sale' | 'expense';
    description: string;
    amount?: number;
    date: Date;
    icon: string;
  }> = [];

  onMount(async () => {
    await loadDashboardData();
  });

  async function loadDashboardData() {
    try {
      isLoading = true;
      loadingProgress = 0;

      // Load members data
      loadingProgress = 20;
      const membersSnapshot = await getDocs(query(collection(db, 'members'), orderBy('createdAt', 'desc')));
      const members: Member[] = membersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
        } as Member;
      });

      // Load walk-ins data
      loadingProgress = 40;
      const walkInsSnapshot = await getDocs(query(collection(db, 'walkIns'), orderBy('date', 'desc')));
      const walkIns: WalkIn[] = walkInsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date()
        } as WalkIn;
      });

      // Load cashflow data
      loadingProgress = 60;
      const cashflowSnapshot = await getDocs(query(collection(db, 'cashflow'), orderBy('date', 'desc')));
      const cashflowEntries: CashflowEntry[] = cashflowSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as CashflowEntry;
      });

      // Load inventory data
      loadingProgress = 80;
      const inventorySnapshot = await getDocs(query(collection(db, 'inventory')));
      const inventory: InventoryItem[] = inventorySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as InventoryItem;
      });

      // Calculate statistics
      loadingProgress = 90;
      calculateStats(members, walkIns, cashflowEntries, inventory);
      generateRecentActivity(members, walkIns, cashflowEntries);

      loadingProgress = 100;
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      alert('Failed to load dashboard data. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  function calculateStats(
    members: Member[], 
    walkIns: WalkIn[], 
    cashflowEntries: CashflowEntry[], 
    inventory: InventoryItem[]
  ) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Member statistics
    stats.totalMembers = members.length;
    stats.activeMembers = members.filter(m => m.status === 'Active').length;
    stats.expiredMembers = members.filter(m => m.status === 'Expired').length;
    stats.expiringSoon = members.filter(m => {
      const expiryDate = new Date(m.expiryDate);
      return expiryDate > today && expiryDate <= nextWeek;
    }).length;

    // Membership type breakdown
    stats.membershipBreakdown = members.reduce((acc, member) => {
      acc[member.membershipType] = (acc[member.membershipType] || 0) + 1;
      return acc;
    }, {
      'Day Pass': 0,
      'Warrior Pass': 0,
      'Gladiator Pass': 0,
      'Alpha Elite Pass': 0
    });

    // Walk-in statistics
    stats.todayWalkIns = walkIns.filter(w => w.date >= today).length;
    stats.thisWeekWalkIns = walkIns.filter(w => w.date >= weekAgo).length;

    // Financial statistics
    const monthlyIncome = cashflowEntries
      .filter(e => e.type === 'income' && new Date(e.date) >= monthStart)
      .reduce((sum, e) => sum + e.amount, 0);
    
    const monthlyExpenses = cashflowEntries
      .filter(e => e.type === 'expense' && new Date(e.date) >= monthStart)
      .reduce((sum, e) => sum + e.amount, 0);

    stats.monthlyIncome = monthlyIncome;
    stats.monthlyExpenses = monthlyExpenses;
    stats.netProfit = monthlyIncome - monthlyExpenses;
    
    stats.totalRevenue = cashflowEntries
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);

    // Inventory statistics
    stats.lowStockItems = inventory.filter(item => item.stock > 0 && item.stock <= 5).length;
    stats.outOfStockItems = inventory.filter(item => item.stock === 0).length;

    // Recent transactions count (last 7 days)
    stats.recentTransactions = cashflowEntries.filter(e => 
      new Date(e.date) >= weekAgo
    ).length;
  }

  function generateRecentActivity(
    members: Member[], 
    walkIns: WalkIn[], 
    cashflowEntries: CashflowEntry[]
  ) {
    const activities: typeof recentActivity = [];

    // Recent members (last 5)
    members.slice(0, 5).forEach(member => {
      activities.push({
        id: member.id,
        type: 'member',
        description: `New member: ${member.name} (${member.membershipType})`,
        date: member.createdAt,
        icon: getIconForMembershipType(member.membershipType)
      });
    });

    // Recent walk-ins (last 5)
    walkIns.slice(0, 5).forEach(walkIn => {
      activities.push({
        id: walkIn.id,
        type: 'walk-in',
        description: `Walk-in: ${walkIn.name}`,
        amount: walkIn.payment,
        date: walkIn.date,
        icon: '🚶'
      });
    });

    // Recent transactions (last 5)
    cashflowEntries.slice(0, 5).forEach(entry => {
      activities.push({
        id: entry.id,
        type: entry.type === 'income' ? 'sale' : 'expense',
        description: `${entry.type === 'income' ? 'Income' : 'Expense'}: ${entry.source}`,
        amount: entry.amount,
        date: new Date(entry.date),
        icon: entry.type === 'income' ? '💰' : '💸'
      });
    });

    // Sort by date and take most recent 10
    recentActivity = activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10);
  }

  function getIconForMembershipType(type: string): string {
    switch (type) {
      case 'Day Pass': return '🎫';
      case 'Warrior Pass': return '🥉';
      case 'Gladiator Pass': return '🥈';
      case 'Alpha Elite Pass': return '🥇';
      default: return '👥';
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getHealthStatus() {
    const memberRetentionRate = stats.totalMembers > 0 ? (stats.activeMembers / stats.totalMembers) * 100 : 0;
    const profitMargin = stats.monthlyIncome > 0 ? (stats.netProfit / stats.monthlyIncome) * 100 : 0;
    
    let healthScore = 0;
    let healthLabel = '';
    let healthColor = '';
    
    // Calculate health score based on various factors
    if (memberRetentionRate >= 80) healthScore += 30;
    else if (memberRetentionRate >= 60) healthScore += 20;
    else if (memberRetentionRate >= 40) healthScore += 10;
    
    if (profitMargin >= 50) healthScore += 30;
    else if (profitMargin >= 30) healthScore += 20;
    else if (profitMargin >= 10) healthScore += 10;
    
    if (stats.recentTransactions >= 10) healthScore += 20;
    else if (stats.recentTransactions >= 5) healthScore += 15;
    else if (stats.recentTransactions >= 1) healthScore += 10;
    
    if (stats.outOfStockItems === 0) healthScore += 10;
    else if (stats.outOfStockItems <= 2) healthScore += 5;
    
    if (stats.lowStockItems <= 3) healthScore += 10;
    else if (stats.lowStockItems <= 5) healthScore += 5;
    
    if (healthScore >= 80) {
      healthLabel = 'Excellent';
      healthColor = 'text-green-600 bg-green-100';
    } else if (healthScore >= 60) {
      healthLabel = 'Good';
      healthColor = 'text-blue-600 bg-blue-100';
    } else if (healthScore >= 40) {
      healthLabel = 'Fair';
      healthColor = 'text-yellow-600 bg-yellow-100';
    } else {
      healthLabel = 'Needs Attention';
      healthColor = 'text-red-600 bg-red-100';
    }
    
    return { score: healthScore, label: healthLabel, color: healthColor, retention: memberRetentionRate, margin: profitMargin };
  }

  $: businessHealth = getHealthStatus();
</script>

<svelte:head>
  <title>Dashboard - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Loading State -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600 font-medium">Loading dashboard data...</p>
        <div class="w-full bg-gray-200 rounded-full h-2 mt-4 max-w-xs mx-auto">
          <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: {loadingProgress}%"></div>
        </div>
        <p class="text-sm text-gray-500 mt-2">{loadingProgress}% complete</p>
      </div>
    </div>
  {:else}
    <!-- Page Header -->
    <div class="mb-8">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p class="text-gray-600 mt-1">Welcome back! Here's what's happening at Alpha Forge today.</p>
        </div>
        <div class="mt-4 lg:mt-0">
          <div class="inline-flex items-center px-4 py-2 rounded-lg {businessHealth.color}">
            <span class="text-sm font-semibold">Business Health: {businessHealth.label}</span>
            <span class="ml-2 text-xs">({businessHealth.score}/100)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Total Members -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <span class="text-blue-600 text-xl">👥</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Total Members</p>
            <p class="text-2xl font-bold text-gray-900">{stats.totalMembers}</p>
            <p class="text-xs text-blue-600">{stats.activeMembers} active, {stats.expiredMembers} expired</p>
          </div>
        </div>
      </div>

      <!-- Today's Walk-ins -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span class="text-purple-600 text-xl">🚶</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Today's Walk-ins</p>
            <p class="text-2xl font-bold text-gray-900">{stats.todayWalkIns}</p>
            <p class="text-xs text-purple-600">{stats.thisWeekWalkIns} this week</p>
          </div>
        </div>
      </div>

      <!-- Monthly Revenue -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <span class="text-green-600 text-xl">💰</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Monthly Revenue</p>
            <p class="text-2xl font-bold text-green-600">{formatCurrency(stats.monthlyIncome)}</p>
            <p class="text-xs text-gray-500">{formatCurrency(stats.totalRevenue)} total</p>
          </div>
        </div>
      </div>

      <!-- Net Profit -->
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 {stats.netProfit >= 0 ? 'bg-blue-100' : 'bg-red-100'} rounded-full flex items-center justify-center">
              <span class="{stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} text-xl">📈</span>
            </div>
          </div>
          <div class="ml-4 flex-1">
            <p class="text-sm font-medium text-gray-600">Monthly Profit</p>
            <p class="text-2xl font-bold {stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
              {formatCurrency(stats.netProfit)}
            </p>
            <p class="text-xs {stats.netProfit >= 0 ? 'text-blue-500' : 'text-red-500'}">
              {businessHealth.margin.toFixed(1)}% margin
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert Cards -->
    {#if stats.expiringSoon > 0 || stats.outOfStockItems > 0 || stats.lowStockItems > 0}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {#if stats.expiringSoon > 0}
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <span class="text-yellow-600 text-xl">⚠️</span>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-yellow-800">Memberships Expiring Soon</h3>
                <p class="text-sm text-yellow-700 mt-1">
                  {stats.expiringSoon} member{stats.expiringSoon !== 1 ? 's' : ''} expiring in the next 7 days
                </p>
              </div>
            </div>
          </div>
        {/if}

        {#if stats.outOfStockItems > 0}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <span class="text-red-600 text-xl">📦</span>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Out of Stock Items</h3>
                <p class="text-sm text-red-700 mt-1">
                  {stats.outOfStockItems} product{stats.outOfStockItems !== 1 ? 's' : ''} need restocking
                </p>
              </div>
            </div>
          </div>
        {/if}

        {#if stats.lowStockItems > 0}
          <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <span class="text-orange-600 text-xl">📉</span>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-orange-800">Low Stock Items</h3>
                <p class="text-sm text-orange-700 mt-1">
                  {stats.lowStockItems} product{stats.lowStockItems !== 1 ? 's' : ''} running low
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Financial Summary -->
      <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-6">Monthly Financial Summary</h3>
        <div class="space-y-4">
          <div class="flex justify-between items-center p-4 bg-green-50 rounded-lg">
            <div class="flex items-center">
              <span class="text-green-600 text-lg mr-3">💰</span>
              <span class="text-sm font-medium text-green-800">Total Income</span>
            </div>
            <span class="text-lg font-bold text-green-600">{formatCurrency(stats.monthlyIncome)}</span>
          </div>
          <div class="flex justify-between items-center p-4 bg-red-50 rounded-lg">
            <div class="flex items-center">
              <span class="text-red-600 text-lg mr-3">💸</span>
              <span class="text-sm font-medium text-red-800">Total Expenses</span>
            </div>
            <span class="text-lg font-bold text-red-600">{formatCurrency(stats.monthlyExpenses)}</span>
          </div>
          <div class="border-t pt-4">
            <div class="flex justify-between items-center p-4 {stats.netProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg">
              <div class="flex items-center">
                <span class="{stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} text-lg mr-3">📊</span>
                <span class="text-sm font-medium {stats.netProfit >= 0 ? 'text-blue-800' : 'text-red-800'}">Net Profit</span>
              </div>
              <span class="text-xl font-bold {stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
                {formatCurrency(stats.netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Membership Breakdown -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-6">Membership Types</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
            <span class="text-sm font-medium text-yellow-800">🥇 Alpha Elite Pass</span>
            <span class="text-lg font-bold text-yellow-600">{stats.membershipBreakdown['Alpha Elite Pass']}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
            <span class="text-sm font-medium text-purple-800">🥈 Gladiator Pass</span>
            <span class="text-lg font-bold text-purple-600">{stats.membershipBreakdown['Gladiator Pass']}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
            <span class="text-sm font-medium text-orange-800">🥉 Warrior Pass</span>
            <span class="text-lg font-bold text-orange-600">{stats.membershipBreakdown['Warrior Pass']}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span class="text-sm font-medium text-gray-800">🎫 Day Pass</span>
            <span class="text-lg font-bold text-gray-600">{stats.membershipBreakdown['Day Pass']}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h3>
      {#if recentActivity.length === 0}
        <div class="text-center py-8">
          <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span class="text-gray-400 text-lg">📝</span>
          </div>
          <p class="text-gray-500">No recent activity</p>
        </div>
      {:else}
        <div class="flow-root">
          <ul class="-mb-8">
            {#each recentActivity as activity, index}
              <li>
                <div class="relative pb-8">
                  {#if index !== recentActivity.length - 1}
                    <span class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                  {/if}
                  <div class="relative flex space-x-3">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white">
                      <span class="text-sm">{activity.icon}</span>
                    </div>
                    <div class="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p class="text-sm text-gray-900">{activity.description}</p>
                        {#if activity.amount}
                          <p class="text-sm font-semibold {activity.type === 'expense' ? 'text-red-600' : 'text-green-600'}">
                            {formatCurrency(activity.amount)}
                          </p>
                        {/if}
                      </div>
                      <div class="whitespace-nowrap text-right text-sm text-gray-500">
                        {formatDate(activity.date)}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>