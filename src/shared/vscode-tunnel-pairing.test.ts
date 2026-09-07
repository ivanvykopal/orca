import { describe, expect, it } from 'vitest'
import type { PairingOffer } from './pairing'
import {
  applyVsCodeTunnelToPairingOffer,
  getExistingVsCodeTunnelConfig
} from './vscode-tunnel-pairing'

function offer(endpoint = 'ws://127.0.0.1:6768'): PairingOffer {
  return {
    v: 2,
    endpoint,
    deviceToken: 'device-token',
    publicKeyB64: Buffer.from(new Uint8Array(32).fill(1)).toString('base64')
  }
}

describe('applyVsCodeTunnelToPairingOffer', () => {
  it('rewrites a loopback endpoint to the tunnel URL and carries the token', () => {
    const result = applyVsCodeTunnelToPairingOffer(offer(), {
      url: 'https://my-box-39271.devtunnels.ms',
      accessToken: 'tunnel-token'
    })

    expect(result).toMatchObject({
      ok: true,
      offer: {
        endpoint: 'wss://my-box-39271.devtunnels.ms/',
        tunnelAccessToken: 'tunnel-token',
        deviceToken: 'device-token'
      }
    })
  })

  it('preserves the relay path and query while replacing scheme and host', () => {
    const result = applyVsCodeTunnelToPairingOffer(
      offer('ws://127.0.0.1:6768/relay/connect?ticket=abc'),
      { url: 'wss://my-box-39271.devtunnels.ms', accessToken: 'tunnel-token' }
    )

    expect(result).toMatchObject({
      ok: true,
      offer: { endpoint: 'wss://my-box-39271.devtunnels.ms/relay/connect?ticket=abc' }
    })
  })

  it('appends the relay path under a tunnel URL that already has a path', () => {
    const result = applyVsCodeTunnelToPairingOffer(offer('ws://127.0.0.1:6768/relay'), {
      url: 'https://proxy.example.com/orca',
      accessToken: 'tunnel-token'
    })

    expect(result).toMatchObject({
      ok: true,
      offer: { endpoint: 'wss://proxy.example.com/orca/relay' }
    })
  })

  it('rejects a non-https tunnel URL', () => {
    const result = applyVsCodeTunnelToPairingOffer(offer(), {
      url: 'http://my-box-39271.devtunnels.ms',
      accessToken: 'tunnel-token'
    })

    expect(result).toMatchObject({ ok: false })
  })

  it('rejects an unparseable tunnel URL', () => {
    const result = applyVsCodeTunnelToPairingOffer(offer(), {
      url: 'not a url',
      accessToken: 'tunnel-token'
    })

    expect(result).toMatchObject({ ok: false })
  })

  it('rejects an empty access token', () => {
    const result = applyVsCodeTunnelToPairingOffer(offer(), {
      url: 'https://my-box-39271.devtunnels.ms',
      accessToken: '  '
    })

    expect(result).toMatchObject({ ok: false })
  })
})

describe('getExistingVsCodeTunnelConfig', () => {
  it('returns the stored tunnel only when a token is present', () => {
    expect(
      getExistingVsCodeTunnelConfig({
        endpoint: 'wss://my-box-39271.devtunnels.ms/',
        tunnelAccessToken: 'tunnel-token'
      })
    ).toEqual({ url: 'wss://my-box-39271.devtunnels.ms/', accessToken: 'tunnel-token' })

    expect(getExistingVsCodeTunnelConfig({ endpoint: 'ws://127.0.0.1:6768' })).toBeNull()
  })
})
