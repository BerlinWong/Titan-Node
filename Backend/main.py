from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import RigReport
import store

app = FastAPI(title="Rig Monitoring System API")

# 启用 CORS 以支持前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Rig Monitoring System API is running"}

@app.post("/api/report")
async def report_status(report: RigReport):
    """接收来自 Agent 的数据上报"""
    store.update_rig_data(report)
    return {"status": "success", "rig_id": report.rig_id}

@app.get("/api/status")
async def get_all_status():
    """获取所有台架的实时状态"""
    return store.get_all_rigs()

@app.get("/api/status/{rig_id}")
async def get_rig_status(rig_id: str):
    """获取特定台架的详细状态"""
    data = store.get_rig_by_id(rig_id)
    if not data:
        raise HTTPException(status_code=404, detail="Rig not found")
    return data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
