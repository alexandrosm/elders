import { z } from 'zod';

// Schema for structured synthesis output
export const SynthesisSchema = z.object({
  summary: z.string().describe('A concise summary of the consensus'),
  keyPoints: z.array(z.string()).describe('Main points agreed upon by the council'),
  perspectives: z
    .array(
      z.object({
        model: z.string(),
        contribution: z.string().describe('Unique insight from this model'),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .describe('Individual model contributions'),
  disagreements: z.array(z.string()).optional().describe('Points of disagreement if any'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in the synthesis'),
  recommendations: z.array(z.string()).optional().describe('Actionable recommendations'),
  citations: z
    .array(
      z.object({
        source: z.string(),
        url: z.string().url(),
        relevance: z.string(),
      })
    )
    .optional()
    .describe('Supporting citations if available'),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
