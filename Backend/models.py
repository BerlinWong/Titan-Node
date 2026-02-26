from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class BoardStatus(BaseModel):
    board_id: str
    status: str  # Running, Warning, Error, Finished
    start_time: Optional[str] = None
    elapsed_hours: float = 0.0
    remaining_hours: float = 48.0
    temperature: float = 0.0
    temp_min: float = 0.0
    temp_max: float = 0.0
    temp_ddr: float = 0.0
    voltage: float = 0.0
    kernel_heartbeat: Optional[datetime] = None
    cm55_heartbeat: Optional[datetime] = None
    resurrection_gap: Optional[str] = None
    last_kernel_log: Optional[str] = None
    task_type: Optional[str] = None
    current_loop: int = 0
    is_hang: bool = False
    temp_warning: bool = False
    remaining_seconds: int = 0
    errors: List[str] = []
    # 移除大量数据字段以减少上传量
    # kernel_stream: List[str] = []
    ddr_details: dict = {}
    # temp_points: List[dict] = []
    last_updated: datetime = Field(default_factory=datetime.now)

class RuleConfig(BaseModel):
    """规则配置模型"""
    task_type: str
    rules: Dict[str, Any]
    version: str = "1.0"
    last_updated: datetime = Field(default_factory=datetime.now)

class RigReport(BaseModel):
    rig_id: str
    boards: List[BoardStatus]
    last_report_at: Optional[datetime] = Field(default_factory=datetime.now)
    seconds_since_report: float = 0.0

class TemperatureData(BaseModel):
    """温度曲线数据模型"""
    rig_id: str
    board_id: str
    temp_points: List[dict] = []  # [{"timestamp": "2026-02-26T12:00:00", "temperature": 45.2}, ...]
    temp_min: float = 0.0
    temp_max: float = 0.0
    current_temp: float = 0.0
    last_updated: datetime = Field(default_factory=datetime.now)
