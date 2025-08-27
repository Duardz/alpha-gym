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
    { id: 'overview', label: 'Overview', icon: '📊', description: 'Key metrics & summary', color: 'blue' },
    { id: 'revenue', label: 'Revenue', icon: '💰', description: 'Income analysis', color: 'green' },
    { id: 'members', label: 'Membership', icon: '👥', description: 'Member insights', color: 'purple' },
    { id: 'trends', label: 'Trends', icon: '📈', description: 'Historical data', color: 'indigo' }
  ];

  const periods = [
    { value: 'today', label: 'Today', icon: '📅' },
    { value: 'week', label: 'This Week', icon: '🗓️' },
    { value: 'month', label: 'This Month', icon: '📆' },
    { value: '3months', label: 'Last 3 Months', icon: '🗒️' },
    { value: 'year', label: 'This Year', icon: '📊' },
    { value: 'custom', label: 'Custom Range', icon: '⚙️' }
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
      showNotification('Failed to load report data. Please try again.', 'error');
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

  function getGrowthBadge(current: number, previous: number): { icon: string, color: string, text: string } {
    const diff = current - previous;
    if (diff > 0) {
      return { icon: '↗️', color: 'bg-green-100 text-green-700 border-green-200', text: `+${formatNumber(diff)}` };
    } else if (diff < 0) {
      return { icon: '↘️', color: 'bg-red-100 text-red-700 border-red-200', text: `${formatNumber(diff)}` };
    }
    return { icon: '➡️', color: 'bg-gray-100 text-gray-700 border-gray-200', text: 'No change' };
  }

  // Notification system
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }> = [];
  let notificationId = 0;

  function showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    const id = notificationId++;
    notifications = [...notifications, { id, message, type }];
    
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }

  function removeNotification(id: number) {
    notifications = notifications.filter(n => n.id !== id);
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
      totalMembers: members.length || 0,
      activeMembers: members.filter(m => m.status === 'Active').length || 0,
      newMembers: filteredMembers.length || 0,
      
      // Walk-in stats
      totalWalkIns: walkIns.length || 0,
      periodWalkIns: filteredWalkIns.length || 0,
      walkInRevenue: filteredWalkIns.reduce((sum, w) => sum + (w.payment || 0), 0),
      
      // Financial stats
      totalRevenue: cashflowEntries.filter(c => c.type === 'income').reduce((sum, c) => sum + (c.amount || 0), 0),
      periodRevenue: filteredCashflow.filter(c => c.type === 'income').reduce((sum, c) => sum + (c.amount || 0), 0),
      periodExpenses: filteredCashflow.filter(c => c.type === 'expense').reduce((sum, c) => sum + (c.amount || 0), 0),
      
      // Membership breakdown
      membershipBreakdown: members.reduce((acc, member) => {
        // Use string as key to avoid undefined 'name' property
        if (member.membershipType) {
          const typeKey = typeof member.membershipType === 'string'
            ? member.membershipType
            : (member.membershipType as any)?.name ?? String(member.membershipType);
          acc[typeKey] = (acc[typeKey] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>),
      
      // Revenue by source
      revenueBySource: filteredCashflow
        .filter(c => c.type === 'income')
        .reduce((acc, entry) => {
          if (entry.source && entry.amount) {
            acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
          }
          return acc;
        }, {} as Record<string, number>),
      
      // Expenses by category
      expensesByCategory: filteredCashflow
        .filter(c => c.type === 'expense')
        .reduce((acc, entry) => {
          if (entry.source && entry.amount) {
            acc[entry.source] = (acc[entry.source] || 0) + entry.amount;
          }
          return acc;
        }, {} as Record<string, number>)
    };

    // Add computed properties with safety checks
    const netProfit = (stats.periodRevenue || 0) - (stats.periodExpenses || 0);
    const retentionRate = (stats.totalMembers > 0) ? 
      ((stats.activeMembers || 0) / stats.totalMembers) * 100 : 0;

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
      
      const income = monthCashflow.filter(c => c.type === 'income').reduce((sum, c) => sum + (c.amount || 0), 0);
      const expenses = monthCashflow.filter(c => c.type === 'expense').reduce((sum, c) => sum + (c.amount || 0), 0);

      trends.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        newMembers: monthMembers.length || 0,
        walkIns: monthWalkIns.length || 0,
        revenue: income || 0,
        expenses: expenses || 0,
        profit: (income || 0) - (expenses || 0)
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

    showNotification('Report exported successfully!', 'success');
  }

  // Reactive updates when period changes
  $: if (selectedPeriod && !isLoading) {
    generateReportData();
  }
</script>

<svelte:head>
  <title>Business Reports - Alpha Forge</title>
</svelte:head>

<!-- Toast Notifications -->
<div class="fixed top-4 right-4 z-50 space-y-3 max-w-md">
  {#each notifications as notification (notification.id)}
    <div class="notification-slide-in bg-white rounded-lg shadow-lg border-l-4 {
      notification.type === 'success' ? 'border-green-500' :
      notification.type === 'error' ? 'border-red-500' :
      notification.type === 'warning' ? 'border-yellow-500' :
      'border-blue-500'
    } p-4 min-w-80">
      <div class="flex items-start">
        <div class="flex-shrink-0 mr-3 mt-0.5">
          <span class="{
            notification.type === 'success' ? 'text-green-600' :
            notification.type === 'error' ? 'text-red-600' :
            notification.type === 'warning' ? 'text-yellow-600' :
            'text-blue-600'
          }">
            {notification.type === 'success' ? '✅' : 
             notification.type === 'error' ? '❌' : 
             notification.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium {
            notification.type === 'success' ? 'text-green-900' :
            notification.type === 'error' ? 'text-red-900' :
            notification.type === 'warning' ? 'text-yellow-900' :
            'text-blue-900'
          }">
            {notification.message}
          </p>
        </div>
        <button
          on:click={() => removeNotification(notification.id)}
          class="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close notification"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  {/each}
</div>

<div class="p-6 max-w-7xl mx-auto">
  <!-- Enhanced Header -->
  <div class="mb-8">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
          <span class="text-white text-xl font-bold">📊</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Business Reports</h1>
          <p class="text-gray-600 mt-1">Track your gym's performance and growth</p>
        </div>
      </div>
      
      <!-- Enhanced Controls -->
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex gap-3">
          <!-- Period Selector -->
          <div class="relative">
            <select
              bind:value={selectedPeriod}
              class="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              {#each periods as period}
                <option value={period.value}>
                  {period.label}
                </option>
              {/each}
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>

          <!-- Export Button -->
          <button
            on:click={exportReport}
            disabled={isLoading}
            class="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <span class="mr-2">📋</span>
            Export Report
          </button>
        </div>
        
        <!-- Custom Date Range -->
        {#if selectedPeriod === 'custom'}
          <div class="flex gap-2 items-center bg-gray-50 p-3 rounded-lg border">
            <input
              type="date"
              bind:value={customDateFrom}
              class="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span class="text-gray-500 text-sm font-medium">to</span>
            <input
              type="date"
              bind:value={customDateTo}
              class="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        {/if}
      </div>
    </div>

    <!-- Period Info Badge -->
    <div class="mt-6">
      <div class="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 text-blue-800 rounded-full text-sm font-medium">
        <span class="mr-2">📅</span>
        Report Period: <strong class="ml-1">{reportData.period}</strong>
        {#if selectedPeriod === 'custom'}
          <span class="ml-1">({formatDate(dateRange.start)} - {formatDate(dateRange.end)})</span>
        {/if}
      </div>
    </div>
  </div>

  {#if isLoading}
    <!-- Enhanced Loading State -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
          <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Loading Business Reports</h3>
        <p class="text-gray-600">Analyzing your gym's data...</p>
      </div>
    </div>
  {:else}
    <!-- Enhanced Tab Navigation -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
      <div class="border-b border-gray-200">
        <nav class="flex overflow-x-auto px-6">
          {#each tabs as tab}
            <button
              on:click={() => activeTab = tab.id}
              class="flex-shrink-0 px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200 {
                activeTab === tab.id
                  ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }"
            >
              <div class="flex items-center gap-3">
                <span class="text-lg">{tab.icon}</span>
                <div class="text-left">
                  <div class="font-semibold">{tab.label}</div>
                  <div class="text-xs opacity-75">{tab.description}</div>
                </div>
              </div>
            </button>
          {/each}
        </nav>
      </div>
    </div>

    <!-- Tab Content -->
    {#if activeTab === 'overview'}
      <!-- Enhanced Overview Tab -->
      <div class="space-y-8">
        <!-- Key Metrics with Growth Indicators -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Total Members -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span class="text-blue-600 text-xl">👥</span>
              </div>
              {#if true}
                {@const growth = getGrowthBadge(currentStats.totalMembers, previousStats.members)}
                <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border {growth.color}">
                  <span class="mr-1">{growth.icon}</span>
                  {growth.text}
                </div>
              {/if}
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 mb-1">{formatNumber(currentStats.totalMembers)}</p>
              <p class="text-sm font-medium text-gray-600 mb-2">Total Members</p>
              <p class="text-xs text-green-600 font-medium">{formatNumber(currentStats.activeMembers)} active members</p>
            </div>
          </div>

          <!-- Revenue -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span class="text-green-600 text-xl">💰</span>
              </div>
              {#if true}
                {@const growth = getGrowthBadge(currentStats.periodRevenue, previousStats.revenue)}
                <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border {growth.color}">
                  <span class="mr-1">{growth.icon}</span>
                  vs prev
                </div>
              {/if}
            </div>
            <div>
              <p class="text-2xl font-bold text-green-600 mb-1">{formatCurrency(currentStats.periodRevenue)}</p>
              <p class="text-sm font-medium text-gray-600 mb-2">Period Revenue</p>
              <p class="text-xs text-gray-500">{formatCurrency(currentStats.totalRevenue)} total</p>
            </div>
          </div>

          <!-- Walk-ins -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span class="text-purple-600 text-xl">🚶</span>
              </div>
              {#if true}
                {@const growth = getGrowthBadge(currentStats.periodWalkIns, previousStats.walkIns)}
                <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border {growth.color}">
                  <span class="mr-1">{growth.icon}</span>
                  vs prev
                </div>
              {/if}
            </div>
            <div>
              <p class="text-2xl font-bold text-purple-600 mb-1">{formatNumber(currentStats.periodWalkIns)}</p>
              <p class="text-sm font-medium text-gray-600 mb-2">Walk-ins</p>
              <p class="text-xs text-purple-500">{formatCurrency(currentStats.walkInRevenue)} revenue</p>
            </div>
          </div>

          <!-- Net Profit -->
          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 {currentStats.netProfit >= 0 ? 'bg-blue-100' : 'bg-red-100'} rounded-lg flex items-center justify-center">
                <span class="{currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} text-xl">
                  {currentStats.netProfit >= 0 ? '📈' : '📉'}
                </span>
              </div>
              <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border {
                currentStats.netProfit >= 0 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-red-100 text-red-700 border-red-200'
              }">
                {Math.round((Math.abs(currentStats.netProfit) / (currentStats.periodRevenue || 1)) * 100)}% margin
              </div>
            </div>
            <div>
              <p class="text-2xl font-bold {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mb-1">
                {formatCurrency(currentStats.netProfit)}
              </p>
              <p class="text-sm font-medium text-gray-600 mb-2">Net Profit</p>
              <p class="text-xs text-gray-500">
                {formatCurrency(currentStats.periodExpenses)} expenses
              </p>
            </div>
          </div>
        </div>

        <!-- Business Health Dashboard -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Enhanced Business Health -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span class="text-xl">💪</span> Business Health
              </h3>
              <div class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium {
                currentStats.retentionRate >= 80 ? 'bg-green-100 text-green-800' :
                currentStats.retentionRate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }">
                {currentStats.retentionRate >= 80 ? '🟢 Excellent' :
                 currentStats.retentionRate >= 60 ? '🟡 Good' : '🔴 Needs Attention'}
              </div>
            </div>
            
            <div class="space-y-4">
              <!-- Member Retention -->
              <div class="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                <div class="flex justify-between items-center">
                  <div>
                    <p class="text-sm font-medium text-blue-800">Member Retention</p>
                    <p class="text-xs text-blue-600 mt-1">Active vs Total Members</p>
                  </div>
                  <div class="text-right">
                    <p class="text-2xl font-bold text-blue-600">{Math.round(currentStats.retentionRate)}%</p>
                    <p class="text-xs text-blue-700">{currentStats.activeMembers}/{currentStats.totalMembers}</p>
                  </div>
                </div>
              </div>

              <!-- Revenue per Member -->
              <div class="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
                <div class="flex justify-between items-center">
                  <div>
                    <p class="text-sm font-medium text-green-800">Revenue per Member</p>
                    <p class="text-xs text-green-600 mt-1">Average lifetime value</p>
                  </div>
                  <div class="text-right">
                    <p class="text-2xl font-bold text-green-600">
                      {formatCurrency(currentStats.totalMembers > 0 ? currentStats.totalRevenue / currentStats.totalMembers : 0)}
                    </p>
                    <p class="text-xs text-green-700">per member</p>
                  </div>
                </div>
              </div>

              <!-- Walk-in Revenue -->
              <div class="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                <div class="flex justify-between items-center">
                  <div>
                    <p class="text-sm font-medium text-purple-800">Walk-in Revenue</p>
                    <p class="text-xs text-purple-600 mt-1">Day pass income</p>
                  </div>
                  <div class="text-right">
                    <p class="text-2xl font-bold text-purple-600">{formatCurrency(currentStats.walkInRevenue)}</p>
                    <p class="text-xs text-purple-700">{currentStats.periodWalkIns} visits</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Enhanced Quick Insights -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">💡</span> AI Insights
            </h3>
            <div class="space-y-4">
              
              <!-- New Member Growth -->
              {#if currentStats.newMembers > 0}
                <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-green-600 text-sm">🎯</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-green-800">Growth Momentum</p>
                      <p class="text-sm text-green-700 mt-1">
                        <strong>{currentStats.newMembers}</strong> new members joined this period. 
                        {currentStats.newMembers > previousStats.members ? 'Growth is accelerating!' : 'Steady growth maintained.'}
                      </p>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Retention Analysis -->
              {#if currentStats.retentionRate >= 80}
                <div class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-blue-600 text-sm">🏆</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-blue-800">Excellent Retention</p>
                      <p class="text-sm text-blue-700 mt-1">
                        {Math.round(currentStats.retentionRate)}% retention rate shows strong member satisfaction and engagement.
                      </p>
                    </div>
                  </div>
                </div>
              {:else if currentStats.retentionRate < 60}
                <div class="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border border-yellow-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-yellow-600 text-sm">💭</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-yellow-800">Retention Opportunity</p>
                      <p class="text-sm text-yellow-700 mt-1">
                        Consider member engagement programs, surveys, or loyalty rewards to improve {Math.round(currentStats.retentionRate)}% retention rate.
                      </p>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Profitability Status -->
              {#if currentStats.netProfit > 0}
                <div class="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-emerald-600 text-sm">💚</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-emerald-800">Profitable Operations</p>
                      <p class="text-sm text-emerald-700 mt-1">
                        Strong {Math.round((currentStats.netProfit / currentStats.periodRevenue) * 100)}% profit margin indicates healthy business operations.
                      </p>
                    </div>
                  </div>
                </div>
              {:else}
                <div class="p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-red-600 text-sm">📊</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-red-800">Focus on Profitability</p>
                      <p class="text-sm text-red-700 mt-1">
                        Review expenses and consider revenue optimization strategies to improve current deficit.
                      </p>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Revenue Diversity -->
              {#if Object.keys(currentStats.revenueBySource).length > 1}
                <div class="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-200">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-indigo-600 text-sm">🎨</span>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-indigo-800">Revenue Diversification</p>
                      <p class="text-sm text-indigo-700 mt-1">
                        Multiple revenue streams provide good business stability and growth potential.
                      </p>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>

    {:else if activeTab === 'revenue'}
      <!-- Enhanced Revenue Tab -->
      <div class="space-y-8">
        <!-- Revenue vs Expenses Comparison -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span class="text-xl">💰</span> Financial Overview - {reportData.period}
          </h3>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <!-- Income -->
            <div class="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
              <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span class="text-green-600 text-xl">📈</span>
              </div>
              <div class="text-3xl font-bold text-green-600 mb-2">{formatCurrency(currentStats.periodRevenue)}</div>
              <div class="text-sm text-green-800 font-medium">Total Income</div>
              {#if previousStats.revenue > 0}
                <div class="text-xs text-green-600 mt-2 flex items-center justify-center gap-1">
                  {#if currentStats.periodRevenue > previousStats.revenue}
                    <span>↗️</span> +{formatCurrency(currentStats.periodRevenue - previousStats.revenue)}
                  {:else if currentStats.periodRevenue < previousStats.revenue}
                    <span>↘️</span> {formatCurrency(currentStats.periodRevenue - previousStats.revenue)}
                  {:else}
                    <span>➡️</span> No change
                  {/if}
                  vs previous
                </div>
              {/if}
            </div>

            <!-- Expenses -->
            <div class="text-center p-6 bg-gradient-to-br from-red-50 to-pink-50 rounded-xl border border-red-200">
              <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span class="text-red-600 text-xl">📉</span>
              </div>
              <div class="text-3xl font-bold text-red-600 mb-2">{formatCurrency(currentStats.periodExpenses)}</div>
              <div class="text-sm text-red-800 font-medium">Total Expenses</div>
              <div class="text-xs text-red-600 mt-2">
                {formatPercentage(currentStats.periodExpenses, currentStats.periodRevenue)} of revenue
              </div>
            </div>

            <!-- Net Profit -->
            <div class="text-center p-6 bg-gradient-to-br {currentStats.netProfit >= 0 ? 'from-blue-50 to-indigo-50' : 'from-red-50 to-pink-50'} rounded-xl border {currentStats.netProfit >= 0 ? 'border-blue-200' : 'border-red-200'}">
              <div class="w-12 h-12 {currentStats.netProfit >= 0 ? 'bg-blue-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-3">
                <span class="{currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} text-xl">
                  {currentStats.netProfit >= 0 ? '💎' : '⚠️'}
                </span>
              </div>
              <div class="text-3xl font-bold {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mb-2">
                {formatCurrency(currentStats.netProfit)}
              </div>
              <div class="text-sm {currentStats.netProfit >= 0 ? 'text-blue-800' : 'text-red-800'} font-medium">Net Profit</div>
              <div class="text-xs {currentStats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mt-2">
                {formatPercentage(Math.abs(currentStats.netProfit), currentStats.periodRevenue || 1)} margin
              </div>
            </div>
          </div>
        </div>

        <!-- Revenue Sources & Expenses Breakdown -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Revenue Sources -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">💵</span> Revenue Sources
            </h3>
            {#if Object.keys(currentStats.revenueBySource).length > 0}
              <div class="space-y-4">
                {#each Object.entries(currentStats.revenueBySource).sort(([,a], [,b]) => Number(b) - Number(a)) as [source, amount], index}
                  <div class="relative">
                    <div class="flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 hover:shadow-sm transition-shadow">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <span class="text-green-600 text-lg">
                            {source.includes('Pass') ? '🎫' : 
                             source === 'Product Sale' ? '🛒' : '💵'}
                          </span>
                        </div>
                        <div>
                          <p class="text-sm font-semibold text-green-800">{source}</p>
                          <p class="text-xs text-green-600">
                            {formatPercentage(Number(amount), currentStats.periodRevenue)} of total revenue
                          </p>
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-lg font-bold text-green-600">{formatCurrency(Number(amount))}</div>
                        {#if index === 0}
                          <div class="text-xs text-green-500 font-medium">Top Source</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-12">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-gray-400 text-2xl">📊</span>
                </div>
                <h4 class="text-sm font-medium text-gray-600 mb-2">No Revenue Data</h4>
                <p class="text-xs text-gray-500">No income recorded for this period</p>
              </div>
            {/if}
          </div>

          <!-- Expense Breakdown -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">💸</span> Expense Categories
            </h3>
            {#if Object.keys(currentStats.expensesByCategory).length > 0}
              <div class="space-y-4">
                {#each Object.entries(currentStats.expensesByCategory).sort(([,a], [,b]) => Number(b) - Number(a)) as [category, amount], index}
                  <div class="relative">
                    <div class="flex justify-between items-center p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-200 hover:shadow-sm transition-shadow">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <span class="text-red-600 text-lg">
                            {category === 'Rent' ? '🏢' : 
                             category === 'Utilities' ? '⚡' : 
                             category === 'Salaries' ? '👥' : 
                             category === 'Equipment' ? '🏋️' : 
                             category === 'Marketing' ? '📢' : '📝'}
                          </span>
                        </div>
                        <div>
                          <p class="text-sm font-semibold text-red-800">{category}</p>
                          <p class="text-xs text-red-600">
                            {formatPercentage(Number(amount), currentStats.periodExpenses)} of total expenses
                          </p>
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-lg font-bold text-red-600">{formatCurrency(Number(amount))}</div>
                        {#if index === 0}
                          <div class="text-xs text-red-500 font-medium">Highest Cost</div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-12">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-gray-400 text-2xl">📊</span>
                </div>
                <h4 class="text-sm font-medium text-gray-600 mb-2">No Expense Data</h4>
                <p class="text-xs text-gray-500">No expenses recorded for this period</p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Financial Health Indicators -->
        {#if currentStats.periodRevenue > 0}
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">🎯</span> Financial Health Indicators
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <!-- Revenue Growth -->
              <div class="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div class="text-2xl mb-2">
                  {currentStats.periodRevenue > previousStats.revenue ? '📈' : 
                   currentStats.periodRevenue < previousStats.revenue ? '📉' : '➡️'}
                </div>
                <div class="text-lg font-bold {getGrowthColor(currentStats.periodRevenue, previousStats.revenue)}">
                  {currentStats.periodRevenue > previousStats.revenue ? '+' : ''}
                  {formatPercentage(currentStats.periodRevenue - previousStats.revenue, previousStats.revenue || 1)}
                </div>
                <div class="text-sm text-gray-600">Revenue Growth</div>
              </div>

              <!-- Profit Margin -->
              <div class="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div class="text-2xl mb-2">💎</div>
                <div class="text-lg font-bold {currentStats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
                  {Math.round((currentStats.netProfit / currentStats.periodRevenue) * 100)}%
                </div>
                <div class="text-sm text-gray-600">Profit Margin</div>
              </div>

              <!-- Operating Efficiency -->
              <div class="text-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-200">
                <div class="text-2xl mb-2">⚙️</div>
                <div class="text-lg font-bold {currentStats.periodExpenses < currentStats.periodRevenue * 0.7 ? 'text-green-600' : 'text-yellow-600'}">
                  {currentStats.periodExpenses < currentStats.periodRevenue * 0.7 ? 'Good' : 'Monitor'}
                </div>
                <div class="text-sm text-gray-600">Operating Efficiency</div>
              </div>

              <!-- Break-even Point -->
              <div class="text-center p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <div class="text-2xl mb-2">🎯</div>
                <div class="text-lg font-bold text-purple-600">
                  {formatCurrency(currentStats.periodExpenses)}
                </div>
                <div class="text-sm text-gray-600">Break-even Point</div>
              </div>
            </div>

            <!-- Recommendations -->
            <div class="mt-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
              <h4 class="font-semibold text-indigo-800 mb-2 flex items-center gap-2">
                <span>💡</span> Financial Recommendations
              </h4>
              <div class="text-sm text-indigo-700 space-y-1">
                {#if currentStats.netProfit < 0}
                  <p>• Focus on cost reduction and revenue optimization to achieve profitability</p>
                {:else if (currentStats.netProfit / currentStats.periodRevenue) < 0.1}
                  <p>• Consider ways to improve profit margins above 10% for sustainable growth</p>
                {:else if (currentStats.netProfit / currentStats.periodRevenue) > 0.3}
                  <p>• Excellent profit margins - consider reinvestment opportunities for expansion</p>
                {/if}
                
                {#if Object.keys(currentStats.revenueBySource).length > 0}
                  {@const topSource = Object.entries(currentStats.revenueBySource).sort(([,a], [,b]) => Number(b) - Number(a))[0]}
                  <p>• Your top revenue source is {topSource[0]} - consider optimizing this stream further</p>
                {/if}
                
                {#if currentStats.periodExpenses > currentStats.periodRevenue * 0.8}
                  <p>• High expense ratio - review cost structure for potential savings</p>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

    {:else if activeTab === 'members'}
      <!-- Enhanced Members Tab -->
      <div class="space-y-8">
        <!-- Member Overview Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Active Members -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span class="text-green-600 text-xl">✅</span>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-green-600">{currentStats.activeMembers}</div>
                <div class="text-sm text-green-800 font-medium">Active Members</div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Retention Rate</span>
                <span class="font-medium text-green-600">{Math.round(currentStats.retentionRate)}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-green-600 h-2 rounded-full" style="width: {currentStats.retentionRate}%"></div>
              </div>
            </div>
          </div>

          <!-- Expired Members -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span class="text-red-600 text-xl">⏰</span>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-red-600">{currentStats.totalMembers - currentStats.activeMembers}</div>
                <div class="text-sm text-red-800 font-medium">Expired Members</div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Need Renewal</span>
                <span class="font-medium text-red-600">
                  {formatPercentage(currentStats.totalMembers - currentStats.activeMembers, currentStats.totalMembers)}
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-red-600 h-2 rounded-full" style="width: {((currentStats.totalMembers - currentStats.activeMembers) / currentStats.totalMembers) * 100}%"></div>
              </div>
            </div>
          </div>

          <!-- New Members -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span class="text-blue-600 text-xl">👋</span>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-blue-600">{currentStats.newMembers}</div>
                <div class="text-sm text-blue-800 font-medium">New This Period</div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Growth Rate</span>
                <span class="font-medium {getGrowthColor(currentStats.newMembers, previousStats.members)}">
                  {previousStats.members > 0 ? formatPercentage(currentStats.newMembers - previousStats.members, previousStats.members) : 'N/A'}
                </span>
              </div>
              <div class="text-xs text-gray-500">vs previous period</div>
            </div>
          </div>
        </div>

        <!-- Membership Types Analysis -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Membership Distribution -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">🏷️</span> Membership Distribution
            </h3>
            {#if Object.keys(currentStats.membershipBreakdown).length > 0}
              <div class="space-y-4">
                {#each Object.entries(currentStats.membershipBreakdown).sort(([,a], [,b]) => Number(b) - Number(a)) as [type, count]}
                  <div class="relative">
                    <div class="flex justify-between items-center p-4 rounded-lg border {
                      type === 'Alpha Elite Pass' ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200' :
                      type === 'Gladiator Pass' ? 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200' :
                      type === 'Warrior Pass' ? 'bg-gradient-to-r from-orange-50 to-red-50 border-orange-200' : 
                      'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
                    } hover:shadow-sm transition-shadow">
                      <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-lg flex items-center justify-center {
                          type === 'Alpha Elite Pass' ? 'bg-yellow-100' :
                          type === 'Gladiator Pass' ? 'bg-purple-100' :
                          type === 'Warrior Pass' ? 'bg-orange-100' : 'bg-gray-100'
                        }">
                          <span class="text-xl">
                            {type === 'Alpha Elite Pass' ? '🥇' :
                             type === 'Gladiator Pass' ? '🥈' :
                             type === 'Warrior Pass' ? '🥉' : '🎫'}
                          </span>
                        </div>
                        <div>
                          <p class="text-sm font-semibold {
                            type === 'Alpha Elite Pass' ? 'text-yellow-800' :
                            type === 'Gladiator Pass' ? 'text-purple-800' :
                            type === 'Warrior Pass' ? 'text-orange-800' : 'text-gray-800'
                          }">{type}</p>
                          <p class="text-xs {
                            type === 'Alpha Elite Pass' ? 'text-yellow-600' :
                            type === 'Gladiator Pass' ? 'text-purple-600' :
                            type === 'Warrior Pass' ? 'text-orange-600' : 'text-gray-600'
                          }">
                            {formatPercentage(Number(count), currentStats.totalMembers)} of total members
                          </p>
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-2xl font-bold {
                          type === 'Alpha Elite Pass' ? 'text-yellow-600' :
                          type === 'Gladiator Pass' ? 'text-purple-600' :
                          type === 'Warrior Pass' ? 'text-orange-600' : 'text-gray-600'
                        }">{count}</div>
                        <div class="text-xs text-gray-500">members</div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-12">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-gray-400 text-2xl">👥</span>
                </div>
                <h4 class="text-sm font-medium text-gray-600 mb-2">No Membership Data</h4>
                <p class="text-xs text-gray-500">No members found for this period</p>
              </div>
            {/if}
          </div>

          <!-- Member Analytics -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span class="text-xl">📊</span> Member Analytics
            </h3>
            <div class="space-y-6">
              <!-- Retention Score -->
              <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div class="flex justify-between items-center">
                  <div>
                    <div class="text-sm font-semibold text-green-800">Retention Score</div>
                    <div class="text-xs text-green-600 mt-1">Members staying active</div>
                  </div>
                  <div class="text-right">
                    <div class="text-3xl font-bold text-green-600">{Math.round(currentStats.retentionRate)}</div>
                    <div class="text-xs text-green-700">out of 100</div>
                  </div>
                </div>
                <div class="mt-3">
                  <div class="w-full bg-green-200 rounded-full h-3">
                    <div class="bg-green-600 h-3 rounded-full transition-all duration-500" style="width: {currentStats.retentionRate}%"></div>
                  </div>
                </div>
              </div>

              <!-- Growth Trend -->
              <div class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div class="flex justify-between items-center">
                  <div>
                    <div class="text-sm font-semibold text-blue-800">Growth Trend</div>
                    <div class="text-xs text-blue-600 mt-1">New members this period</div>
                  </div>
                  <div class="text-right">
                    <div class="text-3xl font-bold text-blue-600">{currentStats.newMembers}</div>
                    <div class="text-xs text-blue-700">new signups</div>
                  </div>
                </div>
                {#if previousStats.members > 0}
                  <div class="mt-3 flex items-center justify-between text-sm">
                    <span class="text-blue-700">vs previous period:</span>
                    <span class="font-medium {getGrowthColor(currentStats.newMembers, previousStats.members)}">
                      {currentStats.newMembers > previousStats.members ? '+' : ''}
                      {currentStats.newMembers - previousStats.members}
                      {getGrowthIcon(currentStats.newMembers, previousStats.members)}
                    </span>
                  </div>
                {/if}
              </div>

              <!-- Revenue per Member -->
              <div class="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <div class="flex justify-between items-center">
                  <div>
                    <div class="text-sm font-semibold text-purple-800">Revenue per Member</div>
                    <div class="text-xs text-purple-600 mt-1">Average member value</div>
                  </div>
                  <div class="text-right">
                    <div class="text-2xl font-bold text-purple-600">
                      {formatCurrency(currentStats.totalMembers > 0 ? currentStats.totalRevenue / currentStats.totalMembers : 0)}
                    </div>
                    <div class="text-xs text-purple-700">per member</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Member Growth Recommendations -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span class="text-xl">💡</span> Growth Recommendations
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {#if currentStats.retentionRate < 70}
              <div class="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border border-yellow-200">
                <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-yellow-600 text-lg">⚠️</span>
                </div>
                <h4 class="font-semibold text-yellow-800 mb-2">Improve Retention</h4>
                <p class="text-sm text-yellow-700">
                  Current retention at {Math.round(currentStats.retentionRate)}%. Consider member surveys, 
                  loyalty programs, or enhanced class offerings to boost engagement.
                </p>
              </div>
            {:else if currentStats.retentionRate >= 85}
              <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-green-600 text-lg">🏆</span>
                </div>
                <h4 class="font-semibold text-green-800 mb-2">Excellent Retention</h4>
                <p class="text-sm text-green-700">
                  Outstanding {Math.round(currentStats.retentionRate)}% retention rate! 
                  Consider member referral programs to leverage satisfied members.
                </p>
              </div>
            {/if}
            
            {#if currentStats.newMembers < previousStats.members}
              <div class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-blue-600 text-lg">📈</span>
                </div>
                <h4 class="font-semibold text-blue-800 mb-2">Boost Acquisition</h4>
                <p class="text-sm text-blue-700">
                  Member acquisition has slowed. Try social media campaigns, 
                  free trial offers, or partner with local businesses.
                </p>
              </div>
            {:else if currentStats.newMembers > previousStats.members}
              <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-green-600 text-lg">🚀</span>
                </div>
                <h4 class="font-semibold text-green-800 mb-2">Strong Growth</h4>
                <p class="text-sm text-green-700">
                  Member growth is accelerating! Continue current marketing strategies 
                  and ensure capacity can handle increased membership.
                </p>
              </div>
            {/if}

            {#if Object.values(currentStats.membershipBreakdown).some(count => Number(count) > currentStats.totalMembers * 0.6)}
              <div class="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-purple-600 text-lg">🎯</span>
                </div>
                <h4 class="font-semibold text-purple-800 mb-2">Diversify Plans</h4>
                <p class="text-sm text-purple-700">
                  One membership type dominates. Promote underused tiers or 
                  create special packages to diversify revenue streams.
                </p>
              </div>
            {:else}
              <div class="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-3">
                  <span class="text-indigo-600 text-lg">🎨</span>
                </div>
                <h4 class="font-semibold text-indigo-800 mb-2">Great Diversity</h4>
                <p class="text-sm text-indigo-700">
                  Good membership plan distribution provides stable revenue. 
                  Continue monitoring trends and adjust pricing as needed.
                </p>
              </div>
            {/if}

            <!-- Always show a general recommendation -->
            <div class="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
              <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                <span class="text-gray-600 text-lg">💭</span>
              </div>
              <h4 class="font-semibold text-gray-800 mb-2">Member Feedback</h4>
              <p class="text-sm text-gray-700">
                Regular member surveys can provide valuable insights for improvement. 
                Consider quarterly feedback sessions or digital surveys.
              </p>
            </div>
          </div>
        </div>
      </div>

    {:else if activeTab === 'trends'}
      <!-- Enhanced Trends Tab -->
      <div class="space-y-8">
        <!-- Monthly Trends Overview -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span class="text-xl">📈</span> 6-Month Business Trends
            </h3>
            <div class="text-sm text-gray-600">
              Showing data for the last 6 months
            </div>
          </div>
          
          <div class="overflow-x-auto">
            <table class="min-w-full">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Month</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">New Members</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Walk-ins</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Revenue</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Expenses</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Profit</th>
                  <th class="text-left py-3 px-4 font-semibold text-gray-700">Health</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                {#each monthlyTrends as trend, index}
                  {@const prevTrend = index > 0 ? monthlyTrends[index - 1] : null}
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="py-4 px-4">
                      <div class="font-medium text-gray-900">{trend.month}</div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-blue-600">+{trend.newMembers}</span>
                        {#if prevTrend}
                          <span class="text-xs px-2 py-1 rounded-full {
                            trend.newMembers > prevTrend.newMembers ? 'bg-green-100 text-green-700' :
                            trend.newMembers < prevTrend.newMembers ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }">
                            {trend.newMembers > prevTrend.newMembers ? '↗️' :
                             trend.newMembers < prevTrend.newMembers ? '↘️' : '→'}
                            {trend.newMembers - prevTrend.newMembers}
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-purple-600">{trend.walkIns}</span>
                        {#if prevTrend}
                          <span class="text-xs px-2 py-1 rounded-full {
                            trend.walkIns > prevTrend.walkIns ? 'bg-green-100 text-green-700' :
                            trend.walkIns < prevTrend.walkIns ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }">
                            {trend.walkIns > prevTrend.walkIns ? '↗️' :
                             trend.walkIns < prevTrend.walkIns ? '↘️' : '→'}
                            {trend.walkIns - prevTrend.walkIns}
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex flex-col">
                        <span class="font-semibold text-green-600">{formatCurrency(trend.revenue)}</span>
                        {#if prevTrend}
                          <span class="text-xs {getGrowthColor(trend.revenue, prevTrend.revenue)}">
                            {formatPercentage(trend.revenue - prevTrend.revenue, prevTrend.revenue || 1)} vs prev
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex flex-col">
                        <span class="font-semibold text-red-600">{formatCurrency(trend.expenses)}</span>
                        {#if prevTrend}
                          <span class="text-xs {getGrowthColor(prevTrend.expenses, trend.expenses)}">
                            {formatPercentage(trend.expenses - prevTrend.expenses, prevTrend.expenses || 1)} vs prev
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex flex-col">
                        <span class="font-semibold {trend.profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                          {formatCurrency(trend.profit)}
                        </span>
                        {#if prevTrend}
                          <span class="text-xs {getGrowthColor(trend.profit, prevTrend.profit)}">
                            {formatCurrency(trend.profit - prevTrend.profit)} vs prev
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      {#if trend.revenue > 0}
                        {@const profitMargin = (trend.profit / trend.revenue) * 100}
                        <div class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium {
                          profitMargin >= 30 ? 'bg-green-100 text-green-800 border border-green-200' :
                          profitMargin >= 10 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                          profitMargin >= 0 ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-red-100 text-red-800 border border-red-200'
                        }">
                          {profitMargin >= 30 ? '🟢' : 
                           profitMargin >= 10 ? '🟡' : 
                           profitMargin >= 0 ? '🔵' : '🔴'}
                          {Math.round(profitMargin)}%
                        </div>
                      {:else}
                        <div class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                          ➖ 0%
                        </div>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Trends Summary -->
          <div class="mt-8 pt-6 border-t border-gray-200">
            <h4 class="font-semibold text-gray-800 mb-4">6-Month Summary</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div class="text-3xl font-bold text-blue-600 mb-1">
                  {monthlyTrends.reduce((sum, trend) => sum + trend.newMembers, 0)}
                </div>
                <div class="text-sm text-blue-800 font-medium">Total New Members</div>
                <div class="text-xs text-blue-600 mt-1">6-month period</div>
              </div>
              <div class="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div class="text-3xl font-bold text-green-600 mb-1">
                  {formatCurrency(monthlyTrends.reduce((sum, trend) => sum + trend.revenue, 0))}
                </div>
                <div class="text-sm text-green-800 font-medium">Total Revenue</div>
                <div class="text-xs text-green-600 mt-1">6-month period</div>
              </div>
              <div class="text-center p-4 bg-gradient-to-br {monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) >= 0 ? 'from-green-50 to-emerald-50 border-green-200' : 'from-red-50 to-pink-50 border-red-200'} rounded-lg border">
                <div class="text-3xl font-bold {monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'} mb-1">
                  {formatCurrency(monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0))}
                </div>
                <div class="text-sm {monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) >= 0 ? 'text-green-800' : 'text-red-800'} font-medium">Net Profit</div>
                <div class="text-xs {monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'} mt-1">6-month period</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Trend Analysis & Insights -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span class="text-xl">🔍</span> Trend Analysis & Insights
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <!-- Key Observations -->
            <div>
              <h4 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span class="text-lg">📊</span> Key Observations
              </h4>
              <div class="space-y-3">
                {#if monthlyTrends.length >= 2}
                  {#if true}
                    {@const latest = monthlyTrends[monthlyTrends.length - 1]}
                    {@const previous = monthlyTrends[monthlyTrends.length - 2]}
                    
                    <!-- Revenue Trend -->
                    <div class="flex items-start gap-3 p-3 rounded-lg {latest.revenue > previous.revenue ? 'bg-green-50 border border-green-200' : latest.revenue < previous.revenue ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}">
                      <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 {latest.revenue > previous.revenue ? 'bg-green-100' : latest.revenue < previous.revenue ? 'bg-red-100' : 'bg-gray-100'}">
                        <span class="text-sm">
                          {latest.revenue > previous.revenue ? '📈' : latest.revenue < previous.revenue ? '📉' : '➡️'}
                        </span>
                      </div>
                      <div>
                        <p class="text-sm font-medium {latest.revenue > previous.revenue ? 'text-green-800' : latest.revenue < previous.revenue ? 'text-red-800' : 'text-gray-800'}">
                          Revenue {latest.revenue > previous.revenue ? 'Growth' : latest.revenue < previous.revenue ? 'Decline' : 'Stable'}
                        </p>
                        <p class="text-xs {latest.revenue > previous.revenue ? 'text-green-600' : latest.revenue < previous.revenue ? 'text-red-600' : 'text-gray-600'} mt-1">
                          {latest.revenue > previous.revenue ? 'Increased' : latest.revenue < previous.revenue ? 'Decreased' : 'No change'} by {formatPercentage(Math.abs(latest.revenue - previous.revenue), previous.revenue || 1)} from last month
                        </p>
                      </div>
                    </div>
                    
                    <!-- Member Growth -->
                    <div class="flex items-start gap-3 p-3 rounded-lg {latest.newMembers > previous.newMembers ? 'bg-blue-50 border border-blue-200' : latest.newMembers < previous.newMembers ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'}">
                      <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 {latest.newMembers > previous.newMembers ? 'bg-blue-100' : latest.newMembers < previous.newMembers ? 'bg-yellow-100' : 'bg-gray-100'}">
                        <span class="text-sm">
                          {latest.newMembers > previous.newMembers ? '👥' : latest.newMembers < previous.newMembers ? '⚠️' : '➡️'}
                        </span>
                      </div>
                      <div>
                        <p class="text-sm font-medium {latest.newMembers > previous.newMembers ? 'text-blue-800' : latest.newMembers < previous.newMembers ? 'text-yellow-800' : 'text-gray-800'}">
                          Member Acquisition {latest.newMembers > previous.newMembers ? 'Accelerating' : latest.newMembers < previous.newMembers ? 'Slowing' : 'Steady'}
                        </p>
                        <p class="text-xs {latest.newMembers > previous.newMembers ? 'text-blue-600' : latest.newMembers < previous.newMembers ? 'text-yellow-600' : 'text-gray-600'} mt-1">
                          {latest.newMembers > previous.newMembers ? '+' : ''}{latest.newMembers - previous.newMembers} members vs last month
                        </p>
                      </div>
                    </div>
                    
                    <!-- Profitability Trend -->
                    <div class="flex items-start gap-3 p-3 rounded-lg {latest.profit > previous.profit ? 'bg-green-50 border border-green-200' : latest.profit < previous.profit ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}">
                      <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 {latest.profit > previous.profit ? 'bg-green-100' : latest.profit < previous.profit ? 'bg-red-100' : 'bg-gray-100'}">
                        <span class="text-sm">
                          {latest.profit > previous.profit ? '💰' : latest.profit < previous.profit ? '💸' : '➡️'}
                        </span>
                      </div>
                      <div>
                        <p class="text-sm font-medium {latest.profit > previous.profit ? 'text-green-800' : latest.profit < previous.profit ? 'text-red-800' : 'text-gray-800'}">
                          Profitability {latest.profit > previous.profit ? 'Improved' : latest.profit < previous.profit ? 'Declined' : 'Stable'}
                        </p>
                        <p class="text-xs {latest.profit > previous.profit ? 'text-green-600' : latest.profit < previous.profit ? 'text-red-600' : 'text-gray-600'} mt-1">
                          {formatCurrency(latest.profit - previous.profit)} change from last month
                        </p>
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
            
            <!-- Strategic Recommendations -->
            <div>
              <h4 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span class="text-lg">💡</span> Strategic Recommendations
              </h4>
              <div class="space-y-3">
                
                {#if monthlyTrends.some(trend => trend.profit < 0)}
                  <div class="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div class="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span class="text-sm text-yellow-600">⚠️</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-yellow-800">Cost Management Priority</p>
                      <p class="text-xs text-yellow-600 mt-1">
                        Some months show losses. Review expense structure and optimize operations for consistent profitability.
                      </p>
                    </div>
                  </div>
                {/if}
                
                {#if monthlyTrends.length >= 3 && monthlyTrends.slice(-3).every((trend, i, arr) => i === 0 || trend.newMembers < arr[i-1].newMembers)}
                  <div class="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span class="text-sm text-blue-600">🎯</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-blue-800">Marketing Investment</p>
                      <p class="text-xs text-blue-600 mt-1">
                        Member acquisition declining for 3 months. Consider targeted marketing campaigns or referral programs.
                      </p>
                    </div>
                  </div>
                {/if}
                
                {#if monthlyTrends.some(trend => trend.revenue > 0 && (trend.profit / trend.revenue) > 0.4)}
                  <div class="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div class="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span class="text-sm text-green-600">🚀</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-green-800">Expansion Opportunity</p>
                      <p class="text-xs text-green-600 mt-1">
                        Strong profit margins indicate potential for expansion or equipment upgrades to increase capacity.
                      </p>
                    </div>
                  </div>
                {/if}
                
                <!-- Seasonal Analysis -->
                {#if monthlyTrends.length >= 6}
                  {#if true}
                    {@const avgRevenue = monthlyTrends.reduce((sum, trend) => sum + trend.revenue, 0) / monthlyTrends.length}
                    {@const highPerformingMonths = monthlyTrends.filter(trend => trend.revenue > avgRevenue * 1.2)}
                    {#if highPerformingMonths.length > 0}
                      <div class="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div class="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span class="text-sm text-purple-600">📅</span>
                        </div>
                        <div>
                          <p class="text-sm font-medium text-purple-800">Seasonal Patterns</p>
                          <p class="text-xs text-purple-600 mt-1">
                            {highPerformingMonths.map(trend => trend?.month || 'Unknown').join(', ')} showed above-average performance. 
                            Plan targeted campaigns during similar periods.
                          </p>
                        </div>
                      </div>
                    {/if}
                  {/if}
                {/if}
                
                <!-- Consistency Recommendation -->
                <div class="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div class="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span class="text-sm text-indigo-600">🎨</span>
                  </div>
                  <div>
                    <p class="text-sm font-medium text-indigo-800">Performance Tracking</p>
                    <p class="text-xs text-indigo-600 mt-1">
                      Continue monitoring these trends monthly. Set targets for member acquisition and revenue growth to maintain momentum.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Business Health Score -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span class="text-xl">🏆</span> Overall Business Health Score
          </h3>
          
          {#if true}
            {@const avgMonthlyRevenue = monthlyTrends.length > 0 ? monthlyTrends.reduce((sum, trend) => sum + trend.revenue, 0) / monthlyTrends.length : 0}
            {@const avgMonthlyProfit = monthlyTrends.length > 0 ? monthlyTrends.reduce((sum, trend) => sum + trend.profit, 0) / monthlyTrends.length : 0}
            {@const avgProfitMargin = avgMonthlyRevenue > 0 ? (avgMonthlyProfit / avgMonthlyRevenue) * 100 : 0}
            {@const revenueGrowth = monthlyTrends.length >= 2 ? ((monthlyTrends[monthlyTrends.length - 1].revenue - monthlyTrends[0].revenue) / (monthlyTrends[0].revenue || 1)) * 100 : 0}
            {@const healthScore = Math.min(100, Math.max(0, 
              (currentStats.retentionRate * 0.3) + 
              (Math.min(avgProfitMargin, 50) * 0.4) + 
              (Math.min(Math.max(revenueGrowth, -50), 50) + 50) * 0.3))}
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <!-- Health Score Display -->
              <div class="text-center">
                <div class="relative w-32 h-32 mx-auto mb-4">
                  <svg class="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-dasharray="100, 100"
                      class="text-gray-200"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-dasharray="{healthScore}, 100"
                      class="{
                        healthScore >= 80 ? 'text-green-500' :
                        healthScore >= 60 ? 'text-yellow-500' :
                        healthScore >= 40 ? 'text-orange-500' :
                        'text-red-500'
                      }"
                    />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="text-center">
                      <div class="text-2xl font-bold {
                        healthScore >= 80 ? 'text-green-600' :
                        healthScore >= 60 ? 'text-yellow-600' :
                        healthScore >= 40 ? 'text-orange-600' :
                        'text-red-600'
                      }">{Math.round(healthScore)}</div>
                      <div class="text-xs text-gray-500">out of 100</div>
                    </div>
                  </div>
                </div>
                
                <div class="text-lg font-semibold mb-2 {
                  healthScore >= 80 ? 'text-green-600' :
                  healthScore >= 60 ? 'text-yellow-600' :
                  healthScore >= 40 ? 'text-orange-600' :
                  'text-red-600'
                }">
                  {healthScore >= 80 ? '🟢 Excellent Health' :
                   healthScore >= 60 ? '🟡 Good Health' :
                   healthScore >= 40 ? '🟠 Fair Health' :
                   '🔴 Needs Attention'}
                </div>
                
                <p class="text-sm text-gray-600">
                  {healthScore >= 80 ? 'Your gym is performing exceptionally well across all metrics.' :
                   healthScore >= 60 ? 'Strong performance with room for optimization in some areas.' :
                   healthScore >= 40 ? 'Moderate performance. Focus on key improvement areas.' :
                   'Several areas need immediate attention for better performance.'}
                </p>
              </div>

              <!-- Health Factors Breakdown -->
              <div class="space-y-4">
                <h4 class="font-semibold text-gray-800">Health Factors</h4>
                
                <!-- Member Retention -->
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span class="text-blue-600 text-sm">👥</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-800">Member Retention</p>
                      <p class="text-xs text-gray-600">30% weight</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold text-blue-600">{Math.round(currentStats.retentionRate)}%</p>
                    <div class="w-16 bg-gray-200 rounded-full h-2 mt-1">
                      <div class="bg-blue-600 h-2 rounded-full" style="width: {currentStats.retentionRate}%"></div>
                    </div>
                  </div>
                </div>

                <!-- Profit Margin -->
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <span class="text-green-600 text-sm">💰</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-800">Profit Margin</p>
                      <p class="text-xs text-gray-600">40% weight</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold text-green-600">{Math.round(avgProfitMargin)}%</p>
                    <div class="w-16 bg-gray-200 rounded-full h-2 mt-1">
                      <div class="bg-green-600 h-2 rounded-full" style="width: {Math.min(avgProfitMargin, 50) * 2}%"></div>
                    </div>
                  </div>
                </div>

                <!-- Revenue Growth -->
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span class="text-purple-600 text-sm">📈</span>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-800">Revenue Growth</p>
                      <p class="text-xs text-gray-600">30% weight</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold {revenueGrowth >= 0 ? 'text-purple-600' : 'text-red-600'}">
                      {revenueGrowth > 0 ? '+' : ''}{Math.round(revenueGrowth)}%
                    </p>
                    <div class="w-16 bg-gray-200 rounded-full h-2 mt-1">
                      <div class="{revenueGrowth >= 0 ? 'bg-purple-600' : 'bg-red-600'} h-2 rounded-full" 
                           style="width: {Math.min(Math.max(revenueGrowth + 50, 0), 100)}%"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .notification-slide-in {
    animation: slideInFromRight 0.3s ease-out;
  }

  @keyframes slideInFromRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .notification-slide-in:hover {
    transform: translateY(-2px);
    transition: transform 0.2s ease;
  }

  /* Smooth transitions for all interactive elements */
  .transition-all {
    transition: all 0.2s ease-in-out;
  }

  .transition-colors {
    transition: color, background-color, border-color 0.2s ease-in-out;
  }

  .transition-shadow {
    transition: box-shadow 0.2s ease-in-out;
  }

  /* Enhanced hover effects */
  .hover\:shadow-md:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .hover\:shadow-sm:hover {
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  /* Progress bar animations */
  @keyframes fillProgress {
    from { width: 0%; }
    to { width: var(--progress-width); }
  }

  .progress-bar {
    animation: fillProgress 1s ease-out;
  }

  /* Custom scrollbar for tables */
  .overflow-x-auto::-webkit-scrollbar {
    height: 6px;
  }

  .overflow-x-auto::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  .overflow-x-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  /* Focus states for accessibility */
  button:focus,
  select:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  /* Table hover effects */
  tbody tr:hover {
    background-color: rgba(249, 250, 251, 0.8);
  }

  /* Enhanced gradient backgrounds */
  .bg-gradient-to-r {
    background-image: linear-gradient(to right, var(--tw-gradient-stops));
  }

  .bg-gradient-to-br {
    background-image: linear-gradient(to bottom right, var(--tw-gradient-stops));
  }

  /* Responsive text sizing */
  @media (max-width: 768px) {
    .text-3xl { font-size: 1.5rem; }
    .text-2xl { font-size: 1.25rem; }
    .text-xl { font-size: 1.125rem; }
  }

  /* Loading state animations */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>