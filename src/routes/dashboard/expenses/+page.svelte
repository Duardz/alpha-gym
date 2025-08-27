<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, writeBatch } from 'firebase/firestore';
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
  let isProcessing = false;
  let showAddForm = false;
  let editingExpense: Expense | null = null;
  let sourceFilter: ExpenseSource | 'All' = 'All';
  let monthFilter = '';
  let searchTerm = '';

  // Form data
  let formData = {
    source: '' as ExpenseSource,
    amount: 0,
    date: '',
    notes: ''
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Notification system
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }> = [];
  let notificationId = 0;

  // Expense sources with descriptions and icons
  const expenseCategories = [
    { value: 'Rent' as ExpenseSource, label: 'Rent', description: 'Monthly facility rent', icon: '🏢', color: 'bg-blue-100 text-blue-800' },
    { value: 'Utilities' as ExpenseSource, label: 'Utilities', description: 'Electricity, water, internet', icon: '⚡', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'Salaries' as ExpenseSource, label: 'Salaries', description: 'Staff wages and benefits', icon: '👥', color: 'bg-green-100 text-green-800' },
    { value: 'Maintenance' as ExpenseSource, label: 'Maintenance', description: 'Equipment and facility maintenance', icon: '🔧', color: 'bg-orange-100 text-orange-800' },
    { value: 'Equipment' as ExpenseSource, label: 'Equipment', description: 'New gym equipment purchases', icon: '🏋️', color: 'bg-purple-100 text-purple-800' },
    { value: 'Marketing' as ExpenseSource, label: 'Marketing', description: 'Advertising and promotions', icon: '📢', color: 'bg-pink-100 text-pink-800' },
    { value: 'Other' as ExpenseSource, label: 'Other', description: 'Miscellaneous expenses', icon: '📝', color: 'bg-gray-100 text-gray-800' }
  ];

  // Quick amount presets
  const quickAmounts = [
    { amount: 500, label: '₱500 - Small expense', icon: '💵' },
    { amount: 1000, label: '₱1,000 - Regular bill', icon: '💴' },
    { amount: 5000, label: '₱5,000 - Equipment', icon: '🏋️' },
    { amount: 10000, label: '₱10,000 - Major expense', icon: '💰' }
  ];

  onMount(() => {
    loadExpenses();
    initializeForm();
  });

  function initializeForm() {
    const today = new Date().toISOString().split('T')[0];
    formData.date = today;
    monthFilter = new Date().toISOString().slice(0, 7);
  }

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
      showNotification('Failed to load expenses. Please check your permissions.', 'error');
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

    if (formData.amount > 100000) {
      errors.amount = 'Amount seems too high. Please verify.';
    }

    if (!formData.date) {
      errors.date = 'Date is required';
    }

    const selectedDate = new Date(formData.date);
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    if (selectedDate > today) {
      errors.date = 'Date cannot be in the future';
    }

    if (selectedDate < sixMonthsAgo) {
      errors.date = 'Date cannot be more than 6 months ago';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new expense with proper cashflow linking
  async function addExpense() {
    if (!validateForm()) return;

    try {
      isProcessing = true;
      const batch = writeBatch(db);

      // Create expense record
      const expenseRef = doc(collection(db, 'expenses'));
      const expenseData = {
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      batch.set(expenseRef, expenseData);

      // Create linked cashflow entry
      const cashflowRef = doc(collection(db, 'cashflow'));
      batch.set(cashflowRef, {
        type: 'expense',
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim() || `${formData.source} expense`,
        linkedId: expenseRef.id,
        linkedType: 'expense',
        autoGenerated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadExpenses();
      
      showNotification(`Expense of ${formatCurrency(formData.amount)} added successfully!`, 'success');
    } catch (error) {
      console.error('Error adding expense:', error);
      showNotification('Failed to add expense. Please try again.', 'error');
    } finally {
      isProcessing = false;
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

  // Update expense with cashflow sync
  async function updateExpense() {
    if (!validateForm() || !editingExpense) return;

    try {
      isProcessing = true;
      const batch = writeBatch(db);
      
      const expenseData = {
        source: formData.source,
        amount: formData.amount,
        date: formData.date,
        notes: formData.notes.trim(),
        updatedAt: serverTimestamp()
      };

      // Update expense
      batch.update(doc(db, 'expenses', editingExpense.id), expenseData);

      // Find and update linked cashflow entry
      const cashflowQuery = query(
        collection(db, 'cashflow'),
        where('linkedId', '==', editingExpense.id),
        where('type', '==', 'expense')
      );
      
      const cashflowSnapshot = await getDocs(cashflowQuery);
      
      // Update existing linked cashflow entries
      cashflowSnapshot.docs.forEach(cashflowDoc => {
        batch.update(doc(db, 'cashflow', cashflowDoc.id), {
          source: formData.source,
          amount: formData.amount,
          date: formData.date,
          notes: formData.notes.trim() || `${formData.source} expense`,
          updatedAt: serverTimestamp()
        });
      });

      // If no linked cashflow entry exists, create one
      if (cashflowSnapshot.empty) {
        const cashflowRef = doc(collection(db, 'cashflow'));
        batch.set(cashflowRef, {
          type: 'expense',
          source: formData.source,
          amount: formData.amount,
          date: formData.date,
          notes: formData.notes.trim() || `${formData.source} expense`,
          linkedId: editingExpense.id,
          linkedType: 'expense',
          autoGenerated: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingExpense = null;
      await loadExpenses();
      
      showNotification('Expense updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating expense:', error);
      showNotification('Failed to update expense. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // ENHANCED DELETE FUNCTION WITH CASHFLOW CLEANUP
  async function deleteExpense(expense: Expense) {
    if (!confirm(`Are you sure you want to delete this ${expense.source} expense?\n\nAmount: ${formatCurrency(expense.amount)}\nDate: ${formatDate(expense.date)}\n\nThis will also remove the associated cashflow entry and update all reports.\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      isProcessing = true;
      showNotification(`Deleting ${expense.source} expense and cleaning up cashflow...`, 'info');
      
      const batch = writeBatch(db);
      
      // 1. Delete the expense record
      batch.delete(doc(db, 'expenses', expense.id));
      
      // 2. Find and delete all related cashflow entries
      console.log(`Looking for cashflow entries linked to expense ${expense.id}...`);
      
      // Search for cashflow entries linked to this expense
      const cashflowQuery = query(
        collection(db, 'cashflow'),
        where('linkedId', '==', expense.id),
        where('type', '==', 'expense')
      );
      
      const cashflowSnapshot = await getDocs(cashflowQuery);
      let deletedCashflowCount = 0;
      
      // Delete all linked cashflow entries
      cashflowSnapshot.docs.forEach(cashflowDoc => {
        console.log(`Found linked cashflow entry: ${cashflowDoc.id}`);
        batch.delete(doc(db, 'cashflow', cashflowDoc.id));
        deletedCashflowCount++;
      });
      
      // 3. Also search for cashflow entries that might match this expense by amount, date, and source
      // (for older entries that might not have linkedId)
      if (deletedCashflowCount === 0) {
        const fallbackCashflowQuery = query(
          collection(db, 'cashflow'),
          where('type', '==', 'expense'),
          where('source', '==', expense.source),
          where('amount', '==', expense.amount),
          where('date', '==', expense.date)
        );
        
        const fallbackCashflowSnapshot = await getDocs(fallbackCashflowQuery);
        
        // Delete matching unlinked entries (take only the first one to avoid deleting duplicates)
        if (fallbackCashflowSnapshot.docs.length > 0) {
          const cashflowDoc = fallbackCashflowSnapshot.docs[0];
          console.log(`Found unlinked matching cashflow entry: ${cashflowDoc.id}`);
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          deletedCashflowCount++;
        }
      }
      
      // Execute all deletions
      await batch.commit();
      
      // Reload expenses list
      await loadExpenses();
      
      showNotification(
        `${expense.source} expense deleted successfully! ${deletedCashflowCount > 0 ? `Cleaned up ${deletedCashflowCount} cashflow ${deletedCashflowCount === 1 ? 'entry' : 'entries'}.` : 'No cashflow entries found to clean up.'}`, 
        'success'
      );
      
    } catch (error) {
      console.error('Error deleting expense:', error);
      showNotification('Failed to delete expense. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Bulk cleanup function for orphaned cashflow entries
  async function cleanupOrphanedCashflowEntries() {
    if (!confirm('This will clean up expense-related cashflow entries that no longer have corresponding expense records. This action cannot be undone. Continue?')) {
      return;
    }

    try {
      isProcessing = true;
      showNotification('Starting cleanup of orphaned expense cashflow entries...', 'info');
      
      // Get all expenses and expense-related cashflow entries
      const [expensesSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(collection(db, 'expenses')),
        getDocs(query(
          collection(db, 'cashflow'), 
          where('type', '==', 'expense')
        ))
      ]);

      // Create a Set of valid expense IDs
      const validExpenseIds = new Set(expensesSnapshot.docs.map(doc => doc.id));
      
      const batch = writeBatch(db);
      let orphanedCount = 0;
      let linkedCount = 0;

      // Check each expense cashflow entry
      for (const cashflowDoc of cashflowSnapshot.docs) {
        const cashflowData = cashflowDoc.data();
        
        // Check if it has a linkedId and if that expense still exists
        if (cashflowData.linkedId && !validExpenseIds.has(cashflowData.linkedId)) {
          console.log(`Found orphaned expense cashflow entry: ${cashflowDoc.id} -> expense ${cashflowData.linkedId}`);
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          orphanedCount++;
        } else if (!cashflowData.linkedId) {
          // Try to link unlinked entries to existing expenses
          const matchingExpense = expensesSnapshot.docs.find(expenseDoc => {
            const expenseData = expenseDoc.data();
            return expenseData.source === cashflowData.source && 
                   expenseData.amount === cashflowData.amount &&
                   expenseData.date === cashflowData.date;
          });
          
          if (matchingExpense) {
            // Link the cashflow entry to the expense
            batch.update(doc(db, 'cashflow', cashflowDoc.id), {
              linkedId: matchingExpense.id,
              linkedType: 'expense',
              autoGenerated: true,
              updatedAt: serverTimestamp()
            });
            linkedCount++;
          }
          // Note: We don't delete unlinked entries that don't match, as they might be manually created
        }
      }

      if (orphanedCount > 0 || linkedCount > 0) {
        await batch.commit();
        showNotification(`Cleanup completed! Deleted ${orphanedCount} orphaned entries, linked ${linkedCount} entries.`, 'success');
      } else {
        showNotification('All expense cashflow entries are properly managed. No cleanup needed.', 'info');
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      showNotification('Error during cleanup. Please check console for details.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Quick add with preset amount
  function quickAdd(amount: number, source?: ExpenseSource) {
    formData = {
      source: source || '' as ExpenseSource,
      amount: amount,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
    showAddForm = true;
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

  // Export functionality
  function exportData() {
    const csvData = [
      ['Category', 'Amount', 'Date', 'Notes', 'Created'].join(','),
      ...filteredExpenses.map(expense => [
        expense.source,
        expense.amount,
        expense.date,
        `"${(expense.notes || '').replace(/"/g, '""')}"`,
        formatDate(expense.createdAt)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const periodSuffix = monthFilter ? `-${monthFilter}` : '';
    link.download = `alpha-forge-expenses${periodSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Format currency
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  // Format date for display
  function formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Get category info
  function getCategoryInfo(source: ExpenseSource) {
    return expenseCategories.find(cat => cat.value === source) || expenseCategories[6];
  }

  // Notification functions
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

  // Filter expenses
  $: filteredExpenses = expenses.filter(expense => {
    const matchesSource = sourceFilter === 'All' || expense.source === sourceFilter;
    const matchesMonth = !monthFilter || expense.date.startsWith(monthFilter);
    const matchesSearch = !searchTerm || 
      expense.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.notes.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSource && matchesMonth && matchesSearch;
  });

  // Get statistics
  $: stats = {
    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    filteredTotal: filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    averageExpense: expenses.length > 0 ? expenses.reduce((sum, e) => sum + e.amount, 0) / expenses.length : 0,
    thisMonthTotal: expenses.filter(e => e.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((sum, e) => sum + e.amount, 0),
    byCategory: expenseCategories.reduce((acc, cat) => {
      acc[cat.value] = {
        amount: expenses.filter(e => e.source === cat.value).reduce((sum, e) => sum + e.amount, 0),
        count: expenses.filter(e => e.source === cat.value).length
      };
      return acc;
    }, {} as Record<ExpenseSource, { amount: number; count: number }>)
  };

  // Get top expense categories
  $: topCategories = Object.entries(stats.byCategory)
    .sort(([,a], [,b]) => b.amount - a.amount)
    .slice(0, 3)
    .map(([source, data]) => ({
      source: source as ExpenseSource,
      ...data,
      info: getCategoryInfo(source as ExpenseSource)
    }));
</script>

<svelte:head>
  <title>Expenses Management - Alpha Forge</title>
</svelte:head>

<!-- Toast Notifications -->
<div class="fixed top-4 right-4 z-50 space-y-3 max-w-md">
  {#each notifications as notification (notification.id)}
    <div class="notification-slide-in bg-white rounded-lg shadow-lg border-l-4 {
      notification.type === 'success' ? 'border-green-500' :
      notification.type === 'error' ? 'border-red-500' :
      notification.type === 'warning' ? 'border-yellow-500' :
      'border-blue-500'
    } p-4">
      <div class="flex">
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
        <div class="flex-1">
          <p class="text-sm font-medium {
            notification.type === 'success' ? 'text-green-900' :
            notification.type === 'error' ? 'text-red-900' :
            notification.type === 'warning' ? 'text-yellow-900' :
            'text-blue-900'
          }">{notification.message}</p>
        </div>
        <button
          on:click={() => removeNotification(notification.id)}
          class="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600"
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
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">💸 Expense Management</h1>
    <p class="text-gray-600">Track and manage all business expenses efficiently</p>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
    <div class="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-red-800">Total Expenses</p>
          <p class="text-2xl font-bold text-red-900">{formatCurrency(stats.totalExpenses)}</p>
          <p class="text-xs text-red-700 mt-1">{expenses.length} transactions</p>
        </div>
        <div class="w-12 h-12 bg-red-200 rounded-lg flex items-center justify-center">
          <span class="text-red-700 text-xl">💸</span>
        </div>
      </div>
    </div>

    <div class="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-blue-800">This Month</p>
          <p class="text-2xl font-bold text-blue-900">{formatCurrency(stats.thisMonthTotal)}</p>
          <p class="text-xs text-blue-700 mt-1">Current month spending</p>
        </div>
        <div class="w-12 h-12 bg-blue-200 rounded-lg flex items-center justify-center">
          <span class="text-blue-700 text-xl">📊</span>
        </div>
      </div>
    </div>

    <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-yellow-800">Average Expense</p>
          <p class="text-2xl font-bold text-yellow-900">{formatCurrency(stats.averageExpense)}</p>
          <p class="text-xs text-yellow-700 mt-1">Per transaction</p>
        </div>
        <div class="w-12 h-12 bg-yellow-200 rounded-lg flex items-center justify-center">
          <span class="text-yellow-700 text-xl">💰</span>
        </div>
      </div>
    </div>

    <div class="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-purple-800">Categories</p>
          <p class="text-2xl font-bold text-purple-900">{expenseCategories.length}</p>
          <p class="text-xs text-purple-700 mt-1">Expense types tracked</p>
        </div>
        <div class="w-12 h-12 bg-purple-200 rounded-lg flex items-center justify-center">
          <span class="text-purple-700 text-xl">🏷️</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Top Categories -->
  {#if topCategories.length > 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <span class="mr-2">🏆</span> Top Expense Categories
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each topCategories as category, index}
          <div class="flex items-center p-4 {category.info.color} rounded-lg border-2 border-opacity-20">
            <div class="w-12 h-12 bg-white bg-opacity-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <span class="text-xl">{category.info.icon}</span>
            </div>
            <div class="ml-4 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-lg font-bold">#{index + 1}</span>
                <span class="text-sm font-semibold">{category.info.label}</span>
              </div>
              <div class="text-xs opacity-75 mb-2">{category.info.description}</div>
              <div class="flex justify-between items-center">
                <span class="text-lg font-bold">{formatCurrency(category.amount)}</span>
                <span class="text-xs opacity-75">{category.count} transactions</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Quick Actions -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Quick Expense Entry</h3>
        <p class="text-sm text-gray-600">Add expenses quickly with preset amounts</p>
      </div>
      <div class="flex gap-2">
        <button
          on:click={cleanupOrphanedCashflowEntries}
          disabled={isProcessing}
          class="bg-orange-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center"
        >
          <span class="mr-2">🧹</span> Cleanup Cashflow
        </button>
        <button
          on:click={exportData}
          disabled={filteredExpenses.length === 0}
          class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200 font-medium text-sm"
        >
          📊 Export CSV
        </button>
        <button
          on:click={() => { resetForm(); showAddForm = true; }}
          disabled={isProcessing}
          class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors duration-200 font-medium"
        >
          + Add Expense
        </button>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each quickAmounts as preset}
        <button
          on:click={() => quickAdd(preset.amount)}
          disabled={isProcessing}
          class="p-4 border border-gray-200 rounded-lg hover:border-red-300 hover:bg-red-50 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all duration-200 text-left"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">{preset.icon}</span>
            <span class="text-xl font-bold text-red-600">{formatCurrency(preset.amount)}</span>
          </div>
          <p class="text-sm font-medium text-gray-900">{preset.label}</p>
        </button>
      {/each}
    </div>
  </div>

  <!-- Filters and Actions -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Expense Records</h2>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div>
        <input
          type="text"
          placeholder="Search expenses..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />
      </div>
      <div>
        <select
          bind:value={sourceFilter}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        >
          <option value="All">All Categories</option>
          {#each expenseCategories as category}
            <option value={category.value}>{category.icon} {category.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <input
          type="month"
          bind:value={monthFilter}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />
      </div>
      <div class="text-sm text-gray-600 flex items-center">
        Showing {filteredExpenses.length} of {expenses.length} expenses
      </div>
    </div>

    {#if filteredExpenses.length !== expenses.length}
      <div class="mt-4 flex items-center justify-between">
        <p class="text-sm font-medium text-red-600">
          Filtered Total: {formatCurrency(stats.filteredTotal)}
        </p>
        <button
          on:click={() => { 
            searchTerm = ''; 
            sourceFilter = 'All'; 
            monthFilter = new Date().toISOString().slice(0, 7); 
          }}
          class="text-sm text-red-600 hover:text-red-800 underline"
        >
          Clear filters
        </button>
      </div>
    {/if}
  </div>

  <!-- Add/Edit Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingExpense ? '✏️ Edit Expense' : '➕ Add New Expense'}
            </h2>
            <button
              on:click={cancelForm}
              class="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close"
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
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 {errors.source ? 'border-red-500' : ''}"
                required
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
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 {errors.amount ? 'border-red-500' : ''}"
                placeholder="0.00"
                required
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
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50 {errors.date ? 'border-red-500' : ''}"
                required
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
                disabled={isProcessing}
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-50"
                placeholder="Optional expense description..."
              ></textarea>
            </div>

            <!-- Preview -->
            {#if formData.source && formData.amount > 0}
              <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 class="font-medium text-red-800 mb-2">💡 Expense Summary</h4>
                <div class="text-sm text-red-700 space-y-1">
                  <div><strong>Category:</strong> {getCategoryInfo(formData.source).label}</div>
                  <div><strong>Amount:</strong> {formatCurrency(formData.amount)}</div>
                  <div><strong>Date:</strong> {formData.date ? formatDate(formData.date) : 'Not selected'}</div>
                  {#if formData.notes}
                    <div><strong>Notes:</strong> {formData.notes}</div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                disabled={isProcessing}
                class="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200 font-medium inline-flex items-center justify-center"
              >
                {#if isProcessing}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                {:else}
                  {editingExpense ? '✏️ Update Expense' : '➕ Add Expense'}
                {/if}
              </button>
              <button
                type="button"
                on:click={cancelForm}
                disabled={isProcessing}
                class="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200 font-medium"
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
          {expenses.length === 0 ? 'Add your first expense to start tracking spending!' : 'Try adjusting your filters.'}
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
      <!-- Enhanced Table Header -->
      <div class="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Expense Records</h3>
          <div class="text-sm text-gray-600">
            {filteredExpenses.length} entries • {formatCurrency(stats.filteredTotal)}
          </div>
        </div>
      </div>

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
            {#each filteredExpenses as expense, index}
              {@const categoryInfo = getCategoryInfo(expense.source)}
              <tr class="hover:bg-gray-50 transition-colors duration-150 {
                index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
              }">
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <div class="w-12 h-12 {categoryInfo.color} rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-lg">{categoryInfo.icon}</span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{categoryInfo.label}</div>
                      <div class="text-xs text-gray-500">{categoryInfo.description}</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{formatDate(expense.date)}</div>
                  <div class="text-xs text-gray-500">
                    {expense.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-lg font-bold text-red-600">{formatCurrency(expense.amount)}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 max-w-xs">
                    {#if expense.notes}
                      <div class="truncate" title={expense.notes}>{expense.notes}</div>
                    {:else}
                      <span class="text-gray-400 italic">No notes</span>
                    {/if}
                  </div>
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editExpense(expense)}
                      disabled={isProcessing}
                      class="text-blue-600 hover:text-blue-900 disabled:text-gray-400 transition-colors duration-150 text-sm"
                    >
                      <span class="sm:hidden">✏️</span>
                      <span class="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      on:click={() => deleteExpense(expense)}
                      disabled={isProcessing}
                      class="text-red-600 hover:text-red-900 disabled:text-gray-400 transition-colors duration-150 text-sm"
                    >
                      <span class="sm:hidden">🗑️</span>
                      <span class="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Summary Footer -->
      <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="text-sm text-gray-600">
            Showing {filteredExpenses.length} expenses
            {#if monthFilter}
              for {new Date(monthFilter + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {/if}
          </div>
          <div class="text-sm font-medium">
            <span class="text-gray-700">Total Expenses: </span>
            <span class="text-red-600 font-bold">{formatCurrency(stats.filteredTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Category Breakdown -->
  <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-6 flex items-center">
      <span class="mr-2">📊</span> Category Breakdown
    </h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each expenseCategories as category}
        {@const categoryStats = stats.byCategory[category.value]}
        <div class="border border-gray-200 rounded-lg p-4 {category.color} bg-opacity-20">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center">
              <span class="text-2xl mr-3">{category.icon}</span>
              <div>
                <div class="font-medium text-gray-900">{category.label}</div>
                <div class="text-xs text-gray-600">{category.description}</div>
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xl font-bold text-gray-900">{formatCurrency(categoryStats.amount)}</div>
            <div class="text-sm text-gray-600">
              {categoryStats.count} transaction{categoryStats.count !== 1 ? 's' : ''}
            </div>
            {#if categoryStats.count > 0}
              <div class="text-xs text-gray-500 mt-1">
                Avg: {formatCurrency(categoryStats.amount / categoryStats.count)}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Summary Stats -->
    <div class="mt-6 pt-6 border-t border-gray-200">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div>
          <div class="text-2xl font-bold text-red-600">{expenses.length}</div>
          <div class="text-sm text-gray-600">Total Transactions</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpenses)}</div>
          <div class="text-sm text-gray-600">Total Amount</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-red-600">{formatCurrency(stats.averageExpense)}</div>
          <div class="text-sm text-gray-600">Average Expense</div>
        </div>
      </div>
    </div>

    <!-- Quick Insights -->
    <div class="mt-6 pt-6 border-t border-gray-200">
      <div class="bg-blue-50 rounded-lg p-4">
        <h4 class="font-medium text-blue-800 mb-2">💡 Expense Insights</h4>
        <div class="text-sm text-blue-700 space-y-1">
          {#if topCategories.length > 0}
            <div><strong>Top Category:</strong> {topCategories[0].info.label} ({formatCurrency(topCategories[0].amount)})</div>
          {/if}
          <div><strong>Monthly Average:</strong> {formatCurrency(stats.totalExpenses / Math.max(1, new Set(expenses.map(e => e.date.slice(0, 7))).size))}</div>
          <div><strong>Most Active:</strong> {new Date(monthFilter + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ({formatCurrency(stats.thisMonthTotal)})</div>
        </div>
      </div>
    </div>
  </div>
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

  /* Subtle gradient backgrounds */
  .bg-gray-25 {
    background-color: rgb(252 252 253);
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

  /* Smooth transitions */
  .transition-colors {
    transition-property: color, background-color, border-color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  /* Focus states */
  input:focus, select:focus, textarea:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .overflow-x-auto table {
      min-width: 800px;
    }
  }

  /* Enhanced hover effects */
  .hover\:border-red-300:hover {
    border-color: rgb(252 165 165);
  }

  .hover\:bg-red-50:hover {
    background-color: rgb(254 242 242);
  }
</style>