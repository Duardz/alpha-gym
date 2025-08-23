<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { 
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, 
    serverTimestamp, query, orderBy, writeBatch, where
  } from 'firebase/firestore';
  import type { Member, MembershipType, MemberStatus, PaymentMethod } from '$lib/types';

  interface MemberPayment {
    id?: string;
    memberId: string;
    memberName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    membershipType: MembershipType;
    period: string;
    notes?: string;
    createdAt?: Date;
  }

  // State
  let members: Member[] = [];
  let memberPayments: MemberPayment[] = [];
  let isLoading = true;
  let showAddForm = false;
  let showPaymentForm = false;
  let showPaymentHistory = false;
  let editingMember: Member | null = null;
  let selectedMemberForPayment: Member | null = null;
  let selectedMemberForHistory: Member | null = null;
  let searchTerm = '';
  let statusFilter: MemberStatus | 'All' = 'All';

  // Form data
  let formData = {
    name: '',
    contact: '',
    membershipType: 'Warrior Pass' as MembershipType,
    startDate: '',
    expiryDate: '',
    customAmount: 0
  };

  // Payment form data
  let paymentData = {
    amount: 0,
    paymentMethod: 'Cash' as PaymentMethod,
    paymentDate: '',
    period: '',
    notes: ''
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Membership plans with pricing
  const membershipPlans = [
    { type: 'Day Pass' as MembershipType, duration: 1, unit: 'day', defaultPrice: 100 },
    { type: 'Warrior Pass' as MembershipType, duration: 1, unit: 'month', defaultPrice: 1500 },
    { type: 'Gladiator Pass' as MembershipType, duration: 1, unit: 'custom', defaultPrice: 2000 },
    { type: 'Alpha Elite Pass' as MembershipType, duration: 3, unit: 'months', defaultPrice: 4000 }
  ];

  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];

  onMount(() => {
    loadMembers();
    loadMemberPayments();
    formData.startDate = new Date().toISOString().split('T')[0];
    paymentData.paymentDate = new Date().toISOString().split('T')[0];
  });

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
    } finally {
      isLoading = false;
    }
  }

  async function loadMemberPayments() {
    try {
      const q = query(collection(db, 'memberPayments'), orderBy('paymentDate', 'desc'));
      const querySnapshot = await getDocs(q);
      
      memberPayments = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as MemberPayment;
      });
    } catch (error) {
      console.error('Error loading member payments:', error);
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
    formData.customAmount = getDefaultPrice(formData.membershipType);
  }

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.contact.trim()) {
      errors.contact = 'Contact is required';
    }

    if (!formData.startDate) {
      errors.startDate = 'Start date is required';
    }

    if (!formData.expiryDate) {
      errors.expiryDate = 'Expiry date is required';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new member
  async function addMember() {
    if (!validateForm()) return;

    try {
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

      const docRef = await addDoc(collection(db, 'members'), memberData);
      
      // Auto-create initial payment record if amount > 0
      if (formData.customAmount > 0) {
        await createPaymentRecord(
          docRef.id, 
          formData.name, 
          formData.customAmount, 
          'Cash', 
          formData.startDate, 
          formData.membershipType, 
          'Initial membership payment'
        );
      }
      
      resetForm();
      showAddForm = false;
      await loadMembers();
      await loadMemberPayments();
      
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member. Please try again.');
    }
  }

  // Create payment record and cashflow entry
  async function createPaymentRecord(memberId: string, memberName: string, amount: number, method: PaymentMethod, date: string, membershipType: MembershipType, notes: string = '') {
    const batch = writeBatch(db);

    // Create payment record
    const paymentRef = doc(collection(db, 'memberPayments'));
    const paymentRecord = {
      memberId,
      memberName,
      amount,
      paymentMethod: method,
      paymentDate: date,
      membershipType,
      period: generatePeriodString(membershipType, date),
      notes,
      createdAt: serverTimestamp()
    };
    batch.set(paymentRef, paymentRecord);

    // Create cashflow entry
    const cashflowRef = doc(collection(db, 'cashflow'));
    batch.set(cashflowRef, {
      type: 'income',
      source: membershipType,
      amount,
      date,
      notes: `Membership payment - ${memberName}${notes ? ` - ${notes}` : ''}`,
      linkedId: memberId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }

  // Generate period string
  function generatePeriodString(membershipType: MembershipType, date: string): string {
    const startDate = new Date(date);
    const plan = membershipPlans.find(p => p.type === membershipType);
    
    if (!plan) return new Date(date).toLocaleDateString();
    
    if (plan.type === 'Day Pass') {
      return startDate.toLocaleDateString();
    }
    
    const endDate = new Date(startDate);
    if (plan.unit === 'month') {
      endDate.setMonth(startDate.getMonth() + plan.duration);
    } else if (plan.unit === 'months') {
      endDate.setMonth(startDate.getMonth() + plan.duration);
    }
    
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
  }

  // Show payment form for existing member
  function showPaymentFormFor(member: Member) {
    selectedMemberForPayment = member;
    paymentData = {
      amount: getDefaultPrice(member.membershipType),
      paymentMethod: 'Cash',
      paymentDate: new Date().toISOString().split('T')[0],
      period: generatePeriodString(member.membershipType, new Date().toISOString().split('T')[0]),
      notes: ''
    };
    showPaymentForm = true;
  }

  // Process payment for existing member
  async function processPayment() {
    if (!selectedMemberForPayment || paymentData.amount <= 0) return;

    try {
      await createPaymentRecord(
        selectedMemberForPayment.id,
        selectedMemberForPayment.name,
        paymentData.amount,
        paymentData.paymentMethod,
        paymentData.paymentDate,
        selectedMemberForPayment.membershipType,
        paymentData.notes
      );

      // Extend membership if it's a renewal
      if (paymentData.notes.toLowerCase().includes('renewal') || paymentData.notes.toLowerCase().includes('extend')) {
        const currentExpiryDate = new Date(selectedMemberForPayment.expiryDate);
        const extensionStartDate = currentExpiryDate > new Date() ? currentExpiryDate : new Date();
        const newExpiryDate = calculateExpiryDate(selectedMemberForPayment.membershipType, extensionStartDate.toISOString().split('T')[0]);
        
        await updateDoc(doc(db, 'members', selectedMemberForPayment.id), {
          expiryDate: newExpiryDate,
          status: 'Active',
          updatedAt: serverTimestamp()
        });
      }

      showPaymentForm = false;
      selectedMemberForPayment = null;
      await loadMembers();
      await loadMemberPayments();

    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Failed to process payment. Please try again.');
    }
  }

  // Show payment history
  function showPaymentHistoryFor(member: Member) {
    selectedMemberForHistory = member;
    showPaymentHistory = true;
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
      customAmount: getDefaultPrice(member.membershipType)
    };
    showAddForm = true;
  }

  // Update member
  async function updateMember() {
    if (!validateForm() || !editingMember) return;

    try {
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
      
    } catch (error) {
      console.error('Error updating member:', error);
      alert('Failed to update member. Please try again.');
    }
  }

  // Delete member
  async function deleteMember(member: Member) {
    if (!confirm(`Are you sure you want to delete ${member.name}? This will also delete all payment history.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'members', member.id));
      await loadMembers();
    } catch (error) {
      console.error('Error deleting member:', error);
      alert('Failed to delete member. Please try again.');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      name: '',
      contact: '',
      membershipType: 'Warrior Pass',
      startDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      customAmount: getDefaultPrice('Warrior Pass')
    };
    errors = {};
    editingMember = null;
  }

  // Cancel forms
  function cancelForm() {
    resetForm();
    showAddForm = false;
  }

  function cancelPaymentForm() {
    showPaymentForm = false;
    selectedMemberForPayment = null;
  }

  function cancelPaymentHistory() {
    showPaymentHistory = false;
    selectedMemberForHistory = null;
  }

  // Format currency
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP' 
    }).format(amount);
  }

  // Format date
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US');
  }

  // Get status color
  function getStatusColor(status: MemberStatus) {
    return status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }

  // Get membership color
  function getMembershipColor(type: MembershipType) {
    switch (type) {
      case 'Day Pass': return 'bg-gray-100 text-gray-800';
      case 'Warrior Pass': return 'bg-orange-100 text-orange-800';
      case 'Gladiator Pass': return 'bg-purple-100 text-purple-800';
      case 'Alpha Elite Pass': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Get member payments
  function getMemberPayments(memberId: string) {
    return memberPayments.filter(payment => payment.memberId === memberId);
  }

  // Get total paid by member
  function getTotalPaidByMember(memberId: string) {
    return getMemberPayments(memberId).reduce((total, payment) => total + payment.amount, 0);
  }

  // Get days until expiry
  function getDaysUntilExpiry(expiryDate: string): number {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
    totalRevenue: memberPayments.reduce((sum, p) => sum + p.amount, 0),
    thisMonthPayments: memberPayments.filter(p => 
      new Date(p.paymentDate).getMonth() === new Date().getMonth() &&
      new Date(p.paymentDate).getFullYear() === new Date().getFullYear()
    ).length,
    thisMonthRevenue: memberPayments.filter(p => 
      new Date(p.paymentDate).getMonth() === new Date().getMonth() &&
      new Date(p.paymentDate).getFullYear() === new Date().getFullYear()
    ).reduce((sum, p) => sum + p.amount, 0)
  };
</script>

<svelte:head>
  <title>Members Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Enhanced Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-lg">👥</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">Total Members</p>
          <p class="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-lg">✅</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">Active</p>
          <p class="text-xl font-bold text-green-600">{stats.active}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <span class="text-red-600 text-lg">⏰</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">Expired</p>
          <p class="text-xl font-bold text-red-600">{stats.expired}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-lg">⚠️</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">Expiring Soon</p>
          <p class="text-xl font-bold text-yellow-600">{stats.expiringSoon}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <span class="text-purple-600 text-lg">💰</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">Total Revenue</p>
          <p class="text-xl font-bold text-purple-600">{formatCurrency(stats.totalRevenue)}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <span class="text-indigo-600 text-lg">📅</span>
        </div>
        <div class="ml-3">
          <p class="text-xs font-medium text-gray-600">This Month</p>
          <p class="text-xl font-bold text-indigo-600">{formatCurrency(stats.thisMonthRevenue)}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Actions and Filters -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Member Management</h2>
      <button
        on:click={() => { resetForm(); showAddForm = true; }}
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">+</span> Add New Member
      </button>
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

  <!-- Add/Edit Member Form -->
  {#if showAddForm}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900">
          {editingMember ? 'Edit Member' : 'Add New Member'}
        </h3>
        <button
          on:click={cancelForm}
          class="text-gray-400 hover:text-gray-600"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <form on:submit|preventDefault={editingMember ? updateMember : addMember}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <!-- Name -->
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              id="name"
              type="text"
              bind:value={formData.name}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.name ? 'border-red-500' : ''}"
              placeholder="Enter full name"
            />
            {#if errors.name}
              <p class="text-red-600 text-sm mt-1">{errors.name}</p>
            {/if}
          </div>

          <!-- Contact -->
          <div>
            <label for="contact" class="block text-sm font-medium text-gray-700 mb-1">
              Contact Number *
            </label>
            <input
              id="contact"
              type="text"
              bind:value={formData.contact}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.contact ? 'border-red-500' : ''}"
              placeholder="09123456789"
            />
            {#if errors.contact}
              <p class="text-red-600 text-sm mt-1">{errors.contact}</p>
            {/if}
          </div>

          <!-- Membership Type -->
          <div>
            <label for="membershipType" class="block text-sm font-medium text-gray-700 mb-1">
              Membership Type *
            </label>
            <select
              id="membershipType"
              bind:value={formData.membershipType}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {#each membershipPlans as plan}
                <option value={plan.type}>{plan.type} - {formatCurrency(plan.defaultPrice)}</option>
              {/each}
            </select>
          </div>

          <!-- Start Date -->
          <div>
            <label for="startDate" class="block text-sm font-medium text-gray-700 mb-1">
              Start Date *
            </label>
            <input
              id="startDate"
              type="date"
              bind:value={formData.startDate}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.startDate ? 'border-red-500' : ''}"
            />
            {#if errors.startDate}
              <p class="text-red-600 text-sm mt-1">{errors.startDate}</p>
            {/if}
          </div>

          <!-- Expiry Date -->
          <div>
            <label for="expiryDate" class="block text-sm font-medium text-gray-700 mb-1">
              Expiry Date *
              {#if formData.membershipType !== 'Gladiator Pass'}
                <span class="text-sm text-gray-500">(Auto-calculated)</span>
              {/if}
            </label>
            <input
              id="expiryDate"
              type="date"
              bind:value={formData.expiryDate}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.expiryDate ? 'border-red-500' : ''}"
              readonly={formData.membershipType !== 'Gladiator Pass'}
            />
            {#if errors.expiryDate}
              <p class="text-red-600 text-sm mt-1">{errors.expiryDate}</p>
            {/if}
          </div>

          <!-- Payment Amount -->
          <div>
            <label for="customAmount" class="block text-sm font-medium text-gray-700 mb-1">
              Initial Payment Amount
            </label>
            <input
              id="customAmount"
              type="number"
              min="0"
              step="0.01"
              bind:value={formData.customAmount}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0"
            />
            <p class="text-xs text-gray-500 mt-1">Set to 0 to skip initial payment</p>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3">
          <button
            type="submit"
            class="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 font-medium"
          >
            {editingMember ? 'Update Member' : 'Add Member'}
          </button>
          <button
            type="button"
            on:click={cancelForm}
            class="bg-gray-100 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Payment Form -->
  {#if showPaymentForm}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900">
          Record Payment for {selectedMemberForPayment?.name}
        </h3>
        <button
          on:click={cancelPaymentForm}
          class="text-gray-400 hover:text-gray-600"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <form on:submit|preventDefault={processPayment}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <!-- Amount -->
          <div>
            <label for="paymentAmount" class="block text-sm font-medium text-gray-700 mb-1">
              Payment Amount *
            </label>
            <input
              id="paymentAmount"
              type="number"
              min="0.01"
              step="0.01"
              bind:value={paymentData.amount}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <!-- Payment Method -->
          <div>
            <label for="paymentMethod" class="block text-sm font-medium text-gray-700 mb-1">
              Payment Method *
            </label>
            <select
              id="paymentMethod"
              bind:value={paymentData.paymentMethod}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {#each paymentMethods as method}
                <option value={method}>{method}</option>
              {/each}
            </select>
          </div>

          <!-- Payment Date -->
          <div>
            <label for="paymentDate" class="block text-sm font-medium text-gray-700 mb-1">
              Payment Date *
            </label>
            <input
              id="paymentDate"
              type="date"
              bind:value={paymentData.paymentDate}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <!-- Period -->
          <div>
            <label for="period" class="block text-sm font-medium text-gray-700 mb-1">
              Period Covered
            </label>
            <input
              id="period"
              type="text"
              bind:value={paymentData.period}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., January 2024"
            />
          </div>
        </div>

        <!-- Notes -->
        <div class="mb-6">
          <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <input
            id="notes"
            type="text"
            bind:value={paymentData.notes}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Monthly renewal, Extension payment, etc."
          />
          <p class="text-xs text-gray-500 mt-1">Add "renewal" or "extend" to automatically extend membership</p>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3">
          <button
            type="submit"
            class="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200 font-medium"
          >
            Record Payment - {formatCurrency(paymentData.amount)}
          </button>
          <button
            type="button"
            on:click={cancelPaymentForm}
            class="bg-gray-100 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Payment History Modal -->
  {#if showPaymentHistory && selectedMemberForHistory}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">
              Payment History - {selectedMemberForHistory.name}
            </h3>
            <button
              on:click={cancelPaymentHistory}
              class="text-gray-400 hover:text-gray-600"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="p-6 overflow-y-auto max-h-96">
          {#if selectedMemberForHistory}
            {@const memberPaymentHistory = getMemberPayments(selectedMemberForHistory.id)}
            
            {#if memberPaymentHistory.length === 0}
              <div class="text-center py-8">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-gray-400 text-2xl">💳</span>
                </div>
                <p class="text-gray-500">No payment history found</p>
              </div>
            {:else}
              <div class="space-y-4">
                {#each memberPaymentHistory as payment}
                  <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div class="flex justify-between items-start">
                      <div class="flex-1">
                        <div class="flex items-center gap-4 mb-2">
                          <span class="text-2xl font-bold text-green-600">{formatCurrency(payment.amount)}</span>
                          <span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {payment.paymentMethod}
                          </span>
                          <span class="px-2 py-1 text-xs font-medium {getMembershipColor(payment.membershipType)} rounded">
                            {payment.membershipType}
                          </span>
                        </div>
                        <div class="text-sm text-gray-600">
                          <div><strong>Date:</strong> {formatDate(payment.paymentDate)}</div>
                          <div><strong>Period:</strong> {payment.period}</div>
                          {#if payment.notes}
                            <div><strong>Notes:</strong> {payment.notes}</div>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
              
              <div class="mt-6 pt-4 border-t border-gray-200">
                <div class="text-right">
                  <div class="text-sm text-gray-600">Total Payments: {memberPaymentHistory.length}</div>
                  <div class="text-lg font-bold text-green-600">
                    Total Amount: {formatCurrency(getTotalPaidByMember(selectedMemberForHistory.id))}
                  </div>
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}

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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payments</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredMembers as member}
              {@const memberPaymentHistory = getMemberPayments(member.id)}
              {@const totalPaid = getTotalPaidByMember(member.id)}
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
                  <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getMembershipColor(member.membershipType)}">
                    {member.membershipType}
                  </span>
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
                <td class="px-6 py-4">
                  <div class="text-sm">
                    <div class="font-medium text-green-600">{formatCurrency(totalPaid)}</div>
                    <div class="text-xs text-gray-500">
                      {memberPaymentHistory.length} payment{memberPaymentHistory.length !== 1 ? 's' : ''}
                    </div>
                    {#if memberPaymentHistory.length > 0}
                      <button
                        on:click={() => showPaymentHistoryFor(member)}
                        class="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        View history
                      </button>
                    {/if}
                  </div>
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => showPaymentFormFor(member)}
                      class="inline-flex items-center text-green-600 hover:text-green-900 transition-colors duration-150"
                      title="Record Payment"
                    >
                      <span class="mr-1">💰</span>
                      Pay
                    </button>
                    <button
                      on:click={() => editMember(member)}
                      class="text-blue-600 hover:text-blue-900 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteMember(member)}
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

  <!-- Recent Payments Section -->
  <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h3>
    
    {#if memberPayments.length === 0}
      <div class="text-center py-8">
        <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span class="text-gray-400 text-lg">💳</span>
        </div>
        <p class="text-gray-500">No payments recorded yet</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each memberPayments.slice(0, 10) as payment}
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="text-sm font-medium text-gray-900">{payment.memberName}</div>
                  <div class="text-xs {getMembershipColor(payment.membershipType)} inline-flex px-2 py-1 rounded">
                    {payment.membershipType}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm font-bold text-green-600">{formatCurrency(payment.amount)}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{payment.paymentMethod}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{formatDate(payment.paymentDate)}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-600">{payment.period}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-600">{payment.notes || '-'}</div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
      {#if memberPayments.length > 10}
        <div class="mt-4 text-center">
          <p class="text-sm text-gray-500">
            Showing 10 of {memberPayments.length} payments
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>