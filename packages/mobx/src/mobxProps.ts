import { observable, remove, runInAction, set } from "mobx"
import type { PropsAdapter } from "@remodulo/react"

// mobxProps
// ========================================

// A `PropsAdapter` (@remodulo/react's `usePropsRef` / `createModuleComponent`) that bridges React props into a MobX observable.
export function mobxProps<P extends object>(): PropsAdapter<P, P> {
    return {
        create(initial: P): P {
            return observable.object(initial, {}, { deep: false })
        },
        update({ current, next }: { current: P; next: P }): P {
            runInAction(() => {
                // `set` adds and overwrites but never deletes, so reconcile the key set first: an
                // optional prop the parent stopped passing would otherwise keep its last value
                // forever, and observers would never learn it is gone.
                for (const key of Object.keys(current)) {
                    if (!(key in next)) {
                        remove(current, key)
                    }
                }
                set(current, next)
            })
            return current
        },
    }
}
