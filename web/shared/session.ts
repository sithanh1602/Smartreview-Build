// How long a sign-in lasts, for the server that enforces it and the page that warns about it.
// An hour, then at most 3 extensions of 5 minutes asked for in its last minutes.
export const SESSION_MINUTES = 60;
export const EXTENSION_MINUTES = 5;
export const MAX_EXTENSIONS = 3;
