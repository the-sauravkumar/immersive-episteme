"use client";

import { productRails } from "@/features/course/domain/panel-model";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { exhibitAlt, exhibitCreditLines, exhibitImages, FOLLOWED_CLOTH_LABEL, PRODUCT_SENTENCE, PRODUCT_TITLE, type StageTemplate } from "@/features/process/domain/stage-template";
import { SOURCES_AND_CREDITS_LABEL } from "@/features/process/domain/guidance";

import type { ImageStatus } from "./use-panel-images";

interface ProductPanelProps {
  readonly template: StageTemplate;
  readonly imageStatus: (src: string) => ImageStatus;
  readonly controls: React.ReactNode;
  readonly onSourcesOpened: () => void;
  readonly onSourcesClosed: () => void;
}

export function productImageSources(template: StageTemplate): readonly string[] {
  const last = template.stages.at(-1);
  return [...(last ? [clothStatePath(last.clothStateId)] : []), ...exhibitImages(template).map((image) => image.file)];
}

export function ProductPanel({ template, imageStatus, controls, onSourcesOpened, onSourcesClosed }: ProductPanelProps) {
  const images = exhibitImages(template);
  const last = template.stages.at(-1);
  const followedSrc = last ? clothStatePath(last.clothStateId) : null;
  return (
    <section className="product" aria-labelledby="course-stage-name">
      <div className="product-text">
        <div className="panel-head">
          <p className="panel-kicker">{template.traditionName}</p>
          <div className="panel-controls">{controls}</div>
        </div>
        <h2 id="course-stage-name" className="product-title" tabIndex={-1}>
          {PRODUCT_TITLE}
        </h2>
        <p className="product-sentence">{PRODUCT_SENTENCE}</p>
        <details
          className="sources"
          onToggle={(event) => {
            if (event.currentTarget.open) onSourcesOpened();
            else onSourcesClosed();
          }}
        >
          <summary>{SOURCES_AND_CREDITS_LABEL}</summary>
          <ul className="sources-list">
            {images.map((image) => (
              <li key={image.id}>
                <b>{image.name}</b>
                {exhibitCreditLines(image).map((line) => (
                  <span key={line} className="credit-line">
                    {line}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
        {followedSrc ? (
          <figure className="followed">
            {imageStatus(followedSrc) === "ready" ? <img src={followedSrc} alt="" /> : <span className="threads" aria-hidden="true" />}
            <figcaption className="band">{FOLLOWED_CLOTH_LABEL}</figcaption>
          </figure>
        ) : null}
      </div>
      <div className="product-gallery">
        {productRails(images.length).map((rail) => (
          <div className="product-rail" key={rail.start}>
            {images.slice(rail.start, rail.end).map((image) => (
              <figure className="textile" key={image.id} style={{ flex: `${Math.max(0.75, image.widthPx / image.heightPx)} 1 0` }}>
                {imageStatus(image.file) === "ready" ? <img src={image.file} alt={exhibitAlt(image)} /> : <span className="threads" aria-hidden="true" />}
                <figcaption className="band">
                  {image.name}
                  <small>{image.holder}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
