<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { 
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, 
    serverTimestamp, query, orderBy, writeBatch, where
  } from 'firebase/firestore';
  import type { Member, MembershipType, MemberStatus, PaymentMethod } from '$lib/types';

  // State
  let members: Member[] = [];
  let isLoading = true;
  let isProcessing = false;
  let showAddForm = false;
  let editingMember: Member | null = null;
  let searchTerm = '';
  let statusFilter: MemberStatus | 'All' = 'All';

  // Form data
  let formData = {
    name: '',
    contact: '',
    membershipType: 'Warrior Pass' as MembershipType,
    startDate: '',
    expiryDate: '',
    initialPayment: 0
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Membership plans with pricing - Updated with new pricing
  const membershipPlans = [
    { type: 'Day Pass' as MembershipType, duration: 1, unit: 'day', defaultPrice: 40 },
    { type: 'Warrior Pass' as MembershipType, duration: 1, unit: 'month', defaultPrice: 799 },
    { type: 'Gladiator Pass' as MembershipType, duration: 1, unit: 'custom', defaultPrice: 2000 },
    { type: 'Alpha Elite Pass' as MembershipType, duration: 3, unit: 'months', defaultPrice: 4000 }
  ];

  // Improved notification system
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }> = [];
  let notificationId = 0;

  onMount(() => {
    loadMembers();
    initializeForm();
  });

  function initializeForm() {
    const today = new Date().toISOString().split('T')[0];
    formData.startDate = today;
    formData.initialPayment = getDefaultPrice('Warrior Pass');
  }

  async function loadMembers() {
    try {
      isLoading = true;
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
    } catch (error) {
      console.error('Error loading members:', error);
      showNotification('Failed to load members. Please check your permissions.', 'error');
    } finally {
      isLoading = false;
    }
  }

  // Get default price for membership type
  function getDefaultPrice(membershipType: MembershipType): number {
    const plan = membershipPlans.find(p => p.type === membershipType);
    return plan ? plan.defaultPrice : 0;
  }

  // Calculate expiry date
  function calculateExpiryDate(membershipType: MembershipType, startDate: string): string {
    const start = new Date(startDate);
    const plan = membershipPlans.find(p => p.type === membershipType);
    
    if (!plan) return startDate;
    
    const expiry = new Date(start);
    if (plan.unit === 'day') {
      expiry.setDate(start.getDate() + plan.duration);
    } else if (plan.unit === 'month') {
      expiry.setMonth(start.getMonth() + plan.duration);
    } else if (plan.unit === 'months') {
      expiry.setMonth(start.getMonth() + plan.duration);
    }
    
    return expiry.toISOString().split('T')[0];
  }

  // Update expiry when membership type or start date changes
  $: if (formData.membershipType || formData.startDate) {
    if (formData.startDate && formData.membershipType !== 'Gladiator Pass') {
      formData.expiryDate = calculateExpiryDate(formData.membershipType, formData.startDate);
    }
    formData.initialPayment = getDefaultPrice(formData.membershipType);
  }

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.contact.trim()) {
      errors.contact = 'Contact is required';
    } else if (!/^\d{10,15}$/.test(formData.contact.replace(/\D/g, ''))) {
      errors.contact = 'Please enter a valid contact number';
    }

    if (!formData.startDate) {
      errors.startDate = 'Start date is required';
    }

    if (!formData.expiryDate) {
      errors.expiryDate = 'Expiry date is required';
    }

    if (formData.startDate && formData.expiryDate && 
        new Date(formData.expiryDate) <= new Date(formData.startDate)) {
      errors.expiryDate = 'Expiry date must be after start date';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new member
  async function addMember() {
    if (!validateForm()) return;

    try {
      isProcessing = true;

      const batch = writeBatch(db);

      // Create member record
      const memberRef = doc(collection(db, 'members'));
      const memberData = {
        name: formData.name.trim(),
        contact: formData.contact.trim(),
        membershipType: formData.membershipType,
        startDate: formData.startDate,
        expiryDate: formData.expiryDate,
        status: new Date(formData.expiryDate) > new Date() ? 'Active' : 'Expired',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      batch.set(memberRef, memberData);

      // Create cashflow entry if there's an initial payment
      if (formData.initialPayment > 0) {
        const cashflowRef = doc(collection(db, 'cashflow'));
        batch.set(cashflowRef, {
          type: 'income',
          source: formData.membershipType,
          amount: formData.initialPayment,
          date: formData.startDate,
          notes: `Initial membership payment - ${formData.name.trim()}`,
          linkedId: memberRef.id,
          linkedType: 'member',
          customerName: formData.name.trim(),
          paymentMethod: 'Cash' as PaymentMethod,
          autoGenerated: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      
      resetForm();
      showAddForm = false;
      await loadMembers();
      
      showNotification(`Member ${formData.name} added successfully!`, 'success');
    } catch (error) {
      console.error('Error adding member:', error);
      showNotification('Failed to add member. Please check your permissions.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Edit member
  function editMember(member: Member) {
    editingMember = member;
    formData = {
      name: member.name,
      contact: member.contact,
      membershipType: member.membershipType,
      startDate: member.startDate,
      expiryDate: member.expiryDate,
      initialPayment: 0
    };
    showAddForm = true;
  }

  // Update member
  async function updateMember() {
    if (!validateForm() || !editingMember) return;

    try {
      isProcessing = true;
      
      const memberData = {
        name: formData.name.trim(),
        contact: formData.contact.trim(),
        membershipType: formData.membershipType,
        startDate: formData.startDate,
        expiryDate: formData.expiryDate,
        status: new Date(formData.expiryDate) > new Date() ? 'Active' : 'Expired',
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'members', editingMember.id), memberData);
      
      resetForm();
      showAddForm = false;
      editingMember = null;
      await loadMembers();
      
      showNotification('Member updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating member:', error);
      showNotification('Failed to update member. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // IMPROVED DELETE MEMBER FUNCTION WITH CASHFLOW CLEANUP
  async function deleteMember(member: Member) {
    if (!confirm(`Are you sure you want to delete ${member.name}?\n\nThis will also remove all associated cashflow entries (payments, transactions, etc.) for this member.\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      isProcessing = true;
      showNotification(`Deleting member ${member.name} and cleaning up cashflow entries...`, 'info');
      
      const batch = writeBatch(db);
      
      // 1. Delete the member record
      batch.delete(doc(db, 'members', member.id));
      
      // 2. Find and delete all related cashflow entries
      console.log(`Looking for cashflow entries linked to member ${member.id}...`);
      
      // Search for cashflow entries linked to this member
      const cashflowQuery = query(
        collection(db, 'cashflow'),
        where('linkedId', '==', member.id)
      );
      
      const cashflowSnapshot = await getDocs(cashflowQuery);
      let deletedCashflowCount = 0;
      
      // Delete all linked cashflow entries
      cashflowSnapshot.docs.forEach(cashflowDoc => {
        console.log(`Found linked cashflow entry: ${cashflowDoc.id}`);
        batch.delete(doc(db, 'cashflow', cashflowDoc.id));
        deletedCashflowCount++;
      });
      
      // 3. Also search for cashflow entries that might match this member by name and membership type
      // (for older entries that might not have linkedId)
      const fallbackCashflowQuery = query(
        collection(db, 'cashflow'),
        where('type', '==', 'income'),
        where('source', '==', member.membershipType),
        where('customerName', '==', member.name)
      );
      
      const fallbackCashflowSnapshot = await getDocs(fallbackCashflowQuery);
      
      // Delete matching unlinked entries
      fallbackCashflowSnapshot.docs.forEach(cashflowDoc => {
        const data = cashflowDoc.data();
        // Only delete if not already marked for deletion and matches member details
        if (!cashflowSnapshot.docs.find(doc => doc.id === cashflowDoc.id)) {
          console.log(`Found unlinked cashflow entry: ${cashflowDoc.id}`);
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          deletedCashflowCount++;
        }
      });
      
      // 4. Search for any payment records if they exist
      try {
        const paymentsQuery = query(
          collection(db, 'memberPayments'),
          where('memberId', '==', member.id)
        );
        
        const paymentsSnapshot = await getDocs(paymentsQuery);
        paymentsSnapshot.docs.forEach(paymentDoc => {
          console.log(`Found member payment record: ${paymentDoc.id}`);
          batch.delete(doc(db, 'memberPayments', paymentDoc.id));
        });
      } catch (error) {
        // Member payments collection might not exist yet, that's fine
        console.log('Member payments collection not found, skipping...');
      }
      
      // Execute all deletions
      await batch.commit();
      
      // Reload members list
      await loadMembers();
      
      showNotification(
        `Member ${member.name} deleted successfully! Cleaned up ${deletedCashflowCount} cashflow entries.`, 
        'success'
      );
      
    } catch (error) {
      console.error('Error deleting member:', error);
      showNotification('Failed to delete member. Please try again.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Bulk cleanup function for orphaned cashflow entries
  async function cleanupOrphanedCashflowEntries() {
    if (!confirm('This will clean up cashflow entries that no longer have corresponding members. This action cannot be undone. Continue?')) {
      return;
    }

    try {
      isProcessing = true;
      showNotification('Starting cleanup of orphaned cashflow entries...', 'info');
      
      // Get all members and membership-related cashflow entries
      const [membersSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(query(
          collection(db, 'cashflow'), 
          where('type', '==', 'income')
        ))
      ]);

      // Create a Set of valid member IDs
      const validMemberIds = new Set(membersSnapshot.docs.map(doc => doc.id));
      
      const batch = writeBatch(db);
      let orphanedCount = 0;
      let linkedCount = 0;

      // Check each cashflow entry
      for (const cashflowDoc of cashflowSnapshot.docs) {
        const cashflowData = cashflowDoc.data();
        
        // Skip non-membership income sources
        if (!['Day Pass', 'Warrior Pass', 'Gladiator Pass', 'Alpha Elite Pass'].includes(cashflowData.source)) {
          continue;
        }
        
        // Check if it has a linkedId and if that member still exists
        if (cashflowData.linkedId && !validMemberIds.has(cashflowData.linkedId)) {
          console.log(`Found orphaned cashflow entry: ${cashflowDoc.id} -> member ${cashflowData.linkedId}`);
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          orphanedCount++;
        } else if (!cashflowData.linkedId && cashflowData.customerName) {
          // Try to link unlinked entries to existing members
          const matchingMember = membersSnapshot.docs.find(memberDoc => {
            const memberData = memberDoc.data();
            return memberData.name === cashflowData.customerName && 
                   memberData.membershipType === cashflowData.source;
          });
          
          if (matchingMember) {
            // Link the cashflow entry to the member
            batch.update(doc(db, 'cashflow', cashflowDoc.id), {
              linkedId: matchingMember.id,
              linkedType: 'member',
              autoGenerated: true,
              updatedAt: serverTimestamp()
            });
            linkedCount++;
          } else {
            // No matching member found, this entry is orphaned
            console.log(`Found orphaned cashflow entry (no member): ${cashflowDoc.id}`);
            batch.delete(doc(db, 'cashflow', cashflowDoc.id));
            orphanedCount++;
          }
        }
      }

      if (orphanedCount > 0 || linkedCount > 0) {
        await batch.commit();
        showNotification(`Cleanup completed! Deleted ${orphanedCount} orphaned entries, linked ${linkedCount} entries.`, 'success');
      } else {
        showNotification('All cashflow entries are properly linked. No cleanup needed.', 'info');
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
    const today = new Date().toISOString().split('T')[0];
    formData = {
      name: '',
      contact: '',
      membershipType: 'Warrior Pass',
      startDate: today,
      expiryDate: '',
      initialPayment: getDefaultPrice('Warrior Pass')
    };
    errors = {};
    editingMember = null;
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

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US');
  }

  function getStatusColor(status: MemberStatus) {
    return status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }

  function getMembershipColor(type: MembershipType) {
    switch (type) {
      case 'Day Pass': return 'bg-gray-100 text-gray-800';
      case 'Warrior Pass': return 'bg-orange-100 text-orange-800';
      case 'Gladiator Pass': return 'bg-purple-100 text-purple-800';
      case 'Alpha Elite Pass': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function getMembershipIcon(type: MembershipType): string {
    switch (type) {
      case 'Day Pass': return '🎫';
      case 'Warrior Pass': return '🥉';
      case 'Gladiator Pass': return '🥈';
      case 'Alpha Elite Pass': return '🥇';
      default: return '👥';
    }
  }

  // Get days until expiry
  function getDaysUntilExpiry(expiryDate: string): number {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

  // Filter members
  $: filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.contact.includes(searchTerm);
    const matchesStatus = statusFilter === 'All' || member.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Statistics
  $: stats = {
    total: members.length,
    active: members.filter(m => m.status === 'Active').length,
    expired: members.filter(m => m.status === 'Expired').length,
    expiringSoon: members.filter(m => {
      const days = getDaysUntilExpiry(m.expiryDate);
      return days <= 7 && days > 0;
    }).length,
    membershipBreakdown: membershipPlans.reduce((acc, plan) => {
      acc[plan.type] = members.filter(m => m.membershipType === plan.type).length;
      return acc;
    }, {} as Record<MembershipType, number>)
  };
</script>

<svelte:head>
  <title>Members Management - Alpha Forge</title>
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
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs lg:text-sm font-medium text-gray-600">Total Members</p>
          <p class="text-xl lg:text-2xl font-bold text-gray-900">{stats.total}</p>
          <p class="text-xs text-green-600">{stats.active} active</p>
        </div>
        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-lg">👥</span>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs lg:text-sm font-medium text-gray-600">Active Members</p>
          <p class="text-xl lg:text-2xl font-bold text-green-600">{stats.active}</p>
          <p class="text-xs text-green-500">{Math.round((stats.active / stats.total) * 100)}% retention</p>
        </div>
        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-lg">✅</span>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs lg:text-sm font-medium text-gray-600">Expired</p>
          <p class="text-xl lg:text-2xl font-bold text-red-600">{stats.expired}</p>
          <p class="text-xs text-red-500">Need renewal</p>
        </div>
        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <span class="text-red-600 text-lg">⏰</span>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs lg:text-sm font-medium text-gray-600">Expiring Soon</p>
          <p class="text-xl lg:text-2xl font-bold text-yellow-600">{stats.expiringSoon}</p>
          <p class="text-xs text-yellow-500">Next 7 days</p>
        </div>
        <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-lg">⚠️</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Actions and Filters -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Member Management</h2>
      <div class="flex flex-wrap gap-2">
        <button
          on:click={cleanupOrphanedCashflowEntries}
          disabled={isProcessing}
          class="bg-orange-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center"
        >
          <span class="mr-2">🧹</span> Cleanup Cashflow
        </button>
        <button
          on:click={() => { resetForm(); showAddForm = true; }}
          disabled={isProcessing}
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center"
        >
          <span class="mr-2">+</span> Add New Member
        </button>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <div class="flex-1">
        <input
          type="text"
          placeholder="Search by name or contact..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <select
          bind:value={statusFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Add/Edit Member Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingMember ? '✏️ Edit Member' : '➕ Add New Member'}
            </h2>
            <button
              on:click={cancelForm}
              disabled={isProcessing}
              class="text-gray-400 hover:text-gray-600 p-1 transition-colors"
              aria-label="Close form"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <form on:submit|preventDefault={editingMember ? updateMember : addMember} class="space-y-4">
            <!-- Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                id="name"
                type="text"
                bind:value={formData.name}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 {errors.name ? 'border-red-500' : ''}"
                placeholder="Enter member's full name"
                required
              />
              {#if errors.name}
                <p class="text-red-600 text-sm mt-1">{errors.name}</p>
              {/if}
            </div>

            <!-- Contact -->
            <div>
              <label for="contact" class="block text-sm font-medium text-gray-700 mb-2">
                Contact Number *
              </label>
              <input
                id="contact"
                type="text"
                bind:value={formData.contact}
                disabled={isProcessing}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 {errors.contact ? 'border-red-500' : ''}"
                placeholder="09123456789"
                required
              />
              {#if errors.contact}
                <p class="text-red-600 text-sm mt-1">{errors.contact}</p>
              {/if}
            </div>

            <!-- Two Column Layout for Membership Details -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Membership Type -->
              <div>
                <label for="membershipType" class="block text-sm font-medium text-gray-700 mb-2">
                  Membership Type *
                </label>
                <select
                  id="membershipType"
                  bind:value={formData.membershipType}
                  disabled={isProcessing}
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                  required
                >
                  {#each membershipPlans as plan}
                    <option value={plan.type}>
                      {plan.type} - {formatCurrency(plan.defaultPrice)}
                    </option>
                  {/each}
                </select>
              </div>

              <!-- Start Date -->
              <div>
                <label for="startDate" class="block text-sm font-medium text-gray-700 mb-2">
                  Start Date *
                </label>
                <input
                  id="startDate"
                  type="date"
                  bind:value={formData.startDate}
                  disabled={isProcessing}
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 {errors.startDate ? 'border-red-500' : ''}"
                  required
                />
                {#if errors.startDate}
                  <p class="text-red-600 text-sm mt-1">{errors.startDate}</p>
                {/if}
              </div>

              <!-- Expiry Date -->
              <div>
                <label for="expiryDate" class="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date *
                  {#if formData.membershipType !== 'Gladiator Pass'}
                    <span class="text-xs text-gray-500">(Auto-calculated)</span>
                  {/if}
                </label>
                <input
                  id="expiryDate"
                  type="date"
                  bind:value={formData.expiryDate}
                  disabled={isProcessing || (formData.membershipType !== 'Gladiator Pass')}
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 {errors.expiryDate ? 'border-red-500' : ''}"
                  required
                />
                {#if errors.expiryDate}
                  <p class="text-red-600 text-sm mt-1">{errors.expiryDate}</p>
                {/if}
              </div>

              <!-- Initial Payment (only for new members) -->
              {#if !editingMember}
                <div>
                  <label for="initialPayment" class="block text-sm font-medium text-gray-700 mb-2">
                    Initial Payment Amount
                  </label>
                  <input
                    id="initialPayment"
                    type="number"
                    min="0"
                    step="0.01"
                    bind:value={formData.initialPayment}
                    disabled={isProcessing}
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    placeholder="0"
                  />
                  <p class="text-xs text-gray-500 mt-1">Set to 0 to skip initial payment</p>
                </div>
              {/if}
            </div>

            <!-- Membership Summary -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 class="font-medium text-blue-800 mb-2">💡 Membership Summary</h4>
              <div class="text-sm text-blue-700 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><strong>Type:</strong> {formData.membershipType}</div>
                <div><strong>Duration:</strong> 
                  {#if formData.membershipType === 'Day Pass'}
                    1 Day
                  {:else if formData.membershipType === 'Warrior Pass'}
                    1 Month
                  {:else if formData.membershipType === 'Alpha Elite Pass'}
                    3 Months
                  {:else}
                    Custom Period
                  {/if}
                </div>
                <div><strong>Start:</strong> {formData.startDate ? formatDate(formData.startDate) : 'Not set'}</div>
                <div><strong>Expires:</strong> {formData.expiryDate ? formatDate(formData.expiryDate) : 'Not set'}</div>
                {#if !editingMember}
                  <div class="md:col-span-2"><strong>Payment:</strong> {formatCurrency(formData.initialPayment)}</div>
                {/if}
              </div>
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                disabled={isProcessing}
                class="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 font-medium inline-flex items-center justify-center"
              >
                {#if isProcessing}
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                {:else}
                  {editingMember ? '✏️ Update Member' : '➕ Add Member'}
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

  <!-- Membership Type Breakdown -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Membership Distribution</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each membershipPlans as plan}
        <div class="text-center p-4 bg-gray-50 rounded-lg border">
          <div class="text-2xl mb-2">{getMembershipIcon(plan.type)}</div>
          <div class="text-lg font-bold text-gray-900">{stats.membershipBreakdown[plan.type] || 0}</div>
          <div class="text-sm text-gray-600">{plan.type}</div>
          <div class="text-xs text-gray-500 mt-1">{formatCurrency(plan.defaultPrice)}</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Members List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading members...</p>
      </div>
    </div>
  {:else if filteredMembers.length === 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">👥</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {members.length === 0 ? 'No members yet' : 'No members found'}
        </h3>
        <p class="text-gray-500 mb-6">
          {members.length === 0 ? 'Add your first member to get started!' : 'Try adjusting your search or filter criteria.'}
        </p>
        {#if members.length === 0}
          <button
            on:click={() => { resetForm(); showAddForm = true; }}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Add First Member
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Membership</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredMembers as member}
              {@const daysUntilExpiry = getDaysUntilExpiry(member.expiryDate)}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span class="text-blue-600 font-semibold text-sm">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{member.name}</div>
                      <div class="text-sm text-gray-500">{member.contact}</div>
                      {#if daysUntilExpiry <= 7 && daysUntilExpiry > 0}
                        <div class="text-xs text-yellow-600 font-medium">
                          Expires in {daysUntilExpiry} days
                        </div>
                      {:else if daysUntilExpiry <= 0 && member.status === 'Expired'}
                        <div class="text-xs text-red-600 font-medium">
                          Expired {Math.abs(daysUntilExpiry)} days ago
                        </div>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <span class="text-lg mr-2">{getMembershipIcon(member.membershipType)}</span>
                    <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getMembershipColor(member.membershipType)}">
                      {member.membershipType}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  <div class="space-y-1">
                    <div class="text-sm">{formatDate(member.startDate)}</div>
                    <div class="text-xs text-gray-500">to {formatDate(member.expiryDate)}</div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getStatusColor(member.status)}">
                    {member.status}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editMember(member)}
                      disabled={isProcessing}
                      class="text-blue-600 hover:text-blue-900 disabled:text-gray-400 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteMember(member)}
                      disabled={isProcessing}
                      class="text-red-600 hover:text-red-900 disabled:text-gray-400 transition-colors duration-150"
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

      <!-- Summary Footer -->
      <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="text-sm text-gray-600">
            Showing {filteredMembers.length} of {members.length} members
          </div>
          <div class="text-sm font-medium">
            Active Members: 
            <span class="text-green-600 font-bold">{stats.active}</span>
            {#if stats.expiringSoon > 0}
              • <span class="text-yellow-600 font-bold">{stats.expiringSoon}</span> expiring soon
            {/if}
          </div>
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
</style>