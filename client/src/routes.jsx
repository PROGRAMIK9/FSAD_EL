import { lazy } from 'react';
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard.jsx'));
const People = lazy(() => import('./pages/people/People.jsx'));
const Structure = lazy(() => import('./pages/structure/Structure.jsx'));
const Subjects = lazy(() => import('./pages/subjects/Subjects.jsx'));
const Assessments = lazy(() => import('./pages/assessments/Assessments.jsx'));
const QuizBuilder = lazy(() => import('./pages/assessments/QuizBuilder.jsx'));
const QuestionBank = lazy(() => import('./pages/questions/QuestionBank.jsx'));
const ExamPage = lazy(() => import('./pages/exam/ExamPage.jsx'));
const ExamRoom = lazy(() => import('./pages/exam/ExamRoom.jsx'));
const AttemptRedirect = lazy(() => import('./pages/exam/ExamRoom.jsx').then((m) => ({ default: m.AttemptRedirect })));
import * as Legacy from './pages/legacy/LegacyPages.jsx';

const T = ['teacher', 'admin'];
const A = ['admin'];

/** Routes rendered inside the app shell (sidebar + topbar). */
export const appRoutes = [
  { path: '/', element: <Dashboard /> },
  { path: '/students', element: <People key="student" role="student" />, roles: A },
  { path: '/teachers', element: <People key="teacher" role="teacher" />, roles: A },
  { path: '/structure', element: <Structure />, roles: A },
  { path: '/subjects', element: <Subjects /> },
  { path: '/assessments', element: <Assessments /> },
  { path: '/assessments/new', element: <QuizBuilder key="new" />, roles: T },
  { path: '/assessments/:id/edit', element: <QuizBuilder key="edit" />, roles: T },
  { path: '/evaluation', element: <Legacy.Evaluation />, roles: T },
  { path: '/grades', element: <Legacy.Grades />, roles: ['student'] },
  { path: '/questions', element: <QuestionBank />, roles: T },
  { path: '/assignments', element: <Legacy.Assignments /> },
  { path: '/announcements', element: <Legacy.Announcements /> },
  { path: '/calendar', element: <Legacy.CalendarPage /> },
  { path: '/notifications', element: <Legacy.Notifications /> },
  { path: '/audit', element: <Legacy.Audit />, roles: A },
  { path: '/settings', element: <Legacy.SettingsPage />, roles: A },
  { path: '/rooms/:id', element: <ExamRoom /> },
];

/** Routes rendered without the shell (distraction-free exam screens). */
export const fullscreenRoutes = [
  { path: '/exam/:assessmentId', element: <ExamPage />, roles: ['student'] },
  { path: '/attempt/:id', element: <AttemptRedirect />, roles: ['student'] },
];
