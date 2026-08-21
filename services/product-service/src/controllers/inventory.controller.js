import * as inventoryService from "../services/inventory.service.js";

export async function reserve(req, res, next) {
    try {
        const reservation = await inventoryService.createReservation(req.validated.body);
        return res.status(201).json({ message: "Inventory reserved", data: reservation });
    } catch (error) { return next(error); }
}

export async function release(req, res, next) {
    try {
        const reservation = await inventoryService.releaseReservation(req.validated.params.orderId);
        return res.json({ message: "Inventory released", data: reservation });
    } catch (error) { return next(error); }
}
