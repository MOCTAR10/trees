import type { Project } from "../api/client";

export type MyProjectState = "active" | "invited" | "owner" | "none";
export type ProjectNextAction = "join" | "accept" | "scan" | "open";

type ProjectLike = Pick<Project, "status" | "participation" | "my_status"> & Partial<Pick<Project, "created_by">>;

/** « owner » = created it without taking part (a company running its chantier). */
export function myProjectState(p: ProjectLike, userId?: number): MyProjectState {
  if (p.my_status === "active") return "active";
  if (p.my_status === "invited") return "invited";
  if (userId != null && p.created_by === userId) return "owner";
  return "none";
}

/** The server lets a person join an open project, or one whose invitation they once declined. */
export function canJoinProject(p: ProjectLike): boolean {
  return p.status === "open" && (p.participation !== "invitation" || p.my_status === "declined");
}

export function nextProjectAction(p: ProjectLike, canScan: boolean): ProjectNextAction {
  if (p.status !== "open") return "open";
  const state = myProjectState(p);
  if (state === "invited") return "accept";
  if (state === "active") return canScan ? "scan" : "open";
  return canJoinProject(p) ? "join" : "open";
}

/** Mine = taking part, invited or created by me (the Ministry also follows every other one there). */
export function isMyProject(p: ProjectLike & Pick<Project, "created_by">, userId: number, admin: boolean): boolean {
  if (myProjectState(p) !== "none" || p.created_by === userId) return true;
  return admin && !(p.status === "open" && p.participation === "open");
}

export function isJoinable(p: ProjectLike): boolean {
  return myProjectState(p) === "none" && canJoinProject(p);
}
