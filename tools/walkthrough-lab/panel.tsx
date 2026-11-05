import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import ajrakh from "../../content/study/ajrakh.template.json";
import sanganeri from "../../content/study/sanganeri.template.json";
import kalamkari from "../../content/study/machilipatnam-kalamkari.template.json";
import { stagePanelModel } from "@/features/course/domain/panel-model";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { CoursePractice } from "@/features/course/ui/course-practice";
import { ProgressBar } from "@/features/course/ui/progress-bar";
import { StagePanel } from "@/features/course/ui/stage-panel";
import "@/styles/walking-tokens.css";
import "@/features/course/ui/course.css";

const TEMPLATES: Record<string, StageTemplate> = { ajrakh: ajrakh as StageTemplate, sanganeri: sanganeri as StageTemplate, kalamkari: kalamkari as unknown as StageTemplate };
const query = new URLSearchParams(location.search);

function waitForImages() {
  void Promise.all([document.fonts.ready, ...Array.from(document.images).map((image) => image.decode().catch(() => undefined))]).then(() => {
    (window as unknown as Record<string, unknown>).READY = true;
  });
}

function Practice() {
  useEffect(() => {
    const timer = window.setTimeout(waitForImages, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return <CoursePractice />;
}

function Stage({ template, index }: { readonly template: StageTemplate; readonly index: number }) {
  useEffect(waitForImages, []);
  const model = stagePanelModel(template, index);
  return (
    <div className="course walking" data-course-root="">
      <div className="course-frame">
        <StagePanel model={model} reviewMarks={false} imageStatus={() => "ready"} controls={null} onSourcesOpened={() => undefined} />
        <ProgressBar back={{ label: "Back", detail: null, disabled: true, onPress: () => undefined }} forward={{ label: "Next", detail: null, disabled: false, onPress: () => undefined }} segments={[]} currentIndex={0} reachedIndex={0} onJump={() => undefined} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(query.get("practice") ? <Practice /> : <Stage template={TEMPLATES[query.get("t") ?? "ajrakh"]!} index={Number(query.get("n") ?? 0)} />);
