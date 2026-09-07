import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ParseHostAccessLinkResult } from '../../../../shared/remote-pairing-address'
import { RemoteServerFields } from './AddRemoteHostFields'

export function AddRemoteHostServerFormPanel({
  name,
  pairingCode,
  parsedLink,
  allowLoopback,
  useVsCodeTunnel,
  tunnelUrl,
  tunnelAccessToken,
  serverError,
  disabled,
  canSubmit,
  onNameChange,
  onPairingCodeChange,
  onAllowLoopbackChange,
  onUseVsCodeTunnelChange,
  onTunnelUrlChange,
  onTunnelAccessTokenChange,
  onSubmit,
  onCancel
}: {
  name: string
  pairingCode: string
  parsedLink: ParseHostAccessLinkResult
  allowLoopback: boolean
  useVsCodeTunnel: boolean
  tunnelUrl: string
  tunnelAccessToken: string
  serverError: string | null
  disabled: boolean
  canSubmit: boolean
  onNameChange: (value: string) => void
  onPairingCodeChange: (value: string) => void
  onAllowLoopbackChange: (value: boolean) => void
  onUseVsCodeTunnelChange: (value: boolean) => void
  onTunnelUrlChange: (value: string) => void
  onTunnelAccessTokenChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.serverTitle',
            'Add remote server'
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.serverDescription',
            'Pair with Orca running on another computer.'
          )}
        </DialogDescription>
      </DialogHeader>

      <RemoteServerFields
        name={name}
        pairingCode={pairingCode}
        parsedLink={parsedLink}
        disabled={disabled}
        onNameChange={onNameChange}
        onPairingCodeChange={onPairingCodeChange}
        allowLoopback={allowLoopback}
        onAllowLoopbackChange={onAllowLoopbackChange}
        useVsCodeTunnel={useVsCodeTunnel}
        tunnelUrl={tunnelUrl}
        tunnelAccessToken={tunnelAccessToken}
        serverError={serverError}
        onUseVsCodeTunnelChange={onUseVsCodeTunnelChange}
        onTunnelUrlChange={onTunnelUrlChange}
        onTunnelAccessTokenChange={onTunnelAccessTokenChange}
        onSubmit={onSubmit}
      />

      <DialogFooter className="sm:justify-between">
        <span />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
            {translate('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={disabled || !canSubmit}>
            {disabled
              ? translate('auto.components.sidebar.AddRemoteHostDialog.saving', 'Saving...')
              : translate('auto.components.sidebar.AddRemoteHostDialog.save', 'Save')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
