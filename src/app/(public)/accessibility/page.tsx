/**
 * Accessibility (DESIGN.md 11.4), in the editorial frame: themes, high contrast, reduced motion,
 * keyboard paths and the Display Settings control. Everything stated here is a feature the
 * platform implements; it states the standard the interface is built to, not a certification.
 */
import type { Metadata } from "next";

import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { DisplaySettings } from "@/components/shell/display-settings";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Accessibility" };

const LIST = "text-reading flex list-disc flex-col gap-2 pl-6 text-ink marker:text-ink-3";

export default function AccessibilityPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Accessibility"
        description="How the platform supports keyboard, screen-reader, high-contrast and reduced-motion use, and how to change the display."
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

        <EditorialSection id="display-settings" title="Display settings">
          <EditorialRow
            note={
              <Sidenote>
                <p>Settings are saved on this device only, in the browser.</p>
              </Sidenote>
            }
          >
            <Prose>The Display Settings control, in the footer of every public page and in the console&rsquo;s user menu, offers three switches:</Prose>
            <ul className={LIST}>
              <li>
                <span className="font-semibold">Dark theme</span>: light text on a dark ground. Light is the default.
              </li>
              <li>
                <span className="font-semibold">High contrast</span>: darker text and solid borders, opaque surfaces, no decorative pattern, and a
                black and white focus ring.
              </li>
              <li>
                <span className="font-semibold">Reduce motion</span>: no transitions or animations. The setting of your operating system is
                respected as well.
              </li>
            </ul>
            <div>
              <DisplaySettings zone="public" />
            </div>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="study-pages" title="In a study">
          <EditorialRow>
            <Prose>
              Study pages are always shown in the light theme and have no motion at all, in both learning conditions, so that the display is the
              same for everyone. High contrast is the one setting offered there, in the same way in both conditions.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="keyboard" title="Keyboard paths">
          <EditorialRow>
            <ul className={LIST}>
              <li>Skip to content is the first stop on every page.</li>
              <li>Every control shows a visible focus ring, and sticky bars never cover the focused element.</li>
              <li>After every statement, a number in brackets such as [1] opens where it comes from, with the exact quotation; selecting it again or pressing Escape closes it and returns to the number. Each sheet ends with one numbered list of its references.</li>
              <li>Enlarge, under a figure, opens it full size; Close or Escape returns to Enlarge.</li>
              <li>Layer tabs move with the arrow keys, Home and End.</li>
              <li>
                The same list sits at the left in both conditions: &ldquo;In This Section&rdquo; on the pages and &ldquo;In This Room&rdquo; in the
                museum, with the button of the same name in the top bar; Escape closes it where it opens over the view. In the museum it lists the
                exhibits and doorways of the current room, and the plan lists every room, so every exhibit can be reached without the mouse.
              </li>
            </ul>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="screen-readers" title="Screen readers">
          <EditorialRow>
            <Prose>
              Pages use landmarks and one main heading each. Claims are numbered lists, figures carry a text alternative that describes what they
              show, and every diagram on the public pages has a text version beside it.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}
