export function notFoundHandler(req, res) { return res.status(404).json({ message: "Route not found" }); }
export function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
    console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Internal server error" });
}
