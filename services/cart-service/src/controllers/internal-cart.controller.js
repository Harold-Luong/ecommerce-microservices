import { consumeCartItems } from "../services/cart.service.js";

export async function consume(req, res, next) {
    try {
        await consumeCartItems(req.validated.body.orderId, req.validated.body.userId, req.validated.body.items);
        return res.json({ message: "Cart items consumed" });
    } catch (error) { return next(error); }
}
