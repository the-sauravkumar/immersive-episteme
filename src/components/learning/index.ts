/**
 * Learning components shared by the 2D pages and the 3D museum (identical behaviour in both
 * conditions): the StudyBar, the onboarding, the learning-phase time budget and hand-back, the
 * learning-task prompts, the hybrid guidance (hint and stall cue) and the unverified-content notice.
 */
export { GuidanceProvider, HintControl, StallCue, useGuidance } from "./guidance";
export {
  LearningPhaseContent,
  LearningPhaseProvider,
  LearningTimer,
  STUDY_HANDBACK_PATH,
  formatRemaining,
  useLearningPhase,
  type LearningPhaseMode,
} from "./learning-phase";
export { LearningTaskPrompts } from "./learning-task-prompts";
export { Onboarding, onboardingSteps, type OnboardingCondition, type OnboardingProps } from "./onboarding";
export { STUDY_BAR_LINK_CLASS, StudyBar, StudyBarButton, StudyBarLabel, type StudyBarButtonProps, type StudyBarProps } from "./study-bar";
export { UNVERIFIED_NOTICE_WORDS, UnverifiedContentNotice } from "./unverified-content-notice";
