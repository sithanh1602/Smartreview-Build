import React from 'react';
import { Link } from 'react-router-dom';
export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="eyebrow mb-3">404</p>
      <h1 className="text-2xl font-semibold">Trang này không tồn tại.</h1>
      <Link className="button mt-6" to="/">
        Về tổng quan
      </Link>
    </main>
  );
}
