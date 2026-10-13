import { FrameReviewPage } from '../pages/FrameReviewPage';
import { AiCheckPage } from '../pages/AiCheckPage';
import { FixesPage } from '../pages/FixesPage';
import { ProjectLayout } from '../features/projects/ProjectLayout';
import { ProjectsPage } from '../pages/ProjectsPage';
import { NewProjectPage } from '../pages/NewProjectPage';
import { NewProject3DPage } from '../pages/NewProject3DPage';
import { Project3DPage } from '../pages/Project3DPage';
import { ProjectDashboardPage } from '../pages/ProjectDashboardPage';
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { OverviewPage } from '../pages/OverviewPage';
import { ReviewPage } from '../pages/ReviewPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AuthGate } from '../features/auth/AuthGate';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { RolePage } from '../pages/RolePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AuthGate />,
    children: [
      { path: '/', element: <Navigate to="/projects" replace /> },
      { path: '/project', element: <Navigate to="/projects" replace /> },
      { path: '/poject', element: <Navigate to="/projects" replace /> },
      { path: '/annotation', element: <Navigate to="/projects" replace /> },
      { path: '/role', element: <RolePage /> },
      {
        element: <ProjectLayout />,
        children: [
          { path: '/projects', element: <ProjectsPage /> },
          {
            element: <AuthGate leader />,
            children: [
              { path: '/projects/new', element: <NewProjectPage /> },
              { path: '/projects/new-3d', element: <NewProject3DPage /> },
            ],
          },
          { path: '/projects/:projectId', element: <ProjectDashboardPage /> },
          { path: '/projects3d/:projectId', element: <Project3DPage /> },
          { path: '/projects/:projectId/ai-check', element: <AiCheckPage /> },
          { path: '/projects/:projectId/fixes', element: <FixesPage /> },
          { path: '/projects/:projectId/frames', element: <FrameReviewPage /> },
          { path: '/projects/:projectId/frames/:frameId', element: <FrameReviewPage /> },
        ],
      },
      {
        // The viewer brings three.js with it, so it is loaded only when opened.
        path: '/projects3d/:projectId/viewer',
        lazy: async () => ({ Component: (await import('../pages/Viewer3DPage')).Viewer3DPage }),
      },
      {
        path: '/projects/:projectId/review',
        element: <AppLayout />,
        children: [
          { index: true, element: <ReviewPage /> },
          { path: ':caseId', element: <ReviewPage /> },
        ],
      },
      {
        // The default dataset outside any project is the leader's.
        element: <AuthGate leader />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/overview', element: <OverviewPage /> },
              { path: '/review', element: <ReviewPage /> },
              { path: '/review/:caseId', element: <ReviewPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
