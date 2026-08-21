import * as categoryService from "../services/category.service.js";

export async function index(req, res, next) {
    try {
        return res.json({ data: await categoryService.listCategories() });
    } catch (error) { return next(error); }
}

export async function create(req, res, next) {
    try {
        const category = await categoryService.createCategory(req.validated.body, req.auth);
        return res.status(201).json({ message: "Category created successfully", data: category });
    } catch (error) { return next(error); }
}
