import type { InjectionToken } from "@remodulo/container"

import type { ModuleLifecycle } from "./module-lifecycle.provider.js"

// The lifecycle's system token — package-private by construction.
// ========================================

/** @internal Registration key for the module's own lifecycle. Not a consumer dependency. */
export const LIFECYCLE: InjectionToken<ModuleLifecycle> = Symbol("@remodulo/react:module-lifecycle")
