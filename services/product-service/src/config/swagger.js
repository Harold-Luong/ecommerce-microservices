import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const openapiPath = path.resolve(currentDirectory, "../../docs/openapi.yaml");
export const swaggerSpec = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
