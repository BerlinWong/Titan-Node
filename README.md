# Titan Node: 分布式台架监控系统

这是一套专为嵌入式台架测试设计的分布式监控系统，支持实时日志解析、温度监测、Loop 连续性检查以及 Hang 机自动报警。

## 1. 系统架构

- **Agent (Python)**: 运行在测试机上，负责扫描日志、解析 Kernel/CM55 日志对，并定时上报状态。
- **Backend (FastAPI)**: 接收 Agent 数据，维护全局台架状态，提供 API 供前端查询。
- **Frontend (Next.js + Tailwind)**: 工业级深色看板，可视化显示所有台架的健康度、进度、温度及详细日志。

---

## 2. 快速开始

### 2.1 后端启动 (Backend)

确保已安装 Python 3.9+。

```bash
cd Backend
pip install fastapi uvicorn pydantic requests
python3 main.py
```

默认运行在: `http://localhost:8000`

### 2.2 前端启动 (Frontend)

需要 Node.js 20+。

```bash
cd frontend
npm install
npm run dev
```

访问地址: [http://localhost:3000](http://localhost:3000)

### 2.3 Agent 启动 (Agent)

在每一台需要监控的台架上运行。

```bash
cd Agent
python3 agent.py
```

**启动后需交互操作**：

1. 输入日志根目录 (例如 `./logs`)。
2. 选择要监控的特定 Case 文件夹。
3. 选择任务类型（如 `固定低温反复启动`）。

---

## 3. 核心功能说明

### 3.1 异常检测 (Watchdog)

系统会自动提取 Kernel 日志最后一行的时间戳：

- **Hang 检测**：如果最后一条日志的时间与当前系统时间差距超过 **5 分钟**，系统会判定板子已死机，前端亮起 **"HANG"** 警示。

### 3.2 固定低温反复启动专用逻辑

- **Loop 连续性**：Agent 会实时统计 `BMX7 DDR Reboot Test: Loop[n]`。
- **逻辑校验**：如果 Loop 次数发生非预期的回退（例如从 10 变为 1），系统将立即判定为 `Error`。

### 3.3 看板导航

- **主页 (Dashboard)**：显示所有 Rig 的概览，每个板子的小方块内直接显示当前温度。
- **详情页 (Detail Analysis)**：点击卡片右下角，进入查看详细的 Kernel 日志流片段和具体错误列表。

---

## 4. 目录结构

```text
Titan-Node/
├── Agent/
│   └── agent.py         # 核心采集逻辑
├── Backend/
│   ├── main.py          # API 入口
│   ├── models.py        # 数据模型
│   └── store.py         # 内存状态存储
├── frontend/
│   └── src/app/         # Next.js 页面与组件
└── logs/                # 测试日志存放处 (示例)
```

## 5. 开发建议

- **日志清理**：建议定期归档旧日志，Agent 每次启动都会重新配对最新的文件。
- **扩展任务**：如需增加新的 `Task Type` 解析逻辑，请修改 `Agent/agent.py` 中的 `parse_logs` 方法。
