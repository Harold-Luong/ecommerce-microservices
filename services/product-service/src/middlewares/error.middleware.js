export function notFoundHandler(req, res) {
    return res.status(404).json({ message: "Route not found" });
}

export function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Invalid JSON body" });
    }

    if (error.code === "23505") {
        return res.status(409).json({ message: "Resource already exists" });
    }

    if (error.code === "23503") {
        return res.status(409).json({ message: "Resource is referenced by another resource" });
    }

    console.error(error);
    return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Internal server error",
    });
}
