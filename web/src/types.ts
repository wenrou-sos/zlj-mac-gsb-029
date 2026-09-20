// 与后端接口对应的类型定义（snake_case 与数据库一致）

export type MonkStatus = 'guadan' | 'inspection' | 'permanent' | 'left';
export type AttendanceStatus = 'present' | 'absent' | 'leave';
export type SessionType = 'morning' | 'evening';
export type InspectionResult = 'pending' | 'passed' | 'failed';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'returned';

export interface Monk {
  id: string;
  dharma_name: string;
  home_monastery: string | null;
  ordination_no: string | null;
  generation: string | null;
  tonsure_master: string | null;
  ordination_date: string | null;
  ordination_place: string | null;
  current_post: string | null;
  note: string | null;
  status: MonkStatus;
  created_at: string;
  updated_at: string;
  room_no?: string | null;
  bed_no?: string | null;
}

export interface Guadan {
  id: string;
  monk_id: string;
  arrive_date: string;
  expected_days: number;
  bed_id: string | null;
  status: 'active' | 'closed';
  leave_date: string | null;
  note: string | null;
  dharma_name: string;
  home_monastery: string | null;
  ordination_no: string | null;
  monk_status: MonkStatus;
  room_no: string | null;
  bed_no: string | null;
  expected_leave: string;
}

export interface Bed {
  id: string;
  room_id: string;
  bed_no: string;
  monk_id: string | null;
  dharma_name: string | null;
  monk_status: MonkStatus | null;
}

export interface Room {
  id: string;
  room_no: string;
  capacity: number;
  note: string | null;
  bed_count: number;
  occupied_count: number;
  beds: Bed[];
}

export interface AvailableBed {
  id: string;
  bed_no: string;
  room_id: string;
  room_no: string;
}

export interface Inspection {
  id: string;
  monk_id: string;
  guadan_id: string;
  start_date: string;
  expected_end: string;
  result: InspectionResult;
  karma_date: string | null;
  decided_at: string | null;
  note: string | null;
  dharma_name: string;
  ordination_no: string | null;
  days_elapsed: number;
  days_left?: number;
}

export interface AttendanceRow {
  monk_id: string;
  dharma_name: string;
  monk_status: MonkStatus;
  current_post: string | null;
  id: string | null;
  status: AttendanceStatus | null;
  note: string | null;
  recorded_by: string | null;
  updated_at: string | null;
}

export interface AttendanceSummary {
  monk_id: string;
  dharma_name: string;
  monk_status: MonkStatus;
  current_post: string | null;
  absent_count: number;
  leave_count: number;
  present_count: number;
  last_absence: string | null;
  has_open_alert: boolean;
}

export interface LeaveRequest {
  id: string;
  monk_id: string;
  start_date: string;
  end_date: string;
  sessions: SessionType[];
  reason: string;
  status: LeaveStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  return_date: string | null;
  returned_by: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
  dharma_name: string;
  monk_status: MonkStatus;
  current_post: string | null;
  room_no: string | null;
  bed_no: string | null;
  days: number;
}

export interface AbsenceAlert {
  id: string;
  monk_id: string;
  window_days: number;
  absence_count: number;
  last_absence: string;
  status: 'open' | 'acknowledged';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  dharma_name: string;
  monk_status: MonkStatus;
  current_post: string | null;
  room_no: string | null;
  bed_no: string | null;
}

export interface Dashboard {
  status_counts: { status: MonkStatus; n: number }[];
  attendance_today: Record<string, number>;
  open_alerts: number;
  pending_leaves: number;
  on_leave_today: number;
  expiring_guadan: {
    id: string; dharma_name: string; expected_leave: string; days_left: number;
  }[];
  pending_inspections: Inspection[];
  bed_usage: { total: number; occupied: number };
  today: string;
}
