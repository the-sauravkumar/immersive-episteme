"use client";

/**
 * Client forms for /admin/users (DESIGN.md 9.1, 9.5, 9.18, 11.11). Every action is re-authorised on
 * the server; nothing here grants anything by itself.
 *
 *  - `CreateStaffForm`: 44 px fields (no height overrides), labels above, hints in `text-credit`.
 *  - `UserRowActions`: the trailing 44 px row-action menu of the staff table. Each item opens a
 *    dialog. Removing a role and locking an account are destructive, so their dialogs ask for typed
 *    confirmation (the account's email address) before the filled danger button will submit; the
 *    filled danger variant appears only there (9.1). Granting a role and unlocking an account are
 *    not destructive and need no typed confirmation.
 *  - Focus: closing a dialog returns focus to the row's menu button (the menu item that opened it no
 *    longer exists), and a polite live region announces the result.
 */
import { ChevronDown, CircleAlert, Lock, LockOpen, ShieldMinus, ShieldPlus } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ActionForm, type FormAction } from "@/components/cms/action-form";
import type { ActionState } from "@/components/cms/action-state";
import { FormField, NativeSelect } from "@/components/cms/bits";
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
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/permissions/roles";
import { createStaffAction, grantRoleAction, lockStaffAction, revokeRoleAction, unlockStaffAction } from "@/server/admin/actions";

function TextField({ name, label, type = "text", autoComplete, hint }: { name: string; label: string; type?: string; autoComplete?: string; hint?: string }) {
  const id = useId();
  return (
    <FormField id={id} name={name} label={label} hint={hint}>
      <Input id={id} name={name} type={type} autoComplete={autoComplete} required aria-describedby={[hint ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(" ")} />
    </FormField>
  );
}

function RoleSelect({ id, roles, describedBy }: { id: string; roles: readonly StaffRole[]; describedBy?: string }) {
  return (
    <NativeSelect id={id} name="role" required defaultValue="" aria-describedby={describedBy}>
      <option value="" disabled>
        Choose a role
      </option>
      {roles.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </NativeSelect>
  );
}

export function CreateStaffForm({ minPasswordLength }: { minPasswordLength: number }) {
  const roleId = useId();
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
          hint={`At least ${minPasswordLength} characters. Share it out of band; the person should change it after signing in.`}
        />
        <FormField id={roleId} name="role" label="Initial role">
          <RoleSelect id={roleId} roles={STAFF_ROLES} describedBy={`${roleId}-error`} />
        </FormField>
      </div>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Row actions
 * ---------------------------------------------------------------------------------------------- */

export interface RowUser {
  id: string;
  name: string;
  email: string;
  roles: readonly StaffRole[];
  locked: boolean;
}

type Pending = { kind: "grant" } | { kind: "revoke"; role: StaffRole } | { kind: "lock" } | { kind: "unlock" } | null;

export function UserRowActions({ user, self, manageRoles }: { user: RowUser; self: boolean; manageRoles: boolean }) {
  const [open, setOpen] = useState<Pending>(null);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const available = STAFF_ROLES.filter((r) => !user.roles.includes(r));

  const done = (message: string | undefined) => {
    setOpen(null);
    setAnnouncement(message ?? "Done.");
  };
  const dialogProps = {
    onOpenChange: (o: boolean) => {
      if (!o) setOpen(null);
    },
  };
  const contentProps = {
    // The menu item that opened the dialog is gone; return focus to the row's menu button.
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
              {available.length ? (
                <DropdownMenuItem onSelect={() => setOpen({ kind: "grant" })}>
                  <ShieldPlus aria-hidden="true" />
                  Add a role…
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>Holds every staff role</DropdownMenuItem>
              )}
              {user.roles.map((r) => (
                <DropdownMenuItem key={r} variant="destructive" onSelect={() => setOpen({ kind: "revoke", role: r })}>
                  <ShieldMinus aria-hidden="true" />
                  Remove {ROLE_LABELS[r]}…
                </DropdownMenuItem>
              ))}
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
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <Dialog open={open?.kind === "grant"} {...dialogProps}>
        <DialogContent {...contentProps}>
          <DialogHeader>
            <DialogTitle>Add a role</DialogTitle>
            <DialogDescription>
              {user.name} ({user.email}) gains every permission the role holds, from their next request.
            </DialogDescription>
          </DialogHeader>
          <GrantRoleForm userId={user.id} available={available} onDone={done} />
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "revoke"} {...dialogProps}>
        <DialogContent {...contentProps}>
          {open?.kind === "revoke" ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove a role</DialogTitle>
                <DialogDescription>
                  {user.name} loses the {ROLE_LABELS[open.role]} role and its permissions from their next request. The server refuses to remove the last platform
                  administrator.
                </DialogDescription>
              </DialogHeader>
              <ConfirmForm
                action={revokeRoleAction}
                hidden={{ userId: user.id, role: open.role }}
                confirmText={user.email}
                submitLabel={`Remove ${ROLE_LABELS[open.role]}`}
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
          <ConfirmForm action={lockStaffAction} hidden={{ userId: user.id }} confirmText={user.email} submitLabel="Lock account" pendingLabel="Locking…" onDone={done}>
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
            <DialogDescription>{user.name} can sign in again with their existing password and roles.</DialogDescription>
          </DialogHeader>
          <ActionForm action={unlockStaffAction} submitLabel="Unlock account" pendingLabel="Unlocking…" onDone={(s) => s.ok && done(s.message)}>
            <input type="hidden" name="userId" value={user.id} />
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GrantRoleForm({ userId, available, onDone }: { userId: string; available: readonly StaffRole[]; onDone: (message: string | undefined) => void }) {
  const id = useId();
  return (
    <ActionForm action={grantRoleAction} submitLabel="Add role" pendingLabel="Adding…" onDone={(s) => s.ok && onDone(s.message)}>
      <input type="hidden" name="userId" value={userId} />
      <FormField id={id} name="role" label="Role">
        <RoleSelect id={id} roles={available} describedBy={`${id}-error`} />
      </FormField>
    </ActionForm>
  );
}

function FieldErrors({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="flex items-start gap-2 font-sans text-sm leading-5 font-medium text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" />
      <span className="min-w-0">{messages.join(" ")}</span>
    </p>
  );
}

/**
 * A destructive action form: the refusal in an alert that takes focus, optional fields, then a
 * typed confirmation. Until the typed text matches `confirmText` (case and surrounding spaces
 * ignored), the filled danger button stays focusable but `aria-disabled`, says why, and a click or
 * Enter does nothing.
 */
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
  onDone: (message: string | undefined) => void;
  children?: (errors: Record<string, string[] | undefined>, ids: { reason: string }) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [typed, setTyped] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const ids = { reason: `${base}-reason`, confirm: `${base}-confirm`, why: `${base}-why` };
  const matches = typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  useEffect(() => {
    if (!state) return;
    if (state.ok) onDone(state.message);
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
            Type <span className="text-mono break-all text-ink">{confirmText}</span> to confirm
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
        <p id={ids.why} className="text-credit">
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
