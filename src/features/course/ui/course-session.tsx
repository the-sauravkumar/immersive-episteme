"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { startCourseSession, stepCourse, type CourseAction, type CourseEvent, type CoursePanelRef, type CourseSessionModel } from "@/features/course/application/course-session";
import { canFinish, canGoBack, canGoNext, isLastTradition, isProductPanel, reachedPanel } from "@/features/course/domain/course-state";
import { barSegments, stagePanelModel } from "@/features/course/domain/panel-model";
import { QUESTIONS_LABEL } from "@/features/process/domain/guidance";
import { PRODUCT_TITLE, type StageTemplate } from "@/features/process/domain/stage-template";

import { usePanelControls } from "./course-dialogs";
import { ProductPanel, productImageSources } from "./product-panel";
import { ProgressBar } from "./progress-bar";
import { StagePanel, panelImageSources } from "./stage-panel";
import { preloadImages, usePanelImages } from "./use-panel-images";

import "./tokens.css";
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
  readonly onStageEntered?: (event: CourseStageEvent) => void;
  readonly onStageLeft?: (event: CourseStageEvent & { readonly dwellMs: number }) => void;
  readonly onBackStep?: (event: { readonly from: CourseStageEvent; readonly to: CourseStageEvent }) => void;
  readonly onSourceOpened?: (event: CourseStageEvent) => void;
  readonly onFinished?: () => void;
}

function stageEvent(templates: readonly StageTemplate[], at: CoursePanelRef): CourseStageEvent {
  const template = templates[at.tradition]!;
  const stage = at.isProduct ? null : template.stages[at.panel]!;
  return { tradition: template.tradition, stageKey: stage?.key ?? null, stageNumber: stage?.number ?? null, panel: at.isProduct ? "product" : "stage" };
}

function imagesFor(template: StageTemplate, panel: number): readonly string[] {
  return panel < template.stages.length ? panelImageSources(stagePanelModel(template, panel)) : productImageSources(template);
}

export function CourseSession({ templates, reviewMarks = false, onStageEntered, onStageLeft, onBackStep, onSourceOpened, onFinished }: CourseSessionProps) {
  const stageCounts = useMemo(() => templates.map((template) => template.stages.length), [templates]);
  const [model, setModel] = useState<CourseSessionModel>(() => startCourseSession(stageCounts, 0).model);
  const modelRef = useRef(model);
  const handlers = useRef({ onStageEntered, onStageLeft, onBackStep, onFinished });
  const startedRef = useRef(false);

  useEffect(() => {
    handlers.current = { onStageEntered, onStageLeft, onBackStep, onFinished };
  }, [onStageEntered, onStageLeft, onBackStep, onFinished]);

  const emit = useCallback(
    (events: readonly CourseEvent[]) => {
      for (const event of events) {
        if (event.type === "entered") handlers.current.onStageEntered?.(stageEvent(templates, event.at));
        if (event.type === "left") handlers.current.onStageLeft?.({ ...stageEvent(templates, event.at), dwellMs: event.dwellMs });
        if (event.type === "back-step") handlers.current.onBackStep?.({ from: stageEvent(templates, event.from), to: stageEvent(templates, event.to) });
        if (event.type === "finished") handlers.current.onFinished?.();
      }
    },
    [templates],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const started = startCourseSession(stageCounts, Date.now());
    modelRef.current = started.model;
    setModel(started.model);
    emit(started.events);
  }, [emit, stageCounts]);

  const headingFocus = useRef(false);
  const dispatch = useCallback(
    (action: CourseAction) => {
      const step = stepCourse(modelRef.current, action, Date.now());
      if (step.model === modelRef.current) return;
      modelRef.current = step.model;
      headingFocus.current = true;
      setModel(step.model);
      emit(step.events);
    },
    [emit],
  );

  const { state } = model;
  const template = templates[state.tradition]!;
  const onProduct = isProductPanel(state);
  const sources = useMemo(() => imagesFor(template, state.panel), [template, state.panel]);
  const images = usePanelImages(sources);
  const controls = usePanelControls();

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
    onSourceOpened?.(stageEvent(templates, { tradition: state.tradition, panel: state.panel, isProduct: onProduct }));
  };

  const previousStage = onProduct ? template.stages.at(-1) : template.stages[state.panel - 1];
  const nextStage = template.stages[state.panel + 1];
  const nextTemplate = templates[state.tradition + 1];
  const finishing = onProduct && isLastTradition(state);

  const forwardDetail = onProduct ? (nextTemplate ? nextTemplate.traditionName : null) : nextStage ? `${nextStage.number} ${nextStage.name}` : PRODUCT_TITLE;

  return (
    <div className="course walking-tokens" data-course-root="" data-tradition={template.tradition} data-panel={onProduct ? "product" : state.panel + 1}>
      <div className="course-frame">
      {onProduct ? (
        <ProductPanel template={template} imageStatus={images.status} controls={controls} onSourcesOpened={sourceOpened} />
      ) : (
        <StagePanel model={stagePanelModel(template, state.panel)} reviewMarks={reviewMarks} imageStatus={images.status} controls={controls} onSourcesOpened={sourceOpened} />
      )}
      <ProgressBar
        back={{
          label: "Back",
          detail: previousStage ? `${previousStage.number} ${previousStage.name}` : null,
          disabled: !canGoBack(state),
          onPress: () => dispatch({ type: "back" }),
        }}
        forward={{
          label: finishing ? QUESTIONS_LABEL : "Next",
          detail: finishing ? null : forwardDetail,
          disabled: !images.settled || (finishing ? !canFinish(state) : !canGoNext(state)),
          onPress: () => dispatch({ type: finishing ? "finish" : "next" }),
        }}
        segments={barSegments(template)}
        currentIndex={onProduct ? -1 : state.panel}
        reachedIndex={Math.min(reachedPanel(state), template.stages.length - 1)}
        onJump={(panel) => dispatch({ type: "jump", panel })}
      />
      </div>
    </div>
  );
}
