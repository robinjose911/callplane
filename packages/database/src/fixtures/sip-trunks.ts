import type { CreateSipTrunkInput } from "../repositories/sip-trunk.repository.js";

export const SIP_TRUNK_NAMES = {
  PRIMARY: "stub-primary",
  SECONDARY: "stub-secondary",
} as const;

/** Obviously-fake placeholder credentials — never anything resembling a real provider ID. */
export const SIP_TRUNK_FIXTURES: CreateSipTrunkInput[] = [
  {
    name: SIP_TRUNK_NAMES.PRIMARY,
    provider: "generic",
    livekitTrunkId: "stub-trunk-primary-000",
    credentialsRef: "STUB_TRUNK_PRIMARY_CREDENTIALS",
    maxConcurrentCalls: 5,
    weight: 100,
    isActive: true,
  },
  {
    name: SIP_TRUNK_NAMES.SECONDARY,
    provider: "generic",
    livekitTrunkId: "stub-trunk-secondary-000",
    credentialsRef: "STUB_TRUNK_SECONDARY_CREDENTIALS",
    maxConcurrentCalls: 5,
    weight: 50,
    isActive: true,
  },
];
