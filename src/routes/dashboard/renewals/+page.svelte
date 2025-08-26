<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { 
    collection, addDoc, getDocs, doc, updateDoc, query, 
    orderBy, where, writeBatch, serverTimestamp, Timestamp 
  } from 'firebase/firestore';
  import type { Member, MembershipType, PaymentMethod } from '$lib/types';

  // Interfaces for renewal system
  interface RenewalPayment {
    id: string;
    memberId: string;
    memberName: string;
    membershipType: MembershipType;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    renewalPeriod: string; // "Jan 2024 - Feb 2024"
    previousExpiryDate: string;
    newExpiryDate: string;
    notes?: string;
    createdAt: Date;
  }

  interface RenewalCandidate {
    member: Member;
    daysUntilExpiry: number;
    status: 'expired' | 'expiring_soon' | 'expiring_today' | 'due_for_renewal';
    recommendedAmount: number;
  }

  // State
  let members: Member[] = [];
  let renewalCandidates: RenewalCandidate[] = [];
  let renewalPayments: RenewalPayment[] = [];
  let isLoading = true;
  let isProcessing = false;
  let showRenewalForm = false;
  let selectedMember: Member | null = null;
  let viewMode: 'renewals' | 'history' = 'renewals';

  // Form data
  let renewalFormData = {
    amount: 0,
    paymentMethod: 'Cash' as PaymentMethod,
    paymentDate: '',
    renewalMonths: 1,
    notes: ''
  };

  // Filters
  let statusFilter: 'all' | 'expired' | 'expiring_soon' | 'expiring_today' = 'all';
  let searchTerm = '';

  // Membership pricing
  const membershipPricing: Record<MembershipType, number> = {
    'Day Pass': 40,
    'Warrior Pass': 799,
    'Gladiator Pass': 2000,
    'Alpha Elite Pass': 4000
  };

  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];

  // Notifications
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }> = [];
  let notificationId = 0;

  onMount(() => {
    initializeForm();
    loadData();
  });

  function initializeForm() {
    const today = new Date().toISOString().split('T')[0];
    renewalFormData.paymentDate = today;
  }

  async function loadData() {
    try {
      isLoading = true;
      await Promise.all([
        loadMembers(),
        loadRenewalHistory()
      ]);
      generateRenewalCandidates();
    } catch (error) {
      console.error('Error loading renewal data:', error);
      showNotification('Failed to load renewal data', 'error');
    } finally {
      isLoading = false;
    }
  }

  async function loadMembers() {
    const q = query(collection(db, 'members'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    members = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
      } as Member;
    });
  }

  async function loadRenewalHistory() {
    try {
      const q = query(collection(db, 'renewalPayments'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      renewalPayments = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as RenewalPayment;
      });
    } catch (error) {
      // Renewal payments collection might not exist yet
      renewalPayments = [];
    }
  }

  function generateRenewalCandidates() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    renewalCandidates = members.map(member => {
      const expiryDate = new Date(member.expiryDate);
      const diffTime = expiryDate.getTime() - today.getTime();
      const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status: RenewalCandidate['status'];
      if (daysUntilExpiry < 0) {
        status = 'expired';
      } else if (daysUntilExpiry === 0) {
        status = 'expiring_today';
      } else if (daysUntilExpiry <= 7) {
        status = 'expiring_soon';
      } else {
        status = 'due_for_renewal';
      }

      return {
        member,
        daysUntilExpiry,
        status,
        recommendedAmount: membershipPricing[member.membershipType] || 0
      };
    }).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  function openRenewalForm(member: Member) {
    selectedMember = member;
    renewalFormData = {
      amount: membershipPricing[member.membershipType] || 0,
      paymentMethod: 'Cash',
      paymentDate: new Date().toISOString().split('T')[0],
      renewalMonths: member.membershipType === 'Alpha Elite Pass' ? 3 : 1,
      notes: ''
    };
    showRenewalForm = true;
  }

  function closeRenewalForm() {
    selectedMember = null;
    showRenewalForm = false;
    renewalFormData = {
      amount: 0,
      paymentMethod: 'Cash',
      paymentDate: new Date().toISOString().split('T')[0],
      renewalMonths: 1,
      notes: ''
    };
  }

  async function processRenewal() {
    if (!selectedMember) return;

    try {
      isProcessing = true;
      
      const batch = writeBatch(db);
      
      // Calculate new expiry date
      const currentExpiry = new Date(selectedMember.expiryDate);
      const today = new Date();
      const startFrom = currentExpiry > today ? currentExpiry : today;
      
      const newExpiry = new Date(startFrom);
      newExpiry.setMonth(newExpiry.getMonth() + renewalFormData.renewalMonths);
      
      const newExpiryStr = newExpiry.toISOString().split('T')[0];
      const renewalPeriod = formatRenewalPeriod(startFrom, newExpiry);

      // 1. Update member record
      const memberRef = doc(db, 'members', selectedMember.id);
      batch.update(memberRef, {
        expiryDate: newExpiryStr,
        status: 'Active',
        updatedAt: serverTimestamp()
      });

      // 2. Create renewal payment record
      const renewalRef = doc(collection(db, 'renewalPayments'));
      const renewalData = {
        memberId: selectedMember.id,
        memberName: selectedMember.name,
        membershipType: selectedMember.membershipType,
        amount: renewalFormData.amount,
        paymentMethod: renewalFormData.paymentMethod,
        paymentDate: renewalFormData.paymentDate,
        renewalPeriod,
        previousExpiryDate: selectedMember.expiryDate,
        newExpiryDate: newExpiryStr,
        notes: renewalFormData.notes.trim() || undefined,
        createdAt: serverTimestamp()
      };
      batch.set(renewalRef, renewalData);

      // 3. Create cashflow entry
      const cashflowRef = doc(collection(db, 'cashflow'));
      batch.set(cashflowRef, {
        type: 'income',
        source: selectedMember.membershipType,
        amount: renewalFormData.amount,
        date: renewalFormData.paymentDate,
        notes: `Membership renewal - ${selectedMember.name} (${renewalPeriod})`,
        linkedId: selectedMember.id,
        linkedType: 'member',
        customerName: selectedMember.name,
        paymentMethod: renewalFormData.paymentMethod,
        autoGenerated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      
      showNotification(
        `${selectedMember.name} renewed successfully! New expiry: ${formatDate(newExpiryStr)}`,
        'success'
      );
      
      closeRenewalForm();
      await loadData();
      
    } catch (error) {
      console.error('Error processing renewal:', error);
      showNotification('Failed to process renewal. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Bulk renewal for multiple members
  async function bulkRenewal(memberIds: string[]) {
    if (!confirm(`Are you sure you want to renew ${memberIds.length} member(s) with default settings?`)) {
      return;
    }

    try {
      isProcessing = true;
      const batch = writeBatch(db);
      let successCount = 0;

      for (const memberId of memberIds) {
        const member = members.find(m => m.id === memberId);
        if (!member) continue;

        const currentExpiry = new Date(member.expiryDate);
        const today = new Date();
        const startFrom = currentExpiry > today ? currentExpiry : today;
        const renewalMonths = member.membershipType === 'Alpha Elite Pass' ? 3 : 1;
        
        const newExpiry = new Date(startFrom);
        newExpiry.setMonth(newExpiry.getMonth() + renewalMonths);
        const newExpiryStr = newExpiry.toISOString().split('T')[0];
        
        // Update member
        batch.update(doc(db, 'members', memberId), {
          expiryDate: newExpiryStr,
          status: 'Active',
          updatedAt: serverTimestamp()
        });

        // Create renewal record
        const renewalRef = doc(collection(db, 'renewalPayments'));
        batch.set(renewalRef, {
          memberId: member.id,
          memberName: member.name,
          membershipType: member.membershipType,
          amount: membershipPricing[member.membershipType],
          paymentMethod: 'Cash',
          paymentDate: new Date().toISOString().split('T')[0],
          renewalPeriod: formatRenewalPeriod(startFrom, newExpiry),
          previousExpiryDate: member.expiryDate,
          newExpiryDate: newExpiryStr,
          notes: 'Bulk renewal',
          createdAt: serverTimestamp()
        });

        // Create cashflow entry
        const cashflowRef = doc(collection(db, 'cashflow'));
        batch.set(cashflowRef, {
          type: 'income',
          source: member.membershipType,
          amount: membershipPricing[member.membershipType],
          date: new Date().toISOString().split('T')[0],
          notes: `Bulk renewal - ${member.name}`,
          linkedId: member.id,
          linkedType: 'member',
          customerName: member.name,
          paymentMethod: 'Cash',
          autoGenerated: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        successCount++;
      }

      await batch.commit();
      showNotification(`Successfully renewed ${successCount} member(s)!`, 'success');
      await loadData();

    } catch (error) {
      console.error('Error processing bulk renewal:', error);
      showNotification('Failed to process bulk renewals. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Utility functions
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  function formatRenewalPeriod(startDate: Date, endDate: Date): string {
    const start = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const end = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return `${start} - ${end}`;
  }

  function getStatusColor(status: RenewalCandidate['status']) {
    switch (status) {
      case 'expired': return 'bg-red-100 text-red-800 border-red-200';
      case 'expiring_today': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'expiring_soon': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  }

  function getStatusLabel(status: RenewalCandidate['status'], days: number) {
    switch (status) {
      case 'expired': return `Expired ${Math.abs(days)} days ago`;
      case 'expiring_today': return 'Expires today';
      case 'expiring_soon': return `Expires in ${days} days`;
      default: return 'Active';
    }
  }

  function getStatusIcon(status: RenewalCandidate['status']) {
    switch (status) {
      case 'expired': return '🔴';
      case 'expiring_today': return '🟠';
      case 'expiring_soon': return '🟡';
      default: return '🟢';
    }
  }

  function getMembershipIcon(type: MembershipType): string {
    const icons = {
      'Day Pass': '🎫',
      'Warrior Pass': '🥉',
      'Gladiator Pass': '🥈',
      'Alpha Elite Pass': '🥇'
    };
    return icons[type] || '👥';
  }

  // Notification system
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

  // Filter renewal candidates
  $: filteredCandidates = renewalCandidates.filter(candidate => {
    const matchesSearch = candidate.member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         candidate.member.contact.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || candidate.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Statistics
  $: renewalStats = {
    total: renewalCandidates.length,
    expired: renewalCandidates.filter(c => c.status === 'expired').length,
    expiring_today: renewalCandidates.filter(c => c.status === 'expiring_today').length,
    expiring_soon: renewalCandidates.filter(c => c.status === 'expiring_soon').length,
    totalPotentialRevenue: renewalCandidates
      .filter(c => c.status !== 'due_for_renewal')
      .reduce((sum, c) => sum + c.recommendedAmount, 0),
    monthlyRenewalRevenue: renewalPayments
      .filter(p => new Date(p.paymentDate) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
      .reduce((sum, p) => sum + p.amount, 0)
  };

  // Selected members for bulk operations
  let selectedMembers = new Set<string>();

  function toggleMemberSelection(memberId: string) {
    if (selectedMembers.has(memberId)) {
      selectedMembers.delete(memberId);
    } else {
      selectedMembers.add(memberId);
    }
    selectedMembers = new Set(selectedMembers);
  }

  function selectAll() {
    const eligibleMembers = filteredCandidates
      .filter(c => c.status !== 'due_for_renewal')
      .map(c => c.member.id);
    selectedMembers = new Set(eligibleMembers);
  }

  function clearSelection() {
    selectedMembers = new Set();
  }
</script>

<svelte:head>
  <title>Member Renewals - Alpha Forge</title>
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
          on:click={removeNotification.bind(null, notification.id)}
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
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">🔄 Member Renewals</h1>
    <p class="text-gray-600">Manage member renewals and track payment history</p>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <!-- Expired Members -->
    <div class="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-red-800">Expired Members</p>
          <p class="text-2xl font-bold text-red-900">{renewalStats.expired}</p>
          <p class="text-xs text-red-700">Need immediate renewal</p>
        </div>
        <div class="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
          <span class="text-red-700 text-lg">🔴</span>
        </div>
      </div>
    </div>

    <!-- Expiring Soon -->
    <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-yellow-800">Expiring Soon</p>
          <p class="text-2xl font-bold text-yellow-900">{renewalStats.expiring_soon + renewalStats.expiring_today}</p>
          <p class="text-xs text-yellow-700">Next 7 days</p>
        </div>
        <div class="w-10 h-10 bg-yellow-200 rounded-full flex items-center justify-center">
          <span class="text-yellow-700 text-lg">⏰</span>
        </div>
      </div>
    </div>

    <!-- Potential Revenue -->
    <div class="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-green-800">Potential Revenue</p>
          <p class="text-2xl font-bold text-green-900">{formatCurrency(renewalStats.totalPotentialRevenue)}</p>
          <p class="text-xs text-green-700">From renewals needed</p>
        </div>
        <div class="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
          <span class="text-green-700 text-lg">💰</span>
        </div>
      </div>
    </div>

    <!-- Monthly Revenue -->
    <div class="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-blue-800">Monthly Renewals</p>
          <p class="text-2xl font-bold text-blue-900">{formatCurrency(renewalStats.monthlyRenewalRevenue)}</p>
          <p class="text-xs text-blue-700">This month</p>
        </div>
        <div class="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
          <span class="text-blue-700 text-lg">📊</span>
        </div>
      </div>
    </div>
  </div>

  <!-- View Mode Toggle -->
  <div class="flex justify-center mb-6">
    <div class="inline-flex bg-gray-100 rounded-lg p-1">
      <button
        on:click={() => viewMode = 'renewals'}
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors {
          viewMode === 'renewals'
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }"
      >
        🔄 Manage Renewals
      </button>
      <button
        on:click={() => viewMode = 'history'}
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors {
          viewMode === 'history'
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }"
      >
        📋 Payment History
      </button>
    </div>
  </div>

  {#if viewMode === 'renewals'}
    <!-- Renewal Management Tab -->
    
    <!-- Filters and Actions -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
        <h3 class="text-lg font-semibold text-gray-900">Renewal Dashboard</h3>
        <div class="flex flex-wrap gap-2">
          {#if selectedMembers.size > 0}
            <button
              on:click={() => bulkRenewal([...selectedMembers])}
              disabled={isProcessing}
              class="bg-green-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              💳 Renew Selected ({selectedMembers.size})
            </button>
            <button
              on:click={clearSelection}
              class="bg-gray-100 text-gray-700 px-3 py-2 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Selection
            </button>
          {:else}
            <button
              on:click={selectAll}
              class="bg-blue-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              Select All Expiring
            </button>
          {/if}
        </div>
      </div>

      <!-- Filters -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <input
            type="text"
            placeholder="Search members..."
            bind:value={searchTerm}
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <select
            bind:value={statusFilter}
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="expired">Expired Only</option>
            <option value="expiring_today">Expiring Today</option>
            <option value="expiring_soon">Expiring Soon</option>
          </select>
        </div>
        <div class="flex items-center text-sm text-gray-600">
          Showing {filteredCandidates.length} of {renewalCandidates.length} members
        </div>
      </div>
    </div>

    <!-- Renewal Candidates List -->
    {#if isLoading}
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-4 text-gray-600">Loading renewal data...</p>
        </div>
      </div>
    {:else if filteredCandidates.length === 0}
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div class="text-center">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="text-gray-400 text-2xl">🔄</span>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No renewals needed</h3>
          <p class="text-gray-500">All members are up to date with their renewals!</p>
        </div>
      </div>
    {:else}
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <input
                    type="checkbox"
                    on:change={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (target?.checked) {
                        selectAll();
                      } else {
                        clearSelection();
                      }
                    }}
                    class="rounded border-gray-300 text-blue-600"
                    aria-label="Select all members for renewal"
                  />
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Membership</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recommended</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each filteredCandidates as candidate}
                <tr class="hover:bg-gray-50 transition-colors {
                  candidate.status === 'expired' ? 'bg-red-25' :
                  candidate.status === 'expiring_today' ? 'bg-orange-25' :
                  candidate.status === 'expiring_soon' ? 'bg-yellow-25' : ''
                }">
                  <td class="px-6 py-4">
                    {#if candidate.status !== 'due_for_renewal'}
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(candidate.member.id)}
                        on:change={() => toggleMemberSelection(candidate.member.id)}
                        class="rounded border-gray-300 text-blue-600"
                      />
                    {/if}
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span class="text-blue-600 font-semibold text-sm">
                          {candidate.member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">{candidate.member.name}</div>
                        <div class="text-sm text-gray-500">{candidate.member.contact}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <span class="text-lg mr-2">{getMembershipIcon(candidate.member.membershipType)}</span>
                      <div>
                        <div class="text-sm font-medium text-gray-900">{candidate.member.membershipType}</div>
                        <div class="text-xs text-gray-500">Expires: {formatDate(candidate.member.expiryDate)}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border {getStatusColor(candidate.status)}">
                      <span class="mr-1">{getStatusIcon(candidate.status)}</span>
                      {getStatusLabel(candidate.status, candidate.daysUntilExpiry)}
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="text-lg font-bold text-green-600">
                      {formatCurrency(candidate.recommendedAmount)}
                    </div>
                    <div class="text-xs text-gray-500">
                      {candidate.member.membershipType === 'Alpha Elite Pass' ? '3 months' : '1 month'}
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <button
                      on:click={() => openRenewalForm(candidate.member)}
                      disabled={isProcessing}
                      class="bg-blue-600 text-white px-3 py-1 text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                    >
                      💳 Renew
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

  {:else}
    <!-- Payment History Tab -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900">Renewal Payment History</h3>
        <p class="text-sm text-gray-600 mt-1">Track all member renewal payments and receipts</p>
      </div>

      {#if renewalPayments.length === 0}
        <div class="p-8 text-center">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="text-gray-400 text-2xl">📋</span>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No renewal payments yet</h3>
          <p class="text-gray-500">Payment history will appear here after members renew their memberships.</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Membership</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each renewalPayments as payment}
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 text-sm text-gray-900">
                    <div class="font-medium">{formatDate(payment.paymentDate)}</div>
                    <div class="text-xs text-gray-500">
                      {payment.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span class="text-green-600 font-semibold text-xs">
                          {payment.memberName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div class="ml-3">
                        <div class="text-sm font-medium text-gray-900">{payment.memberName}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <span class="text-lg mr-2">{getMembershipIcon(payment.membershipType)}</span>
                      <span class="text-sm font-medium text-gray-900">{payment.membershipType}</span>
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="text-sm text-gray-900">{payment.renewalPeriod}</div>
                    <div class="text-xs text-gray-500">
                      Extended to {formatDate(payment.newExpiryDate)}
                    </div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <div class="text-lg font-bold text-green-600">{formatCurrency(payment.amount)}</div>
                  </td>
                  
                  <td class="px-6 py-4">
                    <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {payment.paymentMethod}
                    </span>
                    {#if payment.notes}
                      <div class="text-xs text-gray-500 mt-1">{payment.notes}</div>
                    {/if}
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
              Total: {renewalPayments.length} renewal payments
            </div>
            <div class="text-sm font-medium">
              Total Revenue: 
              <span class="text-green-600 font-bold">
                {formatCurrency(renewalPayments.reduce((sum, p) => sum + p.amount, 0))}
              </span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Renewal Form Modal -->
  {#if showRenewalForm && selectedMember}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              💳 Renew Membership
            </h2>
            <button
              on:click={closeRenewalForm}
              disabled={isProcessing}
              class="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close renewal form"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Member Info -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div class="flex items-center">
              <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span class="text-blue-600 font-bold text-lg">
                  {selectedMember.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div class="ml-4 flex-1">
                <h3 class="text-lg font-semibold text-blue-900">{selectedMember.name}</h3>
                <p class="text-sm text-blue-700">{selectedMember.membershipType}</p>
                <p class="text-sm text-blue-600">Current expiry: {formatDate(selectedMember.expiryDate)}</p>
              </div>
            </div>
          </div>

          <form on:submit|preventDefault={processRenewal} class="space-y-4">
            <!-- Payment Amount -->
            <div>
              <label for="amount" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount *
              </label>
              <input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                bind:value={renewalFormData.amount}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                required
              />
            </div>

            <!-- Payment Method -->
            <div>
              <label for="paymentMethod" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Method *
              </label>
              <select
                id="paymentMethod"
                bind:value={renewalFormData.paymentMethod}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                required
              >
                {#each paymentMethods as method}
                  <option value={method}>{method}</option>
                {/each}
              </select>
            </div>

            <!-- Payment Date -->
            <div>
              <label for="paymentDate" class="block text-sm font-medium text-gray-700 mb-2">
                Payment Date *
              </label>
              <input
                id="paymentDate"
                type="date"
                bind:value={renewalFormData.paymentDate}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                required
              />
            </div>

            <!-- Renewal Months -->
            <div>
              <label for="renewalMonths" class="block text-sm font-medium text-gray-700 mb-2">
                Renewal Period
              </label>
              <select
                id="renewalMonths"
                bind:value={renewalFormData.renewalMonths}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              >
                <option value={1}>1 Month</option>
                <option value={2}>2 Months</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
                <option value={12}>12 Months</option>
              </select>
            </div>

            <!-- Notes -->
            <div>
              <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                id="notes"
                bind:value={renewalFormData.notes}
                disabled={isProcessing}
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                placeholder="Additional notes for this renewal..."
              ></textarea>
            </div>

            <!-- Renewal Summary -->
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 class="font-medium text-green-800 mb-2">Renewal Summary</h4>
              <div class="text-sm text-green-700 space-y-1">
                <div><strong>Member:</strong> {selectedMember.name}</div>
                <div><strong>Amount:</strong> {formatCurrency(renewalFormData.amount)}</div>
                <div><strong>Period:</strong> {renewalFormData.renewalMonths} month{renewalFormData.renewalMonths !== 1 ? 's' : ''}</div>
                <div><strong>New Expiry:</strong> {(() => {
                  const currentExpiry = new Date(selectedMember.expiryDate);
                  const today = new Date();
                  const startFrom = currentExpiry > today ? currentExpiry : today;
                  const newExpiry = new Date(startFrom);
                  newExpiry.setMonth(newExpiry.getMonth() + renewalFormData.renewalMonths);
                  return formatDate(newExpiry.toISOString().split('T')[0]);
                })()}</div>
              </div>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                disabled={isProcessing}
                class="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:ring-2 focus:ring-green-500 transition-colors font-medium inline-flex items-center justify-center"
              >
                {#if isProcessing}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing Renewal...
                {:else}
                  💳 Process Renewal - {formatCurrency(renewalFormData.amount)}
                {/if}
              </button>
              <button
                type="button"
                on:click={closeRenewalForm}
                disabled={isProcessing}
                class="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 disabled:bg-gray-50 focus:ring-2 focus:ring-gray-500 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
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

  /* Status row backgrounds */
  .bg-red-25 {
    background-color: rgb(254 242 242);
  }

  .bg-orange-25 {
    background-color: rgb(255 247 237);
  }

  .bg-yellow-25 {
    background-color: rgb(254 252 232);
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

  /* Custom checkbox styles */
  input[type="checkbox"]:checked {
    background-color: #3b82f6;
    border-color: #3b82f6;
  }

  /* Smooth transitions */
  .transition-colors {
    transition-property: color, background-color, border-color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .overflow-x-auto table {
      min-width: 800px;
    }
  }
</style>