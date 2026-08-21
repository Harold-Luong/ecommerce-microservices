import { z } from "zod";

export const orderParamsSchema = z.object({ id: z.string().uuid() });
export const listOrdersSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const idempotencyKeySchema = z.string().trim().min(8).max(100);
