<template>
  <!-- ========== 提交请假 ========== -->
  <n-card size="small" title="提交请假">
    <n-space align="center" :size="12" style="flex-wrap: wrap">
      <n-select
        v-model:value="form.monk_id"
        :options="monkOptions"
        placeholder="请假僧人"
        filterable
        style="width: 200px"
      />
      <n-date-picker
        v-model:formatted-value="form.range"
        value-format="yyyy-MM-dd"
        type="daterange"
        clearable
        style="width: 260px"
      />
      <n-checkbox-group v-model:value="form.sessions">
        <n-space :size="8">
          <n-checkbox value="morning" label="早课" />
          <n-checkbox value="evening" label="晚课" />
        </n-space>
      </n-checkbox-group>
      <n-input
        v-model:value="form.reason"
        placeholder="请假事由"
        style="width: 240px"
        @keyup.enter="submitLeave"
      />
      <n-input v-model:value="form.requested_by" placeholder="提交人" style="width: 110px" />
      <n-button type="primary" :loading="submitting" @click="submitLeave">提交请假</n-button>
    </n-space>
  </n-card>

  <!-- ========== 审批 / 销假 / 记录 ========== -->
  <n-card size="small" style="margin-top: 16px">
    <n-tabs v-model:value="tab" type="line" animated @update:value="load">
      <n-tab-pane name="pending" :tab="`待审批（${pending.length}）`">
        <n-data-table
          :columns="pendingColumns"
          :data="pending"
          :loading="loading"
          :row-key="(r: LeaveRequest) => r.id"
          :pagination="false"
          striped
        />
      </n-tab-pane>
      <n-tab-pane name="approved" :tab="`在假中（${approved.length}）`">
        <n-data-table
          :columns="approvedColumns"
          :data="approved"
          :loading="loading"
          :row-key="(r: LeaveRequest) => r.id"
          :pagination="false"
          striped
        />
      </n-tab-pane>
      <n-tab-pane name="all" tab="全部记录">
        <n-radio-group v-model:value="allFilter" size="small" style="margin-bottom: 12px" @update:value="load">
          <n-radio-button value="">全部</n-radio-button>
          <n-radio-button value="returned">已销假</n-radio-button>
          <n-radio-button value="rejected">已驳回</n-radio-button>
          <n-radio-button value="cancelled">已撤销</n-radio-button>
        </n-radio-group>
        <n-data-table
          :columns="allColumns"
          :data="allRows"
          :loading="loading"
          :row-key="(r: LeaveRequest) => r.id"
          :pagination="{ pageSize: 10 }"
          striped
        />
      </n-tab-pane>
    </n-tabs>
  </n-card>

  <!-- ========== 审批（批准/驳回） ========== -->
  <n-modal
    v-model:show="showReview"
    preset="card"
    :title="reviewAction === 'approve' ? '批准请假' : '驳回请假'"
    style="width: 440px"
  >
    <n-form label-placement="left" label-width="72px">
      <n-form-item label="僧人">
        <span>{{ reviewTarget?.dharma_name }}（{{ reviewTarget ? leavePeriod(reviewTarget) : '' }}）</span>
      </n-form-item>
      <n-form-item label="事由">
        <span>{{ reviewTarget?.reason }}</span>
      </n-form-item>
      <n-form-item label="审批人">
        <n-input v-model:value="reviewForm.reviewed_by" />
      </n-form-item>
      <n-form-item label="审批意见">
        <n-input v-model:value="reviewForm.review_note" type="textarea" :autosize="{ minRows: 2 }" />
      </n-form-item>
    </n-form>
    <n-text v-if="reviewAction === 'approve'" depth="3" style="font-size: 12px">
      批准后，假期内早晚课考勤将自动登记为「请假」；若此前有误记缺勤，将一并更正并办结缺勤提醒。
    </n-text>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showReview = false">取消</n-button>
        <n-button
          :type="reviewAction === 'approve' ? 'primary' : 'error'"
          :loading="acting"
          @click="submitReview"
        >
          {{ reviewAction === 'approve' ? '准假' : '驳回' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>

  <!-- ========== 销假 ========== -->
  <n-modal v-model:show="showReturn" preset="card" title="销假（回寺报到）" style="width: 400px">
    <n-form label-placement="left" label-width="72px">
      <n-form-item label="僧人">
        <span>{{ returnTarget?.dharma_name }}（假期至 {{ returnTarget?.end_date }}）</span>
      </n-form-item>
      <n-form-item label="销假日期">
        <n-date-picker
          v-model:formatted-value="returnForm.return_date"
          value-format="yyyy-MM-dd"
          type="date"
          style="width: 100%"
        />
      </n-form-item>
      <n-form-item label="经办人">
        <n-input v-model:value="returnForm.returned_by" />
      </n-form-item>
    </n-form>
    <n-text depth="3" style="font-size: 12px">
      提前销假的，假期剩余日子里由审批同步的考勤将自动清除。
    </n-text>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showReturn = false">取消</n-button>
        <n-button type="primary" :loading="acting" @click="submitReturn">确认销假</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import {
  NCard, NSpace, NSelect, NDatePicker, NCheckboxGroup, NCheckbox, NInput, NButton,
  NTabs, NTabPane, NDataTable, NRadioGroup, NRadioButton, NModal, NForm, NFormItem,
  NTag, NText, NPopconfirm,
  useMessage,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  http, LEAVE_STATUS_LABEL, LEAVE_STATUS_TYPE,
  MONK_STATUS_LABEL, MONK_STATUS_TYPE, SESSION_LABEL,
} from '../api.js';
import type { LeaveRequest, Monk, SessionType } from '../types.js';

const message = useMessage();
const tab = ref('pending');
const loading = ref(false);
const submitting = ref(false);
const acting = ref(false);

const pending = ref<LeaveRequest[]>([]);
const approved = ref<LeaveRequest[]>([]);
const allRows = ref<LeaveRequest[]>([]);
const allFilter = ref('');

// ---- 提交请假表单 ----
const monks = ref<Monk[]>([]);
const form = ref({
  monk_id: null as string | null,
  range: null as [string, string] | null,
  sessions: ['morning', 'evening'] as SessionType[],
  reason: '',
  requested_by: '本人',
});

const monkOptions = computed(() =>
  monks.value
    .filter((m) => m.status !== 'left')
    .map((m) => ({
      label: `${m.dharma_name}（${MONK_STATUS_LABEL[m.status]}）`,
      value: m.id,
    })),
);

async function loadMonks() {
  const { data } = await http.get<Monk[]>('/monks');
  monks.value = data;
}

async function submitLeave() {
  if (!form.value.monk_id) return message.warning('请选择请假僧人');
  if (!form.value.range) return message.warning('请选择请假起讫日期');
  if (form.value.sessions.length === 0) return message.warning('请选择请假课次');
  if (!form.value.reason.trim()) return message.warning('请填写请假事由');
  submitting.value = true;
  try {
    await http.post('/leaves', {
      monk_id: form.value.monk_id,
      start_date: form.value.range[0],
      end_date: form.value.range[1],
      sessions: form.value.sessions,
      reason: form.value.reason,
      requested_by: form.value.requested_by || '本人',
    });
    message.success('请假已提交，待知客审批');
    form.value.reason = '';
    form.value.range = null;
    load();
  } finally {
    submitting.value = false;
  }
}

// ---- 列表加载 ----
async function load() {
  loading.value = true;
  try {
    const [p, a, all] = await Promise.all([
      http.get<LeaveRequest[]>('/leaves', { params: { status: 'pending' } }),
      http.get<LeaveRequest[]>('/leaves', { params: { status: 'approved' } }),
      http.get<LeaveRequest[]>('/leaves', {
        params: allFilter.value ? { status: allFilter.value } : {},
      }),
    ]);
    pending.value = p.data;
    approved.value = a.data;
    allRows.value = all.data;
  } finally {
    loading.value = false;
  }
}

// ---- 审批 ----
const showReview = ref(false);
const reviewAction = ref<'approve' | 'reject'>('approve');
const reviewTarget = ref<LeaveRequest | null>(null);
const reviewForm = ref({ reviewed_by: '知客', review_note: '' });

function openReview(action: 'approve' | 'reject', row: LeaveRequest) {
  reviewAction.value = action;
  reviewTarget.value = row;
  reviewForm.value = { reviewed_by: '知客', review_note: '' };
  showReview.value = true;
}

async function submitReview() {
  if (!reviewTarget.value) return;
  acting.value = true;
  try {
    await http.post(`/leaves/${reviewTarget.value.id}/${reviewAction.value}`, reviewForm.value);
    message.success(
      reviewAction.value === 'approve'
        ? '已准假，假期考勤已自动登记为请假'
        : '已驳回该请假',
    );
    showReview.value = false;
    load();
  } finally {
    acting.value = false;
  }
}

// ---- 销假 ----
const showReturn = ref(false);
const returnTarget = ref<LeaveRequest | null>(null);
const returnForm = ref({ return_date: new Date().toISOString().slice(0, 10), returned_by: '知客' });

function openReturn(row: LeaveRequest) {
  returnTarget.value = row;
  returnForm.value = { return_date: new Date().toISOString().slice(0, 10), returned_by: '知客' };
  showReturn.value = true;
}

async function submitReturn() {
  if (!returnTarget.value) return;
  acting.value = true;
  try {
    await http.post(`/leaves/${returnTarget.value.id}/return`, returnForm.value);
    message.success('已销假');
    showReturn.value = false;
    load();
  } finally {
    acting.value = false;
  }
}

// ---- 撤销 ----
async function cancelLeave(row: LeaveRequest) {
  await http.post(`/leaves/${row.id}/cancel`);
  message.success('请假已撤销');
  load();
}

// ---- 展示辅助 ----
function leavePeriod(r: LeaveRequest) {
  return `${r.start_date} ~ ${r.end_date}（${r.days}天）`;
}
function sessionText(sessions: SessionType[]) {
  return sessions.map((s) => SESSION_LABEL[s]).join('、');
}
function monkCell(r: LeaveRequest) {
  return h('span', { style: 'font-weight:600' }, [
    r.dharma_name,
    h(NTag, { size: 'small', type: MONK_STATUS_TYPE[r.monk_status], bordered: false, style: 'margin-left:6px' }, { default: () => MONK_STATUS_LABEL[r.monk_status] }),
    r.current_post
      ? h(NTag, { size: 'small', type: 'primary', bordered: false, style: 'margin-left:4px' }, { default: () => r.current_post ?? '' })
      : null,
  ]);
}

const baseColumns: DataTableColumns<LeaveRequest> = [
  { title: '法名', key: 'dharma_name', width: 210, render: monkCell },
  { title: '请假日期', key: 'period', width: 230, render: (r) => leavePeriod(r) },
  { title: '课次', key: 'sessions', width: 110, render: (r) => sessionText(r.sessions) },
  { title: '事由', key: 'reason', ellipsis: { tooltip: true }, render: (r) => r.reason },
];

const pendingColumns: DataTableColumns<LeaveRequest> = [
  ...baseColumns,
  { title: '提交', key: 'requested_by', width: 150, render: (r) => `${r.requested_by ?? '—'} · ${r.created_at.slice(0, 10)}` },
  {
    title: '操作',
    key: 'actions',
    width: 170,
    render: (r) =>
      h(NSpace, { size: 8 }, () => [
        h(NButton, { size: 'small', type: 'primary', onClick: () => openReview('approve', r) }, { default: () => '批准' }),
        h(NButton, { size: 'small', type: 'error', secondary: true, onClick: () => openReview('reject', r) }, { default: () => '驳回' }),
      ]),
  },
];

const approvedColumns: DataTableColumns<LeaveRequest> = [
  ...baseColumns,
  { title: '审批', key: 'reviewed_by', width: 150, render: (r) => `${r.reviewed_by ?? '—'} · ${(r.reviewed_at ?? '').slice(0, 10)}` },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (r) =>
      h(NButton, { size: 'small', type: 'primary', secondary: true, onClick: () => openReturn(r) }, { default: () => '销假' }),
  },
];

const allColumns: DataTableColumns<LeaveRequest> = [
  ...baseColumns,
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r) =>
      h(NTag, { size: 'small', type: LEAVE_STATUS_TYPE[r.status], bordered: false }, { default: () => LEAVE_STATUS_LABEL[r.status] }),
  },
  {
    title: '审批 / 销假',
    key: 'review',
    width: 220,
    render: (r) => {
      const parts: string[] = [];
      if (r.reviewed_by) parts.push(`${r.reviewed_by}审批`);
      if (r.review_note) parts.push(`「${r.review_note}」`);
      if (r.return_date) parts.push(`${r.return_date}销假`);
      return parts.length ? parts.join(' ') : '—';
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (r) =>
      r.status === 'pending'
        ? h(
            NPopconfirm,
            { onPositiveClick: () => cancelLeave(r) },
            {
              trigger: () => h(NButton, { size: 'small', secondary: true }, { default: () => '撤销' }),
              default: () => '确认撤销该请假申请？',
            },
          )
        : null,
  },
];

onMounted(() => {
  loadMonks();
  load();
});
</script>
