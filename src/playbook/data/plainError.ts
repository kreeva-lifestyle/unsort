// A sentence written for the person reading it (what happened, what to do
// next). friendlyError() shows such an error as it is: without the mark its
// length fallback swaps any sentence of 80 characters or more for "Something
// went wrong", and its keyword tests can misread ordinary words.
export const plainError = (message: string): Error => Object.assign(new Error(message), { plain: true });
