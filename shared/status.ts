export type StatusId =
  | "interested"
  | "ready_to_apply"
  | "applied"
  | "assessment_pending"
  | "assessment_completed"
  | "shortlisted"
  | "interview_scheduled"
  | "interview_completed"
  | "offer_received"
  | "accepted"
  | "rejected"
  | "withdrawn";

export interface StatusMeta {
  id: StatusId;
  label: string;
  icon: string;
  color: string;
  bg: string;
  stage: "interested" | "applied" | "assessment" | "shortlist" | "interview" | "offer" | "closed";
  order: number;
}

export const STATUSES: Record<StatusId, StatusMeta> = {
  interested: { id: "interested", label: "Interested / Saved", icon: "bookmark", color: "text-slate-600", bg: "bg-slate-100", stage: "interested", order: 0 },
  ready_to_apply: { id: "ready_to_apply", label: "Ready to Apply", icon: "clipboard-check", color: "text-sky-700", bg: "bg-sky-100", stage: "interested", order: 1 },
  applied: { id: "applied", label: "Applied / Submitted", icon: "check-circle", color: "text-blue-700", bg: "bg-blue-100", stage: "applied", order: 2 },
  assessment_pending: { id: "assessment_pending", label: "Assessment Pending", icon: "file-text", color: "text-indigo-700", bg: "bg-indigo-100", stage: "assessment", order: 3 },
  assessment_completed: { id: "assessment_completed", label: "Assessment Completed", icon: "check-square", color: "text-violet-700", bg: "bg-violet-100", stage: "assessment", order: 4 },
  shortlisted: { id: "shortlisted", label: "Shortlisted", icon: "star", color: "text-amber-700", bg: "bg-amber-100", stage: "shortlist", order: 5 },
  interview_scheduled: { id: "interview_scheduled", label: "Interview Scheduled", icon: "calendar", color: "text-purple-700", bg: "bg-purple-100", stage: "interview", order: 6 },
  interview_completed: { id: "interview_completed", label: "Interview Completed", icon: "users", color: "text-fuchsia-700", bg: "bg-fuchsia-100", stage: "interview", order: 7 },
  offer_received: { id: "offer_received", label: "Offer Received", icon: "trophy", color: "text-teal-700", bg: "bg-teal-100", stage: "offer", order: 8 },
  accepted: { id: "accepted", label: "Accepted", icon: "party", color: "text-emerald-700", bg: "bg-emerald-100", stage: "closed", order: 9 },
  rejected: { id: "rejected", label: "Rejected", icon: "x-circle", color: "text-rose-700", bg: "bg-rose-100", stage: "closed", order: 10 },
  withdrawn: { id: "withdrawn", label: "Withdrawn", icon: "undo", color: "text-zinc-700", bg: "bg-zinc-100", stage: "closed", order: 11 }
};

export const STATUS_ORDER: StatusId[] = [
  "interested", "ready_to_apply", "applied", "assessment_pending",
  "assessment_completed", "shortlisted", "interview_scheduled",
  "interview_completed", "offer_received", "accepted", "rejected", "withdrawn"
];

export function isStatusId(v: string): v is StatusId {
  return v in STATUSES;
}

/** Progress stages used by the funnel/timeline visualization. */
export const FUNNEL_STAGES = [
  { id: "applied", label: "Applied" },
  { id: "assessment", label: "Assessment" },
  { id: "shortlist", label: "Shortlisted" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "closed", label: "Closed" }
] as const;

export function stageProgress(status: StatusId): number {
  const s = STATUSES[status];
  if (!s) return 0;
  const idx = FUNNEL_STAGES.findIndex((f) => f.id === s.stage);
  return idx < 0 ? 0 : idx;
}
