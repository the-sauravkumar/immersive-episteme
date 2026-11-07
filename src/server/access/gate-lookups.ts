import "server-only";

import { isStaffRole } from "@/lib/permissions/roles";
import { getAuth } from "@/server/auth";
import { loadUserRoles } from "@/server/auth/roles-repository";
import { getDb, getPool } from "@/server/db/client";

import { inviteNotRevoked } from "./invites";

export function inviteIsLive(inviteId: string): Promise<boolean> {
  return inviteNotRevoked(getPool(), inviteId);
}

export async function sessionHoldsStaffRole(headers: Headers): Promise<boolean> {
  const session = await getAuth().api.getSession({ headers, query: { disableRefresh: true } });
  if (!session || session.user.disabledAt) return false;
  const roles = await loadUserRoles(getDb(), session.user.id);
  return roles.some(isStaffRole);
}
