// 扩展在重载/更新/页面切换时，content script 可能被销毁，导致 Promise 抛出
// "Extension context invalidated."。这类错误对用户无意义，应该静默吞掉，避免控制台刷屏。

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : error == null ? '' : String(error);

  return (
    message.includes('Extension context invalidated') ||
    message.includes('extension context invalidated') ||
    (message.includes('context') && message.includes('invalidated'))
  );
}

export async function swallowExtensionContextInvalidated<T>(
  promise: Promise<T>,
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return undefined;
    throw error;
  }
}

