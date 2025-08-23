<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
  import type { InventoryItem } from '$lib/types';

  // State
  let inventory: InventoryItem[] = [];
  let isLoading = true;
  let showAddForm = false;
  let editingItem: InventoryItem | null = null;
  let searchTerm = '';

  // Form data
  let formData = {
    productName: '',
    price: 0,
    stock: 0
  };

  // Form validation
  let errors: Record<string, string> = {};

  onMount(() => {
    loadInventory();
  });

  // Load inventory from Firestore
  async function loadInventory() {
    try {
      isLoading = true;
      const q = query(collection(db, 'inventory'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      inventory = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as InventoryItem;
      });
    } catch (error) {
      console.error('Error loading inventory:', error);
      alert('Failed to load inventory. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  // Validate form
  function validateForm() {
    errors = {};

    if (!formData.productName.trim()) {
      errors.productName = 'Product name is required';
    }

    if (formData.price < 0) {
      errors.price = 'Price cannot be negative';
    }

    if (formData.stock < 0) {
      errors.stock = 'Stock cannot be negative';
    }

    return Object.keys(errors).length === 0;
  }

  // Add new item
  async function addItem() {
    if (!validateForm()) return;

    try {
      const itemData = {
        productName: formData.productName.trim(),
        price: formData.price,
        stock: formData.stock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'inventory'), itemData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      await loadInventory();
      
      alert('Item added successfully!');
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Failed to add item. Please try again.');
    }
  }

  // Edit item
  function editItem(item: InventoryItem) {
    editingItem = item;
    formData = {
      productName: item.productName,
      price: item.price,
      stock: item.stock
    };
    showAddForm = true;
  }

  // Update item
  async function updateItem() {
    if (!validateForm() || !editingItem) return;

    try {
      const itemData = {
        productName: formData.productName.trim(),
        price: formData.price,
        stock: formData.stock,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'inventory', editingItem.id), itemData);
      
      // Reset form and reload
      resetForm();
      showAddForm = false;
      editingItem = null;
      await loadInventory();
      
      alert('Item updated successfully!');
    } catch (error) {
      console.error('Error updating item:', error);
      alert('Failed to update item. Please try again.');
    }
  }

  // Delete item
  async function deleteItem(item: InventoryItem) {
    if (!confirm(`Are you sure you want to delete ${item.productName}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'inventory', item.id));
      await loadInventory();
      alert('Item deleted successfully!');
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      productName: '',
      price: 0,
      stock: 0
    };
    errors = {};
    editingItem = null;
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

  // Get stock status
  function getStockStatus(stock: number) {
    if (stock === 0) return { text: 'Out of Stock', color: 'bg-red-100 text-red-800' };
    if (stock <= 5) return { text: 'Low Stock', color: 'bg-yellow-100 text-yellow-800' };
    return { text: 'In Stock', color: 'bg-green-100 text-green-800' };
  }

  // Filter inventory
  $: filteredInventory = inventory.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get statistics
  $: stats = {
    totalItems: inventory.length,
    totalValue: inventory.reduce((sum, item) => sum + (item.price * item.stock), 0),
    lowStock: inventory.filter(item => item.stock <= 5 && item.stock > 0).length,
    outOfStock: inventory.filter(item => item.stock === 0).length
  };
</script>

<svelte:head>
  <title>Inventory Management - Alpha Forge</title>
</svelte:head>

<div class="p-6">
  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <span class="text-blue-600 text-xl">📦</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Items</p>
          <p class="text-2xl font-bold text-gray-900">{stats.totalItems}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <span class="text-green-600 text-xl">💰</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Value</p>
          <p class="text-2xl font-bold text-green-600">{formatCurrency(stats.totalValue)}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
          <span class="text-yellow-600 text-xl">⚠️</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Low Stock</p>
          <p class="text-2xl font-bold text-yellow-600">{stats.lowStock}</p>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="flex items-center">
        <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
          <span class="text-red-600 text-xl">📋</span>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Out of Stock</p>
          <p class="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Actions and Search -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div class="flex-1">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Inventory Management</h2>
        <input
          type="text"
          placeholder="Search products..."
          bind:value={searchTerm}
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <button
        on:click={() => { resetForm(); showAddForm = true; }}
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium inline-flex items-center"
      >
        <span class="mr-2">+</span> Add Product
      </button>
    </div>
  </div>

  <!-- Add/Edit Form Modal -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900">
              {editingItem ? 'Edit Product' : 'Add New Product'}
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

          <form on:submit|preventDefault={editingItem ? updateItem : addItem} class="space-y-4">
            <!-- Product Name -->
            <div>
              <label for="productName" class="block text-sm font-medium text-gray-700 mb-2">
                Product Name *
              </label>
              <input
                id="productName"
                type="text"
                bind:value={formData.productName}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.productName ? 'border-red-500' : ''}"
                placeholder="Enter product name"
              />
              {#if errors.productName}
                <p class="text-red-600 text-sm mt-1">{errors.productName}</p>
              {/if}
            </div>

            <!-- Price -->
            <div>
              <label for="price" class="block text-sm font-medium text-gray-700 mb-2">
                Price (PHP) *
              </label>
              <input
                id="price"
                type="number"
                min="0"
                step="0.01"
                bind:value={formData.price}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.price ? 'border-red-500' : ''}"
                placeholder="0.00"
              />
              {#if errors.price}
                <p class="text-red-600 text-sm mt-1">{errors.price}</p>
              {/if}
            </div>

            <!-- Stock -->
            <div>
              <label for="stock" class="block text-sm font-medium text-gray-700 mb-2">
                Stock Quantity *
              </label>
              <input
                id="stock"
                type="number"
                min="0"
                bind:value={formData.stock}
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {errors.stock ? 'border-red-500' : ''}"
                placeholder="0"
              />
              {#if errors.stock}
                <p class="text-red-600 text-sm mt-1">{errors.stock}</p>
              {/if}
            </div>

            <!-- Form Actions -->
            <div class="flex gap-3 pt-6">
              <button
                type="submit"
                class="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 font-medium"
              >
                {editingItem ? 'Update Product' : 'Add Product'}
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

  <!-- Inventory List -->
  {#if isLoading}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading inventory...</p>
      </div>
    </div>
  {:else if filteredInventory.length === 0}
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div class="text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-gray-400 text-2xl">📦</span>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {inventory.length === 0 ? 'No products in inventory' : 'No products found'}
        </h3>
        <p class="text-gray-500 mb-6">
          {inventory.length === 0 ? 'Add your first product to get started!' : 'Try adjusting your search criteria.'}
        </p>
        {#if inventory.length === 0}
          <button
            on:click={() => { resetForm(); showAddForm = true; }}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Add First Product
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each filteredInventory as item}
              <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4">
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span class="text-blue-600 font-semibold text-sm">
                        {item.productName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{item.productName}</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  {formatCurrency(item.price)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  {item.stock}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                  {formatCurrency(item.price * item.stock)}
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getStockStatus(item.stock).color}">
                    {getStockStatus(item.stock).text}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm font-medium">
                  <div class="flex space-x-3">
                    <button
                      on:click={() => editItem(item)}
                      class="text-blue-600 hover:text-blue-900 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      on:click={() => deleteItem(item)}
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