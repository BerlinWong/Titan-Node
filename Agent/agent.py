import os
import re
import time
import requests
import json
from datetime import datetime
from typing import Dict, List, Optional

# --- 配置管理 ---
def load_config():
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    default_config = {
        "BACKEND_URL": "http://localhost:8000/api/report",
        "SCAN_INTERVAL": 30
    }
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                content = json.load(f)
                return {**default_config, **content}
        except Exception as e:
            print(f"Warning: Failed to load config.json: {e}")
    return default_config

AGENT_CONFIG = load_config()
BACKEND_URL = AGENT_CONFIG["BACKEND_URL"]
SCAN_INTERVAL = AGENT_CONFIG["SCAN_INTERVAL"]

TASK_TYPES = [
    "循环启动任务",
    "固定时长任务"
]

class LogPair:
    def __init__(self, task_desc: str):
        self.task_desc = task_desc
        self.kernel_file: Optional[str] = None
        self.cm55_file: Optional[str] = None

class Agent:
    def __init__(self):
        self.rig_id = os.environ.get("RIG_ID", "Rig-01")
        self.root_dir = ""
        self.selected_case_dir = ""
        self.selected_task_type = ""
        self.log_pairs: Dict[str, LogPair] = {}
        # 状态追踪：记录每个板子的上一次 Loop 编号
        self.prev_loops: Dict[str, int] = {}
        # 规则配置缓存
        self.rules_cache: Dict[str, dict] = {}
        self.last_rules_update: float = 0
        self.rules_update_interval = 300  # 5分钟更新一次规则

    def interactive_setup(self):
        """交互式启动流程"""
        print("=== 分布式台架监控 Agent 启动 ===")
        
        # 0. 输入台架名称
        custom_rig_id = input(f"请输入台架名称 (直接回车默认: {self.rig_id}): ").strip()
        if custom_rig_id:
            self.rig_id = custom_rig_id

        # 1. 直接设置日志路径
        default_path = "D:\\SIP_SAMSUNG_8GB\\TEMP"
        self.selected_case_dir = input(f"请输入日志路径 (直接回车默认: {default_path}): ").strip()
        if not self.selected_case_dir:
            self.selected_case_dir = default_path
        
        if not os.path.isdir(self.selected_case_dir):
            print(f"错误: 路径 '{self.selected_case_dir}' 不是一个有效的目录。")
            return False

        # 3. 选择任务类型
        print("\n请选择当前任务类型:")
        for i, t in enumerate(TASK_TYPES, 1):
            print(f"  {i}. {t}")
        
        while True:
            try:
                choice = int(input(f"请输入编号 (1-{len(TASK_TYPES)}): "))
                if 1 <= choice <= len(TASK_TYPES):
                    self.selected_task_type = TASK_TYPES[choice-1]
                    break
            except ValueError:
                pass
            print("无效输入，请选择正确的任务类型。")

        print(f"\n配置完成! \n当前台架: {self.rig_id}\n监控路径: {self.selected_case_dir}\n任务类型: {self.selected_task_type}\n正在开始分析...")
        # 启动时获取规则
        self.fetch_rules()
        return True

    def fetch_rules(self):
        """从后端获取规则配置"""
        try:
            rules_url = BACKEND_URL.replace('/api/report', f'/api/rules/{self.selected_task_type}')
            response = requests.get(rules_url, timeout=10)
            if response.status_code == 200:
                rules_data = response.json()
                self.rules_cache[self.selected_task_type] = rules_data['rules']
                self.last_rules_update = time.time()
                print(f"✅ 已获取 {self.selected_task_type} 规则配置 v{rules_data.get('version', 'unknown')}")
            else:
                print(f"⚠️ 获取规则失败: HTTP {response.status_code}")
        except Exception as e:
            print(f"⚠️ 获取规则失败: {e}")
            # 如果获取失败，使用默认规则
            self._load_default_rules()

    def _load_default_rules(self):
        """加载默认规则（作为后备）"""
        default_rules = {
            "循环启动任务": {
                "time_calculation": {
                    "method": "reboot_script",
                    "script_pattern": r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*bmx7_ddr_setup_reboot\.sh",
                    "total_hours": 48
                },
                "loop_detection": {
                    "pattern": r"BMX7 DDR Reboot Test: Loop(\d+)"
                },
                "error_patterns": [
                    {"name": "Reboot Error", "pattern": "Switch to Full Training Boot"},
                    {"name": "Reboot Error", "pattern": "Switch to Run Full Training Mode"},
                    {"name": "Reboot Error", "pattern": "2D Training Successfully！"},
                    {"name": "Miscompare Detected", "pattern": "Error: Miscompare"},
                    {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"}
                ],
                "script_error_patterns": [
                    r"Permission denied",
                    r"No such file or directory", 
                    r"Command not found",
                    r"Error executing"
                ],
                "critical_keywords": ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"],
                "hang_detection": {
                    "threshold_seconds": 300,
                    "check_kernel": True,
                    "check_cm55": True
                }
            },
            "固定时长任务": {
                "time_calculation": {
                    "method": "remaining_seconds",
                    "pattern": r"Log: Seconds remaining: (\d+)",
                    "total_hours": 48
                },
                "error_patterns": [
                    {"name": "Miscompare Detected", "pattern": "Error: Miscompare"},
                    {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"}
                ],
                "critical_keywords": ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"],
                "hang_detection": {
                    "threshold_seconds": 300,
                    "check_kernel": True,
                    "check_cm55": True
                }
            }
        }
        
        if self.selected_task_type in default_rules:
            self.rules_cache[self.selected_task_type] = default_rules[self.selected_task_type]
            print(f"✅ 已加载 {self.selected_task_type} 默认规则")

    def get_current_rules(self) -> dict:
        """获取当前任务类型的规则，定期更新"""
        current_time = time.time()
        
        # 检查是否需要更新规则
        if (current_time - self.last_rules_update > self.rules_update_interval or 
            self.selected_task_type not in self.rules_cache):
            self.fetch_rules()
        
        return self.rules_cache.get(self.selected_task_type, {})

    def scan_and_pair_logs(self):
        """扫描选中的目录并进行日志配对"""
        try:
            all_files = os.listdir(self.selected_case_dir)
        except Exception as e:
            print(f"无法读取目录: {e}")
            return {}
            
        pairs: Dict[str, LogPair] = {}

        for f in all_files:
            # 判定路径是否为文件
            if not os.path.isfile(os.path.join(self.selected_case_dir, f)):
                continue

            # 灵活匹配逻辑：
            # CM55 匹配关键词: id + (下划线或横杠) + cm55 (忽略大小写)
            # $ 用于确保匹配文件结尾部分
            cm55_match = re.search(r'_(\d+)[-_]cm55(?:\.log)?$', f, re.IGNORECASE)
            
            # Kernel 匹配关键词: id + .log
            kernel_match = re.search(r'_(\d+)\.log$', f)
            
            board_id = None
            is_cm55 = False
            
            if cm55_match:
                board_id = cm55_match.group(1)
                is_cm55 = True
            elif kernel_match:
                # 注意：kernel 匹配应当排除已经符合 CM55 特征的文件
                if not re.search(r'cm55', f, re.IGNORECASE):
                    board_id = kernel_match.group(1)
                    is_cm55 = False
            
            if board_id:
                # 排除版本号干扰 (如 V2107)，逻辑：数字前不能紧接 V
                if re.search(r'V' + board_id, f): 
                    continue
                
                if board_id not in pairs:
                    pairs[board_id] = LogPair(board_id)
                
                if is_cm55:
                    pairs[board_id].cm55_file = f
                else:
                    pairs[board_id].kernel_file = f
        
        self.log_pairs = pairs
        return pairs

    def parse_logs(self, pair: LogPair):
        """解析日志对并返回板子状态"""
        board_id = pair.task_desc  # 现在 task_desc 就是 board_id
        status_data = {
            "board_id": board_id,
            "status": "Running",
            "task_type": self.selected_task_type,
            "temperature": 0.0,
            "voltage": 0.0,
            "start_time": "Unknown",
            "elapsed_hours": 0.0,
            "remaining_hours": 48.0,
            "remaining_seconds": 0,
            "last_kernel_log": "",
            "current_loop": 0,
            "is_hang": False,
            "temp_warning": False,
            "kernel_heartbeat": None,
            "cm55_heartbeat": None,
            "kernel_stream": [],
            "temp_points": [],
            "errors": []
        }

        # 1. 解析 CM55 日志获取全量温度历史
        if pair.cm55_file:
            path = os.path.join(self.selected_case_dir, pair.cm55_file)
            try:
                # 从头开始读取全量日志以获取完整历史曲线
                with open(path, "r", encoding='utf-8', errors='ignore') as f:
                    full_content = f.read()
                    
                    # 提取最新心跳时间
                    cm_ts_match = re.findall(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]', full_content)
                    if cm_ts_match:
                        status_data["cm55_heartbeat"] = cm_ts_match[-1]

                    # 检查超温警告 (扫描全文)
                    if "W/NO_TAG THM_INFO: warning:check_temp exceed!!!" in full_content:
                        status_data["temp_warning"] = True
                        if "超温警告" not in status_data["errors"]:
                            status_data["errors"].append("超温警告")

                    # --- 改进：Agent 本地全量解析并抽样 ---
                    # 匹配所有满足条件的温度行 (包括 SOC 和 DDR 系列)
                    regex = re.compile(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*?\[(PVTC_TS_(?:SOC|DDR)_[^\]]+)\]\s*[:：]?\s*([-+]?\d*\.?\d+)\s*C')
                    all_matches = regex.findall(full_content)
                    
                    raw_points = []
                    sensor_history = {}  # 存储每个传感器的所有历史温度值
                    sensor_latest = {}   # 仍然保留最后一次值用于仪表盘显示
                    
                    for timeStr, sensorName, valStr in all_matches:
                        val = float(valStr)
                        
                        # 记录最后一次值用于仪表盘
                        sensor_latest[sensorName] = val
                        
                        # 记录历史温度值用于计算最大最小值
                        if sensorName not in sensor_history:
                            sensor_history[sensorName] = []
                        sensor_history[sensorName].append(val)
                        
                        # 仅保留核心传感器的数据点用于绘图
                        # 包含 CPU, DDR, SOC 以及 MIN 结尾的传感器
                        if any(x in sensorName.upper() for x in ["CPU", "DDR", "SOC", "MIN"]):
                            try:
                                dt = datetime.strptime(timeStr, "%Y-%m-%d %H:%M:%S")
                                ts = int(dt.timestamp() * 1000)
                                raw_points.append({"ts": ts, "name": sensorName.replace("PVTC_TS_", ""), "val": val})
                            except ValueError:
                                pass
                    
                    # 计算整个日志历史中的温度最大值和最小值
                    if sensor_history:
                        all_temps = []
                        for temps in sensor_history.values():
                            all_temps.extend(temps)
                        
                        if all_temps:
                            status_data["temp_min"] = min(all_temps)
                            status_data["temp_max"] = max(all_temps)
                            status_data["temperature"] = status_data["temp_min"]  # 使用历史最低温度作为主要显示值
                        
                        # 特别记录 DDR 细节 (TS1-6) - 使用最后一次值
                        status_data["ddr_details"] = {k.replace("PVTC_TS_DDR_", ""): v for k, v in sensor_latest.items() if "DDR" in k.upper()}
                        
                        # 兼容旧字段：查找 TS6_DDR 或主 DDR 温度 - 使用最后一次值
                        ddr_val = next((v for k, v in sensor_latest.items() if "TS6_DDR" in k), 
                                  next((v for k, v in sensor_latest.items() if "DDR" in k.upper()), 0.0))
                        status_data["temp_ddr"] = ddr_val

                    # --- 智能抽样：如果数据点太多（例如超过500点），进行等间隔抽样 ---
                    MAX_POINTS = 500
                    if len(raw_points) > MAX_POINTS:
                        step = len(raw_points) // MAX_POINTS
                        status_data["temp_points"] = raw_points[::step]
                    else:
                        status_data["temp_points"] = raw_points

            except Exception as e:
                print(f"[❌ {board_id}] CM55 全量解析失败: {e}")

        # 2. 解析 Kernel 日志
        if pair.kernel_file:
            path = os.path.join(self.selected_case_dir, pair.kernel_file)
            try:
                with open(path, "r", encoding='utf-8', errors='ignore') as f:
                    # 获取开始时间
                    first_line = f.readline()
                    start_time_match = re.search(r'log (\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})', first_line)
                    if start_time_match:
                        status_data["start_time"] = start_time_match.group(1).replace(".", "-")
                        start_dt = datetime.strptime(status_data["start_time"], "%Y-%m-%d %H:%M:%S")

                    # 读取尾部内容进行深度分析
                    f.seek(0, os.SEEK_END)
                    f.seek(max(0, f.tell() - 30000)) # 增加读取量以确保覆盖100行
                    tail = f.read()
                    lines = tail.splitlines()
                    status_data["last_kernel_log"] = lines[-1] if lines else ""
                    # 抓取最后 100 行作为流数据
                    status_data["kernel_stream"] = lines[-100:] if len(lines) > 100 else lines

                    # --- Hang & Heartbeat 检测 ---
                    ts_matches = re.findall(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]', tail)
                    if ts_matches:
                        last_ts = ts_matches[-1]
                        status_data["kernel_heartbeat"] = last_ts
                        last_log_dt = datetime.strptime(last_ts, "%Y-%m-%d %H:%M:%S")
                        
                        # 固定时长任务进度计算（如果还没匹配到 Seconds remaining，用时间估算作为保底）
                        if start_time_match:
                            elapsed = (last_log_dt - start_dt).total_seconds() / 3600
                            status_data["elapsed_hours"] = round(min(48.0, elapsed), 2)
                            status_data["remaining_hours"] = max(0, round(48.0 - elapsed, 2))
                            if elapsed >= 48:
                                status_data["status"] = "Finished"

                    # --- 使用动态规则进行检查 ---
                    rules = self.get_current_rules()
                    
                    if not rules:
                        print(f"[⚠️ {board_id}] 无可用规则，跳过解析")
                        return status_data
                    
                    # 1. 时间计算规则
                    time_rules = rules.get("time_calculation", {})
                    if time_rules.get("method") == "reboot_script":
                        # 循环启动任务：基于reboot脚本时间
                        script_pattern = time_rules.get("script_pattern", r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*bmx7_ddr_setup_reboot\.sh")
                        reboot_script_matches = re.findall(script_pattern, tail)
                        if reboot_script_matches:
                            script_time_str = reboot_script_matches[-1]
                            try:
                                script_dt = datetime.strptime(script_time_str, "%Y-%m-%d %H:%M:%S")
                                now = datetime.now()
                                elapsed = (now - script_dt).total_seconds() / 3600
                                total_hours = time_rules.get("total_hours", 48)
                                
                                status_data["elapsed_hours"] = round(min(total_hours, elapsed), 2)
                                status_data["remaining_hours"] = max(0, round(total_hours - elapsed, 2))
                                
                                if elapsed >= total_hours:
                                    status_data["status"] = "Finished"
                            except ValueError:
                                pass
                        else:
                            status_data["remaining_hours"] = time_rules.get("total_hours", 48)
                            status_data["elapsed_hours"] = 0.0
                            
                    elif time_rules.get("method") == "remaining_seconds":
                        # 固定时长任务：基于remaining seconds
                        pattern = time_rules.get("pattern", r"Log: Seconds remaining: (\d+)")
                        rem_match = re.findall(pattern, tail)
                        if rem_match:
                            remaining_sec = int(rem_match[-1])
                            status_data["remaining_seconds"] = remaining_sec
                            total_hours = time_rules.get("total_hours", 48)
                            if remaining_sec == 0:
                                status_data["status"] = "Finished"
                                status_data["elapsed_hours"] = total_hours
                                status_data["remaining_hours"] = 0.0
                            else:
                                status_data["remaining_hours"] = round(remaining_sec / 3600.0, 2)
                                status_data["elapsed_hours"] = round(total_hours - status_data["remaining_hours"], 2)

                    # 2. 循环检测规则（仅循环任务）
                    if self.selected_task_type == "循环启动任务":
                        loop_rules = rules.get("loop_detection", {})
                        if loop_rules:
                            loop_pattern = loop_rules.get("pattern", r"BMX7 DDR Reboot Test: Loop(\d+)")
                            loop_matches = re.findall(loop_pattern, tail)
                            if loop_matches:
                                current_loop = int(loop_matches[-1])
                                status_data["current_loop"] = current_loop

                    # 3. 错误模式检测
                    error_patterns = rules.get("error_patterns", [])
                    for error_rule in error_patterns:
                        pattern = error_rule.get("pattern", "")
                        name = error_rule.get("name", "Unknown Error")
                        if pattern in tail:
                            status_data["status"] = "Error"
                            if name not in status_data["errors"]:
                                status_data["errors"].append(name)

                    # 4. 脚本错误检测（仅循环任务）
                    if self.selected_task_type == "循环启动任务":
                        script_error_patterns = rules.get("script_error_patterns", [])
                        for pattern in script_error_patterns:
                            if re.search(pattern, tail, re.IGNORECASE):
                                status_data["status"] = "Error"
                                if "Reboot Script Error" not in status_data["errors"]:
                                    status_data["errors"].append("Reboot Script Error")

                    # 5. 严重错误检测
                    critical_keywords = rules.get("critical_keywords", ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"])
                    if any(kw in tail.upper() for kw in critical_keywords):
                        status_data["status"] = "Error"
                        status_data["errors"].append(f"Critical error: {status_data['last_kernel_log']}")

                    # 6. 挂起检测
                    hang_rules = rules.get("hang_detection", {})
                    threshold = hang_rules.get("threshold_seconds", 300)
                    check_kernel = hang_rules.get("check_kernel", True)
                    check_cm55 = hang_rules.get("check_cm55", True)
                    
                    now = datetime.now()
                    if check_kernel and status_data.get("kernel_heartbeat"):
                        k_dt = datetime.strptime(status_data["kernel_heartbeat"], "%Y-%m-%d %H:%M:%S")
                        if (now - k_dt).total_seconds() > threshold and status_data["status"] not in ["Finished", "Error"]:
                            status_data["is_hang"] = True
                            status_data["status"] = "Error"
                            if "Kernel Hang Detected (>5min)" not in status_data["errors"]:
                                status_data["errors"].append("Kernel Hang Detected (>5min)")

                    if check_cm55 and status_data.get("cm55_heartbeat"):
                        c_dt = datetime.strptime(status_data["cm55_heartbeat"], "%Y-%m-%d %H:%M:%S")
                        if (now - c_dt).total_seconds() > threshold and status_data["status"] not in ["Finished", "Error"]:
                            status_data["status"] = "Error"
                            if "CM55 Hang Detected (>5min)" not in status_data["errors"]:
                                status_data["errors"].append("CM55 Hang Detected (>5min)")

            except Exception as e:
                print(f"解析 Kernel 失败: {e}")

        return status_data

    def run(self):
        if not self.interactive_setup():
            return

        while True:
            pairs = self.scan_and_pair_logs()
            # 调试：打印配对结果
            for bid, p in pairs.items():
                print(f"[{bid}] kernel={p.kernel_file is not None} cm55={p.cm55_file is not None} | cm55_file={p.cm55_file}")
            board_statuses = []
            for key, pair in pairs.items():
                if pair.kernel_file or pair.cm55_file:
                    status = self.parse_logs(pair)
                    board_statuses.append(status)
            
            report = {
                "rig_id": self.rig_id,
                "boards": board_statuses
            }
            
            try:
                requests.post(BACKEND_URL, json=report)
                print(f"[{datetime.now()}] 上报数据: {len(board_statuses)} 个板子已在线 (任务: {self.selected_task_type})。")
            except Exception as e:
                print(f"上报失败: {e}")
            
            time.sleep(SCAN_INTERVAL)

if __name__ == "__main__":
    agent = Agent()
    agent.run()
