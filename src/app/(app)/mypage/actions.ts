"use server";

import { getCurrentProfile } from "@/lib/supabase/auth";
import { getUserTrainingRecords } from "@/lib/queries";
import type { TrainingRecord } from "@/types";

export async function loadMyTrainingRecords(): Promise<TrainingRecord[]> {
  const profile = await getCurrentProfile();
  return (await getUserTrainingRecords(profile.id));
}
