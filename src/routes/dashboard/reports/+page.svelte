<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, query, orderBy } from 'firebase/firestore';
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
    period: '',
    dateRange: { start: new Date(), end: new Date() }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊', description: 'Key metrics & summary' },
    { id: 'revenue', label: 'Revenue', icon: '💰', description: 'Income analysis' },
    { id: 'members', label: 'Membership', icon: '👥', description: 'Member insights' },
    { id: 'trends', label: 'Trends', icon: '📈', description: 'Historical data' }
  ];

  const periods = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: '3months', label: 'Last 3 Months' },
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
      
      // Load all data concurrently
      const [membersSnapshot, walkInsSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'members'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'walkIns'), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'cashflow'), orderBy('date', 'desc')))
      ]);

      // Process members
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

      // Process walk-ins
      walkIns = walkInsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date()
        } as WalkIn;
      });

      // Process cashflow - fix date type conversion
      cashflowEntries = cashflowSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert string date to Date if needed
          date: typeof data.date === 'string' ? data.date : data.date?.toDate?.() || new Date().toISOString().split('T')[0],
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
    reportData.dateRange = dateRange;
    reportData.period = getPeriodLabel();
  }

  function getDateRange() {
    const now = new Date();
    let start = new Date();

    switch (selectedPeriod) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        start.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        break;
      case 'custom':
        return {
          start: new Date(customDateFrom),
          end: new Date(customDateTo)
        };
      default:
        start.setMonth(now.getMonth() - 1);
    }

    return { start, end: now };
  }

  function getPeriodLabel() {
    const period = periods.find(p => p.value === selectedPeriod);
    return period ? period.label : 'Custom Range';
  }

  // Fixed filter function with proper typing
  function filterMembersByDateRange(data: Member[], dateRange: { start: Date; end: Date }): Member[] {
    return data.filter(item => {
      const itemDate = item.createdAt;
      if (!itemDate) return false;
      return itemDate >= dateRange.start && itemDate <= dateRange.end;
    });
  }

  function filterWalkInsByDateRange(data: WalkIn[], dateRange: { start: Date; end: Date }): WalkIn[] {
    return data.filter(item => {
      const itemDate = item.date;
      if (!itemDate) return false;
      return itemDate >= dateRange.start && itemDate <= dateRange.end;
    });
  }

  function filterCashflowByDateRange(data: CashflowEntry[], dateRange: { start: Date; end: Date }): CashflowEntry[] {
    return data.filter(item => {
      const itemDate = item.createdAt;
      if (!itemDate) return false;
      return itemDate >= dateRange.start && itemDate <= dateRange.end;
    });
  }

  // Utility functions
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function formatPercentage(value: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  }

  function getGrowthColor(current: number, previous: number): string {
    if (current > previous) return 'text-green-600';
    if (current < previous) return 'text-red-600';
    return 'text-gray-600';
  }

  function getGrowthIcon(current: number, previous: number): string {
    if (current > previous) return '📈';
    if (current < previous) return '📉';
    return '➡️';
  }

  // Reactive calculations
  $: dateRange = getDateRange();
  
  $: filteredMembers = filterMembersByDateRange(members, dateRange);
  $: filteredWalkIns = filterWalkInsByDateRange(walkIns, dateRange);
  $: filteredCashflow = filterCashflowByDateRange(cashflowEntries, dateRange);

  // Fixed currentStats with all required properties
  $: currentStats = (() => {
    const stats = {
      // Member stats
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === 'Active').length,
      newMembers: filteredMembers.length,
      
      // Walk-in stats
      totalWalkIns: walkIns.length,
      periodWalkIns: filteredWalkIns.length,
      walkInRevenue: filteredWalkIns.reduce((sum, w) => sum + w.payment, 0),
      
      // Financial stats
      totalRevenue: cashflowEntries.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0),
      periodRevenue: filteredCashflow.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0),
      periodExpenses: filteredCashflow.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0),
      
      // Membership breakdown
      membershipBreakdown: members.reduce((acc, member) => {
        acc[member.membershipType] = (acc[member.membershipType] || 0) + 1;
        return acc;
      }, {} as Record<MembershipType, number>),
      
      // Revenue by source
      revenueBySource: filteredCashflow
        .filter(c => c.type === 'income')
        .reduce((acc, entry) => {
          acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
          return acc;
        }, {} as Record<string, number>),
      
      // Expenses by category
      expensesByCategory: filteredCashflow
        .filter(c => c.type === 'expense')
        .reduce((acc, entry) => {
          acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
          return acc;
        }, {} as Record<string, number>)
    };

    // Add computed properties
    const netProfit = stats.periodRevenue - stats.periodExpenses;
    const retentionRate = stats.totalMembers > 0 ? 
      (stats.activeMembers / stats.totalMembers) * 100 : 0;

    return {
      ...stats,
      netProfit,
      retentionRate
    };
  })();

  // Previous period comparison (for growth indicators)
  $: previousPeriodRange = (() => {
    const diff = dateRange.end.getTime() - dateRange.start.getTime();
    return {
      start: new Date(dateRange.start.getTime() - diff),
      end: dateRange.start
    };
  })();

  $: previousStats = {
    members: filterMembersByDateRange(members, previousPeriodRange).length,
    walkIns: filterWalkInsByDateRange(walkIns, previousPeriodRange).length,
    revenue: filterCashflowByDateRange(cashflowEntries, previousPeriodRange)
      .filter(c => c.type === 'income')
      .reduce((sum, c) => sum + c.amount, 0)
  };

  // Monthly trends for the last 6 months
  $: monthlyTrends = (() => {
    const trends = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthMembers = members.filter(m => 
        m.createdAt >= monthStart && m.createdAt <= monthEnd
      );
      
      const monthWalkIns = walkIns.filter(w => 
        w.date >= monthStart && w.date <= monthEnd
      );
      
      const monthCashflow = cashflowEntries.filter(c => 
        c.createdAt >= monthStart && c.createdAt <= monthEnd
      );
      
      const income = monthCashflow.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0);
      const expenses = monthCashflow.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0);

      trends.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        newMembers: monthMembers.length,
        walkIns: monthWalkIns.length,
        revenue: income,
        expenses: expenses,
        profit: income - expenses
      });
    }
    
    return trends;
  })();

  // Export functionality
  function exportReport() {
    const data = {
      reportDate: new Date().toISOString(),
      period: reportData.period,
      dateRange: {
        from: formatDate(dateRange.start),
        to: formatDate(dateRange.end)
      },
      summary: {
        totalMembers: currentStats.totalMembers,
        activeMembers: currentStats.activeMembers,
        newMembersInPeriod: currentStats.newMembers,
        walkInsInPeriod: currentStats.periodWalkIns,
        revenueInPeriod: currentStats.periodRevenue,
        expensesInPeriod: currentStats.periodExpenses,
        netProfitInPeriod: currentStats.netProfit
      },
      membershipBreakdown: currentStats.membershipBreakdown,
      revenueBySource: currentStats.revenueBySource,
      expensesByCategory: currentStats.expensesByCategory,
      monthlyTrends: monthlyTrends
    };

    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alpha-forge-report-${selectedPeriod}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Reactive updates when period changes
  $: if (selectedPeriod && !isLoading) {
    generateReportData();
  }
</script>

<svelte:head>
  <title>Business Reports - Alpha Forge</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4 lg:p-6">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900">📊 Business Reports</h1>
        <p class="text-gray-600 mt-1">Track your gym's performance and growth</p>
      </div>
      
      <!-- Period Selector & Export -->
      <div class="flex flex-col sm:flex-row gap-3">
        <select
          bind:value={selectedPeriod}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          {#each periods as period}
            <option value={period.value}>{period.label}</option>
          {/each}
        </select>
        
        {#if selectedPeriod === 'custom'}
          <div class="flex gap-2 items-center">
            <input
              type="date"
              bind:value={customDateFrom}
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span class="text-gray-500 text-sm">to</span>
            <input
              type="date"
              bind:value={customDateTo}
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        {/if}
        
        <button
          on:click={exportReport}
          disabled={isLoading}
          class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200 inline-flex items-center gap-2"
        >
          <span>📋</span> Export
        </button>
      </div>
    </div>

    <!-- Period Info -->
    <div class="mt-4 inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
      <span class="mr-2">📅</span>
      Report Period: {reportData.period}
      {#if selectedPeriod === 'custom'}
        ({formatDate(dateRange.start)} - {formatDate(dateRange.end)})
      {/if}
    </div>
  </div>

  {#if isLoading}
    <!-- Loading State -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600 font-medium">Loading business reports...</p>
      </div>
    </div>
  {:else}
    <!-- Tab Navigation -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div class="border-b border-gray-200">
        <nav class="flex overflow-x-auto">
          {#each tabs as tab}
            <button
              on:click={() => activeTab = tab.id}
              class="flex-shrink-0 px-4 lg:px-6 py-4 text-sm font-medium border-b-2 transition-colors duration-200 {
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }"
            >
              <span class="mr-2">{tab.icon}</span>
              <div class="text-left">
                <div>{tab.label}</div>
                <div class="text-xs opacity-75">{tab.description}</div>
              </div>
            </button>
          {/each}
        </nav>
      </div>
    </div>

    <!-- Overview Tab -->
    {#if activeTab === 'overview'}
      <!-- Key Metrics -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Members -->
        <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs lg:text-sm font-medium text-gray-600">Total Members</p>
              <p class="text-xl lg:text-2xl font-bold text-gray-900">{formatNumber(currentStats.totalMembers)}</p>
              <p class="text-xs text-green-600">{formatNumber(currentStats.activeMembers)} active</p>
            </div>
            <div class="w-8 lg:w-10 h-8 lg:h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span class="text-blue-600 text-lg">👥</span>
            </div>
          </div>
        </div>

        <!-- Period Revenue -->
        <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs lg:text-sm font-medium text-gray-600">Revenue</p>
              <p class="text-xl lg:text-2xl font-bold text-green-600">{formatCurrency(currentStats.periodRevenue)}</p>
              <div class="flex items-center text-xs {getGrowthColor(currentStats.periodRevenue, previousStats.revenue)}">
                <span class="mr-1">{getGrowthIcon(currentStats.periodRevenue, previousStats.revenue)}</span>
                vs prev period
              </div>
            </div>
            <div class="w-8 lg:w-10 h-8 lg:h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span class="text-green-600 text-lg">💰</span>
            </div>
          </div>
        </div>

        <!-- Walk-ins -->
        <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs lg:text-sm font-medium text-gray-600">Walk-ins</p>
              <p class="text-xl lg:text-2xl font-bold text-purple-600">{formatNumber(currentStats.periodWalkIns)}</p>
              <div class="flex items-center text-xs {getGrowthColor(currentStats.periodWalkIns, previousStats.walkIns)}">
                <span class="mr-1">{getGrowthIcon(currentStats.periodWalkIns, previousStats.walkIns)}</span>
                vs prev period
              </div>
            </div>
            <div class="w-8 lg:w-10 h-8 lg:h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span class="text-purple-600 text-lg">🚶</span>
            </div>
          </div>
        </div>

        <!-- Net Profit -->
        <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs lg:text-sm font-medium text-gray-600">Net Profit</p>
              <p class="text-xl lg:text-2xl font-bold {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
                {formatCurrency(currentStats.netProfit)}
              </p>
              <p class="text-xs {currentStats.netProfit >= 0 ? 'text-blue-500' : 'text-red-500'}">
                {formatPercentage(Math.abs(currentStats.netProfit), currentStats.periodRevenue || 1)} margin
              </p>
            </div>
            <div class="w-8 lg:w-10 h-8 lg:h-10 {currentStats.netProfit >= 0 ? 'bg-blue-100' : 'bg-red-100'} rounded-lg flex items-center justify-center">
              <span class="{currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} text-lg">
                {currentStats.netProfit >= 0 ? '📈' : '📉'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Business Health & Quick Insights -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Business Health -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">💪</span> Business Health
          </h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span class="text-sm font-medium text-blue-800">Member Retention</span>
              <span class="text-lg font-bold text-blue-600">
                {Math.round(currentStats.retentionRate)}%
              </span>
            </div>
            <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span class="text-sm font-medium text-green-800">Revenue per Member</span>
              <span class="text-lg font-bold text-green-600">
                {formatCurrency(currentStats.totalMembers > 0 ? currentStats.totalRevenue / currentStats.totalMembers : 0)}
              </span>
            </div>
            <div class="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
              <span class="text-sm font-medium text-purple-800">Walk-in Revenue</span>
              <span class="text-lg font-bold text-purple-600">
                {formatCurrency(currentStats.walkInRevenue)}
              </span>
            </div>
          </div>
        </div>

        <!-- Quick Insights -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">💡</span> Quick Insights
          </h3>
          <div class="space-y-4 text-sm">
            {#if currentStats.newMembers > 0}
              <div class="flex items-center p-3 bg-green-50 rounded-lg">
                <span class="text-green-600 text-lg mr-3">✅</span>
                <span class="text-green-800">
                  <strong>{currentStats.newMembers}</strong> new members joined this period
                </span>
              </div>
            {/if}
            
            {#if currentStats.retentionRate >= 80}
              <div class="flex items-center p-3 bg-blue-50 rounded-lg">
                <span class="text-blue-600 text-lg mr-3">🎯</span>
                <span class="text-blue-800">Great retention rate! Most members are staying active</span>
              </div>
            {:else if currentStats.retentionRate < 60}
              <div class="flex items-center p-3 bg-yellow-50 rounded-lg">
                <span class="text-yellow-600 text-lg mr-3">⚠️</span>
                <span class="text-yellow-800">Consider member engagement programs to improve retention</span>
              </div>
            {/if}
            
            {#if currentStats.netProfit > 0}
              <div class="flex items-center p-3 bg-green-50 rounded-lg">
                <span class="text-green-600 text-lg mr-3">💚</span>
                <span class="text-green-800">Business is profitable this period</span>
              </div>
            {:else}
              <div class="flex items-center p-3 bg-red-50 rounded-lg">
                <span class="text-red-600 text-lg mr-3">📊</span>
                <span class="text-red-800">Focus on increasing revenue or reducing costs</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Revenue Tab -->
    {#if activeTab === 'revenue'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Revenue Sources -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">💰</span> Revenue Sources
          </h3>
          {#if Object.keys(currentStats.revenueBySource).length > 0}
            <div class="space-y-3">
              {#each Object.entries(currentStats.revenueBySource).sort(([,a], [,b]) => Number(b) - Number(a)) as [source, amount]}
                <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <div class="flex items-center">
                    <span class="text-green-600 text-lg mr-2">
                      {source.includes('Pass') ? '🎫' : source === 'Product Sale' ? '🛒' : '💵'}
                    </span>
                    <span class="text-sm font-medium text-green-800">{source}</span>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-green-600">{formatCurrency(Number(amount))}</div>
                    <div class="text-xs text-green-500">
                      {formatPercentage(Number(amount), currentStats.periodRevenue)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8 text-gray-500">
              <span class="text-2xl mb-2 block">📊</span>
              No revenue data for this period
            </div>
          {/if}
        </div>

        <!-- Expense Breakdown -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">💸</span> Expenses
          </h3>
          {#if Object.keys(currentStats.expensesByCategory).length > 0}
            <div class="space-y-3">
              {#each Object.entries(currentStats.expensesByCategory).sort(([,a], [,b]) => Number(b) - Number(a)) as [category, amount]}
                <div class="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <div class="flex items-center">
                    <span class="text-red-600 text-lg mr-2">
                      {category === 'Rent' ? '🏢' : 
                       category === 'Utilities' ? '⚡' : 
                       category === 'Salaries' ? '👥' : 
                       category === 'Equipment' ? '🏋️' : '📝'}
                    </span>
                    <span class="text-sm font-medium text-red-800">{category}</span>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-red-600">{formatCurrency(Number(amount))}</div>
                    <div class="text-xs text-red-500">
                      {formatPercentage(Number(amount), currentStats.periodExpenses)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8 text-gray-500">
              <span class="text-2xl mb-2 block">📊</span>
              No expense data for this period
            </div>
          {/if}
        </div>
      </div>

      <!-- Financial Summary -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span class="mr-2">📋</span> Financial Summary - {reportData.period}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="text-center p-6 bg-green-50 rounded-lg">
            <div class="text-3xl font-bold text-green-600 mb-2">{formatCurrency(currentStats.periodRevenue)}</div>
            <div class="text-sm text-green-800">Total Income</div>
            <div class="text-xs text-green-600 mt-1">
              {currentStats.periodRevenue > previousStats.revenue ? '+' : ''}
              {formatCurrency(currentStats.periodRevenue - previousStats.revenue)} vs previous
            </div>
          </div>
          <div class="text-center p-6 bg-red-50 rounded-lg">
            <div class="text-3xl font-bold text-red-600 mb-2">{formatCurrency(currentStats.periodExpenses)}</div>
            <div class="text-sm text-red-800">Total Expenses</div>
            <div class="text-xs text-red-600 mt-1">
              {formatPercentage(currentStats.periodExpenses, currentStats.periodRevenue)} of revenue
            </div>
          </div>
          <div class="text-center p-6 {currentStats.netProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg">
            <div class="text-3xl font-bold {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mb-2">
              {formatCurrency(currentStats.netProfit)}
            </div>
            <div class="text-sm {currentStats.netProfit >= 0 ? 'text-blue-800' : 'text-red-800'}">Net Profit</div>
            <div class="text-xs {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mt-1">
              {formatPercentage(Math.abs(currentStats.netProfit), currentStats.periodRevenue || 1)} margin
            </div>
          </div>
        </div>

        <!-- Profit Analysis -->
        {#if currentStats.periodRevenue > 0}
          <div class="mt-6 pt-6 border-t border-gray-200">
            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="font-medium text-gray-800 mb-2">💡 Financial Insights</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Revenue Growth:</strong>
                  <span class="{getGrowthColor(currentStats.periodRevenue, previousStats.revenue)}">
                    {currentStats.periodRevenue > previousStats.revenue ? '+' : ''}
                    {formatPercentage(currentStats.periodRevenue - previousStats.revenue, previousStats.revenue || 1)}
                  </span>
                </div>
                <div>
                  <strong>Best Revenue Source:</strong>
                  {#if Object.keys(currentStats.revenueBySource).length > 0}
                    {Object.entries(currentStats.revenueBySource).sort(([,a], [,b]) => Number(b) - Number(a))[0][0]}
                  {:else}
                    N/A
                  {/if}
                </div>
                <div>
                  <strong>Operating Efficiency:</strong>
                  <span class="{currentStats.periodExpenses < currentStats.periodRevenue * 0.7 ? 'text-green-600' : 'text-yellow-600'}">
                    {currentStats.periodExpenses < currentStats.periodRevenue * 0.7 ? 'Good' : 'Monitor closely'}
                  </span>
                </div>
                <div>
                  <strong>Break-even Point:</strong>
                  {formatCurrency(currentStats.periodExpenses)}
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Members Tab -->
    {#if activeTab === 'members'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Membership Types -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">🏷️</span> Membership Types
          </h3>
          {#if Object.keys(currentStats.membershipBreakdown).length > 0}
            <div class="space-y-3">
              {#each Object.entries(currentStats.membershipBreakdown).sort(([,a], [,b]) => Number(b) - Number(a)) as [type, count]}
                <div class="flex justify-between items-center p-3 rounded-lg {
                  type === 'Alpha Elite Pass' ? 'bg-yellow-50' :
                  type === 'Gladiator Pass' ? 'bg-purple-50' :
                  type === 'Warrior Pass' ? 'bg-orange-50' : 'bg-gray-50'
                }">
                  <div class="flex items-center">
                    <span class="text-lg mr-3">
                      {type === 'Alpha Elite Pass' ? '🥇' :
                       type === 'Gladiator Pass' ? '🥈' :
                       type === 'Warrior Pass' ? '🥉' : '🎫'}
                    </span>
                    <span class="text-sm font-medium {
                      type === 'Alpha Elite Pass' ? 'text-yellow-800' :
                      type === 'Gladiator Pass' ? 'text-purple-800' :
                      type === 'Warrior Pass' ? 'text-orange-800' : 'text-gray-800'
                    }">{type}</span>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold {
                      type === 'Alpha Elite Pass' ? 'text-yellow-600' :
                      type === 'Gladiator Pass' ? 'text-purple-600' :
                      type === 'Warrior Pass' ? 'text-orange-600' : 'text-gray-600'
                    }">{count}</div>
                    <div class="text-xs opacity-75">
                      {formatPercentage(Number(count), currentStats.totalMembers)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-8 text-gray-500">
              <span class="text-2xl mb-2 block">👥</span>
              No membership data available
            </div>
          {/if}
        </div>

        <!-- Member Status & Growth -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="mr-2">📊</span> Member Analytics
          </h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <div>
                <div class="text-sm font-medium text-green-800">Active Members</div>
                <div class="text-xs text-green-600">Currently enrolled</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-green-600">{currentStats.activeMembers}</div>
                <div class="text-xs text-green-500">
                  {formatPercentage(currentStats.activeMembers, currentStats.totalMembers)}
                </div>
              </div>
            </div>
            
            <div class="flex justify-between items-center p-4 bg-red-50 rounded-lg">
              <div>
                <div class="text-sm font-medium text-red-800">Expired Members</div>
                <div class="text-xs text-red-600">Need renewal</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-red-600">{currentStats.totalMembers - currentStats.activeMembers}</div>
                <div class="text-xs text-red-500">
                  {formatPercentage(currentStats.totalMembers - currentStats.activeMembers, currentStats.totalMembers)}
                </div>
              </div>
            </div>

            <div class="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <div>
                <div class="text-sm font-medium text-blue-800">New This Period</div>
                <div class="text-xs text-blue-600">Fresh signups</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-blue-600">{currentStats.newMembers}</div>
                <div class="text-xs {getGrowthColor(currentStats.newMembers, previousStats.members)}">
                  {getGrowthIcon(currentStats.newMembers, previousStats.members)} vs previous
                </div>
              </div>
            </div>
          </div>

          <!-- Member Insights -->
          <div class="mt-6 pt-4 border-t border-gray-200">
            <div class="bg-blue-50 rounded-lg p-4">
              <h4 class="font-medium text-blue-800 mb-2">👥 Member Insights</h4>
              <div class="text-sm text-blue-700 space-y-1">
                <div><strong>Retention Rate:</strong> {Math.round(currentStats.retentionRate)}%</div>
                <div><strong>Most Popular:</strong> 
                  {#if Object.keys(currentStats.membershipBreakdown).length > 0}
                    {Object.entries(currentStats.membershipBreakdown).sort(([,a], [,b]) => Number(b) - Number(a))[0][0]}
                  {:else}
                    N/A
                  {/if}
                </div>
                <div><strong>Growth Rate:</strong> 
                  <span class="{getGrowthColor(currentStats.newMembers, previousStats.members)}">
                    {previousStats.members > 0 ? formatPercentage(currentStats.newMembers - previousStats.members, previousStats.members) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Member Recommendations -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span class="mr-2">💡</span> Member Growth Recommendations
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#if currentStats.retentionRate < 70}
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div class="text-yellow-600 text-lg mb-2">⚠️</div>
              <h4 class="font-medium text-yellow-800 mb-1">Improve Retention</h4>
              <p class="text-sm text-yellow-700">Consider member surveys, loyalty programs, or class improvements</p>
            </div>
          {/if}
          
          {#if currentStats.newMembers < previousStats.members}
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="text-blue-600 text-lg mb-2">📈</div>
              <h4 class="font-medium text-blue-800 mb-1">Boost Acquisition</h4>
              <p class="text-sm text-blue-700">Try referral programs, social media campaigns, or free trial offers</p>
            </div>
          {/if}

          {#if Object.values(currentStats.membershipBreakdown).some(count => Number(count) > currentStats.totalMembers * 0.6)}
            <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div class="text-purple-600 text-lg mb-2">🎯</div>
              <h4 class="font-medium text-purple-800 mb-1">Diversify Plans</h4>
              <p class="text-sm text-purple-700">Promote underused membership tiers or create new options</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Trends Tab -->
    {#if activeTab === 'trends'}
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span class="mr-2">📈</span> 6-Month Business Trends
        </h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Members</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Walk-ins</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each monthlyTrends as trend, index}
                <tr class="hover:bg-gray-50 transition-colors duration-150">
                  <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {trend.month}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold text-blue-600">+{trend.newMembers}</div>
                    {#if index > 0}
                      <!-- Fixed: move @const inside the if block -->
                      {#if monthlyTrends[index - 1]}
                        {@const prevTrend = monthlyTrends[index - 1]}
                        <div class="text-xs {getGrowthColor(trend.newMembers, prevTrend.newMembers)}">
                          {getGrowthIcon(trend.newMembers, prevTrend.newMembers)}
                          {trend.newMembers - prevTrend.newMembers}
                        </div>
                      {/if}
                    {/if}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold text-purple-600">{trend.walkIns}</div>
                    {#if index > 0}
                      {#if monthlyTrends[index - 1]}
                        {@const prevTrend = monthlyTrends[index - 1]}
                        <div class="text-xs {getGrowthColor(trend.walkIns, prevTrend.walkIns)}">
                          {getGrowthIcon(trend.walkIns, prevTrend.walkIns)}
                          {trend.walkIns - prevTrend.walkIns}
                        </div>
                      {/if}
                    {/if}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold text-green-600">{formatCurrency(trend.revenue)}</div>
                    {#if index > 0}
                      {#if monthlyTrends[index - 1]}
                        {@const prevTrend = monthlyTrends[index - 1]}
                        <div class="text-xs {getGrowthColor(trend.revenue, prevTrend.revenue)}">
                          {getGrowthIcon(trend.revenue, prevTrend.revenue)}
                          {formatPercentage(trend.revenue - prevTrend.revenue, prevTrend.revenue || 1)}
                        </div>
                      {/if}
                    {/if}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold text-red-600">{formatCurrency(trend.expenses)}</div>
                    {#if index > 0}
                      {#if monthlyTrends[index - 1]}
                        {@const prevTrend = monthlyTrends[index - 1]}
                        <div class="text-xs {getGrowthColor(prevTrend.expenses, trend.expenses)}">
                          {getGrowthIcon(prevTrend.expenses, trend.expenses)}
                          {formatPercentage(trend.expenses - prevTrend.expenses, prevTrend.expenses || 1)}
                        </div>
                      {/if}
                    {/if}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold {trend.profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                      {formatCurrency(trend.profit)}
                    </div>
                    {#if index > 0}
                      {#if monthlyTrends[index - 1]}
                        {@const prevTrend = monthlyTrends[index - 1]}
                        <div class="text-xs {getGrowthColor(trend.profit, prevTrend.profit)}">
                          {getGrowthIcon(trend.profit, prevTrend.profit)}
                          {formatCurrency(trend.profit - prevTrend.profit)}
                        </div>
                      {/if}
                    {/if}
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    {#if trend.revenue > 0}
                      {@const profitMargin = (trend.profit / trend.revenue) * 100}
                      <div class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {
                        profitMargin >= 30 ? 'bg-green-100 text-green-800' :
                        profitMargin >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                      }">
                        {profitMargin >= 30 ? '🟢' : profitMargin >= 10 ? '🟡' : '🔴'}
                        {Math.round(profitMargin)}%
                      </div>
                    {:else}
                      <div class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        ➖ 0%
                      </div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Trend Summary -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">
                {monthlyTrends.reduce((sum, trend) => sum + trend.newMembers, 0)}
              </div>
              <div class="text-sm text-gray-600">Total New Members (6 months)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">
                {formatCurrency(monthlyTrends.reduce((sum, trend) => sum + trend.revenue, 0))}
              </div>
              <div class="text-sm text-gray-600">Total Revenue (6 months)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold {monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'}">
                {formatCurrency(monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0))}
              </div>
              <div class="text-sm text-gray-600">Total Profit (6 months)</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trend Analysis -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span class="mr-2">🔍</span> Trend Analysis
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 class="font-medium text-gray-800 mb-3">📊 Key Observations</h4>
            <div class="space-y-2 text-sm">
              {#if monthlyTrends.length >= 2}
                {@const latest = monthlyTrends[monthlyTrends.length - 1]}
                {@const previous = monthlyTrends[monthlyTrends.length - 2]}
                
                <div class="flex items-center p-2 rounded {latest.revenue > previous.revenue ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}">
                  <span class="mr-2">{latest.revenue > previous.revenue ? '📈' : '📉'}</span>
                  Revenue {latest.revenue > previous.revenue ? 'increased' : 'decreased'} by {formatPercentage(Math.abs(latest.revenue - previous.revenue), previous.revenue || 1)} last month
                </div>
                
                <div class="flex items-center p-2 rounded {latest.newMembers > previous.newMembers ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'}">
                  <span class="mr-2">{latest.newMembers > previous.newMembers ? '👥' : '⚠️'}</span>
                  {latest.newMembers > previous.newMembers ? 'Member growth accelerating' : 'Member acquisition slowing'}
                </div>
                
                <div class="flex items-center p-2 rounded {latest.profit > previous.profit ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}">
                  <span class="mr-2">{latest.profit > previous.profit ? '💰' : '💸'}</span>
                  Profitability {latest.profit > previous.profit ? 'improved' : 'declined'} last month
                </div>
              {/if}
            </div>
          </div>
          
          <div>
            <h4 class="font-medium text-gray-800 mb-3">💡 Recommendations</h4>
            <div class="space-y-2 text-sm">
              {#if monthlyTrends.some(trend => trend.profit < 0)}
                <div class="flex items-center p-2 bg-yellow-50 text-yellow-700 rounded">
                  <span class="mr-2">⚠️</span>
                  Focus on cost management and revenue optimization
                </div>
              {/if}
              
              {#if monthlyTrends.length >= 3 && monthlyTrends.slice(-3).every((trend, i, arr) => i === 0 || trend.newMembers < arr[i-1].newMembers)}
                <div class="flex items-center p-2 bg-blue-50 text-blue-700 rounded">
                  <span class="mr-2">🎯</span>
                  Consider marketing campaigns to boost member acquisition
                </div>
              {/if}
              
              {#if monthlyTrends.some(trend => trend.revenue > 0 && (trend.profit / trend.revenue) > 0.4)}
                <div class="flex items-center p-2 bg-green-50 text-green-700 rounded">
                  <span class="mr-2">🚀</span>
                  Strong profit margins - consider expansion opportunities
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>