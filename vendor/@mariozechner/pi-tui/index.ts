// Compatibility shim: legacy package namespace moved to @earendil-works.
// Re-export everything so old packages (pi-intercom) keep loading.
export * from "@earendil-works/pi-tui";
export { default } from "@earendil-works/pi-tui";
