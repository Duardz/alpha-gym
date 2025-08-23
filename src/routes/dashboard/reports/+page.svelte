<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
  import type { Member, WalkIn, CashflowEntry, MembershipType } from '$lib/types';

  // State
  let isLoading = true;
  let selectedPeriod = 'month';
  let customDateFrom = '';
  let customDateTo = '';
  let activeTab = 'overview';

  // Data
  let members: Member[] = [];
  let walkIns: WalkIn[] = [];
  let cashflowEntries: CashflowEntry[] = [];

  // Report data
  let reportData = {
    membershipGrowth: [] as any[],
    revenueBreakdown: {} as any,
    expenseBreakdown: {} as any,
    membershipTypeDistribution: {} as any,
    monthlyTrends: [] as any[]
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'financial', label: 'Financial', icon: '💰' },
    { id: 'members', label: 'Membership', icon: '👥' },
    { id: 'trends', label: 'Trends', icon: '📈' }
  ];

  const periods = [
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: '3months', label: 'Last 3 Months' },
    { value: '6months', label: 'Last 6 Months' },
    { value: 'year', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  onMount(() => {
    loadAllData();
    setDefaultDateRange();
  });

  function setDefaultDateRange() {
    const now = new Date();
    customDateTo = now.toISOString().split('T')[0];
    const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
    customDateFrom = oneMonthAgo.toISOString().split('T')[0];
  }

  async function loadAllData() {
    try {
      isLoading = true;
      
      // Load all collections
      const [membersSnapshot, walkInsSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'members'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'walkIns'), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'cashflow'), orderBy('date', 'desc')))
      ]);

      // Process members data
      members = membersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
        } as Member;
      });

      // Process walk-ins data
      walkIns = walkInsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date()
        } as WalkIn;
      });

      // Process cashflow data
      cashflowEntries = cashflowSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as CashflowEntry;
      });

      generateReportData();
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load report data. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  function generateReportData() {
    const dateRange = getDateRange();
    
    // Filter data based on selected period
    const filteredMembers = filterByDateRange(members, dateRange, 'createdAt');
    const filteredWalkIns = filterByDateRange(walkIns, dateRange, 'date');
    const filteredCashflow = filterByDateRange(cashflowEntries, dateRange, 'createdAt');

    // Generate membership type distribution
    reportData.membershipTypeDistribution = members.reduce((acc, member) => {
      acc[member.membershipType] = (acc[member.membershipType] || 0) + 1;
      return acc;
    }, {} as Record<MembershipType, number>);

    // Generate revenue breakdown
    const income = filteredCashflow.filter(entry => entry.type === 'income');
    reportData.revenueBreakdown = income.reduce((acc, entry) => {
      acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
      return acc;
    }, {} as Record<string, number>);

    // Generate expense breakdown
    const expenses = filteredCashflow.filter(entry => entry.type === 'expense');
    reportData.expenseBreakdown = expenses.reduce((acc, entry) => {
      acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
      return acc;
    }, {} as Record<string, number>);

    // Generate monthly trends
    reportData.monthlyTrends = generateMonthlyTrends();
  }

  function getDateRange() {
    const now = new Date();
    let startDate = new Date();

    switch (selectedPeriod) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case '6months':
        startDate.setMonth(now.getMonth() - 6);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'custom':
        return {
          start: new Date(customDateFrom),
          end: new Date(customDateTo)
        };
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    return { start: startDate, end: now };
  }

  function filterByDateRange(data: any[], dateRange: any, dateField: string) {
    return data.filter(item => {
      const itemDate = dateField === 'createdAt' ? item[dateField] : item[dateField];
      return itemDate >= dateRange.start && itemDate <= dateRange.end;
    });
  }

  function generateMonthlyTrends() {
    const trends = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      
      const monthMembers = members.filter(m => 
        m.createdAt >= monthDate && m.createdAt < nextMonthDate
      );
      
      const monthWalkIns = walkIns.filter(w => 
        w.date >= monthDate && w.date < nextMonthDate
      );
      
      const monthIncome = cashflowEntries
        .filter(c => c.type === 'income' && c.createdAt >= monthDate && c.createdAt < nextMonthDate)
        .reduce((sum, c) => sum + c.amount, 0);

      const monthExpenses = cashflowEntries
        .filter(c => c.type === 'expense' && c.createdAt >= monthDate && c.createdAt < nextMonthDate)
        .reduce((sum, c) => sum + c.amount, 0);

      trends.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        newMembers: monthMembers.length,
        walkIns: monthWalkIns.length,
        income: monthIncome,
        expenses: monthExpenses,
        profit: monthIncome - monthExpenses
      });
    }
    
    return trends;
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  function formatPercentage(value: number, total: number): string {
    return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';
  }

  // Reactive updates when period changes
  $: if (selectedPeriod && !isLoading) {
    generateReportData();
  }

  // Summary statistics
  $: summary = {
    totalMembers: members.length,
    activeMembers: members.filter(m => m.status === 'Active').length,
    totalWalkIns: walkIns.length,
    totalIncome: cashflowEntries.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0),
    totalExpenses: cashflowEntries.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0),
    netProfit: 0
  };

  $: summary.netProfit = summary.totalIncome - summary.totalExpenses;
</script>

<svelte:head>
  <title>Reports & Analytics - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Header with Period Selector -->
  <div class="mb-8">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p class="text-gray-600 mt-1">Comprehensive business insights and performance metrics</p>
      </div>
      
      <div class="flex flex-col sm:flex-row gap-3">
        <select
          bind:value={selectedPeriod}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {#each periods as period}
            <option value={period.value}>{period.label}</option>
          {/each}
        </select>
        
        {#if selectedPeriod === 'custom'}
          <div class="flex gap-2">
            <input
              type="date"
              bind:value={customDateFrom}
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span class="flex items-center text-gray-500">to</span>
            <input
              type="date"
              bind:value={customDateTo}
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        {/if}
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8">
        {#each tabs as tab}
          <button
            on:click={() => activeTab = tab.id}
            class="py-2 px-1 border-b-2 font-medium text-sm {
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-colors duration-200"
          >
            <span class="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        {/each}
      </nav>
    </div>
  </div>

  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading report data...</p>
      </div>
    </div>
  {:else}
    <!-- Overview Tab -->
    {#if activeTab === 'overview'}
      <!-- Key Metrics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span class="text-blue-600 text-xl">👥</span>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Total Members</p>
              <p class="text-2xl font-bold text-gray-900">{summary.totalMembers}</p>
              <p class="text-xs text-green-600">{summary.activeMembers} active</p>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span class="text-purple-600 text-xl">🚶</span>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Walk-ins</p>
              <p class="text-2xl font-bold text-gray-900">{summary.totalWalkIns}</p>
              <p class="text-xs text-gray-500">All time</p>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span class="text-green-600 text-xl">💰</span>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Total Revenue</p>
              <p class="text-2xl font-bold text-green-600">{formatCurrency(summary.totalIncome)}</p>
              <p class="text-xs text-gray-500">All time</p>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span class="text-yellow-600 text-xl">📈</span>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Net Profit</p>
              <p class="text-2xl font-bold {summary.netProfit >= 0 ? 'text-yellow-600' : 'text-red-600'}">
                {formatCurrency(summary.netProfit)}
              </p>
              <p class="text-xs text-gray-500">All time</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Business Health Summary -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Business Health</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span class="text-sm font-medium text-blue-800">Member Retention Rate</span>
              <span class="text-lg font-bold text-blue-600">
                {formatPercentage(summary.activeMembers, summary.totalMembers)}
              </span>
            </div>
            <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span class="text-sm font-medium text-green-800">Revenue per Member</span>
              <span class="text-lg font-bold text-green-600">
                {formatCurrency(summary.totalMembers > 0 ? summary.totalIncome / summary.totalMembers : 0)}
              </span>
            </div>
            <div class="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
              <span class="text-sm font-medium text-purple-800">Walk-in Revenue</span>
              <span class="text-lg font-bold text-purple-600">
                {formatCurrency(walkIns.reduce((sum, w) => sum + w.payment, 0))}
              </span>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Membership Distribution</h3>
          <div class="space-y-3">
            {#each Object.entries(reportData.membershipTypeDistribution) as [type, count]}
              <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span class="text-sm font-medium text-gray-800">{type}</span>
                <div class="text-right">
                  <span class="text-lg font-bold text-gray-900">{count}</span>
                  <div class="text-xs text-gray-500">
                    {formatPercentage(Number(count), summary.totalMembers)}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Financial Tab -->
    {#if activeTab === 'financial'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Revenue Breakdown -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Revenue Sources</h3>
          <div class="space-y-3">
            {#each Object.entries(reportData.revenueBreakdown) as [source, amount]}
              <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span class="text-sm font-medium text-green-800">{source}</span>
                <span class="text-lg font-bold text-green-600">{formatCurrency(Number(amount))}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Expense Breakdown -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
          <div class="space-y-3">
            {#each Object.entries(reportData.expenseBreakdown) as [category, amount]}
              <div class="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span class="text-sm font-medium text-red-800">{category}</span>
                <span class="text-lg font-bold text-red-600">{formatCurrency(Number(amount))}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Financial Summary -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="text-center p-6 bg-green-50 rounded-lg">
            <div class="text-3xl font-bold text-green-600">{formatCurrency(summary.totalIncome)}</div>
            <div class="text-sm text-green-800 mt-1">Total Income</div>
          </div>
          <div class="text-center p-6 bg-red-50 rounded-lg">
            <div class="text-3xl font-bold text-red-600">{formatCurrency(summary.totalExpenses)}</div>
            <div class="text-sm text-red-800 mt-1">Total Expenses</div>
          </div>
          <div class="text-center p-6 {summary.netProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg">
            <div class="text-3xl font-bold {summary.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
              {formatCurrency(summary.netProfit)}
            </div>
            <div class="text-sm {summary.netProfit >= 0 ? 'text-blue-800' : 'text-red-800'} mt-1">Net Profit</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Members Tab -->
    {#if activeTab === 'members'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Membership Growth -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Membership Growth</h3>
          <div class="space-y-4">
            {#each reportData.monthlyTrends as trend}
              <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span class="text-sm font-medium text-blue-800">{trend.month}</span>
                <div class="text-right">
                  <div class="text-lg font-bold text-blue-600">+{trend.newMembers}</div>
                  <div class="text-xs text-blue-500">new members</div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Membership Status -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Membership Status</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <div>
                <div class="text-sm font-medium text-green-800">Active Members</div>
                <div class="text-xs text-green-600">Currently enrolled</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-green-600">{summary.activeMembers}</div>
                <div class="text-xs text-green-500">
                  {formatPercentage(summary.activeMembers, summary.totalMembers)}
                </div>
              </div>
            </div>
            
            <div class="flex justify-between items-center p-4 bg-red-50 rounded-lg">
              <div>
                <div class="text-sm font-medium text-red-800">Expired Members</div>
                <div class="text-xs text-red-600">Need renewal</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-red-600">{summary.totalMembers - summary.activeMembers}</div>
                <div class="text-xs text-red-500">
                  {formatPercentage(summary.totalMembers - summary.activeMembers, summary.totalMembers)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Trends Tab -->
    {#if activeTab === 'trends'}
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-6">6-Month Business Trends</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Members</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Walk-ins</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Income</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each reportData.monthlyTrends as trend}
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {trend.month}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">
                    +{trend.newMembers}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-semibold">
                    {trend.walkIns}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                    {formatCurrency(trend.income)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">
                    {formatCurrency(trend.expenses)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold {trend.profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                    {formatCurrency(trend.profit)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>