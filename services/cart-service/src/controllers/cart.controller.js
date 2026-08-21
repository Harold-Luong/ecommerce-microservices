import * as cartService from "../services/cart.service.js";

export async function show(req, res, next) {
    try { return res.json({ data: await cartService.getCart(req.auth.userId) }); }
    catch (error) { return next(error); }
}

export async function addItem(req, res, next) {
    try {
        const item = await cartService.addCartItem(req.auth.userId, req.validated.body);
        return res.status(201).json({ message: "Item added to cart", data: item });
    } catch (error) { return next(error); }
}

export async function updateItem(req, res, next) {
    try {
        const item = await cartService.updateCartItem(req.auth.userId, req.validated.params.productId, req.validated.body);
        return res.json({ message: "Cart item updated", data: item });
    } catch (error) { return next(error); }
}

export async function removeItem(req, res, next) {
    try {
        await cartService.removeCartItem(req.auth.userId, req.validated.params.productId);
        return res.status(204).send();
    } catch (error) { return next(error); }
}

export async function clear(req, res, next) {
    try {
        await cartService.removeAllCartItems(req.auth.userId);
        return res.status(204).send();
    } catch (error) { return next(error); }
}
