export type Role = 'admin' | 'head' | 'officer' | 'regional';
export type Status = 'Pending' | 'Under Process' | 'Transferred' | 'Escalated' | 'Disposed';
export type SlaState = 'on-track' | 'approaching' | 'breached' | 'met' | 'missed';
export type Severity = 'info' | 'warning' | 'serious' | 'critical';

export interface User {
  id: number; username: string; name: string; designation: string; email: string; role: Role;
  bureau_code: string | null; region_code: string | null;
}
export interface Bureau { code: string; name: string; short: string; description: string }
export interface Region { code: string; name: string; office: string; states: string[] }
export interface Category { code: string; name: string; sla: number; bureau: string; priority: string }
export interface ActionType { code: string; label: string; status: string | null; system?: boolean }
export interface Meta {
  bureaus: Bureau[]; regions: Region[]; categories: Category[]; statuses: Status[]; priorities: string[]; sources: string[];
  complainantTypes: string[]; disposalTypes: string[]; actionTypes: ActionType[]; roles: Record<Role, string>;
  users: Array<Pick<User, 'id' | 'name' | 'designation' | 'role' | 'bureau_code' | 'region_code'>>;
}

export interface CaseRow {
  id: number; case_no: string; received_on: string; origin_bureau: string; bureau_code: string; status: Status; category: string;
  priority: string; subject: string; source: string; last_action: string | null; last_action_on: string | null; next_action: string | null;
  next_action_due: string | null; expected_disposal: string; disposed_on: string | null; region_code: string | null;
  institution_id: number | null; institution_name_raw: string | null; match_method: string | null; match_score: number | null;
  institution_name: string | null; aicte_id: string | null; city: string | null; state: string | null; officer_name: string | null;
  officer_id: number | null; days_left: number; age_days: number; overlap?: boolean; sla?: SlaState; escalated_level: number;
}

export interface Institution {
  id: number; aicte_id: string; name: string; aliases: string[] | string; type: string; ownership: string; address: string; city: string;
  district: string; state: string; pincode: string; region_code: string; established: number; approved_intake: number;
  approval_status: string; email: string; phone: string; head_name: string;
}

export interface OverlapCase {
  id: number; case_no: string; institution_id: number; bureau_code: string; bureau_name: string; status: Status; category: string;
  subject: string; received_on: string; last_action: string | null; last_action_on: string | null; officer_name: string | null;
  match_reason: string; priority: string;
}
export interface OverlapGroup {
  institution_id: number;
  institution: { id: number; name: string; aicte_id: string; city: string; state: string; region_code: string } | null;
  title: string; severity: Severity; bureaus: string[]; cases: OverlapCase[];
  pairs: Array<{ a: string; b: string; aId: number; bId: number; similarity: number; terms: string[]; sameCategory: boolean; sameComplainant: boolean }>;
  reasons: string[]; signature: string; status: 'open' | 'acknowledged' | 'coordinated' | 'dismissed'; reopened: boolean;
  lead_bureau: string | null; note: string | null; reviewed_at: string | null; since: string;
}

export interface MatchCandidate {
  institution: Institution; score: number; method: string; reasons: string[];
}

export interface CaseAction {
  id: number; case_id: number; at: string; actor_id: number | null; actor_name: string | null; actor_designation: string | null;
  bureau_code: string | null; action_type: string; from_status: string | null; to_status: string | null; from_bureau: string | null;
  to_bureau: string | null; remarks: string | null; next_action: string | null; next_action_due: string | null;
}
export interface CaseDoc { id: number; action_id: number | null; filename: string; mime: string; size: number; uploaded_at: string; uploaded_by: string | null }
export interface DuplicatePair {
  key: string; score: number; similarity: number; terms: string[]; crossBureau: boolean; sameComplainant: boolean; linked: string | null; reasons: string[];
  institution: { id: number; name: string; aicte_id: string };
  a: { id: number; case_no: string; bureau_code: string; status: Status; category: string; subject: string; received_on: string; complainant_name: string | null };
  b: { id: number; case_no: string; bureau_code: string; status: Status; category: string; subject: string; received_on: string; complainant_name: string | null };
  other?: DuplicatePair['a'];
}

export interface CaseDetail extends Omit<CaseRow, 'overlap' | 'sla'> {
  external_ref: string | null; institution_city_raw: string | null; aicte_id_raw: string | null;
  complainant_name: string | null; complainant_type: string | null; complainant_email: string | null; complainant_phone: string | null;
  description: string; disposal_type: string | null; disposal_remarks: string | null; created_at: string;
  sla: { state: SlaState; daysLeft: number; age: number; total: number; pctUsed: number };
  institution: Institution | null; actions: CaseAction[]; documents: CaseDoc[];
  links: Array<{ id: number; link_type: string; note: string | null; created_at: string; created_by: string | null; other_id: number; other_case_no: string; other_bureau: string; other_status: Status; other_subject: string }>;
  overlap: OverlapGroup | null;
  institutionCases: Array<{ id: number; case_no: string; bureau_code: string; status: Status; category: string; subject: string; received_on: string; officer_name: string | null }>;
  duplicates: DuplicatePair[];
  similar: Array<{ id: number; case_no: string; subject: string; status: Status; bureau_code: string; received_on: string; institution_name: string | null; institution_id: number | null; similarity: number; terms: string[] }>;
  candidates: MatchCandidate[];
  permissions: { canAct: boolean; canAssign: boolean; canDirect: boolean };
}

export interface Alert {
  id: number; type: string; severity: Severity; case_id: number | null; institution_id: number | null; bureau_code: string | null;
  region_code: string | null; title: string; message: string | null; created_at: string; resolved_at: string | null;
  case_no?: string | null; institution_name?: string | null; read: number;
}

export interface ReportColumn { key: string; label: string; type?: 'num' | 'pct'; link?: string }
export interface Report {
  title: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; totals?: Record<string, unknown>;
  chart?: { x: string; series: string[]; stacked?: boolean; labels?: Record<string, string>; percent?: boolean; line?: string; ordinal?: boolean };
  summary?: Record<string, number>; generated_at: string;
}
