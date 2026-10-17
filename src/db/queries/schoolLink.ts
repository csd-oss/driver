import { database } from '../index';

/**
 * The driving-school link stored on the settings row (columns added in migrate.ts). Raw SQL so
 * the rest of the settings code (`SettingsData`) stays as it is.
 */
export interface SchoolLink {
  token: string;
  schoolName: string;
  groupName: string | null;
  studentName: string;
  linkedAt: Date;
  lastSyncAt: Date | null;
}

interface Row {
  school_token: string | null;
  school_name: string | null;
  school_group_name: string | null;
  school_student_name: string | null;
  school_linked_at: number | null;
  school_last_sync_at: number | null;
}

const toDate = (seconds: number | null): Date | null => (seconds === null ? null : new Date(seconds * 1000));

export async function getSchoolLink(): Promise<SchoolLink | null> {
  const row = await database.getFirstAsync<Row>(
    `SELECT school_token, school_name, school_group_name, school_student_name, school_linked_at, school_last_sync_at
       FROM settings WHERE id = 1`
  );
  if (!row || !row.school_token) return null;
  return {
    token: row.school_token,
    schoolName: row.school_name ?? '',
    groupName: row.school_group_name,
    studentName: row.school_student_name ?? '',
    linkedAt: toDate(row.school_linked_at) ?? new Date(0),
    lastSyncAt: toDate(row.school_last_sync_at),
  };
}

export async function saveSchoolLink(link: Omit<SchoolLink, 'lastSyncAt'>): Promise<void> {
  await database.runAsync(
    `UPDATE settings SET school_token = ?, school_name = ?, school_group_name = ?, school_student_name = ?,
            school_linked_at = ?, school_last_sync_at = NULL, updated_at = ? WHERE id = 1`,
    link.token,
    link.schoolName,
    link.groupName,
    link.studentName,
    Math.floor(link.linkedAt.getTime() / 1000),
    Math.floor(Date.now() / 1000)
  );
}

export async function setSchoolLastSync(at: Date): Promise<void> {
  await database.runAsync(`UPDATE settings SET school_last_sync_at = ? WHERE id = 1`, Math.floor(at.getTime() / 1000));
}

export async function clearSchoolLink(): Promise<void> {
  await database.runAsync(
    `UPDATE settings SET school_token = NULL, school_name = NULL, school_group_name = NULL, school_student_name = NULL,
            school_linked_at = NULL, school_last_sync_at = NULL, updated_at = ? WHERE id = 1`,
    Math.floor(Date.now() / 1000)
  );
}
