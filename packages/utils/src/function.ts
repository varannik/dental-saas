export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function memoize<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T
): T {
  const cache = new Map<string, ReturnType<T>>();

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  } as T;
}

export function once<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T
): T {
  let called = false;
  let result: ReturnType<T>;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  } as T;
}

export function noop(): void {
  // Intentionally empty
}

export function identity<T>(value: T): T {
  return value;
}

