"use client";

import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChangePasswordDialog } from "./change-password";
import { SIGN_OUT_FAILED, useSignOut } from "./sign-out-button";

export function ConsoleUserMenu({
  name,
  email,
  roles,
  hasPassword,
  minPasswordLength,
}: {
  name: string;
  email: string;
  roles: readonly string[];
  hasPassword: boolean;
  minPasswordLength: number;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { pending, failed, signOut, dismiss } = useSignOut();

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" className="max-w-[16rem] px-3" aria-label={`Account: ${name}`}>
            <UserRound aria-hidden="true" />
            <span className="truncate max-sm:sr-only">{name}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <div className="flex flex-col gap-1 px-2 py-2">
            <span className="t-label text-lime">{name}</span>
            <span className="t-table font-semibold wrap-anywhere text-lime-dim">{email}</span>
          </div>
          <div className="px-2 pb-2">
            <ul aria-label="Your roles" className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <li key={r}>
                  <Badge variant="neutral">{r}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <DropdownMenuSeparator />
          {hasPassword ? (
            <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden="true" />
              Change password
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
            <LogOut aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {hasPassword ? <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} minPasswordLength={minPasswordLength} /> : null}
      <Dialog open={failed} onOpenChange={(o) => (o ? undefined : dismiss())}>
        <DialogContent role="alertdialog">
          <DialogHeader>
            <DialogTitle>Still Signed In</DialogTitle>
            <DialogDescription>{SIGN_OUT_FAILED}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
            <Button type="button" disabled={pending} onClick={() => void signOut()}>
              {pending ? "Signing out…" : "Try again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
