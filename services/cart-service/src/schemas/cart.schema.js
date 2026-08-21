import { z } from "zod";

const productId = z.coerce.number().int().positive();
const quantity = z.coerce.number().int().min(1).max(999);

export const productParamsSchema = z.object({ productId });
export const addItemSchema = z.object({ productId, quantity }).strict();
export const updateItemSchema = z.object({ quantity }).strict();
