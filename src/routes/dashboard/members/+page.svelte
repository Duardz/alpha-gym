<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
  import type { Member, MembershipType, MemberStatus } from '$lib/types';

  // State
  let members: Member[] = [];
  let isLoading = true;
  let showAddForm = false;
  let editingMember: Member | null = null;
  let searchTerm = '';
  let statusFilter: MemberStatus | 'All' = 'All';
  let membershipFilter: MembershipType | 'All' = 'All';

  // Form data
  let formData = {
    name: '',
    contact: '',
    membershipType: 'Warrior Pass' as MembershipType,
    startDate: '',
    expiryDate: ''
  };

  // Form validation
  let errors: Record<string, string> = {};

  // Membership types with auto-expiry calculation
  const membershipTypes: MembershipType[] = ['Day Pass', 'Warrior Pass', 'Gladiator Pass', 'Alpha Elite Pass'];

  onMount(() => {
    loadMembers();
    // Set default start date to today
    formData.startDate = new Date().toISOString().split('T')[0];
    calculateExpiryDate();
  });

  // Calculate expiry date based on membership type and start date
  function calculateExpiryDate() {
    if (!formData.startDate) return;
    
    const startDate = new Date(formData.startDate);
    let expiryDate = new Date(startDate);

    switch (formData.membershipType) {
      case 'Day Pass':
        expiryDate.setDate(startDate.getDate() + 1);
        break;
      case 'Warrior Pass':
        expiryDate.setMonth(startDate.getMonth() + 1);
        break;
      case 'Gladiator Pass':
        // Custom duration - let user set manually
        return;
      case 'Alpha Elite Pass':
        expiryDate.setMonth(startDate.getMonth() + 3);
        break;
    }

    formData.expiryDate = expiryDate.toISOString().split('T')[0];
  }

  // Update expiry when membership type or start date changes
  $: if (formData.membershipType || formData.startDate) {
    calculateExpiryDate();
  }

  // Load members from Firestore
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
          // Auto-update status based on expiry date
          status: new Date(data.expiryDate) > new Date() ? 'Active' : 'Expired'
        } as Member;
      });
    } catch (error) {
      console.error('Error loading members:', error);
      alert('Failed to load members. Please try again.');
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

    if (!formData.contact.trim()) {
      errors.contact = 'Contact is required';
    }

    if (!formData.startDate) {
      errors.startDate = 'Start date is required';
    }

    if (!formData.expiryDate) {
      errors.expiryDate = 'Expiry date is required';
    }

    if (formData.startDate && formData.expiryDate && new Date(formData.expiryDate) <= new Date(formData.startDate)) {
      errors.expiryDate = 'Expiry date must be after start date';
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

      await addDoc(collection(db, 'members'), memberData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadMembers();
      
      alert('Member added successfully!');
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member. Please try again.');
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
      expiryDate: member.expiryDate
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
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingMember = null;
      await loadMembers();
      
      alert('Member updated successfully!');
    } catch (error) {
      console.error('Error updating member:', error);
      alert('Failed to update member. Please try again.');
    }
  }

  // Delete member
  async function deleteMember(member: Member) {
    if (!confirm(`Are you sure you want to delete ${member.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'members', member.id));
      await loadMembers();
      alert('Member deleted successfully!');
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
      expiryDate: ''
    };
    errors = {};
    editingMember = null;
    calculateExpiryDate();
  }

  // Cancel form
  function cancelForm() {
    resetForm();
    showAddForm = false;
  }

  // Format date for display
  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US');
  }

  // Get status badge color
  function getStatusColor(status: MemberStatus) {
    return status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }

  // Get membership type color
  function getMembershipColor(type: MembershipType) {
    switch (type) {
      case 'Day Pass': return 'bg-gray-100 text-gray-800';
      case 'Warrior Pass': return 'bg-orange-100 text-orange-800';
      case 'Gladiator Pass': return 'bg-purple-100 text-purple-800';
      case 'Alpha Elite Pass': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Filter members based on search and filters
  $: filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.contact.includes(searchTerm);
    const matchesStatus = statusFilter === 'All' || member.status === statusFilter;
    const matchesMembership = membershipFilter === 'All' || member.membershipType === membershipFilter;
    return matchesSearch && matchesStatus && matchesMembership;
  });

  // Get statistics
  $: stats = {
    total: members.length,
    active: members.filter(m => m.status === 'Active').length,
    expired: members.filter(m => m.status === 'Expired').length,
    byType: {
      'Day Pass': members.filter(m => m.membershipType === 'Day Pass').length,
      'Warrior Pass': members.filter(m => m.membershipType === 'Warrior Pass').length,
      'Gladiator Pass': members.filter(m => m.membershipType === 'Gladiator Pass').length,
      'Alpha Elite Pass': members.filter(m => m.membershipType === 'Alpha Elite Pass').length,
    }
  };
</script>

<svelte:head>
  <title>Members Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-xl">👥</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Members</p>
          <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-xl">✅</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Active Members</p>
          <p class="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
          <span class="text-red-600 text-xl">⏰</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Expired Members</p>
          <p class="text-2xl font-bold text-red-600">{stats.expired}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-xl">🏆</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Elite Members</p>
          <p class="text-2xl font-bold text-yellow-600">{stats.byType['Alpha Elite Pass']}</p>
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

    <!-- Search and Filter Row -->
    <div class="flex flex-col lg:flex-row gap-4">
      <div class="flex-1">
        <input
          type="text"
          placeholder="Search by name or contact..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div class="flex gap-3">
        <select
          bind:value={statusFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
        </select>
        <select
          bind:value={membershipFilter}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="All">All Types</option>
          {#each membershipTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
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
              {editingMember ? 'Edit Member' : 'Add New Member'}
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
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.name ? 'border-red-500' : ''}"
                placeholder="Enter full name"
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
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.contact ? 'border-red-500' : ''}"
                placeholder="09123456789"
              />
              {#if errors.contact}
                <p class="text-red-600 text-sm mt-1">{errors.contact}</p>
              {/if}
            </div>

            <!-- Membership Type -->
            <div>
              <label for="membershipType" class="block text-sm font-medium text-gray-700 mb-2">
                Membership Type *
              </label>
              <select
                id="membershipType"
                bind:value={formData.membershipType}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {#each membershipTypes as type}
                  <option value={type}>{type}</option>
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
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.startDate ? 'border-red-500' : ''}"
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
                  <span class="text-sm text-gray-500">(Auto-calculated)</span>
                {/if}
              </label>
              <input
                id="expiryDate"
                type="date"
                bind:value={formData.expiryDate}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.expiryDate ? 'border-red-500' : ''}"
                readonly={formData.membershipType !== 'Gladiator Pass'}
              />
              {#if errors.expiryDate}
                <p class="text-red-600 text-sm mt-1">{errors.expiryDate}</p>
              {/if}
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                class="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 font-medium"
              >
                {editingMember ? 'Update Member' : 'Add Member'}
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
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
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
</div>