import { translate } from '@/i18n/i18n'
import type { WebRuntimeSubscriptionCallbacks } from '../web-runtime-subscription-contract'
import type { WebRuntimeSubscriptionHandle } from '../web-runtime-client'
import {
  getClientForEnvironment,
  manuallyDisconnectedEnvironmentIds,
  resolveEnvironment
} from './web-runtime-session'

const pendingSubscriptions = new Map<string, AbortController>()

export function cancelWebRuntimeSubscription(subscriptionId: string): void {
  pendingSubscriptions.get(subscriptionId)?.abort()
}

export async function subscribeWebRuntimeEnvironment(
  options: {
    selector: string
    method: string
    params: unknown
    timeoutMs?: number
    subscriptionId?: string
  },
  callbacks: WebRuntimeSubscriptionCallbacks
): Promise<WebRuntimeSubscriptionHandle> {
  // Why: a duplicate id would orphan the first subscription's abort handle.
  const environment = resolveEnvironment(options.selector)
  const client = getClientForEnvironment(environment)
  const controller = new AbortController()
  const { method, params, timeoutMs, subscriptionId } = options
  if (subscriptionId) {
    if (pendingSubscriptions.has(subscriptionId)) {
      throw new Error('Subscription id already exists')
    }
    pendingSubscriptions.set(subscriptionId, controller)
  }
  let subscription: WebRuntimeSubscriptionHandle
  try {
    subscription = await client.subscribe(method, params, callbacks, {
      timeoutMs,
      signal: controller.signal
    })
  } finally {
    if (subscriptionId && pendingSubscriptions.get(subscriptionId) === controller) {
      pendingSubscriptions.delete(subscriptionId)
    }
  }
  if (manuallyDisconnectedEnvironmentIds.has(environment.id)) {
    subscription.unsubscribe()
    throw new Error(
      translate(
        'auto.web.webPreloadApi.runtimeManuallyDisconnected',
        'runtime_manually_disconnected'
      )
    )
  }
  return subscription
}
