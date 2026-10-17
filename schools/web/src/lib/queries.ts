/** TanStack Query hooks over the API; every write invalidates what it touched. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Locale } from '@/i18n'
import { api } from './api'
import type {
  Branch,
  DocumentRow,
  DrivingLesson,
  Group,
  GroupDetail,
  GroupListItem,
  Instructor,
  JoinCode,
  Lesson,
  Me,
  Overview,
  School,
  Student,
  StudentDetail,
  StudentListItem,
} from './types'

export const keys = {
  me: ['me'] as const,
  school: ['school'] as const,
  overview: ['overview'] as const,
  instructors: ['instructors'] as const,
  branches: ['branches'] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  lessons: (id: string) => ['groups', id, 'lessons'] as const,
  students: (q: string, groupId?: string) => ['students', q, groupId ?? ''] as const,
  student: (id: string) => ['students', id] as const,
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>('/api/v1/auth/me'), retry: false, staleTime: 60_000 })
export const useSchool = () => useQuery({ queryKey: keys.school, queryFn: () => api.get<School>('/api/v1/school') })
export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: () => api.get<Overview>('/api/v1/school/overview') })
export const useInstructors = () => useQuery({ queryKey: keys.instructors, queryFn: () => api.get<Instructor[]>('/api/v1/instructors') })
export const useBranches = () => useQuery({ queryKey: keys.branches, queryFn: () => api.get<Branch[]>('/api/v1/branches') })
export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: () => api.get<GroupListItem[]>('/api/v1/groups') })
export const useGroup = (id: string) => useQuery({ queryKey: keys.group(id), queryFn: () => api.get<GroupDetail>(`/api/v1/groups/${id}`) })
export const useLessons = (id: string) => useQuery({ queryKey: keys.lessons(id), queryFn: () => api.get<Lesson[]>(`/api/v1/groups/${id}/lessons`) })
export const useStudents = (q: string, groupId?: string) =>
  useQuery({
    queryKey: keys.students(q, groupId),
    queryFn: () => api.get<StudentListItem[]>(`/api/v1/students?q=${encodeURIComponent(q)}${groupId ? `&group_id=${groupId}` : ''}`),
    placeholderData: (prev) => prev,
  })
export const useStudent = (id: string) => useQuery({ queryKey: keys.student(id), queryFn: () => api.get<StudentDetail>(`/api/v1/students/${id}`) })

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, invalidate: (args: TArgs, result: TResult) => readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, args) => {
      for (const key of invalidate(args, result)) void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export const useLogin = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<Me>('/api/v1/auth/login', body),
    onSuccess: (me) => {
      // Another school may have been signed in before in this tab: forget everything it loaded.
      qc.clear()
      qc.setQueryData(keys.me, me)
    },
  })
}

export const useLogout = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: () => api.post<void>('/api/v1/auth/logout'), onSuccess: () => qc.clear() })
}

export const useUpdateSchool = () => useInvalidating((body: Partial<School>) => api.patch<School>('/api/v1/school', body), () => [keys.school, keys.me])

export const useCreateGroup = () =>
  useInvalidating((body: Partial<Group> & { name: string }) => api.post<Group>('/api/v1/groups', body), () => [keys.groups, keys.overview])

export const usePatchGroup = (id: string) =>
  useInvalidating((body: Record<string, unknown>) => api.patch<Group>(`/api/v1/groups/${id}`, body), () => [keys.groups, keys.group(id), keys.overview, ['students']])

export const useGroupJoinCode = (id: string) => useInvalidating(() => api.post<JoinCode>(`/api/v1/groups/${id}/join-code`), () => [keys.group(id)])

export const useAddLesson = (groupId: string) =>
  useInvalidating(
    (body: { held_on: string; starts_at?: string; lessons: number; subject: string; topic?: string; present_ids?: string[] }) =>
      api.post<Lesson>(`/api/v1/groups/${groupId}/lessons`, body),
    () => [keys.lessons(groupId), keys.group(groupId), keys.groups, ['students']],
  )

export const useSetAttendance = (groupId: string) =>
  useInvalidating(
    ({ lessonId, present_ids }: { lessonId: string; present_ids: string[] }) => api.put<Lesson>(`/api/v1/lessons/${lessonId}/attendance`, { present_ids }),
    () => [keys.lessons(groupId), keys.group(groupId), keys.groups, ['students']],
  )

export const useCreateStudent = () =>
  useInvalidating((body: Partial<Student> & { first_name: string; last_name: string; group_id?: string; price_cents?: number }) => api.post<Student>('/api/v1/students', body), (args) => [
    ['students'],
    keys.groups,
    keys.overview,
    ...(args.group_id ? [keys.group(args.group_id)] : []),
  ])

export const usePatchStudent = (id: string) =>
  useInvalidating((body: Record<string, unknown>) => api.patch<Student>(`/api/v1/students/${id}`, body), () => [['students'], keys.groups])

export const useEnrol = (id: string) =>
  useInvalidating((body: { group_id: string; price_cents?: number; status?: string }) => api.post<Student>(`/api/v1/students/${id}/enrol`, body), () => [['students'], ['groups'], keys.overview])

export const useStudentJoinCode = (id: string) => useInvalidating(() => api.post<JoinCode>(`/api/v1/students/${id}/join-code`), () => [keys.student(id)])

export const useAddDrivingLesson = (id: string) =>
  useInvalidating(
    (body: { held_on: string; starts_at?: string; lessons: number; kind: string; km?: number; vehicle?: string; notes?: string }) =>
      api.post<DrivingLesson[]>(`/api/v1/students/${id}/driving-lessons`, body),
    () => [keys.student(id), ['groups']],
  )

export const useCreateDocument = (id: string) =>
  useInvalidating((body: { kind: string; fields?: Record<string, string>; lang?: Locale }) => api.post<DocumentRow>(`/api/v1/students/${id}/documents`, body), () => [keys.student(id)])

export const useCreateGroupDocument = (id: string) =>
  useInvalidating(
    (body: { kind: string; student_ids?: string[]; fields?: Record<string, string>; lang?: Locale }) => api.post<{ id: string; kind: string; title: string }>(`/api/v1/groups/${id}/documents`, body),
    () => [keys.group(id)],
  )

export const documentUrl = (id: string) => `/api/v1/documents/${id}/pdf`
