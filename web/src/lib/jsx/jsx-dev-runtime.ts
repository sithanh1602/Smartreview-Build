// Development twin of ./jsx-runtime.ts.
import * as runtime from 'react/jsx-dev-runtime';
import { translateProps } from '../i18n.ts';

type CreateDev = (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => unknown;
const react = runtime as unknown as { jsxDEV: CreateDev; Fragment: unknown };
export const Fragment = react.Fragment;
export const jsxDEV: CreateDev = (type, props, ...rest) =>
  react.jsxDEV(type, translateProps(props), ...rest);
