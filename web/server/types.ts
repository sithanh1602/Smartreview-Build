import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { loadDataset } from './repository.ts';
import type { ReviewStore } from './reviews/store.ts';

export type Db = Pool;
export type Connection = PoolConnection;
// Rows come back untyped from MySQL; each query reads the columns it selected.
export type Rows = RowDataPacket[];
export type Result = ResultSetHeader;

export type Role = 'reviewer' | 'annotator';
export interface User {
  id: string;
  username: string;
  role: Role;
}
// Requests from http.Server always carry a method and a URL.
export type Req = IncomingMessage & { method: string; url: string; user?: User };
export type Res = ServerResponse;
export type Json = (res: Res, status: number, data: unknown) => void;

export type LoadedDataset = Awaited<ReturnType<typeof loadDataset>>;
export type Case = LoadedDataset['allCases'][number];
export interface ProjectContext {
  dataset: LoadedDataset;
  reviews: ReviewStore;
}
