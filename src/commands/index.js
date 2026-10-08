// Registry of every command. Keys must match the `bin` entries in package.json.
// Loaders are lazy so running one command doesn't import the others.
export const commands = {
  'valor-stagger-start': () => import('./valor-stagger-start.js'),
};
