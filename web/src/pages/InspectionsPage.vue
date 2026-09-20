<template>
  <n-card size="small">
    <n-space align="center" justify="space-between">
      <n-space align="center">
        <n-radio-group v-model:value="resultFilter" size="medium" @update:value="load">
          <n-radio-button value="pending">考察中</n-radio-button>
          <n-radio-button value="passed">已转常住</n-radio-button>
          <n-radio-button value="failed">未通过</n-radio-button>
          <n-radio-button value="">全部</n-radio-button>
        </n-radio-group>
      </n-space>
      <n-button type="primary" @click="openStart">
        <template #icon><n-icon :component="HourglassOutline" /></template>
        发心常住 · 转入考察
      </n-button>
    </n-space>
  </n-card>

  <n-card size="small" style="margin-top:16px">
    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :row-key="(r: Inspection) => r.id"
      :pagination="{ pageSize: 10 }"
      striped
    />
  </n-card>

  <!-- 发起考察期 -->
  <n-modal v-model:show="showStart" preset="card" title="发心常住 · 转入考察期" style="width: 480px">
    <n-form ref="startFormRef" :model="startForm" :rules="startRules" label-placement="left" label-width="92px">
      <n-form-item label="挂单僧人" path="guadan_id">
        <n-select
          v-model:value="startForm.guadan_id"
          :options="guadanOptions"
          filterable
          placeholder="选择在寺挂单僧人"
        />
      </n-form-item>
      <n-grid :cols="2">
        <n-grid-item>
          <n-form-item label="考察开始" path="start_date">
            <n-date-picker
              v-model:formatted-value="startForm.start_date"
              value-format="yyyy-MM-dd"
              style="width: 100%"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="考察时长" path="duration_months">
            <n-input-number
              v-model:value="startForm.duration_months"
              :min="3"
              :max="6"
              style="width: 100%"
            >
              <template #suffix>个月</template>
            </n-input-number>
          </n-form-item>
        </n-grid-item>
      </n-grid>
      <n-form-item label="备注">
        <n-input v-model:value="startForm.note" type="textarea" :autosize="{ minRows: 2 }" placeholder="发心因缘、初步印象" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showStart = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="submitStart">转入考察</n-button>
      </n-space>
    </template>
  </n-modal>

  <!-- 羯磨通过 -->
  <n-modal v-model:show="showPass" preset="card" title="考察通过 · 羯磨转常住" style="width: 460px">
    <n-form label-placement="left" label-width="92px">
      <n-form-item label="僧人">
        <n-text strong>{{ passTarget?.dharma_name }}</n-text>
      </n-form-item>
      <n-form-item label="羯磨日期">
        <n-date-picker
          v-model:formatted-value="passForm.karma_date"
          value-format="yyyy-MM-dd"
          style="width: 100%"
        />
      </n-form-item>
      <n-form-item label="担任职务">
        <n-select
          v-model:value="passForm.current_post"
          :options="postOptions"
          filterable
          tag
          placeholder="知客 / 维那 / 典座等（可留空）"
          clearable
        />
      </n-form-item>
      <n-form-item label="备注">
        <n-input v-model:value="passForm.note" type="textarea" :autosize="{ minRows: 2 }" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showPass = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="submitPass">羯磨成就</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { h, onMounted, ref } from 'vue';
import {
  NCard, NSpace, NRadioGroup, NRadioButton, NButton, NIcon, NDataTable, NModal,
  NForm, NFormItem, NSelect, NDatePicker, NInputNumber, NInput, NGrid, NGridItem,
  NTag, NPopconfirm, NText, useMessage,
} from 'naive-ui';
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui';
import { HourglassOutline } from '@vicons/ionicons5';
import { http, POSTS } from '../api.js';
import type { Guadan, Inspection } from '../types.js';

const message = useMessage();
const rows = ref<Inspection[]>([]);
const loading = ref(false);
const resultFilter = ref('pending');
const saving = ref(false);

const showStart = ref(false);
const showPass = ref(false);
const startFormRef = ref<FormInst | null>(null);
const guadanOptions = ref<SelectOption[]>([]);
const passTarget = ref<Inspection | null>(null);

const startForm = ref({
  guadan_id: null as string | null,
  start_date: new Date().toISOString().slice(0, 10),
  duration_months: 4,
  note: '',
});
const startRules: FormRules = {
  guadan_id: { required: true, message: '请选择挂单僧人', trigger: 'change' },
  start_date: { required: true, message: '请选择开始日期', trigger: 'change' },
  duration_months: { required: true, type: 'number', min: 3, max: 6, message: '考察期为 3-6 个月', trigger: 'blur' },
};

const passForm = ref({ karma_date: new Date().toISOString().slice(0, 10), current_post: null as string | null, note: '' });
const postOptions: SelectOption[] = POSTS.map((p) => ({ label: p, value: p }));

async function load() {
  loading.value = true;
  try {
    const params = resultFilter.value ? { result: resultFilter.value } : {};
    const { data } = await http.get<Inspection[]>('/inspections', { params });
    rows.value = data;
  } finally {
    loading.value = false;
  }
}

async function openStart() {
  startForm.value = {
    guadan_id: null,
    start_date: new Date().toISOString().slice(0, 10),
    duration_months: 4,
    note: '',
  };
  const { data } = await http.get<Guadan[]>('/guadan', { params: { status: 'active' } });
  guadanOptions.value = data
    .filter((g) => g.monk_status === 'guadan')
    .map((g) => ({
      label: `${g.dharma_name}（${g.home_monastery ?? '出家寺庙未录'} · 到寺 ${g.arrive_date}）`,
      value: g.id,
    }));
  showStart.value = true;
}

async function submitStart() {
  await startFormRef.value?.validate();
  saving.value = true;
  try {
    await http.post('/inspections', startForm.value);
    message.success('已转入考察期');
    showStart.value = false;
    resultFilter.value = 'pending';
    load();
  } finally {
    saving.value = false;
  }
}

function openPass(row: Inspection) {
  passTarget.value = row;
  passForm.value = { karma_date: new Date().toISOString().slice(0, 10), current_post: null, note: '' };
  showPass.value = true;
}

async function submitPass() {
  saving.value = true;
  try {
    await http.post(`/inspections/${passTarget.value?.id}/pass`, passForm.value);
    message.success('羯磨成就，已转为常住');
    showPass.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function fail(row: Inspection) {
  await http.post(`/inspections/${row.id}/fail`, { note: null });
  message.warning('考察未通过，已退回挂单身份');
  load();
}

const RESULT_LABEL: Record<string, string> = { pending: '考察中', passed: '已转常住', failed: '未通过' };
const RESULT_TYPE: Record<string, 'warning' | 'success' | 'error'> = {
  pending: 'warning', passed: 'success', failed: 'error',
};

const columns: DataTableColumns<Inspection> = [
  { title: '法名', key: 'dharma_name', width: 100, fixed: 'left', render: (r) => h(NText, { strong: true }, { default: () => r.dharma_name }) },
  {
    title: '状态',
    key: 'result',
    width: 100,
    render: (r) => h(NTag, { size: 'small', type: RESULT_TYPE[r.result], bordered: false }, { default: () => RESULT_LABEL[r.result] }),
  },
  { title: '开始日期', key: 'start_date', width: 110 },
  { title: '考察期满', key: 'expected_end', width: 110 },
  {
    title: '进度',
    key: 'days_elapsed',
    render: (r) => {
      if (r.result !== 'pending') return '—';
      const total = (new Date(r.expected_end).getTime() - new Date(r.start_date).getTime()) / 86400000;
      const pct = Math.min(100, Math.round((r.days_elapsed / Math.max(total, 1)) * 100));
      return h(NText, { depth: 3 }, { default: () => `第 ${r.days_elapsed} 天（${pct}%）` });
    },
  },
  { title: '羯磨日期', key: 'karma_date', width: 110, render: (r) => r.karma_date ?? '—' },
  { title: '备注', key: 'note', ellipsis: { tooltip: true } },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (r) => {
      if (r.result !== 'pending') return null;
      return h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, { size: 'small', type: 'primary', quaternary: true, onClick: () => openPass(r) }, { default: () => '羯磨通过' }),
          h(NPopconfirm, { onPositiveClick: () => fail(r) }, {
            trigger: () => h(NButton, { size: 'small', type: 'error', quaternary: true }, { default: () => '不通过' }),
            default: () => `确认 ${r.dharma_name} 考察不通过？将退回挂单身份。`,
          }),
        ],
      });
    },
  },
];

onMounted(load);
</script>
