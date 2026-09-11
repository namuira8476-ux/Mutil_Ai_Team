import { z } from "zod";
import { modelSchema, modelDefaultsSchema } from "./model-selection";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9-]+$/)
  .max(100);
const skill = z.object({
  id,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  version: z.number().int().positive(),
  instructions: z.string().min(10).max(30000),
  icon: z.enum(["book", "code", "check"]),
  createdAt: z.number(),
  verified: z.record(z.string(), z.string()).default({}),
});
const relative = z.string().max(1000);
export const importSchema = z.object({
  format: z.literal("agent-workroom"),
  version: z.literal(1),
  modelDefaults: modelDefaultsSchema.optional(),
  projects: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(120),
        path: z.string().max(2000),
        raw: relative,
        wiki: relative,
        outputs: relative,
        createdAt: z.number(),
      }),
    )
    .max(100),
  skills: z.array(skill).max(1000),
  versions: z
    .array(
      skill.extend({ id: z.string().regex(/^[a-zA-Z0-9-]+@[1-9][0-9]*$/) }),
    )
    .max(10000),
  automations: z
    .array(
      z.object({
        id,
        projectId: id,
        name: z.string().min(1).max(120),
        enabled: z.boolean(),
        trigger: z.enum(["schedule", "file", "success"]),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timezone: z.string().max(100),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7),
        input: relative,
        output: relative,
        steps: z
          .array(
            z.object({
              provider: z.enum(["codex", "claude", "gemini"]),
              model: modelSchema.optional(),
              skillId: id,
              skillVersion: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(3),
        sourceSkillId: id.optional(),
        createdAt: z.number(),
      }),
    )
    .max(1000),
});
