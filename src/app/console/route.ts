import { NextResponse, type NextRequest } from "next/server";

import { refusalPath, staffLanding } from "@/lib/permissions/console-routes";
import { getStaffPrincipal, signInPath } from "@/server/auth/staff";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const principal = await getStaffPrincipal();
  if (!principal) return NextResponse.redirect(new URL(signInPath(), request.url));
  return NextResponse.redirect(new URL(staffLanding(principal) ?? refusalPath(principal), request.url));
}
