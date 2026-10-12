// The React plugin makes Vite pre-bundle the JSX runtime, and a pre-bundled module keeps the
// copy of everything it imports until the dependency cache is rebuilt. Importing ../i18n here
// would freeze the dictionaries and the chosen language. So the runtime imports nothing from
// the app: ../i18n hands its translator over through this slot when it loads.
type TranslateProps = <P>(props: P) => P;
const slot = globalThis as { __smartreviewTranslateProps?: TranslateProps };
export const setTranslator = (translate: TranslateProps) => {
  slot.__smartreviewTranslateProps = translate;
};
export const translateProps: TranslateProps = (props) =>
  slot.__smartreviewTranslateProps ? slot.__smartreviewTranslateProps(props) : props;
