import { findCategoryById } from "../repositories/category.repository.js";
import {
    deleteProductById, findProductById, findProducts, insertProduct, updateProductById,
} from "../repositories/product.repository.js";

function notFound(message) {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
}

async function ensureCategoryExists(categoryId) {
    if (!await findCategoryById(categoryId)) throw notFound("Category not found");
}

export async function listProducts(filters) {
    const { rows, total } = await findProducts(filters);
    return {
        items: rows,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: Math.ceil(total / filters.limit),
        },
    };
}

export async function getProduct(id) {
    const product = await findProductById(id);
    if (!product) throw notFound("Product not found");
    return product;
}

export async function createProduct(data, actor) {
    await ensureCategoryExists(data.categoryId);
    return insertProduct(data, actor);
}

export async function updateProduct(id, data, actor) {
    if (data.categoryId !== undefined) await ensureCategoryExists(data.categoryId);
    const product = await updateProductById(id, data, actor);
    if (!product) throw notFound("Product not found");
    return product;
}

export async function removeProduct(id, actor) {
    if (!await deleteProductById(id, actor)) throw notFound("Product not found");
}
