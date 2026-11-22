/**
 * Academic calendar for III Sem M.Tech & MCA programs, academic year 2026-27 (2025-27 batch).
 * Transcribed from docs/reference/Calendar of events - III Sem.pdf (RVCE/DA/195/2026-27,
 * Dean Academics, 10 July 2026). Loaded by the seed as institution-wide, all-day calendar events.
 *
 * Notes from the circular: industry internship (mandatory) must be completed before III
 * semester classes start; an activity falling on a Sunday or general public holiday moves to the
 * next working day; the calendar is tentative.
 */
export const ACADEMIC_CALENDAR = {
  reference: 'RVCE/DA/195/2026-27',
  issued: '2026-07-10',
  title: 'Academic calendar for III Sem M.Tech & MCA programs (2025-27 batch)',
  // [Sl. No., activity, from, to (or null for a single day), type]
  events: [
    [1, 'Internship', '2026-08-03', '2026-09-12', 'Internship'],
    [2, 'Commencement of Odd Sem', '2026-09-16', null, 'Academic date'],
    [3, 'Registration for the Even Sem', '2026-09-16', '2026-09-18', 'Academic date'],
    [4, 'Internship Review I', '2026-09-30', '2026-10-01', 'Review'],
    [5, 'Last date for dropping of courses', '2026-10-14', null, 'Deadline'],
    [6, 'CIE-I', '2026-10-14', '2026-10-16', 'CIE'],
    [7, 'Faculty Appraisal by Students (Mid Sem review)', '2026-10-22', '2026-10-24', 'Academic date'],
    [8, 'Counselling & Student Performance Review - I', '2026-10-27', null, 'Review'],
    [9, 'Minor Project: Phase I Review', '2026-10-22', '2026-10-24', 'Review'],
    [10, 'Internship Review II', '2026-11-04', '2026-11-06', 'Review'],
    [11, 'Minor Project: Phase II Review', '2026-11-25', '2026-11-28', 'Review'],
    [12, 'CIE-II', '2026-12-02', '2026-12-04', 'CIE'],
    [13, 'Counselling & Student Performance Review - II', '2026-12-07', null, 'Review'],
    [14, 'Last date for withdrawal of courses', '2026-12-14', null, 'Deadline'],
    [15, 'Submission of Internship Report', '2026-12-07', '2026-12-08', 'Deadline'],
    [16, 'Improvement CIE', '2026-12-10', '2026-12-12', 'CIE'],
    [17, 'Minor Project: Phase III Review', '2026-12-14', '2026-12-16', 'Review'],
    [18, 'Submission of Minor Project Report', '2026-12-21', '2026-12-24', 'Deadline'],
    [19, 'Faculty appraisal by students (End Semester Review)', '2026-12-24', null, 'Academic date'],
    [20, 'Finalization of CIE marks and Entry of marks in SAP', '2026-12-28', null, 'CIE'],
    [21, 'Submission of final CIE marks to CoE', '2026-12-29', null, 'CIE'],
    [22, 'Last working day of III Semester', '2026-12-31', null, 'Academic date'],
    [23, 'Generation of Hall ticket', '2027-01-01', null, 'Exam'],
    [24, 'Semester End Examinations (Practical)', '2027-01-04', '2027-01-09', 'Exam'],
    [25, 'Semester End Examinations (Theory)', '2027-01-11', '2027-01-18', 'Exam'],
    [26, 'Declaration of Provisional Results', '2027-01-28', null, 'Results'],
    [27, 'Applying to PVP', '2027-01-29', '2027-02-01', 'Results'],
    [28, 'Registration for Make-up exams', '2027-01-29', '2027-02-01', 'Exam'],
    [29, 'Make-up exams', '2027-02-10', null, 'Exam'],
    // 30. Commencement of New Semester: to be announced later.
  ],
};
