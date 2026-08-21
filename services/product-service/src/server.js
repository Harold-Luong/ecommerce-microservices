import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.port, "0.0.0.0", () => {
    console.log(`product-service running on port ${env.port} [${env.nodeEnv}]`,);
});
