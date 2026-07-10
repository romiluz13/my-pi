// Compatibility shim: legacy package namespace moved to @earendil-works.
// Re-export everything so old packages (pi-intercom, pi-rewind) keep loading.
export * from "@earendil-works/pi-coding-agent";
export { default } from "@earendil-works/pi-coding-agent";
