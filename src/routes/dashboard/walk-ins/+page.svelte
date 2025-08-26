<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { 
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, 
    serverTimestamp, query, orderBy, Timestamp, writeBatch,
    where, limit 
  } from 'firebase/firestore';
  import type { WalkIn, PaymentMethod } from '$lib/types';

  // State
  let walkIns: WalkIn[] = [];
  let isLoading = true;
  let isProcessing = false;
  let showAddForm = false;
  let editingWalkIn: WalkIn | null = null;
  let searchTerm = '';
  let dateFilter = '';
  let paymentMethodFilter: PaymentMethod | 'All' = 'All';
  let selectedDate = '';

  // Form data
  let formData = {
    name: '',
    payment: 100,
    method: 'Cash' as PaymentMethod,
    customDate: '',
    useCustomDate: false
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Payment methods and presets
  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];
  const quickAmounts = [
    { amount: 50, label: '₱50 - Student Rate', icon: '🎓' },
    { amount: 100, label: '₱100 - Regular Day Pass', icon: '🎫' },
    { amount: 150, label: '₱150 - Premium Access', icon: '⭐' },
    { amount: 200, label: '₱200 - VIP Day Pass', icon: '👑' }
  ];

  // Improved notification system
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    duration?: number;
  }> = [];
  let notificationId = 0;

  onMount(() => {
    loadWalkIns();
    initializeDates();
  });

  function initializeDates() {
    const today = new Date().toISOString().split('T')[0];
    formData.customDate = today;
    selectedDate = today;
    dateFilter = today; // Default to showing today's walk-ins
  }

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
      showNotification('Failed to load walk-ins. Please try again.', 'error');
    } finally {
      isLoading = false;
    }
  }

  // Validate form
  function validateForm() {
    errors = {};

    // Name validation (optional but with constraints)
    if (formData.name.trim() && formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
    if (formData.name.trim() && formData.name.trim().length > 50) {
      errors.name = 'Name must be less than 50 characters';
    }

    // Payment validation
    if (!formData.payment || formData.payment <= 0) {
      errors.payment = 'Payment amount must be greater than 0';
    }
    if (formData.payment > 10000) {
      errors.payment = 'Payment amount seems too high. Please verify.';
    }

    // Date validation (if using custom date)
    if (formData.useCustomDate && formData.customDate) {
      const customDate = new Date(formData.customDate);
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      if (customDate < thirtyDaysAgo) {
        errors.customDate = 'Date cannot be more than 30 days in the past';
      }
      if (customDate > tomorrow) {
        errors.customDate = 'Date cannot be in the future';
      }
    }

    return Object.keys(errors).length === 0;
  }

  // Improved add walk-in function with better linking
  async function addWalkIn() {
    if (!validateForm()) return;

    try {
      isProcessing = true;
      
      // Use custom date if selected, otherwise use current timestamp
      const walkInDate = formData.useCustomDate && formData.customDate 
        ? new Date(formData.customDate + 'T' + new Date().toTimeString().split(' ')[0])
        : new Date();

      const batch = writeBatch(db);

      // Create walk-in record first to get the ID
      const walkInRef = doc(collection(db, 'walkIns'));
      const walkInData = {
        name: formData.name.trim() || 'Guest',
        payment: formData.payment,
        method: formData.method,
        date: Timestamp.fromDate(walkInDate),
        createdAt: serverTimestamp()
      };
      batch.set(walkInRef, walkInData);

      // Create cashflow entry with proper linking
      const cashflowRef = doc(collection(db, 'cashflow'));
      const cashflowData = {
        type: 'income',
        source: 'Day Pass',
        amount: formData.payment,
        date: walkInDate.toISOString().split('T')[0],
        notes: `Day pass - ${formData.name.trim() || 'Guest'} (Walk-in)`,
        
        // Better linking fields
        linkedId: walkInRef.id,
        linkedType: 'walkin',
        customerName: formData.name.trim() || 'Guest',
        paymentMethod: formData.method,
        autoGenerated: true,
        
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      batch.set(cashflowRef, cashflowData);

      await batch.commit();
      
      resetForm();
      showAddForm = false;
      await loadWalkIns();
      
      showNotification(`Walk-in recorded successfully! Payment: ${formatCurrency(formData.payment)}`, 'success');
    } catch (error) {
      console.error('Error adding walk-in:', error);
      showNotification('Failed to record walk-in. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Edit walk-in
  function editWalkIn(walkIn: WalkIn) {
    editingWalkIn = walkIn;
    formData = {
      name: walkIn.name,
      payment: walkIn.payment,
      method: walkIn.method,
      customDate: walkIn.date.toISOString().split('T')[0],
      useCustomDate: true
    };
    showAddForm = true;
  }

  // Update walk-in
  async function updateWalkIn() {
    if (!validateForm() || !editingWalkIn) return;

    try {
      isProcessing = true;
      
      const walkInData = {
        name: formData.name.trim() || 'Guest',
        payment: formData.payment,
        method: formData.method,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'walkIns', editingWalkIn.id), walkInData);
      
      resetForm();
      showAddForm = false;
      editingWalkIn = null;
      await loadWalkIns();
      
      showNotification('Walk-in updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating walk-in:', error);
      showNotification('Failed to update walk-in. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Improved delete function with cashflow cleanup
  async function deleteWalkIn(walkIn: WalkIn) {
    if (!confirm(`Are you sure you want to delete this walk-in record?\n\nVisitor: ${walkIn.name}\nAmount: ${formatCurrency(walkIn.payment)}\nDate: ${formatDate(walkIn.date)}\n\nThis will also remove the associated cashflow entry.`)) {
      return;
    }

    try {
      isProcessing = true;
      
      // Use batch to ensure both deletions happen together
      const batch = writeBatch(db);
      
      // 1. Delete the walk-in record
      batch.delete(doc(db, 'walkIns', walkIn.id));
      
      // 2. Find and delete related cashflow entries
      const cashflowQuery = query(
        collection(db, 'cashflow'), 
        where('linkedId', '==', walkIn.id),
        where('source', '==', 'Day Pass')
      );
      
      const cashflowSnapshot = await getDocs(cashflowQuery);
      
      // Delete all matching cashflow entries
      cashflowSnapshot.docs.forEach(cashflowDoc => {
        batch.delete(doc(db, 'cashflow', cashflowDoc.id));
      });
      
      // If no linked entries found, try fallback method
      if (cashflowSnapshot.empty) {
        const walkInDateString = walkIn.date.toISOString().split('T')[0];
        
        const fallbackQuery = query(
          collection(db, 'cashflow'),
          where('type', '==', 'income'),
          where('source', '==', 'Day Pass'),
          where('amount', '==', walkIn.payment),
          where('date', '==', walkInDateString),
          limit(1)
        );
        
        const fallbackSnapshot = await getDocs(fallbackQuery);
        fallbackSnapshot.docs.forEach(cashflowDoc => {
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
        });
      }
      
      // Execute all deletions
      await batch.commit();
      await loadWalkIns();
      
      showNotification('Walk-in record and related cashflow entry deleted successfully.', 'success');
      
    } catch (error) {
      console.error('Error deleting walk-in:', error);
      showNotification('Failed to delete walk-in. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Quick add with preset amount
  function quickAdd(amount: number) {
    formData = {
      name: '',
      payment: amount,
      method: 'Cash',
      customDate: new Date().toISOString().split('T')[0],
      useCustomDate: false
    };
    showAddForm = true;
  }

  // Bulk add functionality
  let showBulkAdd = false;
  let bulkCount = 5;
  let bulkAmount = 100;
  let bulkMethod: PaymentMethod = 'Cash';
  let bulkDate = '';

  function initBulkAdd() {
    bulkDate = new Date().toISOString().split('T')[0];
    showBulkAdd = true;
  }

  async function processBulkAdd() {
    if (bulkCount <= 0 || bulkCount > 50) {
      showNotification('Bulk count must be between 1 and 50', 'error');
      return;
    }

    if (bulkAmount <= 0) {
      showNotification('Payment amount must be greater than 0', 'error');
      return;
    }

    try {
      isProcessing = true;
      const batch = writeBatch(db);
      const bulkDateTime = new Date(bulkDate + 'T' + new Date().toTimeString().split(' ')[0]);

      for (let i = 0; i < bulkCount; i++) {
        // Create walk-in record
        const walkInRef = doc(collection(db, 'walkIns'));
        const walkInData = {
          name: `Guest ${i + 1}`,
          payment: bulkAmount,
          method: bulkMethod,
          date: Timestamp.fromDate(new Date(bulkDateTime.getTime() + (i * 60000))),
          createdAt: serverTimestamp()
        };
        batch.set(walkInRef, walkInData);

        // Create cashflow entry
        const cashflowRef = doc(collection(db, 'cashflow'));
        batch.set(cashflowRef, {
          type: 'income',
          source: 'Day Pass',
          amount: bulkAmount,
          date: bulkDate,
          notes: `Day pass - Guest ${i + 1} (Bulk walk-in)`,
          linkedId: walkInRef.id,
          linkedType: 'walkin',
          customerName: `Guest ${i + 1}`,
          paymentMethod: bulkMethod,
          autoGenerated: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      await loadWalkIns();
      showBulkAdd = false;
      
      showNotification(`${bulkCount} walk-ins added successfully! Total: ${formatCurrency(bulkCount * bulkAmount)}`, 'success');
    } catch (error) {
      console.error('Error processing bulk add:', error);
      showNotification('Failed to process bulk add. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // One-time cleanup function for orphaned cashflow entries
  async function cleanupOrphanedCashflowEntries() {
    if (!confirm('This will clean up cashflow entries that no longer have corresponding walk-ins. This action cannot be undone. Continue?')) {
      return;
    }

    try {
      isProcessing = true;
      showNotification('Starting cleanup of orphaned cashflow entries...', 'info');
      
      // Get all walk-ins and day pass cashflow entries
      const [walkInsSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(collection(db, 'walkIns')),
        getDocs(query(collection(db, 'cashflow'), where('source', '==', 'Day Pass'), where('type', '==', 'income')))
      ]);

      // Create a Set of valid walk-in IDs
      const validWalkInIds = new Set(walkInsSnapshot.docs.map(doc => doc.id));
      
      const batch = writeBatch(db);
      let orphanedCount = 0;
      let linkedCount = 0;

      // Check each cashflow entry
      for (const cashflowDoc of cashflowSnapshot.docs) {
        const cashflowData = cashflowDoc.data();
        
        // Check if it has a linkedId and if that walk-in still exists
        if (cashflowData.linkedId && !validWalkInIds.has(cashflowData.linkedId)) {
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          orphanedCount++;
        } else if (!cashflowData.linkedId) {
          // Try to link unlinked entries
          const dateString = cashflowData.date;
          const amount = cashflowData.amount;
          
          const matchingWalkIn = walkInsSnapshot.docs.find(walkInDoc => {
            const walkInData = walkInDoc.data();
            const walkInDate = walkInData.date?.toDate();
            const walkInDateString = walkInDate ? walkInDate.toISOString().split('T')[0] : '';
            return walkInDateString === dateString && walkInData.payment === amount;
          });
          
          if (matchingWalkIn) {
            // Link the cashflow entry
            batch.update(doc(db, 'cashflow', cashflowDoc.id), {
              linkedId: matchingWalkIn.id,
              linkedType: 'walkin',
              autoGenerated: true,
              updatedAt: serverTimestamp()
            });
            linkedCount++;
          } else {
            // No matching walk-in found, delete orphaned entry
            batch.delete(doc(db, 'cashflow', cashflowDoc.id));
            orphanedCount++;
          }
        }
      }

      if (orphanedCount > 0 || linkedCount > 0) {
        await batch.commit();
        showNotification(`Cleanup completed! Deleted ${orphanedCount} orphaned entries, linked ${linkedCount} entries.`, 'success');
      } else {
        showNotification('All cashflow entries are already properly linked. No cleanup needed.', 'info');
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      showNotification('Error during cleanup. Please check console for details.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      name: '',
      payment: 100,
      method: 'Cash',
      customDate: new Date().toISOString().split('T')[0],
      useCustomDate: false
    };
    errors = {};
    editingWalkIn = null;
  }

  // Cancel form
  function cancelForm() {
    resetForm();
    showAddForm = false;
  }

  // Utility functions
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }

  function getPaymentMethodColor(method: PaymentMethod) {
    const colors = {
      'Cash': 'bg-green-100 text-green-800',
      'GCash': 'bg-blue-100 text-blue-800',
      'Bank Transfer': 'bg-purple-100 text-purple-800',
      'Credit Card': 'bg-orange-100 text-orange-800'
    };
    return colors[method] || 'bg-gray-100 text-gray-800';
  }

  // Export functionality
  function exportData() {
    const csvData = [
      ['Name', 'Payment Amount', 'Payment Method', 'Date', 'Time'].join(','),
      ...filteredWalkIns.map(walkIn => [
        `"${walkIn.name}"`,
        walkIn.payment,
        walkIn.method,
        formatDate(walkIn.date),
        formatTime(walkIn.date)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `walk-ins-${dateFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Improved notification system
  function showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 5000) {
    const id = notificationId++;
    notifications = [...notifications, { id, message, type, duration }];
    
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }

  function removeNotification(id: number) {
    notifications = notifications.filter(n => n.id !== id);
  }

  // Filter walk-ins
  $: filteredWalkIns = walkIns.filter(walkIn => {
    const matchesSearch = walkIn.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !dateFilter || walkIn.date.toISOString().split('T')[0] === dateFilter;
    const matchesPaymentMethod = paymentMethodFilter === 'All' || walkIn.method === paymentMethodFilter;
    return matchesSearch && matchesDate && matchesPaymentMethod;
  });

  // Get statistics
  $: stats = (() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekAgoStr = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    const todayWalkIns = walkIns.filter(w => w.date.toISOString().split('T')[0] === todayStr);
    const yesterdayWalkIns = walkIns.filter(w => w.date.toISOString().split('T')[0] === yesterdayStr);
    const thisWeekWalkIns = walkIns.filter(w => w.date.toISOString().split('T')[0] >= weekAgoStr);
    const thisMonthWalkIns = walkIns.filter(w => w.date.toISOString().split('T')[0] >= monthStart);

    return {
      total: walkIns.length,
      today: todayWalkIns.length,
      yesterday: yesterdayWalkIns.length,
      thisWeek: thisWeekWalkIns.length,
      thisMonth: thisMonthWalkIns.length,
      todayRevenue: todayWalkIns.reduce((sum, w) => sum + w.payment, 0),
      yesterdayRevenue: yesterdayWalkIns.reduce((sum, w) => sum + w.payment, 0),
      weekRevenue: thisWeekWalkIns.reduce((sum, w) => sum + w.payment, 0),
      monthRevenue: thisMonthWalkIns.reduce((sum, w) => sum + w.payment, 0),
      totalRevenue: walkIns.reduce((sum, w) => sum + w.payment, 0),
      averagePayment: walkIns.length > 0 ? walkIns.reduce((sum, w) => sum + w.payment, 0) / walkIns.length : 0,
      growth: {
        todayVsYesterday: todayWalkIns.length - yesterdayWalkIns.length,
        todayRevenueVsYesterday: todayWalkIns.reduce((sum, w) => sum + w.payment, 0) - yesterdayWalkIns.reduce((sum, w) => sum + w.payment, 0)
      }
    };
  })();
</script>

<svelte:head>
  <title>Walk-ins Management - Alpha Forge</title>
</svelte:head>

<!-- Improved Toast Notifications -->
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
          <div class="w-5 h-5 rounded-full flex items-center justify-center {
            notification.type === 'success' ? 'bg-green-100 text-green-600' :
            notification.type === 'error' ? 'bg-red-100 text-red-600' :
            notification.type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
            'bg-blue-100 text-blue-600'
          }">
            {#if notification.type === 'success'}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            {:else if notification.type === 'error'}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            {:else if notification.type === 'warning'}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            {:else}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
              </svg>
            {/if}
          </div>
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

<div class="p-6">
  <!-- Enhanced Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
    <!-- Today's Walk-ins -->
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-600">Today's Walk-ins</p>
          <p class="text-2xl font-bold text-purple-600">{stats.today}</p>
          {#if stats.growth.todayVsYesterday !== 0}
            <p class="text-xs {stats.growth.todayVsYesterday > 0 ? 'text-green-600' : 'text-red-600'}">
              {stats.growth.todayVsYesterday > 0 ? '+' : ''}{stats.growth.todayVsYesterday} vs yesterday
            </p>
          {:else}
            <p class="text-xs text-gray-500">Same as yesterday</p>
          {/if}
        </div>
        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <span class="text-purple-600 text-lg">🚶</span>
        </div>
      </div>
    </div>

    <!-- Today's Revenue -->
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-600">Today's Revenue</p>
          <p class="text-2xl font-bold text-green-600">{formatCurrency(stats.todayRevenue)}</p>
          {#if stats.growth.todayRevenueVsYesterday !== 0}
            <p class="text-xs {stats.growth.todayRevenueVsYesterday > 0 ? 'text-green-600' : 'text-red-600'}">
              {stats.growth.todayRevenueVsYesterday > 0 ? '+' : ''}{formatCurrency(stats.growth.todayRevenueVsYesterday)} vs yesterday
            </p>
          {:else}
            <p class="text-xs text-gray-500">Same as yesterday</p>
          {/if}
        </div>
        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-lg">💰</span>
        </div>
      </div>
    </div>

    <!-- This Week -->
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-600">This Week</p>
          <p class="text-2xl font-bold text-blue-600">{stats.thisWeek}</p>
          <p class="text-xs text-blue-500">{formatCurrency(stats.weekRevenue)}</p>
        </div>
        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-lg">📅</span>
        </div>
      </div>
    </div>

    <!-- This Month -->
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-600">This Month</p>
          <p class="text-2xl font-bold text-indigo-600">{stats.thisMonth}</p>
          <p class="text-xs text-indigo-500">{formatCurrency(stats.monthRevenue)}</p>
        </div>
        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <span class="text-indigo-600 text-lg">📊</span>
        </div>
      </div>
    </div>

    <!-- Average Payment -->
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-600">Average Payment</p>
          <p class="text-2xl font-bold text-yellow-600">{formatCurrency(stats.averagePayment)}</p>
          <p class="text-xs text-yellow-500">Per visit</p>
        </div>
        <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-lg">💵</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Quick Day Pass Registration</h3>
        <p class="text-sm text-gray-600">Fast registration with preset pricing options</p>
      </div>
      <div class="flex gap-2">
        <button
          on:click={initBulkAdd}
          disabled={isProcessing}
          class="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center text-sm"
        >
          <span class="mr-2">📝</span> Bulk Add
        </button>
        <button
          on:click={cleanupOrphanedCashflowEntries}
          disabled={isProcessing}
          class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center text-sm"
        >
          <span class="mr-2">🧹</span> Cleanup
        </button>
        <button
          on:click={() => { resetForm(); showAddForm = true; }}
          disabled={isProcessing}
          class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center"
        >
          <span class="mr-2">+</span> Record Walk-in
        </button>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each quickAmounts as preset}
        <button
          on:click={() => quickAdd(preset.amount)}
          disabled={isProcessing}
          class="p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all duration-200 text-left"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">{preset.icon}</span>
            <span class="text-xl font-bold text-purple-600">{formatCurrency(preset.amount)}</span>
          </div>
          <p class="text-sm font-medium text-gray-900">{preset.label}</p>
        </button>
      {/each}
    </div>
  </div>

  <!-- Search and Filter -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Walk-in Management</h2>
      <button
        on:click={exportData}
        disabled={filteredWalkIns.length === 0}
        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 font-medium inline-flex items-center text-sm"
      >
        <span class="mr-2">📊</span> Export CSV
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div class="lg:col-span-2">
        <input
          type="text"
          placeholder="Search by visitor name..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
      </div>
      
      <div>
        <input
          type="date"
          bind:value={dateFilter}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
      </div>

      <div>
        <select
          bind:value={paymentMethodFilter}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="All">All Methods</option>
          {#each paymentMethods as method}
            <option value={method}>{method}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if searchTerm || dateFilter || paymentMethodFilter !== 'All'}
      <div class="mt-4 flex items-center justify-between">
        <p class="text-sm text-gray-600">
          Showing {filteredWalkIns.length} of {walkIns.length} walk-ins
          {#if dateFilter}
            for {formatDate(new Date(dateFilter))}
          {/if}
        </p>
        <button
          on:click={() => { 
            searchTerm = ''; 
            dateFilter = ''; 
            paymentMethodFilter = 'All'; 
          }}
          class="text-sm text-purple-600 hover:text-purple-800 underline"
        >
          Clear all filters
        </button>
      </div>
    {/if}
  </div>

  <!-- Add/Edit Walk-in Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingWalkIn ? 'Edit Walk-in' : 'Record New Walk-in'}
            </h2>
            <button
              on:click={cancelForm}
              disabled={isProcessing}
              class="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close modal"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <form on:submit|preventDefault={editingWalkIn ? updateWalkIn : addWalkIn} class="space-y-4">
            <!-- Visitor Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                Visitor Name
              </label>
              <input
                id="name"
                type="text"
                bind:value={formData.name}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 {errors.name ? 'border-red-500' : ''}"
                placeholder="Guest name (optional)"
              />
              {#if errors.name}
                <p class="text-red-600 text-sm mt-1">{errors.name}</p>
              {/if}
              <p class="text-xs text-gray-500 mt-1">Leave empty for "Guest"</p>
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
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 {errors.payment ? 'border-red-500' : ''}"
                placeholder="100"
                required
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
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50"
                required
              >
                {#each paymentMethods as method}
                  <option value={method}>{method}</option>
                {/each}
              </select>
            </div>

            <!-- Custom Date -->
            <div>
              <label for="customDate" class="block text-sm font-medium text-gray-700 mb-2">
                Date & Time
              </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={formData.useCustomDate}
                    disabled={isProcessing || !!editingWalkIn}
                    class="rounded border-gray-300 text-purple-600 shadow-sm focus:border-purple-300 focus:ring focus:ring-purple-200 focus:ring-opacity-50"
                  />
                  <span class="ml-2 text-sm text-gray-700">Use custom date</span>
                </label>
                {#if formData.useCustomDate}
                  <input
                    id="customDate"
                    type="date"
                    bind:value={formData.customDate}
                    disabled={isProcessing || !!editingWalkIn}
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 {errors.customDate ? 'border-red-500' : ''}"
                  />
                  {#if errors.customDate}
                    <p class="text-red-600 text-sm mt-1">{errors.customDate}</p>
                  {/if}
                {:else}
                  <p class="text-sm text-gray-500">Current date and time will be used</p>
                {/if}
              </div>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                disabled={isProcessing}
                class="flex-1 bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors duration-200 font-medium inline-flex items-center justify-center"
              >
                {#if isProcessing}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                {:else}
                  {editingWalkIn ? 'Update Walk-in' : 'Record Walk-in'}
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

  <!-- Bulk Add Modal -->
  {#if showBulkAdd}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">Bulk Add Walk-ins</h2>
            <button
              on:click={() => showBulkAdd = false}
              disabled={isProcessing}
              class="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <form on:submit|preventDefault={processBulkAdd} class="space-y-4">
            <div>
              <label for="bulkCount" class="block text-sm font-medium text-gray-700 mb-2">
                Number of Walk-ins *
              </label>
              <input
                id="bulkCount"
                type="number"
                min="1"
                max="50"
                bind:value={bulkCount}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                required
              />
              <p class="text-xs text-gray-500 mt-1">Maximum 50 walk-ins at once</p>
            </div>

            <div>
              <label for="bulkAmount" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount per Person *
              </label>
              <input
                id="bulkAmount"
                type="number"
                min="1"
                step="0.01"
                bind:value={bulkAmount}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                required
              />
            </div>

            <div>
              <label for="bulkMethod" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Method *
              </label>
              <select
                id="bulkMethod"
                bind:value={bulkMethod}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                required
              >
                {#each paymentMethods as method}
                  <option value={method}>{method}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="bulkDate" class="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                id="bulkDate"
                type="date"
                bind:value={bulkDate}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                required
              />
            </div>

            <!-- Summary -->
            <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h4 class="font-medium text-orange-800 mb-2">Bulk Add Summary</h4>
              <div class="text-sm text-orange-700">
                <p><strong>Count:</strong> {bulkCount} walk-ins</p>
                <p><strong>Amount:</strong> {formatCurrency(bulkAmount)} per person</p>
                <p><strong>Total Revenue:</strong> {formatCurrency(bulkCount * bulkAmount)}</p>
                <p><strong>Method:</strong> {bulkMethod}</p>
                <p><strong>Date:</strong> {bulkDate ? formatDate(new Date(bulkDate)) : 'Not selected'}</p>
              </div>
            </div>

            <div class="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isProcessing || !bulkDate}
                class="flex-1 bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors duration-200 font-medium inline-flex items-center justify-center"
              >
                {#if isProcessing}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                {:else}
                  Add {bulkCount} Walk-ins - {formatCurrency(bulkCount * bulkAmount)}
                {/if}
              </button>
              <button
                type="button"
                on:click={() => showBulkAdd = false}
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
                  <div class="text-lg font-bold text-green-600">{formatCurrency(walkIn.payment)}</div>
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
                      disabled={isProcessing}
                      class="text-purple-600 hover:text-purple-900 disabled:text-gray-400 transition-colors duration-150"
                    >
                      <span class="sm:hidden">✏️</span>
                      <span class="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      on:click={() => deleteWalkIn(walkIn)}
                      disabled={isProcessing}
                      class="text-red-600 hover:text-red-900 disabled:text-gray-400 transition-colors duration-150"
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
            Showing {filteredWalkIns.length} of {walkIns.length} walk-ins
            {#if dateFilter}
              for {formatDate(new Date(dateFilter))}
            {/if}
          </div>
          <div class="text-sm font-medium">
            Total Revenue: 
            <span class="text-green-600 font-bold">
              {formatCurrency(filteredWalkIns.reduce((sum, w) => sum + w.payment, 0))}
            </span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Payment Method Breakdown -->
  <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-6">Payment Method Breakdown</h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each paymentMethods as method}
        {@const methodWalkIns = walkIns.filter(w => w.method === method)}
        {@const methodRevenue = methodWalkIns.reduce((sum, w) => sum + w.payment, 0)}
        <div class="text-center p-4 {getPaymentMethodColor(method)} border rounded-lg">
          <div class="text-2xl mb-2">
            {method === 'Cash' ? '💵' : 
             method === 'GCash' ? '📱' : 
             method === 'Bank Transfer' ? '🏦' : '💳'}
          </div>
          <div class="text-lg font-bold">{methodWalkIns.length}</div>
          <div class="text-xs opacity-75">{method}</div>
          <div class="text-sm font-semibold mt-1">{formatCurrency(methodRevenue)}</div>
        </div>
      {/each}
    </div>

    <div class="mt-6 pt-6 border-t border-gray-200">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div>
          <div class="text-2xl font-bold text-purple-600">{stats.total}</div>
          <div class="text-sm text-gray-600">Total Walk-ins</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</div>
          <div class="text-sm text-gray-600">Total Revenue</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-blue-600">{formatCurrency(stats.averagePayment)}</div>
          <div class="text-sm text-gray-600">Average Payment</div>
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

  /* Loading animation */
  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Smooth transitions */
  .transition-all {
    transition-property: all;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  /* Focus states */
  input:focus, select:focus, textarea:focus, button:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
  }

  /* Custom scrollbar for modal */
  .overflow-y-auto::-webkit-scrollbar {
    width: 4px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 2px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
</style>