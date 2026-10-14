/**
 * GET /console: the staff home. Redirects a signed-in staff member to the first console page
 * their roles can open (`staffLanding`), instead of a fixed area root that some roles may not
 * open (e.g. /research needs `study.view`, which curators and content editors lack). The
 * sign-in form uses it when no `?next=` was given.
 */
import { NextResponse, type NextRequest } from "next/server";

import { staffLanding } from "@/lib/permissions/console-routes";
import { getStaffPrincipal, signInPath } from "@/server/auth/staff";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const principal = await getStaffPrincipal();
  if (!principal) return NextResponse.redirect(new URL(signInPath(), request.url));
  return NextResponse.redirect(new URL(staffLanding(principal) ?? "/forbidden", request.url));
}
