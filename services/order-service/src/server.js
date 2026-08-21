import { createApp } from "./app.js";
import { env } from "./config/env.js";

createApp().listen(env.port, "0.0.0.0", () => {
    console.log(`order-service running on port ${env.port} [${env.nodeEnv}]`);
});
