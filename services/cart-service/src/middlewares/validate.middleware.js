export function validate(schema, source = "body") {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            return res.status(400).json({
                message: "Validation failed",
                errors: result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
            });
        }
        req.validated = req.validated || {};
        req.validated[source] = result.data;
        return next();
    };
}
