import React from "react"
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect.js"
import { useLazyRef } from "./useLazyRef.js"

export const useScheduleLayoutEffect = () => {
    const [s, ss] = React.useState<object>()
    const fns = useLazyRef(() => new Map<string | number, () => void>())

    useIsomorphicLayoutEffect(() => {
        fns.current.forEach((f: () => void) => f())
        fns.current = new Map()
    }, [s])

    return (id: string | number, cb: () => void) => {
        fns.current.set(id, cb)
        ss({})
    }
}
