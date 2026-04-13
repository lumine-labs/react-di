import type { DependencyContainer, InjectionToken } from "../../../aliases/index.js"
import { Token } from "../../tokenizer/tokenizer.js"

export const UNSAFE_CONTAINER_RESOLVER: InjectionToken<ContainerResolver> = Token("UNSAFE_CONTAINER_RESOLVER")
export class ContainerResolver {
    constructor(private readonly container: DependencyContainer) {}

    unsafe_getContainer(): DependencyContainer {
        return this.container
    }
}
