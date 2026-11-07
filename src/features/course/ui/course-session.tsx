"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { closeOpenCourseStop, reopenCourseStop, restoreCourseStop, startCourseSession, stepCourse, suspendCourseClock, type CourseAction, type CourseEvent, type CoursePanelRef, type CourseSessionModel, type CourseStep } from "@/features/course/application/course-session";
import { canFinish, canGoBack, canGoNext, isLastTradition, isProductPanel, reachedPanel, type CoursePosition, type CourseResume } from "@/features/course/domain/course-state";
import { barSegments, stagePanelModel } from "@/features/course/domain/panel-model";
import { finishLabel, NO_GUIDANCE, sessionHelpLines, type DoorGuidance } from "@/features/process/domain/guidance";
import { PRODUCT_TITLE, type StageTemplate } from "@/features/process/domain/stage-template";
import { StallCue } from "@/features/process/ui/stall-cue";
import { useGuidance, type GuidanceReport } from "@/features/process/ui/use-guidance";
import { useTabHidden } from "@/lib/use-tab-hidden";

import { usePanelControls } from "./course-dialogs";
import { ProductPanel, productImageSources } from "./product-panel";
import { ProgressBar } from "./progress-bar";
import { StagePanel, panelImageSources } from "./stage-panel";
import { preloadImages, usePanelImages } from "./use-panel-images";

import "@/styles/walking-tokens.css";
import "./course.css";

export interface CourseStageEvent {
  readonly tradition: StageTemplate["tradition"];
  readonly stageKey: string | null;
  readonly stageNumber: number | null;
  readonly panel: "stage" | "product";
}

export interface CourseSessionProps {
  readonly templates: readonly StageTemplate[];
  readonly reviewMarks?: boolean;
  readonly studyMode?: boolean;
  readonly guidance?: DoorGuidance;
  readonly onGuidance?: GuidanceReport;
  readonly resume?: CourseResume | null;
  readonly restore?: CoursePosition | null;
  readonly registerExit?: (close: () => void) => () => void;
  readonly onStageEntered?: (event: CourseStageEvent) => void;
  readonly onStageLeft?: (event: CourseStageEvent & { readonly activeMs: number }) => void;
  readonly onBackStep?: (event: { readonly from: CourseStageEvent; readonly to: CourseStageEvent }) => void;
  readonly onSourceOpened?: (event: CourseStageEvent) => void;
  readonly onFinished?: () => boolean | void | Promise<boolean>;
}

function stageEvent(templates: readonly StageTemplate[], at: CoursePanelRef): CourseStageEvent {
  const template = templates[at.tradition]!;
  const stage = at.isProduct ? null : template.stages[at.panel]!;
  return { tradition: template.tradition, stageKey: stage?.key ?? null, stageNumber: stage?.number ?? null, panel: at.isProduct ? "product" : "stage" };
}

function imagesFor(template: StageTemplate, panel: number): readonly string[] {
  return panel < template.stages.length ? panelImageSources(stagePanelModel(template, panel)) : productImageSources(template);
}

export function CourseSession({ templates, reviewMarks = false, studyMode = false, guidance = NO_GUIDANCE, onGuidance, resume = null, restore = null, registerExit, onStageEntered, onStageLeft, onBackStep, onSourceOpened, onFinished }: CourseSessionProps) {
  const stageCounts = useMemo(() => templates.map((template) => template.stages.length), [templates]);
  const [model, setModel] = useState<CourseSessionModel>(() => startCourseSession(stageCounts, 0, resume).model);
  const [sourcesOpenAt, setSourcesOpenAt] = useState<CoursePosition | null>(null);
  const modelRef = useRef(model);
  const handlers = useRef({ onStageEntered, onStageLeft, onBackStep, onFinished });
  const startedRef = useRef(false);
  const startResume = useRef(resume);

  useEffect(() => {
    handlers.current = { onStageEntered, onStageLeft, onBackStep, onFinished };
  }, [onStageEntered, onStageLeft, onBackStep, onFinished]);

  const adopt = useCallback((next: CourseSessionModel) => {
    modelRef.current = next;
    setModel(next);
  }, []);

  const emit = useCallback(
    (events: readonly CourseEvent[]) => {
      for (const event of events) {
        if (event.type === "entered") handlers.current.onStageEntered?.(stageEvent(templates, event.at));
        if (event.type === "left") handlers.current.onStageLeft?.({ ...stageEvent(templates, event.at), activeMs: event.activeMs });
        if (event.type === "back-step") handlers.current.onBackStep?.({ from: stageEvent(templates, event.from), to: stageEvent(templates, event.to) });
        if (event.type === "finished") {
          void Promise.resolve(handlers.current.onFinished?.()).then((accepted) => {
            if (accepted === false) adopt(reopenCourseStop(modelRef.current, Date.now()));
          });
        }
      }
    },
    [adopt, templates],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const started = startCourseSession(stageCounts, Date.now(), startResume.current);
    adopt(started.model);
    emit(started.events);
  }, [adopt, emit, stageCounts]);

  useEffect(() => {
    const close = () => {
      const closed = closeOpenCourseStop(modelRef.current, Date.now());
      modelRef.current = closed.model;
      emit(closed.events);
    };
    modelRef.current = reopenCourseStop(modelRef.current, Date.now());
    const unregister = registerExit?.(close);
    return () => {
      unregister?.();
      close();
    };
  }, [emit, registerExit]);

  const headingFocus = useRef(false);
  const applyStep = useCallback(
    (step: CourseStep) => {
      if (step.model === modelRef.current) return;
      headingFocus.current = true;
      adopt(step.model);
      emit(step.events);
    },
    [adopt, emit],
  );
  const dispatch = useCallback((action: CourseAction) => applyStep(stepCourse(modelRef.current, action, Date.now())), [applyStep]);

  const appliedRestore = useRef(restore);
  useEffect(() => {
    if (!restore || restore === appliedRestore.current) return;
    appliedRestore.current = restore;
    applyStep(restoreCourseStop(modelRef.current, restore, Date.now()));
  }, [applyStep, restore]);

  const { state } = model;
  const template = templates[state.tradition]!;
  const onProduct = isProductPanel(state);
  const sources = useMemo(() => imagesFor(template, state.panel), [template, state.panel]);
  const images = usePanelImages(sources);
  const helpLines = useMemo(() => sessionHelpLines(guidance.time), [guidance.time]);
  const panelControls = usePanelControls(helpLines);
  const tabHidden = useTabHidden();
  const sourcesOpen = sourcesOpenAt?.tradition === state.tradition && sourcesOpenAt.stop === state.panel;
  const progress = state.reached.join(".");
  const guide = useGuidance({ guidance, progress, suspended: panelControls.dialogOpen || sourcesOpen || tabHidden, report: onGuidance });
  const controls = panelControls.controls(guide);
  const suspended = panelControls.dialogOpen || guide.hintOpen || sourcesOpen || tabHidden;

  useEffect(() => {
    modelRef.current = suspendCourseClock(modelRef.current, suspended, Date.now());
  }, [suspended]);

  useEffect(() => {
    if (!images.settled) return;
    const nextPanel = state.panel + 1;
    if (nextPanel <= template.stages.length) preloadImages(imagesFor(template, nextPanel));
  }, [images.settled, state.panel, template]);

  useEffect(() => {
    if (!headingFocus.current) return;
    headingFocus.current = false;
    document.getElementById("course-stage-name")?.focus({ preventScroll: true });
  }, [state.panel, state.tradition]);

  const sourceOpened = () => {
    setSourcesOpenAt({ tradition: state.tradition, stop: state.panel });
    onSourceOpened?.(stageEvent(templates, { tradition: state.tradition, panel: state.panel, isProduct: onProduct }));
  };
  const sourceClosed = () => setSourcesOpenAt(null);

  const previousStage = onProduct ? template.stages.at(-1) : template.stages[state.panel - 1];
  const nextStage = template.stages[state.panel + 1];
  const nextTemplate = templates[state.tradition + 1];
  const finishing = onProduct && isLastTradition(state);

  const forwardDetail = onProduct ? (nextTemplate ? nextTemplate.traditionName : null) : nextStage ? `${nextStage.number} ${nextStage.name}` : PRODUCT_TITLE;

  return (
    <div className="course walking" data-course-root="" data-tradition={template.tradition} data-panel={onProduct ? "product" : state.panel + 1}>
      <div className="course-frame">
      {onProduct ? (
        <ProductPanel template={template} imageStatus={images.status} controls={controls} onSourcesOpened={sourceOpened} onSourcesClosed={sourceClosed} />
      ) : (
        <StagePanel model={stagePanelModel(template, state.panel)} reviewMarks={reviewMarks} imageStatus={images.status} controls={controls} onSourcesOpened={sourceOpened} onSourcesClosed={sourceClosed} />
      )}
      <ProgressBar
        back={{
          label: "Back",
          detail: previousStage ? `${previousStage.number} ${previousStage.name}` : null,
          disabled: !canGoBack(state),
          onPress: () => dispatch({ type: "back" }),
        }}
        forward={{
          label: finishing ? finishLabel(studyMode) : "Next",
          detail: finishing ? null : forwardDetail,
          disabled: !images.settled || (finishing ? !canFinish(state) || model.finishing : !canGoNext(state)),
          onPress: () => dispatch({ type: finishing ? "finish" : "next" }),
        }}
        segments={barSegments(template)}
        currentIndex={onProduct ? -1 : state.panel}
        reachedIndex={Math.min(reachedPanel(state), template.stages.length - 1)}
        onJump={(panel) => dispatch({ type: "jump", panel })}
      />
      </div>
      <StallCue guidance={guide} />
    </div>
  );
}
