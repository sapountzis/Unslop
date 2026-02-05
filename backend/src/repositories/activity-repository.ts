import { db } from '../db';
import { userActivity } from '../db/schema';
import type { Decision } from '../types/classification';

export interface ActivityInsert {
  userId: string;
  postId: string;
  decision: Decision;
  source: 'llm' | 'cache';
}

export async function insertActivity(input: ActivityInsert): Promise<void> {
  await db.insert(userActivity).values(input);
}

export async function insertActivities(inputs: ActivityInsert[]): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  await db.insert(userActivity).values(inputs);
}
