import { connection } from "next/server";

import WorkoutsExperience from "@/components/workouts/WorkoutsExperience";
import PostOnboardingWorkoutGate from "@/components/post-onboarding/PostOnboardingWorkoutGate";
import { isWorkoutPersistenceV2Enabled } from "@/lib/workouts/runtime-policy";

export default async function WorkoutsPage() {
  await connection();
  return <PostOnboardingWorkoutGate><WorkoutsExperience persistenceV2Enabled={isWorkoutPersistenceV2Enabled()} /></PostOnboardingWorkoutGate>;
}
