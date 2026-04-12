import React from "react"

import type { CleanupFn } from "./types.js"
import { AsyncTeardown } from "./async-teardown.js"
import { useEvent } from "@lumelabs/react-hooks"
import { useResolve } from "../resolver/index.js"

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
