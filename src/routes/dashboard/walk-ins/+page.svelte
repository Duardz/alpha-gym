<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, Timestamp } from 'firebase/firestore';
  import type { WalkIn, PaymentMethod } from '$lib/types';

  // State
  let walkIns: WalkIn[] = [];
  let isLoading = true;
  let showAddForm = false;
  let editingWalkIn: WalkIn | null = null;
  let searchTerm = '';
  let dateFilter = '';
  let paymentMethodFilter: PaymentMethod | 'All' = 'All';

  // Form data
  let formData = {
    name: '',
    payment: 100,
    method: 'Cash' as PaymentMethod
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Payment methods
  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];

  // Quick action amounts (common day pass prices)
  const quickAmounts = [50, 100, 150, 200];

  onMount(() => {
    loadWalkIns();
  });

  // Load walk-ins from Firestore
  async function loadWalkIns() {
    try {
      isLoading = true;
      const q = query(collection(db, 'walkIns'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      
      walkIns = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date()
        } as WalkIn;
      });
    } catch (error) {
      console.error('Error loading walk-ins:', error);
      alert('Failed to load walk-ins. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.payment || formData.payment <= 0) {
      errors.payment = 'Payment amount must be greater than 0';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new walk-in
  async function addWalkIn() {
    if (!validateForm()) return;

    try {
      const walkInData = {
        name: formData.name.trim() || 'Guest',
        payment: formData.payment,
        method: formData.method,
        date: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'walkIns'), walkInData);

      // Auto-create cashflow entry for income
      await addCashflowEntry({
        type: 'income',
        source: 'Day Pass',
        amount: formData.payment,
        date: new Date().toISOString().split('T')[0],
        notes: `Day pass - ${formData.name || 'Guest'}`
      });
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadWalkIns();
      
      alert('Walk-in recorded successfully!');
    } catch (error) {
      console.error('Error adding walk-in:', error);
      alert('Failed to record walk-in. Please try again.');
    }
  }

  // Auto-create cashflow entry for walk-in income
  async function addCashflowEntry(cashflowData: any) {
    try {
      await addDoc(collection(db, 'cashflow'), {
        ...cashflowData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating cashflow entry:', error);
      // Don't fail the walk-in creation if cashflow fails
    }
  }

  // Edit walk-in
  function editWalkIn(walkIn: WalkIn) {
    editingWalkIn = walkIn;
    formData = {
      name: walkIn.name,
      payment: walkIn.payment,
      method: walkIn.method
    };
    showAddForm = true;
  }

  // Update walk-in
  async function updateWalkIn() {
    if (!validateForm() || !editingWalkIn) return;

    try {
      const walkInData = {
        name: formData.name.trim() || 'Guest',
        payment: formData.payment,
        method: formData.method
      };

      await updateDoc(doc(db, 'walkIns', editingWalkIn.id), walkInData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingWalkIn = null;
      await loadWalkIns();
      
      alert('Walk-in updated successfully!');
    } catch (error) {
      console.error('Error updating walk-in:', error);
      alert('Failed to update walk-in. Please try again.');
    }
  }

  // Delete walk-in
  async function deleteWalkIn(walkIn: WalkIn) {
    if (!confirm(`Are you sure you want to delete this walk-in record for ${walkIn.name}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'walkIns', walkIn.id));
      await loadWalkIns();
      alert('Walk-in deleted successfully!');
    } catch (error) {
      console.error('Error deleting walk-in:', error);
      alert('Failed to delete walk-in. Please try again.');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      name: '',
      payment: 100,
      method: 'Cash'
    };
    errors = {};
    editingWalkIn = null;
  }

  // Cancel form
  function cancelForm() {
    resetForm();
    showAddForm = false;
  }

  // Quick add with preset amount
  function quickAdd(amount: number) {
    formData = {
      name: '',
      payment: amount,
      method: 'Cash'
    };
    showAddForm = true;
  }

  // Format currency
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  // Format date for display
  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US');
  }

  // Format time for display
  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Get today's walk-ins
  function getTodayWalkIns() {
    const today = new Date().toDateString();
    return walkIns.filter(walkIn => walkIn.date.toDateString() === today);
  }

  // Get today's revenue
  function getTodayRevenue() {
    return getTodayWalkIns().reduce((total, walkIn) => total + walkIn.payment, 0);
  }

  // Get payment method color
  function getPaymentMethodColor(method: PaymentMethod) {
    switch (method) {
      case 'Cash': return 'bg-green-100 text-green-800';
      case 'GCash': return 'bg-blue-100 text-blue-800';
      case 'Bank Transfer': return 'bg-purple-100 text-purple-800';
      case 'Credit Card': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Filter walk-ins based on search, date, and payment method
  $: filteredWalkIns = walkIns.filter(walkIn => {
    const matchesSearch = walkIn.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !dateFilter || walkIn.date.toISOString().split('T')[0] === dateFilter;
    const matchesPaymentMethod = paymentMethodFilter === 'All' || walkIn.method === paymentMethodFilter;
    return matchesSearch && matchesDate && matchesPaymentMethod;
  });

  // Get statistics
  $: stats = {
    total: walkIns.length,
    today: getTodayWalkIns().length,
    todayRevenue: getTodayRevenue(),
    averagePayment: walkIns.length > 0 ? walkIns.reduce((sum, w) => sum + w.payment, 0) / walkIns.length : 0,
    byPaymentMethod: {
      Cash: walkIns.filter(w => w.method === 'Cash').length,
      GCash: walkIns.filter(w => w.method === 'GCash').length,
      'Bank Transfer': walkIns.filter(w => w.method === 'Bank Transfer').length,
      'Credit Card': walkIns.filter(w => w.method === 'Credit Card').length,
    }
  };
</script>

<svelte:head>
  <title>Walk-ins Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Quick Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    <!-- Today's Walk-ins -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
          <span class="text-purple-600 text-xl">🚶</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Today's Walk-ins</p>
          <p class="text-2xl font-bold text-gray-900">{stats.today}</p>
        </div>
      </div>
    </div>

    <!-- Today's Revenue -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-xl">💰</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Today's Revenue</p>
          <p class="text-2xl font-bold text-green-600">{formatCurrency(stats.todayRevenue)}</p>
        </div>
      </div>
    </div>

    <!-- Total Walk-ins -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-xl">📊</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Walk-ins</p>
          <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
      </div>
    </div>

    <!-- Average Payment -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-xl">💵</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Avg. Payment</p>
          <p class="text-2xl font-bold text-gray-900">{formatCurrency(stats.averagePayment)}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Quick Day Pass Registration</h3>
        <p class="text-sm text-gray-600">Fast registration with common pricing</p>
      </div>
      <button
        on:click={() => { resetForm(); showAddForm = true; }}
        class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">+</span> Record Walk-in
      </button>
    </div>
    
    <div class="flex gap-3 flex-wrap">
      {#each quickAmounts as amount}
        <button
          on:click={() => quickAdd(amount)}
          class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors duration-200 text-sm font-medium"
        >
          {formatCurrency(amount)} Day Pass
        </button>
      {/each}
    </div>
  </div>

  <!-- Search and Filter -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row gap-4">
      <div class="flex-1">
        <input
          type="text"
          placeholder="Search by name..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
      </div>
      <div class="flex gap-3">
        <input
          type="date"
          bind:value={dateFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
        <select
          bind:value={paymentMethodFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="All">All Methods</option>
          {#each paymentMethods as method}
            <option value={method}>{method}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <!-- Add/Edit Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingWalkIn ? 'Edit Walk-in' : 'Record New Walk-in'}
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

          <form on:submit|preventDefault={editingWalkIn ? updateWalkIn : addWalkIn} class="space-y-4">
            <!-- Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                Visitor Name
              </label>
              <input
                id="name"
                type="text"
                bind:value={formData.name}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 {errors.name ? 'border-red-500' : ''}"
                placeholder="Guest name (optional)"
              />
              {#if errors.name}
                <p class="text-red-600 text-sm mt-1">{errors.name}</p>
              {/if}
            </div>

            <!-- Payment Amount -->
            <div>
              <label for="payment" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount *
              </label>
              <input
                id="payment"
                type="number"
                min="1"
                step="0.01"
                bind:value={formData.payment}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 {errors.payment ? 'border-red-500' : ''}"
                placeholder="100"
              />
              {#if errors.payment}
                <p class="text-red-600 text-sm mt-1">{errors.payment}</p>
              {/if}
            </div>

            <!-- Payment Method -->
            <div>
              <label for="method" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Method *
              </label>
              <select
                id="method"
                bind:value={formData.method}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {#each paymentMethods as method}
                  <option value={method}>{method}</option>
                {/each}
              </select>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                class="flex-1 bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors duration-200 font-medium"
              >
                {editingWalkIn ? 'Update Walk-in' : 'Record Walk-in'}
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

  <!-- Walk-ins List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <p class="mt-4 text-gray-600">Loading walk-ins...</p>
      </div>
    </div>
  {:else if filteredWalkIns.length === 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">🚶</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {walkIns.length === 0 ? 'No walk-ins recorded yet' : 'No walk-ins found'}
        </h3>
        <p class="text-gray-500 mb-6">
          {walkIns.length === 0 ? 'Record your first day pass!' : 'Try adjusting your search or filter criteria.'}
        </p>
        {#if walkIns.length === 0}
          <button
            on:click={() => { resetForm(); showAddForm = true; }}
            class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors duration-200"
          >
            Record First Walk-in
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredWalkIns as walkIn}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span class="text-purple-600 font-semibold text-sm">
                        {walkIn.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{walkIn.name}</div>
                      <div class="text-sm text-gray-500">Day Pass</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900">{formatDate(walkIn.date)}</div>
                  <div class="text-sm text-gray-500">{formatTime(walkIn.date)}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{formatCurrency(walkIn.payment)}</div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getPaymentMethodColor(walkIn.method)}">
                    {walkIn.method}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editWalkIn(walkIn)}
                      class="text-purple-600 hover:text-purple-900 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteWalkIn(walkIn)}
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