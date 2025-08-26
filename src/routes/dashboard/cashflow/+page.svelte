<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
  import type { CashflowEntry, CashflowType, IncomeSource, ExpenseSource } from '$lib/types';

  // Interfaces for type safety
  interface DailyAverages {
    income: number;
    expenses: number;
  }

  interface SourceBreakdownData {
    amount: number;
    count: number;
    type: CashflowType;
  }

  interface MonthlyTrend {
    month: string;
    monthKey: string;
    income: number;
    expenses: number;
    profit: number;
    count: number;
  }

  interface CashflowStats {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    totalEntries: number;
    incomeEntries: number;
    expenseEntries: number;
    averageIncome: number;
    averageExpense: number;
    dailyAverages: DailyAverages;
    sourceBreakdown: Record<string, SourceBreakdownData>;
    monthlyTrends: MonthlyTrend[];
  }

  // State
  let cashflowEntries: CashflowEntry[] = [];
  let isLoading = true;
  let isLoadingMore = false;
  
  // Filters
  let typeFilter: CashflowType | 'All' = 'All';
  let sourceFilter = '';
  let startDateFilter = '';
  let endDateFilter = '';
  let amountMinFilter = '';
  let amountMaxFilter = '';
  let periodFilter = 'all'; // all, today, week, month, quarter, year
  
  // Pagination
  let pageSize = 50;
  let currentPage = 1;
  let hasMoreData = true;
  
  // View options
  let showFilters = false;
  let sortBy = 'date';
  let sortOrder = 'desc';
  let viewMode = 'table'; // table, cards

  // Initialize date filters to last 30 days by default
  onMount(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    endDateFilter = today.toISOString().split('T')[0];
    startDateFilter = thirtyDaysAgo.toISOString().split('T')[0];
    
    loadCashflow();
  });

  // Load cashflow from Firestore with pagination
  async function loadCashflow(loadMore = false): Promise<void> {
    try {
      if (loadMore) {
        isLoadingMore = true;
      } else {
        isLoading = true;
        currentPage = 1;
      }

      let q = query(collection(db, 'cashflow'));
      
      // Apply filters
      if (typeFilter !== 'All') {
        q = query(q, where('type', '==', typeFilter));
      }
      
      if (sourceFilter) {
        q = query(q, where('source', '==', sourceFilter));
      }

      // Date range filter
      if (startDateFilter && endDateFilter) {
        const startDate = startDateFilter;
        const endDate = endDateFilter;
        q = query(q, where('date', '>=', startDate), where('date', '<=', endDate));
      }

      // Sort
      if (sortBy === 'date') {
        q = query(q, orderBy('date', sortOrder as 'asc' | 'desc'));
      } else if (sortBy === 'amount') {
        q = query(q, orderBy('amount', sortOrder as 'asc' | 'desc'));
      } else {
        q = query(q, orderBy('createdAt', sortOrder as 'asc' | 'desc'));
      }

      const querySnapshot = await getDocs(q);
      
      let newEntries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Ensure date is a string for consistent handling
          date: typeof data.date === 'string' ? data.date : 
                data.date?.toDate ? data.date.toDate().toISOString().split('T')[0] :
                new Date().toISOString().split('T')[0],
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as CashflowEntry;
      });

      // Client-side filtering for more complex filters
      if (amountMinFilter) {
        newEntries = newEntries.filter(entry => entry.amount >= parseFloat(amountMinFilter));
      }
      
      if (amountMaxFilter) {
        newEntries = newEntries.filter(entry => entry.amount <= parseFloat(amountMaxFilter));
      }

      if (loadMore) {
        cashflowEntries = [...cashflowEntries, ...newEntries];
      } else {
        cashflowEntries = newEntries;
      }

      hasMoreData = newEntries.length === pageSize;
      
    } catch (error) {
      console.error('Error loading cashflow:', error);
      showNotification('Failed to load cashflow data', 'error');
    } finally {
      isLoading = false;
      isLoadingMore = false;
    }
  }

  // Apply period filter
  function applyPeriodFilter(period: string): void {
    const today = new Date();
    
    switch (period) {
      case 'today':
        startDateFilter = today.toISOString().split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDateFilter = weekAgo.toISOString().split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDateFilter = monthAgo.toISOString().split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        startDateFilter = quarterAgo.toISOString().split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
        break;
      case 'year':
        const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
        startDateFilter = yearAgo.toISOString().split('T')[0];
        endDateFilter = today.toISOString().split('T')[0];
        break;
      case 'all':
        startDateFilter = '';
        endDateFilter = '';
        break;
    }
    
    periodFilter = period;
    loadCashflow();
  }

  // Clear all filters
  function clearFilters(): void {
    typeFilter = 'All';
    sourceFilter = '';
    startDateFilter = '';
    endDateFilter = '';
    amountMinFilter = '';
    amountMaxFilter = '';
    periodFilter = 'all';
    loadCashflow();
  }

  // Get daily averages for the current period
  function getDailyAverages(): DailyAverages {
    if (cashflowEntries.length === 0) return { income: 0, expenses: 0 };
    
    const dates = new Set(cashflowEntries.map(entry => entry.date));
    const dayCount = dates.size || 1;
    
    const totalIncome = cashflowEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = cashflowEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    
    return {
      income: totalIncome / dayCount,
      expenses: totalExpenses / dayCount
    };
  }

  // Get breakdown by source
  function getSourceBreakdown(): Record<string, SourceBreakdownData> {
    const breakdown: Record<string, SourceBreakdownData> = {};
    
    cashflowEntries.forEach(entry => {
      if (!breakdown[entry.source]) {
        breakdown[entry.source] = { amount: 0, count: 0, type: entry.type };
      }
      breakdown[entry.source].amount += entry.amount;
      breakdown[entry.source].count += 1;
    });
    
    return breakdown;
  }

  // Get monthly trends with real-time data
  function getMonthlyTrends(): MonthlyTrend[] {
    const trends: Record<string, { income: number, expenses: number, profit: number, count: number }> = {};
    
    cashflowEntries.forEach(entry => {
      const monthKey = entry.date.substring(0, 7); // YYYY-MM format
      
      if (!trends[monthKey]) {
        trends[monthKey] = { income: 0, expenses: 0, profit: 0, count: 0 };
      }
      
      if (entry.type === 'income') {
        trends[monthKey].income += entry.amount;
      } else {
        trends[monthKey].expenses += entry.amount;
      }
      
      trends[monthKey].count += 1;
    });
    
    // Calculate profit for each month
    Object.keys(trends).forEach(month => {
      trends[month].profit = trends[month].income - trends[month].expenses;
    });
    
    // Sort by month and return as array
    return Object.entries(trends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: formatMonthYear(month),
        monthKey: month,
        ...data
      }))
      .slice(-12); // Last 12 months
  }

  // Real-time statistics calculation with proper typing
  $: stats = ((): CashflowStats => {
    const totalIncome = cashflowEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = cashflowEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const incomeEntries = cashflowEntries.filter(e => e.type === 'income');
    const expenseEntries = cashflowEntries.filter(e => e.type === 'expense');
    
    return {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      totalEntries: cashflowEntries.length,
      incomeEntries: incomeEntries.length,
      expenseEntries: expenseEntries.length,
      averageIncome: incomeEntries.length > 0 ? totalIncome / incomeEntries.length : 0,
      averageExpense: expenseEntries.length > 0 ? totalExpenses / expenseEntries.length : 0,
      dailyAverages: getDailyAverages(),
      sourceBreakdown: getSourceBreakdown(),
      monthlyTrends: getMonthlyTrends()
    };
  })();

  // Format currency
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  // Format date for display
  function formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  // Format month-year
  function formatMonthYear(monthKey: string): string {
    try {
      const [year, month] = monthKey.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short'
      });
    } catch (error) {
      return monthKey;
    }
  }

  // Get entry type color
  function getTypeColor(type: CashflowType): string {
    return type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }

  // Get source icon
  function getSourceIcon(source: string, type: CashflowType): string {
    if (type === 'income') {
      const icons: Record<string, string> = {
        'Day Pass': '🚶',
        'Warrior Pass': '🥉',
        'Gladiator Pass': '🥈',
        'Alpha Elite Pass': '🥇',
        'Product Sale': '🛒'
      };
      return icons[source] || '💰';
    } else {
      const icons: Record<string, string> = {
        'Rent': '🏢',
        'Utilities': '⚡',
        'Salaries': '👥',
        'Maintenance': '🔧',
        'Equipment': '🏋️',
        'Marketing': '📢',
        'Other': '📝'
      };
      return icons[source] || '💸';
    }
  }

  // Export functionality
  function exportToCsv(): void {
    const headers = ['Date', 'Type', 'Source', 'Amount', 'Notes', 'Customer', 'Payment Method'];
    const csvData = [
      headers.join(','),
      ...cashflowEntries.map(entry => [
        entry.date,
        entry.type,
        entry.source,
        entry.amount,
        `"${(entry.notes || '').replace(/"/g, '""')}"`,
        `"${(entry.customerName || '').replace(/"/g, '""')}"`,
        entry.paymentMethod || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const periodSuffix = periodFilter !== 'all' ? `-${periodFilter}` : '';
    const dateSuffix = startDateFilter && endDateFilter ? `-${startDateFilter}-to-${endDateFilter}` : '';
    
    link.download = `alpha-forge-cashflow${periodSuffix}${dateSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Get unique sources for filter dropdown
  $: uniqueSources = [...new Set(cashflowEntries.map(entry => entry.source))].sort();

  // Simple notification system
  let notification = '';
  let notificationType: 'success' | 'error' | 'info' = 'info';
  
  function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    notification = message;
    notificationType = type;
    setTimeout(() => {
      notification = '';
    }, 3000);
  }

  // Handle sort change
  function handleSort(newSortBy: string): void {
    if (sortBy === newSortBy) {
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      sortBy = newSortBy;
      sortOrder = 'desc';
    }
    loadCashflow();
  }

  // Load more data
  function loadMoreData(): void {
    if (hasMoreData && !isLoadingMore) {
      currentPage += 1;
      loadCashflow(true);
    }
  }
</script>

<svelte:head>
  <title>Cashflow Management - Alpha Forge</title>
</svelte:head>

<!-- Notification -->
{#if notification}
  <div class="fixed top-4 right-4 z-50 max-w-sm">
    <div class="bg-white rounded-lg shadow-lg border-l-4 {
      notificationType === 'success' ? 'border-green-500' :
      notificationType === 'error' ? 'border-red-500' :
      'border-blue-500'
    } p-4">
      <div class="flex">
        <div class="flex-shrink-0 mr-3 mt-0.5">
          <span class="{
            notificationType === 'success' ? 'text-green-600' :
            notificationType === 'error' ? 'text-red-600' :
            'text-blue-600'
          }">
            {notificationType === 'success' ? '✅' : notificationType === 'error' ? '❌' : 'ℹ️'}
          </span>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium text-gray-900">{notification}</p>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="p-6 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">💰 Cashflow Management</h1>
    <p class="text-gray-600">Track all your income and expenses in real-time</p>
  </div>

  <!-- Quick Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
    <!-- Total Income -->
    <div class="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-green-800">Total Income</p>
          <p class="text-2xl font-bold text-green-900">{formatCurrency(stats.totalIncome)}</p>
          <p class="text-xs text-green-700 mt-1">{stats.incomeEntries} transactions</p>
        </div>
        <div class="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
          <span class="text-green-700 text-lg">📈</span>
        </div>
      </div>
    </div>

    <!-- Total Expenses -->
    <div class="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-red-800">Total Expenses</p>
          <p class="text-2xl font-bold text-red-900">{formatCurrency(stats.totalExpenses)}</p>
          <p class="text-xs text-red-700 mt-1">{stats.expenseEntries} transactions</p>
        </div>
        <div class="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
          <span class="text-red-700 text-lg">📉</span>
        </div>
      </div>
    </div>

    <!-- Net Profit -->
    <div class="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-blue-800">Net Profit</p>
          <p class="text-2xl font-bold {stats.netProfit >= 0 ? 'text-blue-900' : 'text-red-900'}">
            {formatCurrency(stats.netProfit)}
          </p>
          <p class="text-xs text-blue-700 mt-1">
            {stats.totalIncome > 0 ? 
              Math.round((stats.netProfit / stats.totalIncome) * 100) : 0}% margin
          </p>
        </div>
        <div class="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
          <span class="text-blue-700 text-lg">{stats.netProfit >= 0 ? '💰' : '⚠️'}</span>
        </div>
      </div>
    </div>

    <!-- Daily Average -->
    <div class="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-purple-800">Daily Average</p>
          <p class="text-2xl font-bold text-purple-900">{formatCurrency(stats.dailyAverages.income)}</p>
          <p class="text-xs text-purple-700 mt-1">Income per day</p>
        </div>
        <div class="w-10 h-10 bg-purple-200 rounded-full flex items-center justify-center">
          <span class="text-purple-700 text-lg">📊</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Period Filter Buttons -->
  <div class="mb-6">
    <div class="bg-white rounded-lg border border-gray-200 p-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">Quick Period Filters</h3>
      <div class="flex flex-wrap gap-2">
        {#each [
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This Week' },
          { value: 'month', label: 'Last 30 Days' },
          { value: 'quarter', label: 'Last 90 Days' },
          { value: 'year', label: 'This Year' },
          { value: 'all', label: 'All Time' }
        ] as period}
          <button
            on:click={() => applyPeriodFilter(period.value)}
            class="px-3 py-1 text-sm rounded-lg border transition-colors {
              periodFilter === period.value 
                ? 'bg-blue-500 text-white border-blue-500' 
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }"
          >
            {period.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Filters Section -->
  <div class="bg-white rounded-lg border border-gray-200 mb-6">
    <div class="p-4 border-b border-gray-200">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium text-gray-900">Filters & Controls</h3>
        <div class="flex items-center gap-3">
          <button
            on:click={() => showFilters = !showFilters}
            class="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button
            on:click={clearFilters}
            class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Clear All
          </button>
          <button
            on:click={exportToCsv}
            disabled={cashflowEntries.length === 0}
            class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            📊 Export CSV
          </button>
        </div>
      </div>
    </div>

    {#if showFilters}
      <div class="p-4 bg-gray-50">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Type Filter -->
          <div>
            <label for="type-filter" class="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              id="type-filter"
              bind:value={typeFilter}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>
          </div>

          <!-- Source Filter -->
          <div>
            <label for="source-filter" class="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              id="source-filter"
              bind:value={sourceFilter}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Sources</option>
              {#each uniqueSources as source}
                <option value={source}>{source}</option>
              {/each}
            </select>
          </div>

          <!-- Date From -->
          <div>
            <label for="start-date-filter" class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              id="start-date-filter"
              type="date"
              bind:value={startDateFilter}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <!-- Date To -->
          <div>
            <label for="end-date-filter" class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              id="end-date-filter"
              type="date"
              bind:value={endDateFilter}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <!-- Amount Min -->
          <div>
            <label for="amount-min-filter" class="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
            <input
              id="amount-min-filter"
              type="number"
              step="0.01"
              bind:value={amountMinFilter}
              on:input={() => loadCashflow()}
              placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <!-- Amount Max -->
          <div>
            <label for="amount-max-filter" class="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
            <input
              id="amount-max-filter"
              type="number"
              step="0.01"
              bind:value={amountMaxFilter}
              on:input={() => loadCashflow()}
              placeholder="No limit"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <!-- Sort Options -->
          <div>
            <label for="sort-by-filter" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              id="sort-by-filter"
              bind:value={sortBy}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="date">Date</option>
              <option value="amount">Amount</option>
              <option value="createdAt">Created</option>
            </select>
          </div>

          <!-- Sort Order -->
          <div>
            <label for="sort-order-filter" class="block text-sm font-medium text-gray-700 mb-1">Order</label>
            <select
              id="sort-order-filter"
              bind:value={sortOrder}
              on:change={() => loadCashflow()}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Monthly Trends -->
  {#if stats.monthlyTrends.length > 0}
    <div class="bg-white rounded-lg border border-gray-200 mb-6 p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">📈 Monthly Trends</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Income</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expenses</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transactions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each stats.monthlyTrends as trend}
              <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 text-sm font-medium text-gray-900">{trend.month}</td>
                <td class="px-6 py-4 text-sm font-semibold text-green-600">{formatCurrency(trend.income)}</td>
                <td class="px-6 py-4 text-sm font-semibold text-red-600">{formatCurrency(trend.expenses)}</td>
                <td class="px-6 py-4 text-sm font-semibold {trend.profit >= 0 ? 'text-blue-600' : 'text-red-600'}">
                  {formatCurrency(trend.profit)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">{trend.count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <!-- Source Breakdown -->
  {#if Object.keys(stats.sourceBreakdown).length > 0}
    <div class="bg-white rounded-lg border border-gray-200 mb-6 p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">🏷️ Source Breakdown</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Object.entries(stats.sourceBreakdown).sort(([,a], [,b]) => b.amount - a.amount) as [source, data]}
          <div class="border border-gray-200 rounded-lg p-4 {
            data.type === 'income' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center">
                <span class="text-lg mr-2">{getSourceIcon(source, data.type)}</span>
                <span class="text-sm font-medium text-gray-900">{source}</span>
              </div>
              <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getTypeColor(data.type)}">
                {data.type}
              </span>
            </div>
            <div class="text-xl font-bold {data.type === 'income' ? 'text-green-600' : 'text-red-600'}">
              {formatCurrency(data.amount)}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              {data.count} transaction{data.count !== 1 ? 's' : ''} • 
              Avg: {formatCurrency(data.amount / data.count)}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Transaction History -->
  <div class="bg-white rounded-lg border border-gray-200">
    <div class="p-4 border-b border-gray-200">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium text-gray-900">📋 Transaction History</h3>
        <div class="text-sm text-gray-600">
          {stats.totalEntries} total transactions
        </div>
      </div>
    </div>

    {#if isLoading}
      <div class="p-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading cashflow data...</p>
      </div>
    {:else if cashflowEntries.length === 0}
      <div class="p-8 text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">💰</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
        <p class="text-gray-500 mb-4">
          {typeFilter !== 'All' || sourceFilter || startDateFilter || endDateFilter || amountMinFilter || amountMaxFilter
            ? 'Try adjusting your filters to see more results.'
            : 'Transactions will appear here as you record memberships, walk-ins, sales, and expenses.'}
        </p>
        {#if typeFilter !== 'All' || sourceFilter || startDateFilter || endDateFilter || amountMinFilter || amountMaxFilter}
          <button
            on:click={clearFilters}
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Clear Filters
          </button>
        {/if}
      </div>
    {:else}
      <!-- Table View -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" 
                  on:click={() => handleSort('date')}
                  role="button"
                  tabindex="0"
                  on:keydown={(e) => e.key === 'Enter' && handleSort('date')}>
                <div class="flex items-center">
                  Date
                  {#if sortBy === 'date'}
                    <span class="ml-1 text-gray-400">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  {/if}
                </div>
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type & Source</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" 
                  on:click={() => handleSort('amount')}
                  role="button"
                  tabindex="0"
                  on:keydown={(e) => e.key === 'Enter' && handleSort('amount')}>
                <div class="flex items-center">
                  Amount
                  {#if sortBy === 'amount'}
                    <span class="ml-1 text-gray-400">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  {/if}
                </div>
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer/Notes</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each cashflowEntries as entry, index}
              <tr class="hover:bg-gray-50 transition-colors {
                index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
              }">
                <td class="px-6 py-4 text-sm text-gray-900">
                  <div class="font-medium">{formatDate(entry.date)}</div>
                  <div class="text-xs text-gray-500">
                    {entry.createdAt.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <span class="text-lg mr-3">{getSourceIcon(entry.source, entry.type)}</span>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getTypeColor(entry.type)}">
                          {entry.type}
                        </span>
                      </div>
                      <div class="text-sm font-medium text-gray-900 mt-1">{entry.source}</div>
                    </div>
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  <div class="text-lg font-bold {
                    entry.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }">
                    {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </div>
                  {#if entry.paymentMethod}
                    <div class="text-xs text-gray-500 mt-1">
                      via {entry.paymentMethod}
                    </div>
                  {/if}
                </td>
                
                <td class="px-6 py-4 text-sm text-gray-600">
                  {#if entry.linkedType}
                    <div class="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full mb-1">
                      🔗 {entry.linkedType}
                    </div>
                  {/if}
                  {#if entry.autoGenerated}
                    <div class="inline-flex items-center px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded-full">
                      ⚡ Auto
                    </div>
                  {/if}
                </td>
                
                <td class="px-6 py-4 text-sm text-gray-600">
                  {#if entry.customerName}
                    <div class="font-medium text-gray-900">{entry.customerName}</div>
                  {/if}
                  {#if entry.notes}
                    <div class="text-sm text-gray-600 mt-1 max-w-xs truncate" title={entry.notes}>
                      {entry.notes}
                    </div>
                  {/if}
                  {#if entry.linkedId}
                    <div class="text-xs text-gray-400 mt-1">
                      ID: {entry.linkedId.slice(-8)}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Load More Button -->
      {#if hasMoreData}
        <div class="p-4 border-t border-gray-200 text-center">
          <button
            on:click={loadMoreData}
            disabled={isLoadingMore}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors inline-flex items-center"
          >
            {#if isLoadingMore}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading...
            {:else}
              Load More Transactions
            {/if}
          </button>
        </div>
      {/if}

      <!-- Summary Footer -->
      <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="text-sm text-gray-600">
            Showing {cashflowEntries.length} transactions
            {#if startDateFilter && endDateFilter}
              from {formatDate(startDateFilter)} to {formatDate(endDateFilter)}
            {:else if periodFilter !== 'all'}
              for {periodFilter}
            {/if}
          </div>
          <div class="text-sm font-medium">
            <span class="text-green-600">Income: {formatCurrency(stats.totalIncome)}</span>
            <span class="mx-2">•</span>
            <span class="text-red-600">Expenses: {formatCurrency(stats.totalExpenses)}</span>
            <span class="mx-2">•</span>
            <span class="{stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
              Net: {formatCurrency(stats.netProfit)}
            </span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Key Insights Panel -->
  <div class="mt-6 bg-white rounded-lg border border-gray-200 p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">💡 Key Insights</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      
      <!-- Profit Margin -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-blue-600 text-lg">📊</span>
          <span class="text-xs font-medium text-blue-800">PROFIT MARGIN</span>
        </div>
        <div class="text-2xl font-bold text-blue-900">
          {stats.totalIncome > 0 ? Math.round((stats.netProfit / stats.totalIncome) * 100) : 0}%
        </div>
        <div class="text-sm text-blue-700 mt-1">
          {stats.netProfit >= 0 ? 'Profitable' : 'Operating at loss'}
        </div>
      </div>

      <!-- Top Income Source -->
      {#if Object.keys(stats.sourceBreakdown).length > 0}
        {@const topIncomeSource = Object.entries(stats.sourceBreakdown)
          .filter(([, data]) => data.type === 'income')
          .sort(([, a], [, b]) => b.amount - a.amount)[0]}
        {#if topIncomeSource}
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-green-600 text-lg">🥇</span>
              <span class="text-xs font-medium text-green-800">TOP INCOME SOURCE</span>
            </div>
            <div class="text-lg font-bold text-green-900">{topIncomeSource[0]}</div>
            <div class="text-sm text-green-700 mt-1">
              {formatCurrency(topIncomeSource[1].amount)} • {topIncomeSource[1].count} transactions
            </div>
          </div>
        {/if}
      {/if}

      <!-- Average Transaction -->
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-yellow-600 text-lg">💰</span>
          <span class="text-xs font-medium text-yellow-800">AVG TRANSACTION</span>
        </div>
        <div class="text-lg font-bold text-yellow-900">
          {formatCurrency(stats.totalEntries > 0 ? (stats.totalIncome + stats.totalExpenses) / stats.totalEntries : 0)}
        </div>
        <div class="text-sm text-yellow-700 mt-1">
          Income: {formatCurrency(stats.averageIncome)} • 
          Expense: {formatCurrency(stats.averageExpense)}
        </div>
      </div>
    </div>

    <!-- Business Health Status -->
    <div class="mt-4 p-4 rounded-lg {
      stats.netProfit >= stats.totalIncome * 0.2 ? 'bg-green-50 border border-green-200' :
      stats.netProfit >= 0 ? 'bg-blue-50 border border-blue-200' :
      'bg-red-50 border border-red-200'
    }">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-medium {
            stats.netProfit >= stats.totalIncome * 0.2 ? 'text-green-800' :
            stats.netProfit >= 0 ? 'text-blue-800' :
            'text-red-800'
          }">
            Business Health Status
          </h4>
          <p class="text-sm {
            stats.netProfit >= stats.totalIncome * 0.2 ? 'text-green-700' :
            stats.netProfit >= 0 ? 'text-blue-700' :
            'text-red-700'
          } mt-1">
            {#if stats.netProfit >= stats.totalIncome * 0.2}
              🟢 Excellent - Strong profit margins above 20%
            {:else if stats.netProfit >= stats.totalIncome * 0.1}
              🟡 Good - Healthy profit margins above 10%
            {:else if stats.netProfit >= 0}
              🟡 Fair - Breaking even with small profits
            {:else}
              🔴 Attention Needed - Operating at a loss
            {/if}
          </p>
        </div>
        <div class="text-2xl">
          {stats.netProfit >= stats.totalIncome * 0.2 ? '🚀' :
           stats.netProfit >= 0 ? '👍' : '⚠️'}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom animations and transitions */
  .transition-colors {
    transition-property: color, background-color, border-color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  /* Hover effects for table rows */
  tbody tr:hover {
    background-color: rgb(249 250 251);
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

  /* Loading animation */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* Subtle gradient backgrounds */
  .bg-gray-25 {
    background-color: rgb(252 252 253);
  }

  /* Focus states */
  input:focus, select:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgb(59 130 246 / 0.5);
  }

  /* Interactive elements */
  [role="button"]:focus {
    outline: 2px solid rgb(59 130 246);
    outline-offset: 2px;
  }

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .overflow-x-auto table {
      min-width: 800px;
    }
  }
</style>