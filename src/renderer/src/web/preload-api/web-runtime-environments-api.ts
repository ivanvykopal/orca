import type { PreloadApi } from '../../../../preload/api-types'
import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import {
  verifyRemotePairingRuntimeStatus,
  type RemotePairingFailureKind
} from '../../../../shared/remote-pairing-verification'
import type { WebPairingOffer } from '../web-pairing'
import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { parseWebPairingInput } from '../web-pairing'
import { WebRuntimeClient } from '../web-runtime-client'
import { isWebRuntimeUnauthorizedError } from '../web-runtime-client-error'
import {
  createStoredWebRuntimeEnvironment,
  redactStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web-runtime-environment'
import { translate } from '@/i18n/i18n'
import { translateHostAccessLinkError } from '@/lib/remote-pairing-copy'
import { callEnvironmentEnvelope } from './web-runtime-calls'
import {
  closeActiveRuntimeClients,
  disconnectActiveRuntimeEnvironment,
  getClientForEnvironment,
  manuallyDisconnectedEnvironmentIds,
  removeActiveRuntimeEnvironment,
  requireActiveEnvironmentOrNull,
  resolveEnvironment,
  webRuntimeState
} from './web-runtime-session'

type WebPairingVerification =
  | { ok: false; kind: RemotePairingFailureKind; message: string }
  | { ok: true; offer: WebPairingOffer; runtimeStatus: RuntimeStatus }

async function verifyWebPairingOffer(
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

export function createRuntimeEnvironmentsApi(): NonNullable<
  Partial<PreloadApi>['runtimeEnvironments']
> {
  return {
    list: async () => {
      const environment = requireActiveEnvironmentOrNull()
      return environment ? [redactStoredWebRuntimeEnvironment(environment)] : []
    },
    addFromPairingCode: async ({ name, pairingCode }) => {
      const offer = parseWebPairingInput(pairingCode)
      if (!offer) {
        throw new Error('Invalid Orca pairing code.')
      }
      const previousEnvironment = webRuntimeState.activeEnvironment
      closeActiveRuntimeClients()
      webRuntimeState.activeEnvironment = createStoredWebRuntimeEnvironment({
        name,
        offer,
        previousEnvironment
      })
      manuallyDisconnectedEnvironmentIds.clear()
      saveStoredWebRuntimeEnvironment(webRuntimeState.activeEnvironment)
      return { environment: redactStoredWebRuntimeEnvironment(webRuntimeState.activeEnvironment) }
    },
    verifyAndAddFromPairingCode: async ({ name, pairingCode, allowLoopback }) => {
      const verification = await verifyWebPairingOffer(pairingCode, allowLoopback)
      if (!verification.ok) {
        return verification
      }
      const parsed = parseHostAccessLink(pairingCode)
      const usesSshTunnel =
        parsed.ok && parsed.value.endpointKind === 'loopback' && allowLoopback === true
      const nextEnvironment = {
        ...createStoredWebRuntimeEnvironment({
          name,
          offer: verification.offer,
          previousEnvironment: webRuntimeState.activeEnvironment,
          ...(usesSshTunnel ? { connectionDependency: 'ssh-tunnel' as const } : {})
        }),
        ...(verification.runtimeStatus.pairedDeviceId
          ? { pairedDeviceId: verification.runtimeStatus.pairedDeviceId }
          : {})
      }
      // Why: a browser storage failure must leave the currently active host usable.
      try {
        saveStoredWebRuntimeEnvironment(nextEnvironment)
      } catch {
        return {
          ok: false,
          kind: 'environment-save-failed',
          message: translate(
            'auto.web.webPreloadApi.remotePairingSaveFailed',
            'Orca verified the host but could not save it. Check browser storage and try again.'
          )
        }
      }
      manuallyDisconnectedEnvironmentIds.clear()
      closeActiveRuntimeClients()
      webRuntimeState.activeEnvironment = nextEnvironment
      return {
        ok: true,
        environment: redactStoredWebRuntimeEnvironment(nextEnvironment),
        runtimeStatus: verification.runtimeStatus
      }
    },
    updateFromPairingCode: async ({ selector, pairingCode, allowLoopback }) => {
      if (!pairingCode) {
        return {
          ok: false,
          kind: 'access-link-invalid',
          message: translate(
            'auto.web.webPreloadApi.updateRequiresLink',
            'Provide a new access link to update this server.'
          )
        }
      }
      const existing = resolveEnvironment(selector)
      const verification = await verifyWebPairingOffer(pairingCode, allowLoopback)
      if (!verification.ok) {
        return verification
      }
      const parsed = parseHostAccessLink(pairingCode)
      const usesSshTunnel =
        parsed.ok && parsed.value.endpointKind === 'loopback' && allowLoopback === true
      const nextEnvironment = {
        ...createStoredWebRuntimeEnvironment({
          name: existing.name,
          offer: verification.offer,
          previousEnvironment: existing,
          ...(usesSshTunnel ? { connectionDependency: 'ssh-tunnel' as const } : {})
        }),
        id: existing.id,
        createdAt: existing.createdAt,
        lastUsedAt: existing.lastUsedAt,
        ...(verification.runtimeStatus.pairedDeviceId
          ? { pairedDeviceId: verification.runtimeStatus.pairedDeviceId }
          : {})
      }
      try {
        saveStoredWebRuntimeEnvironment(nextEnvironment)
      } catch {
        return {
          ok: false,
          kind: 'environment-save-failed',
          message: translate(
            'auto.web.webPreloadApi.remotePairingSaveFailed',
            'Orca verified the host but could not save it. Check browser storage and try again.'
          )
        }
      }
      if (webRuntimeState.activeEnvironment?.id === existing.id) {
        closeActiveRuntimeClients()
        webRuntimeState.activeEnvironment = nextEnvironment
      }
      return {
        ok: true,
        environment: redactStoredWebRuntimeEnvironment(nextEnvironment),
        runtimeStatus: verification.runtimeStatus
      }
    },
    resolve: async ({ selector }) =>
      redactStoredWebRuntimeEnvironment(resolveEnvironment(selector)),
    remove: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      if (webRuntimeState.activeEnvironment?.id === environment.id) {
        removeActiveRuntimeEnvironment()
      }
      manuallyDisconnectedEnvironmentIds.delete(environment.id)
      return { removed: redactStoredWebRuntimeEnvironment(environment) }
    },
    disconnect: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      if (webRuntimeState.activeEnvironment?.id === environment.id) {
        manuallyDisconnectedEnvironmentIds.add(environment.id)
        disconnectActiveRuntimeEnvironment()
      }
      return { disconnected: redactStoredWebRuntimeEnvironment(environment) }
    },
    connect: ({ selector, timeoutMs }) => {
      const environment = resolveEnvironment(selector)
      manuallyDisconnectedEnvironmentIds.delete(environment.id)
      return callEnvironmentEnvelope<RuntimeStatus>(
        environment.id,
        'status.get',
        undefined,
        timeoutMs
      )
    },
    getStatus: ({ selector, timeoutMs }) =>
      callEnvironmentEnvelope<RuntimeStatus>(selector, 'status.get', undefined, timeoutMs),
    retryControlConnection: () => Promise.resolve(),
    prepareBrowserClientHostPlacement: async () => ({ kind: 'server' }),
    call: ({ selector, method, params, timeoutMs }) =>
      callEnvironmentEnvelope(selector, method, params, timeoutMs),
    subscribe: async ({ selector, method, params, timeoutMs }, callbacks) => {
      const environment = resolveEnvironment(selector)
      const client = getClientForEnvironment(environment)
      const subscription = await client.subscribe(method, params, callbacks, { timeoutMs })
      if (manuallyDisconnectedEnvironmentIds.has(environment.id)) {
        subscription.unsubscribe()
        throw new Error('runtime_manually_disconnected')
      }
      return subscription
    }
  }
}
