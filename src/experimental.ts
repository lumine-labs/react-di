// Experimental — DI-managed class-backed components (a real React function component on the instance).
// Quarantined subpath: nothing here is re-exported from the main barrel. See the authoritative specs in
// agent-notes/design/handoff-class-component.md and handoff-state-setstate.md, and component-hybrid.md.
// ========================================

export { AbstractComponent } from "./experimental/AbstractComponent.js"
export { Component } from "./experimental/component.js"

export type { StateUpdate } from "./experimental/AbstractComponent.js"
export type { ComponentClass, ComponentDecorator, ComponentOptions, PropsOf } from "./experimental/component.js"
