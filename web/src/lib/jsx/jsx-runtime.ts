// The app's JSX runtime: React's own, with text translated on the way in (see ../i18n).
import * as runtime from 'react/jsx-runtime';
import { translateProps } from '../i18n.ts';

type Create = (type: unknown, props: Record<string, unknown>, key?: unknown) => unknown;
const react = runtime as unknown as { jsx: Create; jsxs: Create; Fragment: unknown };
export const Fragment = react.Fragment;
export const jsx: Create = (type, props, key) => react.jsx(type, translateProps(props), key);
export const jsxs: Create = (type, props, key) => react.jsxs(type, translateProps(props), key);
