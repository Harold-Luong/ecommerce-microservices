import { idempotencyKeySchema } from "../schemas/order.schema.js";
import * as orderService from "../services/order.service.js";

export async function create(req, res, next) {
    try {
        const result = idempotencyKeySchema.safeParse(req.headers["idempotency-key"]);
        if (!result.success) return res.status(400).json({ message: "A valid Idempotency-Key header is required (8-100 characters)" });
        const checkout = await orderService.checkout({
            userId: req.auth.userId, accessToken: req.auth.accessToken, idempotencyKey: result.data,
        });
        return res.status(checkout.created ? 201 : 200).json({
            message: checkout.created ? "Order created" : "Existing order returned",
            data: checkout.order,
        });
    } catch (error) { return next(error); }
}

export async function index(req, res, next) {
    try {
        const result = await orderService.listOrders(req.validated.query, req.auth);
        return res.json({ data: result.items, pagination: result.pagination });
    } catch (error) { return next(error); }
}

export async function show(req, res, next) {
    try { return res.json({ data: await orderService.getOrder(req.validated.params.id, req.auth) }); }
    catch (error) { return next(error); }
}

export async function cancel(req, res, next) {
    try {
        return res.json({ message: "Order cancelled", data: await orderService.cancelOrder(req.validated.params.id, req.auth) });
    } catch (error) { return next(error); }
}
