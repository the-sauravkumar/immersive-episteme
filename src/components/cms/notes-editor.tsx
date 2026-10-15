"use client";

/**
 * Curator notes / editorial prose (Tiptap). Stored as Tiptap JSON in concepts.body after a
 * server-side allow-list sanitise; NEVER shown to learners (snapshots carry body = null).
 */
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { saveNotesAction } from "@/server/cms/actions";

import { ActionForm } from "./action-form";

const EMPTY = { type: "doc", content: [] };

export function NotesEditor({ conceptId, initial, warnAccepted }: { conceptId: string; initial: unknown; warnAccepted: boolean }) {
  const [json, setJson] = useState<string>(JSON.stringify(initial ?? EMPTY));
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
      }),
    ],
    content: (initial as object | null) ?? EMPTY,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-32 rounded-b-control border border-t-0 border-rule-strong bg-surface px-3 py-2 font-sans text-base leading-6 text-ink [&_blockquote]:border-l-2 [&_blockquote]:border-rule-strong [&_blockquote]:pl-3 [&_h2]:text-h3 [&_h3]:text-h3 [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Curator notes",
      },
    },
    onUpdate: ({ editor: e }) => setJson(JSON.stringify(e.getJSON())),
  });

  const tool = (label: string, run: () => void, active: boolean) => (
    <Button type="button" variant={active ? "outline" : "ghost"} aria-pressed={active} onClick={run} disabled={!editor} className={active ? "bg-wash" : undefined}>
      {label}
    </Button>
  );

  return (
    <ActionForm action={saveNotesAction} submitLabel="Save notes" pendingLabel="Saving notes…">
      <input type="hidden" name="conceptId" value={conceptId} />
      <input type="hidden" name="doc" value={json} />
      {warnAccepted ? (
        <p className="text-body text-ink-2">This concept is accepted. Notes are for curators only and never shown to learners, so saving them keeps it accepted.</p>
      ) : null}
      <div>
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 rounded-t-control border border-rule-strong bg-sunk p-1">
          {tool("Bold", () => editor?.chain().focus().toggleBold().run(), !!editor?.isActive("bold"))}
          {tool("Italic", () => editor?.chain().focus().toggleItalic().run(), !!editor?.isActive("italic"))}
          {tool("Heading", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), !!editor?.isActive("heading"))}
          {tool("Bulleted list", () => editor?.chain().focus().toggleBulletList().run(), !!editor?.isActive("bulletList"))}
          {tool("Numbered list", () => editor?.chain().focus().toggleOrderedList().run(), !!editor?.isActive("orderedList"))}
          {tool("Quote", () => editor?.chain().focus().toggleBlockquote().run(), !!editor?.isActive("blockquote"))}
        </div>
        <EditorContent editor={editor} />
      </div>
    </ActionForm>
  );
}
