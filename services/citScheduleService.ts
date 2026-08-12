import { getCurrentUser } from './authService';
import { supabase } from './supabase';

export const WILDCAT_ONE_URL = 'https://yeahsleepwellgoodluckveralove.vercel.app/';
export const WILDCAT_IMPORT_WEEKS = 16;

export type WildcatDay = {
  idDay: number | null;
  code: string;
};

export type WildcatMeeting = {
  courseOfferingScheduleID: string;
  roomName: string;
  type: string;
  timeFrom: string;
  timeTo: string;
  isLab: boolean;
  day: WildcatDay[];
};

export type WildcatCourse = {
  enrollmentCourseRegistrationID: string;
  courseCode: string;
  description: string;
  section: string;
  instructor: string;
  modeOfDelivery: string;
  schedule: WildcatMeeting[];
};

export type WildcatSchedulePayload = {
  resultCode: 200;
  items: WildcatCourse[];
};

type CapturedMessage = {
  type: 'PLANADO_SCHEDULE';
  payload: WildcatSchedulePayload;
};

type ImportScheduleInput = {
  payload: WildcatSchedulePayload;
  groupId: string;
  color: string;
  weeks?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeString(value: unknown, maxLength = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeIdentifier(value: unknown, fallback: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = safeString(value, 100);
  return text || fallback;
}

function parseDay(value: unknown): WildcatDay | null {
  const row = asRecord(value);
  if (!row) return null;
  const code = safeString(row.code, 12).toUpperCase();
  const idDay = typeof row.idDay === 'number' && Number.isInteger(row.idDay) ? row.idDay : null;
  if (!code && idDay === null) return null;
  return { idDay, code };
}

function parseMeeting(value: unknown, fallbackId: string): WildcatMeeting | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.day)) return null;
  const timeFrom = safeString(row.timeFrom, 30);
  const timeTo = safeString(row.timeTo, 30);
  const days = row.day.slice(0, 7).map(parseDay).filter((day): day is WildcatDay => day !== null);
  if (!timeFrom || !timeTo || !days.length) return null;

  return {
    courseOfferingScheduleID: safeIdentifier(row.courseOfferingScheduleID, fallbackId),
    roomName: safeString(row.roomName, 300),
    type: safeString(row.type, 30) || (row.isLab === true ? 'LAB' : 'CLASS'),
    timeFrom,
    timeTo,
    isLab: row.isLab === true,
    day: days,
  };
}

function parseCourse(value: unknown, courseIndex: number): WildcatCourse | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.schedule)) return null;
  const enrollmentId = safeIdentifier(row.enrollmentCourseRegistrationID, `course-${courseIndex}`);
  const courseCode = safeString(row.courseCode, 60);
  const schedule = row.schedule
    .slice(0, 20)
    .map((meeting, meetingIndex) => parseMeeting(meeting, `${enrollmentId}-${meetingIndex}`))
    .filter((meeting): meeting is WildcatMeeting => meeting !== null);
  if (!courseCode || !schedule.length) return null;

  return {
    enrollmentCourseRegistrationID: enrollmentId,
    courseCode,
    description: safeString(row.description, 500),
    section: safeString(row.section, 80),
    instructor: safeString(row.instructor, 200),
    modeOfDelivery: safeString(row.modeOfDelivery, 100),
    schedule,
  };
}

export function parseWildcatWebViewMessage(rawMessage: string): CapturedMessage | null {
  if (rawMessage.length > 1_000_000) return null;

  try {
    const message = asRecord(JSON.parse(rawMessage) as unknown);
    if (!message || message.type !== 'PLANADO_SCHEDULE') return null;
    const payload = asRecord(message.payload);
    if (!payload || payload.resultCode !== 200 || !Array.isArray(payload.items)) return null;

    const items = payload.items
      .slice(0, 100)
      .map(parseCourse)
      .filter((course): course is WildcatCourse => course !== null);
    if (!items.length) return null;

    return { type: 'PLANADO_SCHEDULE', payload: { resultCode: 200, items } };
  } catch {
    return null;
  }
}

export function getWildcatScheduleStats(payload: WildcatSchedulePayload) {
  return {
    courses: payload.items.length,
    weeklyMeetings: payload.items.reduce((total, course) => (
      total + course.schedule.reduce((meetingTotal, meeting) => meetingTotal + meeting.day.length, 0)
    ), 0),
  };
}

function weekdayFromDay(day: WildcatDay) {
  const code = day.code.replace(/[^A-Z]/g, '');
  const mapping: Record<string, number> = {
    SU: 0, SUN: 0, SUNDAY: 0,
    M: 1, MON: 1, MONDAY: 1,
    T: 2, TU: 2, TUE: 2, TUESDAY: 2,
    W: 3, WED: 3, WEDNESDAY: 3,
    TH: 4, R: 4, THU: 4, THURSDAY: 4,
    F: 5, FRI: 5, FRIDAY: 5,
    S: 6, SA: 6, SAT: 6, SATURDAY: 6,
  };
  if (code in mapping) return mapping[code];
  if (day.idDay !== null && day.idDay >= 1 && day.idDay <= 7) return day.idDay % 7;
  return null;
}

function parseClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || hour > (period ? 12 : 23)) return null;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour < 12) hour += 12;
  return { hour, minute };
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eventRows(input: ImportScheduleInput, userId: string) {
  const firstDate = new Date();
  firstDate.setHours(0, 0, 0, 0);
  const lastDate = new Date(firstDate);
  lastDate.setDate(lastDate.getDate() + (input.weeks ?? WILDCAT_IMPORT_WEEKS) * 7);

  const rows: Array<Record<string, unknown>> = [];
  for (const course of input.payload.items) {
    for (const meeting of course.schedule) {
      const startClock = parseClock(meeting.timeFrom);
      const endClock = parseClock(meeting.timeTo);
      if (!startClock || !endClock) continue;

      for (const day of meeting.day) {
        const weekday = weekdayFromDay(day);
        if (weekday === null) continue;

        const date = new Date(firstDate);
        date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
        while (date <= lastDate) {
          const startTime = new Date(date);
          startTime.setHours(startClock.hour, startClock.minute, 0, 0);
          const endTime = new Date(date);
          endTime.setHours(endClock.hour, endClock.minute, 0, 0);
          if (endTime <= startTime) endTime.setDate(endTime.getDate() + 1);

          const details = [
            course.description,
            course.section ? `Section ${course.section}` : '',
            meeting.roomName ? `Room: ${meeting.roomName}` : 'Room: To be announced',
            course.instructor ? `Instructor: ${course.instructor}` : '',
            course.modeOfDelivery ? `Delivery: ${course.modeOfDelivery}` : '',
          ].filter(Boolean).join('\n');
          const type = meeting.type.toUpperCase();
          const title = `${course.courseCode}${type && type !== 'CLASS' ? ` · ${type}` : ''}`.slice(0, 120);
          const dayKey = day.code || String(day.idDay ?? weekday);

          rows.push({
            group_id: input.groupId,
            created_by: userId,
            title,
            description: details || null,
            location: meeting.roomName || null,
            category: 'school',
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            is_all_day: false,
            color: input.color,
            visibility: 'private',
            status: 'active',
            external_source: 'wildcat_one',
            external_id: `${meeting.courseOfferingScheduleID}:${dayKey}:${localDateKey(date)}`.slice(0, 240),
          });
          date.setDate(date.getDate() + 7);
        }
      }
    }
  }
  return rows;
}

export async function importWildcatSchedule(input: ImportScheduleInput) {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to import a schedule.');
  if (!input.groupId) throw new Error('Choose a CIT-U group first.');

  const rows = eventRows(input, user.id);
  if (!rows.length) throw new Error('No valid class times were found in this schedule.');

  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase
      .from('events')
      .upsert(rows.slice(index, index + 200), {
        onConflict: 'created_by,external_source,external_id',
      });
    if (error) throw error;
  }

  return { imported: rows.length, weeks: input.weeks ?? WILDCAT_IMPORT_WEEKS };
}
