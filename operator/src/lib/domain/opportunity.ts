import { z } from "zod";

const fact = z.object({ text: z.string().min(1).max(360), quote: z.string().min(20).max(700) });
export const opportunitySchema = z.object({
  version: z.literal(1),
  company: fact,
  situation: fact,
  problem: fact.nullable(),
  possibleFit: z.string().min(1).max(400),
  nextQuestion: z.string().min(1).max(300),
  product: z.string().min(1).max(100),
  sourceUrl: z
    .url()
    .refine(
      (value) =>
        new URL(value).protocol === "https:" &&
        !new URL(value).username &&
        !new URL(value).password,
    ),
  sourceTitle: z.string().min(1).max(180),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  checkedAt: z.iso.datetime(),
});
