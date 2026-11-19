from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from app.database import get_session
from app.auth import get_current_user
from app.models import SensorRecord, PzemRecord
from app.mqtt_service import latest_sensor_data, latest_pzem_data, latest_gateway_status

router = APIRouter(prefix="/sensors", tags=["4. Cảm biến Môi trường & Hiện diện (Sensors & ESP-NOW)"])

VN_TZ = timezone(timedelta(hours=7))

@router.get(
    "/pzem/latest",
    summary="Lấy dữ liệu đo điện PZEM-004T mới nhất tức thời",
    description="Truy xuất bản tin đo điện PZEM-004T từ STM32F103 (Điện áp, Dòng điện, Công suất, Năng lượng, Tần số, Hệ số PF)."
)
def get_latest_pzem_data(current_user: dict = Depends(get_current_user)):
    last_seen_str = latest_pzem_data.get("last_seen")
    seconds_ago = 999999
    is_online = False
    gw_online = latest_gateway_status.get("online", False)
    if last_seen_str and gw_online:
        try:
            s_dt = datetime.fromisoformat(last_seen_str)
            if s_dt.tzinfo is None:
                s_dt = s_dt.replace(tzinfo=timezone.utc)
            seconds_ago = (datetime.now(timezone.utc) - s_dt).total_seconds()
            is_online = (seconds_ago <= 15)
        except Exception:
            pass

    data_copy = dict(latest_pzem_data)
    data_copy["seconds_ago"] = max(0, int(seconds_ago))
    data_copy["is_online"] = is_online
    return {
        "success": True,
        "data": data_copy
    }

@router.get(
    "/latest",
    summary="Lấy dữ liệu cảm biến mới nhất tức thời",
    description="Truy xuất bản tin cảm biến mới nhất từ Node ESP32-C3 qua sóng không dây ESP-NOW (Nhiệt độ, Độ ẩm/Hiện diện, Pin, RSSI)."
)
def get_latest_sensor_data(current_user: dict = Depends(get_current_user)):
    last_seen_str = latest_sensor_data.get("last_seen")
    seconds_ago = 999999
    is_online = False
    has_real_data = bool(
        latest_sensor_data.get("val1", 0) > 0 or 
        latest_sensor_data.get("val2", 0) > 0 or 
        latest_sensor_data.get("battery", 0) > 0 or 
        latest_sensor_data.get("presence") is not None
    )
    if last_seen_str and has_real_data:
        try:
            s_dt = datetime.fromisoformat(last_seen_str)
            if s_dt.tzinfo is None:
                s_dt = s_dt.replace(tzinfo=timezone.utc)
            seconds_ago = (datetime.now(timezone.utc) - s_dt).total_seconds()
            is_online = (seconds_ago <= 60)
        except Exception:
            pass

    data_copy = dict(latest_sensor_data)
    data_copy["seconds_ago"] = max(0, int(seconds_ago))
    data_copy["is_online"] = is_online
    return {
        "success": True,
        "data": data_copy
    }

@router.get(
    "/history",
    response_model=List[SensorRecord],
    summary="Lấy lịch sử dữ liệu cảm biến từ Database",
    description="Truy vấn dữ liệu lịch sử đo đạc cảm biến để vẽ đồ thị theo thời gian hoặc trích xuất báo cáo."
)
def get_sensor_history(
    node_id: Optional[int] = Query(default=None, description="Lọc theo ID Node (ví dụ: 1)"),
    limit: int = Query(default=100, le=500, description="Số lượng bản ghi tối đa"),
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    query = select(SensorRecord)
    if node_id is not None:
        query = query.where(SensorRecord.node_id == node_id)
    
    query = query.order_by(desc(SensorRecord.created_at)).limit(limit)
    records = session.exec(query).all()
    return records


@router.get(
    "/pzem/history",
    response_model=List[PzemRecord],
    summary="Lấy lịch sử đo điện PZEM-004T từ Database",
    description="Truy vấn danh sách các bản ghi đo điện PZEM gần nhất để vẽ đồ thị hoặc xuất báo cáo."
)
def get_pzem_history(
    limit: int = Query(default=100, le=500, description="Số lượng bản ghi tối đa"),
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    query = select(PzemRecord).order_by(desc(PzemRecord.created_at)).limit(limit)
    return session.exec(query).all()


@router.get(
    "/pzem/stats",
    summary="Thống kê điện năng tiêu thụ & công suất PZEM-004T theo ngày/tuần/tháng",
    description="Tổng hợp điện năng (kWh), công suất trung bình/cực đại (W), điện áp (V) theo giờ (hôm nay), 7 ngày hoặc 30 ngày."
)
def get_pzem_stats(
    period: str = Query(default="day", description="Khoảng thời gian: day (hôm nay), week (7 ngày), month (30 ngày)"),
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    now_utc = datetime.now(timezone.utc)
    now_vn = now_utc.astimezone(VN_TZ)

    if period == "week":
        start_vn = (now_vn - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        num_buckets = 7
    elif period == "month":
        start_vn = (now_vn - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        num_buckets = 30
    else:
        period = "day"
        start_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        num_buckets = 24

    start_utc = start_vn.astimezone(timezone.utc)
    # SQLite/Postgres naive vs aware safety: query from start_utc - 1 min
    query = (
        select(PzemRecord)
        .where(PzemRecord.created_at >= start_utc.replace(tzinfo=None))
        .order_by(PzemRecord.created_at)
    )
    records = session.exec(query).all()

    # Chuẩn bị các bucket theo thời gian VN
    buckets = {}
    labels = []
    bucket_keys = []
    if period == "day":
        for h in range(24):
            key = f"{h:02d}"
            bucket_keys.append(key)
            labels.append(f"{h:02d}h")
            buckets[key] = []
    else:
        for i in range(num_buckets):
            d = start_vn + timedelta(days=i)
            key = d.strftime("%Y-%m-%d")
            bucket_keys.append(key)
            labels.append(d.strftime("%d/%m"))
            buckets[key] = []

    for rec in records:
        dt = rec.created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_vn = dt.astimezone(VN_TZ)
        key = dt_vn.strftime("%H") if period == "day" else dt_vn.strftime("%Y-%m-%d")
        if key in buckets:
            buckets[key].append(rec)

    kwh_series = []
    power_avg_series = []
    power_max_series = []

    prev_max_energy = None
    all_powers = []
    all_voltages = []

    for key in bucket_keys:
        recs = buckets[key]
        if not recs:
            kwh_series.append(0.0)
            power_avg_series.append(0.0)
            power_max_series.append(0.0)
            continue

        powers = [r.power for r in recs]
        volts = [r.voltage for r in recs if r.voltage > 0]
        energies = [r.energy for r in recs]

        all_powers.extend(powers)
        all_voltages.extend(volts)

        avg_p = round(sum(powers) / len(powers), 1)
        max_p = round(max(powers), 1)

        min_e = min(energies)
        max_e = max(energies)

        if prev_max_energy is not None and max_e >= prev_max_energy and min_e >= prev_max_energy:
            delta_e = max_e - prev_max_energy
        else:
            delta_e = max(0.0, max_e - min_e)
        prev_max_energy = max_e

        kwh_series.append(round(delta_e, 4))
        power_avg_series.append(avg_p)
        power_max_series.append(max_p)

    total_kwh = round(sum(kwh_series), 3)
    avg_power = round(sum(all_powers) / len(all_powers), 1) if all_powers else 0.0
    max_power = round(max(all_powers), 1) if all_powers else 0.0
    avg_voltage = round(sum(all_voltages) / len(all_voltages), 1) if all_voltages else 0.0
    min_voltage = round(min(all_voltages), 1) if all_voltages else 0.0
    max_voltage = round(max(all_voltages), 1) if all_voltages else 0.0

    # Lấy 8 bản ghi gần nhất để hiển thị bảng lịch sử rút gọn
    recent_q = select(PzemRecord).order_by(desc(PzemRecord.created_at)).limit(8)
    recent_recs = session.exec(recent_q).all()
    recent_logs = []
    for r in recent_recs:
        dt = r.created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_vn = dt.astimezone(VN_TZ)
        recent_logs.append({
            "time": dt_vn.strftime("%H:%M:%S %d/%m"),
            "voltage": round(r.voltage, 1),
            "current": round(r.current, 2),
            "power": round(r.power, 1),
            "energy": round(r.energy, 3)
        })

    return {
        "success": True,
        "data": {
            "period": period,
            "labels": labels,
            "kwh_series": kwh_series,
            "power_avg_series": power_avg_series,
            "power_max_series": power_max_series,
            "summary": {
                "total_kwh": total_kwh,
                "current_meter_kwh": round(float(latest_pzem_data.get("energy", 0.0)), 3),
                "avg_power": avg_power,
                "max_power": max_power,
                "avg_voltage": avg_voltage,
                "min_voltage": min_voltage,
                "max_voltage": max_voltage,
                "sample_count": len(records)
            },
            "recent_logs": recent_logs
        }
    }
