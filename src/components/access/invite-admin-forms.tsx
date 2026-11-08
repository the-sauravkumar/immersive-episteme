"use client";

import { CircleAlert, Copy, Eye } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { ActionForm } from "@/components/cms/action-form";
import type { ActionState } from "@/components/cms/action-state";
import { FormField, NativeSelect } from "@/components/cms/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteLinks } from "@/lib/access/share-links";
import { createInviteAction, revealInviteAction, revokeInviteAction } from "@/server/access/actions";

export interface StudyOption {
  id: string;
  slug: string;
  title: string;
  isDemo: boolean;
}

type Created = { code: string; hint: string; studySlug: string | null };

export function CopyButton({ value, what }: { value: string; what?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      <Copy aria-hidden="true" />
      {copied ? "Copied" : "Copy"}
      {what ? <span className="sr-only"> {what}</span> : null}
    </Button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="t-table font-semibold wrap-anywhere min-w-0 flex-1" spellCheck={false} />
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function CreateInviteForm({ studies, origin }: { studies: StudyOption[]; origin: string }) {
  const [created, setCreated] = useState<Created | null>(null);
  const ids = { label: useId(), maxUses: useId(), expiresOn: useId(), study: useId() };
  return (
    <div className="flex flex-col gap-6">
      <ActionForm
        action={createInviteAction}
        submitLabel="Create code"
        pendingLabel="Creating…"
        resetOnSuccess
        onDone={(s) => {
          if (s.ok && typeof s.data?.code === "string") {
            setCreated({ code: s.data.code, hint: String(s.data.hint ?? ""), studySlug: typeof s.data.studySlug === "string" ? s.data.studySlug : null });
          }
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id={ids.label} name="label" label="Label" hint="Who the code is for, for example Pilot cohort A or Reviewers. Never a person's name.">
            <Input id={ids.label} name="label" required maxLength={120} autoComplete="off" aria-describedby={`${ids.label}-hint ${ids.label}-error`} />
          </FormField>
          <FormField id={ids.study} name="studyId" label="Study (optional)" hint="Adds a participant link that opens this study with the invite included.">
            <NativeSelect id={ids.study} name="studyId" defaultValue="" aria-describedby={`${ids.study}-hint ${ids.study}-error`}>
              <option value="">No study: site link only</option>
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.slug}){s.isDemo ? " [demo]" : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id={ids.maxUses} name="maxUses" label="Use limit (optional)" hint="How many times it may be entered and confirmed with Continue. Empty means no limit.">
            <Input id={ids.maxUses} name="maxUses" type="text" inputMode="numeric" pattern="[0-9]*" aria-describedby={`${ids.maxUses}-hint ${ids.maxUses}-error`} />
          </FormField>
          <FormField id={ids.expiresOn} name="expiresOn" label="Last day to redeem (optional, UTC)" hint="It stops admitting new browsers after this day. A browser that already used it stays in until its 30-day access ends or its cookies are cleared.">
            <Input id={ids.expiresOn} name="expiresOn" type="date" aria-describedby={`${ids.expiresOn}-hint ${ids.expiresOn}-error`} />
          </FormField>
        </div>
      </ActionForm>
      {created ? (
        <Alert variant="info" role="note">
          <AlertTitle>New Code</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-4 pt-2">
              <p>Share the code or a link privately. While the code lets people in, Show code on its row brings it and its links back.</p>
              <CodeAndLinks origin={origin} code={created.code} studySlug={created.studySlug} />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function CodeAndLinks({ origin, code, studySlug }: { origin: string; code: string; studySlug: string | null }) {
  const links = inviteLinks(origin, code, studySlug);
  return (
    <>
      <CopyField label="Code" value={code} />
      <CopyField label="Site link" value={links.site} />
      {links.study ? <CopyField label="Participant link (study)" value={links.study} /> : null}
    </>
  );
}

export function RevealInviteButton({ inviteId, label, hint, origin }: { inviteId: string; label: string; hint: string; origin: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(revealInviteAction, null);
  const [dismissed, setDismissed] = useState<ActionState>(null);
  const open = state !== null && state !== dismissed;
  const code = state?.ok ? state.data?.code : undefined;
  const studySlug = state?.ok && typeof state.data?.studySlug === "string" ? state.data.studySlug : null;

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="inviteId" value={inviteId} />
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Show the code for ${label} (ending ${hint}) and its links`}>
          <Eye aria-hidden="true" />
          {pending ? "Showing…" : "Show code"}
        </Button>
      </form>
      <Dialog open={open} onOpenChange={(next) => {
          if (!next) setDismissed(state);
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{typeof code === "string" ? "Code and links" : "Code not shown"}</DialogTitle>
            <DialogDescription>{typeof code === "string" ? `The code for ${label}. Share it privately. This look is recorded in the audit log.` : (state?.error ?? "The code could not be shown.")}</DialogDescription>
          </DialogHeader>
          {typeof code === "string" ? (
            <div className="flex min-w-0 flex-col gap-4">
              <CodeAndLinks origin={origin} code={code} studySlug={studySlug} />
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RevokeInviteButton({ inviteId, label, hint }: { inviteId: string; label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-label={`Revoke the code for ${label} (ending ${hint})`}>
        Revoke…
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this code</DialogTitle>
            <DialogDescription>
              The code for {label} stops working now: nobody can redeem it, and every browser that already used it, including a participant part-way through a study, is refused on its next page or study request. This
              cannot be undone; create a new code instead.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <RevokeForm
              inviteId={inviteId}
              hint={hint}
              onDone={(message) => {
                setOpen(false);
                setAnnouncement(message ?? "Code revoked.");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevokeForm({ inviteId, hint, onDone }: { inviteId: string; hint: string; onDone: (message: string | undefined) => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(revokeInviteAction, null);
  const [typed, setTyped] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const matches = typed.trim().toUpperCase() === hint.toUpperCase();

  useEffect(() => {
    if (!state) return;
    if (state.ok) onDone(state.message);
    else errorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per new state
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Error: not changed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="inviteId" value={inviteId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${base}-confirm`}>
          <span>
            Type <span className="t-table font-semibold wrap-anywhere text-lime">{hint}</span> (the code&apos;s last four characters) to confirm
          </span>
        </Label>
        <Input
          id={`${base}-confirm`}
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={`${base}-why`}
        />
        <p id={`${base}-why`} className="t-s text-lime-dim">
          {matches ? "The characters match." : "The button stays inactive until the characters match."}
        </p>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="destructive-solid"
          disabled={pending}
          aria-disabled={matches ? undefined : true}
          aria-describedby={`${base}-why`}
          onClick={matches ? undefined : (e) => e.preventDefault()}
        >
          {pending ? "Revoking…" : "Revoke code"}
        </Button>
      </DialogFooter>
    </form>
  );
}
