import { releaseInventory, reserveInventory } from "../repositories/inventory.repository.js";

export function createReservation(data) {
    return reserveInventory(data);
}

export async function releaseReservation(orderId) {
    const reservation = await releaseInventory(orderId);
    if (!reservation) {
        const error = new Error("Inventory reservation not found");
        error.statusCode = 404;
        throw error;
    }
    return reservation;
}
