<template>
  <n-card size="small">
    <n-space align="center" justify="space-between">
      <n-space align="center">
        <n-radio-group v-model:value="statusFilter" @update:value="load">
          <n-radio-button value="pending">待审批</n-radio-button>
          <n-radio-button value="approved">已批准</n-radio-button>
          <n-radio-button value="rejected">已驳回</n-radio-button>
          <n-radio-button value="cancelled">已撤销</n-radio-button>
          <n-radio-button value="">全部</n-radio-button>
        </n-radio-group>
        <n-input
          v-model:value="keyword"
          placeholder="搜法名"
          clearable
          style="width: 160px"
          @keyup.enter="load"
          @clear="load"
        />
      </n-space>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon :component="AddOutline" /></template>
        提交请假
      </n-button>
    </n-space>
    <n-text depth="3" style="display:block;margin-top:10px">
      批准后请假期间早晚课考勤自动记为「请假」；撤销（销假）后自动回滚。请假使近 30 日缺勤不足 3 次时，缺勤提醒自动关闭。
    </n-text>
  </n-card>

  <n-grid :cols="2" :x-gap="16" :y-gap="16" item-responsive responsive="screen" style="margin-top:16px">
    <n-grid-item v-for="l in leaves" :key="l.id" span="2 l:1">
      <n-card size="small" :class="['leave-card', l.status]">
        <n-space align="center" justify="space-between">
          <n-space align="center">
            <n-icon :component="WalkOutline" :size="22" color="#8c5a2e" />
            <div>
              <div class="leave-name">
                {{ l.dharma_name }}
                <n-tag size="small" :type="MONK_STATUS_TYPE[l.monk_status]" :bordered="false" style="margin-left:6px">
                  {{ MONK_STATUS_LABEL[l.monk_status] }}
                </n-tag>
                <n-tag v-if="l.current_post" size="small" type="primary" :bordered="false" style="margin-left:4px">
                  {{ l.current_post }}
                </n-tag>
              </div>
              <div class="leave-sub">
                <n-tag size="small" type="info" :bordered="false">{{ l.leave_type }}</n-tag>
                {{ l.start_date }} 至 {{ l.end_date }}（共 {{ l.days }} 天）
              </div>
            </div>
          </n-space>
          <n-tag size="small" :type="LEAVE_STATUS_TYPE[l.status]" :bordered="false">
            {{ LEAVE_STATUS_LABEL[l.status] }}
          </n-tag>
        </n-space>

        <div v-if="l.reason" class="leave-reason">事由：{{ l.reason }}</div>
        <div v-if="l.status === 'rejected' && l.reject_reason" class="leave-reason reject">
          驳回原因：{{ l.reject_reason }}
        </div>

        <div class="leave-foot">
          <n-text depth="3" style="font-size:12px">
            提交于 {{ l.created_at.slice(0, 10) }}
            <template v-if="l.approved_at && l.status === 'approved'">
              · {{ l.approved_by ?? '知客' }} 批准于 {{ l.approved_at.slice(0, 10) }}
            </template>
            <template v-else-if="l.cancelled_at"> · 撤销于 {{ l.cancelled_at.slice(0, 10) }}</template>
          </n-text>
          <n-space v-if="l.status === 'pending'">
            <n-button size="small" type="error" secondary :loading="acting === l.id" @click="openReject(l)">
              驳回
            </n-button>
            <n-button size="small" type="primary" :loading="acting === l.id" @click="approve(l)">
              知客批准
            </n-button>
            <n-button size="small" quaternary :loading="acting === l.id" @click="cancel(l)">撤销</n-button>
          </n-space>
          <n-space v-else-if="l.status === 'approved'">
            <n-button size="small" @click="router.push('/attendance')">查看考勤</n-button>
            <n-button size="small" type="warning" secondary :loading="acting === l.id" @click="cancel(l)">
              销假 / 撤销
            </n-button>
          </n-space>
        </div>
      </n-card>
    </n-grid-item>
  </n-grid>

  <n-empty v-if="!loading && leaves.length === 0" description="暂无请假单" style="margin-top:80px" />

  <!-- 提交请假 -->
  <n-modal v-model:show="showCreate" preset="card" title="提交请假申请" style="width: 520px">
    <n-form ref="formRef" :model="form" :rules="rules" label-placement="left" label-width="92px">
      <n-form-item label="请假僧人" path="monk_id">
        <n-select
          v-model:value="form.monk_id"
          :options="monkOptions"
          placeholder="选择在寺僧人"
          filterable
        />
      </n-form-item>
      <n-form-item label="请假类型" path="leave_type">
        <n-select v-model:value="form.leave_type" :options="leaveTypeOptions" />
      </n-form-item>
      <n-grid :cols="2">
        <n-grid-item>
          <n-form-item label="开始日期" path="start_date">
            <n-date-picker
              v-model:formatted-value="form.start_date"
              value-format="yyyy-MM-dd"
              type="date"
              style="width: 100%"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="结束日期" path="end_date">
            <n-date-picker
              v-model:formatted-value="form.end_date"
              value-format="yyyy-MM-dd"
              type="date"
              style="width: 100%"
            />
          </n-form-item>
        </n-grid-item>
      </n-grid>
      <n-form-item label="请假事由">
        <n-input v-model:value="form.reason" type="textarea" :autosize="{ minRows: 2 }" placeholder="选填" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showCreate = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="submitCreate">提交申请</n-button>
      </n-space>
    </template>
  </n-modal>

  <!-- 驳回 -->
  <n-modal v-model:show="showReject" preset="card" title="驳回请假申请" style="width: 420px">
    <n-form label-placement="left" label-width="72px">
      <n-form-item label="僧人">
        <span>{{ rejectTarget?.dharma_name }}（{{ rejectTarget?.leave_type }}）</span>
      </n-form-item>
      <n-form-item label="驳回原因">
        <n-input v-model:value="rejectReason" type="textarea" :autosize="{ minRows: 2 }" placeholder="选填" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="showReject = false">取消</n-button>
        <n-button type="error" :loading="acting === rejectTarget?.id" @click="submitReject">确认驳回</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NCard, NGrid, NGridItem, NSpace, NRadioGroup, NRadioButton, NButton, NTag, NText,
  NIcon, NEmpty, NModal, NForm, NFormItem, NInput, NSelect, NDatePicker,
  useMessage, useDialog,
} from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { AddOutline, WalkOutline } from '@vicons/ionicons5';
import {
  http, MONK_STATUS_LABEL, MONK_STATUS_TYPE, LEAVE_STATUS_LABEL, LEAVE_STATUS_TYPE, LEAVE_TYPES,
} from '../api.js';
import type { LeaveRequest, Monk } from '../types.js';

const router = useRouter();
const message = useMessage();
const dialog = useDialog();

const leaves = ref<LeaveRequest[]>([]);
const statusFilter = ref('pending');
const keyword = ref('');
const loading = ref(false);
const saving = ref(false);
const acting = ref('');

const showCreate = ref(false);
const formRef = ref<FormInst | null>(null);
const form = ref({
  monk_id: null as string | null,
  leave_type: '事假',
  start_date: null as string | null,
  end_date: null as string | null,
  reason: '',
});

const rules: FormRules = {
  monk_id: { required: true, message: '请选择请假僧人', trigger: 'change' },
  leave_type: { required: true, message: '请选择请假类型', trigger: 'change' },
  start_date: { required: true, message: '请选择开始日期', trigger: 'change' },
  end_date: { required: true, message: '请选择结束日期', trigger: 'change' },
};

const monks = ref<Monk[]>([]);
const monkOptions = computed(() =>
  monks.value.map((m) => ({
    label: `${m.dharma_name}（${MONK_STATUS_LABEL[m.status]}${m.current_post ? ' · ' + m.current_post : ''}）`,
    value: m.id,
  })),
);
const leaveTypeOptions = LEAVE_TYPES.map((t) => ({ label: t, value: t }));

const showReject = ref(false);
const rejectTarget = ref<LeaveRequest | null>(null);
const rejectReason = ref('');

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (statusFilter.value) params.status = statusFilter.value;
    if (keyword.value.trim()) params.q = keyword.value.trim();
    const { data } = await http.get<LeaveRequest[]>('/leaves', { params });
    leaves.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadMonks() {
  const { data } = await http.get<Monk[]>('/monks');
  monks.value = data.filter((m) => ['guadan', 'inspection', 'permanent'].includes(m.status));
}

function openCreate() {
  form.value = { monk_id: null, leave_type: '事假', start_date: null, end_date: null, reason: '' };
  showCreate.value = true;
}

async function submitCreate() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    await http.post('/leaves', {
      monk_id: form.value.monk_id,
      leave_type: form.value.leave_type,
      start_date: form.value.start_date,
      end_date: form.value.end_date,
      reason: form.value.reason.trim() || null,
    });
    message.success('请假申请已提交，待知客审批');
    showCreate.value = false;
    statusFilter.value = 'pending';
    load();
  } finally {
    saving.value = false;
  }
}

function approve(l: LeaveRequest) {
  dialog.warning({
    title: '批准请假',
    content: `批准 ${l.dharma_name} ${l.start_date} 至 ${l.end_date} 的${l.leave_type}？期间早晚课考勤将自动记为「请假」。`,
    positiveText: '批准',
    negativeText: '再想想',
    onPositiveClick: async () => {
      acting.value = l.id;
      try {
        await http.post(`/leaves/${l.id}/approve`, { approved_by: '知客' });
        message.success('已批准，考勤已同步');
        load();
      } finally {
        acting.value = '';
      }
    },
  });
}

function openReject(l: LeaveRequest) {
  rejectTarget.value = l;
  rejectReason.value = '';
  showReject.value = true;
}

async function submitReject() {
  if (!rejectTarget.value) return;
  acting.value = rejectTarget.value.id;
  try {
    await http.post(`/leaves/${rejectTarget.value.id}/reject`, {
      reject_reason: rejectReason.value.trim() || null,
    });
    message.success('已驳回');
    showReject.value = false;
    load();
  } finally {
    acting.value = '';
  }
}

function cancel(l: LeaveRequest) {
  const approved = l.status === 'approved';
  dialog.warning({
    title: approved ? '销假 / 撤销' : '撤销请假',
    content: approved
      ? `撤销 ${l.dharma_name} 已批准的${l.leave_type}？由该请假单同步的考勤记录将一并回滚。`
      : `撤销 ${l.dharma_name} 待审批的${l.leave_type}申请？`,
    positiveText: '确认撤销',
    negativeText: '再想想',
    onPositiveClick: async () => {
      acting.value = l.id;
      try {
        await http.post(`/leaves/${l.id}/cancel`);
        message.success(approved ? '已销假，考勤已回滚' : '请假申请已撤销');
        load();
      } finally {
        acting.value = '';
      }
    },
  });
}

onMounted(() => {
  load();
  loadMonks();
});
</script>

<style scoped>
.leave-card {
  border-left: 4px solid #d8cbb8;
}
.leave-card.pending {
  border-left-color: #d48806;
  background: #fdf9f0;
}
.leave-card.approved {
  border-left-color: #4e7c43;
}
.leave-name {
  font-size: 15px;
  font-weight: 600;
}
.leave-sub {
  font-size: 13px;
  color: #6b5d4d;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.leave-reason {
  margin-top: 10px;
  font-size: 13px;
  color: #4a3f33;
  background: #f7f2e9;
  border-radius: 4px;
  padding: 6px 10px;
}
.leave-reason.reject {
  color: #a03a2a;
  background: #fbf0ec;
}
.leave-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e5d9c8;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
