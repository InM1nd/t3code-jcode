/**
 * JcodeAdapter — shape type for the Jcode provider adapter.
 *
 * The driver model ({@link ../Drivers/JcodeDriver}) bundles one adapter per
 * instance as a captured closure, so this module only retains the shape
 * interface as a naming anchor for the driver bundle.
 *
 * @module JcodeAdapter
 */
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * JcodeAdapterShape — per-instance Jcode adapter contract.
 */
export interface JcodeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}
