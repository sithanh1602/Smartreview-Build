import React from 'react';
import { AccountMenu } from '../features/auth/AuthGate';
export function AnnotationHomePage() {
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-panel px-8 py-5">
        <span className="text-lg font-semibold">
          Smart<span className="text-accent">Review</span>
        </span>
        <AccountMenu />
      </header>
      <main className="mx-auto max-w-4xl px-5 py-16">
        <p className="eyebrow text-accent">ANNOTATOR WORKSPACE</p>
        <h1 className="mt-3 text-3xl font-semibold">Không gian gán nhãn</h1>
        <section className="panel mt-8 p-8">
          <h2 className="text-xl font-semibold">Chức năng annotation sẽ sớm được bổ sung</h2>
          <p className="mt-3 text-muted">
            Đây là không gian làm việc dành cho người gán nhãn. Công cụ và danh sách công việc sẽ
            xuất hiện tại đây khi sẵn sàng.
          </p>
        </section>
      </main>
    </div>
  );
}
