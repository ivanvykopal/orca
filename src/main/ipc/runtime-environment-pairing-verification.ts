import {
  addEnvironmentFromPairingCode,
  resolveEnvironment,
  resolveEnvironmentPairingOffer,
  RuntimeEnvironmentStoreError,
  updateEnvironmentFromPairingCode
} from '../../shared/runtime-environment-store'
import { parseHostAccessLink } from '../../shared/remote-pairing-address'
import {
  verifyRemotePairingRuntimeStatus,
  type VerifyAndAddRuntimeEnvironmentResult
} from '../../shared/remote-pairing-verification'
import { RemoteRuntimeClientError } from '../../shared/remote-runtime-client-error'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../shared/protocol-version'
import { redactRuntimeEnvironment } from '../../shared/runtime-environments'
import {
  applyVsCodeTunnelToPairingOffer,
  type VsCodeTunnelConfig
} from '../../shared/vscode-tunnel-pairing'
import type { RuntimeStatus } from '../../shared/runtime-types'
import type { PairingOffer } from '../../shared/pairing'

type VerifyAndAddRuntimeEnvironmentArgs = {
  name: string
  pairingCode: string
  allowLoopback?: boolean
  vsCodeTunnel?: VsCodeTunnelConfig
}

export async function verifyAndAddRuntimeEnvironmentFromPairingCode(
  userDataPath: string,
  args: VerifyAndAddRuntimeEnvironmentArgs
): Promise<VerifyAndAddRuntimeEnvironmentResult> {
  const parsed = parseHostAccessLink(args.pairingCode)
  if (!parsed.ok) {
    return { ok: false, kind: 'access-link-invalid', message: parsed.message }
  }
  // Why: a tunnel offer's relay endpoint is loopback on the remote machine by design;
  // the rewrite replaces it with the tunnel URL before anything connects.
  const tunnel = args.vsCodeTunnel
    ? applyVsCodeTunnelToPairingOffer(parsed.value.pairing, args.vsCodeTunnel)
    : null
  if (tunnel && !tunnel.ok) {
    return { ok: false, kind: 'access-link-invalid', message: tunnel.message }
  }
  const effectivePairing = tunnel?.ok ? tunnel.offer : parsed.value.pairing
  const displayEndpoint = tunnel?.ok
    ? new URL(tunnel.offer.endpoint).host
    : parsed.value.displayEndpoint
  if (parsed.value.endpointKind === 'loopback' && !args.allowLoopback && !tunnel) {
    return {
      ok: false,
      kind: 'host-unreachable',
      message: 'This access link points back to this device.'
    }
  }

  let runtimeStatus: RuntimeStatus
  try {
    const response = await sendRemoteRuntimeRequest<RuntimeStatus>(
      effectivePairing,
      'status.get',
      undefined,
      15_000,
      undefined,
      undefined,
      ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
    )
    if (!response.ok) {
      return {
        ok: false,
        kind: 'connection-interrupted',
        message: response.error.message
      }
    }
    const statusVerification = verifyRemotePairingRuntimeStatus(response.result)
    if (!statusVerification.ok) {
      return statusVerification
    }
    runtimeStatus = statusVerification.runtimeStatus
  } catch (error) {
    return classifyPairingVerificationError(error, displayEndpoint)
  }

  const usesSshTunnel =
    !tunnel && parsed.value.endpointKind === 'loopback' && args.allowLoopback === true
  let environment: ReturnType<typeof addEnvironmentFromPairingCode>
  try {
    environment = addEnvironmentFromPairingCode(userDataPath, {
      ...args,
      ...(usesSshTunnel ? { connectionDependency: 'ssh-tunnel' as const } : {})
    })
  } catch (error) {
    return {
      ok: false,
      kind: 'environment-save-failed',
      message:
        error instanceof RuntimeEnvironmentStoreError && error.code === 'invalid_argument'
          ? error.message
          : 'Orca verified the host but could not save it. Check local settings storage and try again.'
    }
  }
  return {
    ok: true,
    environment: redactRuntimeEnvironment(environment),
    runtimeStatus
  }
}

type VerifyAndUpdateRuntimeEnvironmentArgs = {
  selector: string
  pairingCode?: string
  allowLoopback?: boolean
  vsCodeTunnel?: VsCodeTunnelConfig
}

/**
 * Re-pairs a saved environment in place: optionally with a fresh access link,
 * and optionally with a new VS Code tunnel config (URL/token refresh). With
 * neither, verification is skipped and the call is rejected up front.
 */
export async function verifyAndUpdateRuntimeEnvironmentFromPairingCode(
  userDataPath: string,
  args: VerifyAndUpdateRuntimeEnvironmentArgs
): Promise<VerifyAndAddRuntimeEnvironmentResult> {
  if (!args.pairingCode && !args.vsCodeTunnel) {
    return {
      ok: false,
      kind: 'access-link-invalid',
      message: 'Provide a new access link or VS Code tunnel details to update.'
    }
  }
  resolveEnvironment(userDataPath, args.selector)
  let baseOffer: PairingOffer
  let displayEndpoint: string
  if (args.pairingCode) {
    const parsed = parseHostAccessLink(args.pairingCode)
    if (!parsed.ok) {
      return { ok: false, kind: 'access-link-invalid', message: parsed.message }
    }
    if (parsed.value.endpointKind === 'loopback' && !args.allowLoopback && !args.vsCodeTunnel) {
      return {
        ok: false,
        kind: 'host-unreachable',
        message: 'This access link points back to this device.'
      }
    }
    baseOffer = parsed.value.pairing
    displayEndpoint = parsed.value.displayEndpoint
  } else {
    // Tunnel-only refresh: reuse the stored pairing credentials verbatim.
    baseOffer = resolveEnvironmentPairingOffer(userDataPath, args.selector)
    displayEndpoint = new URL(baseOffer.endpoint).host
  }
  // Why: a tunnel offer's relay endpoint is loopback on the remote machine by design;
  // the rewrite replaces it with the tunnel URL before anything connects.
  const tunnel = args.vsCodeTunnel
    ? applyVsCodeTunnelToPairingOffer(baseOffer, args.vsCodeTunnel)
    : null
  if (tunnel && !tunnel.ok) {
    return { ok: false, kind: 'access-link-invalid', message: tunnel.message }
  }
  const effectivePairing = tunnel?.ok ? tunnel.offer : baseOffer
  if (tunnel?.ok) {
    displayEndpoint = new URL(tunnel.offer.endpoint).host
  }

  let runtimeStatus: RuntimeStatus
  try {
    const response = await sendRemoteRuntimeRequest<RuntimeStatus>(
      effectivePairing,
      'status.get',
      undefined,
      15_000,
      undefined,
      undefined,
      ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
    )
    if (!response.ok) {
      return {
        ok: false,
        kind: 'connection-interrupted',
        message: response.error.message
      }
    }
    const statusVerification = verifyRemotePairingRuntimeStatus(response.result)
    if (!statusVerification.ok) {
      return statusVerification
    }
    runtimeStatus = statusVerification.runtimeStatus
  } catch (error) {
    return classifyPairingVerificationError(error, displayEndpoint)
  }

  try {
    const environment = updateEnvironmentFromPairingCode(userDataPath, args.selector, {
      ...(args.pairingCode ? { pairingCode: args.pairingCode } : {}),
      ...(args.vsCodeTunnel ? { vsCodeTunnel: args.vsCodeTunnel } : {})
    })
    return {
      ok: true,
      environment: redactRuntimeEnvironment(environment),
      runtimeStatus
    }
  } catch (error) {
    return {
      ok: false,
      kind: 'environment-save-failed',
      message:
        error instanceof RuntimeEnvironmentStoreError && error.code === 'invalid_argument'
          ? error.message
          : 'Orca verified the host but could not update the saved server.'
    }
  }
}

function classifyPairingVerificationError(
  error: unknown,
  endpoint: string
): VerifyAndAddRuntimeEnvironmentResult {
  if (error instanceof RemoteRuntimeClientError) {
    if (error.code === 'invalid_argument') {
      return invalidAccessLinkResult()
    }
    if (error.code === 'unauthorized' || error.pairingStage === 'access-grant') {
      return {
        ok: false,
        kind: 'access-link-invalid',
        message: 'This access link is no longer valid. Generate a new link on the other host.'
      }
    }
    if (error.pairingStage === 'host-identity') {
      return {
        ok: false,
        kind: 'host-identity-mismatch',
        message: `Orca reached ${endpoint}, but that host does not match this access link.`
      }
    }
    if (error.pairingStage === 'runtime') {
      return {
        ok: false,
        kind: 'connection-interrupted',
        message: `The connection to ${endpoint} was interrupted during verification.`
      }
    }
    if (error.pairingStage === 'connect') {
      return unreachableHostResult(endpoint)
    }
  }
  if (error instanceof Error) {
    return error.message.startsWith('Invalid public key')
      ? invalidAccessLinkResult()
      : { ok: false, kind: 'connection-interrupted', message: error.message }
  }
  return unreachableHostResult(endpoint)
}

function invalidAccessLinkResult(): VerifyAndAddRuntimeEnvironmentResult {
  return {
    ok: false,
    kind: 'access-link-invalid',
    message: 'This access link contains invalid connection details.'
  }
}

function unreachableHostResult(endpoint: string): VerifyAndAddRuntimeEnvironmentResult {
  return {
    ok: false,
    kind: 'host-unreachable',
    message: `Cannot reach Orca at ${endpoint}. Confirm the other host is running and reachable.`
  }
}
