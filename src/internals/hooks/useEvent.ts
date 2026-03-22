import { useCallback, useRef } from "react"
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect.js"

export function useEvent<T extends (...args: any[]) => any>(fn: T) {
    const fnRef = useRef(fn)

    useIsomorphicLayoutEffect(() => {
        fnRef.current = fn
    }, [fn])

    const eventCb = useCallback((...args: Parameters<T>) => {
        return fnRef.current.apply(null, args)
    }, [])

    return eventCb
}
