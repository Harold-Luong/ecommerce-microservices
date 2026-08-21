import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { db } from "./config/database.js";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import cartRoutes from "./routes/cart.routes.js";
import internalCartRoutes from "./routes/internal-cart.routes.js";

export function createApp() {
    const app = express();
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    app.get("/health", async (req, res) => {
        try {
            await db.query("SELECT 1");
            return res.json({ status: "ok", service: "cart-service", database: "connected" });
        } catch {
            return res.status(503).json({ status: "error", service: "cart-service", database: "disconnected" });
        }
    });

    app.use("/api/cart", cartRoutes);
    app.use("/internal/cart", internalCartRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
