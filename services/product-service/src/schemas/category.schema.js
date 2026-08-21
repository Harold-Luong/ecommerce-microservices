import { z } from "zod";

const slug = z.string().trim().min(1).max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers and hyphens only");

export const createCategorySchema = z.object({
    name: z.string().trim().min(1).max(255),
    slug,
}).strict();
