"use client";

import { ChevronDown, CircleAlert, KeyRound, Lock, LockOpen, ShieldMinus, ShieldPlus, TimerReset } from "lucide-react";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ActionForm, type FormAction } from "@/components/cms/action-form";
import type { ActionState } from "@/components/cms/action-state";
import { CHECK_BOX, CHECK_ROW, FormField, NativeSelect } from "@/components/cms/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_DUTIES, ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/permissions/roles";
import { clearSignInLockAction, createStaffAction, lockStaffAction, resetPasswordAction, revokeRoleAction, setRoleAction, unlockStaffAction } from "@/server/admin/actions";

function TextField({ name, label, type = "text", autoComplete, hint }: { name: string; label: string; type?: string; autoComplete?: string; hint?: string }) {
  const id = useId();
  return (
    <FormField id={id} name={name} label={label} hint={hint}>
      <Input id={id} name={name} type={type} autoComplete={autoComplete} required aria-describedby={[hint ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(" ")} />
    </FormField>
  );
}

function RoleFields({ current, principalInvestigator = false }: { current?: StaffRole | null; principalInvestigator?: boolean }) {
  const id = useId();
  const [role, setRole] = useState<string>(current ?? "");
  return (
    <>
      <FormField id={id} name="role" label="Role" hint={role ? ROLE_DUTIES[role as StaffRole] : "Each person holds one role."}>
        <NativeSelect id={id} name="role" required value={role} onChange={(e) => setRole(e.target.value)} aria-describedby={`${id}-hint ${id}-error`}>
          <option value="" disabled>
            Choose a role
          </option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {role === "researcher" ? (
        <label htmlFor={`${id}-pi`} className={CHECK_ROW}>
          <input id={`${id}-pi`} type="checkbox" name="principalInvestigator" className={CHECK_BOX} defaultChecked={principalInvestigator} />
          Principal investigator: may start studies, exclude sessions, export identified data and publish content releases
        </label>
      ) : null}
    </>
  );
}

export function CreateStaffForm({ minPasswordLength }: { minPasswordLength: number }) {
  return (
    <ActionForm action={createStaffAction} submitLabel="Create account" pendingLabel="Creating…" resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="name" label="Full name" autoComplete="off" />
        <TextField name="email" label="Email" type="email" autoComplete="off" />
        <TextField
          name="password"
          label="Initial password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${minPasswordLength} characters. Share it out of band; the person can change it after signing in, from Change password in their account menu.`}
        />
        <div className="flex flex-col gap-3">
          <RoleFields />
        </div>
      </div>
    </ActionForm>
  );
}

export interface RowUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole | null;
  principalInvestigator: boolean;
  locked: boolean;
  signInLocked: boolean;
  hasPassword: boolean;
}

type Pending = { kind: "role" } | { kind: "revoke" } | { kind: "lock" } | { kind: "unlock" } | { kind: "liftLock" } | { kind: "resetPassword" } | null;

const AnnounceContext = createContext<((message: string) => void) | null>(null);

export function UserActionStatus({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return (
    <AnnounceContext value={setMessage}>
      <p role="status" aria-live="polite" className="t-b text-lime-dim empty:sr-only">
        {message}
      </p>
      {children}
    </AnnounceContext>
  );
}

function useAnnounce(): (message: string) => void {
  const announce = useContext(AnnounceContext);
  if (!announce) throw new Error("UserRowActions must sit inside UserActionStatus.");
  return announce;
}

export function UserRowActions({ user, self, manageRoles, minPasswordLength }: { user: RowUser; self: boolean; manageRoles: boolean; minPasswordLength: number }) {
  const [open, setOpen] = useState<Pending>(null);
  const announce = useAnnounce();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const done = () => setOpen(null);
  const announced =
    (action: FormAction): FormAction =>
    async (prev, formData) => {
      const state = await action(prev, formData);
      if (state?.ok) announce(`${user.name} (${user.email}): ${state.message ?? "Done."}`);
      return state;
    };
  const dialogProps = {
    onOpenChange: (o: boolean) => {
      if (!o) setOpen(null);
    },
  };
  const contentProps = {
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault();
      triggerRef.current?.focus();
    },
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="outline" className="px-3" aria-label={`Manage ${user.name} (${user.email})`}>
            Manage
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
          {manageRoles ? (
            <>
              <DropdownMenuItem onSelect={() => setOpen({ kind: "role" })}>
                <ShieldPlus aria-hidden="true" />
                {user.role ? "Change role…" : "Give access…"}
              </DropdownMenuItem>
              {user.role ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setOpen({ kind: "revoke" })}>
                  <ShieldMinus aria-hidden="true" />
                  Remove role…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}
          {self ? (
            <DropdownMenuItem disabled>You cannot lock your own account</DropdownMenuItem>
          ) : user.locked ? (
            <DropdownMenuItem onSelect={() => setOpen({ kind: "unlock" })}>
              <LockOpen aria-hidden="true" />
              Unlock account…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen({ kind: "lock" })}>
              <Lock aria-hidden="true" />
              Lock account…
            </DropdownMenuItem>
          )}
          {user.signInLocked ? (
            <DropdownMenuItem onSelect={() => setOpen({ kind: "liftLock" })}>
              <TimerReset aria-hidden="true" />
              Lift sign-in lock…
            </DropdownMenuItem>
          ) : null}
          {!self && user.hasPassword ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen({ kind: "resetPassword" })}>
              <KeyRound aria-hidden="true" />
              Reset password…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open?.kind === "role"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>{user.role ? "Change role" : "Give access"}</DialogTitle>
            <DialogDescription>
              {user.name} ({user.email}) holds one role. The new role replaces the old one from their next page load.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={announced(setRoleAction)} submitLabel="Save role" pendingLabel="Saving…" onDone={(s) => s.ok && done()}>
            <input type="hidden" name="userId" value={user.id} />
            <RoleFields current={user.role} principalInvestigator={user.principalInvestigator} />
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "revoke"} {...dialogProps}>
        <DialogContent {...contentProps}>
          {open?.kind === "revoke" && user.role ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove the role</DialogTitle>
                <DialogDescription>
                  {user.name} stops being {ROLE_LABELS[user.role]} from their next page load and waits for access until someone gives them a role again. The last Admin
                  cannot be removed.
                </DialogDescription>
              </DialogHeader>
              <ConfirmForm
                action={announced(revokeRoleAction)}
                hidden={{ userId: user.id }}
                confirmText={user.email}
                submitLabel={`Remove ${ROLE_LABELS[user.role]}`}
                pendingLabel="Removing…"
                onDone={done}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "lock"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>Lock this account</DialogTitle>
            <DialogDescription>
              {user.name} can no longer sign in and every active session ends now. The account is kept, so its history stays attributable; it can be unlocked later.
            </DialogDescription>
          </DialogHeader>
          <ConfirmForm action={announced(lockStaffAction)} hidden={{ userId: user.id }} confirmText={user.email} submitLabel="Lock account" pendingLabel="Locking…" onDone={done}>
            {(errors, ids) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.reason}>Reason for locking</Label>
                <Input
                  id={ids.reason}
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  aria-invalid={errors.reason ? true : undefined}
                  aria-describedby={errors.reason ? `${ids.reason}-error` : undefined}
                />
                <FieldErrors id={`${ids.reason}-error`} messages={errors.reason} />
              </div>
            )}
          </ConfirmForm>
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "unlock"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>Unlock this account</DialogTitle>
            <DialogDescription>{user.name} can sign in again {user.hasPassword ? "with their existing password" : "with Google"} and keeps their roles.</DialogDescription>
          </DialogHeader>
          <ActionForm action={announced(unlockStaffAction)} submitLabel="Unlock account" pendingLabel="Unlocking…" onDone={(s) => s.ok && done()}>
            <input type="hidden" name="userId" value={user.id} />
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "liftLock"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>Lift the sign-in lock</DialogTitle>
            <DialogDescription>
              Too many sign-in attempts have locked {user.name}&apos;s sign-in; the Status column shows until when. Lifting the lock lets them try again now. Their password, roles and
              sessions do not change. The reason is written to the audit log.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={announced(clearSignInLockAction)} submitLabel="Lift sign-in lock" pendingLabel="Lifting…" onDone={(s) => s.ok && done()}>
            <input type="hidden" name="userId" value={user.id} />
            <ReasonField label="Reason for lifting the lock" />
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "resetPassword"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>Reset the password</DialogTitle>
            <DialogDescription>
              {user.name}&apos;s password is replaced by the one you enter, and every active session ends now. Share the new password out of band; they can change it
              after signing in, from Change password in their account menu.
            </DialogDescription>
          </DialogHeader>
          <ConfirmForm action={announced(resetPasswordAction)} hidden={{ userId: user.id }} confirmText={user.email} submitLabel="Reset password" pendingLabel="Resetting…" onDone={done}>
            {(errors, ids) => (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.password}>New password</Label>
                  <Input
                    id={ids.password}
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={minPasswordLength}
                    maxLength={256}
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={errors.password ? `${ids.password}-error` : undefined}
                  />
                  <FieldErrors id={`${ids.password}-error`} messages={errors.password} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.reason}>Reason for the reset</Label>
                  <Input
                    id={ids.reason}
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                    aria-invalid={errors.reason ? true : undefined}
                    aria-describedby={errors.reason ? `${ids.reason}-error` : undefined}
                  />
                  <FieldErrors id={`${ids.reason}-error`} messages={errors.reason} />
                </div>
              </>
            )}
          </ConfirmForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReasonField({ label }: { label: string }) {
  const id = useId();
  return (
    <FormField id={id} name="reason" label={label}>
      <Input id={id} name="reason" required minLength={3} maxLength={500} aria-describedby={`${id}-error`} />
    </FormField>
  );
}

function FieldErrors({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="flex items-start gap-2 t-s font-semibold text-madder-text">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" />
      <span className="min-w-0">{messages.join(" ")}</span>
    </p>
  );
}

function ConfirmForm({
  action,
  hidden,
  confirmText,
  submitLabel,
  pendingLabel,
  onDone,
  children,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  confirmText: string;
  submitLabel: string;
  pendingLabel: string;
  onDone: () => void;
  children?: (errors: Record<string, string[] | undefined>, ids: { reason: string; password: string }) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [typed, setTyped] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const ids = { reason: `${base}-reason`, password: `${base}-password`, confirm: `${base}-confirm`, why: `${base}-why` };
  const matches = typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  useEffect(() => {
    if (!state) return;
    if (state.ok) onDone();
    else errorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per new state
  }, [state]);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Error: not changed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children?.(errors, ids)}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.confirm}>
          <span>
            Type <span className="t-table font-semibold wrap-anywhere break-all text-lime">{confirmText}</span> to confirm
          </span>
        </Label>
        <Input
          id={ids.confirm}
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={ids.why}
        />
        <p id={ids.why} className="t-s text-lime-dim">
          {matches ? "The address matches." : "The button stays inactive until the address matches."}
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
          aria-describedby={ids.why}
          onClick={matches ? undefined : (e) => e.preventDefault()}
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
