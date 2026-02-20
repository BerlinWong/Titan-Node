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

    def interactive_setup(self):
        """交互式启动流程"""
        print("=== 分布式台架监控 Agent 启动 ===")
        
        # 0. 输入台架名称
        custom_rig_id = input(f"请输入台架名称 (直接回车默认: {self.rig_id}): ").strip()
        if custom_rig_id:
            self.rig_id = custom_rig_id

        # 1. 输入根目录
        while True:
            self.root_dir = input("请输入日志根目录路径 (例如 ./logs): ").strip()
            if os.path.isdir(self.root_dir):
                break
            print(f"错误: 路径 '{self.root_dir}' 不是一个有效的目录。")

        # 2. 选择 Case 文件夹
        subdirs = [d for d in os.listdir(self.root_dir) if os.path.isdir(os.path.join(self.root_dir, d))]
        if not subdirs:
            print("该目录下没有子文件夹，请检查目录结构。")
            return False
        
        print("\n请选择当前需要分析的测试 Case 路径:")
        for i, d in enumerate(subdirs, 1):
            print(f"  {i}. {d}")
        
        while True:
            try:
                choice = int(input(f"请输入编号 (1-{len(subdirs)}): "))
                if 1 <= choice <= len(subdirs):
                    self.selected_case_dir = os.path.join(self.root_dir, subdirs[choice-1])
                    break
            except ValueError:
                pass
            print("无效输入，请输入正确的数字。")

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
        return True

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
            "last_kernel_log": "",
            "current_loop": 0,
            "is_hang": False,
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
                        status_data["status"] = "Warning"
                        if "Overtemp warning from CM55" not in status_data["errors"]:
                            status_data["errors"].append("Overtemp warning from CM55")

                    # --- 改进：Agent 本地全量解析并抽样 ---
                    # 匹配所有满足条件的温度行
                    regex = re.compile(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*?\[(PVTC_TS_SOC_[^\]]+)\]\s*[:：]?\s*([-+]?\d*\.?\d+)\s*C')
                    all_matches = regex.findall(full_content)
                    
                    raw_points = []
                    sensor_latest = {}
                    for timeStr, sensorName, valStr in all_matches:
                        # 记录所有传感器的最后一次值用于仪表盘
                        val = float(valStr)
                        sensor_latest[sensorName] = val
                        
                        # 仅保留核心传感器的数据点用于绘图
                        if "CPU" in sensorName.upper() or "DDR" in sensorName.upper() or "MIN" in sensorName.upper():
                            try:
                                dt = datetime.strptime(timeStr, "%Y-%m-%d %H:%M:%S")
                                ts = int(dt.timestamp() * 1000)
                                raw_points.append({"ts": ts, "name": sensorName, "val": val})
                            except ValueError:
                                pass
                    
                    # 更新当前实时数值
                    if sensor_latest:
                        temps = sensor_latest.values()
                        status_data["temp_min"] = min(temps)
                        status_data["temperature"] = status_data["temp_min"]
                        # 查找 DDR 温度
                        ddr_val = next((v for k, v in sensor_latest.items() if "TS6_DDR" in k), 
                                  next((v for k, v in sensor_latest.items() if "DDR" in k.upper()), None))
                        if ddr_val is not None:
                            status_data["temp_ddr"] = ddr_val

                    # --- 智能抽样：如果数据点太多（例如超过500点），进行等间隔抽样以保护前端渲染和带宽 ---
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
                        
                        # 计算进度：最后一条日志时间 - 开始时间
                        if start_time_match:
                            elapsed = (last_log_dt - start_dt).total_seconds() / 3600
                            status_data["elapsed_hours"] = round(min(48.0, elapsed), 2)
                            status_data["remaining_hours"] = max(0, round(48.0 - elapsed, 2))
                            if elapsed >= 48:
                                status_data["status"] = "Finished"

                        # --- 长时间不刷新判定 ---
                        if status_data["status"] not in ["Finished", "Error"] and (datetime.now() - last_log_dt).total_seconds() > 300:
                            # 也要考虑 CM55 的情况，如果 CM55 还没挂也不算挂
                            cm_alive = False
                            if status_data.get("cm55_heartbeat"):
                                try:
                                    cm_dt = datetime.strptime(status_data["cm55_heartbeat"], "%Y-%m-%d %H:%M:%S")
                                    if (datetime.now() - cm_dt).total_seconds() <= 300:
                                        cm_alive = True
                                except: pass
                            
                            if not cm_alive:
                                status_data["is_hang"] = True
                                status_data["status"] = "Error"
                                status_data["errors"].append(f"Hang System Error (Last log: {last_ts})")

                    # --- 通用异常检查 ---
                    if "Error: Miscompare" in tail or "[Error] Mismatch" in tail:
                        status_data["status"] = "Error"
                        if "Miscompare / Mismatch Detected" not in status_data["errors"]:
                            status_data["errors"].append("Miscompare / Mismatch Detected")

                    # --- 根据任务类型进行分类检查 ---
                    if self.selected_task_type == "循环启动任务":
                        # 1. 循环启动任务
                        if "Switch to Run Full Training Mode" in tail:
                            status_data["status"] = "Error"
                            if "Unexpected Full Training Mode" not in status_data["errors"]:
                                status_data["errors"].append("Unexpected Full Training Mode")
                                
                        loop_matches = re.findall(r'BMX7 DDR Reboot Test: Loop(\d+)', tail)
                        if loop_matches:
                            current_loop = int(loop_matches[-1])
                            status_data["current_loop"] = current_loop
                            
                            last_loop_info = self.prev_loops.get(board_id)
                            if last_loop_info:
                                old_loop, old_ts = last_loop_info
                                
                                # 不连续判定
                                if current_loop < old_loop:
                                    status_data["status"] = "Error"
                                    if f"Loop continuity error: {old_loop} -> {current_loop}" not in status_data["errors"]:
                                        status_data["errors"].append(f"Loop continuity error: {old_loop} -> {current_loop}")
                                
                                # Loop 卡顿时长判定
                                if current_loop == old_loop and last_ts:
                                    last_log_dt = datetime.strptime(last_ts, "%Y-%m-%d %H:%M:%S")
                                    if (last_log_dt - old_ts).total_seconds() > 300:
                                        status_data["status"] = "Error"
                                        err_msg = f"Loop {current_loop} stuck for > 5 min"
                                        if err_msg not in status_data["errors"]:
                                            status_data["errors"].append(err_msg)
                            
                            if last_ts:
                                self.prev_loops[board_id] = (current_loop, datetime.strptime(last_ts, "%Y-%m-%d %H:%M:%S"))
                    else:
                        # 2. 固定时长任务
                        rem_match = re.findall(r'Seconds remaining: (\d+)', tail)
                        if rem_match:
                            remaining_sec = int(rem_match[-1])
                            # stressapp 往往是以秒计的时长任务
                            if remaining_sec == 0:
                                status_data["status"] = "Finished"
                                status_data["elapsed_hours"] = 48.0
                                status_data["remaining_hours"] = 0.0
                            else:
                                # 重定向进度条以 Seconds remaining 为准
                                # 假设整个测试目标是某种设定，这里为了展示兼容，用递减映射
                                # 假设默认是 48h (172800秒)
                                total_sec = 172800 
                                elapsed_sec = max(0, total_sec - remaining_sec)
                                status_data["elapsed_hours"] = round(elapsed_sec / 3600.0, 2)
                                status_data["remaining_hours"] = round(remaining_sec / 3600.0, 2)

                    # 严重错误检测 (优化版)
                    critical_keywords = ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"]
                    if any(kw in tail.upper() for kw in critical_keywords):
                        status_data["status"] = "Error"
                        status_data["errors"].append(f"Critical error: {status_data['last_kernel_log']}")

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
