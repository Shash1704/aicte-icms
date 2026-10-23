// Domain reference data for AICTE complaint monitoring.
// Bureau/Cell list, regions, categories, statuses and prescribed timelines (SLA).

export const BUREAUS = [
  { code: 'RB', name: 'Regulation Bureau', short: 'RB', description: 'Regulatory action on violation of AICTE norms, approval conditions and fee regulations.' },
  { code: 'PGRC', name: 'Public Grievance Redressal Cell', short: 'PGRC', description: 'Grievances from students, parents, faculty and public (portal, CPGRAMS, letters).' },
  { code: 'AB', name: 'Approval Bureau', short: 'AB', description: 'Grant/extension of approval, intake, closure and change of status.' },
  { code: 'ARC', name: 'Anti-Ragging Cell', short: 'ARC', description: 'Ragging complaints via National Anti-Ragging Helpline and direct reports.' },
  { code: 'FB', name: 'Finance Bureau', short: 'FB', description: 'Scholarships, fellowships and grant related complaints.' },
  { code: 'PAPB', name: 'Policy & Academic Planning Bureau', short: 'PAPB', description: 'Academic matters, curriculum, internships and examinations.' },
  { code: 'RO', name: 'Regional Office', short: 'RO', description: 'AICTE Regional Offices/Centres — inspections and regional follow-up.' },
];
export const BUREAU_CODES = BUREAUS.map((b) => b.code);

export const REGIONS = [
  { code: 'NRO', name: 'Northern', office: 'Kanpur', states: ['Uttar Pradesh', 'Uttarakhand', 'Bihar'] },
  { code: 'NWRO', name: 'North-Western', office: 'Chandigarh', states: ['Punjab', 'Haryana', 'Himachal Pradesh', 'Delhi', 'Rajasthan', 'Jammu and Kashmir'] },
  { code: 'WRO', name: 'Western', office: 'Mumbai', states: ['Maharashtra', 'Goa', 'Gujarat'] },
  { code: 'CRO', name: 'Central', office: 'Bhopal', states: ['Madhya Pradesh', 'Chhattisgarh'] },
  { code: 'ERO', name: 'Eastern', office: 'Kolkata', states: ['West Bengal', 'Odisha', 'Jharkhand', 'Assam'] },
  { code: 'SRO', name: 'Southern', office: 'Chennai', states: ['Tamil Nadu', 'Puducherry'] },
  { code: 'SWRO', name: 'South-Western', office: 'Bengaluru', states: ['Karnataka', 'Kerala'] },
  { code: 'SCRO', name: 'South-Central', office: 'Hyderabad', states: ['Telangana', 'Andhra Pradesh'] },
];
export const REGION_CODES = REGIONS.map((r) => r.code);
export const regionForState = (state) => REGIONS.find((r) => r.states.includes(state))?.code ?? null;

// Statuses required by the problem statement: pending, under process, transferred, escalated, disposed.
export const STATUSES = ['Pending', 'Under Process', 'Transferred', 'Escalated', 'Disposed'];
export const ACTIVE_STATUSES = STATUSES.filter((s) => s !== 'Disposed');

// Complaint categories with prescribed disposal timeline (days), default bureau and priority.
export const CATEGORIES = [
  { code: 'FEE_REFUND', name: 'Fee refund / excess fee', sla: 30, bureau: 'PGRC', priority: 'Normal' },
  { code: 'CERTIFICATES', name: 'Withholding of original certificates', sla: 15, bureau: 'PGRC', priority: 'High' },
  { code: 'RAGGING', name: 'Ragging', sla: 7, bureau: 'ARC', priority: 'Critical' },
  { code: 'HARASSMENT', name: 'Harassment / discrimination', sla: 15, bureau: 'PGRC', priority: 'High' },
  { code: 'FACULTY_NORMS', name: 'Faculty shortage / pay not as per norms', sla: 60, bureau: 'RB', priority: 'Normal' },
  { code: 'SALARY', name: 'Non-payment of salary to staff', sla: 45, bureau: 'RB', priority: 'High' },
  { code: 'INFRA', name: 'Infrastructure / facility deficiency', sla: 60, bureau: 'RB', priority: 'Normal' },
  { code: 'UNAPPROVED', name: 'Unapproved course / fake approval', sla: 45, bureau: 'RB', priority: 'High' },
  { code: 'ADMISSION', name: 'Admission irregularities / excess intake', sla: 30, bureau: 'AB', priority: 'High' },
  { code: 'APPROVAL', name: 'Approval / closure related', sla: 45, bureau: 'AB', priority: 'Normal' },
  { code: 'SCHOLARSHIP', name: 'Scholarship / fellowship', sla: 30, bureau: 'FB', priority: 'Normal' },
  { code: 'ACADEMIC', name: 'Academic / examination / internship', sla: 30, bureau: 'PAPB', priority: 'Normal' },
  { code: 'OTHER', name: 'Other', sla: 30, bureau: 'PGRC', priority: 'Low' },
];
export const categoryByCode = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));

export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

export const SOURCES = [
  'AICTE Grievance Portal', 'CPGRAMS (DARPG)', 'Email', 'Post / Letter', 'Ministry of Education reference',
  'Regional Office referral', 'Suo-motu / inspection', 'Court directive', 'National Anti-Ragging Helpline',
];

export const COMPLAINANT_TYPES = ['Student', 'Parent', 'Faculty', 'Non-teaching staff', 'Public', 'Ministry / Govt.', 'Anonymous'];

export const DISPOSAL_TYPES = [
  'Resolved — relief provided', 'Action taken against institution', 'Penalty / restriction imposed',
  'Closed — no merit', 'Closed — outside AICTE purview', 'Withdrawn by complainant', 'Merged with related case',
];

// Action vocabulary for workflow history. `status` is the status the case moves to (if any).
export const ACTION_TYPES = [
  { code: 'NOTE', label: 'Note / remark', status: null },
  { code: 'FORWARDED', label: 'Forwarded to institution for comments', status: 'Under Process' },
  { code: 'REMINDER', label: 'Reminder issued to institution', status: 'Under Process' },
  { code: 'REPLY', label: 'Reply received from institution', status: 'Under Process' },
  { code: 'SCN', label: 'Show-cause notice issued', status: 'Under Process' },
  { code: 'HEARING', label: 'Personal hearing held', status: 'Under Process' },
  { code: 'INSPECTION', label: 'Expert visit / inspection conducted', status: 'Under Process' },
  { code: 'COORDINATION', label: 'Coordination with other Bureau/Cell', status: null },
  // Workflow actions with special handling:
  { code: 'REGISTERED', label: 'Complaint registered', status: 'Pending', system: true },
  { code: 'ASSIGNED', label: 'Assigned to officer', status: null, system: true },
  { code: 'TRANSFER', label: 'Transferred to another Bureau/Cell', status: 'Transferred', system: true },
  { code: 'ACCEPTED', label: 'Transfer accepted', status: 'Under Process', system: true },
  { code: 'ESCALATE', label: 'Escalated to Competent Authority', status: 'Escalated', system: true },
  { code: 'DIRECTION', label: 'Direction from Competent Authority', status: 'Under Process', system: true },
  { code: 'DISPOSE', label: 'Case disposed', status: 'Disposed', system: true },
  { code: 'REOPEN', label: 'Case reopened', status: 'Under Process', system: true },
  { code: 'LINKED', label: 'Linked with related case', status: null, system: true },
  { code: 'INSTITUTION_RESOLVED', label: 'Institution identified', status: null, system: true },
];
export const actionByCode = Object.fromEntries(ACTION_TYPES.map((a) => [a.code, a]));

export const ROLES = {
  admin: 'Senior Management / Competent Authority',
  head: 'Bureau/Cell Head',
  officer: 'Case Officer',
  regional: 'Regional Officer',
};

// Alert thresholds
export const SLA_APPROACHING_DAYS = 7; // alert when ≤ 7 days left
export const PENDING_REMINDER_DAYS = 15; // alert when no action for 15+ days
export const AUTO_ESCALATION_OVERDUE_DAYS = 30; // suggest escalation when overdue by 30+ days
