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
import { AnnotationHomePage } from '../pages/AnnotationHomePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AuthGate role="annotator" />,
    children: [{ path: '/annotation', element: <AnnotationHomePage /> }],
  },
  {
    element: <AuthGate role="reviewer" />,
    children: [
      { path: '/', element: <Navigate to="/projects" replace /> },
      { path: '/project', element: <Navigate to="/projects" replace /> },
      { path: '/poject', element: <Navigate to="/projects" replace /> },
      {
        element: <ProjectLayout />,
        children: [
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/new', element: <NewProjectPage /> },
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
        element: <AppLayout />,
        children: [
          { path: '/overview', element: <OverviewPage /> },
          { path: '/review', element: <ReviewPage /> },
          { path: '/review/:caseId', element: <ReviewPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
