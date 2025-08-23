<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase';
  import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, orderBy, writeBatch } from 'firebase/firestore';
  import type { InventoryItem, PaymentMethod } from '$lib/types';

  interface CartItem extends InventoryItem {
    quantity: number;
    subtotal: number;
  }

  // State
  let inventory: InventoryItem[] = [];
  let cart: CartItem[] = [];
  let isLoading = true;
  let isProcessingSale = false;
  let searchTerm = '';
  let selectedPaymentMethod: PaymentMethod = 'Cash';
  let customerName = '';
  let saleComplete = false;
  let lastSaleAmount = 0;
  
  // UI States
  let showSidebar = true;
  let selectedQuantities: Record<string, number> = {};

  // Payment methods
  const paymentMethods: PaymentMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card'];

  onMount(() => {
    loadInventory();
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
    } finally {
      isLoading = false;
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
        alert(`Cannot add ${quantity} more. Only ${item.stock - existingCartItem.quantity} available.`);
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
        alert(`Cannot add ${quantity} items. Only ${item.stock} available.`);
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

  // Process sale
  async function processSale() {
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    if (!selectedPaymentMethod) {
      alert('Please select a payment method.');
      return;
    }

    isProcessingSale = true;

    try {
      const batch = writeBatch(db);

      // Create sale record
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

      const saleRef = doc(collection(db, 'sales'));
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

      // Create cashflow entry
      const cashflowRef = doc(collection(db, 'cashflow'));
      batch.set(cashflowRef, {
        type: 'income',
        source: 'Product Sale',
        amount: cartTotal,
        date: new Date().toISOString().split('T')[0],
        notes: `Store sale - ${cart.length} items${customerName ? ` - ${customerName}` : ''}`,
        linkedId: saleRef.id,
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

      setTimeout(() => {
        saleComplete = false;
      }, 3000);

    } catch (error) {
      console.error('Error processing sale:', error);
      alert('Failed to process sale. Please try again.');
    } finally {
      isProcessingSale = false;
    }
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

  // Filter products
  $: filteredInventory = inventory.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get stock color
  function getStockColor(stock: number) {
    if (stock <= 5) return 'text-red-600';
    if (stock <= 10) return 'text-yellow-600';
    return 'text-green-600';
  }
</script>

<svelte:head>
  <title>Store - Alpha Forge</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <div class="flex h-screen">
    <!-- Products Section -->
    <div class="flex-1 flex flex-col">
      <!-- Header -->
      <div class="bg-white border-b border-gray-200 p-6">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">🛒 Store</h1>
            <p class="text-gray-600">Sell products to customers</p>
          </div>
          <button
            on:click={() => showSidebar = !showSidebar}
            class="lg:hidden bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            {showSidebar ? 'Hide' : 'Show'} Cart
          </button>
        </div>
      </div>

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
            <p class="text-gray-500">No products available</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each filteredInventory as product}
              <div class="bg-white rounded-lg border border-gray-200 p-4">
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