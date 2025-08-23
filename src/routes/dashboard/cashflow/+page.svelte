<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
  import type { CashflowEntry, CashflowType, IncomeSource, ExpenseSource } from '$lib/types';

  // State
  let cashflowEntries: CashflowEntry[] = [];
  let isLoading = true;
  let showAddForm = false;
  let editingEntry: CashflowEntry | null = null;
  let typeFilter: CashflowType | 'All' = 'All';
  let monthFilter = '';

  // Form data
  let formData = {
    type: 'income' as CashflowType,
    source: '',
    amount: 0,
    date: '',
    notes: ''
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Income sources
  const incomeSources: IncomeSource[] = ['Day Pass', 'Warrior Pass', 'Gladiator Pass', 'Alpha Elite Pass', 'Product Sale'];
  
  // Expense sources  
  const expenseSources: ExpenseSource[] = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Equipment', 'Marketing', 'Other'];

  onMount(() => {
    loadCashflow();
    // Set default date to today
    formData.date = new Date().toISOString().split('T')[0];
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

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.source.trim()) {
      errors.source = 'Source is required';
    }

    if (!formData.amount || formData.amount <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }

    if (!formData.date) {
      errors.date = 'Date is required';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new entry
  async function addEntry() {
    if (!validateForm()) return;

    try {
      const entryData = {
        type: formData.type,
        source: formData.source.trim(),
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'cashflow'), entryData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadCashflow();
      
      alert('Entry added successfully!');
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry. Please try again.');
    }
  }

  // Edit entry
  function editEntry(entry: CashflowEntry) {
    editingEntry = entry;
    formData = {
      type: entry.type,
      source: entry.source,
      amount: entry.amount,
      date: entry.date,
      notes: entry.notes || ''
    };
    showAddForm = true;
  }

  // Update entry
  async function updateEntry() {
    if (!validateForm() || !editingEntry) return;

    try {
      const entryData = {
        type: formData.type,
        source: formData.source.trim(),
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'cashflow', editingEntry.id), entryData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingEntry = null;
      await loadCashflow();
      
      alert('Entry updated successfully!');
    } catch (error) {
      console.error('Error updating entry:', error);
      alert('Failed to update entry. Please try again.');
    }
  }

  // Delete entry
  async function deleteEntry(entry: CashflowEntry) {
    if (!confirm(`Are you sure you want to delete this ${entry.type} entry?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'cashflow', entry.id));
      await loadCashflow();
      alert('Entry deleted successfully!');
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      type: 'income',
      source: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
    errors = {};
    editingEntry = null;
  }

  // Cancel form
  function cancelForm() {
    resetForm();
    showAddForm = false;
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

  // Filter entries
  $: filteredEntries = cashflowEntries.filter(entry => {
    const matchesType = typeFilter === 'All' || entry.type === typeFilter;
    const matchesMonth = !monthFilter || entry.date.startsWith(monthFilter);
    return matchesType && matchesMonth;
  });

  // Get statistics
  $: stats = {
    totalIncome: cashflowEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    totalExpenses: cashflowEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    netProfit: 0,
    monthlyIncome: filteredEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    monthlyExpenses: filteredEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    monthlyProfit: 0
  };

  $: stats.netProfit = stats.totalIncome - stats.totalExpenses;
  $: stats.monthlyProfit = stats.monthlyIncome - stats.monthlyExpenses;

  // Update source options when type changes
  $: sourceOptions = formData.type === 'income' ? incomeSources : expenseSources;
</script>

<svelte:head>
  <title>Cashflow Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
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
        </div>
        <div class="text-center p-4 bg-red-50 rounded-lg">
          <div class="text-2xl font-bold text-red-600">{formatCurrency(stats.monthlyExpenses)}</div>
          <div class="text-sm text-red-800">Expenses</div>
        </div>
        <div class="text-center p-4 {stats.monthlyProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg">
          <div class="text-2xl font-bold {stats.monthlyProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">
            {formatCurrency(stats.monthlyProfit)}
          </div>
          <div class="text-sm {stats.monthlyProfit >= 0 ? 'text-blue-800' : 'text-red-800'}">Net Profit</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Actions and Filters -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Cashflow Management</h2>
      <button
        on:click={() => { resetForm(); showAddForm = true; }}
        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">+</span> Add Entry
      </button>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <div>
        <select
          bind:value={typeFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
      </div>
    </div>
  </div>

  <!-- Add/Edit Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingEntry ? 'Edit Entry' : 'Add New Entry'}
            </h2>
            <button
              on:click={cancelForm}
              class="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <form on:submit|preventDefault={editingEntry ? updateEntry : addEntry} class="space-y-4">
            <!-- Type -->
            <div>
              <label for="type" class="block text-sm font-medium text-gray-700 mb-2">
                Type *
              </label>
              <select
                id="type"
                bind:value={formData.type}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>

            <!-- Source -->
            <div>
              <label for="source" class="block text-sm font-medium text-gray-700 mb-2">
                Source *
              </label>
              <select
                id="source"
                bind:value={formData.source}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 {errors.source ? 'border-red-500' : ''}"
              >
                <option value="">Select source...</option>
                {#each sourceOptions as source}
                  <option value={source}>{source}</option>
                {/each}
              </select>
              {#if errors.source}
                <p class="text-red-600 text-sm mt-1">{errors.source}</p>
              {/if}
            </div>

            <!-- Amount -->
            <div>
              <label for="amount" class="block text-sm font-medium text-gray-700 mb-2">
                Amount (PHP) *
              </label>
              <input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                bind:value={formData.amount}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 {errors.amount ? 'border-red-500' : ''}"
                placeholder="0.00"
              />
              {#if errors.amount}
                <p class="text-red-600 text-sm mt-1">{errors.amount}</p>
              {/if}
            </div>

            <!-- Date -->
            <div>
              <label for="date" class="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                id="date"
                type="date"
                bind:value={formData.date}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 {errors.date ? 'border-red-500' : ''}"
              />
              {#if errors.date}
                <p class="text-red-600 text-sm mt-1">{errors.date}</p>
              {/if}
            </div>

            <!-- Notes -->
            <div>
              <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                id="notes"
                bind:value={formData.notes}
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Optional notes..."
              ></textarea>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                class="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200 font-medium"
              >
                {editingEntry ? 'Update Entry' : 'Add Entry'}
              </button>
              <button
                type="button"
                on:click={cancelForm}
                class="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200 font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <!-- Cashflow List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <p class="mt-4 text-gray-600">Loading cashflow...</p>
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
          {cashflowEntries.length === 0 ? 'Add your first income or expense entry!' : 'Try adjusting your filters.'}
        </p>
        {#if cashflowEntries.length === 0}
          <button
            on:click={() => { resetForm(); showAddForm = true; }}
            class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
          >
            Add First Entry
          </button>
        {/if}
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredEntries as entry}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4 text-sm text-gray-900">
                  {formatDate(entry.date)}
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getTypeColor(entry.type)}">
                    {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  {entry.source}
                </td>
                <td class="px-6 py-4 text-sm font-medium {entry.type === 'income' ? 'text-green-600' : 'text-red-600'}">
                  {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  {entry.notes || '-'}
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editEntry(entry)}
                      class="text-green-600 hover:text-green-900 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteEntry(entry)}
                      class="text-red-600 hover:text-red-900 transition-colors duration-150"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>