from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class BoardStatus(BaseModel):
    board_id: str
    status: str  # Running, Warning, Error, Finished
    start_time: Optional[str] = None
    elapsed_hours: float = 0.0
    remaining_hours: float = 48.0
    temperature: float = 0.0
    temp_min: float = 0.0
    temp_ddr: float = 0.0
    voltage: float = 0.0
    kernel_heartbeat: Optional[datetime] = None
    cm55_heartbeat: Optional[datetime] = None
    resurrection_gap: Optional[str] = None
    last_kernel_log: Optional[str] = None
    task_type: Optional[str] = None
    current_loop: int = 0
    is_hang: bool = False
    errors: List[str] = []
    kernel_stream: List[str] = []
    last_updated: datetime = Field(default_factory=datetime.now)

class RigReport(BaseModel):
    rig_id: str
    boards: List[BoardStatus]
    last_report_at: Optional[datetime] = Field(default_factory=datetime.now)
    seconds_since_report: float = 0.0
