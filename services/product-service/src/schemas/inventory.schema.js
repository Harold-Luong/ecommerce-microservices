import { z } from "zod";

const item = z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().max(999),
}).strict();

export const reserveInventorySchema = z.object({
    orderId: z.string().uuid(),
    userId: z.coerce.number().int().positive(),
    items: z.array(item).min(1).max(100),
    expiresInSeconds: z.coerce.number().int().min(60).max(86400).default(900),
}).strict().refine((data) => new Set(data.items.map((value) => value.productId)).size === data.items.length, {
    message: "Duplicate product IDs are not allowed",
    path: ["items"],
});

export const orderParamsSchema = z.object({ orderId: z.string().uuid() });
