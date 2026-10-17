import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthLayout } from '../features/auth/AuthLayout';
import { request } from '../lib/api';
import type { MemberRole, Project } from '../types.ts';

const ROLES: [MemberRole, string, string][] = [
  ['reviewer', 'Reviewer', 'Kiểm tra và đánh giá nhãn trong các project bạn tham gia.'],
  ['annotator', 'Annotator', 'Xem và sửa nhãn trong các project bạn tham gia.'],
];
// Asked after a member signs in. The choice only picks which of the member's projects are
// listed; what the member may do in a project is the role the leader gave it there.
export function RolePage() {
  const { user, workRole, chooseWorkRole, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    const c = new AbortController();
    request<Project[]>('/projects', { signal: c.signal })
      .then(setProjects)
      .catch(() => {});
    return () => c.abort();
  }, []);
  if (user?.role !== 'member') return <Navigate to="/projects" replace />;
  return (
    <AuthLayout
      title="Chọn vai trò làm việc"
      footer={
        <button className="underline underline-offset-4" onClick={() => logout()}>
          Đăng xuất
        </button>
      }
    >
      <p className="mb-6 text-center text-sm text-(--muted)">
        Bạn đổi được vai trò bất cứ lúc nào. Chưa có project? Nhờ Leader thêm bạn vào project.
      </p>
      <div className="flex flex-col gap-4">
        {ROLES.map(([role, label, description]) => (
          <Button
            key={role}
            variant={workRole === role ? 'primary' : 'secondary'}
            size="lg"
            fullWidth
            className="h-auto flex-col items-start gap-1 py-4 text-left whitespace-normal"
            onPress={() => {
              chooseWorkRole(role);
              navigate('/projects', { replace: true });
            }}
          >
            <span className="flex w-full items-center justify-between gap-3 font-semibold">
              {label}
              {projects && (
                <span className="text-xs font-normal" data-testid={`role-count-${role}`}>
                  {projects.filter((p) => p.my_role === role).length} project
                </span>
              )}
            </span>
            <span className="text-xs font-normal opacity-80">{description}</span>
          </Button>
        ))}
      </div>
    </AuthLayout>
  );
}
