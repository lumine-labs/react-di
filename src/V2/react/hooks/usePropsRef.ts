import { useRef, useState } from "react"
import { useIsomorphicLayoutEffect } from "@luminelabs/react-toolkit"

import type { InjectionToken, ValueProvider } from "../../container"
import { PropsRef, type PropsAdapter } from "../../core/providers/props-ref/props-ref.provider.js"

// usePropsRef
// ========================================

export type UsePropsRefOptions<P extends object, T = P> = {
    adapter?: PropsAdapter<P, T>
    token?: InjectionToken<PropsRef<T>>
}

export type UsePropsRefResult<T> = {
    ref: PropsRef<T>
    provider: ValueProvider<PropsRef<T>>
}

export function usePropsRef<P extends object, T = P>(
    props: P,
    options?: UsePropsRefOptions<P, T>
): UsePropsRefResult<T> {
    const adapter = options?.adapter
    const [ref] = useState(() => new PropsRef<T>({ props, adapter }))

    const lastAdapterRef = useRef(adapter)
    useIsomorphicLayoutEffect(() => {
        // Adapter swap first, so the regular update below runs against the new target.
        if (lastAdapterRef.current !== adapter) {
            lastAdapterRef.current = adapter
            ref.setAdapter(adapter)
        }

        ref.update(props)
    })

    const provider: ValueProvider<PropsRef<T>> = { provide: options?.token ?? PropsRef, useValue: ref }
    return { ref, provider }
}
