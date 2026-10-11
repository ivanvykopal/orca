import type { PreloadApi } from '../../../../preload/api-types'
import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { parseWebPairingInput } from '../web-pairing'
import {
  createStoredWebRuntimeEnvironment,
  redactStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web-runtime-environment'
import { translate } from '@/i18n/i18n'
import { callEnvironmentEnvelope } from './web-runtime-calls'
import { verifyWebPairingOffer } from './web-pairing-verification'
import {
  cancelWebRuntimeSubscription,
  subscribeWebRuntimeEnvironment
} from './web-subscription-registry'
import {
  closeActiveRuntimeClients,
  subscribeWebRuntimeStatus,
  readWebRuntimeStatusSnapshots,
  observeWebRuntimeStatus,
  disconnectActiveRuntimeEnvironment,
  getClientForEnvironment,
  manuallyDisconnectedEnvironmentIds,
  removeActiveRuntimeEnvironment,
  requireActiveEnvironmentOrNull,
  resolveEnvironment,
  webRuntimeState
} from './web-runtime-session'


export function createRuntimeEnvironmentsApi(): NonNullable<
  Partial<PreloadApi>['runtimeEnvironments']
> {
  return {
    onStatusChanged: subscribeWebRuntimeStatus,
    getStatusSnapshots: async () => readWebRuntimeStatusSnapshots(),
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
      const nextEnvironment = {
        ...createStoredWebRuntimeEnvironment({
          name,
          offer: verification.offer,
          previousEnvironment: webRuntimeState.activeEnvironment,
          ...(parsed.ok && parsed.value.endpointKind === 'loopback' && allowLoopback === true
            ? { connectionDependency: 'ssh-tunnel' as const }
            : {})
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
      getClientForEnvironment(nextEnvironment).statusOwner?.acceptVerified({
        id: 'status.get',
        ok: true,
        result: verification.runtimeStatus,
        _meta: { runtimeId: verification.runtimeStatus.runtimeId }
      })
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
      const nextEnvironment = {
        ...createStoredWebRuntimeEnvironment({
          name: existing.name,
          offer: verification.offer,
          previousEnvironment: existing,
          ...(parsed.ok && parsed.value.endpointKind === 'loopback' && allowLoopback === true
            ? { connectionDependency: 'ssh-tunnel' as const }
            : {})
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
      closeActiveRuntimeClients()
      return callEnvironmentEnvelope<RuntimeStatus>(
        environment.id,
        'status.get',
        undefined,
        timeoutMs
      )
    },
    getStatus: ({ selector, timeoutMs, observeOnly }) =>
      observeOnly
        ? observeWebRuntimeStatus(selector, timeoutMs)
        : callEnvironmentEnvelope<RuntimeStatus>(selector, 'status.get', undefined, timeoutMs),
    retryControlConnection: () => Promise.resolve(),
    prepareBrowserClientHostPlacement: async () => ({ kind: 'server' }),
    call: ({ selector, method, params, timeoutMs }) =>
      callEnvironmentEnvelope(selector, method, params, timeoutMs),
    cancelSubscription: async ({ subscriptionId }) => {
      cancelWebRuntimeSubscription(subscriptionId)
    },
    subscribe: async ({ selector, method, params, timeoutMs, subscriptionId }, callbacks) =>
      subscribeWebRuntimeEnvironment(
        { selector, method, params, timeoutMs, subscriptionId },
        callbacks
      )
  }
}
