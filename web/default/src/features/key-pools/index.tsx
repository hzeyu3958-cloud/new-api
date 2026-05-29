/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  CheckCircle2,
  DollarSign,
  Key,
  Plus,
  RefreshCw,
  TestTube,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  CHANNEL_STATUS,
  CHANNEL_STATUS_CONFIG,
  MULTI_KEY_STATUS_CONFIG,
} from '@/features/channels/constants'
import {
  createChannel,
  deleteMultiKey,
  disableMultiKey,
  enableMultiKey,
  getChannels,
  getMultiKeyStatus,
  testChannel,
  updateChannel,
  updateChannelBalance,
} from '@/features/channels/api'
import type { Channel, KeyStatus } from '@/features/channels/types'

const OPENAI_CHANNEL_TYPE = 1
const DEFAULT_POOL_TAG = 'ccswitch-openai'
const DEFAULT_POOL_NAME = 'OpenAI Account Pool'
const DEFAULT_BASE_URL = 'https://api.openai.com'
const DEFAULT_MODELS =
  'gpt-4.1,gpt-4.1-mini,gpt-4.1-nano,gpt-4o,gpt-4o-mini,o3,o4-mini'

type ImportMode = 'new_pool' | 'append_pool' | 'batch_channels'
type MultiKeyMode = 'polling' | 'random'

type ChannelUpdatePayload = Partial<Channel> & {
  key_mode?: 'append' | 'replace'
  multi_key_mode?: MultiKeyMode
}

function parseKeys(value: string): string[] {
  const seen = new Set<string>()
  const keys: string[] = []

  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((key) => {
      if (seen.has(key)) return
      seen.add(key)
      keys.push(key)
    })

  return keys
}

function statusVariant(status: number) {
  return CHANNEL_STATUS_CONFIG[status as keyof typeof CHANNEL_STATUS_CONFIG]
    ?.variant
}

function statusLabel(status: number) {
  return (
    CHANNEL_STATUS_CONFIG[status as keyof typeof CHANNEL_STATUS_CONFIG]
      ?.label ?? 'Unknown'
  )
}

function keyStatusVariant(status: number) {
  return MULTI_KEY_STATUS_CONFIG[
    status as keyof typeof MULTI_KEY_STATUS_CONFIG
  ]?.variant
}

function keyStatusLabel(status: number) {
  return (
    MULTI_KEY_STATUS_CONFIG[
      status as keyof typeof MULTI_KEY_STATUS_CONFIG
    ]?.label ?? 'Unknown'
  )
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function getChannelKeyCount(channel: Channel) {
  if (channel.channel_info?.is_multi_key) {
    return channel.channel_info.multi_key_size || 0
  }
  return 1
}

function KeyPoolStat(props: {
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }[props.tone ?? 'default']

  return (
    <div className='rounded-lg border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className={cn('mt-1 text-lg font-semibold', toneClass)}>
        {props.value}
      </div>
    </div>
  )
}

function ChannelStatusBadge(props: { status: number; label: string }) {
  return (
    <StatusBadge
      label={props.label}
      variant={statusVariant(props.status)}
      copyable={false}
    />
  )
}

function KeyStatusBadge(props: { status: number; label: string }) {
  return (
    <StatusBadge
      label={props.label}
      variant={keyStatusVariant(props.status)}
      copyable={false}
    />
  )
}

export function KeyPools() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [poolName, setPoolName] = useState(DEFAULT_POOL_NAME)
  const [poolTag, setPoolTag] = useState(DEFAULT_POOL_TAG)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [models, setModels] = useState(DEFAULT_MODELS)
  const [group, setGroup] = useState('default')
  const [priority, setPriority] = useState(100)
  const [weight, setWeight] = useState(0)
  const [keyText, setKeyText] = useState('')
  const [importMode, setImportMode] = useState<ImportMode>('new_pool')
  const [multiKeyMode, setMultiKeyMode] = useState<MultiKeyMode>('polling')
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null
  )
  const [keyStatusPage, setKeyStatusPage] = useState(1)
  const [keyStatusFilter, setKeyStatusFilter] = useState<string>('all')

  const parsedKeys = useMemo(() => parseKeys(keyText), [keyText])

  const channelsQuery = useQuery({
    queryKey: ['key-pools', 'channels'],
    queryFn: async () => {
      const result = await getChannels({
        p: 1,
        page_size: 100,
        type: OPENAI_CHANNEL_TYPE,
        id_sort: true,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to load channels')
      }
      return result.data?.items ?? []
    },
  })

  const openAIChannels = channelsQuery.data ?? []
  const poolChannels = useMemo(() => {
    const normalizedTag = poolTag.trim()
    if (!normalizedTag) return openAIChannels
    return openAIChannels.filter((channel) => channel.tag === normalizedTag)
  }, [openAIChannels, poolTag])
  const multiKeyPoolChannels = useMemo(
    () => poolChannels.filter((channel) => channel.channel_info?.is_multi_key),
    [poolChannels]
  )

  const selectedChannel =
    openAIChannels.find((channel) => channel.id === selectedChannelId) ??
    poolChannels[0] ??
    null
  const appendTargetChannel = selectedChannel?.channel_info?.is_multi_key
    ? selectedChannel
    : (multiKeyPoolChannels[0] ?? null)

  const keyStatusQuery = useQuery({
    queryKey: [
      'key-pools',
      'key-status',
      selectedChannel?.id,
      keyStatusPage,
      keyStatusFilter,
    ],
    enabled: Boolean(selectedChannel?.channel_info?.is_multi_key),
    queryFn: async () => {
      if (!selectedChannel) {
        throw new Error('No channel selected')
      }
      const status =
        keyStatusFilter === 'all' ? undefined : Number(keyStatusFilter)
      const result = await getMultiKeyStatus(
        selectedChannel.id,
        keyStatusPage,
        20,
        status
      )
      if (!result.success) {
        throw new Error(result.message || 'Failed to load key status')
      }
      return result.data
    },
  })
  const keyStatusTotalPages = keyStatusQuery.data?.total_pages ?? 1

  const totals = useMemo(() => {
    const enabledChannels = poolChannels.filter(
      (channel) => channel.status === CHANNEL_STATUS.ENABLED
    ).length
    const totalKeys = poolChannels.reduce(
      (sum, channel) => sum + getChannelKeyCount(channel),
      0
    )
    const usedQuota = poolChannels.reduce(
      (sum, channel) => sum + (channel.used_quota || 0),
      0
    )

    return {
      enabledChannels,
      disabledChannels: poolChannels.length - enabledChannels,
      totalKeys,
      usedQuota,
    }
  }, [poolChannels])

  const invalidatePools = async () => {
    await queryClient.invalidateQueries({ queryKey: ['key-pools'] })
    await queryClient.invalidateQueries({ queryKey: ['channels'] })
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (parsedKeys.length === 0) {
        throw new Error(t('Please paste at least one API key'))
      }

      const keyPayload = parsedKeys.join('\n')

      if (importMode === 'append_pool') {
        if (!appendTargetChannel) {
          throw new Error(t('Please select a multi-key pool'))
        }
        const result = await updateChannel(appendTargetChannel.id, {
          key: keyPayload,
          key_mode: 'append',
          multi_key_mode: multiKeyMode,
        } as ChannelUpdatePayload)
        if (!result.success) {
          throw new Error(result.message || t('Failed to import keys'))
        }
        return result
      }

      const result = await createChannel({
        mode: importMode === 'batch_channels' ? 'batch' : 'multi_to_single',
        multi_key_mode: multiKeyMode,
        batch_add_set_key_prefix_2_name: importMode === 'batch_channels',
        channel: {
          name: poolName.trim() || DEFAULT_POOL_NAME,
          type: OPENAI_CHANNEL_TYPE,
          key: keyPayload,
          base_url: baseUrl.trim(),
          models: models.trim(),
          group: group.trim() || 'default',
          status: CHANNEL_STATUS.ENABLED,
          priority,
          weight,
          auto_ban: 1,
          tag: poolTag.trim() || DEFAULT_POOL_TAG,
          remark: t('Imported from key pool manager'),
        },
      })

      if (!result.success) {
        throw new Error(result.message || t('Failed to import keys'))
      }
      return result
    },
    onSuccess: async () => {
      toast.success(t('Keys imported successfully'))
      setKeyText('')
      setKeyStatusPage(1)
      await invalidatePools()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Import failed'))
    },
  })

  const channelActionMutation = useMutation({
    mutationFn: async (input: {
      channel: Channel
      action: 'enable' | 'disable' | 'test' | 'balance'
    }) => {
      switch (input.action) {
        case 'enable': {
          const result = await updateChannel(input.channel.id, {
            status: CHANNEL_STATUS.ENABLED,
          })
          if (!result.success) throw new Error(result.message)
          return result
        }
        case 'disable': {
          const result = await updateChannel(input.channel.id, {
            status: CHANNEL_STATUS.MANUAL_DISABLED,
          })
          if (!result.success) throw new Error(result.message)
          return result
        }
        case 'test': {
          const result = await testChannel(input.channel.id)
          if (!result.success) throw new Error(result.message)
          return result
        }
        case 'balance': {
          const result = await updateChannelBalance(input.channel.id)
          if (!result.success) throw new Error(result.message)
          return result
        }
      }
    },
    onSuccess: async (_result, variables) => {
      const message = {
        enable: t('Channel enabled'),
        disable: t('Channel disabled'),
        test: t('Channel test completed'),
        balance: t('Balance updated'),
      }[variables.action]
      toast.success(message)
      await invalidatePools()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Action failed'))
    },
  })

  const keyActionMutation = useMutation({
    mutationFn: async (input: {
      keyIndex: number
      action: 'enable' | 'disable' | 'delete'
    }) => {
      if (!selectedChannel) {
        throw new Error(t('Please select a target pool'))
      }

      if (input.action === 'enable') {
        return enableMultiKey(selectedChannel.id, input.keyIndex)
      }
      if (input.action === 'disable') {
        return disableMultiKey(selectedChannel.id, input.keyIndex)
      }
      return deleteMultiKey(selectedChannel.id, input.keyIndex)
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.message || t('Action failed'))
        return
      }
      toast.success(result.message || t('Updated successfully'))
      await invalidatePools()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Action failed'))
    },
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    importMutation.mutate()
  }

  const renderKeyActions = (keyStatus: KeyStatus) => {
    const disabled = keyActionMutation.isPending
    return (
      <div className='flex justify-end gap-1'>
        {keyStatus.status === 1 ? (
          <Button
            variant='ghost'
            size='icon'
            disabled={disabled}
            onClick={() =>
              keyActionMutation.mutate({
                keyIndex: keyStatus.index,
                action: 'disable',
              })
            }
            title={t('Disable key')}
          >
            <Ban className='h-4 w-4' />
          </Button>
        ) : (
          <Button
            variant='ghost'
            size='icon'
            disabled={disabled}
            onClick={() =>
              keyActionMutation.mutate({
                keyIndex: keyStatus.index,
                action: 'enable',
              })
            }
            title={t('Enable key')}
          >
            <CheckCircle2 className='h-4 w-4' />
          </Button>
        )}
        <Button
          variant='ghost'
          size='icon'
          disabled={disabled}
          onClick={() =>
            keyActionMutation.mutate({
              keyIndex: keyStatus.index,
              action: 'delete',
            })
          }
          title={t('Delete key')}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Key Pool Manager')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => invalidatePools()}
          disabled={channelsQuery.isFetching}
        >
          <RefreshCw className='h-4 w-4' />
          <span>{t('Refresh')}</span>
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <Alert>
            <Key className='h-4 w-4' />
            <AlertTitle>{t('Admin only')}</AlertTitle>
            <AlertDescription>
              {t(
                'Upstream API keys are submitted to the server as channels and are not shown in channel lists after import.'
              )}
            </AlertDescription>
          </Alert>

          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <KeyPoolStat
              label={t('Pool channels')}
              value={poolChannels.length}
            />
            <KeyPoolStat
              label={t('Enabled channels')}
              value={totals.enabledChannels}
              tone='success'
            />
            <KeyPoolStat
              label={t('Disabled channels')}
              value={totals.disabledChannels}
              tone={totals.disabledChannels > 0 ? 'warning' : 'default'}
            />
            <KeyPoolStat label={t('Stored keys')} value={totals.totalKeys} />
          </div>

          <div className='grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Upload className='h-4 w-4' />
                  {t('Import Upstream Keys')}
                </CardTitle>
                <CardDescription>
                  {t('Create an OpenAI upstream pool or append keys to one.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className='space-y-4' onSubmit={handleSubmit}>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label htmlFor='pool-name'>{t('Pool name')}</Label>
                      <Input
                        id='pool-name'
                        value={poolName}
                        onChange={(event) => setPoolName(event.target.value)}
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor='pool-tag'>{t('Pool tag')}</Label>
                      <Input
                        id='pool-tag'
                        value={poolTag}
                        onChange={(event) => setPoolTag(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label>{t('Import mode')}</Label>
                      <Select
                        value={importMode}
                        onValueChange={(value) =>
                          value && setImportMode(value as ImportMode)
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value='new_pool'>
                              {t('New multi-key pool')}
                            </SelectItem>
                            <SelectItem value='append_pool'>
                              {t('Append to selected pool')}
                            </SelectItem>
                            <SelectItem value='batch_channels'>
                              {t('One channel per key')}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-1.5'>
                      <Label>{t('Key rotation')}</Label>
                      <Select
                        value={multiKeyMode}
                        onValueChange={(value) =>
                          value && setMultiKeyMode(value as MultiKeyMode)
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value='polling'>
                              {t('Polling')}
                            </SelectItem>
                            <SelectItem value='random'>
                              {t('Random')}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {importMode === 'append_pool' && (
                    <div className='space-y-1.5'>
                      <Label>{t('Target pool')}</Label>
                      <Select
                        value={appendTargetChannel?.id.toString() ?? ''}
                        onValueChange={(value) =>
                          setSelectedChannelId(value ? Number(value) : null)
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {multiKeyPoolChannels.map((channel) => (
                              <SelectItem
                                key={channel.id}
                                value={channel.id.toString()}
                              >
                                {channel.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className='space-y-1.5'>
                    <Label htmlFor='pool-base-url'>{t('Base URL')}</Label>
                    <Input
                      id='pool-base-url'
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                    />
                  </div>

                  <div className='space-y-1.5'>
                    <Label htmlFor='pool-models'>{t('Models')}</Label>
                    <Input
                      id='pool-models'
                      value={models}
                      onChange={(event) => setModels(event.target.value)}
                    />
                  </div>

                  <div className='grid gap-3 sm:grid-cols-3'>
                    <div className='space-y-1.5'>
                      <Label htmlFor='pool-group'>{t('Group')}</Label>
                      <Input
                        id='pool-group'
                        value={group}
                        onChange={(event) => setGroup(event.target.value)}
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor='pool-priority'>{t('Priority')}</Label>
                      <Input
                        id='pool-priority'
                        type='number'
                        value={priority}
                        onChange={(event) =>
                          setPriority(Number(event.target.value))
                        }
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor='pool-weight'>{t('Weight')}</Label>
                      <Input
                        id='pool-weight'
                        type='number'
                        min={0}
                        value={weight}
                        onChange={(event) =>
                          setWeight(Number(event.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between gap-2'>
                      <Label htmlFor='pool-keys'>{t('API keys')}</Label>
                      <Badge variant='outline'>
                        {parsedKeys.length} {t('keys')}
                      </Badge>
                    </div>
                    <Textarea
                      id='pool-keys'
                      value={keyText}
                      onChange={(event) => setKeyText(event.target.value)}
                      className='min-h-40 font-mono text-xs'
                      placeholder='sk-proj-...'
                    />
                  </div>

                  <Button
                    type='submit'
                    disabled={importMutation.isPending}
                    className='w-full'
                  >
                    <Plus className='h-4 w-4' />
                    {importMutation.isPending
                      ? t('Importing...')
                      : t('Import Keys')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Pools')}</CardTitle>
                <CardDescription>
                  {t('OpenAI channels matching the current pool tag.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Name')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Keys')}</TableHead>
                      <TableHead>{t('Latency')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poolChannels.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground h-20 text-center'
                        >
                          {channelsQuery.isLoading
                            ? t('Loading...')
                            : t('No pools found')}
                        </TableCell>
                      </TableRow>
                    )}
                    {poolChannels.map((channel) => (
                      <TableRow
                        key={channel.id}
                        className={cn(
                          'cursor-pointer',
                          selectedChannel?.id === channel.id && 'bg-muted/60'
                        )}
                        onClick={() => {
                          setSelectedChannelId(channel.id)
                          setKeyStatusPage(1)
                        }}
                      >
                        <TableCell>
                          <div className='max-w-48 truncate font-medium'>
                            {channel.name}
                          </div>
                          <div className='text-muted-foreground text-xs'>
                            #{channel.id} {channel.tag ? `· ${channel.tag}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChannelStatusBadge
                            status={channel.status}
                            label={t(statusLabel(channel.status))}
                          />
                        </TableCell>
                        <TableCell>{getChannelKeyCount(channel)}</TableCell>
                        <TableCell>
                          {channel.response_time > 0
                            ? `${channel.response_time}ms`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className='flex justify-end gap-1'>
                            <Button
                              variant='ghost'
                              size='icon'
                              title={t('Test channel')}
                              disabled={channelActionMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                channelActionMutation.mutate({
                                  channel,
                                  action: 'test',
                                })
                              }}
                            >
                              <TestTube className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              title={t('Update balance')}
                              disabled={channelActionMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                channelActionMutation.mutate({
                                  channel,
                                  action: 'balance',
                                })
                              }}
                            >
                              <DollarSign className='h-4 w-4' />
                            </Button>
                            {channel.status === CHANNEL_STATUS.ENABLED ? (
                              <Button
                                variant='ghost'
                                size='icon'
                                title={t('Disable channel')}
                                disabled={channelActionMutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  channelActionMutation.mutate({
                                    channel,
                                    action: 'disable',
                                  })
                                }}
                              >
                                <Ban className='h-4 w-4' />
                              </Button>
                            ) : (
                              <Button
                                variant='ghost'
                                size='icon'
                                title={t('Enable channel')}
                                disabled={channelActionMutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  channelActionMutation.mutate({
                                    channel,
                                    action: 'enable',
                                  })
                                }}
                              >
                                <CheckCircle2 className='h-4 w-4' />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('Selected Pool Keys')}</CardTitle>
              <CardDescription>
                {selectedChannel
                  ? `${selectedChannel.name} · #${selectedChannel.id}`
                  : t('Select a multi-key pool to inspect individual keys.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={keyStatusFilter}
                    onValueChange={(value) => {
                      setKeyStatusFilter(value || 'all')
                      setKeyStatusPage(1)
                    }}
                  >
                    <SelectTrigger className='w-40'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='all'>{t('All Status')}</SelectItem>
                        <SelectItem value='1'>{t('Enabled')}</SelectItem>
                        <SelectItem value='2'>
                          {t('Manual Disabled')}
                        </SelectItem>
                        <SelectItem value='3'>{t('Auto Disabled')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {keyStatusQuery.data && (
                    <>
                      <StatusBadge
                        label={`${t('Enabled')} ${keyStatusQuery.data.enabled_count}`}
                        variant='success'
                        copyable={false}
                      />
                      <StatusBadge
                        label={`${t('Manual Disabled')} ${keyStatusQuery.data.manual_disabled_count}`}
                        variant='neutral'
                        copyable={false}
                      />
                      <StatusBadge
                        label={`${t('Auto Disabled')} ${keyStatusQuery.data.auto_disabled_count}`}
                        variant='danger'
                        copyable={false}
                      />
                    </>
                  )}
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={!selectedChannel || keyStatusQuery.isFetching}
                  onClick={() => keyStatusQuery.refetch()}
                >
                  <RefreshCw className='h-4 w-4' />
                  {t('Refresh')}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Index')}</TableHead>
                    <TableHead>{t('Key')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Disabled Time')}</TableHead>
                    <TableHead>{t('Reason')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedChannel?.channel_info?.is_multi_key && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className='text-muted-foreground h-20 text-center'
                      >
                        {t('Selected channel is not a multi-key pool')}
                      </TableCell>
                    </TableRow>
                  )}
                  {selectedChannel?.channel_info?.is_multi_key &&
                    (keyStatusQuery.data?.keys.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='text-muted-foreground h-20 text-center'
                        >
                          {keyStatusQuery.isLoading
                            ? t('Loading...')
                            : t('No keys found')}
                        </TableCell>
                      </TableRow>
                    )}
                  {keyStatusQuery.data?.keys.map((keyStatus) => (
                    <TableRow key={keyStatus.index}>
                      <TableCell>#{keyStatus.index + 1}</TableCell>
                      <TableCell className='font-mono text-xs'>
                        {keyStatus.key_preview || '-'}
                      </TableCell>
                      <TableCell>
                        <KeyStatusBadge
                          status={keyStatus.status}
                          label={t(keyStatusLabel(keyStatus.status))}
                        />
                      </TableCell>
                      <TableCell>{formatTime(keyStatus.disabled_time)}</TableCell>
                      <TableCell>
                        <span className='line-clamp-1 max-w-64'>
                          {keyStatus.reason || '-'}
                        </span>
                      </TableCell>
                      <TableCell>{renderKeyActions(keyStatus)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {keyStatusQuery.data && keyStatusQuery.data.total_pages > 1 && (
                <div className='flex justify-end gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={keyStatusPage <= 1}
                    onClick={() =>
                      setKeyStatusPage((current) => Math.max(1, current - 1))
                    }
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={keyStatusPage >= keyStatusTotalPages}
                    onClick={() =>
                      setKeyStatusPage((current) =>
                        Math.min(keyStatusTotalPages, current + 1)
                      )
                    }
                  >
                    {t('Next')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
