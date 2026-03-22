import React from "react"

export function useLazyRef<T>(fn: () => T) {
    const ref = React.useRef<T>(undefined)

    if (ref.current === undefined) {
        ref.current = fn()
    }

    return ref as React.MutableRefObject<T>
}
