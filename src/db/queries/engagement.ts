import { database } from '../index';

/**
 * Get current streak for a language
 * Streak is consecutive days with at least one study attempt or passed mock exam
 */
export async function getCurrentStreak(lang: number): Promise<number> {
  // Get all study dates from answer attempts
  // Note: Drizzle stores timestamps as seconds (Unix epoch), so no need to divide by 1000
  const studyDates = await database.getAllAsync(
    `SELECT DISTINCT DATE(created_at, 'unixepoch') as study_date
    FROM answer_attempts
    WHERE lang = ? AND mode IN ('study', 'mistakes')
    ORDER BY study_date DESC`,
    [lang]
  );
  
  // Get all dates with passed mock exams
  const mockDates = await database.getAllAsync(
    `SELECT DISTINCT DATE(completed_at, 'unixepoch') as exam_date
    FROM mock_exams
    WHERE lang = ? AND passed = 1 AND completed_at IS NOT NULL
    ORDER BY exam_date DESC`,
    [lang]
  );
  
  // Combine and deduplicate dates
  const allDates = new Set<string>();
  for (const row of studyDates as any[]) {
    allDates.add(row.study_date);
  }
  for (const row of mockDates as any[]) {
    allDates.add(row.exam_date);
  }
  
  const sortedDates = Array.from(allDates).sort((a, b) => b.localeCompare(a));
  
  if (sortedDates.length === 0) return 0;
  
  // Check if today or yesterday is in the list
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    // No activity today or yesterday, streak is 0
    return 0;
  }
  
  // Count consecutive days from today backwards
  let streak = 0;
  let expectedDate = today;
  
  for (const date of sortedDates) {
    if (date === expectedDate || date === yesterday) {
      streak++;
      // Calculate previous day
      const dateObj = new Date(date);
      dateObj.setDate(dateObj.getDate() - 1);
      expectedDate = dateObj.toISOString().split('T')[0];
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Get last study date for a language
 */
export async function getLastStudyDate(lang: number): Promise<string | null> {
  const result = await database.getAllAsync(
    `SELECT MAX(DATE(created_at, 'unixepoch')) as last_date
    FROM answer_attempts
    WHERE lang = ? AND mode IN ('study', 'mistakes')`,
    [lang]
  );
  
  return (result[0] as { last_date?: string })?.last_date || null;
}

/**
 * Get last opened date (most recent activity of any kind)
 */
export async function getLastOpenedDate(lang: number): Promise<string | null> {
  const studyResult = await database.getAllAsync(
    `SELECT MAX(DATE(created_at, 'unixepoch')) as last_date
    FROM answer_attempts
    WHERE lang = ?`,
    [lang]
  );
  
  const mockResult = await database.getAllAsync(
    `SELECT MAX(DATE(created_at, 'unixepoch')) as last_date
    FROM mock_exams
    WHERE lang = ?`,
    [lang]
  );
  
  const studyDate = (studyResult[0] as { last_date?: string })?.last_date;
  const mockDate = (mockResult[0] as { last_date?: string })?.last_date;
  
  if (!studyDate && !mockDate) return null;
  if (!studyDate) return mockDate;
  if (!mockDate) return studyDate;
  
  return studyDate > mockDate ? studyDate : mockDate;
}
