import React from "react"
import { useEvent } from "@lumelabs/react-hooks"

import { AsyncTeardown, type CleanupFn } from "../../core/providers/async-teardown/async-teardown.js"
import { useResolve } from "./useResolve.js"

export function useAsyncTeardown(cleanup: CleanupFn, priority?: number): () => void {
    const teardown = useResolve(AsyncTeardown)

    const eventCleanup = useEvent(cleanup)
    const offRef = React.useRef<() => void>(() => {})

    React.useEffect(() => {
        const off = teardown.add(eventCleanup, priority)
        offRef.current = off

        return () => {
            off()
            if (offRef.current === off) {
                offRef.current = () => {}
            }
        }
    }, [teardown, eventCleanup, priority])

    const off = useEvent(() => {
        offRef.current()
        offRef.current = () => {}
    })

    return off
}
