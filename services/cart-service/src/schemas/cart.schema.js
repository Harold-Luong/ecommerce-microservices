import { z } from "zod";

const productId = z.coerce.number().int().positive();
const quantity = z.coerce.number().int().min(1).max(999);

export const productParamsSchema = z.object({ productId });
export const addItemSchema = z.object({ productId, quantity }).strict();
export const updateItemSchema = z.object({ quantity }).strict();

export const consumeCartSchema = z.object({
    orderId: z.string().uuid(),
    userId: z.coerce.number().int().positive(),
    items: z.array(z.object({ productId, quantity }).strict()).min(1).max(100),
}).strict().refine((data) => new Set(data.items.map((item) => item.productId)).size === data.items.length, {
    message: "Duplicate product IDs are not allowed",
    path: ["items"],
});
