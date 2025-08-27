<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, orderBy, writeBatch, deleteDoc, where } from 'firebase/firestore';
  import type { InventoryItem, PaymentMethod } from '$lib/types';

  interface CartItem extends InventoryItem {
    quantity: number;
    subtotal: number;
  }

  interface Sale {
    id: string;
    items: SaleItem[];
    totalAmount: number;
    paymentMethod: PaymentMethod;
    customerName: string;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
  }

  interface SaleItem {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    subtotal: number;
  }

  // State
  let inventory: InventoryItem[] = [];
  let sales: Sale[] = [];
  let cart: CartItem[] = [];
  let isLoading = true;
  let isProcessingSale = false;
  let searchTerm = '';
  let selectedPaymentMethod: PaymentMethod = 'Cash';
  let customerName = '';
  let saleComplete = false;
  let lastSaleAmount = 0;
  let viewMode: 'store' | 'history' = 'store';
  let isLoadingSales = false;
  
  // UI States
  let showSidebar = true;
  let selectedQuantities: Record<string, number> = {};

  // Sales filtering
  let salesSearchTerm = '';
  let salesDateFilter = '';
  let salesPaymentFilter: PaymentMethod | 'All' = 'All';

  // Notification system
  let notifications: Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }> = [];
  let notificationId = 0;

  // Payment methods
  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];

  onMount(() => {
    loadInventory();
    if (viewMode === 'history') {
      loadSales();
    }
  });

  async function loadInventory() {
    try {
      isLoading = true;
      const q = query(collection(db, 'inventory'), orderBy('productName'));
      const querySnapshot = await getDocs(q);
      
      inventory = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as InventoryItem;
      }).filter(item => item.stock > 0);

      // Initialize quantities
      inventory.forEach(item => {
        selectedQuantities[item.id] = 1;
      });
    } catch (error) {
      console.error('Error loading inventory:', error);
      showNotification('Failed to load inventory', 'error');
    } finally {
      isLoading = false;
    }
  }

  async function loadSales() {
    try {
      isLoadingSales = true;
      const q = query(collection(db, 'sales'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      
      sales = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as Sale;
      });
    } catch (error) {
      console.error('Error loading sales:', error);
      showNotification('Failed to load sales history', 'error');
    } finally {
      isLoadingSales = false;
    }
  }

  // Switch view modes
  function switchViewMode(mode: 'store' | 'history') {
    viewMode = mode;
    if (mode === 'history' && sales.length === 0) {
      loadSales();
    }
  }

  // Add item to cart with selected quantity
  function addToCart(item: InventoryItem) {
    const quantity = selectedQuantities[item.id] || 1;
    const existingCartItem = cart.find(cartItem => cartItem.id === item.id);
    
    if (existingCartItem) {
      const newQuantity = existingCartItem.quantity + quantity;
      if (newQuantity <= item.stock) {
        existingCartItem.quantity = newQuantity;
        existingCartItem.subtotal = existingCartItem.quantity * existingCartItem.price;
        cart = [...cart];
      } else {
        showNotification(`Cannot add ${quantity} more. Only ${item.stock - existingCartItem.quantity} available.`, 'warning');
        return;
      }
    } else {
      if (quantity <= item.stock) {
        cart = [...cart, {
          ...item,
          quantity,
          subtotal: quantity * item.price
        }];
      } else {
        showNotification(`Cannot add ${quantity} items. Only ${item.stock} available.`, 'warning');
        return;
      }
    }
  }

  // Update cart quantity
  function updateCartQuantity(itemId: string, newQuantity: number) {
    const cartItem = cart.find(item => item.id === itemId);
    const inventoryItem = inventory.find(item => item.id === itemId);
    
    if (cartItem && inventoryItem) {
      if (newQuantity <= 0) {
        cart = cart.filter(item => item.id !== itemId);
      } else if (newQuantity <= inventoryItem.stock) {
        cartItem.quantity = newQuantity;
        cartItem.subtotal = newQuantity * cartItem.price;
        cart = [...cart];
      }
    }
  }

  // Remove from cart
  function removeFromCart(itemId: string) {
    cart = cart.filter(item => item.id !== itemId);
  }

  // Clear cart
  function clearCart() {
    cart = [];
  }

  // Process sale with proper linking
  async function processSale() {
    if (cart.length === 0) {
      showNotification('Cart is empty!', 'warning');
      return;
    }

    if (!selectedPaymentMethod) {
      showNotification('Please select a payment method.', 'warning');
      return;
    }

    isProcessingSale = true;

    try {
      const batch = writeBatch(db);

      // Create sale record
      const saleRef = doc(collection(db, 'sales'));
      const saleData = {
        items: cart.map(item => ({
          productId: item.id,
          productName: item.productName,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal
        })),
        totalAmount: cartTotal,
        paymentMethod: selectedPaymentMethod,
        customerName: customerName.trim() || 'Walk-in Customer',
        date: new Date(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      batch.set(saleRef, saleData);

      // Update inventory
      for (const cartItem of cart) {
        const inventoryRef = doc(db, 'inventory', cartItem.id);
        const inventoryItem = inventory.find(item => item.id === cartItem.id);
        
        if (inventoryItem) {
          const newStock = inventoryItem.stock - cartItem.quantity;
          batch.update(inventoryRef, {
            stock: newStock,
            updatedAt: serverTimestamp()
          });
        }
      }

      // Create cashflow entry with proper linking
      const cashflowRef = doc(collection(db, 'cashflow'));
      batch.set(cashflowRef, {
        type: 'income',
        source: 'Product Sale',
        amount: cartTotal,
        date: new Date().toISOString().split('T')[0],
        notes: `Store sale - ${cart.length} item${cart.length !== 1 ? 's' : ''}${customerName ? ` - ${customerName}` : ''}`,
        linkedId: saleRef.id,
        linkedType: 'sale',
        customerName: customerName.trim() || 'Walk-in Customer',
        paymentMethod: selectedPaymentMethod,
        autoGenerated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      // Success
      lastSaleAmount = cartTotal;
      saleComplete = true;
      clearCart();
      customerName = '';
      selectedPaymentMethod = 'Cash';
      await loadInventory();

      // Refresh sales if in history view
      if (viewMode === 'history') {
        await loadSales();
      }

      showNotification(`Sale completed successfully! Total: ${formatCurrency(lastSaleAmount)}`, 'success');

      setTimeout(() => {
        saleComplete = false;
      }, 3000);

    } catch (error) {
      console.error('Error processing sale:', error);
      showNotification('Failed to process sale. Please try again.', 'error');
    } finally {
      isProcessingSale = false;
    }
  }

  // Delete sale with inventory restoration and cashflow cleanup
  async function deleteSale(sale: Sale) {
    if (!confirm(`Are you sure you want to delete this sale?\n\nCustomer: ${sale.customerName}\nTotal: ${formatCurrency(sale.totalAmount)}\nDate: ${formatDate(sale.date)}\n\nThis will:\n- Restore inventory quantities\n- Remove cashflow entry\n- Cannot be undone`)) {
      return;
    }

    try {
      isProcessingSale = true;
      showNotification('Deleting sale and restoring inventory...', 'info');
      
      const batch = writeBatch(db);

      // 1. Delete the sale record
      batch.delete(doc(db, 'sales', sale.id));

      // 2. Restore inventory quantities
      for (const saleItem of sale.items) {
        // Find current inventory item
        const inventoryQuery = query(
          collection(db, 'inventory'),
          where('productName', '==', saleItem.productName)
        );
        
        const inventorySnapshot = await getDocs(inventoryQuery);
        
        if (!inventorySnapshot.empty) {
          const inventoryDoc = inventorySnapshot.docs[0];
          const currentStock = inventoryDoc.data().stock || 0;
          
          // Restore the sold quantity back to inventory
          batch.update(doc(db, 'inventory', inventoryDoc.id), {
            stock: currentStock + saleItem.quantity,
            updatedAt: serverTimestamp()
          });
        } else {
          // If product no longer exists in inventory, recreate it
          const newInventoryRef = doc(collection(db, 'inventory'));
          batch.set(newInventoryRef, {
            productName: saleItem.productName,
            price: saleItem.price,
            stock: saleItem.quantity,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 3. Find and delete related cashflow entries
      const cashflowQuery = query(
        collection(db, 'cashflow'),
        where('linkedId', '==', sale.id),
        where('type', '==', 'income'),
        where('source', '==', 'Product Sale')
      );
      
      const cashflowSnapshot = await getDocs(cashflowQuery);
      let deletedCashflowCount = 0;
      
      cashflowSnapshot.docs.forEach(cashflowDoc => {
        batch.delete(doc(db, 'cashflow', cashflowDoc.id));
        deletedCashflowCount++;
      });

      // 4. Fallback search for unlinked cashflow entries
      if (deletedCashflowCount === 0) {
        const saleDateString = sale.date.toISOString().split('T')[0];
        const fallbackCashflowQuery = query(
          collection(db, 'cashflow'),
          where('type', '==', 'income'),
          where('source', '==', 'Product Sale'),
          where('amount', '==', sale.totalAmount),
          where('date', '==', saleDateString)
        );
        
        const fallbackSnapshot = await getDocs(fallbackCashflowQuery);
        if (!fallbackSnapshot.empty) {
          const cashflowDoc = fallbackSnapshot.docs[0];
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          deletedCashflowCount++;
        }
      }

      await batch.commit();
      
      // Reload both sales and inventory
      await Promise.all([loadSales(), loadInventory()]);
      
      showNotification(
        `Sale deleted successfully! Restored ${sale.items.reduce((sum, item) => sum + item.quantity, 0)} items to inventory. ${deletedCashflowCount > 0 ? `Cleaned up ${deletedCashflowCount} cashflow ${deletedCashflowCount === 1 ? 'entry' : 'entries'}.` : ''}`, 
        'success'
      );

    } catch (error) {
      console.error('Error deleting sale:', error);
      showNotification('Failed to delete sale. Please try again.', 'error');
    } finally {
      isProcessingSale = false;
    }
  }

  // Export sales data
  function exportSalesData() {
    const csvData = [
      ['Date', 'Customer', 'Items', 'Total Amount', 'Payment Method', 'Created'].join(','),
      ...filteredSales.map(sale => [
        formatDate(sale.date),
        `"${sale.customerName}"`,
        sale.items.length,
        sale.totalAmount,
        sale.paymentMethod,
        formatDate(sale.createdAt)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store-sales-${salesDateFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Cleanup orphaned cashflow entries for sales
  async function cleanupSalesCashflowEntries() {
    if (!confirm('This will clean up product sale cashflow entries that no longer have corresponding sale records. This action cannot be undone. Continue?')) {
      return;
    }

    try {
      isProcessingSale = true;
      showNotification('Starting cleanup of orphaned sales cashflow entries...', 'info');
      
      const [salesSnapshot, cashflowSnapshot] = await Promise.all([
        getDocs(collection(db, 'sales')),
        getDocs(query(
          collection(db, 'cashflow'), 
          where('type', '==', 'income'),
          where('source', '==', 'Product Sale')
        ))
      ]);

      const validSaleIds = new Set(salesSnapshot.docs.map(doc => doc.id));
      
      const batch = writeBatch(db);
      let orphanedCount = 0;
      let linkedCount = 0;

      for (const cashflowDoc of cashflowSnapshot.docs) {
        const cashflowData = cashflowDoc.data();
        
        if (cashflowData.linkedId && !validSaleIds.has(cashflowData.linkedId)) {
          batch.delete(doc(db, 'cashflow', cashflowDoc.id));
          orphanedCount++;
        } else if (!cashflowData.linkedId) {
          // Try to link unlinked entries
          const matchingSale = salesSnapshot.docs.find(saleDoc => {
            const saleData = saleDoc.data();
            const saleDate = saleData.date?.toDate();
            const saleDateString = saleDate ? saleDate.toISOString().split('T')[0] : '';
            return saleData.totalAmount === cashflowData.amount && 
                   saleDateString === cashflowData.date;
          });
          
          if (matchingSale) {
            batch.update(doc(db, 'cashflow', cashflowDoc.id), {
              linkedId: matchingSale.id,
              linkedType: 'sale',
              autoGenerated: true,
              updatedAt: serverTimestamp()
            });
            linkedCount++;
          }
        }
      }

      if (orphanedCount > 0 || linkedCount > 0) {
        await batch.commit();
        showNotification(`Cleanup completed! Deleted ${orphanedCount} orphaned entries, linked ${linkedCount} entries.`, 'success');
      } else {
        showNotification('All sales cashflow entries are properly managed. No cleanup needed.', 'info');
      }

    } catch (error) {
      console.error('Error during cleanup:', error);
      showNotification('Error during cleanup. Please check console for details.', 'error');
    } finally {
      isProcessingSale = false;
    }
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

  // Calculate totals
  $: cartTotal = cart.reduce((total, item) => total + item.subtotal, 0);
  $: cartItemCount = cart.reduce((count, item) => count + item.quantity, 0);

  // Format currency
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

  // Filter products
  $: filteredInventory = inventory.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter sales
  $: filteredSales = sales.filter(sale => {
    const matchesSearch = sale.customerName.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
                         sale.items.some(item => item.productName.toLowerCase().includes(salesSearchTerm.toLowerCase()));
    const matchesDate = !salesDateFilter || sale.date.toISOString().split('T')[0] === salesDateFilter;
    const matchesPayment = salesPaymentFilter === 'All' || sale.paymentMethod === salesPaymentFilter;
    return matchesSearch && matchesDate && matchesPayment;
  });

  // Get stock color
  function getStockColor(stock: number) {
    if (stock <= 5) return 'text-red-600';
    if (stock <= 10) return 'text-yellow-600';
    return 'text-green-600';
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

  // Sales statistics
  $: salesStats = {
    total: sales.length,
    totalRevenue: sales.reduce((sum, sale) => sum + sale.totalAmount, 0),
    todaySales: sales.filter(sale => 
      sale.date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
    ).length,
    todayRevenue: sales.filter(sale => 
      sale.date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
    ).reduce((sum, sale) => sum + sale.totalAmount, 0),
    averageSale: sales.length > 0 ? sales.reduce((sum, sale) => sum + sale.totalAmount, 0) / sales.length : 0
  };
</script>

<svelte:head>
  <title>Store - Alpha Forge</title>
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

<div class="min-h-screen bg-gray-50">
  <!-- Header with View Mode Toggle -->
  <div class="bg-white border-b border-gray-200 p-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">🛒 Store Management</h1>
        <p class="text-gray-600">Sell products and manage sales history</p>
      </div>
      
      <!-- View Mode Toggle -->
      <div class="flex items-center gap-4">
        <div class="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            on:click={() => switchViewMode('store')}
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors {
              viewMode === 'store'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }"
          >
            🛒 Store
          </button>
          <button
            on:click={() => switchViewMode('history')}
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors {
              viewMode === 'history'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }"
          >
            📋 Sales History
          </button>
        </div>

        <!-- Mobile sidebar toggle for store view -->
        {#if viewMode === 'store'}
          <button
            on:click={() => showSidebar = !showSidebar}
            class="lg:hidden bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            {showSidebar ? 'Hide' : 'Show'} Cart
          </button>
        {/if}
      </div>
    </div>
  </div>

  {#if viewMode === 'store'}
    <!-- Store View -->
    <div class="flex h-screen">
      <!-- Products Section -->
      <div class="flex-1 flex flex-col">
        <!-- Search -->
        <div class="bg-white border-b border-gray-200 p-4">
          <input
            type="text"
            placeholder="Search products..."
            bind:value={searchTerm}
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <!-- Products Grid -->
        <div class="flex-1 overflow-y-auto p-6">
          {#if isLoading}
            <div class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p class="mt-2 text-gray-600">Loading products...</p>
            </div>
          {:else if filteredInventory.length === 0}
            <div class="text-center py-8">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-gray-400 text-2xl">📦</span>
              </div>
              <p class="text-gray-500">No products available</p>
              <p class="text-sm text-gray-400 mt-1">Check inventory management to add products</p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each filteredInventory as product}
                <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                      <h3 class="font-semibold text-gray-900">{product.productName}</h3>
                      <p class="text-blue-600 font-bold text-lg">{formatCurrency(product.price)}</p>
                      <p class="text-sm {getStockColor(product.stock)}">
                        {product.stock} in stock
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 mt-4">
                    <label class="text-sm text-gray-600 flex-shrink-0">Qty:</label>
                    <input
                      type="number"
                      min="1"
                      max={product.stock}
                      bind:value={selectedQuantities[product.id]}
                      class="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      on:click={() => addToCart(product)}
                      disabled={product.stock === 0}
                      class="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 text-sm font-medium"
                    >
                      {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Cart Sidebar -->
      <div class="w-96 bg-white border-l border-gray-200 flex flex-col {showSidebar ? '' : 'hidden lg:flex'}">
        <!-- Cart Header -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-gray-900">Cart</h2>
            <div class="text-sm text-gray-600">
              {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
            </div>
          </div>
        </div>

        <!-- Cart Items -->
        <div class="flex-1 overflow-y-auto p-4">
          {#if cart.length === 0}
            <div class="text-center py-8">
              <div class="text-gray-400 text-4xl mb-2">🛒</div>
              <p class="text-gray-500">Your cart is empty</p>
            </div>
          {:else}
            <div class="space-y-3">
              {#each cart as item}
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900">{item.productName}</h4>
                      <p class="text-sm text-gray-600">{formatCurrency(item.price)} each</p>
                    </div>
                    <button
                      on:click={() => removeFromCart(item.id)}
                      class="text-red-500 hover:text-red-700 p-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <button
                        on:click={() => updateCartQuantity(item.id, item.quantity - 1)}
                        class="w-8 h-8 bg-gray-200 rounded text-sm hover:bg-gray-300 font-bold"
                      >-</button>
                      <span class="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        on:click={() => updateCartQuantity(item.id, item.quantity + 1)}
                        class="w-8 h-8 bg-gray-200 rounded text-sm hover:bg-gray-300 font-bold"
                      >+</button>
                    </div>
                    <div class="font-bold text-blue-600">{formatCurrency(item.subtotal)}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Checkout Section -->
        {#if cart.length > 0}
          <div class="border-t border-gray-200 p-6 space-y-4">
            <!-- Customer Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Customer Name (Optional)</label>
              <input
                type="text"
                bind:value={customerName}
                placeholder="Enter customer name..."
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <!-- Payment Method -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
              <div class="grid grid-cols-2 gap-2">
                {#each paymentMethods as method}
                  <label class="flex items-center p-2 border rounded-lg cursor-pointer {selectedPaymentMethod === method ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}">
                    <input
                      type="radio"
                      bind:group={selectedPaymentMethod}
                      value={method}
                      class="mr-2"
                    />
                    <span class="text-sm">{method}</span>
                  </label>
                {/each}
              </div>
            </div>

            <!-- Total -->
            <div class="border-t pt-4">
              <div class="flex justify-between items-center mb-4">
                <span class="text-lg font-bold text-gray-900">Total:</span>
                <span class="text-2xl font-bold text-blue-600">{formatCurrency(cartTotal)}</span>
              </div>

              <!-- Action Buttons -->
              <div class="space-y-2">
                <button
                  on:click={processSale}
                  disabled={isProcessingSale}
                  class="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 font-semibold"
                >
                  {#if isProcessingSale}
                    Processing...
                  {:else}
                    Complete Sale - {formatCurrency(cartTotal)}
                  {/if}
                </button>
                
                <button
                  on:click={clearCart}
                  disabled={isProcessingSale}
                  class="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors duration-200"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

  {:else}
    <!-- Sales History View -->
    <div class="p-6">
      <!-- Sales Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Sales</p>
              <p class="text-2xl font-bold text-blue-600">{salesStats.total}</p>
              <p class="text-xs text-blue-500">All time transactions</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span class="text-blue-600 text-xl">📊</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Revenue</p>
              <p class="text-2xl font-bold text-green-600">{formatCurrency(salesStats.totalRevenue)}</p>
              <p class="text-xs text-green-500">Product sales</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span class="text-green-600 text-xl">💰</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Today's Sales</p>
              <p class="text-2xl font-bold text-purple-600">{salesStats.todaySales}</p>
              <p class="text-xs text-purple-500">{formatCurrency(salesStats.todayRevenue)}</p>
            </div>
            <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span class="text-purple-600 text-xl">🎯</span>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Average Sale</p>
              <p class="text-2xl font-bold text-indigo-600">{formatCurrency(salesStats.averageSale)}</p>
              <p class="text-xs text-indigo-500">Per transaction</p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <span class="text-indigo-600 text-xl">📈</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sales Filters and Actions -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <h2 class="text-lg font-semibold text-gray-900">Sales History</h2>
          <div class="flex gap-2">
            <button
              on:click={cleanupSalesCashflowEntries}
              disabled={isProcessingSale}
              class="bg-orange-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition-colors duration-200 font-medium inline-flex items-center"
            >
              <span class="mr-2">🧹</span> Cleanup Cashflow
            </button>
            <button
              on:click={exportSalesData}
              disabled={filteredSales.length === 0}
              class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200 font-medium text-sm"
            >
              📊 Export CSV
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search sales..."
              bind:value={salesSearchTerm}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <input
              type="date"
              bind:value={salesDateFilter}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <select
              bind:value={salesPaymentFilter}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All Payment Methods</option>
              {#each paymentMethods as method}
                <option value={method}>{method}</option>
              {/each}
            </select>
          </div>
          <div class="text-sm text-gray-600 flex items-center">
            Showing {filteredSales.length} of {sales.length} sales
          </div>
        </div>

        {#if salesSearchTerm || salesDateFilter || salesPaymentFilter !== 'All'}
          <div class="mt-4 flex items-center justify-between">
            <p class="text-sm text-gray-600">
              Filtered Revenue: <span class="font-medium text-green-600">{formatCurrency(filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0))}</span>
            </p>
            <button
              on:click={() => { 
                salesSearchTerm = ''; 
                salesDateFilter = ''; 
                salesPaymentFilter = 'All'; 
              }}
              class="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Clear filters
            </button>
          </div>
        {/if}
      </div>

      <!-- Sales List -->
      {#if isLoadingSales}
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p class="mt-4 text-gray-600">Loading sales history...</p>
          </div>
        </div>
      {:else if filteredSales.length === 0}
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div class="text-center">
            <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-gray-400 text-2xl">📋</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">
              {sales.length === 0 ? 'No sales recorded yet' : 'No sales found'}
            </h3>
            <p class="text-gray-500 mb-6">
              {sales.length === 0 ? 'Make your first sale to see it here!' : 'Try adjusting your search or filter criteria.'}
            </p>
            {#if sales.length === 0}
              <button
                on:click={() => switchViewMode('store')}
                class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                Go to Store
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
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Details</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each filteredSales as sale}
                  <tr class="hover:bg-gray-50 transition-colors duration-150">
                    <td class="px-6 py-4">
                      <div>
                        <div class="text-sm font-medium text-gray-900">{formatDate(sale.date)}</div>
                        <div class="text-sm text-gray-500">{formatTime(sale.date)}</div>
                        <div class="text-xs text-gray-400 mt-1">ID: {sale.id.slice(-8)}</div>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex items-center">
                        <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span class="text-green-600 font-semibold text-sm">
                            {sale.customerName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div class="ml-4">
                          <div class="text-sm font-medium text-gray-900">{sale.customerName}</div>
                          <div class="text-sm text-gray-500">Customer</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="text-sm text-gray-900">
                        {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                      </div>
                      <div class="text-xs text-gray-500 mt-1">
                        {#each sale.items.slice(0, 2) as item, index}
                          {item.productName} ({item.quantity}x){#if index < Math.min(sale.items.length, 2) - 1}, {/if}
                        {/each}
                        {#if sale.items.length > 2}
                          <br/>+{sale.items.length - 2} more...
                        {/if}
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="text-lg font-bold text-green-600">{formatCurrency(sale.totalAmount)}</div>
                    </td>
                    <td class="px-6 py-4">
                      <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full {getPaymentMethodColor(sale.paymentMethod)}">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-sm font-medium">
                      <div class="flex space-x-3">
                        <button
                          on:click={() => {
                            // Show sale details in a modal or expandable section
                            const itemsList = sale.items.map(item => 
                              `${item.productName}: ${item.quantity}x @ ${formatCurrency(item.price)} = ${formatCurrency(item.subtotal)}`
                            ).join('\n');
                            alert(`Sale Details:\n\nCustomer: ${sale.customerName}\nDate: ${formatDate(sale.date)} ${formatTime(sale.date)}\nPayment: ${sale.paymentMethod}\n\nItems:\n${itemsList}\n\nTotal: ${formatCurrency(sale.totalAmount)}`);
                          }}
                          class="text-blue-600 hover:text-blue-900 transition-colors duration-150 text-sm"
                        >
                          <span class="sm:hidden">👁️</span>
                          <span class="hidden sm:inline">View</span>
                        </button>
                        <button
                          on:click={() => deleteSale(sale)}
                          disabled={isProcessingSale}
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
                Showing {filteredSales.length} of {sales.length} sales
                {#if salesDateFilter}
                  for {formatDate(new Date(salesDateFilter))}
                {/if}
              </div>
              <div class="text-sm font-medium">
                Total Revenue: 
                <span class="text-green-600 font-bold">
                  {formatCurrency(filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Payment Method Breakdown -->
      <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-6">Sales by Payment Method</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {#each paymentMethods as method}
            {@const methodSales = sales.filter(s => s.paymentMethod === method)}
            {@const methodRevenue = methodSales.reduce((sum, s) => sum + s.totalAmount, 0)}
            <div class="text-center p-4 {getPaymentMethodColor(method)} border rounded-lg">
              <div class="text-2xl mb-2">
                {method === 'Cash' ? '💵' : 
                 method === 'GCash' ? '📱' : 
                 method === 'Bank Transfer' ? '🏦' : '💳'}
              </div>
              <div class="text-lg font-bold">{methodSales.length}</div>
              <div class="text-xs opacity-75">{method}</div>
              <div class="text-sm font-semibold mt-1">{formatCurrency(methodRevenue)}</div>
            </div>
          {/each}
        </div>

        <div class="mt-6 pt-6 border-t border-gray-200">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div class="text-2xl font-bold text-blue-600">{salesStats.total}</div>
              <div class="text-sm text-gray-600">Total Sales</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-green-600">{formatCurrency(salesStats.totalRevenue)}</div>
              <div class="text-sm text-gray-600">Total Revenue</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-600">{formatCurrency(salesStats.averageSale)}</div>
              <div class="text-sm text-gray-600">Average Sale</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Success Notification -->
  {#if saleComplete}
    <div class="fixed top-4 right-4 z-50">
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg">
        <div class="flex items-center">
          <span class="text-green-600 text-lg mr-2">✅</span>
          <div>
            <p class="font-semibold text-green-800">Sale Completed!</p>
            <p class="text-green-700">Total: {formatCurrency(lastSaleAmount)}</p>
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
  .animate-spin {
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
  .transition-colors {
    transition-property: color, background-color, border-color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  .transition-shadow {
    transition-property: box-shadow;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 200ms;
  }

  /* Focus states */
  input:focus, select:focus, button:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
  }

  /* Custom scrollbar for cart */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .overflow-x-auto table {
      min-width: 800px;
    }
  }
</style>