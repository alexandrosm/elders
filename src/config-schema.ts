import { z } from 'zod';

// Model config can be a string or object
export const ModelConfigSchema = z.union([
  z.string(),
  z.object({
    model: z.string(),
    system: z.string().optional(),
  }),
]);

// Output configuration
export const OutputConfigSchema = z
  .object({
    format: z.enum(['text', 'json']).default('text'),
    showMeta: z.boolean().default(false),
    showModels: z.boolean().default(false),
  })
  .default({
    format: 'text',
    showMeta: false,
    showModels: false,
  });

// Web search configuration
export const WebSearchConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxResults: z.number().min(1).max(50).optional(),
    searchContext: z.enum(['low', 'medium', 'high']).optional(),
  })
  .optional();

// Council defaults
export const CouncilDefaultsSchema = z
  .object({
    rounds: z.number().min(1).max(10).optional(),
    single: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    showModels: z.boolean().optional(),
    meta: z.boolean().optional(),
    json: z.boolean().optional(),
    firstN: z.number().min(1).optional(),
    web: z.boolean().optional(),
    webMaxResults: z.number().min(1).max(50).optional(),
    webContext: z.enum(['low', 'medium', 'high']).optional(),
  })
  .optional();

// Council configuration
export const CouncilConfigSchema = z.object({
  models: z.array(ModelConfigSchema).min(1),
  system: z.string().optional(),
  synthesizer: ModelConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
  rounds: z.number().min(1).max(10).default(1),
  defaults: CouncilDefaultsSchema,
  webSearch: WebSearchConfigSchema,
});

// Main COE configuration
export const CoeConfigSchema = CouncilConfigSchema.extend({
  councils: z.record(z.string(), CouncilConfigSchema).optional(),
  defaultCouncil: z.string().optional(),
}).refine(
  (data) => {
    // If councils are defined and defaultCouncil is set, it must exist
    if (data.councils && data.defaultCouncil) {
      return data.defaultCouncil in data.councils;
    }
    return true;
  },
  {
    message: 'defaultCouncil must reference an existing council',
  }
);

// User defaults
export const UserDefaultsSchema = z.object({
  defaultCouncil: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  rounds: z.number().min(1).max(10).optional(),
  single: z.boolean().optional(),
  showModels: z.boolean().optional(),
  meta: z.boolean().optional(),
  json: z.boolean().optional(),
  export: z.string().optional(),
  web: z.boolean().optional(),
  webMaxResults: z.number().min(1).max(50).optional(),
  webContext: z.enum(['low', 'medium', 'high']).optional(),
});

// Complete config
export const ConfigSchema = z.object({
  openRouterApiKey: z.string().min(1, 'OpenRouter API key is required'),
  coeConfig: CoeConfigSchema,
  userDefaults: UserDefaultsSchema.optional(),
});

// Export inferred types
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type WebSearchConfig = z.infer<typeof WebSearchConfigSchema>;
export type CouncilDefaults = z.infer<typeof CouncilDefaultsSchema>;
export type CouncilConfig = z.infer<typeof CouncilConfigSchema>;
export type CoeConfig = z.infer<typeof CoeConfigSchema>;
export type UserDefaults = z.infer<typeof UserDefaultsSchema>;
export type Config = z.infer<typeof ConfigSchema>;
