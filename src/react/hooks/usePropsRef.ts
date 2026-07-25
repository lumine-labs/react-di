import { useRef, useState } from "react"
import { useIsomorphicLayoutEffect } from "@luminelabs/react-toolkit"

import type { InjectionToken } from "../../aliases/index.js"
import type { ValueProvider } from "../../core/providers/providers.types.js"
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

// Component-owned props bridge: the PropsRef instance keeps a stable identity for the component's
// whole life — including across module rebuilds. The hook returns the instance for local access
// (`ref.current`, `ref.onUpdate`) and a plain `ValueProvider` literal for registration — put
// `provider` into a providers array and inject by the `PropsRef` class token (or the custom `token`).
//
// Fresh props are applied per render in a layout effect (never during render — render stays pure); the
// shallow-equal gate inside `update()` makes the pass a no-op when nothing changed.
//
// The adapter is a proper hook dependency: when its reference changes (including undefined ↔ defined),
// the target is rebuilt from the current props and subscribers are notified — so hoist the adapter to
// module scope or memoize it; an inline `adapter: mobxProps()` recreates the target every render, the
// same contract as any unstable hook dependency.
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
