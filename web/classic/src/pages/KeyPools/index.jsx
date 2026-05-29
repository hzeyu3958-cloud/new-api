/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh, IconUpload } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../helpers';

const { Text, Title } = Typography;

const OPENAI_CHANNEL_TYPE = 1;
const DEFAULT_POOL_TAG = 'ccswitch-openai';
const DEFAULT_POOL_NAME = 'OpenAI Account Pool';
const DEFAULT_BASE_URL = 'https://api.openai.com';
const DEFAULT_MODELS =
  'gpt-4.1,gpt-4.1-mini,gpt-4.1-nano,gpt-4o,gpt-4o-mini,o3,o4-mini';

const parseKeys = (value) => {
  const seen = new Set();
  const keys = [];

  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    });

  return keys;
};

const getChannelKeyCount = (channel) => {
  if (channel?.channel_info?.is_multi_key) {
    return channel.channel_info.multi_key_size || 0;
  }
  return channel ? 1 : 0;
};

const getStatusTag = (status) => {
  if (status === 1) return <Tag color='green'>启用</Tag>;
  if (status === 2) return <Tag color='red'>手动禁用</Tag>;
  if (status === 3) return <Tag color='orange'>自动禁用</Tag>;
  return <Tag color='grey'>未知</Tag>;
};

const getKeyStatusTag = (status) => {
  if (status === 1) return <Tag color='green'>可用</Tag>;
  if (status === 2) return <Tag color='red'>手动禁用</Tag>;
  if (status === 3) return <Tag color='orange'>自动禁用</Tag>;
  return <Tag color='grey'>未知</Tag>;
};

const formatTime = (timestamp) => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};

const KeyPools = () => {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [channels, setChannels] = useState([]);
  const [poolName, setPoolName] = useState(DEFAULT_POOL_NAME);
  const [poolTag, setPoolTag] = useState(DEFAULT_POOL_TAG);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [group, setGroup] = useState('default');
  const [priority, setPriority] = useState(100);
  const [weight, setWeight] = useState(0);
  const [keyText, setKeyText] = useState('');
  const [importMode, setImportMode] = useState('new_pool');
  const [multiKeyMode, setMultiKeyMode] = useState('polling');
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [keyStatus, setKeyStatus] = useState([]);
  const [keyStatusLoading, setKeyStatusLoading] = useState(false);
  const [keyStatusPage, setKeyStatusPage] = useState(1);
  const [keyStatusTotal, setKeyStatusTotal] = useState(0);
  const [keyStats, setKeyStats] = useState({
    enabled: 0,
    manualDisabled: 0,
    autoDisabled: 0,
  });

  const parsedKeys = useMemo(() => parseKeys(keyText), [keyText]);

  const poolChannels = useMemo(() => {
    const tag = poolTag.trim();
    if (!tag) return channels;
    return channels.filter((channel) => channel.tag === tag);
  }, [channels, poolTag]);

  const multiKeyPoolChannels = useMemo(
    () => poolChannels.filter((channel) => channel.channel_info?.is_multi_key),
    [poolChannels],
  );

  const selectedChannel = useMemo(() => {
    return (
      channels.find((channel) => channel.id === selectedChannelId) ||
      poolChannels[0] ||
      null
    );
  }, [channels, poolChannels, selectedChannelId]);

  const appendTargetChannel = selectedChannel?.channel_info?.is_multi_key
    ? selectedChannel
    : multiKeyPoolChannels[0] || null;

  const loadChannels = async () => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/channel/?p=1&page_size=100&id_sort=true&type=${OPENAI_CHANNEL_TYPE}`,
      );
      if (res.data.success) {
        setChannels(res.data.data?.items || []);
      } else {
        showError(res.data.message || '加载渠道失败');
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const loadKeyStatus = async (
    page = keyStatusPage,
    channel = selectedChannel,
  ) => {
    if (!channel?.id || !channel.channel_info?.is_multi_key) {
      setKeyStatus([]);
      setKeyStatusTotal(0);
      setKeyStats({ enabled: 0, manualDisabled: 0, autoDisabled: 0 });
      return;
    }

    setKeyStatusLoading(true);
    try {
      const res = await API.post('/api/channel/multi_key/manage', {
        channel_id: channel.id,
        action: 'get_key_status',
        page,
        page_size: 10,
      });
      if (res.data.success) {
        const data = res.data.data || {};
        setKeyStatus(data.keys || []);
        setKeyStatusTotal(data.total || 0);
        setKeyStatusPage(data.page || page);
        setKeyStats({
          enabled: data.enabled_count || 0,
          manualDisabled: data.manual_disabled_count || 0,
          autoDisabled: data.auto_disabled_count || 0,
        });
      } else {
        showError(res.data.message || '加载密钥状态失败');
      }
    } catch (error) {
      showError(error);
    } finally {
      setKeyStatusLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    setKeyStatusPage(1);
    loadKeyStatus(1, selectedChannel);
  }, [selectedChannel?.id]);

  const buildChannelPayload = (name, key) => ({
    name,
    type: OPENAI_CHANNEL_TYPE,
    key,
    base_url: baseUrl.trim() || DEFAULT_BASE_URL,
    models,
    group,
    groups: group
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    auto_ban: 1,
    priority: Number(priority) || 0,
    weight: Number(weight) || 0,
    tag: poolTag.trim(),
  });

  const handleImport = async () => {
    if (parsedKeys.length === 0) {
      showError('请先粘贴至少一个 OpenAI API Key');
      return;
    }

    setImporting(true);
    try {
      if (importMode === 'new_pool') {
        const res = await API.post('/api/channel/', {
          mode: 'multi_to_single',
          multi_key_mode: multiKeyMode,
          channel: buildChannelPayload(
            poolName.trim() || DEFAULT_POOL_NAME,
            parsedKeys.join('\n'),
          ),
        });
        if (!res.data.success) throw new Error(res.data.message || '导入失败');
        showSuccess(`已创建号池，导入 ${parsedKeys.length} 个 key`);
      }

      if (importMode === 'append_pool') {
        if (!appendTargetChannel?.id) {
          throw new Error('没有可追加的多密钥号池，请先创建一个新号池');
        }
        const res = await API.put('/api/channel/', {
          ...appendTargetChannel,
          key: parsedKeys.join('\n'),
          key_mode: 'append',
          multi_key_mode: multiKeyMode,
        });
        if (!res.data.success) throw new Error(res.data.message || '追加失败');
        showSuccess(`已追加 ${parsedKeys.length} 个 key`);
      }

      if (importMode === 'batch_channels') {
        const res = await API.post('/api/channel/', {
          mode: 'batch',
          channel: buildChannelPayload(
            poolName.trim() || DEFAULT_POOL_NAME,
            parsedKeys.join('\n'),
          ),
        });
        if (!res.data.success) throw new Error(res.data.message || '导入失败');
        showSuccess(`已创建 ${parsedKeys.length} 个独立渠道`);
      }

      setKeyText('');
      await loadChannels();
      await loadKeyStatus(1);
    } catch (error) {
      showError(error.message || error);
    } finally {
      setImporting(false);
    }
  };

  const handleKeyAction = async (action, keyIndex) => {
    if (!selectedChannel?.id) return;
    try {
      const payload = {
        channel_id: selectedChannel.id,
        action,
      };
      if (typeof keyIndex === 'number') payload.key_index = keyIndex;
      const res = await API.post('/api/channel/multi_key/manage', payload);
      if (res.data.success) {
        showSuccess(res.data.message || '操作成功');
        await loadKeyStatus(keyStatusPage);
        await loadChannels();
      } else {
        showError(res.data.message || '操作失败');
      }
    } catch (error) {
      showError(error);
    }
  };

  const handleTestChannel = async (channel) => {
    try {
      const res = await API.get(`/api/channel/test/${channel.id}`);
      if (res.data.success) {
        showSuccess(res.data.message || '测试成功');
      } else {
        showError(res.data.message || '测试失败');
      }
    } catch (error) {
      showError(error);
    }
  };

  const handleUpdateBalance = async (channel) => {
    try {
      const res = await API.get(`/api/channel/update_balance/${channel.id}/`);
      if (res.data.success) {
        showSuccess(res.data.message || '余额已更新');
        await loadChannels();
      } else {
        showError(res.data.message || '更新余额失败');
      }
    } catch (error) {
      showError(error);
    }
  };

  const channelColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '号池 / 渠道',
      dataIndex: 'name',
      render: (name, record) => (
        <Space vertical align='start' spacing={2}>
          <Text strong>{name}</Text>
          <Text type='tertiary' size='small'>
            {record.tag || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: getStatusTag,
    },
    {
      title: 'Key 数',
      width: 100,
      render: (_, record) => getChannelKeyCount(record),
    },
    {
      title: '模型',
      dataIndex: 'models',
      render: (value) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 260 }}>
          {value || '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space>
          <Button size='small' onClick={() => setSelectedChannelId(record.id)}>
            查看
          </Button>
          <Button size='small' onClick={() => handleTestChannel(record)}>
            测试
          </Button>
          <Button size='small' onClick={() => handleUpdateBalance(record)}>
            余额
          </Button>
        </Space>
      ),
    },
  ];

  const keyColumns = [
    {
      title: '序号',
      dataIndex: 'key_index',
      width: 90,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: getKeyStatusTag,
    },
    {
      title: '失败次数',
      dataIndex: 'fail_count',
      width: 100,
    },
    {
      title: '最后失败',
      dataIndex: 'last_fail_time',
      render: formatTime,
    },
    {
      title: '操作',
      width: 210,
      render: (_, record) => (
        <Space>
          {record.status === 1 ? (
            <Button
              size='small'
              onClick={() => handleKeyAction('disable_key', record.key_index)}
            >
              禁用
            </Button>
          ) : (
            <Button
              size='small'
              onClick={() => handleKeyAction('enable_key', record.key_index)}
            >
              启用
            </Button>
          )}
          <Popconfirm
            title='确定删除这个 key？'
            onConfirm={() => handleKeyAction('delete_key', record.key_index)}
          >
            <Button size='small' type='danger'>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className='mt-[60px] px-2 pb-6'>
      <div className='mb-4'>
        <Title heading={3}>号池管理</Title>
        <Text type='tertiary'>
          只给管理员使用。这里导入的是上游 OpenAI API Key，CCswitch 里填写的是本系统生成的令牌。
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title='导入 OpenAI API Key'>
            <Form labelPosition='top'>
              <Form.Input
                label='号池名称'
                field='poolName'
                initValue={poolName}
                onChange={setPoolName}
              />
              <Form.Input
                label='标签'
                field='poolTag'
                initValue={poolTag}
                onChange={setPoolTag}
              />
              <Form.Input
                label='Base URL'
                field='baseUrl'
                initValue={baseUrl}
                onChange={setBaseUrl}
              />
              <Form.TextArea
                label='模型'
                field='models'
                initValue={models}
                autosize
                onChange={setModels}
              />
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Input
                    label='分组'
                    field='group'
                    initValue={group}
                    onChange={setGroup}
                  />
                </Col>
                <Col span={6}>
                  <Form.InputNumber
                    label='优先级'
                    field='priority'
                    initValue={priority}
                    onChange={setPriority}
                  />
                </Col>
                <Col span={6}>
                  <Form.InputNumber
                    label='权重'
                    field='weight'
                    initValue={weight}
                    onChange={setWeight}
                  />
                </Col>
              </Row>
              <Form.Select
                label='导入方式'
                field='importMode'
                initValue={importMode}
                onChange={setImportMode}
              >
                <Select.Option value='new_pool'>创建一个多 key 号池</Select.Option>
                <Select.Option value='append_pool'>追加到选中的号池</Select.Option>
                <Select.Option value='batch_channels'>每个 key 一个独立渠道</Select.Option>
              </Form.Select>
              <Form.Select
                label='多 key 调度'
                field='multiKeyMode'
                initValue={multiKeyMode}
                onChange={setMultiKeyMode}
              >
                <Select.Option value='polling'>轮询</Select.Option>
                <Select.Option value='random'>随机</Select.Option>
              </Form.Select>
              <Form.TextArea
                label={`API Key（已识别 ${parsedKeys.length} 个）`}
                field='keyText'
                placeholder='每行一个 sk-...，也支持逗号分隔'
                autosize={{ minRows: 8 }}
                value={keyText}
                onChange={setKeyText}
              />
              <Button
                type='primary'
                icon={<IconUpload />}
                loading={importing}
                onClick={handleImport}
                block
              >
                导入到号池
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title='OpenAI 号池'
            headerExtraContent={
              <Button icon={<IconRefresh />} onClick={loadChannels}>
                刷新
              </Button>
            }
          >
            <Spin spinning={loading}>
              <Table
                rowKey='id'
                columns={channelColumns}
                dataSource={poolChannels}
                pagination={false}
                empty={<Empty title='暂无号池' />}
              />
            </Spin>
          </Card>

          <Card className='mt-4' title='Key 状态'>
            {selectedChannel?.channel_info?.is_multi_key ? (
              <>
                <Descriptions
                  row
                  data={[
                    { key: '当前号池', value: selectedChannel.name },
                    { key: '总数', value: keyStatusTotal },
                    { key: '可用', value: keyStats.enabled },
                    { key: '手动禁用', value: keyStats.manualDisabled },
                    { key: '自动禁用', value: keyStats.autoDisabled },
                  ]}
                />
                <Space className='my-3'>
                  <Button onClick={() => handleKeyAction('enable_all_keys')}>
                    全部启用
                  </Button>
                  <Button onClick={() => handleKeyAction('disable_all_keys')}>
                    全部禁用
                  </Button>
                  <Popconfirm
                    title='确定删除所有禁用 key？'
                    onConfirm={() => handleKeyAction('delete_disabled_keys')}
                  >
                    <Button type='danger'>删除禁用 key</Button>
                  </Popconfirm>
                </Space>
                <Table
                  rowKey='key_index'
                  loading={keyStatusLoading}
                  columns={keyColumns}
                  dataSource={keyStatus}
                  pagination={{
                    currentPage: keyStatusPage,
                    pageSize: 10,
                    total: keyStatusTotal,
                    onPageChange: (page) => loadKeyStatus(page),
                  }}
                />
              </>
            ) : (
              <Empty title='请选择一个多 key 号池' />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default KeyPools;
