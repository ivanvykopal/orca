import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../../../shared/pairing'
import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import { RemoteServerFields } from './AddRemoteHostFields'

function loopbackAccessLink(): string {
  return encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint: 'ws://127.0.0.1:6768',
    deviceToken: 'token',
    publicKeyB64: 'key',
    scope: 'runtime'
  })
}

describe('RemoteServerFields', () => {
  it('associates blocked loopback guidance with the access-link input', () => {
    const pairingCode = loopbackAccessLink()
    const markup = renderToStaticMarkup(
      <RemoteServerFields
        name="Remote workstation"
        pairingCode={pairingCode}
        parsedLink={parseHostAccessLink(pairingCode)}
        disabled={false}
        onNameChange={vi.fn()}
        onPairingCodeChange={vi.fn()}
        allowLoopback={false}
        onAllowLoopbackChange={vi.fn()}
        useVsCodeTunnel={false}
        tunnelUrl=""
        tunnelAccessToken=""
        onUseVsCodeTunnelChange={vi.fn()}
        onTunnelUrlChange={vi.fn()}
        onTunnelAccessTokenChange={vi.fn()}
        serverError={null}
        onSubmit={vi.fn()}
      />
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('aria-describedby="add-server-loopback-blocked"')
    expect(markup).toContain('id="add-server-loopback-blocked"')
  })

  it('renders the VS Code tunnel inputs only when the tunnel is enabled', () => {
    const pairingCode = loopbackAccessLink()
    const base = {
      name: 'Remote workstation',
      pairingCode,
      parsedLink: parseHostAccessLink(pairingCode),
      disabled: false,
      onNameChange: vi.fn(),
      onPairingCodeChange: vi.fn(),
      allowLoopback: false,
      onAllowLoopbackChange: vi.fn(),
      onUseVsCodeTunnelChange: vi.fn(),
      onTunnelUrlChange: vi.fn(),
      onTunnelAccessTokenChange: vi.fn(),
      onSubmit: vi.fn(),
      serverError: null as string | null
    }
    const withTunnelOff = renderToStaticMarkup(
      <RemoteServerFields {...base} useVsCodeTunnel={false} tunnelUrl="" tunnelAccessToken="" />
    )
    const withTunnelOn = renderToStaticMarkup(
      <RemoteServerFields
        {...base}
        useVsCodeTunnel={true}
        tunnelUrl="https://my-box-39271.devtunnels.ms"
        tunnelAccessToken="secret"
      />
    )

    expect(withTunnelOff).not.toContain('add-server-tunnel-url')
    expect(withTunnelOn).toContain('add-server-tunnel-url')
    expect(withTunnelOn).toContain('add-server-tunnel-token')
    expect(withTunnelOn).toContain('Connect through a VS Code tunnel')
    expect(withTunnelOn).toContain('secret')
  })

  it('renders an inline save error that is not hidden behind a toast', () => {
    const pairingCode = loopbackAccessLink()
    const markup = renderToStaticMarkup(
      <RemoteServerFields
        name="Remote workstation"
        pairingCode={pairingCode}
        parsedLink={parseHostAccessLink(pairingCode)}
        disabled={false}
        onNameChange={vi.fn()}
        onPairingCodeChange={vi.fn()}
        allowLoopback={true}
        onAllowLoopbackChange={vi.fn()}
        useVsCodeTunnel={false}
        tunnelUrl=""
        tunnelAccessToken=""
        onUseVsCodeTunnelChange={vi.fn()}
        onTunnelUrlChange={vi.fn()}
        onTunnelAccessTokenChange={vi.fn()}
        serverError="Could not connect to the tunnel."
        onSubmit={vi.fn()}
      />
    )

    expect(markup).toContain('id="add-server-save-error"')
    expect(markup).toContain('Could not connect to the tunnel.')
  })
})
