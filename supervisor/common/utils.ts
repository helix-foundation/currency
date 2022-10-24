

export function isObject(value: any): boolean {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export async function asyncForEach<T>(
  array: any[],
  callback: (value: T, index: number, a: T[]) => Promise<void>,
) {
  for (let i = 0; i < array.length; i++) {
    await callback(array[i], i, array)
  }
}
