export const VERSION = '0.1.4';

export const VERSION_PARTS = (() => {
  const [major, minor, patch] = VERSION.split('.').map((n) => Number(n));
  return { major, minor, patch };
})();

