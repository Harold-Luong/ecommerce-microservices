import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const directory = path.dirname(fileURLToPath(import.meta.url));
export const swaggerSpec = YAML.parse(fs.readFileSync(path.resolve(directory, "../../docs/openapi.yaml"), "utf8"));
