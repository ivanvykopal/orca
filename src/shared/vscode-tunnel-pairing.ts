import type { PairingOffer } from './pairing'

export type VsCodeTunnelConfig = {
  url: string
  accessToken: string
}

export type ApplyVsCodeTunnelResult =
  | { ok: true; offer: PairingOffer }
  | { ok: false; message: string }

// Why: dev tunnels expose forwarded ports as https://<tunnel>-<port>.devtunnels.ms;
// the relay on the VM listens on loopback, so the offer endpoint is rewritten to the
// tunnel URL and the access token rides along on the offer for the transports.
export function applyVsCodeTunnelToPairingOffer(
  offer: PairingOffer,
  tunnel: VsCodeTunnelConfig
): ApplyVsCodeTunnelResult {
  const token = tunnel.accessToken.trim()
  if (token === '') {
    return { ok: false, message: 'Enter the VS Code tunnel access token.' }
  }
  let tunnelUrl: URL
  try {
    tunnelUrl = new URL(tunnel.url.trim())
  } catch {
    return { ok: false, message: 'Enter a valid VS Code tunnel URL (https://...).' }
  }
  if (
    (tunnelUrl.protocol !== 'https:' && tunnelUrl.protocol !== 'wss:') ||
    tunnelUrl.hostname === ''
  ) {
    return { ok: false, message: 'Enter a valid VS Code tunnel URL (https://...).' }
  }
  let relayEndpoint: URL
  try {
    relayEndpoint = new URL(offer.endpoint)
  } catch {
    return { ok: false, message: 'The access link contains an invalid destination.' }
  }

  const endpoint = new URL(tunnelUrl)
  endpoint.protocol = 'wss:'
  endpoint.hash = ''
  if (endpoint.pathname === '/') {
    endpoint.pathname = relayEndpoint.pathname
  } else if (relayEndpoint.pathname !== '/') {
    const prefix = endpoint.pathname.endsWith('/') ? endpoint.pathname : `${endpoint.pathname}/`
    const suffix = relayEndpoint.pathname.replace(/^\//, '')
    endpoint.pathname = prefix + suffix
  }
  endpoint.search = relayEndpoint.search
  return {
    ok: true,
    offer: { ...offer, endpoint: endpoint.toString(), tunnelAccessToken: token }
  }
}

// Why: an environment saved through a tunnel keeps its tunnel URL + token on the
// preferred endpoint; re-pairing re-applies them so the tunnel is not silently dropped.
export function getExistingVsCodeTunnelConfig(endpoint: {
  endpoint: string
  tunnelAccessToken?: string
}): VsCodeTunnelConfig | null {
  if (!endpoint.tunnelAccessToken) {
    return null
  }
  return { url: endpoint.endpoint, accessToken: endpoint.tunnelAccessToken }
}
