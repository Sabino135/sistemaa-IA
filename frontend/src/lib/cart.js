import { writable } from 'svelte/store';

// Carrito de la tienda online (persistente en localStorage)
const KEY = 'daenerys_cart_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

export const cart = writable(load());

cart.subscribe(v => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage lleno */ }
});

export function addToCart(product, qty = 1) {
  cart.update(items => {
    const found = items.find(i => i.product_id === product.id);
    if (found) return items.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + qty } : i);
    return [...items, { product_id: product.id, name: product.name, price: Number(product.price), image_url: product.image_url || null, quantity: qty }];
  });
}

export function setQty(productId, qty) {
  cart.update(items => qty <= 0
    ? items.filter(i => i.product_id !== productId)
    : items.map(i => i.product_id === productId ? { ...i, quantity: qty } : i));
}

export function clearCart() { cart.set([]); }

export const cartCount = writable(0);
cart.subscribe(items => cartCount.set(items.reduce((a, i) => a + i.quantity, 0)));
