import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { translate } from '@/i18n/i18n'

type RuntimeHostVsCodeTunnelFieldsProps = {
  useVsCodeTunnel: boolean
  tunnelUrl: string
  tunnelAccessToken: string
  busy: boolean
  onUseVsCodeTunnelChange: (value: boolean) => void
  onTunnelUrlChange: (value: string) => void
  onTunnelAccessTokenChange: (value: string) => void
}

/** Checkbox + URL/token inputs mirroring the sidebar AddRemoteHostDialog tunnel option. */
export function RuntimeHostVsCodeTunnelFields({
  useVsCodeTunnel,
  tunnelUrl,
  tunnelAccessToken,
  busy,
  onUseVsCodeTunnelChange,
  onTunnelUrlChange,
  onTunnelAccessTokenChange
}: RuntimeHostVsCodeTunnelFieldsProps): React.JSX.Element {
  return (
    <>
      <label className="mt-2 flex items-start gap-2 text-xs">
        <Checkbox
          checked={useVsCodeTunnel}
          disabled={busy}
          onCheckedChange={(checked) => onUseVsCodeTunnelChange(checked === true)}
        />
        <span>
          <span className="block font-medium">
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.vsCodeTunnel',
              'Connect through a VS Code tunnel'
            )}
          </span>
          <span className="text-muted-foreground">
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.vsCodeTunnelHelp',
              'The link destination is reached through the tunnel URL instead of directly.'
            )}
          </span>
        </span>
      </label>
      {useVsCodeTunnel ? (
        <div className="mt-2 space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="runtime-server-tunnel-url">
              {translate(
                'auto.components.sidebar.AddRemoteHostDialog.vsCodeTunnelUrl',
                'Tunnel URL'
              )}
            </Label>
            <Input
              id="runtime-server-tunnel-url"
              value={tunnelUrl}
              disabled={busy}
              onChange={(event) => onTunnelUrlChange(event.target.value)}
              placeholder="https://my-tunnel-39271.devtunnels.ms"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="runtime-server-tunnel-token">
              {translate(
                'auto.components.sidebar.AddRemoteHostDialog.vsCodeTunnelToken',
                'Access token'
              )}
            </Label>
            <Input
              id="runtime-server-tunnel-token"
              type="password"
              value={tunnelAccessToken}
              disabled={busy}
              onChange={(event) => onTunnelAccessTokenChange(event.target.value)}
              placeholder="tunnel access token"
              className="font-mono"
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
