import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { db } from "./config/database.js";
import { swaggerSpec } from "./config/swagger.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";

export function createApp() {
    const app = express();

    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    app.get("/health", async (req, res) => {
        try {
            await db.query("SELECT 1");

            res.status(200).json({
                status: "ok",
                service: "product-service",
                database: "connected",
            });
        } catch (error) {
            res.status(503).json({
                status: "error",
                service: "product-service",
                database: "disconnected",
            });
        }
    });

    app.use("/api/products", productRoutes);
    app.use("/api/categories", categoryRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
