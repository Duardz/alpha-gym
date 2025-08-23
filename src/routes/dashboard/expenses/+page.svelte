<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
  import type { ExpenseSource } from '$lib/types';

  interface Expense {
    id: string;
    source: ExpenseSource;
    amount: number;
    date: string;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
  }

  // State
  let expenses: Expense[] = [];
  let isLoading = true;
  let showAddForm = false;
  let editingExpense: Expense | null = null;
  let sourceFilter: ExpenseSource | 'All' = 'All';
  let monthFilter = '';

  // Form data
  let formData = {
    source: '' as ExpenseSource,
    amount: 0,
    date: '',
    notes: ''
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Expense sources with descriptions
  const expenseCategories = [
    { value: 'Rent' as ExpenseSource, label: 'Rent', description: 'Monthly facility rent', icon: '🏢' },
    { value: 'Utilities' as ExpenseSource, label: 'Utilities', description: 'Electricity, water, internet', icon: '⚡' },
    { value: 'Salaries' as ExpenseSource, label: 'Salaries', description: 'Staff wages and benefits', icon: '👥' },
    { value: 'Maintenance' as ExpenseSource, label: 'Maintenance', description: 'Equipment and facility maintenance', icon: '🔧' },
    { value: 'Equipment' as ExpenseSource, label: 'Equipment', description: 'New gym equipment purchases', icon: '🏋️' },
    { value: 'Marketing' as ExpenseSource, label: 'Marketing', description: 'Advertising and promotions', icon: '📢' },
    { value: 'Other' as ExpenseSource, label: 'Other', description: 'Miscellaneous expenses', icon: '📝' }
  ];

  onMount(() => {
    loadExpenses();
    // Set default date to today
    formData.date = new Date().toISOString().split('T')[0];
    // Set default month filter to current month
    monthFilter = new Date().toISOString().slice(0, 7);
  });

  // Load expenses from Firestore
  async function loadExpenses() {
    try {
      isLoading = true;
      const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      
      expenses = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as Expense;
      });
    } catch (error) {
      console.error('Error loading expenses:', error);
      alert('Failed to load expenses. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.source) {
      errors.source = 'Expense category is required';
    }

    if (!formData.amount || formData.amount <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }

    if (!formData.date) {
      errors.date = 'Date is required';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new expense
  async function addExpense() {
    if (!validateForm()) return;

    try {
      const expenseData = {
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'expenses'), expenseData);

      // Also add to cashflow
      await addCashflowEntry({
        type: 'expense',
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim() || `${formData.source} expense`
      });
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadExpenses();
      
      alert('Expense added successfully!');
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense. Please try again.');
    }
  }

  // Auto-create cashflow entry for expense
  async function addCashflowEntry(cashflowData: any) {
    try {
      await addDoc(collection(db, 'cashflow'), {
        ...cashflowData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating cashflow entry:', error);
      // Don't fail the expense creation if cashflow fails
    }
  }

  // Edit expense
  function editExpense(expense: Expense) {
    editingExpense = expense;
    formData = {
      source: expense.source,
      amount: expense.amount,
      date: expense.date,
      notes: expense.notes || ''
    };
    showAddForm = true;
  }

  // Update expense
  async function updateExpense() {
    if (!validateForm() || !editingExpense) return;

    try {
      const expenseData = {
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'expenses', editingExpense.id), expenseData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingExpense = null;
      await loadExpenses();
      
      alert('Expense updated successfully!');
    } catch (error) {
      console.error('Error updating expense:', error);
      alert('Failed to update expense. Please try again.');
    }
  }

  // Delete expense
  async function deleteExpense(expense: Expense) {
    if (!confirm(`Are you sure you want to delete this ${expense.source} expense?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'expenses', expense.id));
      await loadExpenses();
      alert('Expense deleted successfully!');
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense. Please try again.');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      source: '' as ExpenseSource,
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
    errors = {};
    editingExpense = null;
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

  // Get category info
  function getCategoryInfo(source: ExpenseSource) {
    return expenseCategories.find(cat => cat.value === source) || expenseCategories[6];
  }

  // Filter expenses
  $: filteredExpenses = expenses.filter(expense => {
    const matchesSource = sourceFilter === 'All' || expense.source === sourceFilter;
    const matchesMonth = !monthFilter || expense.date.startsWith(monthFilter);
    return matchesSource && matchesMonth;
  });

  // Get statistics
  $: stats = {
    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    monthlyExpenses: filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    averageExpense: expenses.length > 0 ? expenses.reduce((sum, e) => sum + e.amount, 0) / expenses.length : 0,
    byCategory: expenseCategories.reduce((acc, cat) => {
      acc[cat.value] = expenses.filter(e => e.source === cat.value).reduce((sum, e) => sum + e.amount, 0);
      return acc;
    }, {} as Record<ExpenseSource, number>)
  };

  // Get top expense categories
  $: topCategories = Object.entries(stats.byCategory)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([source, amount]) => ({
      source: source as ExpenseSource,
      amount,
      info: getCategoryInfo(source as ExpenseSource)
    }));
</script>

<svelte:head>
  <title>Expenses Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
          <p class="text-sm font-medium text-gray-600">Monthly Expenses</p>
          <p class="text-2xl font-bold text-blue-600">{formatCurrency(stats.monthlyExpenses)}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-xl">💰</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Average Expense</p>
          <p class="text-2xl font-bold text-yellow-600">{formatCurrency(stats.averageExpense)}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
          <span class="text-purple-600 text-xl">📝</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Entries</p>
          <p class="text-2xl font-bold text-purple-600">{expenses.length}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Top Categories -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Top Expense Categories</h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {#each topCategories as category}
        <div class="flex items-center p-4 bg-gray-50 rounded-lg">
          <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span class="text-red-600 text-lg">{category.info.icon}</span>
          </div>
          <div class="ml-4 flex-1">
            <div class="text-sm font-medium text-gray-900">{category.info.label}</div>
            <div class="text-xs text-gray-500">{category.info.description}</div>
          </div>
          <div class="text-sm font-bold text-red-600">
            {formatCurrency(category.amount)}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Actions and Filters -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Expense Management</h2>
      <button
        on:click={() => { resetForm(); showAddForm = true; }}
        class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">+</span> Add Expense
      </button>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <div>
        <select
          bind:value={sourceFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        >
          <option value="All">All Categories</option>
          {#each expenseCategories as category}
            <option value={category.value}>{category.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <input
          type="month"
          bind:value={monthFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
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

          <form on:submit|preventDefault={editingExpense ? updateExpense : addExpense} class="space-y-4">
            <!-- Category -->
            <div>
              <label for="source" class="block text-sm font-medium text-gray-700 mb-2">
                Expense Category *
              </label>
              <select
                id="source"
                bind:value={formData.source}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 {errors.source ? 'border-red-500' : ''}"
              >
                <option value="">Select category...</option>
                {#each expenseCategories as category}
                  <option value={category.value}>{category.icon} {category.label}</option>
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
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 {errors.amount ? 'border-red-500' : ''}"
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
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 {errors.date ? 'border-red-500' : ''}"
              />
              {#if errors.date}
                <p class="text-red-600 text-sm mt-1">{errors.date}</p>
              {/if}
            </div>

            <!-- Notes -->
            <div>
              <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">
                Notes / Description
              </label>
              <textarea
                id="notes"
                bind:value={formData.notes}
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Optional expense description..."
              ></textarea>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                class="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200 font-medium"
              >
                {editingExpense ? 'Update Expense' : 'Add Expense'}
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

  <!-- Expenses List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        <p class="mt-4 text-gray-600">Loading expenses...</p>
      </div>
    </div>
  {:else if filteredExpenses.length === 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">💸</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses found'}
        </h3>
        <p class="text-gray-500 mb-6">
          {expenses.length === 0 ? 'Add your first expense to track spending!' : 'Try adjusting your filters.'}
        </p>
        {#if expenses.length === 0}
          <button
            on:click={() => { resetForm(); showAddForm = true; }}
            class="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200"
          >
            Add First Expense
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredExpenses as expense}
              {@const categoryInfo = getCategoryInfo(expense.source)}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-red-600 text-lg">{categoryInfo.icon}</span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{categoryInfo.label}</div>
                      <div class="text-sm text-gray-500">{categoryInfo.description}</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  {formatDate(expense.date)}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-red-600">
                  {formatCurrency(expense.amount)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  {expense.notes || '-'}
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editExpense(expense)}
                      class="text-red-600 hover:text-red-900 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteExpense(expense)}
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