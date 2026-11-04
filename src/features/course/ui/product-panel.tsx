"use client";

import { productRails } from "@/features/course/domain/panel-model";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { FOLLOWED_CLOTH_LABEL, PRODUCT_SENTENCE, PRODUCT_TITLE, type StageTemplate } from "@/features/process/domain/stage-template";
import { SOURCES_AND_CREDITS_LABEL } from "@/features/process/domain/guidance";

import type { ImageStatus } from "./use-panel-images";

interface ProductPanelProps {
  readonly template: StageTemplate;
  readonly imageStatus: (src: string) => ImageStatus;
  readonly controls: React.ReactNode;
  readonly onSourcesOpened: () => void;
}

export function productImageSources(template: StageTemplate): readonly string[] {
  const last = template.stages.at(-1);
  return [...(last ? [clothStatePath(last.clothStateId)] : []), ...template.products.map((product) => product.file)];
}

export function ProductPanel({ template, imageStatus, controls, onSourcesOpened }: ProductPanelProps) {
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
          }}
        >
          <summary>{SOURCES_AND_CREDITS_LABEL}</summary>
          <ul className="sources-list">
            {template.products.map((product) => (
              <li key={product.id}>
                <b>{product.name}</b>
                <span>{product.holder}</span>
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
        {productRails(template.products.length).map((rail) => (
          <div className="product-rail" key={rail.start}>
            {template.products.slice(rail.start, rail.end).map((product) => (
              <figure className="textile" key={product.id} style={{ flex: `${Math.max(0.75, product.widthPx / product.heightPx)} 1 0` }}>
                {imageStatus(product.file) === "ready" ? <img src={product.file} alt={`${product.name}, ${product.holder}`} /> : <span className="threads" aria-hidden="true" />}
                <figcaption className="band">
                  {product.name}
                  <small>{product.holder}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
