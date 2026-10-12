import { FrameReviewPage } from '../pages/FrameReviewPage';
import { AiCheckPage } from '../pages/AiCheckPage';
import { ProjectLayout } from '../features/projects/ProjectLayout';
import { ProjectsPage } from '../pages/ProjectsPage';
import { NewProjectPage } from '../pages/NewProjectPage';
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
            children: [{ path: '/projects/new', element: <NewProjectPage /> }],
          },
          { path: '/projects/:projectId', element: <ProjectDashboardPage /> },
          { path: '/projects/:projectId/ai-check', element: <AiCheckPage /> },
          { path: '/projects/:projectId/frames', element: <FrameReviewPage /> },
          { path: '/projects/:projectId/frames/:frameId', element: <FrameReviewPage /> },
        ],
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
