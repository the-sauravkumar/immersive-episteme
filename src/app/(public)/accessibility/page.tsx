import type { Metadata } from "next";

import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Accessibility" };

const LIST = "t-b flex list-disc flex-col gap-2 pl-6 text-lime marker:text-lime-dim";

export default function AccessibilityPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Accessibility"
        description="How the platform supports keyboard, screen-reader and reduced-motion use, and what the display looks like."
      />
      <EditorialFrame>
        <EditorialSection id="standard" title="The standard we build to">
          <EditorialRow
            note={
              <Sidenote>
                <p>The 44 by 44 pixel target size comes from the stricter AAA level of the same guidelines.</p>
              </Sidenote>
            }
          >
            <Prose>
              The interface is built to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Every button, link and field is at least
              44 by 44 pixels, text keeps at least 4.5:1 contrast against its background, and no page scrolls sideways on a 390 pixel wide screen.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="display" title="Display">
          <EditorialRow>
            <Prose>
              Every page uses one palette: light text on a deep indigo ground, with turmeric marking the current place, the forward action and the
              keyboard focus. Body and secondary text keep at least 7:1 contrast, above the AA level. Motion is limited to short
              fades and is switched off when your operating system asks for reduced motion.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="study-pages" title="In a study">
          <EditorialRow>
            <Prose>
              Study pages have no interface transitions or animations, so that the display is the same for everyone. Where the learning task
              shows a scene, the view moves only while the learner moves through it or goes on or back.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="keyboard" title="Keyboard paths">
          <EditorialRow>
            <ul className={LIST}>
              <li>Skip to content is the first stop on every page.</li>
              <li>Every control shows a visible focus ring.</li>
              <li>
                Before the learning task, a short practice with neutral content shows its controls. Every stage of the task can be reached with
                the keyboard alone, through its buttons for going on and going back; Sources, Help and Pause are buttons too.
              </li>
              <li>
                In the staff console&rsquo;s concept preview, a number in brackets such as [1] opens where a statement comes from, Enlarge opens a figure
                full size with Close or Escape returning to it, and layer tabs move with the arrow keys, Home and End.
              </li>
            </ul>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="screen-readers" title="Screen readers">
          <EditorialRow>
            <Prose>
              Pages use landmarks and one main heading each. Where the learning task paints a stage name or caption on a surface, a screen
              reader cannot read it there; the caption is also given as text in Sources. Every diagram on the public pages has a text version
              beside it.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}
