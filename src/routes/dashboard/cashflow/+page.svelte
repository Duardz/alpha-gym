<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
  import type { CashflowEntry, CashflowType, IncomeSource, ExpenseSource } from '$lib/types';

  // State
  let cashflowEntries: CashflowEntry[] = [];
  let isLoading = true;
  let typeFilter: CashflowType | 'All' = 'All';
  let monthFilter = '';
  let sourceFilter = '';

  onMount(() => {
    loadCashflow();
    // Set default month filter to current month
    monthFilter = new Date().toISOString().slice(0, 7);
  });

  // Load cashflow from Firestore
  async function loadCashflow() {
    try {
      isLoading = true;
      const q = query(collection(db, 'cashflow'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      
      cashflowEntries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as CashflowEntry;
      });
    } catch (error) {
      console.error('Error loading cashflow:', error);
      alert('Failed to load cashflow. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  // Format currency
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  // Format date for display
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US');
  }

  // Get entry type color
  function getTypeColor(type: CashflowType) {
    return type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }

  // Get source icon
  function getSourceIcon(source: string, type: CashflowType) {
    if (type === 'income') {
      switch (source) {
        case 'Day Pass': return '🚶';
        case 'Warrior Pass': return '🥉';
        case 'Gladiator Pass': return '🥈';
        case 'Alpha Elite Pass': return '🥇';
        case 'Product Sale': return '🛒';
        default: return '💰';
      }
    } else {
      switch (source) {
        case 'Rent': return '🏢';
        case 'Utilities': return '⚡';
        case 'Salaries': return '👥';
        case 'Maintenance': return '🔧';
        case 'Equipment': return '🏋️';
        case 'Marketing': return '📢';
        case 'Other': return '📝';
        default: return '💸';
      }
    }
  }

  // Filter entries
  $: filteredEntries = cashflowEntries.filter(entry => {
    const matchesType = typeFilter === 'All' || entry.type === typeFilter;
    const matchesMonth = !monthFilter || entry.date.startsWith(monthFilter);
    const matchesSource = !sourceFilter || entry.source.toLowerCase().includes(sourceFilter.toLowerCase());
    return matchesType && matchesMonth && matchesSource;
  });

  // Get statistics
  $: stats = {
    totalIncome: cashflowEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    totalExpenses: cashflowEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    netProfit: 0,
    monthlyIncome: filteredEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    monthlyExpenses: filteredEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    monthlyProfit: 0,
    entryCount: filteredEntries.length,
    incomeEntryCount: filteredEntries.filter(e => e.type === 'income').length,
    expenseEntryCount: filteredEntries.filter(e => e.type === 'expense').length
  };

  $: stats.netProfit = stats.totalIncome - stats.totalExpenses;
  $: stats.monthlyProfit = stats.monthlyIncome - stats.monthlyExpenses;

  // Get unique sources for filter dropdown
  $: uniqueSources = [...new Set(cashflowEntries.map(entry => entry.source))].sort();

  // Export data functionality
  function exportToCsv() {
    const headers = ['Date', 'Type', 'Source', 'Amount', 'Notes'];
    const csvData = [
      headers.join(','),
      ...filteredEntries.map(entry => [
        entry.date,
        entry.type,
        entry.source,
        entry.amount,
        `"${(entry.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cashflow-${monthFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Get cash flow trends for the last 6 months
  function getCashflowTrends() {
    const trends = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthKey = monthDate.toISOString().slice(0, 7);
      
      const monthEntries = cashflowEntries.filter(entry => 
        entry.date >= monthKey + '-01' && entry.date < nextMonthDate.toISOString().slice(0, 7) + '-01'
      );
      
      const income = monthEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
      const expenses = monthEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
      
      trends.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income,
        expenses,
        profit: income - expenses,
        entries: monthEntries.length
      });
    }
    
    return trends;
  }

  $: cashflowTrends = getCashflowTrends();
</script>

<svelte:head>
  <title>Cashflow Overview - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Info Banner -->
  <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
    <div class="flex items-start">
      <div class="flex-shrink-0">
        <svg class="h-5 w-5 text-blue-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="ml-3">
        <h3 class="text-sm font-medium text-blue-800">Cashflow Overview</h3>
        <p class="text-sm text-blue-700 mt-1">
          This page shows all financial transactions automatically recorded from memberships, walk-ins, store sales, and expenses. 
          Data is updated automatically when you record transactions in other sections.
        </p>
      </div>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-xl">💰</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Income</p>
          <p class="text-2xl font-bold text-green-600">{formatCurrency(stats.totalIncome)}</p>
          <p class="text-xs text-green-500">{stats.incomeEntryCount} transactions</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
          <span class="text-red-600 text-xl">💸</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Expenses</p>
          <p class="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpenses)}</p>
          <p class="text-xs text-red-500">{stats.expenseEntryCount} transactions</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-xl">📊</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Net Profit</p>
          <p class="text-2xl font-bold {stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
            {formatCurrency(stats.netProfit)}
          </p>
          <p class="text-xs {stats.netProfit >= 0 ? 'text-blue-500' : 'text-red-500'}">All time</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
          <span class="text-purple-600 text-xl">📈</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Monthly Profit</p>
          <p class="text-2xl font-bold {stats.monthlyProfit >= 0 ? 'text-purple-600' : 'text-red-600'}">
            {formatCurrency(stats.monthlyProfit)}
          </p>
          <p class="text-xs {stats.monthlyProfit >= 0 ? 'text-purple-500' : 'text-red-500'}">Filtered period</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Monthly Summary -->
  {#if monthFilter}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">
        Monthly Summary - {new Date(monthFilter + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="text-center p-4 bg-green-50 rounded-lg">
          <div class="text-2xl font-bold text-green-600">{formatCurrency(stats.monthlyIncome)}</div>
          <div class="text-sm text-green-800">Income</div>
          <div class="text-xs text-green-600 mt-1">{stats.incomeEntryCount} transactions</div>
        </div>
        <div class="text-center p-4 bg-red-50 rounded-lg">
          <div class="text-2xl font-bold text-red-600">{formatCurrency(stats.monthlyExpenses)}</div>
          <div class="text-sm text-red-800">Expenses</div>
          <div class="text-xs text-red-600 mt-1">{stats.expenseEntryCount} transactions</div>
        </div>
        <div class="text-center p-4 {stats.monthlyProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg">
          <div class="text-2xl font-bold {stats.monthlyProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
            {formatCurrency(stats.monthlyProfit)}
          </div>
          <div class="text-sm {stats.monthlyProfit >= 0 ? 'text-blue-800' : 'text-red-800'}">Net Profit</div>
          <div class="text-xs {stats.monthlyProfit >= 0 ? 'text-blue-600' : 'text-red-600'} mt-1">
            {stats.entryCount} total transactions
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- 6-Month Trends -->
  {#if cashflowTrends.length > 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">6-Month Cashflow Trends</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-2 px-3 text-sm font-medium text-gray-600">Month</th>
              <th class="text-right py-2 px-3 text-sm font-medium text-gray-600">Income</th>
              <th class="text-right py-2 px-3 text-sm font-medium text-gray-600">Expenses</th>
              <th class="text-right py-2 px-3 text-sm font-medium text-gray-600">Profit</th>
              <th class="text-center py-2 px-3 text-sm font-medium text-gray-600">Transactions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each cashflowTrends as trend}
              <tr class="hover:bg-gray-50">
                <td class="py-3 px-3 text-sm font-medium text-gray-900">{trend.month}</td>
                <td class="py-3 px-3 text-sm text-right text-green-600 font-medium">{formatCurrency(trend.income)}</td>
                <td class="py-3 px-3 text-sm text-right text-red-600 font-medium">{formatCurrency(trend.expenses)}</td>
                <td class="py-3 px-3 text-sm text-right font-medium {trend.profit >= 0 ? 'text-blue-600' : 'text-red-600'}">
                  {formatCurrency(trend.profit)}
                </td>
                <td class="py-3 px-3 text-sm text-center text-gray-500">{trend.entries}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <!-- Filters and Export -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Transaction History</h2>
      <button
        on:click={exportToCsv}
        disabled={filteredEntries.length === 0}
        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">📊</span> Export to CSV
      </button>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <div>
        <select
          bind:value={typeFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="All">All Types</option>
          <option value="income">Income Only</option>
          <option value="expense">Expenses Only</option>
        </select>
      </div>
      <div>
        <input
          type="month"
          bind:value={monthFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <select
          bind:value={sourceFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Sources</option>
          {#each uniqueSources as source}
            <option value={source}>{source}</option>
          {/each}
        </select>
      </div>
      {#if typeFilter !== 'All' || monthFilter || sourceFilter}
        <button
          on:click={() => { typeFilter = 'All'; monthFilter = ''; sourceFilter = ''; }}
          class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
        >
          Clear Filters
        </button>
      {/if}
    </div>
  </div>

  <!-- Cashflow List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading cashflow data...</p>
      </div>
    </div>
  {:else if filteredEntries.length === 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">💰</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {cashflowEntries.length === 0 ? 'No cashflow entries yet' : 'No entries found'}
        </h3>
        <p class="text-gray-500 mb-6">
          {cashflowEntries.length === 0 
            ? 'Cashflow entries will appear automatically when you record memberships, walk-ins, store sales, and expenses.' 
            : 'Try adjusting your filters to see more results.'}
        </p>
      </div>
    </div>
  {:else}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredEntries as entry}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4 text-sm text-gray-900">
                  {formatDate(entry.date)}
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <span class="text-lg mr-2">{getSourceIcon(entry.source, entry.type)}</span>
                    <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getTypeColor(entry.type)}">
                      {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  <div class="font-medium">{entry.source}</div>
                  {#if entry.linkedId}
                    <div class="text-xs text-gray-500">Linked: {entry.linkedId.slice(-8)}</div>
                  {/if}
                </td>
                <td class="px-6 py-4 text-sm font-bold {entry.type === 'income' ? 'text-green-600' : 'text-red-600'}">
                  {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  {entry.notes || '-'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
      <!-- Show total for filtered results -->
      {#if filteredEntries.length > 0}
        <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div class="flex justify-between text-sm">
            <span class="text-gray-600">
              Showing {filteredEntries.length} of {cashflowEntries.length} transactions
            </span>
            <span class="text-gray-900 font-medium">
              Net: <span class="{stats.monthlyProfit >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
                {formatCurrency(stats.monthlyProfit)}
              </span>
            </span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>