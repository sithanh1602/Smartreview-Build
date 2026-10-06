import { hint } from '../lib/englishHints';
import React from 'react';
import { ImportForm } from '../features/projects/ImportForm';
export function NewProjectPage() {
  return (
    <>
      <p className="eyebrow mb-3 text-accent">{hint('ANNOTATED DATASET')}</p>
      <h1 className="mb-3 text-3xl font-semibold">{hint('New Project')}</h1>
      <p className="mb-8 text-sm text-muted">
        {hint('Tạo project → upload → validate → QA checks → review.')}
      </p>
      <ImportForm />
    </>
  );
}
