import axios from 'axios';
import { createDiscreteApi } from 'naive-ui';

const { message } = createDiscreteApi(['message']);

export const http = axios.create({ baseURL: '/api', timeout: 15000 });

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message ?? err.message ?? '请求失败';
    message.error(msg);
    return Promise.reject(err);
  },
);

// ---- 字典常量 ----
export const MONK_STATUS_LABEL: Record<string, string> = {
  guadan: '挂单',
  inspection: '考察期',
  permanent: '常住',
  left: '已离寺',
};

export const MONK_STATUS_TYPE: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  guadan: 'info',
  inspection: 'warning',
  permanent: 'success',
  left: 'default',
};

export const ATTENDANCE_LABEL: Record<string, string> = {
  present: '随众',
  absent: '缺勤',
  leave: '请假',
};

export const ATTENDANCE_TYPE: Record<string, 'success' | 'error' | 'warning'> = {
  present: 'success',
  absent: 'error',
  leave: 'warning',
};

export const POSTS = ['方丈', '首座', '西堂', '后堂', '堂主', '知客', '维那', '典座', '僧值', '寮元', '书记', '衣钵', '汤药', '悦众'];

export const SESSION_LABEL: Record<string, string> = {
  morning: '早课',
  evening: '晚课',
};

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已撤销',
};

export const LEAVE_STATUS_TYPE: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

export const LEAVE_TYPES = ['事假', '病假', '探亲', '参学', '其他'];
