# 寺院僧众挂单与常住管理平台

云游僧人到寺挂单登记、寮房床位安排、考察期管理、羯磨转常住、常住档案、早晚课考勤与缺勤自动提醒。

- **前端**：Vue 3 + TypeScript + Vite + Naive UI
- **后端**：Fastify + TypeScript + node-postgres
- **数据库**：PostgreSQL 16（枚举类型、事务、触发器）

## 功能

| 模块 | 说明 |
| --- | --- |
| 客堂总览 | 在寺人数、床位使用率、今日早晚课随众、即将到期挂单、考察期进度 |
| 挂单登记 | 法名、出家寺庙、戒牒编号、到寺日期、预计住几天；可同时安排床位；续单、舍单 |
| 寮房床位 | 房间号/床位号、入住状态可视化；新建房间自动生成床位；床位冲突事务校验 |
| 考察与常住 | 发心常住转入 **3–6 个月**考察期；考察通过记录**羯磨日期**转常住；不通过退回挂单 |
| 常住档案 | 法名、字辈、剃度师、受戒时间与戒场、担任职务（知客/维那/典座等） |
| 早晚课考勤 | 早课/晚课按日整堂登记（随众/缺勤/请假），支持按僧人区间查询 |
| 缺勤提醒 | **近 30 日缺勤累计满 3 次，数据库触发器自动生成客堂待办**，知客知悉后归档 |

## 目录结构

```
.
├── db/init/            # PostgreSQL 建表(01)与演示数据(02)
├── server/             # Fastify + TS API
│   └── src/routes/     # monks / guadan / rooms / inspections / attendance / alerts / dashboard
├── web/                # Vue3 + TS + Naive UI
│   └── src/pages/      # 七个业务页面
└── docker-compose.yml  # 一键启动 PostgreSQL
```

## 快速开始

### 方式一：Docker（推荐）

```bash
# 1. 启动数据库（首次自动建表并写入演示数据）
docker compose up -d db

# 2. 启动 API
cd server && npm install && npm run dev      # http://localhost:3000

# 3. 启动前端
cd web && npm install && npm run dev         # http://localhost:5173
```

浏览器打开 http://localhost:5173 。Vite 已把 `/api` 代理到 3000 端口。

### 方式二：无 Docker 环境

`.devtools/` 内提供了用户态免安装 PostgreSQL（基于 embedded-postgres），无需 root：

```bash
cd .devtools && npm install
node pg.mjs            # 启动并在首次运行时建库建表+种子数据
```

之后同样启动 `server` 与 `web` 即可。

> 重新演示初始数据：停掉数据库后删除 `.devtools/pgdata`，再 `node pg.mjs`；
> Docker 方式则 `docker compose down -v` 后重新 `up`。

## 账号 / 环境

开发环境无登录鉴权，数据库连接见 `server/.env`：

```
PGHOST=localhost  PGPORT=5432  PGDATABASE=sangha  PGUSER=postgres  PGPASSWORD=postgres
```

## 演示数据

- 5 位常住（方丈、知客、维那、典座、僧值）
- 3 位挂单、2 位考察期僧人
- 云水寮/静修楼共 11 个床位
- 近 7 天早晚课考勤；僧人 **演戒** 近 30 日缺勤 4 次，已自动生成一条客堂缺勤提醒

## 主要接口

| Method | Path | 说明 |
| --- | --- | --- |
| GET/POST | `/api/guadan` | 挂单列表/登记 |
| PUT | `/api/guadan/:id/bed` | 安排调换床位 |
| PUT | `/api/guadan/:id/extend` | 续单 |
| POST | `/api/guadan/:id/checkout` | 舍单离寺（释放床位） |
| GET/POST | `/api/rooms` | 寮房与床位 |
| GET/POST | `/api/inspections` | 考察期列表/转入考察 |
| POST | `/api/inspections/:id/pass` | 羯磨通过转常住 |
| POST | `/api/inspections/:id/fail` | 考察不通过 |
| GET/PUT | `/api/monks[/:id]` | 僧人档案 |
| GET/POST | `/api/attendance` | 某日某课名册/单条登记 |
| POST | `/api/attendance/bulk` | 整堂批量登记 |
| GET | `/api/attendance/summary` | 区间缺勤统计 |
| GET/POST | `/api/alerts` | 缺勤提醒 / 知悉 |
| GET | `/api/dashboard` | 客堂总览 |
