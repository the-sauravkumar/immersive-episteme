import type { Pool, PoolClient } from "pg";

import { itemConfigSchema } from "@/features/research/contracts";
import { carriesSampleText, type GeneratedAssessment } from "@/features/study/test-items";

type Q = Pick<Pool | PoolClient, "query">;

export async function seedTestBattery(q: Q, battery: readonly GeneratedAssessment[], version = 1): Promise<string[]> {
  const inserted: string[] = [];
  for (const assessment of battery) {
    const config = { ...(assessment.testType ? { testType: assessment.testType } : {}), ...(assessment.paged ? { paged: true } : {}), generatedFrom: "content/study templates" };
    const row = await q.query<{ id: string }>(
      `INSERT INTO assessments (code, version, kind, title, description, config, status, is_demo)
       VALUES ($1, $6, $2, $3, $4, $5::jsonb, 'draft', $7) ON CONFLICT (code, version) DO NOTHING RETURNING id`,
      [assessment.code, assessment.kind, assessment.title, assessment.description, JSON.stringify(config), version, carriesSampleText(assessment)],
    );
    const id = row.rows[0]?.id;
    if (!id) continue;
    for (const item of assessment.items) {
      const parsed = itemConfigSchema.parse(item.config);
      await q.query("INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config, answer_key) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)", [
        id,
        item.itemKey,
        item.position,
        item.kind,
        item.prompt,
        JSON.stringify(parsed),
        item.answerKey ? JSON.stringify(item.answerKey) : null,
      ]);
    }
    inserted.push(assessment.code);
  }
  return inserted;
}
