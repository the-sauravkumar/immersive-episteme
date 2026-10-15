import { CircleCheck, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreateStaffForm, UserRowActions } from "@/components/admin/user-forms";
import { Empty, Mono, NativeSelect, one, Pager, Section, Stamp, type SearchParams } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions/can";
import { isStaffRole, ROLE_LABELS, STAFF_ROLES } from "@/lib/permissions/roles";
import { titleCase } from "@/lib/text/title-case";
import { listStaffUsers, type StaffUserRow } from "@/server/admin/users";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/config";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Users" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/admin/users">) {
  return (
    <ConsolePage
      path="/admin/users"
      title="Users"
      description="Staff accounts. Participants never have accounts. Accounts are locked, never deleted, so their history stays attributable."
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

/*
 * DESIGN.md 9.3: under 640 px a console list table may switch to stacked label/value cards. The
 * table keeps one DOM; below `sm` the rows become two-column grids (the name and the row menu on
 * top, then one label/value line per column, the labels shown only there). Explicit ARIA table
 * roles keep the table semantics when the display type changes (some browsers drop them).
 */
const STACK = {
  table: "max-sm:block max-sm:[&>caption]:block max-sm:[&>thead]:sr-only max-sm:[&>tbody]:block",
  row: "max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-4 max-sm:gap-y-2 max-sm:py-4",
  cell: "max-sm:col-span-2 max-sm:grid max-sm:h-auto max-sm:grid-cols-[7.5rem_minmax(0,1fr)] max-sm:items-baseline max-sm:gap-x-3 max-sm:p-0 max-sm:text-left",
  label: "text-label sm:hidden",
};

function CellLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className={STACK.label}>
      {titleCase(children)}
    </span>
  );
}

/** Accounts per page; the filter and paging run over the full, alphabetical list. */
const PAGE_SIZE = 25;

type UserFilter = { q?: string; role?: string; status?: "active" | "locked" };

function parseFilter(sp: SearchParams): UserFilter & { page: number } {
  const q = one(sp.q)?.trim().slice(0, 200) || undefined;
  const role = one(sp.role);
  const status = one(sp.status);
  const page = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    q,
    role: role && isStaffRole(role) ? role : undefined,
    status: status === "active" || status === "locked" ? status : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function matches(u: StaffUserRow, f: UserFilter): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
  }
  if (f.role && !(u.roles as string[]).includes(f.role)) return false;
  if (f.status === "locked" && !u.disabledAt) return false;
  if (f.status === "active" && u.disabledAt) return false;
  return true;
}

async function Users({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission("admin.users");
  const [all, sp] = await Promise.all([listStaffUsers(getPool(), actor), searchParams]);
  const filter = parseFilter(sp);
  const filtered = Boolean(filter.q || filter.role || filter.status);
  const matching = filtered ? all.filter((u) => matches(u, filter)) : all;
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filter.page, pages);
  const users = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = (page - 1) * PAGE_SIZE + 1;
  const manageRoles = can(actor, "admin.roles");
  const locked = matching.filter((u) => u.disabledAt).length;
  const field = "flex min-w-0 flex-col gap-1.5";
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="staff-list" className="flex min-w-0 flex-col gap-4">
        <h2 id="staff-list" className="text-h2 text-ink">
          {titleCase("staff accounts")}
        </h2>
        <form method="get" action="/admin/users" aria-label="Filter the staff accounts" className="flex flex-col gap-4 border-b border-rule pb-6">
          <p className="text-label">Filters</p>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={field}>
              <Label htmlFor="u-q">Name or email contains</Label>
              <Input id="u-q" name="q" type="search" defaultValue={filter.q ?? ""} autoComplete="off" spellCheck={false} />
            </div>
            <div className={field}>
              <Label htmlFor="u-role">Role</Label>
              <NativeSelect id="u-role" name="role" defaultValue={filter.role ?? ""}>
                <option value="">Any</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={field}>
              <Label htmlFor="u-status">Status</Label>
              <NativeSelect id="u-status" name="status" defaultValue={filter.status ?? ""}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="locked">Locked</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Apply filters</Button>
            {filtered ? (
              <Button asChild variant="outline">
                <Link href="/admin/users">Clear filters</Link>
              </Button>
            ) : null}
          </div>
        </form>
        {users.length === 0 ? (
          <Empty>{filtered ? "No accounts match these filters." : "No staff accounts yet."}</Empty>
        ) : (
          <Table
            role="table"
            caption="Accounts, Roles and Status"
            number={1}
            hoverRows
            className={STACK.table}
            note={`${matching.length === users.length ? `${matching.length} account(s)` : `Accounts ${first} to ${first + users.length - 1} of ${matching.length}`}${filtered ? ` matching the filters (of ${all.length})` : ""}, ${locked} locked; alphabetical by name. Times are UTC. Sessions counts the sign-ins that have not expired.`}
          >
            <TableHeader role="rowgroup">
              <TableRow role="row">
                <TableHead role="columnheader" scope="col">
                  Name and email
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Roles
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Status
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Created (UTC)
                </TableHead>
                <TableHead role="columnheader" scope="col" numeric>
                  Sessions
                </TableHead>
                <TableHead role="columnheader" scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody role="rowgroup">
              {users.map((u) => (
                <TableRow role="row" key={u.id} className={STACK.row}>
                  <TableCell role="cell" className="max-sm:col-span-1 max-sm:h-auto max-sm:p-0 align-top sm:py-3">
                    <span className="block font-medium text-ink">
                      {u.name} {u.id === actor.userId ? <span className="font-normal text-ink-3">(you)</span> : null}
                    </span>
                    <span className="text-id block text-ink-2 [overflow-wrap:anywhere] sm:whitespace-nowrap">{u.email}</span>
                    <Mono className="block text-ink-3" title="Account id">
                      {u.id}
                    </Mono>
                  </TableCell>
                  <TableCell role="cell" className={`${STACK.cell} align-top sm:py-3`}>
                    <CellLabel>roles</CellLabel>
                    {u.roles.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {u.roles.map((r) => (
                          <Badge key={r}>{ROLE_LABELS[r]}</Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-ink-3">No roles</span>
                    )}
                  </TableCell>
                  <TableCell role="cell" className={`${STACK.cell} align-top sm:py-3`}>
                    <CellLabel>status</CellLabel>
                    {u.disabledAt ? (
                      <span className="flex flex-col items-start gap-1">
                        <Badge variant="danger">
                          <Lock aria-hidden="true" />
                          Locked
                        </Badge>
                        <span className="text-credit">
                          since <Stamp at={u.disabledAt} />
                        </span>
                      </span>
                    ) : (
                      <Badge variant="ok">
                        <CircleCheck aria-hidden="true" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell role="cell" className={`${STACK.cell} align-top sm:py-3`}>
                    <CellLabel>created (UTC)</CellLabel>
                    <Stamp at={u.createdAt} />
                  </TableCell>
                  <TableCell role="cell" numeric className={`${STACK.cell} align-top sm:py-3`}>
                    <CellLabel>sessions</CellLabel>
                    <span>{u.activeSessions}</span>
                  </TableCell>
                  <TableCell role="cell" className="text-right align-top max-sm:col-start-2 max-sm:row-start-1 max-sm:h-auto max-sm:p-0 sm:py-3">
                    <UserRowActions
                      user={{ id: u.id, name: u.name, email: u.email, roles: u.roles, locked: Boolean(u.disabledAt) }}
                      self={u.id === actor.userId}
                      manageRoles={manageRoles}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager base="/admin/users" params={{ q: filter.q, role: filter.role, status: filter.status }} page={page} total={matching.length} pageSize={PAGE_SIZE} />
      </section>

      {manageRoles ? (
        <Section id="create-staff" title="Create a staff account" description="The account starts with one role; add more from its row menu." className="max-w-3xl">
          <CreateStaffForm minPasswordLength={MIN_PASSWORD_LENGTH} />
        </Section>
      ) : (
        <p className="text-body text-ink-2">Creating accounts also assigns a role, which needs the role-administration permission.</p>
      )}
    </div>
  );
}
