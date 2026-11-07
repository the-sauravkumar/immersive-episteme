import type { DoorGuidance } from "@/features/process/domain/guidance";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import type { LearningResume } from "@/features/study/stage-coverage";

export interface DoorSessionProps {
  readonly templates: readonly StageTemplate[];
  readonly resume: LearningResume | null;
  readonly studyMode: boolean;
  readonly guidance: DoorGuidance;
}
