export type EnumLike = Record<string, string | number>
export type Enum<T extends EnumLike> = T[keyof T]

export const Enum: (<const T extends EnumLike>(e: T) => T) & {
    keys: <T extends EnumLike>(e: T) => (keyof T)[]
    values: <T extends EnumLike>(e: T) => Enum<T>[]
    entries: <T extends EnumLike>(e: T) => [keyof T, Enum<T>][]
    keyOf: <T extends EnumLike>(e: T, value: Enum<T>) => keyof T | undefined
} = Object.assign(<const T extends EnumLike>(e: T): T => e, {
    keys: <T extends EnumLike>(e: T): (keyof T)[] => Object.keys(e),
    values: <T extends EnumLike>(e: T): Enum<T>[] => Object.values(e) as Enum<T>[],
    entries: <T extends EnumLike>(e: T): [keyof T, Enum<T>][] => Object.entries(e) as [keyof T, Enum<T>][],
    keyOf: <T extends EnumLike>(e: T, value: Enum<T>): keyof T | undefined =>
        Object.keys(e).find((key) => e[key] === value),
})
