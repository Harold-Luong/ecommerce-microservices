import * as productService from "../services/product.service.js";

export async function index(req, res, next) {
    try {
        const result = await productService.listProducts(req.validated.query);
        return res.json({ data: result.items, pagination: result.pagination });
    } catch (error) { return next(error); }
}

export async function show(req, res, next) {
    try { return res.json({ data: await productService.getProduct(req.validated.params.id) }); }
    catch (error) { return next(error); }
}

export async function create(req, res, next) {
    try {
        const product = await productService.createProduct(req.validated.body, req.auth);
        return res.status(201).json({ message: "Product created successfully", data: product });
    } catch (error) { return next(error); }
}

export async function update(req, res, next) {
    try {
        const product = await productService.updateProduct(req.validated.params.id, req.validated.body, req.auth);
        return res.json({ message: "Product updated successfully", data: product });
    } catch (error) { return next(error); }
}

export async function remove(req, res, next) {
    try {
        await productService.removeProduct(req.validated.params.id, req.auth);
        return res.status(204).send();
    } catch (error) { return next(error); }
}
