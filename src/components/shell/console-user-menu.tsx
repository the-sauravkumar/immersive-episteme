"use client";

/**
 * Console user menu (DESIGN.md 9.16): the signed-in name opens a menu with the email, the role
 * badges, Display Settings and Sign out. The menu is non-modal so the Display Settings dialog can
 * take focus cleanly after the menu closes.
 */
import { ChevronDown, LogOut, MonitorCog, UserRound } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DisplaySettings } from "./display-settings";
import { useSignOut } from "./sign-out-button";

export function ConsoleUserMenu({ name, email, roles }: { name: string; email: string; roles: readonly string[] }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pending, signOut } = useSignOut();

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
            <span className="text-ui text-ink">{name}</span>
            <span className="text-id break-all text-ink-3">{email}</span>
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
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <MonitorCog aria-hidden="true" />
            Display settings
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
            <LogOut aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DisplaySettings zone="console" open={settingsOpen} onOpenChange={setSettingsOpen} trigger={null} />
    </>
  );
}
