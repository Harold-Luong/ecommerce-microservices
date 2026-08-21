import { getProduct } from "../clients/product.client.js";
import { addItem, clearCart, deleteItem, findCartByUserId, updateItem } from "../repositories/cart.repository.js";

function error(message, statusCode) {
    const value = new Error(message);
    value.statusCode = statusCode;
    return value;
}

export function getAvailability(product, quantity) {
    if (!product) return { available: false, availabilityReason: "PRODUCT_NOT_FOUND" };
    if (product.stock === 0) return { available: false, availabilityReason: "OUT_OF_STOCK" };
    if (product.stock < quantity) return { available: false, availabilityReason: "INSUFFICIENT_STOCK" };
    return { available: true, availabilityReason: null };
}

async function enrichCart(cart, userId) {
    if (!cart) return { id: null, user_id: String(userId), items: [], summary: { itemCount: 0, totalQuantity: 0, estimatedTotal: "0.00" } };

    const items = await Promise.all(cart.items.map(async (item) => {
        const product = await getProduct(item.product_id, { allowMissing: true });
        const subtotal = product ? (Number(product.price) * item.quantity).toFixed(2) : null;
        return { ...item, product, ...getAvailability(product, item.quantity), subtotal };
    }));
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedTotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0).toFixed(2);
    return { ...cart, items, summary: { itemCount: items.length, totalQuantity, estimatedTotal } };
}

export async function getCart(userId) {
    return enrichCart(await findCartByUserId(userId), userId);
}

export async function addCartItem(userId, data) {
    const product = await getProduct(data.productId);
    if (product.stock < data.quantity) throw error("Requested quantity exceeds available stock", 409);
    const item = await addItem(userId, data, product.stock);
    return { ...item, product, subtotal: (Number(product.price) * item.quantity).toFixed(2) };
}

export async function updateCartItem(userId, productId, data) {
    const product = await getProduct(productId);
    if (product.stock < data.quantity) throw error("Requested quantity exceeds available stock", 409);
    const item = await updateItem(userId, productId, data.quantity);
    if (!item) throw error("Cart item not found", 404);
    return { ...item, product, subtotal: (Number(product.price) * item.quantity).toFixed(2) };
}

export async function removeCartItem(userId, productId) {
    if (!await deleteItem(userId, productId)) throw error("Cart item not found", 404);
}

export function removeAllCartItems(userId) {
    return clearCart(userId);
}
