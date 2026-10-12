import { Spinner } from './Spinner';
import { hint } from '../lib/englishHints';
import React from 'react';
import { useDataset } from '../app/DatasetProvider';
export function DataBoundary({ children }: { children: React.ReactNode }) {
  const { loading, error, retry } = useDataset();
  if (loading)
    return (
      <div role="status" className="panel m-6 p-10 text-muted">
        <Spinner />
        {hint('Đang tải các case và dữ liệu video…')}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="panel m-6 p-8">
        <h1 className="mb-2 text-xl">Chưa kết nối được dữ liệu</h1>
        <p className="mb-5 text-muted">{error}</p>
        <button className="sr-button" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
  return children;
}
