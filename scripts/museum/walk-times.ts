/**
 * Room walk times (DR-064): from the lobby spawn to each room's centre and through each wing in
 * its order, with the scene's own walk code. The route is `createRouter(...).route` exactly as
 * `walkToRoom` / `walkThroughDoorway` build it (museum-scene.tsx), and the visitor advances with
 * `stepVisitor` (navigation.ts) at the default click-to-walk pace (walking 1.35 m/s, brisk 2.3 m/s
 * on long routes, ROUTE_PACE). Time is simulated at a fixed 60 Hz step, so it is the time a
 * visitor sees at 60 fps; scripts/museum/walk-times-browser.mjs checks it on the GTX 1650.
 *
 * The manifest is the one the preview /learn/immersive shows (context-data.ts findPreviewContent).
 *
 *   node --import tsx scripts/museum/walk-times.ts [out.json]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { buildSceneModel, type SceneModel } from "@/features/immersive/scene-model";
import { CollisionWorld, createRouter, stepVisitor, yawFromDeg, type MoveInput, type VisitorState } from "@/features/immersive/navigation";
import { doorwayWalkTarget } from "@/features/immersive/wayfinding";
import { planOrder, roomNumbers } from "@/features/immersive/plan-drawing";

const DT = 1 / 60;
const CAP_S = 600;
type P = { x: number; z: number };

try {
  process.loadEnvFile(".env");
} catch {
  /* env from the shell */
}

async function previewManifest() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const s = await pool.query<{ id: string; version_label: string; manifest_id: string | null }>(
      `SELECT s.id, s.version_label, st.manifest_id FROM content_snapshots s
         LEFT JOIN LATERAL (SELECT manifest_id FROM studies WHERE is_demo AND snapshot_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) st ON true
        WHERE s.kind = 'review' AND NOT s.is_demo ORDER BY s.created_at DESC, s.id DESC LIMIT 1`,
    );
    const row = s.rows[0];
    if (!row) throw new Error("no review snapshot");
    let id = row.manifest_id;
    if (!id) {
      const m = await pool.query<{ id: string }>(
        "SELECT id FROM spatial_manifests WHERE snapshot_id = $1 AND status IN ('valid', 'published') ORDER BY created_at DESC, id DESC LIMIT 1",
        [row.id],
      );
      id = m.rows[0]?.id ?? null;
    }
    if (!id) throw new Error("no manifest for the review snapshot");
    const m = await pool.query<{ id: string; manifest_hash: string; manifest: Parameters<typeof buildSceneModel>[0] }>(
      "SELECT id, manifest_hash, manifest FROM spatial_manifests WHERE id = $1",
      [id],
    );
    return { snapshotLabel: row.version_label, manifestId: m.rows[0]!.id, manifestHash: m.rows[0]!.manifest_hash, manifest: m.rows[0]!.manifest };
  } finally {
    await pool.end();
  }
}

const NO_INPUT: MoveInput = { forward: 0, strafe: 0, turn: 0, brisk: false };

function simulate(world: CollisionWorld, v: VisitorState, look: { yaw: number; pitch: number }, route: P[], finalYaw: number | null) {
  v.route = route.map((p) => ({ ...p }));
  v.routeYaw = finalYaw;
  let t = 0;
  let metres = 0;
  for (;;) {
    const x0 = v.x;
    const z0 = v.z;
    const moving = stepVisitor(v, NO_INPUT, DT, world, look);
    v.yaw = look.yaw;
    v.pitch = look.pitch;
    metres += Math.hypot(v.x - x0, v.z - z0);
    t += DT;
    if (!moving && v.route.length === 0 && v.routeYaw === null) break;
    if (t > CAP_S) return { seconds: null, metres, stuck: true };
  }
  return { seconds: t, metres, stuck: false };
}

const centreOf = (model: SceneModel, id: string): P => {
  const r = model.rooms.find((x) => x.id === id)!;
  return { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
};
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

async function main() {
  const out = process.argv[2] ?? "analysis/out/museum/walk-times.sim.json";
  const src = await previewManifest();
  const model = buildSceneModel(src.manifest);
  const world = new CollisionWorld(model.colliders);
  const router = createRouter(model.rooms, model.colliders);
  const spawn = () => {
    const v: VisitorState = { x: model.spawn.x, z: model.spawn.z, vx: 0, vz: 0, yaw: yawFromDeg(model.spawn.yawDeg), pitch: 0, route: [], routeYaw: null };
    return { v, look: { yaw: v.yaw, pitch: 0 } };
  };

  // walkToRoom from the spawn, every room.
  const rooms = model.rooms.map((r) => {
    const { v, look } = spawn();
    const route = router.route(v, centreOf(model, r.id));
    const res = route ? simulate(world, v, look, route.slice(1), null) : { seconds: null, metres: 0, stuck: false };
    return { roomId: r.id, tradition: r.traditionSlug, group: r.group, roomKind: r.roomKind, seconds: r2(res.seconds), metres: r2(res.metres), routable: !!route, stuck: res.stuck };
  });

  // Wings: each tradition's rooms in the Plan's numbered order (planOrder: the section order shared
  // with the 2D pages). The visitor walks spawn -> room 1
  // -> room 2 ..., with walkThroughDoorway where a doorway joins consecutive rooms (the rail's
  // doorway rows) and walkToRoom otherwise (the Plan).
  const order = planOrder(model);
  const numbers = roomNumbers(model);
  const wings = model.zones
    .filter((z) => z.traditionSlug)
    .map((z) => ({ ...z, roomIds: order.filter((r) => r.traditionSlug === z.traditionSlug).map((r) => r.id) }))
    .map((z) => {
      const { v, look } = spawn();
      const legs: { to: string; number: number | null; via: "doorway" | "room"; seconds: number | null; metres: number | null }[] = [];
      let at: string | null = null;
      for (const id of z.roomIds) {
        const room = model.rooms.find((r) => r.id === id);
        const portal = at ? room?.neighbours.find((n) => n.roomId === at) : undefined;
        let target: P | null = null;
        let yaw: number | null = null;
        let via: "doorway" | "room" = "room";
        if (portal) {
          const t = doorwayWalkTarget(model, portal.portalId, id, (p) => router.isFree(p));
          if (t) {
            target = t.point;
            yaw = t.yaw;
            via = "doorway";
          }
        }
        if (!target) target = centreOf(model, id);
        const route = router.route(v, target);
        const res = route ? simulate(world, v, look, route.slice(1).length ? route.slice(1) : [target], yaw) : { seconds: null, metres: 0 };
        legs.push({ to: id, number: numbers.get(id) ?? null, via, seconds: r2(res.seconds), metres: r2(res.metres) });
        at = id;
      }
      const total = legs.every((l) => l.seconds !== null) ? legs.reduce((s, l) => s + l.seconds!, 0) : null;
      return { zoneId: z.id, tradition: z.traditionSlug, rooms: z.roomIds, seconds: r2(total), metres: r2(legs.reduce((s, l) => s + (l.metres ?? 0), 0)), legs };
    });

  const totals = wings.map((w) => w.seconds).filter((s): s is number => s !== null);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const maxDev = Math.max(...totals.map((t) => Math.abs(t - mean) / mean));
  const wingSpread = {
    min: Math.min(...totals),
    max: Math.max(...totals),
    mean: r2(mean),
    maxDeviationFromMean: r2(maxDev),
    maxOverMin: r2(Math.max(...totals) / Math.min(...totals) - 1),
    tolerance: 0.1,
    within: Math.max(...totals) / Math.min(...totals) - 1 <= 0.1,
  };

  // The same section across traditions.
  const groups = [...new Set(rooms.filter((r) => r.tradition && r.group).map((r) => r.group!))].sort();
  const sections = groups.map((g) => {
    const rs = rooms.filter((r) => r.group === g && r.tradition);
    const s = rs.map((r) => r.seconds).filter((x): x is number => x !== null);
    return { group: g, byTradition: Object.fromEntries(rs.map((r) => [r.tradition!, r.seconds])), min: Math.min(...s), max: Math.max(...s), maxOverMin: r2(Math.max(...s) / Math.min(...s) - 1) };
  });

  const result = {
    method: "scene walk code (createRouter route + stepVisitor) at a fixed 60 Hz step from model.spawn; default click-to-walk pace",
    snapshot: src.snapshotLabel,
    manifestId: src.manifestId,
    manifestHash: src.manifestHash,
    spawn: model.spawn,
    rooms,
    wings,
    wingSpread,
    sections,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ rooms: rooms.length, wings: wings.map((w) => [w.tradition, w.seconds, w.metres, w.rooms.length]), wingSpread, sections: sections.map((s) => [s.group, s.byTradition]) }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
