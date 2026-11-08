"use client";

import { captionSize, nameSize, objectColumns, type PanelObject, type StagePanelModel } from "@/features/course/domain/panel-model";
import { PROXY_CLOTH_MARK, ROLE_LABELS, SOURCES_LABEL, STAND_IN_MARK, UNSETTLED_COLOUR_MARK } from "@/features/process/domain/guidance";
import type { SourceRef } from "@/features/process/domain/stage-template";

import type { ImageStatus } from "./use-panel-images";

interface StagePanelProps {
  readonly model: StagePanelModel;
  readonly reviewMarks: boolean;
  readonly imageStatus: (src: string) => ImageStatus;
  readonly controls: React.ReactNode;
  readonly onSourcesOpened: () => void;
  readonly onSourcesClosed?: () => void;
}

export function panelImageSources(model: StagePanelModel): readonly string[] {
  return [model.clothBeforeSrc, model.clothAfterSrc, ...model.objects.map((object) => object.stillSrc)];
}

function SourcesDisclosure({ sources, onOpened, onClosed }: { readonly sources: readonly SourceRef[]; readonly onOpened: () => void; readonly onClosed?: () => void }) {
  if (sources.length === 0) return null;
  return (
    <details
      className="sources"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpened();
        else onClosed?.();
      }}
    >
      <summary>{SOURCES_LABEL}</summary>
      <ul className="sources-list">
        {sources.map((source) => (
          <li key={`${source.sourceId}-${source.locator}-${source.quote}`}>
            <b>{source.title}</b>
            <span>{source.locator}</span>
            <q>{source.quote}</q>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ObjectCell({ object, status, reviewMarks }: { readonly object: PanelObject; readonly status: ImageStatus; readonly reviewMarks: boolean }) {
  return (
    <figure className="object">
      {status === "ready" ? <img src={object.stillSrc} alt="" /> : <span className="threads" aria-hidden="true" />}
      <span className="object-role">{ROLE_LABELS[object.role]}</span>
      {reviewMarks ? <span className="mark-proxy object-mark">{object.colourUnsettled ? `${STAND_IN_MARK}, ${UNSETTLED_COLOUR_MARK}` : STAND_IN_MARK}</span> : null}
      <figcaption className="object-name">
        {object.label}
        {object.localName ? <small>({object.localName})</small> : null}
      </figcaption>
    </figure>
  );
}

export function StagePanel({ model, reviewMarks, imageStatus, controls, onSourcesOpened, onSourcesClosed }: StagePanelProps) {
  const count = model.objects.length;
  const dense = model.name.length + (model.localName?.length ?? 0) + model.caption.length > 300;
  return (
    <section className="panel" data-objects={count === 0 ? "none" : "some"} data-dense={dense} aria-labelledby="course-stage-name">
      <div className="panel-text">
        <div className="panel-head">
          <p className="panel-kicker">{model.kicker}</p>
          <div className="panel-controls">{controls}</div>
        </div>
        <p className="panel-numeral" aria-hidden="true">
          {model.numeral}
        </p>
        <h2 id="course-stage-name" className="panel-name" data-size={nameSize(model.name)} tabIndex={-1}>
          {model.name}
          {model.localName ? <span className="panel-local">({model.localName})</span> : null}
        </h2>
        <p className="panel-caption" data-size={captionSize(model.caption)}>
          {model.caption}
        </p>
        <SourcesDisclosure key={model.kicker} sources={model.sources} onOpened={onSourcesOpened} onClosed={onSourcesClosed} />
      </div>
      {count > 0 ? (
        <div className="objects" data-columns={objectColumns(count)} data-count={count}>
          {model.objects.map((object) => (
            <ObjectCell key={object.key} object={object} status={imageStatus(object.stillSrc)} reviewMarks={reviewMarks} />
          ))}
        </div>
      ) : null}
      <figure className="cloth">
        {imageStatus(model.clothBeforeSrc) === "ready" ? <img className="cloth-side cloth-before" src={model.clothBeforeSrc} alt="" /> : null}
        {imageStatus(model.clothAfterSrc) === "ready" ? <img className="cloth-side cloth-after" src={model.clothAfterSrc} alt="" /> : <span className="threads" aria-hidden="true" />}
        {reviewMarks ? <span className="mark-proxy cloth-mark">{PROXY_CLOTH_MARK}</span> : null}
        <figcaption className="band">{model.clothLabel}</figcaption>
      </figure>
    </section>
  );
}
