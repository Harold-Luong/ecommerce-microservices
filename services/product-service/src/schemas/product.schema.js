import { z } from "zod";

const categoryId = z.coerce.number().int().positive();
const name = z.string().trim().min(1).max(255);
const price = z.coerce.number().finite().nonnegative().multipleOf(0.01);
const stock = z.coerce.number().int().nonnegative();

export const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const createProductSchema = z.object({
    categoryId,
    name,
    price,
    stock: stock.default(0),
}).strict();

export const updateProductSchema = z.object({
    categoryId: categoryId.optional(),
    name: name.optional(),
    price: price.optional(),
    stock: stock.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
});

export const listProductsSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: categoryId.optional(),
    search: z.string().trim().max(255).optional(),
    minPrice: price.optional(),
    maxPrice: price.optional(),
}).refine((data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice, {
    message: "minPrice must be less than or equal to maxPrice",
    path: ["minPrice"],
});
