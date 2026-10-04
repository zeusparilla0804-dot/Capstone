const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedFrontendOrigin(
  requestOrigin: string,
  configuredOrigin: string,
  isProduction: boolean,
): boolean {
  if (requestOrigin === configuredOrigin) return true;
  if (isProduction) return false;

  try {
    const requestUrl = new URL(requestOrigin);
    const configuredUrl = new URL(configuredOrigin);

    return (
      LOOPBACK_HOSTS.has(requestUrl.hostname) &&
      LOOPBACK_HOSTS.has(configuredUrl.hostname) &&
      requestUrl.protocol === configuredUrl.protocol &&
      requestUrl.port === configuredUrl.port
    );
  } catch {
    return false;
  }
}
