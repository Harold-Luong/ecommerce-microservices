import express from "express";
import authRoutes from "./routes/auth.route.js";
import { db } from "./config/database.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";

const app = express();

app.use(express.json());

app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec),
);

app.get("/health", async (req, res) => {
    try {
        await db.query("SELECT 1");

        res.status(200).json({
            status: "ok",
            service: "auth-service",
            database: "connected",
        });
    } catch (error) {
        res.status(503).json({
            status: "error",
            service: "auth-service",
            database: "disconnected",
        });
    }
});

app.use("/api/v1/auth", authRoutes);
app.use(errorHandler);

export default app;
