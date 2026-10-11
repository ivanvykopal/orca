import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import {
  verifyRemotePairingRuntimeStatus,
  type RemotePairingFailureKind
} from '../../../../shared/remote-pairing-verification'
import type { WebPairingOffer } from '../web-pairing'
import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { WebRuntimeClient } from '../web-runtime-client'
import { isWebRuntimeUnauthorizedError } from '../web-runtime-client-error'
import { translate } from '@/i18n/i18n'
import { translateHostAccessLinkError } from '@/lib/remote-pairing-copy'

type WebPairingVerification =
  | { ok: false; kind: RemotePairingFailureKind; message: string }
  | { ok: true; offer: WebPairingOffer; runtimeStatus: RuntimeStatus }

export async function verifyWebPairingOffer(
  pairingCode: string,
  allowLoopback?: boolean
): Promise<WebPairingVerification> {
  const parsed = parseHostAccessLink(pairingCode)
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'access-link-invalid',
      message: translateHostAccessLinkError(parsed.kind)
    }
  }
  if (parsed.value.endpointKind === 'loopback' && !allowLoopback) {
    return {
      ok: false,
      kind: 'host-unreachable',
      message: translate(
        'auto.web.webPreloadApi.loopbackPairingBlocked',
        'This access link points back to this device.'
      )
    }
  }
  let client: WebRuntimeClient | null = null
  try {
    client = new WebRuntimeClient(parsed.value.pairing)
    const response = (await client.call('status.get', undefined, {
      timeoutMs: 15_000
    })) as RuntimeRpcResponse<RuntimeStatus>
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
    return {
      ok: true,
      offer: parsed.value.pairing,
      runtimeStatus: statusVerification.runtimeStatus
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid public key')) {
      return {
        ok: false,
        kind: 'access-link-invalid',
        message: translate(
          'auto.web.webPreloadApi.remotePairingInvalidDetails',
          'This access link contains invalid connection details.'
        )
      }
    }
    if (
      isWebRuntimeUnauthorizedError(error) ||
      (error instanceof Error && error.message.startsWith('Unauthorized.'))
    ) {
      return {
        ok: false,
        kind: 'access-link-invalid',
        message: error.message
      }
    }
    return {
      ok: false,
      kind: 'host-unreachable',
      message: translate(
        'auto.web.webPreloadApi.remotePairingUnreachable',
        'Cannot reach Orca at {{endpoint}}.',
        { endpoint: parsed.value.displayEndpoint }
      )
    }
  } finally {
    client?.close()
  }
}
