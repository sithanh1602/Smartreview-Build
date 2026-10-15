import React from 'react';
import { Import3DForm } from '../features/projects3d/Import3DForm';
export function NewProject3DPage() {
  return (
    <>
      <p className="eyebrow mb-3 text-accent">LIDAR · CUBOID 3D</p>
      <h1 className="mb-3 text-3xl font-semibold">Project 3D mới</h1>
      <p className="mb-8 text-sm text-muted">
        Tạo project → upload segment Waymo → chuyển thành point cloud → lưu trữ.
      </p>
      <Import3DForm />
    </>
  );
}
